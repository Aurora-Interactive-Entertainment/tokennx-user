import { beforeEach, expect, it, vi } from 'vitest'
import type { AuthResult } from '@/api/auth'
import { ACCESS_SESSION_KEY } from './access-session-cache'

function authResult(overrides: Partial<AuthResult> = {}): AuthResult {
  return {
    status: 'succeeded', binding_required: false,
    access_token: 'test-access', refresh_token: 'test-refresh',
    access_expires_at: Date.now() + 15 * 60_000,
    refresh_expires_at: Date.now() + 30 * 24 * 60 * 60_000,
    user: { id: 'test-user', display_name: '测试用户', avatar_url: '' },
    ...overrides,
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  localStorage.clear()
  sessionStorage.clear()
})

async function reloadTokenModule() {
  // 模拟页面重载：模块内存清空，但浏览器当前标签页的存储保留。
  vi.resetModules()
  return import('./token-storage')
}

it('重载恢复尚未过期的访问令牌，访问令牌不进入长期存储', async () => {
  const original = await import('./token-storage')
  original.saveAuthTokens(authResult())
  const originalSession = original.getAuthSessionSnapshot()
  expect(localStorage.getItem(original.REFRESH_SESSION_KEY)).not.toContain('test-access')
  expect(sessionStorage.getItem(ACCESS_SESSION_KEY)).toContain('test-access')

  const restored = await reloadTokenModule()
  expect(restored.getAccessToken()).toBe('test-access')
  expect(restored.getAuthSessionSnapshot()).toMatchObject({
    sessionId: originalSession?.sessionId, refreshToken: 'test-refresh', user: { id: 'test-user' },
  })
  expect(restored.getAccessTokenUserId()).toBe('test-user')
})

it('访问令牌过期只丢弃短期缓存，保留三十天刷新凭证供续期', async () => {
  const original = await import('./token-storage')
  original.saveAuthTokens(authResult())
  const cached = JSON.parse(sessionStorage.getItem(ACCESS_SESSION_KEY)!)
  sessionStorage.setItem(ACCESS_SESSION_KEY, JSON.stringify({ ...cached, accessExpiresAt: Date.now() - 1 }))

  const restored = await reloadTokenModule()
  expect(restored.getAccessToken()).toBeNull()
  expect(restored.readRefreshToken()).toBe('test-refresh')
  expect(sessionStorage.getItem(ACCESS_SESSION_KEY)).toBeNull()
})

it('退出时清除短期缓存，重载不能恢复旧登录', async () => {
  const original = await import('./token-storage')
  original.saveAuthTokens(authResult())
  original.clearAuthTokens({ force: true })
  expect(sessionStorage.getItem(ACCESS_SESSION_KEY)).toBeNull()
  const restored = await reloadTokenModule()
  expect(restored.getAccessToken()).toBeNull()
  expect(restored.readRefreshToken()).toBeNull()
})

it('其他标签页退出后，即使本页缓存尚未处理通知也不能重新登录', async () => {
  const original = await import('./token-storage')
  original.saveAuthTokens(authResult())
  localStorage.removeItem(original.REFRESH_SESSION_KEY)
  const restored = await reloadTokenModule()
  expect(restored.getAccessToken()).toBeNull()
  expect(sessionStorage.getItem(ACCESS_SESSION_KEY)).toBeNull()
})

it.each(['sessionId', 'revision'] as const)('会话的 %s 变化后不复用旧访问令牌', async (field) => {
  const original = await import('./token-storage')
  original.saveAuthTokens(authResult())
  const saved = JSON.parse(localStorage.getItem(original.REFRESH_SESSION_KEY)!)
  if (field === 'sessionId') saved.sessionId = 'new-login-session'
  else saved.revision.timestamp += 1
  localStorage.setItem(original.REFRESH_SESSION_KEY, JSON.stringify(saved))
  const restored = await reloadTokenModule()
  expect(restored.getAccessToken()).toBeNull()
  expect(restored.readRefreshToken()).toBe('test-refresh')
})

it('缓存损坏不清除可继续恢复的长期会话', async () => {
  const original = await import('./token-storage')
  original.saveAuthTokens(authResult())
  sessionStorage.setItem(ACCESS_SESSION_KEY, '{broken json')
  const restored = await reloadTokenModule()
  expect(restored.getAccessToken()).toBeNull()
  expect(restored.readRefreshToken()).toBe('test-refresh')
})

it('没有访问令牌有效期时不持久化，仍保留当前内存登录', async () => {
  const original = await import('./token-storage')
  original.saveAuthTokens(authResult({ access_expires_at: undefined }))
  expect(original.getAccessToken()).toBe('test-access')
  expect(sessionStorage.getItem(ACCESS_SESSION_KEY)).toBeNull()
  const restored = await reloadTokenModule()
  expect(restored.getAccessToken()).toBeNull()
  expect(restored.readRefreshToken()).toBe('test-refresh')
})

it('标签页存储不可用时成功登录不会被改判为失败', async () => {
  const original = await import('./token-storage')
  vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError') })
  expect(original.saveAuthTokens(authResult())).toBe(true)
  expect(original.getAccessToken()).toBe('test-access')
  expect(original.readRefreshToken()).toBe('test-refresh')
})

it('刷新未带用户时允许在身份验证后补齐归属与首次登录标记', async () => {
  const original = await import('./token-storage')
  original.saveAuthTokens(authResult({ user: undefined, promt_required: true }))
  expect(original.getAccessTokenUserId()).toBeUndefined()
  expect(original.updateAuthSessionUser(authResult().user!, 'test-access')).toBe(true)
  expect(original.getAuthSessionSnapshot()?.user).toMatchObject({ id: 'test-user', promt_required: true })
  const restored = await reloadTokenModule()
  expect(restored.getAccessTokenUserId()).toBe('test-user')
  expect(restored.getAuthSessionSnapshot()?.promtRequired).toBe(true)
})

it('迟到的资料响应不能更改新令牌或已有用户的归属', async () => {
  const original = await import('./token-storage')
  original.saveAuthTokens(authResult())
  expect(original.updateAuthSessionUser(authResult().user!, 'old-access')).toBe(false)
  expect(original.updateAuthSessionUser({ id: 'other-user', display_name: '另一用户', avatar_url: '' }, 'test-access')).toBe(false)
  expect(original.getAccessTokenUserId()).toBe('test-user')
})
