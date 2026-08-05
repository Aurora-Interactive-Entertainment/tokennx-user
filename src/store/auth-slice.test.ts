import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthTokens, getAccessToken, REFRESH_SESSION_KEY, saveAuthTokens } from '@/auth/token-storage'
import type { AuthResult } from '@/api/auth'
import { createAppStore } from './index'
import { hydrateAuth, loginWithEmail, loginWithPhone, logoutAuth } from './auth-slice'

function apiResponse(data: unknown, status = 200, code = 0, msg = 'success'): Response {
  return new Response(JSON.stringify({ code, msg, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function authResult(accessToken = 'access-token', refreshToken = 'refresh-token'): AuthResult {
  return {
    status: 'succeeded',
    binding_required: false,
    access_token: accessToken,
    refresh_token: refreshToken,
    access_expires_at: Date.UTC(2099, 0, 1, 0, 15),
    refresh_expires_at: Date.UTC(2099, 1, 1),
    user: {
      id: 'user-1',
      display_name: '测试用户',
      avatar_url: '',
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      status: 'active',
    },
  }
}

describe('认证 Redux 状态', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    clearAuthTokens()
  })

  it('没有 refresh token 时启动为未认证状态且不请求后端', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const appStore = createAppStore()

    await appStore.dispatch(hydrateAuth())

    expect(appStore.getState().auth).toMatchObject({ status: 'unauthenticated', user: null, error: null })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('手机号登录成功后保存令牌并进入 authenticated', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse(authResult()))
    const appStore = createAppStore()

    await appStore.dispatch(loginWithPhone({ destination: '13800138000', code: '482915' })).unwrap()

    expect(appStore.getState().auth).toMatchObject({ status: 'authenticated', user: { id: 'user-1' }, error: null })
    expect(getAccessToken()).toBe('access-token')
  })

  it('邮箱登录成功后保存令牌并进入 authenticated', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse(authResult()))
    const appStore = createAppStore()

    await appStore.dispatch(loginWithEmail({ destination: 'user@example.com', code: '482915' })).unwrap()

    expect(appStore.getState().auth).toMatchObject({ status: 'authenticated', user: { id: 'user-1' }, error: null })
    expect(getAccessToken()).toBe('access-token')
  })

  it('启动时轮换 refresh token 后用 access token 请求当前用户', async () => {
    window.localStorage.setItem(REFRESH_SESSION_KEY, JSON.stringify({ refreshToken: 'old-refresh', refreshExpiresAt: Date.UTC(2099, 1, 1) }))
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(apiResponse(authResult('new-access', 'new-refresh')))
      .mockResolvedValueOnce(apiResponse({ ...authResult('new-access', 'new-refresh').user, display_name: '刷新后的用户' }))
    const appStore = createAppStore()

    await appStore.dispatch(hydrateAuth()).unwrap()

    expect(appStore.getState().auth).toMatchObject({ status: 'authenticated', user: { display_name: '刷新后的用户' } })
    expect(getAccessToken()).toBe('new-access')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ refresh_token: 'old-refresh' })
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer new-access')
  })

  it('refresh 失败时清理持久化会话并回到未认证状态', async () => {
    window.localStorage.setItem(REFRESH_SESSION_KEY, JSON.stringify({ refreshToken: 'invalid-refresh', refreshExpiresAt: Date.UTC(2099, 1, 1) }))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse(null, 401, 110001, '认证信息无效'))
    const appStore = createAppStore()

    await appStore.dispatch(hydrateAuth()).unwrap()

    expect(appStore.getState().auth).toMatchObject({ status: 'unauthenticated', user: null, error: null })
    expect(window.localStorage.getItem(REFRESH_SESSION_KEY)).toBeNull()
  })

  it('登录业务错误会保留可展示的后端错误信息', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse(null, 401, 110001, '验证码错误'))
    const appStore = createAppStore()

    await expect(appStore.dispatch(loginWithPhone({ destination: '13800138000', code: '000000' })).unwrap()).rejects.toMatchObject({ message: '邮箱、手机号或验证码错误，请重新确认', code: 110001 })
    expect(appStore.getState().auth).toMatchObject({ status: 'unauthenticated', error: { message: '邮箱、手机号或验证码错误，请重新确认', code: 110001 } })
  })

  it('退出登录即使服务端失败也会清理本地令牌', async () => {
    saveAuthTokens(authResult())
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    const appStore = createAppStore()

    await expect(appStore.dispatch(logoutAuth()).unwrap()).rejects.toMatchObject({ message: '网络连接失败，请检查服务地址和网络状态' })

    expect(getAccessToken()).toBeNull()
    expect(window.localStorage.getItem(REFRESH_SESSION_KEY)).toBeNull()
    expect(appStore.getState().auth.status).toBe('unauthenticated')
  })
})
