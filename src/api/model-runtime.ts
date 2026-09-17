import { MODEL_API_BASE_URL, isApiError } from './http'
import { withAuthenticatedSession } from './authenticated'
import i18n, { getActiveLanguage } from '@/i18n'

const CHAT_COMPLETIONS_PATH = '/chat/completions'
const DEFAULT_MODEL_REQUEST_TIMEOUT_MS = 120_000
const MAX_ERROR_MESSAGE_LENGTH = 4_096

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
  // 无论错误对象是否嵌套，都优先使用响应顶层的 msg。
  const message = readFirstText([
    value.msg,
    error.msg,
    error.message,
    error.detail,
    error.reason,
    value.message,
    value.detail,
    value.reason,
    typeof value.error === 'string' ? value.error : '',
  ])
  const code = typeof error.code === 'string' ? error.code : typeof error.code === 'number' ? String(error.code) : null
  return { message: message || i18n.t('api.modelRuntime.requestFailed'), code }
}

function hasBusinessError(value: unknown): value is RecordValue {
  if (!isRecord(value)) return false
  if (isRecord(value.error) || (typeof value.error === 'string' && value.error.trim())) return true
  if (typeof value.code === 'number') return value.code !== 0
  return typeof value.code === 'string' && value.code.trim() !== '' && value.code.trim() !== '0'
}

async function readErrorResponse(response: Response, requestId: string): Promise<ModelRuntimeError> {
  // 先解析完整错误结构，避免截断附加字段后连带丢失错误码；只限制最终展示文案。
  const body = await response.text()
  let payload: unknown = null
  try {
    payload = body ? JSON.parse(body) : null
  } catch {
    payload = null
  }
  const error = completionErrorMessage(payload)
  return new ModelRuntimeError(error.message.slice(0, MAX_ERROR_MESSAGE_LENGTH), response.status, error.code, response.headers.get('X-Request-ID') ?? requestId)
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

function parseStreamEvent(event: string, requestId: string): { done: boolean; payload: ParsedCompletionPayload } {
  const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n').trim()
  // SSE 保活注释或空事件不代表流结束，只有服务端明确发送 [DONE] 才结束回答。
  if (!data) return { done: false, payload: { content: '', reasoning: '', inputTokens: null, outputTokens: null, finishReason: null } }
  if (data === '[DONE]') return { done: true, payload: { content: '', reasoning: '', inputTokens: null, outputTokens: null, finishReason: null } }
  let rawPayload: unknown
  try {
    rawPayload = JSON.parse(data) as unknown
  } catch {
    throw new ModelRuntimeError(i18n.t('api.modelRuntime.invalidStream'), 502, 'invalid_stream', requestId)
  }
  // HTTP 200 之后上游仍可能在流中报错，必须保留原因，不能把已有半条回答当成功。
  if (hasBusinessError(rawPayload) || event.split(/\r?\n/).some((line) => /^event:\s*error\s*$/.test(line))) {
    const error = completionErrorMessage(rawPayload)
    throw new ModelRuntimeError(error.message, 200, error.code, requestId)
  }
  return { done: false, payload: parseCompletionPayload(rawPayload) }
}

async function readStreamResponse(response: Response, requestId: string, onDelta?: (delta: string) => void, onReasoningDelta?: (delta: string) => void): Promise<ParsedCompletionPayload> {
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
  let reachedEof = false

  const consumeEvent = (event: string): void => {
    const parsed = parseStreamEvent(event, requestId)
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

  try {
    while (!streamDone) {
      const chunk = await reader.read()
      reachedEof = chunk.done
      buffer += decoder.decode(chunk.value, { stream: !chunk.done })
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop() ?? ''
      for (const event of events) {
        consumeEvent(event)
        if (streamDone) break
      }
      if (chunk.done) break
    }
    if (!streamDone && buffer.trim()) consumeEvent(buffer)
    // 兼容只返回 finish_reason 的服务；二者都没有的 EOF 属于中断，不能记成完成。
    if (!streamDone && !result.finishReason) throw new ModelRuntimeError(i18n.t('api.modelRuntime.incompleteStream'), 502, 'incomplete_stream', requestId)
    return result
  } finally {
    if (!reachedEof) await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
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
    // 只重试 HTTP 401；成功响应之后的 SSE/JSON 读取始终只有一次，避免重复生成计费。
    const response = await withAuthenticatedSession({ accessToken, signal: requestController.controller.signal }, async (currentAccessToken) => {
      const attemptedResponse = await fetch(`${MODEL_API_BASE_URL}${CHAT_COMPLETIONS_PATH}`, {
        method: 'POST',
        credentials: 'omit',
        signal: requestController.controller.signal,
        headers: {
          Accept: 'text/event-stream, application/json',
          Authorization: `Bearer ${currentAccessToken}`,
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
      if (!attemptedResponse.ok) throw await readErrorResponse(attemptedResponse, requestId)
      return attemptedResponse
    })

    const isEventStream = response.headers.get('Content-Type')?.toLowerCase().includes('text/event-stream')
    let payload: ParsedCompletionPayload
    if (isEventStream) {
      payload = await readStreamResponse(response, response.headers.get('X-Request-ID') ?? requestId, input.onDelta, input.onReasoningDelta)
    } else {
      const rawPayload: unknown = await response.json()
      if (hasBusinessError(rawPayload)) {
        const error = completionErrorMessage(rawPayload)
        throw new ModelRuntimeError(error.message, response.status, error.code, response.headers.get('X-Request-ID') ?? requestId)
      }
      payload = parseCompletionPayload(rawPayload)
    }
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
    if (input.signal?.aborted) throw error
    if (requestController.controller.signal.aborted) throw new ModelRuntimeError(i18n.t('api.modelRuntime.timeout'), 408, 'request_timeout', requestId)
    if (error instanceof ModelRuntimeError) throw error
    if (isApiError(error)) throw new ModelRuntimeError(error.message, error.status, String(error.code), error.requestId)
    // 会话换号主动中止也保留 AbortError，不能误显示成超时或清除新账号。
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ModelRuntimeError(i18n.t('api.modelRuntime.networkFailure'), 0, 'network_error', requestId)
  } finally {
    requestController.clear()
  }
}
