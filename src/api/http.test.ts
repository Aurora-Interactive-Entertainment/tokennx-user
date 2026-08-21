import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { ApiError, fetchJson, fetchResponse, isAuthenticationFailure, resolveBackendBaseUrl } from './http'

function response(data: unknown, status = 200, code = 0, msg = 'success'): Response {
  return new Response(JSON.stringify({ code, msg, data }), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'server-request-id' },
  })
}

describe('认证 HTTP 客户端', () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => { void i18n.changeLanguage('zh-CN') })

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
  })

	it('将后端业务错误转换为 ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(null, 401, 110001, '验证码错误'))

    const request = fetchJson('/api/auth/phone/login', { method: 'POST', body: {} })
    await expect(request).rejects.toMatchObject({ name: 'ApiError', status: 401, code: 110001, message: '验证码错误', requestId: 'server-request-id' })
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
  })
  it('external AbortSignal cancels the wrapped request', async () => {
    const external = new AbortController()
    let rejectFetch: ((reason?: unknown) => void) | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>((_resolve, reject) => {
      rejectFetch = reject
    }))
    const request = fetchJson('/api/test', { signal: external.signal })
    external.abort()
    rejectFetch?.(new DOMException('Aborted', 'AbortError'))
    await expect(request).rejects.toMatchObject({ name: 'ApiError', status: 0 })
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
})
