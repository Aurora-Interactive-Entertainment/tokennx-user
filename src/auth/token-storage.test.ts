import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResult } from '@/api/auth'
import {
  AUTH_SYNC_STORAGE_KEY,
  DEVICE_ID_KEY,
  REFRESH_SESSION_KEY,
  clearAuthTokens,
  getAccessToken,
  getDeviceId,
  getDeviceName,
  readRefreshToken,
  saveAuthTokens,
  subscribeAuthTokenChanges,
} from './token-storage'

function authResult(overrides: Partial<AuthResult> = {}): AuthResult {
  return {
    status: 'succeeded',
    binding_required: false,
    access_token: 'access-token',
    refresh_token: 'refresh-token',
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
    ...overrides,
  }
}

describe('认证令牌存储', () => {
  beforeEach(() => {
    window.localStorage.clear()
    clearAuthTokens()
  })

  it('只把 refresh token 写入 localStorage，access token 保留在内存', () => {
    saveAuthTokens(authResult())

    expect(getAccessToken()).toBe('access-token')
    expect(readRefreshToken()).toBe('refresh-token')
    expect(JSON.parse(String(window.localStorage.getItem(REFRESH_SESSION_KEY)))).toMatchObject({
      refreshToken: 'refresh-token',
      refreshExpiresAt: Date.UTC(2099, 1, 1),
    })
    expect(JSON.parse(String(window.localStorage.getItem(REFRESH_SESSION_KEY))).revision).toMatchObject({ writerId: expect.any(String) })
  })

  it('过期或损坏的 refresh session 会被清理', () => {
    window.localStorage.setItem(
      REFRESH_SESSION_KEY,
      JSON.stringify({
        refreshToken: 'expired',
        refreshExpiresAt: Date.UTC(2000, 0, 1),
      })
    )
    expect(readRefreshToken()).toBeNull()
    expect(window.localStorage.getItem(REFRESH_SESSION_KEY)).toBeNull()

    window.localStorage.setItem(REFRESH_SESSION_KEY, '{bad json')
    expect(readRefreshToken()).toBeNull()
    expect(window.localStorage.getItem(REFRESH_SESSION_KEY)).toBeNull()
  })

  it('读取旧版 ISO 过期时间后迁移为 Unix 毫秒时间戳', () => {
    window.localStorage.setItem(
      REFRESH_SESSION_KEY,
      JSON.stringify({
        refreshToken: 'legacy-refresh',
        refreshExpiresAt: '2099-02-01T00:00:00Z',
      })
    )

    expect(readRefreshToken()).toBe('legacy-refresh')
    expect(JSON.parse(String(window.localStorage.getItem(REFRESH_SESSION_KEY)))).toMatchObject({
      refreshToken: 'legacy-refresh',
      refreshExpiresAt: Date.UTC(2099, 1, 1),
    })
    expect(JSON.parse(String(window.localStorage.getItem(REFRESH_SESSION_KEY))).revision).toEqual({ timestamp: 0, writerId: '' })
  })

  it('清理认证时同时清除内存 access token 和持久化 refresh token', () => {
    saveAuthTokens(authResult())
    clearAuthTokens()

    expect(getAccessToken()).toBeNull()
    expect(readRefreshToken()).toBeNull()
  })

  it('旧标签页按旧 refresh token 清理时保留新会话', () => {
    saveAuthTokens(authResult({ access_token: 'old-access', refresh_token: 'old-refresh' }))
    window.localStorage.setItem(
      REFRESH_SESSION_KEY,
      JSON.stringify({
        refreshToken: 'new-refresh',
        refreshExpiresAt: Date.UTC(2099, 1, 1),
        revision: { timestamp: Date.now() + 1, writerId: 'other-tab' },
      })
    )

    clearAuthTokens({ expectedRefreshToken: 'old-refresh' })

    expect(getAccessToken()).toBeNull()
    expect(readRefreshToken()).toBe('new-refresh')
  })

  it('旧标签页清理失败时不清除已经同步的新 access token', () => {
    saveAuthTokens(authResult({ access_token: 'old-access', refresh_token: 'old-refresh' }))
    saveAuthTokens(authResult({ access_token: 'new-access', refresh_token: 'new-refresh' }))

    clearAuthTokens({ expectedRefreshToken: 'old-refresh' })

    expect(getAccessToken()).toBe('new-access')
    expect(readRefreshToken()).toBe('new-refresh')
  })

  it('远程刷新事件同步 access token 和用户状态', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeAuthTokenChanges(listener)
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: AUTH_SYNC_STORAGE_KEY,
        newValue: JSON.stringify({
          type: 'session-updated',
          eventId: 'other-tab:1',
          revision: { timestamp: Date.now() + 10, writerId: 'other-tab' },
          accessToken: 'remote-access',
          refreshToken: 'remote-refresh',
          refreshExpiresAt: Date.UTC(2099, 1, 1),
          user: authResult().user,
        }),
      })
    )

    expect(getAccessToken()).toBe('remote-access')
    expect(readRefreshToken()).toBe('remote-refresh')
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('缺少必要令牌时拒绝保存', () => {
    expect(() => saveAuthTokens(authResult({ access_token: undefined }))).toThrow('认证响应缺少有效令牌')
    expect(() => saveAuthTokens(authResult({ refresh_token: undefined }))).toThrow('认证响应缺少有效令牌')
    expect(() => saveAuthTokens(authResult({ refresh_expires_at: undefined }))).toThrow('认证响应缺少有效令牌')
    expect(getAccessToken()).toBeNull()
  })

  it('为当前浏览器生成并复用设备标识', () => {
    const first = getDeviceId()
    const second = getDeviceId()

    expect(first).toBe(second)
    expect(first).toBe(window.localStorage.getItem(DEVICE_ID_KEY))
    expect(getDeviceName()).toBeTypeOf('string')
  })
})
