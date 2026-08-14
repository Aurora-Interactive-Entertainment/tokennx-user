import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MODEL_API_BASE_URL, ModelRuntimeError, type StreamChatCompletionInput, streamChatCompletion } from './model-runtime'

const DEFAULT_INPUT: StreamChatCompletionInput = {
  accessToken: 'user-access-token',
  model: 'deepseek-chat',
  prompt: '你好',
  temperature: 0.7,
  maxTokens: 128,
}

function sseResponse(chunks: string[], requestId = 'server-request-id'): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(new TextEncoder().encode(chunk)))
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', 'X-Request-ID': requestId },
  })
}

describe('模型运行时请求', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('使用配置的后端 Base URL、登录令牌并解析流式响应', async () => {
    const deltas: string[] = []
    const reasoningDeltas: string[] = []
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseResponse([
      'data: {"choices":[{"delta":{"reasoning_content":"先想","content":"你"}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning":"后想","content":"好"}}]}\n',
      '\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\n',
      'data: [DONE]\n\n',
    ]))

    const result = await streamChatCompletion({
      ...DEFAULT_INPUT,
      onDelta: (delta) => deltas.push(delta),
      onReasoningDelta: (delta) => reasoningDeltas.push(delta),
    })

    expect(result).toMatchObject({ content: '你好', reasoning: '先想后想', requestId: 'server-request-id', inputTokens: 3, outputTokens: 2, finishReason: 'stop' })
    expect(deltas).toEqual(['你', '好'])
    expect(reasoningDeltas).toEqual(['先想', '后想'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(`${MODEL_API_BASE_URL}/chat/completions`)
    expect(options?.method).toBe('POST')
    expect(options?.credentials).toBe('omit')
    const headers = new Headers(options?.headers)
    expect(headers.get('Authorization')).toBe('Bearer user-access-token')
    expect(headers.get('X-ThinkGo-User-Session')).toBe('1')
    expect(headers.get('X-ThinkGo-Api-Key')).toBeNull()
    expect(headers.get('X-Api-Key')).toBeNull()
    expect(headers.get('X-Goog-Api-Key')).toBeNull()
    expect(headers.get('X-Request-ID')).toBeTruthy()
    expect(headers.get('X-App-Lang')).toBe('zh-CN')
    expect(JSON.parse(String(options?.body))).toMatchObject({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: '你好' }],
      temperature: 0.7,
      max_tokens: 128,
      stream: true,
      stream_options: { include_usage: true },
    })
  })

  it('解析非流式 JSON 响应并回调完整文本', async () => {
    const onDelta = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: [{ type: 'text', text: '模型结果' }] }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 4 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(streamChatCompletion({ ...DEFAULT_INPUT, onDelta })).resolves.toMatchObject({ content: '模型结果', inputTokens: 5, outputTokens: 4 })
    expect(onDelta).toHaveBeenCalledWith('模型结果')
  })

  it('从内容块中分离 thinking，并且不把思考内容混入模型回复', async () => {
    const onReasoningDelta = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: [
        { type: 'thinking', text: '先分析条件' },
        { type: 'text', text: '最终答案' },
      ] }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(streamChatCompletion({ ...DEFAULT_INPUT, onReasoningDelta })).resolves.toMatchObject({
      content: '最终答案',
      reasoning: '先分析条件',
    })
    expect(onReasoningDelta).toHaveBeenCalledWith('先分析条件')
  })

  it('将服务端错误转换为带状态、错误码和 Request ID 的运行时错误', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { message: 'API Key 无效', code: 'invalid_api_key' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'error-request-id' },
    }))

    await expect(streamChatCompletion(DEFAULT_INPUT)).rejects.toMatchObject({
      name: 'ModelRuntimeError',
      status: 401,
      code: 'invalid_api_key',
      message: 'API Key 无效',
      requestId: 'error-request-id',
    })
  })

  it('拒绝缺少登录令牌或请求内容的调用而不发起网络请求', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await expect(streamChatCompletion({ ...DEFAULT_INPUT, accessToken: '  ' })).rejects.toMatchObject({ name: 'ModelRuntimeError', status: 401, code: 'access_token_required' })
    await expect(streamChatCompletion({ ...DEFAULT_INPUT, prompt: '  ' })).rejects.toMatchObject({ name: 'ModelRuntimeError', status: 400, code: 'invalid_request' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('报告无法解析的流式数据', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseResponse(['data: {broken}\n\n']))

    await expect(streamChatCompletion(DEFAULT_INPUT)).rejects.toMatchObject({
      name: 'ModelRuntimeError',
      status: 502,
      code: 'invalid_stream',
    })
  })

  it('把外部停止信号传递给底层请求', async () => {
    const controller = new AbortController()
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, options) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('请求已取消', 'AbortError')), { once: true })
    }))

    const request = streamChatCompletion({ ...DEFAULT_INPUT, signal: controller.signal })
    controller.abort()

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('保留运行时错误实例类型', () => {
    const error = new ModelRuntimeError('测试错误', 500, 'test_error', 'request-id')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ModelRuntimeError')
    expect(error.status).toBe(500)
  })
})
