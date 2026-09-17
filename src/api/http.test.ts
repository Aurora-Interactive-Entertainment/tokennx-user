import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { ApiError, fetchJson, fetchResponse, isAuthenticationFailure, isHttpUnauthorized, preserveAuthSession, resolveBackendBaseUrl } from './http'

function response(data: unknown, status = 200, code = 0, msg = 'success'): Response {
  return new Response(JSON.stringify({ code, msg, data }), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'server-request-id' },
  })
}

describe('认证 HTTP 客户端', () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => { vi.useRealTimers(); void i18n.changeLanguage('zh-CN') })

  it('优先使用后端 Base URL，未设置时使用开发代理目标', () => {
    expect(resolveBackendBaseUrl(' https://api.example.com/ ', 'http://proxy.example.com')).toBe('https://api.example.com')
    expect(resolveBackendBaseUrl('', ' http://proxy.example.com/ ')).toBe('http://proxy.example.com')
    expect(resolveBackendBaseUrl(undefined, undefined, ' https://fallback.example.com/// ')).toBe('https://fallback.example.com')
  })

  it('发送 JSON、Bearer token、请求追踪头并禁用 Cookie', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ ok: true }))

    await expect(fetchJson<{ ok: boolean }>('/api/test', {
      method: 'POST',
      body: { value: 'test' },
      accessToken: 'access-token',
    })).resolves.toEqual({ ok: true })

    const [url, options] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('/api/test')
    expect(options?.credentials).toBe('omit')
    expect(options?.body).toBe(JSON.stringify({ value: 'test' }))
    expect(new Headers(options?.headers).get('Accept')).toBe('application/json')
    expect(new Headers(options?.headers).get('Content-Type')).toBe('application/json')
    expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer access-token')
    expect(new Headers(options?.headers).get('X-Request-ID')).toBeTruthy()
    expect(new Headers(options?.headers).get('X-App-Lang')).toBe('zh-CN')
    expect(new Headers(options?.headers).get('Accept-Language')).toBe('zh-CN')
  })

	it('将后端业务错误转换为 ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(null, 401, 110001, '验证码错误'))

    const request = fetchJson('/api/auth/phone/login', { method: 'POST', body: {} })
		await expect(request).rejects.toMatchObject({ name: 'ApiError', status: 401, code: 110001, message: '验证码错误', apiMessage: '验证码错误', requestId: 'server-request-id' })
	})

	it('保留二进制成功响应并发送认证请求头', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('invoice-bytes', {
			status: 200,
			headers: { 'Content-Type': 'application/pdf', 'X-Request-ID': 'download-request-id' },
		}))

		const result = await fetchResponse('/api/user/billing/invoices/file-1/download', { accessToken: 'access-token' })
		expect(await result.text()).toBe('invoice-bytes')
		expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer access-token')
		expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Accept')).toBe('application/json')
	})

	it('处理网络失败和不可解析响应', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await expect(fetchJson('/api/test')).rejects.toMatchObject({ name: 'ApiError', status: 0, message: '网络连接失败，请检查服务地址和网络状态' })

    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not-json', { status: 502 }))
    await expect(fetchJson('/api/test')).rejects.toBeInstanceOf(ApiError)

    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('null', { status: 200 }))
    await expect(fetchJson('/api/test')).rejects.toMatchObject({ name: 'ApiError', message: '服务返回了无法识别的响应' })
  })

  it('语言切换后同步请求头和通用网络错误', async () => {
    await i18n.changeLanguage('en-US')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await expect(fetchJson('/api/test')).rejects.toMatchObject({ name: 'ApiError', message: 'The network connection failed. Check the service address and network.' })

    vi.restoreAllMocks()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ ok: true }))
    await fetchJson('/api/test')
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('X-App-Lang')).toBe('en-US')
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Accept-Language')).toBe('en-US')
  })
  it('external AbortSignal cancels the wrapped request without a network error', async () => {
    const external = new AbortController()
    let rejectFetch: ((reason?: unknown) => void) | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>((_resolve, reject) => {
      rejectFetch = reject
    }))
    const request = fetchJson('/api/test', { signal: external.signal })
    external.abort()
    rejectFetch?.(new DOMException('Aborted', 'AbortError'))
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('only treats HTTP 401 as an expired session', () => {
    expect(isAuthenticationFailure(new ApiError('invalid input', 400, 110001, null))).toBe(false)
    expect(isAuthenticationFailure(new ApiError('unauthorized', 401, 110001, null))).toBe(true)
    expect(isAuthenticationFailure({ status: 403, code: 110001 })).toBe(false)
  })

  it('external AbortSignal requests still honor the 15 second timeout', async () => {
    vi.useFakeTimers()
    const external = new AbortController()
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Timeout', 'AbortError')), { once: true })
    }))
    const request = fetchJson('/api/test', { signal: external.signal })
    const rejection = expect(request).rejects.toMatchObject({ name: 'ApiError', status: 408 })
    await vi.advanceTimersByTimeAsync(15_000)
    await rejection
    vi.useRealTimers()
  })

  it('已确认保留会话的 401 仍保留原始错误信息，但不再要求页面退出登录', () => {
    const error = new ApiError('当前业务接口拒绝访问', 401, 160001, 'request-1', '当前业务接口拒绝访问')
    preserveAuthSession(error)
    expect(isHttpUnauthorized(error)).toBe(true)
    expect(isAuthenticationFailure(error)).toBe(false)
    expect(error).toMatchObject({ status: 401, code: 160001, message: '当前业务接口拒绝访问', apiMessage: '当前业务接口拒绝访问', requestId: 'request-1' })
    expect(isAuthenticationFailure(new ApiError('会话已撤销', 401, 160001, null))).toBe(true)
  })

  it('热更新重建 HTTP 模块后仍识别旧请求留下的会话保留标记', async () => {
    const error = Object.freeze(new ApiError('业务接口拒绝访问', 401, 170099, 'request-before-hmr'))
    preserveAuthSession(error)
    vi.resetModules()
    const reloadedHttp = await import('./http')
    expect(reloadedHttp.isHttpUnauthorized(error)).toBe(true)
    expect(reloadedHttp.isAuthenticationFailure(error)).toBe(false)
    expect(reloadedHttp.isAuthenticationFailure(new reloadedHttp.ApiError('刷新令牌已撤销', 401, 160001, null))).toBe(true)
    expect(error.status).toBe(401)
  })

  it.each([200, 503])('收到 %s 响应头后仍可取消未完成的 JSON 正文', async status => {
    const external = new AbortController()
    let ready!: () => void
    const headersReady = new Promise<void>(resolve => { ready = resolve })
    const cancel = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      ready()
      return new Response(new ReadableStream({ cancel }), { status })
    })
    const request = fetchJson('/api/test', { signal: external.signal })
    const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' })
    await headersReady
    await Promise.resolve()
    external.abort()
    await rejection
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('15 秒超时覆盖响应正文并保留 408 错误语义', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ReadableStream()))
    const request = fetchJson('/api/test')
    const rejection = expect(request).rejects.toMatchObject({ name: 'ApiError', status: 408 })
    await vi.advanceTimersByTimeAsync(15_000)
    await rejection
    expect(vi.getTimerCount()).toBe(0)
  })

  it('文件正文可以取消，完整下载保留内容和类型并释放超时', async () => {
    vi.useFakeTimers()
    const external = new AbortController()
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(new ReadableStream(), { headers: { 'Content-Type': 'application/pdf' } }))
    const pendingResponse = await fetchResponse('/api/file', { signal: external.signal })
    const rejection = expect(pendingResponse.blob()).rejects.toMatchObject({ name: 'AbortError' })
    external.abort()
    await rejection
    vi.mocked(fetch).mockResolvedValueOnce(new Response('pdf-content', { headers: { 'Content-Type': 'application/pdf' } }))
    const complete = await fetchResponse('/api/file')
    const blob = await complete.blob()
    expect(blob.type).toBe('application/pdf')
    expect(await blob.text()).toBe('pdf-content')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('持续接收数据的大文件允许总下载时间超过 15 秒', async () => {
    vi.useFakeTimers()
    let source!: ReadableStreamDefaultController<Uint8Array>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ start(controller) { source = controller } })))
    const download = await fetchResponse('/api/file')
    const completed = download.blob()
    await vi.advanceTimersByTimeAsync(10_000)
    source.enqueue(new TextEncoder().encode('first-'))
    await vi.advanceTimersByTimeAsync(10_000)
    source.enqueue(new TextEncoder().encode('second'))
    source.close()
    expect(await (await completed).text()).toBe('first-second')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('正文读完或底层出错后释放源响应的 reader 锁', async () => {
    const source = new Response('complete')
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(source)
    const complete = await fetchResponse('/api/file')
    expect(await complete.text()).toBe('complete')
    expect(source.body?.locked).toBe(false)

    const failure = new Error('body connection failed')
    const failedSource = new Response(new ReadableStream({ start(controller) { controller.error(failure) } }))
    vi.mocked(fetch).mockResolvedValueOnce(failedSource)
    const failed = await fetchResponse('/api/file')
    await expect(failed.blob()).rejects.toBe(failure)
    expect(failedSource.body?.locked).toBe(false)
  })

  it('调用方取消流或 AbortSignal 中止后释放源响应的 reader 锁', async () => {
    const cancel = vi.fn()
    const source = new Response(new ReadableStream({ cancel }))
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(source)
    const response = await fetchResponse('/api/file')
    await response.body!.cancel('download dismissed')
    expect(cancel).toHaveBeenCalledWith('download dismissed')
    expect(source.body?.locked).toBe(false)

    const abortedSource = new Response(new ReadableStream())
    vi.mocked(fetch).mockResolvedValueOnce(abortedSource)
    const external = new AbortController()
    const aborted = await fetchResponse('/api/file', { signal: external.signal })
    const rejected = expect(aborted.blob()).rejects.toMatchObject({ name: 'AbortError' })
    external.abort()
    await rejected
    expect(abortedSource.body?.locked).toBe(false)
  })
})
