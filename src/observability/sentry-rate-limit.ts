export type SentryEventCategory = "critical" | "chunk" | "api";

interface CategoryLimit {
  cooldownMs: number;
  sessionMax: number;
}

type TimestampRecord = Record<string, number>;
type CountRecord = Partial<Record<SentryEventCategory, number>>;

const LOCAL_STORAGE_KEY = "token-nx:sentry-rate-limit:v1";
const SESSION_STORAGE_KEY = "token-nx:sentry-session-count:v1";
const MAX_LOCAL_SIGNATURES = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

const CATEGORY_LIMITS: Record<SentryEventCategory, CategoryLimit> = {
  critical: { cooldownMs: DAY_MS, sessionMax: 5 },
  chunk: { cooldownMs: DAY_MS, sessionMax: 1 },
  api: { cooldownMs: 60 * 60 * 1000, sessionMax: 3 },
};

let memoryTimestamps: TimestampRecord = {};
let memoryCounts: CountRecord = {};

function readRecord<T extends object>(
  storage: Storage | undefined,
  key: string,
  fallback: T,
): T {
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as T)
      : fallback;
  } catch {
    return fallback;
  }
}

function writeRecord(
  storage: Storage | undefined,
  key: string,
  value: object,
): boolean {
  if (!storage) return false;

  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function getStorage(
  kind: "localStorage" | "sessionStorage",
): Storage | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    return window[kind];
  } catch {
    return undefined;
  }
}

// 中文：哈希只用于浏览器本地限流键，不会作为业务或用户标识上传。
function hashSignature(signature: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < signature.length; index += 1) {
    hash ^= signature.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

function pruneTimestamps(
  record: TimestampRecord,
  now: number,
): TimestampRecord {
  return Object.fromEntries(
    Object.entries(record)
      .filter(
        ([, timestamp]) =>
          Number.isFinite(timestamp) && now - timestamp < DAY_MS,
      )
      .sort(([, left], [, right]) => right - left)
      .slice(0, MAX_LOCAL_SIGNATURES),
  );
}

export function normalizeSampleRate(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value.trim() === "") return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

export function passesSampleRate(rate: number, random = Math.random): boolean {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  return random() < rate;
}

export function canSendSentryEvent(
  category: SentryEventCategory,
  signature: string,
  now = Date.now(),
): boolean {
  const limit = CATEGORY_LIMITS[category];
  const localStorage = getStorage("localStorage");
  const sessionStorage = getStorage("sessionStorage");
  const timestamps = pruneTimestamps(
    readRecord<TimestampRecord>(
      localStorage,
      LOCAL_STORAGE_KEY,
      memoryTimestamps,
    ),
    now,
  );
  const counts = readRecord<CountRecord>(
    sessionStorage,
    SESSION_STORAGE_KEY,
    memoryCounts,
  );
  const signatureKey = `${category}:${hashSignature(signature)}`;

  if ((counts[category] ?? 0) >= limit.sessionMax) return false;
  if (
    timestamps[signatureKey] &&
    now - timestamps[signatureKey] < limit.cooldownMs
  )
    return false;

  timestamps[signatureKey] = now;
  counts[category] = (counts[category] ?? 0) + 1;

  if (!writeRecord(localStorage, LOCAL_STORAGE_KEY, timestamps))
    memoryTimestamps = timestamps;
  if (!writeRecord(sessionStorage, SESSION_STORAGE_KEY, counts))
    memoryCounts = counts;

  return true;
}

export function clearSentryRateLimitStateForTests(): void {
  memoryTimestamps = {};
  memoryCounts = {};

  try {
    window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // 中文：无存储权限时仅清理内存状态，保持测试和隐私模式兼容。
  }
}
