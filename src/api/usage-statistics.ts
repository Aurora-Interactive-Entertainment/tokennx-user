import i18n from '@/i18n'
import { getAccessToken } from '@/auth/token-storage'
import type { ApiTimestamp } from '@/utils/format'
import { fetchAuthenticatedJson } from './authenticated'
import { ApiError, isApiError, type FetchJsonOptions } from './http'

const FILTERS_PATH = '/api/user/usage/filters'
const SUMMARY_PATH = '/api/user/usage/summary'
const TREND_PATH = '/api/user/usage/trend'
const MODELS_PATH = '/api/user/usage/models'

export const USAGE_MODELS_PAGE_SIZE = 20

export type UsageStatisticsContext = { account_type: 'personal' | 'enterprise'; enterprise_id?: string }
export type UsageStatisticsRange = 'today' | '7d' | '30d' | 'custom'
export type UsageStatisticsSource = 'all' | 'api' | 'console-test'
export type UsageStatisticsStatus = 'all' | 'success' | 'error' | 'cancelled'
export type UsageTrendGranularity = 'hour' | 'day' | 'week' | 'month'
export type UsageTrendMetric = 'requests' | 'tokens' | 'cost'

export type UsageStatisticsQuery = {
  range?: UsageStatisticsRange
  api_key_id?: string
  model?: string
  source?: UsageStatisticsSource
  status?: UsageStatisticsStatus
  member_id?: string
  start_at?: ApiTimestamp
  end_at?: ApiTimestamp
}

export type UsageTrendQuery = UsageStatisticsQuery & { granularity?: UsageTrendGranularity; metric?: UsageTrendMetric }
export type UsageModelsQuery = UsageStatisticsQuery & { page?: number; page_size?: number }
export type UsageStatisticsRequestOptions = Pick<FetchJsonOptions, 'accessToken' | 'signal'>
type QueryWithRequestOptions<T extends object> = T & UsageStatisticsRequestOptions

export interface UsageFiltersResponse {
  can_filter_members: boolean
  models: { code: string; alias: string; name: string; requests?: number }[]
  api_keys: { id: string; name: string; source: string; requests?: number }[]
  statuses: { value: Exclude<UsageStatisticsStatus, 'all'>; requests?: number }[]
  members: { id: string; name: string }[]
}

export interface UsageSummaryResponse {
  can_view_billing: boolean
  metrics: {
    request_count: number
    input_tokens: number
    output_tokens: number
    total_cost_yuan: string
    average_latency_ms: number | null
    success_rate: number | null
  }
}

export interface UsageTrendBucket {
  bucket_start: number
  request_count?: number
  input_tokens?: number
  output_tokens?: number
  cached_tokens?: number
  cost_yuan?: string
  models?: { model_code: string; model_alias: string; model_name: string; request_count?: number; input_tokens?: number; output_tokens?: number; cached_tokens?: number; cost_yuan?: string }[]
}

export interface UsageDistributionItem {
  code?: string
  alias?: string
  name: string
  id?: string
  request_count?: number
  input_tokens?: number
  output_tokens?: number
  cached_tokens?: number
  cost_yuan?: string
}

export interface UsageTrendResponse {
  can_view_billing: boolean
  period: { range: UsageStatisticsRange | string; start_at: number; end_at: number; label?: string }
  granularity: UsageTrendGranularity
  metric: UsageTrendMetric
  buckets: UsageTrendBucket[]
  model_distribution: UsageDistributionItem[]
  api_key_distribution: UsageDistributionItem[]
}

export interface UsageModelRow {
  model_code: string
  model_alias: string
  model_name: string
  vendor: string
  requests: number
  input_tokens: number
  output_tokens: number
  cached_tokens?: number
  cost_yuan: string
  average_latency_ms: number | null
}

export interface UsageModelsResponse {
  can_view_billing: boolean
  items: UsageModelRow[]
  page: number
  page_size: number
  total: number
}

function queryString(context: UsageStatisticsContext, query: Record<string, unknown> = {}): string {
  if (context.account_type === 'enterprise' && !context.enterprise_id?.trim()) throw new Error('enterprise usage context is missing enterprise ID')
  const params = new URLSearchParams({ account_type: context.account_type })
  if (context.account_type === 'enterprise') params.set('enterprise_id', context.enterprise_id!.trim())
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value !== 'all') params.set(key, String(value))
  })
  return params.toString()
}

function request<T>(path: string, context: UsageStatisticsContext, query: Record<string, unknown>, options: UsageStatisticsRequestOptions = {}): Promise<T> {
  return fetchAuthenticatedJson<T>(`${path}?${queryString(context, query)}`, { accessToken: options.accessToken ?? getAccessToken() ?? undefined, signal: options.signal })
}

function splitQueryOptions<T extends object>(query: QueryWithRequestOptions<T>, options?: UsageStatisticsRequestOptions): { query: T; options: UsageStatisticsRequestOptions } {
  const { accessToken, signal, ...requestQuery } = query
  return { query: requestQuery as T, options: options ?? { accessToken, signal } }
}

export function createUsageStatisticsQuery(context: UsageStatisticsContext, query: Record<string, unknown> = {}): string {
  return queryString(context, query)
}

export function getUsageFilters(context: UsageStatisticsContext, options?: UsageStatisticsRequestOptions): Promise<UsageFiltersResponse> {
  return request(FILTERS_PATH, context, {}, options)
}

export function getUsageSummary(context: UsageStatisticsContext, query: QueryWithRequestOptions<UsageStatisticsQuery> = {}, options?: UsageStatisticsRequestOptions): Promise<UsageSummaryResponse> {
  const requestParts = splitQueryOptions(query, options)
  return request(SUMMARY_PATH, context, requestParts.query, requestParts.options)
}

export function getUsageTrend(context: UsageStatisticsContext, query: QueryWithRequestOptions<UsageTrendQuery> = {}, options?: UsageStatisticsRequestOptions): Promise<UsageTrendResponse> {
  const requestParts = splitQueryOptions(query, options)
  return request(TREND_PATH, context, requestParts.query, requestParts.options)
}

export function getUsageModels(context: UsageStatisticsContext, query: QueryWithRequestOptions<UsageModelsQuery> = {}, options?: UsageStatisticsRequestOptions): Promise<UsageModelsResponse> {
  const requestParts = splitQueryOptions(query, options)
  return request(MODELS_PATH, context, { page: 1, page_size: USAGE_MODELS_PAGE_SIZE, ...requestParts.query }, requestParts.options)
}

export function getUsageStatisticsErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.code === 120002 || error.status === 403) return i18n.t('api.usage.summary.forbidden')
    if (error.code === 100001 || error.status === 400) return i18n.t('api.usage.summary.invalidQuery')
    if (error.code === 100002 || error.status >= 500) return i18n.t('api.usage.summary.unavailable')
  }
  return i18n.t('api.usage.summary.requestFailed')
}

export function getUsageStatisticsRequestId(error: unknown): string | null {
  return error instanceof ApiError ? error.requestId : null
}
