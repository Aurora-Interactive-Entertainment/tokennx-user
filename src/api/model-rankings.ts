import i18n from '@/i18n'
import { isApiTimestamp, type ApiTimestamp } from '@/utils/format'
import { ApiError, fetchJson } from './http'

export const MODEL_USAGE_LEADERBOARD_PATH = '/api/homepage/model-usage/leaderboard'
export const MODEL_USAGE_RECENT_PATH = '/api/homepage/model-usage/recent'

export type ModelUsagePeriod = 'day' | 'week' | 'month' | 'year'

export interface ModelUsageLeaderboardItem {
  rank: number
  code: string
  name: string
  total_tokens: number
  request_count: number
  previous_tokens: number
  change_rate: number | null
}

export interface ModelUsageLeaderboard {
  period: ModelUsagePeriod
  started_at: ApiTimestamp
  ended_at: ApiTimestamp
  previous_from: ApiTimestamp
  previous_to: ApiTimestamp
  items: ModelUsageLeaderboardItem[]
}

export interface ModelMonthlyUsage {
  month: string
  total_tokens: number
  request_count: number
}

export interface RecentModelUsageItem {
  rank: number
  code: string
  name: string
  total_tokens: number
  request_count: number
  monthly_usage: ModelMonthlyUsage[]
}

export interface RecentModelUsage {
  months: string[]
  items: RecentModelUsageItem[]
}

function invalidResponse(): never {
  throw new ApiError(i18n.t('api.homepage.invalidResponse'), 502, 100003, null)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseNonNegativeNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) invalidResponse()
  return value
}

function parseRank(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) invalidResponse()
  return value
}

function parseString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) invalidResponse()
  return value.trim()
}

function parseTime(value: unknown): ApiTimestamp {
  if (isApiTimestamp(value)) return value
  return invalidResponse()
}

function parseChangeRate(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) invalidResponse()
  return value
}

function parsePeriod(value: unknown): ModelUsagePeriod {
  if (value === 'day' || value === 'week' || value === 'month' || value === 'year') return value
  return invalidResponse()
}

function parseLeaderboardItem(value: unknown): ModelUsageLeaderboardItem {
  if (!isRecord(value)) invalidResponse()
  return {
    rank: parseRank(value.rank),
    code: parseString(value.code),
    name: parseString(value.name),
    total_tokens: parseNonNegativeNumber(value.total_tokens),
    request_count: parseNonNegativeNumber(value.request_count),
    previous_tokens: parseNonNegativeNumber(value.previous_tokens),
    change_rate: parseChangeRate(value.change_rate),
  }
}

function parseLeaderboard(value: unknown): ModelUsageLeaderboard {
  if (!isRecord(value) || !Array.isArray(value.items)) invalidResponse()
  return {
    period: parsePeriod(value.period),
    started_at: parseTime(value.started_at),
    ended_at: parseTime(value.ended_at),
    previous_from: parseTime(value.previous_from),
    previous_to: parseTime(value.previous_to),
    items: value.items.map(parseLeaderboardItem),
  }
}

function parseMonthlyUsage(value: unknown): ModelMonthlyUsage {
  if (!isRecord(value)) invalidResponse()
  return {
    month: parseString(value.month),
    total_tokens: parseNonNegativeNumber(value.total_tokens),
    request_count: parseNonNegativeNumber(value.request_count),
  }
}

function parseRecentItem(value: unknown): RecentModelUsageItem {
  if (!isRecord(value) || !Array.isArray(value.monthly_usage)) invalidResponse()
  return {
    rank: parseRank(value.rank),
    code: parseString(value.code),
    name: parseString(value.name),
    total_tokens: parseNonNegativeNumber(value.total_tokens),
    request_count: parseNonNegativeNumber(value.request_count),
    monthly_usage: value.monthly_usage.map(parseMonthlyUsage),
  }
}

function parseRecentUsage(value: unknown): RecentModelUsage {
  if (!isRecord(value) || !Array.isArray(value.months) || !Array.isArray(value.items)) invalidResponse()
  return {
    months: value.months.map(parseString),
    items: value.items.map(parseRecentItem),
  }
}

export async function getModelUsageLeaderboard(period: ModelUsagePeriod, signal?: AbortSignal): Promise<ModelUsageLeaderboard> {
  const query = new URLSearchParams({ period })
  return parseLeaderboard(await fetchJson<unknown>(`${MODEL_USAGE_LEADERBOARD_PATH}?${query.toString()}`, { signal }))
}

export async function getRecentModelUsage(signal?: AbortSignal): Promise<RecentModelUsage> {
  return parseRecentUsage(await fetchJson<unknown>(MODEL_USAGE_RECENT_PATH, { signal }))
}
