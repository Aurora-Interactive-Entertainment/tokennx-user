import { MODEL_API_BASE_URL, isApiError } from './http'
import { withAuthenticatedSession } from './authenticated'
import i18n, { getActiveLanguage } from '@/i18n'
import type { UserVideoOptions } from './user-models'
import { normalizeVideoOptions, validateVideoParameters } from '@/utils/video-options'

const VIDEO_TASK_PATH = '/videos'
const VIDEO_REQUEST_TIMEOUT_MS = 30_000
const MAX_ERROR_BODY_LENGTH = 4_096
const MAX_PROMPT_LENGTH = 8_000

export type VideoTaskStatus = 'pending' | 'processing' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled' | 'expired' | 'unknown'

export interface VideoReference {
  type: 'image' | 'video' | 'audio'
  url: string
  role?: 'reference_image' | 'first_frame' | 'last_frame' | 'reference_video' | 'reference_audio'
}

export interface VideoGenerationInput {
  /** 登录态访问令牌；视频 Runtime 不再接受 API Key。 */
  accessToken: string
  model: string
  prompt: string
  duration: number
  size?: string
  resolution?: string
  ratio?: string
  videoOptions?: UserVideoOptions | null
  references?: VideoReference[]
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
  const abort = (): void => controller.abort(signal?.reason)
  if (signal?.aborted) controller.abort(signal.reason)
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

function readMeaningfulMessage(value: unknown): string {
  const message = readText(value)
  return ['success', 'ok'].includes(message.toLowerCase()) ? '' : message
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
    // Seedance 原生任务结果把成片地址放在 content 中。
    const content = isRecord(record.content) ? record.content : undefined
    if (content) {
      const contentUrl = readFirstText(content, urlKeys)
      if (contentUrl) return contentUrl
    }
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
    const content = isRecord(record.content) ? record.content : undefined
    if (content) {
      const contentThumbnail = readFirstText(content, [...thumbnailKeys, 'last_frame_url'])
      if (contentThumbnail) return contentThumbnail
    }
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
  // 取消接口按契约直接返回 status: "cancelling"，漏掉这个字面值会被兜底成 unknown，
  // 表现成「取消成功却显示失败卡且不再轮询」。
  if (['cancelling', 'canceling', 'cancel_requested', 'cancel_pending'].includes(status)) return 'cancelling'
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
  const nestedMessage = candidateRecords(payload).slice(1)
    .map((record) => readMeaningfulMessage(record.msg) || readFirstText(record, ['message', 'detail', 'reason', 'error_message']))
    .find(Boolean) ?? ''
  const message = readMeaningfulMessage(payload.msg)
    || (errorValue ? readFirstText(errorValue, ['msg']) : '')
    || (errorValue ? readFirstText(errorValue, ['message', 'detail', 'reason']) : '')
    || readFirstText(payload, ['message', 'detail', 'reason', 'error_message'])
    || nestedMessage
  return message || null
}

function parsePayload(body: string): RecordValue | null {
  // 兼容只通过响应头提供任务 ID 的异步提交；非空但损坏的 JSON 仍明确报错。
  if (!body.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(body)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function errorPayloadMessage(payload: RecordValue): { message: string; code: string | null } {
  const error = isRecord(payload.error) ? payload.error : payload
  const message = readFirstText(payload, ['msg'])
    || readFirstText(error, ['msg', 'message', 'detail', 'reason', 'error_message'])
    || readFirstText(payload, ['message', 'detail', 'reason', 'error_message'])
    || i18n.t('api.videoRuntime.requestFailed')
  const codeValue = error.code
  const code = typeof codeValue === 'string' ? codeValue : typeof codeValue === 'number' ? String(codeValue) : null
  return { message: message.slice(0, MAX_ERROR_BODY_LENGTH), code }
}

function hasBusinessError(payload: RecordValue): boolean {
  if (typeof payload.code === 'number') return payload.code !== 0
  return typeof payload.code === 'string' && payload.code.trim() !== '' && payload.code.trim() !== '0'
}

async function requestVideoTask(path: string, options: RequestInit, requestId: string, fallbackTaskId = ''): Promise<VideoTask> {
  const originalHeaders = new Headers(options.headers)
  const accessToken = originalHeaders.get('Authorization')?.replace(/^Bearer\s+/i, '')
  const response = await withAuthenticatedSession({ accessToken, signal: options.signal }, async (currentAccessToken) => {
    const headers = new Headers(originalHeaders)
    headers.set('Authorization', `Bearer ${currentAccessToken}`)
    // 保留请求号和提交幂等键，只重试尚未成功创建/查询/取消任务的 HTTP 401。
    const attemptedResponse = await fetch(`${MODEL_API_BASE_URL}${path}`, { ...options, headers })
    if (!attemptedResponse.ok) {
      const payload = parsePayload(await attemptedResponse.text())
      const error = errorPayloadMessage(payload ?? {})
      throw new VideoRuntimeError(error.message, attemptedResponse.status, error.code, attemptedResponse.headers.get('X-Request-ID') ?? requestId)
    }
    return attemptedResponse
  })
  const responseRequestId = response.headers.get('X-Request-ID') ?? requestId
  // 成功响应可能包含长提示词或 metadata，必须完整解析，仅裁剪展示用的错误文案。
  const body = await response.text()
  const payload = parsePayload(body)
  if (!response.ok || (payload && hasBusinessError(payload))) {
    const error = errorPayloadMessage(payload ?? {})
    throw new VideoRuntimeError(error.message, response.status, error.code, responseRequestId)
  }
  if (!payload) throw new VideoRuntimeError(i18n.t('api.videoRuntime.invalidResponse'), 502, 'invalid_response', responseRequestId)
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

function invalidVideoRequest(): VideoRuntimeError {
  return new VideoRuntimeError(i18n.t('api.videoRuntime.invalidRequest'), 400, 'invalid_request', null)
}

function isValidReferenceUrl(url: string, type: VideoReference['type']): boolean {
  // 本地图片沿用 Data URL；音视频须提供服务端可访问的地址，不能提交浏览器 blob 地址。
  if (type === 'image' && /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z\d+/]+={0,2}$/i.test(url)) return true
  try {
    const parsed = new URL(url)
    return ['https:', 'http:'].includes(parsed.protocol) && Boolean(parsed.hostname) && !parsed.username && !parsed.password
  } catch {
    return false
  }
}

function normalizeReferences(input: VideoGenerationInput): Required<VideoReference>[] {
  const references: Required<VideoReference>[] = []
  const allowedRoles: Record<VideoReference['type'], VideoReference['role'][]> = {
    image: ['reference_image', 'first_frame', 'last_frame'],
    video: ['reference_video'],
    audio: ['reference_audio'],
  }
  for (const reference of input.references ?? []) {
    const type = reference.type
    const url = reference.url.trim()
    const role = reference.role ?? `reference_${type}`
    if (!Object.hasOwn(allowedRoles, type) || !allowedRoles[type].includes(role) || !isValidReferenceUrl(url, type)) throw invalidVideoRequest()
    if (!references.some((item) => item.type === type && item.url === url && item.role === role)) references.push({ type, url, role })
  }
  const inputReference = input.inputReference?.trim()
  // 调用方迁移期间可能同时携带旧字段；同一张图不能重复进入 content 或超额计数。
  if (inputReference && !references.some((item) => item.type === 'image' && item.url === inputReference)) {
    if (!isValidReferenceUrl(inputReference, 'image')) throw invalidVideoRequest()
    references.push({ type: 'image', url: inputReference, role: 'reference_image' })
  }
  const firstFrameCount = references.filter((item) => item.role === 'first_frame').length
  const lastFrameCount = references.filter((item) => item.role === 'last_frame').length
  const hasFrames = firstFrameCount > 0 || lastFrameCount > 0
  // 首尾帧与全模态参考是互斥任务；尾帧必须搭配唯一首帧。
  if (firstFrameCount > 1 || lastFrameCount > 1 || (lastFrameCount > 0 && firstFrameCount === 0)
    || (hasFrames && references.some((item) => item.role.startsWith('reference_')))) throw invalidVideoRequest()
  // 请求层再次防止混传，涵盖旧历史数据及 inputReference 与新素材并存的迁移场景。
  if (new Set(references.map((item) => item.type)).size > 1) throw invalidVideoRequest()
  return references
}

function createVideoPayload(input: VideoGenerationInput, model: string, prompt: string): Record<string, unknown> {
  const options = normalizeVideoOptions(input.videoOptions)
  const references = normalizeReferences(input)
  const resolution = input.resolution?.trim() ?? options.defaultResolution
  const ratio = input.ratio?.trim() ?? options.defaultRatio
  const size = input.size?.trim()
  if (options.hasVideoOptions && validateVideoParameters({
    prompt,
    duration: input.duration,
    size,
    resolution,
    ratio,
    imageCount: references.filter((item) => item.type === 'image').length,
    videoCount: references.filter((item) => item.type === 'video').length,
    audioCount: references.filter((item) => item.type === 'audio').length,
  }, options)) throw invalidVideoRequest()
  if (!options.hasVideoOptions && (!prompt || !Number.isInteger(input.duration) || input.duration <= 0 || !size)) throw invalidVideoRequest()

  const payload: Record<string, unknown> = { model, prompt, duration: input.duration, seconds: String(input.duration) }
  if (options.hasVideoOptions) {
    // 分辨率档位与比例交由后端组合，不能同时携带上一个模型遗留的精确像素尺寸。
    if (resolution) payload.resolution = resolution
    if (ratio) payload.ratio = ratio
  } else {
    payload.size = size
  }
  if (references.length) {
    if (options.hasVideoOptions && options.family === 'seedance') {
      // 原生 content 自身携带同一份提示词，避免素材数组覆盖适配器构造内容后丢失文本。
      payload.metadata = { content: [
        ...(prompt ? [{ type: 'text', text: prompt }] : []),
        ...references.map(({ type, url, role }) => ({ type: `${type}_url`, [`${type}_url`]: { url }, role })),
      ] }
    } else {
      // 未确认原生素材协议的历史模型继续使用单图字段，不猜测多素材的字段映射。
      if (references.length !== 1 || references[0].type !== 'image' || references[0].role !== 'reference_image') throw invalidVideoRequest()
      payload.input_reference = references[0].url
    }
  }
  return payload
}

export async function submitVideoGeneration(input: VideoGenerationInput): Promise<VideoTask> {
  const accessToken = input.accessToken.trim()
  const model = input.model.trim()
  const prompt = input.prompt.trim()
  const idempotencyKey = input.idempotencyKey.trim()
  if (!accessToken) throw new VideoRuntimeError(i18n.t('api.modelRuntime.accessTokenRequired'), 401, 'invalid_user_session', null)
  if (!model || prompt.length > MAX_PROMPT_LENGTH || !idempotencyKey) {
    throw invalidVideoRequest()
  }
  const payload = createVideoPayload(input, model, prompt)
  const requestId = createRequestId()
  const requestController = createRequestController(input.signal)
  try {
    return await requestVideoTask(VIDEO_TASK_PATH, {
      method: 'POST',
      credentials: 'omit',
      signal: requestController.controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-ThinkGo-User-Session': '1',
        'Idempotency-Key': idempotencyKey,
        'X-Request-ID': requestId,
        'X-App-Lang': getActiveLanguage(),
      },
      body: JSON.stringify(payload),
    }, requestId)
  } catch (error) {
    if (error instanceof VideoRuntimeError) throw error
    if (isApiError(error)) throw new VideoRuntimeError(error.message, error.status, String(error.code), error.requestId)
    // 调用方主动取消与请求超时使用不同语义，避免停止生成后误报超时。
    if (input.signal?.aborted) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (!requestController.controller.signal.aborted) throw error
      throw new VideoRuntimeError(i18n.t('api.videoRuntime.timeout'), 408, 'request_timeout', requestId)
    }
    throw new VideoRuntimeError(i18n.t('api.videoRuntime.networkFailure'), 0, 'network_error', requestId)
  } finally {
    requestController.clear()
  }
}

export async function getVideoTask(accessToken: string, taskId: string, signal?: AbortSignal): Promise<VideoTask> {
  const normalizedToken = accessToken.trim()
  const normalizedTaskId = taskId.trim()
  if (!normalizedToken) throw new VideoRuntimeError(i18n.t('api.modelRuntime.accessTokenRequired'), 401, 'invalid_user_session', null)
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
        Authorization: `Bearer ${normalizedToken}`,
        'X-ThinkGo-User-Session': '1',
        'X-Request-ID': requestId,
        'X-App-Lang': getActiveLanguage(),
      },
    }, requestId, normalizedTaskId)
  } catch (error) {
    if (error instanceof VideoRuntimeError) throw error
    if (isApiError(error)) throw new VideoRuntimeError(error.message, error.status, String(error.code), error.requestId)
    if (signal?.aborted) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (!requestController.controller.signal.aborted) throw error
      throw new VideoRuntimeError(i18n.t('api.videoRuntime.timeout'), 408, 'request_timeout', requestId)
    }
    throw new VideoRuntimeError(i18n.t('api.videoRuntime.networkFailure'), 0, 'network_error', requestId)
  } finally {
    requestController.clear()
  }
}

export async function cancelVideoTask(accessToken: string, taskId: string, signal?: AbortSignal): Promise<VideoTask> {
  const normalizedToken = accessToken.trim()
  const normalizedTaskId = taskId.trim()
  if (!normalizedToken) throw new VideoRuntimeError(i18n.t('api.modelRuntime.accessTokenRequired'), 401, 'invalid_user_session', null)
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
        Authorization: `Bearer ${normalizedToken}`,
        'X-ThinkGo-User-Session': '1',
        'X-Request-ID': requestId,
        'X-App-Lang': getActiveLanguage(),
      },
    }, requestId, normalizedTaskId)
  } catch (error) {
    if (error instanceof VideoRuntimeError) throw error
    if (isApiError(error)) throw new VideoRuntimeError(error.message, error.status, String(error.code), error.requestId)
    if (signal?.aborted) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (!requestController.controller.signal.aborted) throw error
      throw new VideoRuntimeError(i18n.t('api.videoRuntime.timeout'), 408, 'request_timeout', requestId)
    }
    throw new VideoRuntimeError(i18n.t('api.videoRuntime.networkFailure'), 0, 'network_error', requestId)
  } finally {
    requestController.clear()
  }
}
