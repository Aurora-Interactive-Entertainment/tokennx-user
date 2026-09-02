import { getAccessToken } from '@/auth/token-storage'
import { fetchAuthenticatedJson } from './authenticated'
import {
  createEnterpriseQuery,
  type EnterpriseListOptions,
  type EnterpriseRequestContext,
} from './enterprise-console'

export type EnterpriseUsageRange = 'today' | '7d' | '30d' | 'custom' | 'month'
export type EnterpriseUsageStatus = 'all' | 'success' | 'error' | 'cancelled'
export type EnterpriseUsageGranularity = 'hour' | 'day' | 'week' | 'month'

export interface EnterpriseUsagePeriod {
  range: string
  start_at: string | number
  end_at: string | number
  label?: string
}

export interface EnterpriseUsageSummary {
  total_cost_yuan: string
  account_amount_yuan?: string
  request_count: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
}

export interface EnterpriseUsageSummaryResponse {
  summary: EnterpriseUsageSummary
  account_amount_yuan?: string
  period: EnterpriseUsagePeriod
}

export interface EnterpriseUsageMember {
  member_id: string
  member_name: string
  email: string
  department_name: string
  total_tokens: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  request_count: number
  cost_yuan: string
}

export interface EnterpriseUsageDepartment {
  department_id: string
  department_name: string
  total_tokens: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  request_count: number
  cost_yuan: string
}

export interface EnterpriseUsagePage<T> {
  items: T[]
  period: EnterpriseUsagePeriod
  total: number
  page: number
  page_size: number
}

export interface EnterpriseUsageModelFilter {
  code: string
  alias: string
  name: string
  vendor: string
}

export interface EnterpriseUsageMemberFilter {
  id: string
  name: string
  // 中文：兼容后端在人员筛选目录中返回的脱敏联系方式。
  masked_contact?: string
  phone?: string
  email?: string
}

export interface EnterpriseUsageAggregateItem {
  id: string
  bucket_start: number
  bucket_end: number
  granularity: EnterpriseUsageGranularity
  model_code: string
  model_alias: string
  model_name: string
  vendor: string
  requests: number
  success_count: number
  error_count: number
  cancelled_count: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  cost_yuan: string
  average_latency_ms: number | null
}

export interface EnterpriseUsageDetailResponse {
  account: { id: string; type: 'enterprise'; name: string }
  can_filter_members: boolean
  can_view_billing: boolean
  filters: {
    models: EnterpriseUsageModelFilter[]
    api_keys: Array<{ id: string; name: string }>
    members: EnterpriseUsageMemberFilter[]
  }
  items: EnterpriseUsageAggregateItem[]
  granularity: EnterpriseUsageGranularity
  page: number
  page_size: number
  total: number
}

type UsagePeriodRequest = EnterpriseListOptions & {
  range?: EnterpriseUsageRange
  month?: string
  start_at?: string | number
  end_at?: string | number
}

export type EnterpriseUsageMembersRequest = UsagePeriodRequest & {
  keyword?: string
  page?: number
  page_size?: number
}

export type EnterpriseUsageDepartmentsRequest = UsagePeriodRequest & {
  department_name?: string
  page?: number
  page_size?: number
}

export type EnterpriseUsageDetailRequest = EnterpriseListOptions & {
  range?: Exclude<EnterpriseUsageRange, 'month'>
  start_at?: string | number
  end_at?: string | number
  member_id?: string
  model?: string
  status?: EnterpriseUsageStatus
  page?: number
  page_size?: number
  granularity?: EnterpriseUsageGranularity
}

function usagePath(context: EnterpriseRequestContext, suffix = ''): string {
  const enterpriseID = context.enterprise_id.trim()
  if (!enterpriseID) throw new Error('enterprise_id is required')
  return `/api/user/enterprise/${encodeURIComponent(enterpriseID)}/usage${suffix}`
}

function requestOptions(options: EnterpriseListOptions): EnterpriseListOptions {
  return {
    accessToken: options.accessToken ?? getAccessToken() ?? undefined,
    signal: options.signal,
  }
}

function periodQuery(options: UsagePeriodRequest): Record<string, string | number | undefined> {
  return {
    range: options.range,
    month: options.month,
    start_at: options.start_at,
    end_at: options.end_at,
  }
}

export function getEnterpriseUsageSummary(
  context: EnterpriseRequestContext,
  options: UsagePeriodRequest = {},
): Promise<EnterpriseUsageSummaryResponse> {
  const query = createEnterpriseQuery(periodQuery(options))
  return fetchAuthenticatedJson<EnterpriseUsageSummaryResponse>(
    `${usagePath(context, '/summary')}${query ? `?${query}` : ''}`,
    requestOptions(options),
  )
}

export function getEnterpriseUsageMembers(
  context: EnterpriseRequestContext,
  options: EnterpriseUsageMembersRequest = {},
): Promise<EnterpriseUsagePage<EnterpriseUsageMember>> {
  const query = createEnterpriseQuery({
    ...periodQuery(options),
    keyword: options.keyword,
    page: options.page ?? 1,
    page_size: options.page_size ?? 20,
  })
  return fetchAuthenticatedJson<EnterpriseUsagePage<EnterpriseUsageMember>>(
    `${usagePath(context, '/members')}?${query}`,
    requestOptions(options),
  )
}

export function getEnterpriseUsageDepartments(
  context: EnterpriseRequestContext,
  options: EnterpriseUsageDepartmentsRequest = {},
): Promise<EnterpriseUsagePage<EnterpriseUsageDepartment>> {
  const query = createEnterpriseQuery({
    ...periodQuery(options),
    department_name: options.department_name,
    page: options.page ?? 1,
    page_size: options.page_size ?? 20,
  })
  return fetchAuthenticatedJson<EnterpriseUsagePage<EnterpriseUsageDepartment>>(
    `${usagePath(context, '/departments')}?${query}`,
    requestOptions(options),
  )
}

export function getEnterpriseUsageDetail(
  context: EnterpriseRequestContext,
  options: EnterpriseUsageDetailRequest = {},
): Promise<EnterpriseUsageDetailResponse> {
  const query = createEnterpriseQuery({
    range: options.range,
    start_at: options.start_at,
    end_at: options.end_at,
    member_id: options.member_id,
    model: options.model,
    status: options.status,
    page: options.page ?? 1,
    page_size: options.page_size ?? 20,
    // The enterprise endpoint defaults to daily buckets. Only send this
    // parameter when a caller explicitly requests another granularity.
    granularity: options.granularity,
  })
  return fetchAuthenticatedJson<EnterpriseUsageDetailResponse>(
    `${usagePath(context)}?${query}`,
    requestOptions(options),
  )
}
