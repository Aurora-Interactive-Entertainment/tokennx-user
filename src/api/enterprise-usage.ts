import { getAccessToken } from '@/auth/token-storage'
import { fetchAuthenticatedJson } from './authenticated'
import {
  createEnterpriseQuery,
  type EnterpriseListOptions,
  type EnterpriseRequestContext,
  type EnterpriseUsageItem as CanonicalEnterpriseUsageItem,
  type EnterpriseUsageModelFilter as CanonicalEnterpriseUsageModelFilter,
  type EnterpriseUsageMemberFilter as CanonicalEnterpriseUsageMemberFilter,
  type EnterpriseUsageResponse as CanonicalEnterpriseUsageResponse,
} from './enterprise-console'

export type EnterpriseUsageRange = 'today' | '7d' | '30d' | 'custom'
export type EnterpriseUsageStatus = 'all' | 'success' | 'error' | 'cancelled'
// 企业用量主接口固定按 UTC 自然日聚合；保留别名仅供旧类型导入，不能作为请求参数。
export type EnterpriseUsageGranularity = 'day'

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

export type EnterpriseUsageModelFilter = CanonicalEnterpriseUsageModelFilter

export type EnterpriseUsageMemberFilter = CanonicalEnterpriseUsageMemberFilter

export type EnterpriseUsageAggregateItem = CanonicalEnterpriseUsageItem
export type EnterpriseUsageDetailResponse = CanonicalEnterpriseUsageResponse

type UsagePeriodRequest = EnterpriseListOptions & {
  range?: EnterpriseUsageRange
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
  range?: EnterpriseUsageRange
  start_at?: string | number
  end_at?: string | number
  member_id?: string
  model?: string
  status?: EnterpriseUsageStatus
  page?: number
  page_size?: number
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
    start_at: options.start_at,
    end_at: options.end_at,
  }
}

export function getEnterpriseUsageSummary(
  context: EnterpriseRequestContext,
  options: UsagePeriodRequest = {},
): Promise<EnterpriseUsageSummaryResponse> {
  // @deprecated 旧版摘要路由仅保留灰度兼容；新页面统一调用主用量入口。
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
  // @deprecated 旧版人员聚合路由仅保留灰度兼容；主入口不再返回成员聚合。
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
  // @deprecated 旧版部门聚合路由仅保留灰度兼容；主入口不再返回部门聚合。
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
  })
  return fetchAuthenticatedJson<EnterpriseUsageDetailResponse>(
    `${usagePath(context)}?${query}`,
    requestOptions(options),
  )
}

// 当前合同的主入口名称与后端路由一致；保留 Detail 别名供旧页面调用，二者
// 必须共享同一请求构造逻辑，避免灰度期间一个入口又带回废弃参数。
export function getEnterpriseUsage(
  context: EnterpriseRequestContext,
  options: EnterpriseUsageDetailRequest = {},
): Promise<EnterpriseUsageDetailResponse> {
  return getEnterpriseUsageDetail(context, options)
}
