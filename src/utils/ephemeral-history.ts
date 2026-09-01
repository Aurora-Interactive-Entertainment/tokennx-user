const SESSION_HISTORY_VERSION = 1
export const SESSION_HISTORY_MAX_ENTRIES = 20
export const SESSION_HISTORY_MAX_BYTES = 1_500_000

export const PLAYGROUND_SESSION_HISTORY_KEY = 'token-nx:session-history:playground:v1'
export const IMAGE_SESSION_HISTORY_KEY = 'token-nx:session-history:image:v1'
export const VIDEO_SESSION_HISTORY_KEY = 'token-nx:session-history:video:v1'

// 中文：迁移到账号隔离存储时清理旧版本未按账号隔离的历史 key。
export const LEGACY_PLAYGROUND_HISTORY_KEY = 'token-nx:playground:v1'
export const LEGACY_VIDEO_HISTORY_KEY = 'token-nx:video-history:v1'

type SessionHistoryEnvelope<T> = {
  version: number
  userId: string
  entries: T[]
}

function getHistoryStorage(): Storage | null {
  try {
    // 中文：历史记录按账号隔离后持久化到本地，关闭浏览器后仍可继续查看。
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function normalizeUserId(userId: string | null | undefined): string {
  return typeof userId === 'string' ? userId.trim() : ''
}

function serializedSize(value: string): number {
  // 中文：按 UTF-16 估算占用量，给本地存储配额预留空间，避免大文本撑爆存储。
  return value.length * 2
}

export function readUserSessionHistory<T>(
  key: string,
  userId: string | null | undefined,
  isEntry: (value: unknown) => value is T,
  maxEntries = SESSION_HISTORY_MAX_ENTRIES,
): T[] {
  const normalizedUserId = normalizeUserId(userId)
  const storage = getHistoryStorage()
  if (!normalizedUserId || !storage) return []

  try {
    const raw = storage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      storage.removeItem(key)
      return []
    }
    const envelope = parsed as Partial<SessionHistoryEnvelope<unknown>>
    if (envelope.version !== SESSION_HISTORY_VERSION || envelope.userId !== normalizedUserId) {
      // 中文：同一标签页切换账号时立即移除旧账号残留，避免调试工具或后续逻辑读到旧数据。
      storage.removeItem(key)
      return []
    }
    if (!Array.isArray(envelope.entries)) {
      storage.removeItem(key)
      return []
    }
    const boundedMaxEntries = Number.isFinite(maxEntries)
      ? Math.max(0, Math.floor(maxEntries))
      : SESSION_HISTORY_MAX_ENTRIES
    return envelope.entries.filter(isEntry).slice(0, boundedMaxEntries)
  } catch {
    storage.removeItem(key)
    return []
  }
}

export function writeUserSessionHistory<T>(
  key: string,
  userId: string | null | undefined,
  entries: readonly T[],
  maxEntries = SESSION_HISTORY_MAX_ENTRIES,
): void {
  const normalizedUserId = normalizeUserId(userId)
  const storage = getHistoryStorage()
  if (!normalizedUserId || !storage) return

  const boundedMaxEntries = Number.isFinite(maxEntries)
    ? Math.max(0, Math.floor(maxEntries))
    : SESSION_HISTORY_MAX_ENTRIES
  const boundedEntries = entries.slice(0, boundedMaxEntries)
  let keepCount = boundedEntries.length
  while (keepCount >= 0) {
    const envelope: SessionHistoryEnvelope<T> = {
      version: SESSION_HISTORY_VERSION,
      userId: normalizedUserId,
      entries: boundedEntries.slice(0, keepCount),
    }
    let serialized: string
    try {
      serialized = JSON.stringify(envelope)
    } catch {
      // 中文：遇到不可序列化的接口字段时继续缩小集合，不能影响当前页面内存状态。
      if (keepCount > 0) {
        keepCount = Math.floor(keepCount / 2)
        continue
      }
      try { storage.removeItem(key) } catch { /* 存储完全不可用时忽略 */ }
      return
    }
    if (serializedSize(serialized) <= SESSION_HISTORY_MAX_BYTES || keepCount === 0) {
      try {
        storage.setItem(key, serialized)
      } catch {
        // 中文：浏览器配额不足时退化为更小的历史集合，不影响当前页面内存状态。
        if (keepCount > 0) {
          keepCount = Math.floor(keepCount / 2)
          continue
        }
        // 中文：连空集合也无法写入时移除旧值，避免超限数据继续占用本地空间。
        try { storage.removeItem(key) } catch { /* 存储完全不可用时忽略 */ }
      }
      return
    }
    keepCount -= 1
  }
}
