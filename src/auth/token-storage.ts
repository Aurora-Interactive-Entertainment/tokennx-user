import { isAuthTimestamp, type AuthResult, type AuthTimestamp, type AuthUser } from '@/api/auth'

export const REFRESH_SESSION_KEY = 'token-nx:auth:refresh:v1'
export const DEVICE_ID_KEY = 'token-nx:auth:device:v1'
export const AUTH_SYNC_CHANNEL_NAME = 'token-nx:auth:sync:v1'
export const AUTH_SYNC_STORAGE_KEY = 'token-nx:auth:event:v1'
export const VERIFIED_PHONE_KEY = 'token-nx:auth:verified-phone:v1'

const MAX_SEEN_EVENT_IDS = 1_000

export interface SessionRevision {
  timestamp: number
  writerId: string
}

interface StoredRefreshSession {
  refreshToken: string
  refreshExpiresAt: AuthTimestamp
  revision: SessionRevision
}

export interface AuthSessionSnapshot {
  accessToken: string | null
  refreshToken: string
  refreshExpiresAt: AuthTimestamp
  revision: SessionRevision
  user: AuthUser | undefined
}

export interface AuthTokenChange {
  type: 'session-updated' | 'signed-out'
  eventId: string
  revision: SessionRevision
  accessToken?: string
  refreshToken?: string
  refreshExpiresAt?: AuthTimestamp
  user?: AuthUser
}

export interface ClearAuthTokensOptions {
  expectedRefreshToken?: string
  force?: boolean
  broadcast?: boolean
}

export interface SaveAuthTokensOptions {
  expectedRefreshToken?: string
  expectedRevision?: SessionRevision
}

export type AuthTokenChangeListener = (change: AuthTokenChange) => void

let accessToken: string | null = null
let accessTokenRefreshToken: string | null = null
let lastKnownUser: AuthUser | undefined
let revisionClock = 0
let eventSequence = 0
let synchronizationInitialized = false
let authChannel: BroadcastChannel | null = null
const changeListeners = new Set<AuthTokenChangeListener>()
const seenEventIds = new Set<string>()
const authTabId = createIdentifier('tab')

function createIdentifier(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`
  } catch {
    // 中文：随机标识不可用时使用时间和随机数，保证同一页面实例仍有独立所有者标识。
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function sessionStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function saveVerifiedPhone(userId: string, phone: string): void {
  const normalizedUserId = userId.trim()
  const normalizedPhone = phone.replace(/\D/g, '')
  if (!normalizedUserId || !normalizedPhone) return
  storage()?.setItem(VERIFIED_PHONE_KEY, JSON.stringify({ userId: normalizedUserId, phone: normalizedPhone }))
  sessionStorage()?.removeItem(VERIFIED_PHONE_KEY)
}

export function getVerifiedPhone(userId: string): string | null {
  const saved = storage()
  const temporary = sessionStorage()
  const raw = saved?.getItem(VERIFIED_PHONE_KEY) ?? temporary?.getItem(VERIFIED_PHONE_KEY)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as { userId?: unknown; phone?: unknown }
    if (value.userId !== userId || typeof value.phone !== 'string' || !/^\d+$/.test(value.phone)) return null
    if (!saved?.getItem(VERIFIED_PHONE_KEY)) saved?.setItem(VERIFIED_PHONE_KEY, raw)
    temporary?.removeItem(VERIFIED_PHONE_KEY)
    return value.phone
  } catch {
    saved?.removeItem(VERIFIED_PHONE_KEY)
    temporary?.removeItem(VERIFIED_PHONE_KEY)
    return null
  }
}

export function clearVerifiedPhone(): void {
  storage()?.removeItem(VERIFIED_PHONE_KEY)
  sessionStorage()?.removeItem(VERIFIED_PHONE_KEY)
}

function nextRevision(): SessionRevision {
  revisionClock = Math.max(revisionClock + 1, Date.now())
  return { timestamp: revisionClock, writerId: authTabId }
}

function compareRevision(left: SessionRevision, right: SessionRevision): number {
  if (left.timestamp !== right.timestamp) return left.timestamp - right.timestamp
  return left.writerId.localeCompare(right.writerId)
}

function normalizeRevision(value: unknown): {
  revision: SessionRevision
  valid: boolean
} {
  if (typeof value !== 'object' || value === null) return { revision: { timestamp: 0, writerId: '' }, valid: false }
  const candidate = value as Partial<SessionRevision>
  const timestamp = candidate.timestamp
  if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) || timestamp < 0 || typeof candidate.writerId !== 'string') {
    return { revision: { timestamp: 0, writerId: '' }, valid: false }
  }
  return {
    revision: { timestamp, writerId: candidate.writerId },
    valid: true,
  }
}

function parseStoredRefreshSession(raw: string | null): { session: StoredRefreshSession; canonical: boolean } | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<StoredRefreshSession>
    const refreshExpiresAt = normalizeRefreshExpiresAt(value.refreshExpiresAt)
    const revision = normalizeRevision(value.revision)
    if (typeof value.refreshToken !== 'string' || !value.refreshToken || refreshExpiresAt === null || refreshExpiresAt <= Date.now()) return null
    return {
      session: {
        refreshToken: value.refreshToken,
        refreshExpiresAt,
        revision: revision.revision,
      },
      canonical: value.refreshExpiresAt === refreshExpiresAt && revision.valid,
    }
  } catch {
    return null
  }
}

function readRefreshSession(): StoredRefreshSession | null {
  const saved = storage()
  const raw = saved?.getItem(REFRESH_SESSION_KEY) ?? null
  if (!raw) return null
  const parsed = parseStoredRefreshSession(raw)
  if (!parsed) {
    clearAuthTokens({ force: true, broadcast: false })
    return null
  }
  if (!parsed.canonical) saved?.setItem(REFRESH_SESSION_KEY, JSON.stringify(parsed.session))
  revisionClock = Math.max(revisionClock, parsed.session.revision.timestamp)
  return parsed.session
}

function peekRefreshSession(): StoredRefreshSession | null {
  const raw = storage()?.getItem(REFRESH_SESSION_KEY) ?? null
  const session = parseStoredRefreshSession(raw)?.session ?? null
  if (session) revisionClock = Math.max(revisionClock, session.revision.timestamp)
  return session
}

function markEventSeen(eventId: string): boolean {
  if (seenEventIds.has(eventId)) return false
  seenEventIds.add(eventId)
  if (seenEventIds.size > MAX_SEEN_EVENT_IDS) {
    const first = seenEventIds.values().next().value
    if (first) seenEventIds.delete(first)
  }
  return true
}

function parseAuthTokenChange(value: unknown): AuthTokenChange | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Partial<AuthTokenChange>
  const revision = normalizeRevision(candidate.revision)
  if (
    (candidate.type !== 'session-updated' && candidate.type !== 'signed-out') ||
    typeof candidate.eventId !== 'string' ||
    !candidate.eventId ||
    !revision.valid
  )
    return null
  if (candidate.type === 'session-updated') {
    if (
      typeof candidate.accessToken !== 'string' ||
      !candidate.accessToken ||
      typeof candidate.refreshToken !== 'string' ||
      !candidate.refreshToken ||
      !isAuthTimestamp(candidate.refreshExpiresAt)
    )
      return null
  }
  return {
    ...candidate,
    type: candidate.type,
    eventId: candidate.eventId,
    revision: revision.revision,
  }
}

function notifyChange(change: AuthTokenChange): void {
  for (const listener of changeListeners) listener(change)
}

function applyRemoteChange(change: AuthTokenChange): void {
  if (!markEventSeen(change.eventId)) return
  const saved = storage()
  const current = parseStoredRefreshSession(saved?.getItem(REFRESH_SESSION_KEY) ?? null)?.session ?? null
  if (current && compareRevision(current.revision, change.revision) > 0) return

  if (change.type === 'session-updated') {
    const session: StoredRefreshSession = {
      refreshToken: change.refreshToken as string,
      refreshExpiresAt: change.refreshExpiresAt as AuthTimestamp,
      revision: change.revision,
    }
    saved?.setItem(REFRESH_SESSION_KEY, JSON.stringify(session))
    accessToken = change.accessToken as string
    accessTokenRefreshToken = session.refreshToken
    lastKnownUser = change.user
    revisionClock = Math.max(revisionClock, change.revision.timestamp)
    notifyChange(change)
    return
  }

  accessToken = null
  accessTokenRefreshToken = null
  lastKnownUser = undefined
  clearVerifiedPhone()
  saved?.removeItem(REFRESH_SESSION_KEY)
  revisionClock = Math.max(revisionClock, change.revision.timestamp)
  notifyChange(change)
}

function handleStorageChange(event: StorageEvent): void {
  if (event.key !== AUTH_SYNC_STORAGE_KEY || !event.newValue) return
  try {
    const change = parseAuthTokenChange(JSON.parse(event.newValue))
    if (change) applyRemoteChange(change)
  } catch {
    // 中文：跨标签页通知损坏时忽略，不影响当前标签页已有的认证状态。
  }
}

function initializeSynchronization(): void {
  if (synchronizationInitialized || typeof window === 'undefined') return
  synchronizationInitialized = true
  window.addEventListener('storage', handleStorageChange)
  try {
    if (typeof window.BroadcastChannel === 'function') {
      authChannel = new window.BroadcastChannel(AUTH_SYNC_CHANNEL_NAME)
      authChannel.addEventListener('message', (event: MessageEvent<unknown>) => {
        const change = parseAuthTokenChange(event.data)
        if (change) applyRemoteChange(change)
      })
    }
  } catch {
    authChannel = null
  }
}

function publishChange(change: AuthTokenChange): void {
  initializeSynchronization()
  if (!markEventSeen(change.eventId)) return
  notifyChange(change)
  try {
    authChannel?.postMessage(change)
  } catch {
    // 中文：BroadcastChannel 不可用时继续使用 localStorage 事件通知其他标签页。
  }
  const saved = storage()
  if (!saved) return
  const serialized = JSON.stringify(change)
  try {
    saved.setItem(AUTH_SYNC_STORAGE_KEY, serialized)
    saved.removeItem(AUTH_SYNC_STORAGE_KEY)
  } catch {
    // 中文：存储不可用时保留内存认证状态，跨标签页同步由 BroadcastChannel 尽力完成。
  }
}

function createChange(change: Omit<AuthTokenChange, 'eventId' | 'revision'>, revision = nextRevision()): AuthTokenChange {
  eventSequence += 1
  return { ...change, eventId: `${authTabId}:${eventSequence}`, revision }
}

export function getAuthTabId(): string {
  return authTabId
}

export function subscribeAuthTokenChanges(listener: AuthTokenChangeListener): () => void {
  initializeSynchronization()
  changeListeners.add(listener)
  return () => changeListeners.delete(listener)
}

export function getAccessToken(): string | null {
  return accessToken
}

export function getAuthSessionSnapshot(): AuthSessionSnapshot | null {
  const session = peekRefreshSession()
  if (!session) return null
  const isAccessTokenCurrent = accessTokenRefreshToken === session.refreshToken
  return {
    accessToken: isAccessTokenCurrent ? accessToken : null,
    refreshToken: session.refreshToken,
    refreshExpiresAt: session.refreshExpiresAt,
    revision: session.revision,
    user: isAccessTokenCurrent ? lastKnownUser : undefined,
  }
}

export function saveAuthTokens(result: AuthResult, options: SaveAuthTokensOptions = {}): boolean {
  if (!result.access_token || !result.refresh_token || !isAuthTimestamp(result.refresh_expires_at)) throw new Error('认证响应缺少有效令牌')
  const current = peekRefreshSession()
  if (options.expectedRefreshToken !== undefined && current?.refreshToken !== options.expectedRefreshToken) return false
  if (options.expectedRevision && (!current || compareRevision(current.revision, options.expectedRevision) !== 0)) return false
  const session: StoredRefreshSession = {
    refreshToken: result.refresh_token,
    refreshExpiresAt: result.refresh_expires_at,
    revision: nextRevision(),
  }
  accessToken = result.access_token
  accessTokenRefreshToken = session.refreshToken
  lastKnownUser = result.user
  storage()?.setItem(REFRESH_SESSION_KEY, JSON.stringify(session))
  publishChange(
    createChange(
      {
        type: 'session-updated',
        accessToken: result.access_token,
        refreshToken: session.refreshToken,
        refreshExpiresAt: session.refreshExpiresAt,
        user: result.user,
      },
      session.revision
    )
  )
  return true
}

function normalizeRefreshExpiresAt(value: unknown): AuthTimestamp | null {
  if (isAuthTimestamp(value)) return value
  if (typeof value !== 'string') return null
  const timestamp = Date.parse(value)
  return Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp : null
}

export function readRefreshToken(): string | null {
  return readRefreshSession()?.refreshToken ?? null
}

export function clearAuthTokens(options: ClearAuthTokensOptions = {}): void {
  const saved = storage()
  const current = peekRefreshSession()
  const expectedRefreshToken = options.expectedRefreshToken ?? accessTokenRefreshToken
  const ownsExpectedAccessToken = expectedRefreshToken !== null && accessTokenRefreshToken === expectedRefreshToken
  const shouldRemoveSharedSession = options.force === true || (current !== null && expectedRefreshToken === current.refreshToken)
  if (!shouldRemoveSharedSession) {
    if (ownsExpectedAccessToken) {
      accessToken = null
      accessTokenRefreshToken = null
      lastKnownUser = undefined
    }
    return
  }

  const revision = nextRevision()
  accessToken = null
  accessTokenRefreshToken = null
  lastKnownUser = undefined
  clearVerifiedPhone()
  saved?.removeItem(REFRESH_SESSION_KEY)
  if (options.broadcast !== false) publishChange(createChange({ type: 'signed-out' }, revision))
  revisionClock = Math.max(revisionClock, revision.timestamp)
}

export function getDeviceId(): string {
  const saved = storage()?.getItem(DEVICE_ID_KEY)
  if (saved) return saved
  const value = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `device-${Date.now()}`
  storage()?.setItem(DEVICE_ID_KEY, value)
  return value
}

export function getDeviceName(): string {
  return typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent.slice(0, 255) : 'Web browser'
}
