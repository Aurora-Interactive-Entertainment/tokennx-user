import { MODEL_API_BASE_URL } from './http'
import i18n, { getActiveLanguage } from '@/i18n'

const CHAT_COMPLETIONS_PATH = '/chat/completions'
const DEFAULT_MODEL_REQUEST_TIMEOUT_MS = 120_000
const MAX_ERROR_BODY_LENGTH = 4_096

export { MODEL_API_BASE_URL }

export interface StreamChatCompletionInput {
  accessToken: string
  model: string
  messages?: ChatCompletionMessage[]
  /** 兼容旧调用方，新的智能会话请求应传递完整 messages。 */
  prompt?: string
  temperature: number
  maxTokens: number
  signal?: AbortSignal
  onDelta?: (delta: string) => void
  onReasoningDelta?: (delta: string) => void
}

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

export interface ChatCompletionResult {
  content: string
  reasoning: string
  requestId: string
  inputTokens: number | null
  outputTokens: number | null
  finishReason: string | null
  latencyMs: number
}

export class ModelRuntimeError extends Error {
  readonly status: number
  readonly code: string | null
  readonly requestId: string | null

  constructor(message: string, status: number, code: string | null, requestId: string | null) {
    super(message)
    this.name = 'ModelRuntimeError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

interface ParsedCompletionPayload {
  content: string
  reasoning: string
  inputTokens: number | null
  outputTokens: number | null
  finishReason: string | null
}

interface RecordValue {
  [key: string]: unknown
}

function requestMessages(input: StreamChatCompletionInput): ChatCompletionMessage[] {
  if (input.messages?.length) return input.messages.map((message) => ({ role: message.role, content: message.content }))
  return input.prompt === undefined ? [] : [{ role: 'user', content: input.prompt }]
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `model-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function readNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return null
  return value
}

function readText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((item) => readText(item)).join('')
  if (!isRecord(value)) return ''
  return [value.text, value.content, value.reasoning_content, value.reasoning, value.thinking]
    .map((item) => readText(item))
    .find((text) => text.length > 0) ?? ''
}

const REASONING_BLOCK_TYPES = new Set(['thinking', 'reasoning', 'reasoning_content', 'redacted_thinking'])

function blockType(value: RecordValue): string {
  return typeof value.type === 'string' ? value.type.toLowerCase() : ''
}

function readContent(value: unknown): string {
  if (!Array.isArray(value)) return readText(value)
  return value.map((item) => {
    if (!isRecord(item) || REASONING_BLOCK_TYPES.has(blockType(item))) return ''
    return readText(item)
  }).join('')
}

function readReasoningBlocks(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value.map((item) => {
    if (!isRecord(item) || !REASONING_BLOCK_TYPES.has(blockType(item))) return ''
    return readText(item)
  }).join('')
}

function readFirstText(values: unknown[]): string {
  for (const value of values) {
    const text = readText(value)
    if (text) return text
  }
  return ''
}

function parseCompletionPayload(value: unknown): ParsedCompletionPayload {
  if (!isRecord(value)) return { content: '', reasoning: '', inputTokens: null, outputTokens: null, finishReason: null }
  const choices = Array.isArray(value.choices) ? value.choices : []
  const firstChoice = isRecord(choices[0]) ? choices[0] : null
  const delta = firstChoice && isRecord(firstChoice.delta) ? firstChoice.delta : null
  const message = firstChoice && isRecord(firstChoice.message) ? firstChoice.message : null
  const usage = isRecord(value.usage) ? value.usage : null
  const contentValue = delta?.content ?? message?.content
  return {
    content: readContent(contentValue),
    reasoning: readFirstText([
      delta?.reasoning_content,
      delta?.reasoning,
      delta?.thinking,
      message?.reasoning_content,
      message?.reasoning,
      message?.thinking,
    ]) || readReasoningBlocks(contentValue),
    inputTokens: readNonNegativeInteger(usage?.prompt_tokens ?? usage?.input_tokens),
    outputTokens: readNonNegativeInteger(usage?.completion_tokens ?? usage?.output_tokens),
    finishReason: typeof firstChoice?.finish_reason === 'string' ? firstChoice.finish_reason : null,
  }
}

function completionErrorMessage(value: unknown): { message: string; code: string | null } {
  if (!isRecord(value)) return { message: i18n.t('api.modelRuntime.unknownError'), code: null }
  const error = isRecord(value.error) ? value.error : value
  const message = typeof error.message === 'string' ? error.message : typeof value.msg === 'string' ? value.msg : ''
  const code = typeof error.code === 'string' ? error.code : typeof error.code === 'number' ? String(error.code) : null
  return { message: message || i18n.t('api.modelRuntime.requestFailed'), code }
}

async function readErrorResponse(response: Response, requestId: string): Promise<ModelRuntimeError> {
  const body = (await response.text()).slice(0, MAX_ERROR_BODY_LENGTH)
  let payload: unknown = null
  try {
    payload = body ? JSON.parse(body) : null
  } catch {
    payload = null
  }
  const error = completionErrorMessage(payload)
  return new ModelRuntimeError(error.message, response.status, error.code, response.headers.get('X-Request-ID') ?? requestId)
}

function mergeUsage(current: ParsedCompletionPayload, next: ParsedCompletionPayload): ParsedCompletionPayload {
  return {
    content: current.content,
    reasoning: current.reasoning,
    inputTokens: next.inputTokens ?? current.inputTokens,
    outputTokens: next.outputTokens ?? current.outputTokens,
    finishReason: next.finishReason ?? current.finishReason,
  }
}

function parseStreamEvent(event: string): { done: boolean; payload: ParsedCompletionPayload } {
  const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n').trim()
  if (!data || data === '[DONE]') return { done: true, payload: { content: '', reasoning: '', inputTokens: null, outputTokens: null, finishReason: null } }
  try {
    return { done: false, payload: parseCompletionPayload(JSON.parse(data) as unknown) }
  } catch {
    throw new ModelRuntimeError(i18n.t('api.modelRuntime.invalidStream'), 502, 'invalid_stream', null)
  }
}

async function readStreamResponse(response: Response, onDelta?: (delta: string) => void, onReasoningDelta?: (delta: string) => void): Promise<ParsedCompletionPayload> {
  if (!response.body) {
    const payload = parseCompletionPayload(await response.json() as unknown)
    onDelta?.(payload.content)
    onReasoningDelta?.(payload.reasoning)
    return payload
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: ParsedCompletionPayload = { content: '', reasoning: '', inputTokens: null, outputTokens: null, finishReason: null }
  let streamDone = false

  const consumeEvent = (event: string): void => {
    const parsed = parseStreamEvent(event)
    if (parsed.done) {
      streamDone = true
      return
    }
    const delta = parsed.payload.content
    if (delta) {
      result = { ...result, content: result.content + delta }
      onDelta?.(delta)
    }
    const reasoningDelta = parsed.payload.reasoning
    if (reasoningDelta) {
      result = { ...result, reasoning: result.reasoning + reasoningDelta }
      onReasoningDelta?.(reasoningDelta)
    }
    result = mergeUsage(result, parsed.payload)
  }

  while (!streamDone) {
    const chunk = await reader.read()
    buffer += decoder.decode(chunk.value, { stream: !chunk.done })
    const events = buffer.split(/\r?\n\r?\n/)
    buffer = events.pop() ?? ''
    events.forEach(consumeEvent)
    if (chunk.done) break
  }
  if (buffer.trim()) consumeEvent(buffer)
  return result
}

function createRequestController(signal: AbortSignal | undefined): { controller: AbortController; clear: () => void } {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), DEFAULT_MODEL_REQUEST_TIMEOUT_MS)
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

export async function streamChatCompletion(input: StreamChatCompletionInput): Promise<ChatCompletionResult> {
  const startedAt = performance.now()
  const requestId = createRequestId()
  const requestController = createRequestController(input.signal)
  const accessToken = input.accessToken.trim()
  const messages = requestMessages(input)
  if (!accessToken) {
    requestController.clear()
    throw new ModelRuntimeError(i18n.t('api.modelRuntime.accessTokenRequired'), 401, 'access_token_required', requestId)
  }
  if (!input.model.trim() || messages.length === 0 || messages.some((message) => !message.content.trim())) {
    requestController.clear()
    throw new ModelRuntimeError(i18n.t('api.modelRuntime.invalidRequest'), 400, 'invalid_request', requestId)
  }

  try {
    const response = await fetch(`${MODEL_API_BASE_URL}${CHAT_COMPLETIONS_PATH}`, {
      method: 'POST',
      credentials: 'omit',
      signal: requestController.controller.signal,
      headers: {
        Accept: 'text/event-stream, application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-ThinkGo-User-Session': '1',
        'X-Request-ID': requestId,
        'X-App-Lang': getActiveLanguage(),
      },
      body: JSON.stringify({
        model: input.model,
        messages,
        temperature: input.temperature,
        max_tokens: input.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      }),
    })
    if (!response.ok) throw await readErrorResponse(response, requestId)

    const isEventStream = response.headers.get('Content-Type')?.toLowerCase().includes('text/event-stream')
    const payload = isEventStream
      ? await readStreamResponse(response, input.onDelta, input.onReasoningDelta)
      : parseCompletionPayload(await response.json() as unknown)
    if (!isEventStream) {
      input.onDelta?.(payload.content)
      input.onReasoningDelta?.(payload.reasoning)
    }
    return {
      ...payload,
      requestId: response.headers.get('X-Request-ID') ?? requestId,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    }
  } catch (error) {
    if (error instanceof ModelRuntimeError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (input.signal?.aborted) throw error
      throw new ModelRuntimeError(i18n.t('api.modelRuntime.timeout'), 408, 'request_timeout', requestId)
    }
    throw new ModelRuntimeError(i18n.t('api.modelRuntime.networkFailure'), 0, 'network_error', requestId)
  } finally {
    requestController.clear()
  }
}
