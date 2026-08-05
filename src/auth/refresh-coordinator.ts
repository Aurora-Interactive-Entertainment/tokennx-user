import { refreshSession, type AuthResult, type AuthTimestamp } from '@/api/auth'
import { getAuthSessionSnapshot, getAuthTabId, getDeviceId, getDeviceName, saveAuthTokens, subscribeAuthTokenChanges, type AuthSessionSnapshot } from './token-storage'

const REFRESH_LOCK_NAME = 'token-nx:auth:refresh:v1'
const REFRESH_LOCK_STORAGE_KEY = 'token-nx:auth:refresh-lock:v1'
const REFRESH_LOCK_LEASE_MS = 30_000
const REFRESH_LOCK_WAIT_MS = 50
const REFRESH_LOCK_ACQUIRE_TIMEOUT_MS = 35_000
const SESSION_SYNC_WAIT_MS = 2_000
const SESSION_SYNC_POLL_MS = 25

interface RefreshLockRecord {
  owner: string
  nonce: string
  expiresAt: number
}

export type AuthenticatedSession = Awaited<ReturnType<typeof refreshSession>> & {
  status: 'succeeded'
  access_token: string
  refresh_token: string
  refresh_expires_at: AuthTimestamp
}

let refreshPromise: Promise<AuthenticatedSession> | null = null

function isAuthenticatedSession(result: AuthResult): result is AuthenticatedSession {
  return (
    result.status === 'succeeded' &&
    typeof result.access_token === 'string' &&
    result.access_token.length > 0 &&
    typeof result.refresh_token === 'string' &&
    result.refresh_token.length > 0 &&
    typeof result.refresh_expires_at === 'number' &&
    Number.isSafeInteger(result.refresh_expires_at) &&
    result.refresh_expires_at > 0
  )
}

function localStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function createNonce(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    // 中文：随机数不可用时退回时间值，锁仍会通过 owner 和过期时间校验。
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function parseLockRecord(raw: string | null): RefreshLockRecord | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<RefreshLockRecord>
    const expiresAt = value.expiresAt
    if (typeof value.owner !== 'string' || !value.owner || typeof value.nonce !== 'string' || !value.nonce || typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt))
      return null
    return {
      owner: value.owner,
      nonce: value.nonce,
      expiresAt,
    }
  } catch {
    return null
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function isWebLockAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function'
}

async function withLocalStorageLock<T>(work: () => Promise<T>): Promise<T> {
  const saved = localStorage()
  if (!saved) return work()

  const owner = getAuthTabId()
  const deadline = Date.now() + REFRESH_LOCK_ACQUIRE_TIMEOUT_MS
  let lock: RefreshLockRecord | null = null
  while (!lock) {
    const current = parseLockRecord(saved.getItem(REFRESH_LOCK_STORAGE_KEY))
    // 中文：同一标签页的并发认证操作也必须等待当前锁释放，避免退出和刷新同时修改会话。
    if (!current || current.expiresAt <= Date.now()) {
      const candidate = {
        owner,
        nonce: createNonce(),
        expiresAt: Date.now() + REFRESH_LOCK_LEASE_MS,
      }
      saved.setItem(REFRESH_LOCK_STORAGE_KEY, JSON.stringify(candidate))
      const confirmed = parseLockRecord(saved.getItem(REFRESH_LOCK_STORAGE_KEY))
      if (confirmed?.owner === candidate.owner && confirmed.nonce === candidate.nonce) lock = candidate
    }
    if (lock) break
    if (Date.now() >= deadline) throw new Error('跨标签页刷新令牌锁等待超时')
    await wait(REFRESH_LOCK_WAIT_MS)
  }

  const heartbeat = setInterval(
    () => {
      const current = parseLockRecord(saved.getItem(REFRESH_LOCK_STORAGE_KEY))
      if (current?.owner === lock?.owner && current.nonce === lock?.nonce) {
        saved.setItem(
          REFRESH_LOCK_STORAGE_KEY,
          JSON.stringify({
            ...current,
            expiresAt: Date.now() + REFRESH_LOCK_LEASE_MS,
          })
        )
      }
    },
    Math.floor(REFRESH_LOCK_LEASE_MS / 3)
  )
  try {
    return await work()
  } finally {
    clearInterval(heartbeat)
    const current = parseLockRecord(saved.getItem(REFRESH_LOCK_STORAGE_KEY))
    if (current?.owner === lock.owner && current.nonce === lock.nonce) saved.removeItem(REFRESH_LOCK_STORAGE_KEY)
  }
}

async function withRefreshLock<T>(work: () => Promise<T>): Promise<T> {
  if (isWebLockAvailable()) {
    return navigator.locks.request(REFRESH_LOCK_NAME, { mode: 'exclusive' }, work)
  }
  return withLocalStorageLock(work)
}

// 中文：退出登录与刷新令牌共用一把锁，避免退出请求和轮换请求交错执行。
export function withAuthSessionLock<T>(work: () => Promise<T>): Promise<T> {
  return withRefreshLock(work)
}

function sessionFromSnapshot(snapshot: AuthSessionSnapshot | null): AuthenticatedSession | null {
  if (!snapshot?.accessToken) return null
  return {
    status: 'succeeded',
    binding_required: false,
    access_token: snapshot.accessToken,
    refresh_token: snapshot.refreshToken,
    refresh_expires_at: snapshot.refreshExpiresAt,
    user: snapshot.user,
  }
}

async function waitForSynchronizedSession(previousRefreshToken: string): Promise<AuthenticatedSession | null> {
  const existing = getAuthSessionSnapshot()
  if (existing?.refreshToken !== previousRefreshToken) {
    const session = sessionFromSnapshot(existing)
    if (session) return session
  }

  return new Promise((resolve) => {
    let finished = false
    const finish = (session: AuthenticatedSession | null): void => {
      if (finished) return
      finished = true
      unsubscribe()
      clearInterval(poll)
      clearTimeout(timeout)
      resolve(session)
    }
    const check = (): void => {
      const current = getAuthSessionSnapshot()
      if (current?.refreshToken !== previousRefreshToken) finish(sessionFromSnapshot(current))
    }
    const unsubscribe = subscribeAuthTokenChanges(check)
    const poll = setInterval(check, SESSION_SYNC_POLL_MS)
    const timeout = setTimeout(() => finish(null), SESSION_SYNC_WAIT_MS)
    check()
  })
}

async function refreshInsideLock(refreshToken: string): Promise<AuthenticatedSession> {
  let tokenToUse = refreshToken
  const current = getAuthSessionSnapshot()
  if (!current) throw new Error('刷新令牌不存在')
  let expectedRefreshToken = current.refreshToken
  let expectedRevision = current.revision

  if (current.refreshToken !== refreshToken) {
    const synchronized = await waitForSynchronizedSession(refreshToken)
    if (synchronized) return synchronized
    const latest = getAuthSessionSnapshot()
    if (!latest) throw new Error('刷新令牌不存在')
    tokenToUse = latest.refreshToken
    expectedRefreshToken = latest.refreshToken
    expectedRevision = latest.revision
  }

  const refreshed = await refreshSession(tokenToUse, {
    device_id: getDeviceId(),
    device_name: getDeviceName(),
  })
  if (!isAuthenticatedSession(refreshed)) throw new Error('刷新会话未完成')
  if (!saveAuthTokens(refreshed, { expectedRefreshToken, expectedRevision })) throw new Error('认证会话在刷新期间发生变化')
  return refreshed
}

export function refreshAuthSession(refreshToken: string): Promise<AuthenticatedSession> {
  if (refreshPromise) return refreshPromise
  refreshPromise = withRefreshLock(() => refreshInsideLock(refreshToken)).finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}
