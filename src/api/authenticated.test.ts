import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResult } from './auth'
import { getUserProfile } from './profile'
import { fetchAuthenticatedResponse } from './authenticated'
import { clearAuthTokens, getAccessToken, REFRESH_SESSION_KEY, saveAuthTokens } from '@/auth/token-storage'

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
    clearAuthTokens()
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
          saveAuthTokens(authResult('synced-access', 'synced-refresh'))
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
})
