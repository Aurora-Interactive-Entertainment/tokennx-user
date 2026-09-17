import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResult } from '@/api/auth'
import {
  AUTH_SYNC_STORAGE_KEY,
  AUTH_SIGN_OUT_REVISION_KEY,
  DEVICE_ID_KEY,
  REFRESH_SESSION_KEY,
  VERIFIED_PHONE_KEY,
  clearAuthTokens,
  getAccessToken,
  getAuthSessionSnapshot,
  getVerifiedPhone,
  getDeviceId,
  getDeviceName,
  readRefreshToken,
  saveAuthTokens,
  saveVerifiedPhone,
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
    window.sessionStorage.clear()
    clearAuthTokens()
  })

  it('only exposes the verified phone to the same user and clears it on sign-out', () => {
    saveAuthTokens(authResult())
    saveVerifiedPhone('user-1', '138 0013 8000')

    expect(getVerifiedPhone('user-1')).toBe('13800138000')
    expect(getVerifiedPhone('user-2')).toBeNull()
    expect(window.localStorage.getItem(VERIFIED_PHONE_KEY)).not.toBeNull()
    expect(window.sessionStorage.getItem(VERIFIED_PHONE_KEY)).toBeNull()

    clearAuthTokens()
    expect(getVerifiedPhone('user-1')).toBeNull()
    expect(window.localStorage.getItem(VERIFIED_PHONE_KEY)).toBeNull()
  })

  it('兼容旧标签页的临时手机号并迁移到跨标签页缓存', () => {
    window.sessionStorage.setItem(VERIFIED_PHONE_KEY, JSON.stringify({ userId: 'user-1', phone: '13800138000' }))

    expect(getVerifiedPhone('user-1')).toBe('13800138000')
    expect(window.localStorage.getItem(VERIFIED_PHONE_KEY)).not.toBeNull()
    expect(window.sessionStorage.getItem(VERIFIED_PHONE_KEY)).toBeNull()
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
    const migratedId = getAuthSessionSnapshot()?.sessionId
    expect(migratedId).toBeTruthy()
    expect(getAuthSessionSnapshot()?.sessionId).toBe(migratedId)
  })

  it('清理认证时同时清除内存 access token 和持久化 refresh token', () => {
    saveAuthTokens(authResult())
    clearAuthTokens()

    expect(getAccessToken()).toBeNull()
    expect(readRefreshToken()).toBeNull()
  })

  it('自动刷新保留会话标识，同账号主动重新登录生成新标识', () => {
    saveAuthTokens(authResult())
    const original = getAuthSessionSnapshot()!
    saveAuthTokens(authResult({ access_token: 'rotated-access', refresh_token: 'rotated-refresh' }), { expectedRefreshToken: original.refreshToken, expectedRevision: original.revision })
    expect(getAuthSessionSnapshot()?.sessionId).toBe(original.sessionId)
    saveAuthTokens(authResult({ access_token: 'new-login-access', refresh_token: 'new-login-refresh' }))
    expect(getAuthSessionSnapshot()?.sessionId).not.toBe(original.sessionId)
  })

  it('跨标签页刷新继承会话标识并传递刷新来源', () => {
    saveAuthTokens(authResult())
    const original = getAuthSessionSnapshot()!
    const listener = vi.fn()
    const unsubscribe = subscribeAuthTokenChanges(listener)
    try {
      window.dispatchEvent(new StorageEvent('storage', { key: AUTH_SYNC_STORAGE_KEY, newValue: JSON.stringify({
        type: 'session-updated', eventId: 'remote-stable-session:1', revision: { timestamp: original.revision.timestamp + 1, writerId: 'remote-tab' },
        accessToken: 'remote-access', refreshToken: 'remote-refresh', refreshExpiresAt: Date.UTC(2099, 1, 1), user: authResult().user,
        sessionId: original.sessionId, isRefresh: true,
      }) }))
      expect(getAuthSessionSnapshot()).toMatchObject({ sessionId: original.sessionId, accessToken: 'remote-access', refreshToken: 'remote-refresh' })
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ sessionId: original.sessionId, isRefresh: true }))
    } finally { unsubscribe() }
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
          revision: { timestamp: Date.now() + 10_000, writerId: 'other-tab' },
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

  it('退出后拒绝迟到的旧刷新事件，同时允许之后的新登录', () => {
    saveAuthTokens(authResult())
    const oldRevision = JSON.parse(String(localStorage.getItem(REFRESH_SESSION_KEY))).revision
    clearAuthTokens({ force: true })
    const signedOut = JSON.parse(String(localStorage.getItem(AUTH_SIGN_OUT_REVISION_KEY)))
    window.dispatchEvent(new StorageEvent('storage', {
      key: AUTH_SYNC_STORAGE_KEY,
      newValue: JSON.stringify({ type: 'session-updated', eventId: 'late-refresh:1', revision: oldRevision, accessToken: 'old-access', refreshToken: 'old-refresh', refreshExpiresAt: Date.UTC(2099, 1, 1), user: authResult().user }),
    }))
    expect(getAccessToken()).toBeNull()
    expect(readRefreshToken()).toBeNull()
    saveAuthTokens(authResult({ access_token: 'new-login', refresh_token: 'new-refresh' }))
    expect(getAccessToken()).toBe('new-login')
    expect(JSON.parse(String(localStorage.getItem(REFRESH_SESSION_KEY))).revision.timestamp).toBeGreaterThan(signedOut.timestamp)
  })

  it('共享退出版本已写入时仍应用相同版本的退出通知', () => {
    saveAuthTokens(authResult())
    const current = JSON.parse(String(localStorage.getItem(REFRESH_SESSION_KEY))).revision
    const revision = { timestamp: current.timestamp + 1, writerId: 'remote-signout' }
    // 模拟另一个标签页先更新共享存储，然后通知当前标签页。
    localStorage.setItem(AUTH_SIGN_OUT_REVISION_KEY, JSON.stringify(revision))
    localStorage.removeItem(REFRESH_SESSION_KEY)
    const listener = vi.fn()
    const unsubscribe = subscribeAuthTokenChanges(listener)
    window.dispatchEvent(new StorageEvent('storage', { key: AUTH_SYNC_STORAGE_KEY, newValue: JSON.stringify({ type: 'signed-out', eventId: 'remote-signout:1', revision }) }))
    expect(getAccessToken()).toBeNull()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'signed-out' }))
    unsubscribe()
  })

  it('持久化退出版本高于本页内存时也拒绝旧会话通知', () => {
    saveAuthTokens(authResult())
    const current = JSON.parse(String(localStorage.getItem(REFRESH_SESSION_KEY))).revision
    const revision = { timestamp: current.timestamp + 100, writerId: 'remote-signout' }
    localStorage.setItem(AUTH_SIGN_OUT_REVISION_KEY, JSON.stringify(revision))
    localStorage.removeItem(REFRESH_SESSION_KEY)
    const listener = vi.fn()
    const unsubscribe = subscribeAuthTokenChanges(listener)
    window.dispatchEvent(new StorageEvent('storage', { key: AUTH_SYNC_STORAGE_KEY, newValue: JSON.stringify({ type: 'session-updated', eventId: 'delayed-remote:1', revision: { ...revision, timestamp: revision.timestamp - 1 }, accessToken: 'stale-access', refreshToken: 'stale-refresh', refreshExpiresAt: Date.UTC(2099, 1, 1), user: authResult().user }) }))
    expect(localStorage.getItem(REFRESH_SESSION_KEY)).toBeNull()
    expect(listener).not.toHaveBeenCalled()
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
