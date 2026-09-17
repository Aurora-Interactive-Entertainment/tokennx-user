import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResult } from './auth'
import { streamChatCompletion } from './model-runtime'
import { cancelVideoTask, getVideoTask, submitVideoGeneration } from './video-runtime'
import { clearAuthTokens, getAccessToken, readRefreshToken, saveAuthTokens } from '@/auth/token-storage'

function session(access = 'old-access', refresh = 'old-refresh', user = 'user-1'): AuthResult {
  return { status: 'succeeded', binding_required: false, access_token: access, refresh_token: refresh, refresh_expires_at: Date.UTC(2099, 0, 1), user: { id: user, display_name: user, avatar_url: '' } }
}
function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'server-request' } })
}
const unauthorized = () => response({ msg: '令牌过期', error: { code: 'expired' } }, 401)
const refreshed = () => response({ code: 0, msg: 'success', data: session('new-access', 'new-refresh') })
const success = () => response({ id: 'video-task', status: 'queued', choices: [{ message: { content: '生成完成' }, finish_reason: 'stop' }] })
const calls = {
  chat: (signal?: AbortSignal) => streamChatCompletion({ accessToken: 'old-access', model: 'model', prompt: '测试', temperature: 1, maxTokens: 128, signal }),
  submit: (signal?: AbortSignal) => submitVideoGeneration({ accessToken: 'old-access', model: 'model', prompt: '测试', duration: 5, size: '1280x720', idempotencyKey: 'same-order', signal }),
  query: (signal?: AbortSignal) => getVideoTask('old-access', 'video-task', signal),
  cancel: (signal?: AbortSignal) => cancelVideoTask('old-access', 'video-task', signal),
}

describe('模型和视频的登录会话恢复', () => {
  beforeEach(() => { vi.restoreAllMocks(); clearAuthTokens({ force: true, broadcast: false }); saveAuthTokens(session()) })
  afterEach(() => { vi.restoreAllMocks(); clearAuthTokens({ force: true, broadcast: false }) })

  it.each(Object.entries(calls))('%s 的401刷新后复用原请求号、请求体和幂等键', async (_kind, run) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(refreshed()).mockResolvedValueOnce(success())
    await run()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const initial = fetchMock.mock.calls[0][1]!
    const retry = fetchMock.mock.calls[2][1]!
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/auth/refresh')
    expect(new Headers(retry.headers).get('Authorization')).toBe('Bearer new-access')
    expect(new Headers(retry.headers).get('X-Request-ID')).toBe(new Headers(initial.headers).get('X-Request-ID'))
    expect(new Headers(retry.headers).get('Idempotency-Key')).toBe(new Headers(initial.headers).get('Idempotency-Key'))
    expect(retry.method).toBe(initial.method)
    expect(retry.body).toBe(initial.body)
  })

  it.each(Object.entries(calls))('%s 刷新503仅展示服务错误并保留会话', async (_kind, run) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(response({ code: 120001, msg: '服务暂不可用', data: null }, 503))
    await expect(run()).rejects.toMatchObject({ status: 503, message: '服务暂不可用' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(getAccessToken()).toBe('old-access')
    expect(readRefreshToken()).toBe('old-refresh')
  })

  it.each(Object.entries(calls))('%s 重试仍401才清除原会话', async (_kind, run) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(refreshed()).mockResolvedValueOnce(unauthorized())
    await expect(run()).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(getAccessToken()).toBeNull()
    expect(readRefreshToken()).toBeNull()
  })

  it.each(Object.entries(calls))('%s 的旧401不会重放或清除另一账号', async (_kind, run) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
      saveAuthTokens(session('account-b-access', 'account-b-refresh', 'account-b'))
      return unauthorized()
    })
    await expect(run()).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(getAccessToken()).toBe('account-b-access')
  })

  it.each(Object.entries(calls))('%s 等待刷新时取消，不会继续重放', async (_kind, run) => {
    const controller = new AbortController()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(unauthorized()).mockImplementationOnce(async () => { controller.abort(); return refreshed() })
    await expect(run(controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(getAccessToken()).toBe('new-access')
  })

  it('已开始输出的流中错误不刷新、不重新生成', async () => {
    const onDelta = vi.fn()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"部分内容"}}]}\n\ndata: {"error":{"code":"401","message":"上游流中失败"}}\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    await expect(streamChatCompletion({ accessToken: 'old-access', model: 'model', prompt: '测试', temperature: 1, maxTokens: 128, onDelta })).rejects.toMatchObject({ message: '上游流中失败', status: 200 })
    expect(onDelta).toHaveBeenCalledWith('部分内容')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(getAccessToken()).toBe('old-access')
  })
})
