import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthTokens, getAccessToken, REFRESH_SESSION_KEY, saveAuthTokens, subscribeAuthTokenChanges } from '@/auth/token-storage'
import { refreshAuthSession } from '@/auth/refresh-coordinator'
import { requestPurchaseLogin } from './purchase-intent-slice'
import type { AuthResult } from '@/api/auth'
import { createAppStore } from './index'
import { hydrateAuth, invalidateAuth, loginWithEmail, loginWithPhone, logoutAuth, synchronizeAuthenticatedUser } from './auth-slice'

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
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse(authResult()))
    const appStore = createAppStore()

    await appStore.dispatch(loginWithPhone({ destination: '13800138000', code: '482915' })).unwrap()

    expect(new URL(String(fetchMock.mock.calls[0][0]), 'https://example.com').search).toBe('')
    expect(appStore.getState().auth).toMatchObject({ status: 'authenticated', user: { id: 'user-1' }, error: null })
    expect(getAccessToken()).toBe('access-token')
  })

  it('邀请手机号登录只在请求地址追加 invite_code', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse(authResult()))
    const appStore = createAppStore()

    await appStore.dispatch(loginWithPhone({ destination: '13800138000', code: '482915', inviteCode: 'invite/code' })).unwrap()

    const [url, options] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/auth/phone/login?invite_code=invite%2Fcode')
    expect(JSON.parse(String(options?.body))).toEqual({ destination: '13800138000', code: '482915' })
  })

  it('邮箱登录成功后保存令牌并进入 authenticated', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse(authResult()))
    const appStore = createAppStore()

    await appStore.dispatch(loginWithEmail({ destination: 'user@example.com', code: '482915' })).unwrap()

    expect(appStore.getState().auth).toMatchObject({ status: 'authenticated', user: { id: 'user-1' }, error: null })
    expect(getAccessToken()).toBe('access-token')
  })

  it('登录时把顶层 promt_required 首次登录标记同步到用户状态', async () => {
    const result = { ...authResult(), promt_required: true }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse(result))
    const appStore = createAppStore()

    await appStore.dispatch(loginWithPhone({ destination: '13800138000', code: '482915' })).unwrap()

    expect(appStore.getState().auth.user?.promt_required).toBe(true)
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

  it('刷新会话时保留顶层 promt_required 首次登录标记', async () => {
    window.localStorage.setItem(REFRESH_SESSION_KEY, JSON.stringify({ refreshToken: 'old-refresh', refreshExpiresAt: Date.UTC(2099, 1, 1) }))
    const refreshResult = { ...authResult('new-access', 'new-refresh'), promt_required: true }
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(apiResponse(refreshResult))
      .mockResolvedValueOnce(apiResponse(refreshResult.user))
    const appStore = createAppStore()

    await appStore.dispatch(hydrateAuth()).unwrap()

    expect(appStore.getState().auth.user?.promt_required).toBe(true)
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

    await expect(appStore.dispatch(loginWithPhone({ destination: '13800138000', code: '000000' })).unwrap()).rejects.toMatchObject({ message: '验证码错误', code: 110001 })
    expect(appStore.getState().auth).toMatchObject({ status: 'unauthenticated', error: { message: '验证码错误', code: 110001 } })
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

  it('keeps local session tokens when refresh service is unavailable', async () => {
    saveAuthTokens(authResult('old-access', 'refresh-token'))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse(null, 503, 120001, 'service unavailable'))
    const appStore = createAppStore()

    await expect(appStore.dispatch(hydrateAuth()).unwrap()).rejects.toMatchObject({ error: { status: 503 } })

    expect(appStore.getState().auth).toMatchObject({ status: 'authenticated', user: { id: 'user-1' }, error: null, hydrationError: { message: 'service unavailable', status: 503 } })
    expect(getAccessToken()).toBe('old-access')
    expect(window.localStorage.getItem(REFRESH_SESSION_KEY)).toContain('refresh-token')
  })

  it.each(['logout', 'switch-account'])('恢复登录的旧 /me 不能覆盖 %s 后的身份', async change => {
    saveAuthTokens(authResult('old-access', 'old-refresh'))
    let finishMe!: (response: Response) => void
    let startedMe!: () => void
    const meStarted = new Promise<void>(resolve => { startedMe = resolve })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      if (String(input).endsWith('/api/auth/refresh')) return apiResponse(authResult('refreshed-access', 'refreshed-refresh'))
      startedMe()
      return new Promise<Response>(resolve => { finishMe = resolve })
    })
    const appStore = createAppStore()
    const request = appStore.dispatch(hydrateAuth())
    await meStarted
    if (change === 'logout') {
      clearAuthTokens({ force: true })
      appStore.dispatch(invalidateAuth())
    } else {
      const next = authResult('next-access', 'next-refresh')
      next.user = { ...next.user!, id: 'user-2' }
      saveAuthTokens(next)
      appStore.dispatch(synchronizeAuthenticatedUser(next.user!))
    }
    finishMe(apiResponse(authResult().user))
    await request
    expect(appStore.getState().auth).toMatchObject(change === 'logout'
      ? { status: 'unauthenticated', user: null }
      : { status: 'authenticated', user: { id: 'user-2' } })
    expect(getAccessToken()).toBe(change === 'logout' ? null : 'next-access')
  })

  it('正常刷新广播不会阻止 /me 更新同账号资料', async () => {
    saveAuthTokens(authResult('old-access', 'old-refresh'))
    const appStore = createAppStore()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      if (String(input).endsWith('/api/auth/refresh')) return apiResponse(authResult('refreshed-access', 'refreshed-refresh'))
      appStore.dispatch(synchronizeAuthenticatedUser(authResult().user!))
      return apiResponse({ ...authResult().user, display_name: '最新昵称' })
    })
    await appStore.dispatch(hydrateAuth()).unwrap()
    expect(appStore.getState().auth.user?.display_name).toBe('最新昵称')
  })

  it('首次恢复503保留refresh token并允许原地重试恢复身份', async () => {
    window.localStorage.setItem(REFRESH_SESSION_KEY, JSON.stringify({ refreshToken: 'old-refresh', refreshExpiresAt: Date.UTC(2099, 1, 1) }))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(apiResponse(null, 503, 0, '恢复服务暂不可用'))
    const appStore = createAppStore()
    await appStore.dispatch(hydrateAuth())
    expect(appStore.getState().auth).toMatchObject({ status: 'restore-failed', user: null, hydrationError: { status: 503, message: '恢复服务暂不可用' } })
    expect(window.localStorage.getItem(REFRESH_SESSION_KEY)).toContain('old-refresh')
    fetchMock.mockResolvedValueOnce(apiResponse(authResult('new-access', 'new-refresh'))).mockResolvedValueOnce(apiResponse(authResult().user))
    await appStore.dispatch(hydrateAuth()).unwrap()
    expect(appStore.getState().auth).toMatchObject({ status: 'authenticated', user: { id: 'user-1' }, hydrationError: null })
  })

  it('refresh已成功而/me503时保持已验证的身份并保留错误重试入口', async () => {
    window.localStorage.setItem(REFRESH_SESSION_KEY, JSON.stringify({ refreshToken: 'old-refresh', refreshExpiresAt: Date.UTC(2099, 1, 1) }))
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(apiResponse(authResult('new-access', 'new-refresh'))).mockResolvedValueOnce(apiResponse(null, 503, 0, '资料暂不可用'))
    const appStore = createAppStore()
    await appStore.dispatch(hydrateAuth())
    expect(appStore.getState().auth).toMatchObject({ status: 'authenticated', user: { id: 'user-1' }, hydrationError: { message: '资料暂不可用' } })
    expect(getAccessToken()).toBe('new-access')
  })

  it.each([[200, 'next-user'], [503, 'next-user'], [200, 'user-1'], [503, 'user-1']])('退出迟到%s时不清除新登录%s，包括同账号重登', async (status, nextUserId) => {
    saveAuthTokens(authResult('old-access', 'old-refresh'))
    const appStore = createAppStore()
    appStore.dispatch(synchronizeAuthenticatedUser(authResult().user!))
    let finishLogout!: (result: Response) => void
    let markStarted!: () => void
    const started = new Promise<void>(resolve => { markStarted = resolve })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      if (String(input).endsWith('/logout')) { markStarted(); return new Promise<Response>(resolve => { finishLogout = resolve }) }
      return apiResponse({ ...authResult('next-access', 'next-refresh'), user: { ...authResult().user, id: nextUserId } })
    })
    const pending = appStore.dispatch(logoutAuth())
    await started
    appStore.dispatch(requestPurchaseLogin('new-plan'))
    await appStore.dispatch(loginWithPhone({ destination: '13800138000', code: '123456' })).unwrap()
    finishLogout(apiResponse({}, Number(status), status === 200 ? 0 : 120001, '退出结果'))
    expect(await pending.unwrap()).toBe(false)
    expect(getAccessToken()).toBe('next-access')
    expect(window.localStorage.getItem(REFRESH_SESSION_KEY)).toContain('next-refresh')
    expect(appStore.getState().auth).toMatchObject({ status: 'authenticated', user: { id: nextUserId }, error: null })
    expect(appStore.getState().purchaseIntent.resume).toEqual({ planID: 'new-plan', userID: nextUserId })
  })

  it('自动刷新先占锁时，随后点击退出仍使用轮换后的令牌成功退出', async () => {
    saveAuthTokens(authResult('old-access', 'old-refresh'))
    const appStore = createAppStore()
    appStore.dispatch(synchronizeAuthenticatedUser(authResult().user!))
    let finishRefresh!: (result: Response) => void
    let markStarted!: () => void
    const started = new Promise<void>(resolve => { markStarted = resolve })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      if (String(input).endsWith('/refresh')) { markStarted(); return new Promise<Response>(resolve => { finishRefresh = resolve }) }
      return apiResponse({})
    })
    // 验证刷新广播不会废弃退出的 Redux 提交；signed-out 留给 thunk 完成，额外覆盖无路由订阅情形。
    const unsubscribe = subscribeAuthTokenChanges(change => {
      if (change.user) appStore.dispatch(synchronizeAuthenticatedUser(change.user, change.isRefresh === true))
    })
    try {
      const refreshing = refreshAuthSession('old-refresh')
      await started
      const pending = appStore.dispatch(logoutAuth())
      finishRefresh(apiResponse(authResult('rotated-access', 'rotated-refresh')))
      await refreshing
      expect(await pending.unwrap()).toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(String(fetchMock.mock.calls[1][0])).toContain('/api/auth/logout')
      expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer rotated-access')
      expect(getAccessToken()).toBeNull()
      expect(window.localStorage.getItem(REFRESH_SESSION_KEY)).toBeNull()
      expect(appStore.getState().auth).toMatchObject({ status: 'unauthenticated', user: null })
    } finally { unsubscribe() }
  })
})
