import i18n from '@/i18n'
import { ApiError, fetchJson } from './http'

export const TOOL_USAGE_LEADERBOARD_PATH = '/api/homepage/tool-usage/leaderboard'
export const TOOL_USAGE_CLIENTS_PATH = '/api/homepage/tool-usage/clients'
export type ToolUsagePeriod = 'day' | 'week' | 'month' | 'year'

export interface ToolUsageLeaderboardItem {
  rank: number
  tool: string
  request_count: number
  total_tokens: number
}

export interface ToolUsageLeaderboard {
  period: ToolUsagePeriod
  items: ToolUsageLeaderboardItem[]
}

export interface ToolMonthlyUsage {
  month: string
  request_count: number
  total_tokens: number
}

export interface ToolUsageClientItem {
  tool: string
  total_count: number
  total_tokens: number
  monthly_usage: ToolMonthlyUsage[]
}

export interface ToolUsageClients {
  months: string[]
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
      return { rank, tool: stringValue(item.tool), request_count: numberValue(item.request_count), total_tokens: numberValue(item.total_tokens) }
    }),
  }
}

function parseClients(value: unknown): ToolUsageClients {
  if (!isRecord(value) || !Array.isArray(value.months) || !Array.isArray(value.items)) return invalidResponse()
  return {
    months: value.months.map(stringValue),
    items: value.items.map((item) => {
      if (!isRecord(item) || !Array.isArray(item.monthly_usage)) return invalidResponse()
      return {
        tool: stringValue(item.tool),
        total_count: numberValue(item.total_count),
        total_tokens: numberValue(item.total_tokens),
        monthly_usage: item.monthly_usage.map((usage) => {
          if (!isRecord(usage)) return invalidResponse()
          return { month: stringValue(usage.month), request_count: numberValue(usage.request_count), total_tokens: numberValue(usage.total_tokens) }
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
