import { getAccessToken } from '@/auth/token-storage'
import type { ApiTimeValue } from '@/utils/format'
import { fetchAuthenticatedJson } from './authenticated'
import { ApiError, isApiError, type FetchJsonOptions } from './http'
import i18n from '@/i18n'

const USAGE_RECORDS_PATH = '/api/user/usage/records'
const USAGE_SUMMARY_PATH = '/api/user/usage/summary'

export const RECORDS_FIRST_PAGE = 1
export const RECORDS_PAGE_SIZE = 20
export const USAGE_SUMMARY_FIRST_PAGE = 1
export const USAGE_SUMMARY_PAGE_SIZE = 20

export type UsageRecordsContext = {
  account_type: 'personal' | 'enterprise'
  enterprise_id?: string
}

export type UsageRecordsStatus = 'all' | 'success' | 'error' | 'cancelled'
export type UsageRecordsSource = 'all' | 'api' | 'console-test'
export type UsageSummaryRange = 'today' | '7d' | '30d' | 'custom'

export type UsageRecordsQuery = {
  page?: number
  page_size?: number
  api_key_id?: string
  model?: string
  source?: UsageRecordsSource
  status?: UsageRecordsStatus
  member_id?: string
  request_id?: string
  start_at?: string
  end_at?: string
}

export type UsageSummaryQuery = {
  range?: UsageSummaryRange
  page?: number
  page_size?: number
  api_key_id?: string
  model?: string
  source?: UsageRecordsSource
  status?: UsageRecordsStatus
  member_id?: string
  start_at?: string
  end_at?: string
}

export interface UsageRecordsAccount {
  id: string
  type: 'personal' | 'enterprise' | string
  name: string
}

export interface UsageRecordApiKeyOption {
  id: string
  name: string
  source: string
}

export interface UsageRecordModelOption {
  code: string
  alias: string
  name: string
  vendor: string
}

export interface UsageRecordMemberOption {
  id: string
  name: string
}

export interface UsageRecordFilters {
  api_keys: UsageRecordApiKeyOption[]
  models: UsageRecordModelOption[]
  members: UsageRecordMemberOption[]
}

export interface UsageRecordItem {
  id: string
  request_id: string
  event_type: string
  occurred_at: ApiTimeValue
  model_code: string
  model_alias: string
  model_name: string
  client_platform: string
  status: Exclude<UsageRecordsStatus, 'all'> | string
  source: Exclude<UsageRecordsSource, 'all'> | string
  api_key_id?: string
  api_key_name: string
  member_id: string
  member_name: string
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  cache_hit_rate: number | null
  latency_ms: number | null
  first_token_ms: number | null
  stream: boolean | null
  relay_format?: string
  cost_yuan: string
  status_code?: number
  error_code?: string
  error_message?: string
  channel: string
  task_id?: string
  task_status?: string
  task_reason?: string
}

export interface UsageRecordsResponse {
  account: UsageRecordsAccount
  can_filter_members: boolean
  can_view_billing: boolean
  filters: UsageRecordFilters
  items: UsageRecordItem[]
  page: number
  page_size: number
  total: number
}

export interface UsageSummaryPeriod {
  range: UsageSummaryRange | string
  start_at: ApiTimeValue
  end_at: ApiTimeValue
  label: string
}

export interface UsageSummaryMetrics {
  request_count: number
  success_count: number
  error_count: number
  cancelled_count: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  total_cost_yuan: string
  average_latency_ms: number | null
  success_rate: number | null
}

export interface UsageSummaryTrendPoint {
  date: string
  request_count: number
  success_count: number
  error_count: number
  cancelled_count: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  cost_yuan: string
  average_latency_ms: number | null
}

export interface UsageSummaryDimension {
  id?: string
  code?: string
  alias?: string
  name: string
  requests: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  cost_yuan: string
  average_latency_ms: number | null
}

export interface UsageSummaryModelRow {
  model_code: string
  model_alias: string
  model_name: string
  vendor: string
  requests: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  cost_yuan: string
  average_latency_ms: number | null
}

export interface UsageSummaryResponse {
  account: UsageRecordsAccount
  can_filter_members: boolean
  can_view_billing: boolean
  filters: UsageRecordFilters
  period: UsageSummaryPeriod
  metrics: UsageSummaryMetrics
  trend: UsageSummaryTrendPoint[]
  models: UsageSummaryDimension[]
  api_keys: UsageSummaryDimension[]
  sources: UsageSummaryDimension[]
  model_rows: UsageSummaryModelRow[]
  page: number
  page_size: number
  total_models: number
}

export type UsageRecordsRequestOptions = UsageRecordsQuery & Pick<FetchJsonOptions, 'accessToken' | 'signal'>
export type UsageSummaryRequestOptions = UsageSummaryQuery & Pick<FetchJsonOptions, 'accessToken' | 'signal'>

// 中文：按稳定字段顺序拼接查询参数，保证请求日志和测试中的请求地址可复现。
export function createUsageRecordsQuery(context: UsageRecordsContext, query: UsageRecordsQuery = {}): string {
  const accountType = context.account_type
  if (accountType === 'enterprise' && !context.enterprise_id?.trim()) throw new Error('企业调用记录上下文缺少企业 ID')
  const params = new URLSearchParams()
  params.set('account_type', accountType)
  if (accountType === 'enterprise') params.set('enterprise_id', context.enterprise_id!.trim())
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (value === 'all') return
    params.set(key, String(value))
  })
  return params.toString()
}

export function getUsageRecords(context: UsageRecordsContext, options: UsageRecordsRequestOptions = {}): Promise<UsageRecordsResponse> {
  const query = {
    page: options.page ?? RECORDS_FIRST_PAGE,
    page_size: options.page_size ?? RECORDS_PAGE_SIZE,
    api_key_id: options.api_key_id,
    model: options.model,
    source: options.source,
    status: options.status,
    member_id: options.member_id,
    request_id: options.request_id,
    start_at: options.start_at,
    end_at: options.end_at,
  } satisfies UsageRecordsQuery
  const queryString = createUsageRecordsQuery(context, query)
  const path = `${USAGE_RECORDS_PATH}?${queryString}`
  return fetchAuthenticatedJson<UsageRecordsResponse>(path, { accessToken: options.accessToken ?? getAccessToken() ?? undefined, signal: options.signal })
}

// 中文：摘要查询与调用记录共用账务主体上下文，但保留独立参数构造，避免页面误把详情参数发给摘要接口。
export function createUsageSummaryQuery(context: UsageRecordsContext, query: UsageSummaryQuery = {}): string {
  const accountType = context.account_type
  if (accountType === 'enterprise' && !context.enterprise_id?.trim()) throw new Error('企业用量统计上下文缺少企业 ID')
  const params = new URLSearchParams()
  params.set('account_type', accountType)
  if (accountType === 'enterprise') params.set('enterprise_id', context.enterprise_id!.trim())
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (value === 'all') return
    params.set(key, String(value))
  })
  return params.toString()
}

export function getUsageSummary(context: UsageRecordsContext, options: UsageSummaryRequestOptions = {}): Promise<UsageSummaryResponse> {
  const query = {
    range: options.range,
    page: options.page ?? USAGE_SUMMARY_FIRST_PAGE,
    page_size: options.page_size ?? USAGE_SUMMARY_PAGE_SIZE,
    api_key_id: options.api_key_id,
    model: options.model,
    source: options.source,
    status: options.status,
    member_id: options.member_id,
    start_at: options.start_at,
    end_at: options.end_at,
  } satisfies UsageSummaryQuery
  const queryString = createUsageSummaryQuery(context, query)
  const path = `${USAGE_SUMMARY_PATH}?${queryString}`
  return fetchAuthenticatedJson<UsageSummaryResponse>(path, { accessToken: options.accessToken ?? getAccessToken() ?? undefined, signal: options.signal })
}

export function getUsageRecordsErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.code === 120002 || error.status === 403) return i18n.t('api.usage.records.forbidden')
    if (error.code === 100001 || error.status === 400) return i18n.t('api.usage.records.invalidQuery')
    if (error.code === 100002 || error.status >= 500) return i18n.t('api.usage.records.unavailable')
  }
  return i18n.t('api.usage.records.requestFailed')
}

export function getUsageRecordsRequestId(error: unknown): string | null {
  return error instanceof ApiError ? error.requestId : null
}

export function getUsageSummaryErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.code === 120002 || error.status === 403) return i18n.t('api.usage.summary.forbidden')
    if (error.code === 100001 || error.status === 400) return i18n.t('api.usage.summary.invalidQuery')
    if (error.code === 100002 || error.status >= 500) return i18n.t('api.usage.summary.unavailable')
  }
  return i18n.t('api.usage.summary.requestFailed')
}

export function getUsageSummaryRequestId(error: unknown): string | null {
  return error instanceof ApiError ? error.requestId : null
}
