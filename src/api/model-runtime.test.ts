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

  it('忽略没有 data 的 SSE 保活事件，继续读取后续模型内容', async () => {
    const onDelta = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseResponse([
      ': keep-alive\n\n',
      'data: {"choices":[{"delta":{"content":"继续输出"}}]}\n\n',
      'data: [DONE]\n\n',
    ]))

    await expect(streamChatCompletion({ ...DEFAULT_INPUT, onDelta })).resolves.toMatchObject({ content: '继续输出' })
    expect(onDelta).toHaveBeenCalledWith('继续输出')
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
      status: 403,
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'error-request-id' },
    }))

    await expect(streamChatCompletion(DEFAULT_INPUT)).rejects.toMatchObject({
      name: 'ModelRuntimeError',
      status: 403,
      code: 'invalid_api_key',
      message: 'API Key 无效',
      requestId: 'error-request-id',
    })
  })

  it('错误响应包含顶层 msg 时优先展示 msg', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      msg: '完成实名认证后才能调用模型',
      error: { message: 'fallback message', code: 'insufficient_balance' },
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }))

    await expect(streamChatCompletion(DEFAULT_INPUT)).rejects.toMatchObject({
      name: 'ModelRuntimeError',
      message: '完成实名认证后才能调用模型',
      code: 'insufficient_balance',
    })
  })

  it('完整解析附加信息超过展示限制的错误 JSON，保留原因、错误码和请求号', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: { message: '余额不足', code: 'insufficient_balance' },
      metadata: 'x'.repeat(5_000),
    }), {
      status: 403,
      headers: { 'X-Request-ID': 'long-error-request' },
    }))

    await expect(streamChatCompletion(DEFAULT_INPUT)).rejects.toMatchObject({
      status: 403, code: 'insufficient_balance', message: '余额不足', requestId: 'long-error-request',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('仅截短过长的错误展示文案，不破坏完整错误对象', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      msg: '错'.repeat(5_000),
      error: { message: '备用文案', code: 'upstream_error' },
    }), { status: 500 }))

    await expect(streamChatCompletion(DEFAULT_INPUT)).rejects.toMatchObject({
      status: 500, code: 'upstream_error', message: '错'.repeat(4_096),
    })
  })

  it('兼容成功 HTTP 状态下返回的标准业务错误体', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 170008,
      msg: '完成实名认证后才能调用模型',
      data: {},
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    await expect(streamChatCompletion(DEFAULT_INPUT)).rejects.toMatchObject({
      name: 'ModelRuntimeError',
      status: 200,
      code: '170008',
      message: '完成实名认证后才能调用模型',
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

  it.each([
    'data: {"error":{"message":"上游生成失败","code":"upstream_error"}}\n\n',
    'data: {"code":"upstream_error","msg":"上游生成失败"}\n\n',
    'event: error\ndata: {"message":"上游生成失败","code":"upstream_error"}\n\n',
  ])('保留流中错误及请求号，不把已收到的半条回答记为成功：%s', async (errorEvent) => {
    const onDelta = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseResponse([
      'data: {"choices":[{"delta":{"content":"部分回答"}}]}\n\n',
      errorEvent,
      'data: [DONE]\n\n',
    ], 'stream-error-request'))

    await expect(streamChatCompletion({ ...DEFAULT_INPUT, onDelta })).rejects.toMatchObject({
      message: '上游生成失败', code: 'upstream_error', requestId: 'stream-error-request',
    })
    expect(onDelta).toHaveBeenCalledWith('部分回答')
  })

  it('没有完成标记就结束的流报告中断，同时保留已收到的内容', async () => {
    const onDelta = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseResponse(['data: {"choices":[{"delta":{"content":"部分回答"}}]}\n\n']))

    await expect(streamChatCompletion({ ...DEFAULT_INPUT, onDelta })).rejects.toMatchObject({ code: 'incomplete_stream', requestId: 'server-request-id' })
    expect(onDelta).toHaveBeenCalledWith('部分回答')
  })

  it('兼容只有 finish_reason 的完成响应，并解析最后无空行的事件', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseResponse([
      'data: {"choices":[{"delta":{"content":"完整回答"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":2}}',
    ]))
    await expect(streamChatCompletion(DEFAULT_INPUT)).resolves.toMatchObject({ content: '完整回答', finishReason: 'stop', inputTokens: 1, outputTokens: 2 })
  })

  it('收到 DONE 后停止消费同批后续事件并释放响应流', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"答案"}}]}\n\ndata: [DONE]\n\ndata: {broken}\n\n')) },
      cancel,
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }))
    await expect(streamChatCompletion(DEFAULT_INPUT)).resolves.toMatchObject({ content: '答案' })
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
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
