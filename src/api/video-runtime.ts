import { MODEL_API_BASE_URL } from './http'
import i18n, { getActiveLanguage } from '@/i18n'

const VIDEO_TASK_PATH = '/videos'
const VIDEO_REQUEST_TIMEOUT_MS = 30_000
const MAX_ERROR_BODY_LENGTH = 4_096
const MAX_PROMPT_LENGTH = 8_000

export type VideoTaskStatus = 'pending' | 'processing' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled' | 'expired' | 'unknown'

export interface VideoGenerationInput {
  apiKey: string
  model: string
  prompt: string
  duration: number
  size: string
  inputReference?: string
  idempotencyKey: string
  signal?: AbortSignal
}

export interface VideoTask {
  taskId: string
  status: VideoTaskStatus
  progress: number | null
  resultUrl: string | null
  thumbnailUrl: string | null
  errorMessage: string | null
  requestId: string
  raw: Record<string, unknown>
}

export class VideoRuntimeError extends Error {
  readonly status: number
  readonly code: string | null
  readonly requestId: string | null

  constructor(message: string, status: number, code: string | null, requestId: string | null) {
    super(message)
    this.name = 'VideoRuntimeError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

interface RecordValue {
  [key: string]: unknown
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `video-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createRequestController(signal: AbortSignal | undefined): { controller: AbortController; clear: () => void } {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), VIDEO_REQUEST_TIMEOUT_MS)
  const abort = (): void => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  return {
    controller,
    clear: () => {
      window.clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    },
  }
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readFirstText(record: RecordValue, keys: string[]): string {
  for (const key of keys) {
    const value = readText(record[key])
    if (value) return value
  }
  return ''
}

function candidateRecords(payload: RecordValue): RecordValue[] {
  const values: RecordValue[] = [payload]
  for (const key of ['data', 'task', 'video', 'output', 'result']) {
    if (isRecord(payload[key])) values.push(payload[key])
  }
  return values
}

function readTaskId(payload: RecordValue, fallback: string): string {
  for (const record of candidateRecords(payload)) {
    const taskId = readFirstText(record, ['task_id', 'id', 'video_id'])
    if (taskId) return taskId
  }
  return fallback.trim()
}

function readResultUrl(payload: RecordValue): string | null {
  const urlKeys = ['result_url', 'video_url', 'url', 'download_url', 'file_url']
  for (const record of candidateRecords(payload)) {
    const directUrl = readFirstText(record, urlKeys)
    if (directUrl) return directUrl
    const metadata = isRecord(record.metadata) ? record.metadata : undefined
    if (metadata) {
      const metadataUrl = readFirstText(metadata, urlKeys)
      if (metadataUrl) return metadataUrl
    }
  }
  return null
}

function readThumbnailUrl(payload: RecordValue): string | null {
  const thumbnailKeys = ['thumbnail_url', 'cover_url', 'poster_url', 'preview_url']
  for (const record of candidateRecords(payload)) {
    const thumbnail = readFirstText(record, thumbnailKeys)
    if (thumbnail) return thumbnail
    const metadata = isRecord(record.metadata) ? record.metadata : undefined
    if (metadata) {
      const metadataThumbnail = readFirstText(metadata, thumbnailKeys)
      if (metadataThumbnail) return metadataThumbnail
    }
  }
  return null
}

function readProgress(payload: RecordValue): number | null {
  for (const record of candidateRecords(payload)) {
    const value = record.progress
    const numericValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/%$/, '')) : Number.NaN
    if (Number.isFinite(numericValue)) return Math.min(100, Math.max(0, Math.round(numericValue)))
  }
  return null
}

function normalizeStatus(value: unknown): VideoTaskStatus {
  const status = readText(value).toLowerCase()
  if (['queued', 'pending', 'submitted', 'created', 'waiting'].includes(status)) return 'pending'
  if (['processing', 'in_progress', 'running', 'generating'].includes(status)) return 'processing'
  if (['succeeded', 'success', 'completed', 'done'].includes(status)) return 'succeeded'
  if (['failed', 'failure', 'error'].includes(status)) return 'failed'
  if (['cancelled', 'canceled'].includes(status)) return 'cancelled'
  if (status === 'cancel_requested') return 'cancelling'
  if (status === 'expired') return 'expired'
  return 'unknown'
}

function readStatus(payload: RecordValue, fallback: VideoTaskStatus = 'pending'): VideoTaskStatus {
  for (const record of candidateRecords(payload)) {
    if (readText(record.status)) return normalizeStatus(record.status)
  }
  return fallback
}

function readErrorMessage(payload: RecordValue): string | null {
  const errorValue = isRecord(payload.error) ? payload.error : undefined
  const errorMessage = errorValue ? readFirstText(errorValue, ['message', 'detail', 'reason']) : ''
  const message = readFirstText(payload, ['message', 'detail', 'reason', 'error_message'])
  return errorMessage || message || null
}

function parsePayload(body: string): RecordValue {
  if (!body.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(body)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function errorPayloadMessage(payload: RecordValue): { message: string; code: string | null } {
  const error = isRecord(payload.error) ? payload.error : payload
  const message = readFirstText(error, ['message', 'detail', 'reason']) || i18n.t('api.videoRuntime.requestFailed')
  const codeValue = error.code
  const code = typeof codeValue === 'string' ? codeValue : typeof codeValue === 'number' ? String(codeValue) : null
  return { message, code }
}

async function requestVideoTask(path: string, options: RequestInit, requestId: string, fallbackTaskId = ''): Promise<VideoTask> {
  const response = await fetch(`${MODEL_API_BASE_URL}${path}`, options)
  const responseRequestId = response.headers.get('X-Request-ID') ?? requestId
  const body = (await response.text()).slice(0, MAX_ERROR_BODY_LENGTH)
  const payload = parsePayload(body)
  if (!response.ok) {
    const error = errorPayloadMessage(payload)
    throw new VideoRuntimeError(error.message, response.status, error.code, responseRequestId)
  }
  const taskId = readTaskId(payload, response.headers.get('X-ThinkGo-Task-ID') ?? fallbackTaskId)
  if (!taskId) throw new VideoRuntimeError(i18n.t('api.videoRuntime.invalidResponse'), 502, 'task_id_missing', responseRequestId)
  return {
    taskId,
    status: readStatus(payload),
    progress: readProgress(payload),
    resultUrl: readResultUrl(payload),
    thumbnailUrl: readThumbnailUrl(payload),
    errorMessage: readErrorMessage(payload),
    requestId: responseRequestId,
    raw: payload,
  }
}

export function videoTaskIsTerminal(status: VideoTaskStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled' || status === 'expired'
}

export async function submitVideoGeneration(input: VideoGenerationInput): Promise<VideoTask> {
  const apiKey = input.apiKey.trim()
  const model = input.model.trim()
  const prompt = input.prompt.trim()
  const idempotencyKey = input.idempotencyKey.trim()
  if (!apiKey) throw new VideoRuntimeError(i18n.t('api.videoRuntime.apiKeyRequired'), 401, 'api_key_required', null)
  if (!model || !prompt || prompt.length > MAX_PROMPT_LENGTH || !Number.isInteger(input.duration) || input.duration <= 0 || !input.size.trim() || !idempotencyKey) {
    throw new VideoRuntimeError(i18n.t('api.videoRuntime.invalidRequest'), 400, 'invalid_request', null)
  }
  const requestId = createRequestId()
  const requestController = createRequestController(input.signal)
  const payload: Record<string, unknown> = { model, prompt, duration: input.duration, seconds: String(input.duration), size: input.size.trim() }
  if (input.inputReference?.trim()) payload.input_reference = input.inputReference.trim()
  try {
    return await requestVideoTask(VIDEO_TASK_PATH, {
      method: 'POST',
      credentials: 'omit',
      signal: requestController.controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        'X-Request-ID': requestId,
        'X-App-Lang': getActiveLanguage(),
      },
      body: JSON.stringify(payload),
    }, requestId)
  } catch (error) {
    if (error instanceof VideoRuntimeError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') throw new VideoRuntimeError(i18n.t('api.videoRuntime.timeout'), 408, 'request_timeout', requestId)
    throw new VideoRuntimeError(i18n.t('api.videoRuntime.networkFailure'), 0, 'network_error', requestId)
  } finally {
    requestController.clear()
  }
}

export async function getVideoTask(apiKey: string, taskId: string, signal?: AbortSignal): Promise<VideoTask> {
  const normalizedKey = apiKey.trim()
  const normalizedTaskId = taskId.trim()
  if (!normalizedKey) throw new VideoRuntimeError(i18n.t('api.videoRuntime.apiKeyRequired'), 401, 'api_key_required', null)
  if (!normalizedTaskId) throw new VideoRuntimeError(i18n.t('api.videoRuntime.taskIdRequired'), 400, 'task_id_required', null)
  const requestId = createRequestId()
  const requestController = createRequestController(signal)
  try {
    return await requestVideoTask(`${VIDEO_TASK_PATH}/${encodeURIComponent(normalizedTaskId)}`, {
      method: 'GET',
      credentials: 'omit',
      signal: requestController.controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${normalizedKey}`,
        'X-Request-ID': requestId,
        'X-App-Lang': getActiveLanguage(),
      },
    }, requestId, normalizedTaskId)
  } catch (error) {
    if (error instanceof VideoRuntimeError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') throw new VideoRuntimeError(i18n.t('api.videoRuntime.timeout'), 408, 'request_timeout', requestId)
    throw new VideoRuntimeError(i18n.t('api.videoRuntime.networkFailure'), 0, 'network_error', requestId)
  } finally {
    requestController.clear()
  }
}

export async function cancelVideoTask(apiKey: string, taskId: string, signal?: AbortSignal): Promise<VideoTask> {
  const normalizedKey = apiKey.trim()
  const normalizedTaskId = taskId.trim()
  if (!normalizedKey) throw new VideoRuntimeError(i18n.t('api.videoRuntime.apiKeyRequired'), 401, 'api_key_required', null)
  if (!normalizedTaskId) throw new VideoRuntimeError(i18n.t('api.videoRuntime.taskIdRequired'), 400, 'task_id_required', null)
  const requestId = createRequestId()
  const requestController = createRequestController(signal)
  try {
    return await requestVideoTask(`${VIDEO_TASK_PATH}/${encodeURIComponent(normalizedTaskId)}`, {
      method: 'DELETE',
      credentials: 'omit',
      signal: requestController.controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${normalizedKey}`,
        'X-Request-ID': requestId,
        'X-App-Lang': getActiveLanguage(),
      },
    }, requestId, normalizedTaskId)
  } catch (error) {
    if (error instanceof VideoRuntimeError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') throw new VideoRuntimeError(i18n.t('api.videoRuntime.timeout'), 408, 'request_timeout', requestId)
    throw new VideoRuntimeError(i18n.t('api.videoRuntime.networkFailure'), 0, 'network_error', requestId)
  } finally {
    requestController.clear()
  }
}
