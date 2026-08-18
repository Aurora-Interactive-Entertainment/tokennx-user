import i18n from '@/i18n'
import { ApiError, fetchJson } from './http'

export const TOOL_USAGE_LEADERBOARD_PATH = '/api/homepage/tool-usage/leaderboard'
export const TOOL_USAGE_CLIENTS_PATH = '/api/homepage/tool-usage/clients'
export type ToolUsagePeriod = 'day' | 'week' | 'month' | 'year'

export interface ToolUsageLeaderboardItem {
  id: string
  rank: number
  name: string
  description: string
  logo_url?: string
  request_count: number
  total_tokens: number
}

export interface ToolUsageLeaderboard {
  period: ToolUsagePeriod
  items: ToolUsageLeaderboardItem[]
}

export interface ToolWeeklyUsage {
  week_start: number
  request_count: number
  total_tokens: number
}

export interface ToolUsageClientItem {
  id: string
  name: string
  description: string
  logo_url?: string
  total_count: number
  total_tokens: number
  weekly_usage: ToolWeeklyUsage[]
}

export interface ToolUsageClients {
  started_at?: number
  ended_at?: number
  generated_at?: number
  weeks: string[]
  items: ToolUsageClientItem[]
}

function invalidResponse(): never {
  throw new ApiError(i18n.t('api.homepage.invalidResponse'), 502, 100003, null)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return invalidResponse()
  return value.trim()
}

function numberValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return invalidResponse()
  return value
}

function optionalStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function optionalTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function periodValue(value: unknown): ToolUsagePeriod {
  if (value === 'day' || value === 'week' || value === 'month' || value === 'year') return value
  return invalidResponse()
}

function parseLeaderboard(value: unknown): ToolUsageLeaderboard {
  if (!isRecord(value) || !Array.isArray(value.items)) return invalidResponse()
  return {
    period: periodValue(value.period),
    items: value.items.map((item, index) => {
      if (!isRecord(item)) return invalidResponse()
      const rank = typeof item.rank === 'number' && Number.isInteger(item.rank) && item.rank > 0 ? item.rank : index + 1
      const logoUrl = optionalStringValue(item.logo_url)
      return {
        id: stringValue(item.id),
        rank,
        name: stringValue(item.name),
        description: typeof item.description === 'string' ? item.description.trim() : '',
        ...(logoUrl ? { logo_url: logoUrl } : {}),
        request_count: numberValue(item.request_count),
        total_tokens: numberValue(item.total_tokens),
      }
    }),
  }
}

function parseClients(value: unknown): ToolUsageClients {
  if (!isRecord(value) || !Array.isArray(value.weeks) || !Array.isArray(value.items)) return invalidResponse()
  const startedAt = optionalTimestamp(value.started_at)
  const endedAt = optionalTimestamp(value.ended_at)
  const generatedAt = optionalTimestamp(value.generated_at)
  return {
    ...(startedAt !== undefined ? { started_at: startedAt } : {}),
    ...(endedAt !== undefined ? { ended_at: endedAt } : {}),
    ...(generatedAt !== undefined ? { generated_at: generatedAt } : {}),
    weeks: value.weeks.map(stringValue),
    items: value.items.map((item) => {
      if (!isRecord(item) || !Array.isArray(item.weekly_usage)) return invalidResponse()
      const logoUrl = optionalStringValue(item.logo_url)
      return {
        id: stringValue(item.id),
        name: stringValue(item.name),
        description: typeof item.description === 'string' ? item.description.trim() : '',
        ...(logoUrl ? { logo_url: logoUrl } : {}),
        total_count: numberValue(item.total_count),
        total_tokens: numberValue(item.total_tokens),
        weekly_usage: item.weekly_usage.map((usage) => {
          if (!isRecord(usage)) return invalidResponse()
          return { week_start: numberValue(usage.week_start), request_count: numberValue(usage.request_count), total_tokens: numberValue(usage.total_tokens) }
        }),
      }
    }),
  }
}

export async function getToolUsageLeaderboard(period: ToolUsagePeriod, signal?: AbortSignal): Promise<ToolUsageLeaderboard> {
  const query = new URLSearchParams({ period })
  return parseLeaderboard(await fetchJson<unknown>(`${TOOL_USAGE_LEADERBOARD_PATH}?${query.toString()}`, { signal }))
}

export async function getToolUsageClients(signal?: AbortSignal): Promise<ToolUsageClients> {
  return parseClients(await fetchJson<unknown>(TOOL_USAGE_CLIENTS_PATH, { signal }))
}
