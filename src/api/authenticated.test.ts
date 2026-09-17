import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResult } from './auth'
import { getUserProfile } from './profile'
import { fetchAuthenticatedJson, fetchAuthenticatedResponse } from './authenticated'
import { clearAuthTokens, getAccessToken, readRefreshToken, REFRESH_SESSION_KEY, saveAuthTokens } from '@/auth/token-storage'
import { isAuthenticationFailure } from './http'

function apiResponse(data: unknown, status = 200, code = 0, msg = 'success'): Response {
  return new Response(JSON.stringify({ code, msg, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function authResult(accessToken: string, refreshToken: string): AuthResult {
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

const PROFILE = {
  id: 'user-1',
  display_name: '测试用户',
  avatar_url: '',
  locale: 'zh-CN',
  timezone: 'Asia/Shanghai',
  status: 'active',
  version: 1,
  phone: { bound: false, masked_identifier: '' },
  email: { bound: true, masked_identifier: 'u***@example.com' },
}

describe('已认证请求封装', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    window.sessionStorage.clear()
    clearAuthTokens({ force: true, broadcast: false })
  })

	it('个人中心请求认证失败后刷新令牌并重试原请求', async () => {
    saveAuthTokens(authResult('expired-access', 'refresh-token'))
    let profileAttempts = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      const url = String(input)
      if (url.endsWith('/api/user/profile')) {
        profileAttempts += 1
        if (profileAttempts === 1) return apiResponse(null, 401, 110001, '认证信息无效')
        return apiResponse(PROFILE)
      }
      if (url.endsWith('/api/auth/refresh')) return apiResponse(authResult('fresh-access', 'rotated-refresh'))
      throw new Error(`unexpected request: ${url}`)
	})

   await expect(getUserProfile('expired-access')).resolves.toEqual(PROFILE)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer expired-access')
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ refresh_token: 'refresh-token' })
    expect(new Headers(fetchMock.mock.calls[2][1]?.headers).get('Authorization')).toBe('Bearer fresh-access')
   expect(getAccessToken()).toBe('fresh-access')
   expect(JSON.parse(String(window.localStorage.getItem(REFRESH_SESSION_KEY)))).toMatchObject({ refreshToken: 'rotated-refresh' })
 })

  it('二进制请求认证失败后刷新令牌并重试下载', async () => {
    saveAuthTokens(authResult('expired-access', 'refresh-token'))
    let downloadAttempts = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/user/billing/invoices/file-1/download')) {
        downloadAttempts += 1
        if (downloadAttempts === 1) return apiResponse(null, 401, 110001, '认证信息无效')
        return new Response('invoice-bytes', { status: 200, headers: { 'Content-Type': 'application/pdf' } })
      }
      if (url.endsWith('/api/auth/refresh')) return apiResponse(authResult('fresh-access', 'rotated-refresh'))
      throw new Error(`unexpected request: ${url}`)
    })

    const response = await fetchAuthenticatedResponse('/api/user/billing/invoices/file-1/download')
    expect(await response.text()).toBe('invoice-bytes')
    expect(downloadAttempts).toBe(2)
    expect(new Headers(fetchMock.mock.calls[2]?.[1]?.headers).get('Authorization')).toBe('Bearer fresh-access')
  })

  it('刷新令牌失败后清理本地会话并抛出原始认证错误', async () => {
    saveAuthTokens(authResult('expired-access', 'invalid-refresh'))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/user/profile') || url.endsWith('/api/auth/refresh')) return apiResponse(null, 401, 110001, '认证信息无效')
      throw new Error(`unexpected request: ${url}`)
    })

    await expect(getUserProfile('expired-access')).rejects.toMatchObject({ status: 401, code: 110001, message: '认证信息无效' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(getAccessToken()).toBeNull()
    expect(window.localStorage.getItem(REFRESH_SESSION_KEY)).toBeNull()
  })

  it('刷新成功但重试发生网络错误时保留新会话', async () => {
    saveAuthTokens(authResult('expired-access', 'refresh-token'))
    let profileAttempts = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/user/profile')) {
        profileAttempts += 1
        if (profileAttempts === 1) return apiResponse(null, 401, 110001, '认证信息无效')
        throw new Error('offline')
      }
      if (url.endsWith('/api/auth/refresh')) return apiResponse(authResult('fresh-access', 'rotated-refresh'))
      throw new Error(`unexpected request: ${url}`)
    })

    await expect(getUserProfile('expired-access')).rejects.toMatchObject({ status: 0, message: '网络连接失败，请检查服务地址和网络状态' })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(getAccessToken()).toBe('fresh-access')
    expect(window.localStorage.getItem(REFRESH_SESSION_KEY)).toContain('rotated-refresh')
  })

  it('并发请求认证失败时共享一次刷新令牌请求', async () => {
    saveAuthTokens(authResult('expired-access', 'refresh-token'))
    let profileAttempts = 0
    let refreshAttempts = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/user/profile')) {
        profileAttempts += 1
        if (profileAttempts <= 2) return apiResponse(null, 401, 110001, '认证信息无效')
        return apiResponse(PROFILE)
      }
      if (url.endsWith('/api/auth/refresh')) {
        refreshAttempts += 1
        return apiResponse(authResult('fresh-access', 'rotated-refresh'))
      }
      throw new Error(`unexpected request: ${url}`)
    })

    await expect(Promise.all([getUserProfile('expired-access'), getUserProfile('expired-access')])).resolves.toEqual([PROFILE, PROFILE])

    expect(refreshAttempts).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('请求失败时优先使用其他标签页同步的新 access token', async () => {
    saveAuthTokens(authResult('old-access', 'old-refresh'))
    let profileAttempts = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/user/profile')) {
        profileAttempts += 1
        if (profileAttempts === 1) {
          saveAuthTokens(authResult('synced-access', 'synced-refresh'), { expectedRefreshToken: 'old-refresh' })
          return apiResponse(null, 401, 110001, '认证信息无效')
        }
        return apiResponse(PROFILE)
      }
      throw new Error(`unexpected request: ${url}`)
    })

    await expect(getUserProfile('old-access')).resolves.toEqual(PROFILE)

    expect(profileAttempts).toBe(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer synced-access')
  })

  it('does not refresh or clear the session for a non-401 API error', async () => {
    saveAuthTokens(authResult('access-token', 'refresh-token'))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/user/profile')) return apiResponse(null, 400, 110001, 'invalid input')
      throw new Error(`unexpected request: ${url}`)
    })

    await expect(getUserProfile('access-token')).rejects.toMatchObject({ status: 400, code: 110001 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getAccessToken()).toBe('access-token')
    expect(window.localStorage.getItem(REFRESH_SESSION_KEY)).toContain('refresh-token')
  })

  it('keeps the session when the refresh endpoint itself returns a non-401 error', async () => {
    saveAuthTokens(authResult('expired-access', 'refresh-token'))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/user/profile')) return apiResponse(null, 401, 110001, 'unauthorized')
      if (url.endsWith('/api/auth/refresh')) return apiResponse(null, 503, 120001, 'service unavailable')
      throw new Error(`unexpected request: ${url}`)
    })

    await expect(getUserProfile('expired-access')).rejects.toMatchObject({ status: 503, code: 120001 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(getAccessToken()).toBe('expired-access')
    expect(window.localStorage.getItem(REFRESH_SESSION_KEY)).toContain('refresh-token')
  })

  it('请求已取消时不继续刷新令牌或重试原请求', async () => {
    saveAuthTokens(authResult('expired-access', 'refresh-token'))
    const controller = new AbortController()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/user/profile')) {
        controller.abort()
        return apiResponse(null, 401, 110001, '认证信息无效')
      }
      throw new Error(`unexpected request: ${url}`)
    })

    await expect(fetchAuthenticatedResponse('/api/user/profile', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('等待 401 期间切换账号时不把写入重放到新账号，也不清除新登录', async () => {
    saveAuthTokens(authResult('account-a-access', 'account-a-refresh'))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const next = authResult('account-b-access', 'account-b-refresh')
      next.user = { ...next.user!, id: 'user-2' }
      saveAuthTokens(next)
      return apiResponse(null, 401, 160001, '认证信息无效')
    })
    await expect(fetchAuthenticatedResponse('/api/user/profile/nickname', { method: 'PUT', body: { display_name: '账号 A 的昵称' } })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(getAccessToken()).toBe('account-b-access')
  })

  it('显式传入旧账号令牌时也不能使用当前新账号自动重试', async () => {
    saveAuthTokens(authResult('account-a-access', 'account-a-refresh'))
    const next = authResult('account-b-access', 'account-b-refresh')
    next.user = { ...next.user!, id: 'user-2' }
    saveAuthTokens(next)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse(null, 401, 160001, '认证信息无效'))
    await expect(getUserProfile('account-a-access')).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(getAccessToken()).toBe('account-b-access')
  })

  it('同账号刷新响应省略用户资料时仍可正常重试', async () => {
    saveAuthTokens(authResult('old-access', 'old-refresh'))
    const refresh = authResult('new-access', 'new-refresh')
    delete refresh.user
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(apiResponse(null, 401, 160001, '认证信息无效'))
      .mockResolvedValueOnce(apiResponse(refresh))
      .mockResolvedValueOnce(apiResponse(PROFILE))
    await expect(getUserProfile('old-access')).resolves.toEqual(PROFILE)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(getAccessToken()).toBe('new-access')
  })

  it('刷新成功后业务接口仍返回 401 时保留长期会话，并阻止页面误判退出', async () => {
    saveAuthTokens(authResult('old-access', 'old-refresh'))
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(apiResponse(null, 401, 160001, '访问令牌已过期'))
      .mockResolvedValueOnce(apiResponse(authResult('new-access', 'new-refresh')))
      .mockResolvedValueOnce(apiResponse(null, 401, 170099, '当前接口暂不接受该凭证'))
    const error: unknown = await getUserProfile('old-access').catch(error => error)
    expect(error).toMatchObject({ status: 401, code: 170099, message: '当前接口暂不接受该凭证', apiMessage: '当前接口暂不接受该凭证' })
    expect(isAuthenticationFailure(error)).toBe(false)
    expect(readRefreshToken()).toBe('new-refresh')
    expect(getAccessToken()).toBe('new-access')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  function storeRefreshOnly(): void {
    window.localStorage.setItem(REFRESH_SESSION_KEY, JSON.stringify({
      refreshToken: 'stored-refresh', refreshExpiresAt: Date.UTC(2099, 1, 1),
      revision: { timestamp: Date.now(), writerId: 'stored-tab' }, sessionId: 'stored-session',
    }))
  }

  it('页面恢复时只有 refresh token 也会先恢复访问令牌，再发送原请求', async () => {
    storeRefreshOnly()
    const refresh = authResult('new-access', 'new-refresh')
    delete refresh.user
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(apiResponse(refresh))
      .mockResolvedValueOnce(apiResponse(PROFILE))
    await expect(fetchAuthenticatedJson('/api/auth/me')).resolves.toEqual(PROFILE)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/auth/refresh')
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer new-access')
    expect(readRefreshToken()).toBe('new-refresh')
  })

  it('无访问令牌时的恢复服务异常保留长期会话，不发原业务请求', async () => {
    storeRefreshOnly()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse(null, 503, 120001, '暂时不可用'))
    await expect(fetchAuthenticatedJson('/api/auth/me')).rejects.toMatchObject({ status: 503 })
    expect(readRefreshToken()).toBe('stored-refresh')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('无访问令牌时刷新端明确返回 401 才删除对应长期会话', async () => {
    storeRefreshOnly()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse(null, 401, 160001, '会话已被撤销'))
    const error: unknown = await fetchAuthenticatedJson('/api/auth/me').catch(error => error)
    expect(error).toMatchObject({ status: 401 })
    expect(isAuthenticationFailure(error)).toBe(true)
    expect(readRefreshToken()).toBeNull()
  })

  it('从 refresh 恢复成功后的首次业务 401 不会连续刷新或要求重新登录', async () => {
    storeRefreshOnly()
    const refresh = authResult('new-access', 'new-refresh')
    delete refresh.user
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(apiResponse(refresh))
      .mockResolvedValueOnce(apiResponse(null, 401, 170099, '资料服务拒绝访问'))
    const error: unknown = await fetchAuthenticatedJson('/api/auth/me').catch(error => error)
    expect(error).toMatchObject({ status: 401, code: 170099, message: '资料服务拒绝访问' })
    expect(isAuthenticationFailure(error)).toBe(false)
    expect(readRefreshToken()).toBe('new-refresh')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('显式传入归属未知的旧令牌时，不能拿当前会话续期和重放', async () => {
    saveAuthTokens(authResult('current-access', 'current-refresh'))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse(null, 401, 160001, '凭证无效'))
    await expect(getUserProfile('unknown-access')).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(readRefreshToken()).toBe('current-refresh')
  })

  it('同账号主动重新登录也会作废之前会话的续期重试', async () => {
    saveAuthTokens(authResult('old-access', 'old-refresh'))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      saveAuthTokens(authResult('login-access', 'login-refresh'))
      return apiResponse(null, 401, 160001, '凭证无效')
    })
    await expect(getUserProfile('old-access')).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(readRefreshToken()).toBe('login-refresh')
  })
})
