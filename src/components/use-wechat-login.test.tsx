import { StrictMode, type ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppStore } from '@/store'
import { clearAuthTokens, getAccessToken, saveAuthTokens } from '@/auth/token-storage'
import { WECHAT_CALLBACK_MESSAGE } from '@/auth/wechat-authorization'
import { useWechatLogin } from './use-wechat-login'
import { synchronizeAuthenticatedUser } from '@/store/auth-slice'
import type { AuthResult } from '@/api/auth'
import i18n from '@/i18n'

function envelope(data: unknown, status = 200, code = 0) {
  return new Response(JSON.stringify({ code, msg: status === 200 ? 'success' : '暂不可用', data }), { status, headers: { 'Content-Type': 'application/json' } })
}
function qr(state = 'first', lifetime = 60000) {
  return { app_id: 'wx1234567890abcdef', scope: 'snsapi_login', redirect_uri: window.location.origin + '/wechat-callback.html', state, expires_at: Date.now() + lifetime }
}
const binding = { status: 'pending_binding', binding_required: true, binding_ticket: 'binding-ticket' }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}
function setup() {
  const onSuccess = vi.fn(), onBinding = vi.fn()
  const hook = renderHook(({ enabled }) => useWechatLogin({ enabled, onSuccess, onBinding }), {
    initialProps: { enabled: true },
    wrapper: ({ children }: { children: ReactNode }) => <StrictMode><Provider store={store}>{children}</Provider></StrictMode>,
  })
  const frame = document.createElement('iframe')
  document.body.append(frame)
  hook.result.current.frameRef.current = frame
  const callback = (state = 'first') => act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin, source: frame.contentWindow,
      data: { type: WECHAT_CALLBACK_MESSAGE, code: 'wechat-code', state },
    }))
  })
  return { ...hook, onSuccess, onBinding, callback }
}
let store: ReturnType<typeof createAppStore>
async function advance(ms = 10) { await act(() => vi.advanceTimersByTimeAsync(ms)) }

describe('微信回调兑换生命周期', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearAuthTokens({ force: true })
    store = createAppStore()
    void i18n.changeLanguage('zh-CN')
  })
  afterEach(() => { cleanup(); document.querySelectorAll('iframe').forEach(frame => frame.remove()); vi.useRealTimers(); vi.restoreAllMocks() })

  it('等待回调期间不轮询，首次授权只进入绑定，不建立本站登录态', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(envelope(qr())).mockResolvedValueOnce(envelope(binding))
    const hook = setup()
    saveAuthTokens({ status: 'succeeded', binding_required: false, access_token: 'old-access', refresh_token: 'old-refresh', refresh_expires_at: Date.now() + 60000, user: { id: 'old-user', display_name: '旧用户', avatar_url: '' } } as AuthResult)
    store.dispatch(synchronizeAuthenticatedUser({ id: 'old-user', display_name: '旧用户', avatar_url: '' }))
    act(() => hook.result.current.start())
    await advance(5000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    hook.callback()
    await advance()
    expect(hook.result.current.view).toBe('binding')
    expect(hook.onBinding).toHaveBeenCalledWith('binding-ticket')
    expect(hook.onSuccess).not.toHaveBeenCalled()
    expect(getAccessToken()).toBeNull()
    expect(store.getState().auth.status).toBe('unauthenticated')
    expect(String(fetchMock.mock.calls[1][0])).toBe('/api/auth/wechat/exchange')
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ code: 'wechat-code', state: 'first' })
  })

  it('已绑定用户兑换一次，保存完整令牌并完成登录', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(envelope(qr())).mockResolvedValueOnce(envelope({
      status: 'succeeded', binding_required: false, access_token: 'test-access', refresh_token: 'test-refresh',
      access_expires_at: Date.now() + 60000, refresh_expires_at: Date.now() + 120000,
      user: { id: 'test-user', display_name: '用户', avatar_url: '' },
    }))
    const hook = setup()
    act(() => hook.result.current.start())
    await advance()
    hook.callback()
    hook.callback()
    await advance()
    expect(hook.onSuccess).toHaveBeenCalledTimes(1)
    expect(getAccessToken()).toBe('test-access')
    await advance(10000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('顶层兜底窗口回调使用窗口引用完成兑换', async () => {
    const popup = { closed: false } as unknown as Window
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(envelope(qr())).mockResolvedValueOnce(envelope(binding))
    vi.spyOn(window, 'open').mockReturnValue(popup)
    const hook = setup()
    act(() => hook.result.current.start())
    await advance()
    act(() => hook.result.current.openInNewWindow('https://open.weixin.qq.com/connect/qrconnect'))
    act(() => window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin,
      source: popup,
      data: { type: WECHAT_CALLBACK_MESSAGE, code: 'popup-code', state: 'first' },
    })))
    await advance()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ code: 'popup-code', state: 'first' })
    expect(hook.onBinding).toHaveBeenCalledWith('binding-ticket')
  })

  it('刷新取消旧请求，迟到二维码与旧 state 回调不能影响新会话', async () => {
    const old = deferred<Response>()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(old.promise).mockResolvedValueOnce(envelope(qr('second')))
    const hook = setup()
    act(() => hook.result.current.start())
    await advance()
    act(() => hook.result.current.start())
    await advance()
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
    await act(async () => old.resolve(envelope(qr('first'))))
    hook.callback('first')
    expect(hook.result.current.session?.state).toBe('second')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('重复回调及语言切换不会并发兑换', async () => {
    const pending = deferred<Response>()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(envelope(qr())).mockReturnValueOnce(pending.promise)
    const hook = setup()
    act(() => hook.result.current.start())
    await advance()
    hook.callback()
    await act(() => i18n.changeLanguage('en-US'))
    hook.callback()
    await advance(6000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(async () => pending.resolve(envelope(binding)))
    expect(hook.onBinding).toHaveBeenCalledTimes(1)
  })

  it('离开微信页取消兑换，迟到响应不能自动登录', async () => {
    const pending = deferred<Response>()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(envelope(qr())).mockReturnValueOnce(pending.promise)
    const hook = setup()
    act(() => hook.result.current.start())
    await advance()
    hook.callback()
    hook.rerender({ enabled: false })
    expect(fetchMock.mock.calls[1][1]?.signal?.aborted).toBe(true)
    await act(async () => pending.resolve(envelope(binding)))
    expect(hook.onBinding).not.toHaveBeenCalled()
    expect(hook.onSuccess).not.toHaveBeenCalled()
  })

  it.each([[404, 100004], [400, 160007], [409, 100006]])('兑换状态 %s/%s 提示重新获取二维码', async (status, code) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(envelope(qr())).mockResolvedValueOnce(envelope({}, status, code))
    const hook = setup()
    act(() => hook.result.current.start())
    await advance()
    hook.callback()
    await advance()
    expect(hook.result.current.view).toBe('expired')
    expect(hook.result.current.session).toBeNull()
  })

  it('二维码到期停止接收回调，刷新创建新 state', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(envelope(qr('first', 1000))).mockResolvedValueOnce(envelope(qr('new')))
    const hook = setup()
    act(() => hook.result.current.start())
    await advance(1100)
    hook.callback()
    expect(hook.result.current.view).toBe('expired')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    act(() => hook.result.current.start())
    await advance()
    expect(hook.result.current.session?.state).toBe('new')
  })

  it('明确 503 才退避重试同一 code/state，期间不接受新回调', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(envelope(qr())).mockResolvedValueOnce(envelope({}, 503, 100007)).mockResolvedValueOnce(envelope(binding))
    const hook = setup()
    act(() => hook.result.current.start())
    await advance()
    hook.callback()
    await advance()
    expect(hook.result.current.error).toBeTruthy()
    hook.callback()
    await advance(2000)
    expect(hook.onBinding).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[1][1]?.body).toBe(fetchMock.mock.calls[2][1]?.body)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it.each([500, 429])('结果不确定或限流 %s 时不自动重放授权码', async status => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(envelope(qr())).mockResolvedValueOnce(envelope({}, status, 100002))
    const hook = setup()
    act(() => hook.result.current.start())
    await advance()
    hook.callback()
    await advance(10000)
    expect(hook.result.current.view).toBe('error')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('缺失绑定票据时不进入无法提交的表单', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(envelope(qr())).mockResolvedValueOnce(envelope({ status: 'pending_binding', binding_required: true }))
    const hook = setup()
    act(() => hook.result.current.start())
    await advance()
    hook.callback()
    await advance()
    expect(hook.result.current.view).toBe('error')
    expect(hook.onBinding).not.toHaveBeenCalled()
    expect(getAccessToken()).toBeNull()
  })
})
