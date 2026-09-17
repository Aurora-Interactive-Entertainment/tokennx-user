import type { AuthTimestamp, AuthUser } from '@/api/auth'

export const ACCESS_SESSION_KEY = 'token-nx:auth:access:v1'

interface SessionBinding {
  sessionId: string
  revision: { timestamp: number; writerId: string }
}

export interface CachedAccessSession extends SessionBinding {
  accessToken: string
  accessExpiresAt: AuthTimestamp
  user?: AuthUser
  promtRequired?: boolean
}

export function clearAccessSessionCache(): void {
  try { window.sessionStorage.removeItem(ACCESS_SESSION_KEY) } catch {
    // 浏览器禁用存储时仍可使用当前页面的内存会话。
  }
}

export function saveAccessSessionCache(session: CachedAccessSession): void {
  if (!Number.isSafeInteger(session.accessExpiresAt) || session.accessExpiresAt <= Date.now()) {
    clearAccessSessionCache()
    return
  }
  try { window.sessionStorage.setItem(ACCESS_SESSION_KEY, JSON.stringify(session)) } catch {
    // 缓存失败不能让已成功的登录或续期变成失败；下次重载仍可用 refresh token 恢复。
    clearAccessSessionCache()
  }
}

export function readAccessSessionCache(binding: SessionBinding): CachedAccessSession | null {
  try {
    const raw = window.sessionStorage.getItem(ACCESS_SESSION_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as Partial<CachedAccessSession> | null
    if (!cached || typeof cached.accessToken !== 'string' || !cached.accessToken ||
      !Number.isSafeInteger(cached.accessExpiresAt) || (cached.accessExpiresAt ?? 0) <= Date.now() ||
      cached.sessionId !== binding.sessionId || cached.revision?.timestamp !== binding.revision.timestamp ||
      cached.revision?.writerId !== binding.revision.writerId ||
      (cached.user !== undefined && (!cached.user || typeof cached.user.id !== 'string' || !cached.user.id ||
        typeof cached.user.display_name !== 'string' || typeof cached.user.avatar_url !== 'string'))) {
      clearAccessSessionCache()
      return null
    }
    return cached as CachedAccessSession
  } catch {
    clearAccessSessionCache()
    return null
  }
}
