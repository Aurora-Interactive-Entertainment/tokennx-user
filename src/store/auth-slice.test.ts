import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_SYNC_STORAGE_KEY, clearAuthTokens, getAccessToken, getAccessTokenUserId, getAuthSessionSnapshot, readRefreshToken, REFRESH_SESSION_KEY, saveAuthTokens, subscribeAuthTokenChanges } from '@/auth/token-storage'
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

function announceRemoteRefresh(accessToken: string, refreshToken: string, user?: AuthResult['user']): void {
  const current = getAuthSessionSnapshot()!
  window.dispatchEvent(new StorageEvent('storage', { key: AUTH_SYNC_STORAGE_KEY, newValue: JSON.stringify({
    type: 'session-updated', eventId: `hydrate-remote:${accessToken}`, isRefresh: true,
    sessionId: current.sessionId, revision: { timestamp: current.revision.timestamp + 1, writerId: 'hydrate-remote' },
    accessToken, refreshToken, refreshExpiresAt: Date.UTC(2099, 1, 1), user,
  }) }))
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

  it('页面重建和再次恢复复用有效 access，不反复轮换三十天 refresh', async () => {
    saveAuthTokens(authResult('existing-access', 'existing-refresh'))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      expect(String(input)).toContain('/api/auth/me')
      return apiResponse({ ...authResult().user, display_name: '最新资料' })
    })

    for (let reload = 0; reload < 2; reload += 1) {
      const appStore = createAppStore()
      await appStore.dispatch(hydrateAuth()).unwrap()
      expect(appStore.getState().auth).toMatchObject({ status: 'authenticated', user: { display_name: '最新资料' } })
    }

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(getAccessToken()).toBe('existing-access')
    expect(readRefreshToken()).toBe('existing-refresh')
  })

  it('refresh 响应省略 user 时仍通过 /me 恢复身份及访问令牌归属', async () => {
    window.localStorage.setItem(REFRESH_SESSION_KEY, JSON.stringify({ refreshToken: 'old-refresh', refreshExpiresAt: Date.UTC(2099, 1, 1) }))
    const refreshResult = { ...authResult('no-user-access', 'no-user-refresh'), user: undefined, promt_required: true }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(apiResponse(refreshResult))
      .mockResolvedValueOnce(apiResponse(authResult().user))
    const appStore = createAppStore()

    await appStore.dispatch(hydrateAuth()).unwrap()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(appStore.getState().auth).toMatchObject({ status: 'authenticated', user: { id: 'user-1', promt_required: true } })
    expect(getAccessTokenUserId('no-user-access')).toBe('user-1')
    expect(readRefreshToken()).toBe('no-user-refresh')
  })

  it('已有 access 的 /me 返回 401 时统一续期一次并恢复资料', async () => {
    saveAuthTokens(authResult('old-access', 'old-refresh'))
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(apiResponse(null, 401, 100004, '访问令牌过期'))
      .mockResolvedValueOnce(apiResponse(authResult('new-access', 'new-refresh')))
      .mockResolvedValueOnce(apiResponse({ ...authResult().user, display_name: '续期后的资料' }))
    const appStore = createAppStore()

    await appStore.dispatch(hydrateAuth()).unwrap()

    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input), 'https://example.com').pathname)).toEqual(['/api/auth/me', '/api/auth/refresh', '/api/auth/me'])
    expect(appStore.getState().auth).toMatchObject({ status: 'authenticated', user: { display_name: '续期后的资料' } })
    expect(readRefreshToken()).toBe('new-refresh')
  })

  it('refresh 成功后 /me 仍返回 401 时保留会话和已验证身份供重试', async () => {
    saveAuthTokens(authResult('old-access', 'old-refresh'))
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(apiResponse(null, 401, 100004, '访问令牌过期'))
      .mockResolvedValueOnce(apiResponse(authResult('new-access', 'new-refresh')))
      .mockResolvedValueOnce(apiResponse(null, 401, 100004, '资料服务认证暂不可用'))
    const appStore = createAppStore()

    await expect(appStore.dispatch(hydrateAuth()).unwrap()).rejects.toMatchObject({ error: { status: 401 } })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(appStore.getState().auth).toMatchObject({ status: 'authenticated', user: { id: 'user-1' }, hydrationError: { message: '资料服务认证暂不可用', status: 401 } })
    expect(getAccessToken()).toBe('new-access')
    expect(readRefreshToken()).toBe('new-refresh')
    fetchMock.mockResolvedValueOnce(apiResponse(authResult().user))
    await appStore.dispatch(hydrateAuth()).unwrap()
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(appStore.getState().auth.hydrationError).toBeNull()
  })

  it('refresh 无 user 且 /me 暂时失败时保留长期会话，重试成功后再展示受保护身份', async () => {
    window.localStorage.setItem(REFRESH_SESSION_KEY, JSON.stringify({ refreshToken: 'old-refresh', refreshExpiresAt: Date.UTC(2099, 1, 1) }))
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(apiResponse({ ...authResult('unverified-access', 'unverified-refresh'), user: undefined }))
      .mockResolvedValueOnce(apiResponse(null, 503, 120001, '资料暂不可用'))
    const appStore = createAppStore()

    await appStore.dispatch(hydrateAuth())

    expect(appStore.getState().auth).toMatchObject({ status: 'restore-failed', user: null, hydrationError: { status: 503 } })
    expect(readRefreshToken()).toBe('unverified-refresh')
    expect(getAccessTokenUserId('unverified-access')).toBeUndefined()
    fetchMock.mockResolvedValueOnce(apiResponse(authResult().user))
    await appStore.dispatch(hydrateAuth()).unwrap()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(appStore.getState().auth).toMatchObject({ status: 'authenticated', user: { id: 'user-1' }, hydrationError: null })
    expect(getAccessTokenUserId('unverified-access')).toBe('user-1')
  })

  it.each([false, true])('/me 等待期间跨标签轮换带用户=%s 时采用最新身份，未带用户仅补查新 access', async knownUser => {
    window.localStorage.setItem(REFRESH_SESSION_KEY, JSON.stringify({ refreshToken: 'cold-refresh', refreshExpiresAt: Date.UTC(2099, 1, 1) }))
    const firstAccess = `cold-first-access-${knownUser}`
    const remoteAccess = `cold-remote-access-${knownUser}`
    const latestUser = { ...authResult().user!, display_name: '最新已验证资料' }
    let finishMe!: (response: Response) => void
    let markStarted!: () => void
    const started = new Promise<void>(resolve => { markStarted = resolve })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (String(input).endsWith('/refresh')) return apiResponse({ ...authResult(firstAccess, 'first-refresh'), user: undefined })
      if (new Headers(options?.headers).get('Authorization') === `Bearer ${firstAccess}`) {
        markStarted()
        return new Promise<Response>(resolve => { finishMe = resolve })
      }
      expect(new Headers(options?.headers).get('Authorization')).toBe(`Bearer ${remoteAccess}`)
      return apiResponse(latestUser)
    })
    const appStore = createAppStore()
    const hydration = appStore.dispatch(hydrateAuth())
    await started

    announceRemoteRefresh(remoteAccess, 'remote-refresh', knownUser ? latestUser : undefined)
    finishMe(apiResponse({ ...authResult().user, display_name: '迟到的旧资料' }))
    await hydration.unwrap()

    expect(appStore.getState().auth).toMatchObject({ status: 'authenticated', user: latestUser, hydrationError: null })
    expect(getAuthSessionSnapshot()?.user).toEqual(latestUser)
    expect(getAccessToken()).toBe(remoteAccess)
    expect(fetchMock).toHaveBeenCalledTimes(knownUser ? 2 : 3)
  })

  it('跨标签持续轮换且未带用户时最多补查一次，不无限追逐新访问令牌', async () => {
    saveAuthTokens({ ...authResult('bounded-first-access', 'bounded-first-refresh'), user: undefined })
    let requests = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      requests += 1
      announceRemoteRefresh(`bounded-remote-access-${requests}`, `bounded-remote-refresh-${requests}`)
      return apiResponse(authResult().user)
    })
    const appStore = createAppStore()

    await expect(appStore.dispatch(hydrateAuth()).unwrap()).rejects.toBe('session-changed')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(readRefreshToken()).toBe('bounded-remote-refresh-2')
    expect(getAuthSessionSnapshot()?.user).toBeUndefined()
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

  it('已有访问令牌而资料服务暂不可用时保留已验证身份和会话', async () => {
    saveAuthTokens(authResult('old-access', 'refresh-token'))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse(null, 503, 120001, 'service unavailable'))
    const appStore = createAppStore()

    await expect(appStore.dispatch(hydrateAuth()).unwrap()).rejects.toMatchObject({ error: { status: 503 } })

    expect(appStore.getState().auth).toMatchObject({ status: 'authenticated', user: { id: 'user-1' }, error: null, hydrationError: { message: 'service unavailable', status: 503 } })
    expect(getAccessToken()).toBe('old-access')
    expect(window.localStorage.getItem(REFRESH_SESSION_KEY)).toContain('refresh-token')
  })

  it.each(['logout', 'switch-account', 'same-account-login'])('恢复登录的旧 /me 不能覆盖 %s 后的身份', async change => {
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
      next.user = { ...next.user!, id: change === 'same-account-login' ? 'user-1' : 'user-2', display_name: '新登录资料' }
      saveAuthTokens(next)
      appStore.dispatch(synchronizeAuthenticatedUser(next.user!))
    }
    finishMe(apiResponse(authResult().user))
    await request
    expect(appStore.getState().auth).toMatchObject(change === 'logout'
      ? { status: 'unauthenticated', user: null }
      : { status: 'authenticated', user: { id: change === 'same-account-login' ? 'user-1' : 'user-2', display_name: '新登录资料' } })
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
