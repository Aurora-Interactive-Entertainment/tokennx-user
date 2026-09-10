import { getAccessToken } from '@/auth/token-storage'
import type { ApiTimeValue, ApiTimestamp } from '@/utils/format'
import i18n from '@/i18n'
import { fetchAuthenticatedJson } from './authenticated'
import { ApiError, isApiError, type FetchJsonOptions } from './http'
import { fetchJson } from './http'

const ENTERPRISE_PATH = '/api/user/enterprise'

export const ENTERPRISE_FIRST_PAGE = 1
export const ENTERPRISE_PAGE_SIZE = 20

// 新版企业接口将乐观锁版本序列化为十进制字符串；灰度旧服务仍可能返回数字。
// 调用方应原样回传，不要先做 Number 转换以免大版本号失真。
export type EnterpriseVersion = string | number

export type EnterpriseRequestContext = {
  enterprise_id: string
}

export interface EnterpriseCapabilities {
  can_manage_members: boolean
  can_manage_roles: boolean
  can_manage_tags: boolean
  // 成员接口示例在新契约中返回该能力；旧上下文可能省略。
  can_manage_api_keys?: boolean
  can_manage_models: boolean
  can_manage_usage: boolean
  can_view_models: boolean
  can_view_usage: boolean
  can_view_audit: boolean
  can_view_analytics: boolean
  // 部门接口使用的细粒度能力；旧服务端可能省略，故保持可选兼容。
  can_view_departments?: boolean
  can_manage_departments?: boolean
  can_manage_department_members?: boolean
}

export interface EnterpriseRoleOption {
  code: string
  name: string
  owner_role: boolean
}

export interface EnterpriseContext {
  id: string
  name: string
  code: string
  member_id: string
  role: string
  roles: string[]
  role_options?: EnterpriseRoleOption[]
  permissions?: string[]
  capabilities: EnterpriseCapabilities
}

export interface EnterprisePermissionDefinition {
  id: string
  code: string
  name: string
  description: string
  resource: string
  action: string
  depends_on: string[]
}

export interface EnterpriseRole {
  id: string
  code: string
  name: string
  description: string
  built_in: boolean
  owner_role: boolean
  status: string
  // 新版接口以十进制字符串返回版本；旧部署仍可能返回 number。
  version: EnterpriseVersion
  member_count: number
  invitation_count: number
  permission_codes: string[]
}

export interface EnterpriseGovernanceResponse {
  context: EnterpriseContext
  permissions: EnterprisePermissionDefinition[]
  roles: EnterpriseRole[]
}

export interface EnterpriseModel {
  id: string
  code: string
  name: string
  company: string
  modality: string
  capabilities: string[]
  enabled: boolean
  // 新版模型目录同时返回企业可见范围；旧灰度响应可能暂时省略该字段。
  visibility?: EnterpriseModelVisibility
  // 新版接口以十进制字符串返回版本；旧部署仍可能返回 number。
  setting_version: EnterpriseVersion
}

export interface EnterpriseModelVisibilityTarget {
  id: string
  name: string
}

export interface EnterpriseModelVisibility {
  scope: 'all' | 'partial'
  departments: EnterpriseModelVisibilityTarget[]
  members: EnterpriseModelVisibilityTarget[]
}

export interface EnterpriseModelPage {
  context: EnterpriseContext
  items: EnterpriseModel[]
  total: number
  page: number
  page_size: number
  enabled_count: number
  disabled_count: number
}

export interface EnterpriseTagRef {
  id: string
  name: string
}

export interface EnterpriseBudget {
  cost_limit_yuan: string | null
  period_type: string
  used_cost_yuan: string
  usage_percent: number | null
  version: EnterpriseVersion
}

export interface EnterpriseMember {
  id: string
  user_id: string
  display_name: string
  avatar_url: string
  masked_contact: string
  status: string
  join_source: string
  joined_at: ApiTimestamp
  exited_at?: ApiTimestamp | null
  role: string
  roles: string[]
  tags: EnterpriseTagRef[]
  budget?: EnterpriseBudget | null
  // 新版接口以十进制字符串返回版本；保留 number 以兼容灰度中的旧响应。
  version: EnterpriseVersion
  department?: { id: string; name: string } | null
}

export interface EnterpriseMemberPage {
  context: EnterpriseContext
  items: EnterpriseMember[]
  total: number
  page: number
  page_size: number
}

export interface EnterpriseDepartmentLimits {
  daily_cost_limit_yuan: string | null
  weekly_cost_limit_yuan: string | null
  monthly_cost_limit_yuan: string | null
  concurrency_limit: number | null
  rpm_limit: number | null
  tpm_limit: number | null
}

export interface EnterpriseDepartment {
  id: string
  parent_id?: string | null
  name: string
  depth: number
  child_count: number
  member_count: number
  limits?: { configured: EnterpriseDepartmentLimits; effective: EnterpriseDepartmentLimits }
  // 新版接口以十进制字符串返回版本；旧部署仍可能返回 number。
  version: EnterpriseVersion
  created_at: ApiTimeValue
  updated_at: ApiTimeValue
}

export interface EnterpriseDepartmentPage {
  context: EnterpriseContext
  items: EnterpriseDepartment[]
  total: number
  page: number
  page_size: number
}

export interface EnterpriseTag {
  id: string
  name: string
  description: string
  daily_cost_limit_yuan: string | null
  weekly_cost_limit_yuan: string | null
  monthly_cost_limit_yuan: string | null
  concurrency_limit: number | null
  rpm_limit: number | null
  tpm_limit: number | null
  allowed_models: string[]
  member_count: number
  version: EnterpriseVersion
  created_at: ApiTimestamp
  updated_at: ApiTimestamp
}

export interface EnterpriseJoinRequest {
  id: string
  applicant_user_id: string
  invitation_link_id?: string
  applicant_name: string
  applicant_contact: string
  requested_role: string
  request_message: string
  status: string
  rejection_reason?: string
  reviewed_by_member_id?: string
  reviewed_at?: ApiTimeValue | null
  created_at: ApiTimeValue
  updated_at: ApiTimeValue
  version: EnterpriseVersion
}

export interface EnterpriseJoinRequestPage {
  context: EnterpriseContext
  items: EnterpriseJoinRequest[]
  total: number
  page: number
  page_size: number
}

export interface EnterpriseInvitation {
  id: string
  role: string
  role_name: string
  // 创建/列表投影会返回目标部门；旧服务端及 revoke 写响应可能省略。
  department_id?: string
  department_name?: string
  max_uses: number
  used_count: number
  expires_at?: ApiTimeValue | null
  status: string
  inviter_name: string
  created_at: ApiTimeValue
  updated_at: ApiTimeValue
  invite_token?: string
  invite_url?: string
  version: EnterpriseVersion
}

export interface EnterpriseInvitationPage {
  context: EnterpriseContext
  items: EnterpriseInvitation[]
  total: number
  page: number
  page_size: number
}

export interface EnterpriseInvitationUsage {
  user_id: string
  member_id?: string
  user_name: string
  joined_at: ApiTimeValue
}

export interface EnterpriseInvitationUsageList {
  items: EnterpriseInvitationUsage[]
}

export interface EnterpriseInvitationPreview {
  id: string
  enterprise_id: string
  enterprise_name: string
  enterprise_code: string
  role: string
  role_name: string
  inviter_name: string
  max_uses: number
  used_count: number
  expires_at?: ApiTimestamp | null
  status: string
  already_member: boolean
  pending_request: boolean
}

export interface EnterpriseUsagePeriod {
  range: string
  start_at: ApiTimeValue
  end_at: ApiTimeValue
  label: string
}

export interface EnterpriseUsageMetrics {
  request_count: number
  success_count: number
  error_count: number
  cancelled_count: number
  active_members: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  total_cost_yuan: string
  average_latency_ms: number | null
  success_rate: number | null
}

export interface EnterpriseMemberUsage {
  member_id: string
  member_name: string
  role: string
  tags: EnterpriseTagRef[]
  request_count: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  cost_yuan: string
  budget?: EnterpriseBudget | null
}

export interface EnterpriseUsageTrendPoint {
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

export interface EnterpriseDimensionUsage {
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

export interface EnterpriseMemberUsageDetail {
  member_id: string
  member_name: string
  metrics: EnterpriseUsageMetrics
  trend: EnterpriseUsageTrendPoint[]
  models: EnterpriseDimensionUsage[]
  api_keys?: EnterpriseDimensionUsage[]
  sources: EnterpriseDimensionUsage[]
}

/**
 * 企业用量明细（当前合同）。
 *
 * 该接口已经从旧版 period/metrics/trend/member 聚合切换为“UTC 日时间桶 +
 * 模型”行。不要在这里重新引入旧字段；需要旧服务灰度时应在边界适配，不能
 * 让页面继续依赖旧响应结构。
 */
export interface EnterpriseUsageModelFilter {
  code: string
  alias: string
  name: string
  vendor: string
}

export interface EnterpriseUsageMemberFilter {
  id: string
  name: string
  // 灰度服务可能返回联系方式，页面只作展示，不参与请求参数。
  masked_contact?: string
  member_id?: string
  user_id?: string
  masked_phone?: string
  phone_masked?: string
  phone?: string
  email?: string
}

export interface EnterpriseUsageItem {
  id: string
  bucket_start: number
  bucket_end: number
  granularity: 'day'
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

export interface EnterpriseUsageResponse {
  account: { id: string; type: 'enterprise'; name: string }
  can_filter_members: boolean
  can_view_billing: boolean
  filters: {
    models: EnterpriseUsageModelFilter[]
    api_keys: Array<{ id: string; name: string }>
    members: EnterpriseUsageMemberFilter[]
  }
  items: EnterpriseUsageItem[]
  granularity: 'day'
  page: number
  page_size: number
  total: number
}

export interface EnterpriseAnalyticsMetrics {
  request_count: number
  cached_tokens: number
  active_members: number
  total_members: number
  success_rate: number | null
  average_latency_ms: number | null
  peak_rpm: number
  peak_tpm: number
  latest_data_date: string
  latest_day_input_tokens: number
  latest_day_output_tokens: number
  cumulative_input_tokens: number
  cumulative_output_tokens: number
  cumulative_request_count: number
}

export interface EnterpriseAnalyticsTool {
  id: string
  name: string
  request_count: number
  total_tokens: number
  cost_yuan: string
  latest_day_cost_yuan: string
}

export interface EnterpriseAnalyticsMember {
  id: string
  name: string
  role: string
  request_count: number
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cost_yuan: string
}

export interface EnterpriseAnalyticsModel {
  id?: string
  code: string
  alias: string
  name: string
  request_count: number
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cost_yuan: string
  /** 模型请求占比（新版分析接口返回，旧服务可能省略）。 */
  request_share?: number
}

export interface EnterpriseAnalyticsModelTrendPoint {
  bucket: string
  code: string
  alias: string
  name: string
  total_tokens: number
}

export interface EnterpriseAnalyticsMemberModelTrendPoint {
  bucket: string
  member_id: string
  member_name: string
  code: string
  name: string
  total_tokens: number
}

/** Daily aggregate values returned by the enterprise analytics endpoint. */
export interface EnterpriseAnalyticsDailyUsageTrendPoint {
  date?: string
  bucket?: string
  value?: number
  active_members?: number
  active_member_count?: number
  members?: number
  count?: number
  total_members?: number
  request_count?: number
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  cost_yuan?: string
}

export interface EnterpriseAnalyticsResponse {
  period: EnterpriseUsagePeriod
  metrics: EnterpriseAnalyticsMetrics
  tools: EnterpriseAnalyticsTool[]
  members: EnterpriseAnalyticsMember[]
  models: EnterpriseAnalyticsModel[]
  daily_usage_trend: EnterpriseAnalyticsDailyUsageTrendPoint[]
  model_token_trend: EnterpriseAnalyticsModelTrendPoint[]
  member_model_trend: EnterpriseAnalyticsMemberModelTrendPoint[]
}

export interface EnterpriseAuditLog {
  id: string
  category: string
  action: string
  summary: string
  actor_id: string
  actor_name: string
  actor_contact: string
  result: string
  result_code?: string
  resource_type: string
  resource_id?: string
  before: Record<string, unknown>
  after: Record<string, unknown>
  request_id: string
  occurred_at: ApiTimeValue
}

export interface EnterpriseAuditLogPage {
  context: EnterpriseContext
  items: EnterpriseAuditLog[]
  total: number
  page: number
  page_size: number
}

export type EnterpriseListOptions = Pick<FetchJsonOptions, 'accessToken' | 'signal'>

export type EnterpriseMembersRequest = EnterpriseListOptions & {
  page?: number
  page_size?: number
  keyword?: string
  role?: string
  tag_id?: string
  status?: string
}

export type EnterpriseMemberBatchAction = 'role' | 'status'

export interface EnterpriseMemberBatchItem {
  member_id: string
  expected_version: EnterpriseVersion
}

export type EnterpriseMemberBatchRequest = EnterpriseListOptions & {
  action: EnterpriseMemberBatchAction
  members: EnterpriseMemberBatchItem[]
  role?: string
  status?: 'active' | 'suspended'
}

export interface EnterpriseMemberBatchResponse {
  items: EnterpriseMember[]
  updated: number
}

export type EnterpriseDepartmentMembersRequest = EnterpriseListOptions & {
  page?: number
  page_size?: number
  name?: string
  email?: string
  phone?: string
  status?: string
}

export type EnterpriseDepartmentsRequest = EnterpriseListOptions & {
  page?: number
  page_size?: number
  parent_id?: string | null
  name?: string
}

export type EnterpriseModelsRequest = EnterpriseListOptions & {
  page?: number
  page_size?: number
  keyword?: string
  modality?: string
  include_disabled?: boolean
}

export type EnterpriseJoinRequestsRequest = EnterpriseListOptions & {
  page?: number
  page_size?: number
  keyword?: string
  status?: string
}

export type EnterpriseInvitationsRequest = EnterpriseListOptions & {
  page?: number
  page_size?: number
  status?: string
}

export type EnterpriseUsageRange = 'today' | '7d' | '30d' | 'custom'
export type EnterpriseUsageStatus = 'all' | 'success' | 'error' | 'cancelled'

export type EnterpriseUsageRequest = EnterpriseListOptions & {
  range?: EnterpriseUsageRange
  start_at?: ApiTimeValue
  end_at?: ApiTimeValue
  member_id?: string
  model?: string
  status?: EnterpriseUsageStatus
  page?: number
  page_size?: number
}

export type EnterpriseAnalyticsRequest = EnterpriseListOptions & {
  range?: 'today' | '7d' | '30d' | 'month' | 'custom'
  month?: string
  start_at?: ApiTimestamp
  end_at?: ApiTimestamp
  member_id?: string
}

export type EnterpriseAuditLogsRequest = EnterpriseListOptions & {
  page?: number
  page_size?: number
  category?: string
  action?: string
  actor_id?: string
  result?: string
  start_at?: ApiTimestamp
  end_at?: ApiTimestamp
}

export type EnterpriseTagInput = {
  name: string
  description: string
  daily_cost_limit_yuan: string | null
  weekly_cost_limit_yuan: string | null
  monthly_cost_limit_yuan: string | null
  concurrency_limit: number | null
  rpm_limit: number | null
  tpm_limit: number | null
  allowed_models: string[]
}

export type EnterpriseRoleInput = {
  name: string
  // 文档将说明字段定义为可选；页面仍可显式发送空字符串。
  description?: string
  permission_codes: string[]
}

export type EnterpriseInvitationInput = {
  role: string
  max_uses: number
  // 文档允许省略（省略与 null 均表示不过期）；页面当前显式发送 null。
  expires_at?: ApiTimestamp | null
  department_id: string
}

export type EnterpriseInvitationJoinInput = {
  token: string
  // 加入说明为可选字段，服务端会按空字符串处理省略值。
  request_message?: string
}

export interface EnterpriseInvitationJoinResult {
  id: string
  // 创建申请的直接写响应部分投影字段可能为空或省略，列表/审核响应会补全。
  applicant_user_id?: string
  invitation_link_id?: string
  applicant_name?: string
  applicant_contact?: string
  requested_role: string
  request_message: string
  status: string
  rejection_reason?: string
  reviewed_by_member_id?: string
  reviewed_at?: ApiTimeValue | null
  created_at?: ApiTimeValue
  updated_at?: ApiTimeValue
  version?: EnterpriseVersion
}

function requireEnterpriseID(context: EnterpriseRequestContext): string {
  const enterpriseID = context.enterprise_id.trim()
  if (!enterpriseID) throw new ApiError(i18n.t('api.enterprise.contextMissing'), 400, 140001, null)
  return enterpriseID
}

function enterpriseBasePath(context: EnterpriseRequestContext): string {
  return `${ENTERPRISE_PATH}/${encodeURIComponent(requireEnterpriseID(context))}`
}

function memberPath(context: EnterpriseRequestContext, memberID: string): string {
  return `${enterpriseBasePath(context)}/members/${encodeURIComponent(memberID.trim())}`
}

function tagPath(context: EnterpriseRequestContext, tagID: string): string {
  return `${enterpriseBasePath(context)}/tags/${encodeURIComponent(tagID.trim())}`
}

function rolePath(context: EnterpriseRequestContext, roleID: string): string {
  return `${enterpriseBasePath(context)}/roles/${encodeURIComponent(roleID.trim())}`
}

function invitationPath(context: EnterpriseRequestContext, linkID: string): string {
  return `${enterpriseBasePath(context)}/invitations/${encodeURIComponent(linkID.trim())}`
}

function modelPath(context: EnterpriseRequestContext, modelID: string): string {
  const normalizedID = modelID.trim()
  if (!normalizedID) throw new ApiError(i18n.t('api.enterprise.modelRequired'), 400, 140001, null)
  return `${enterpriseBasePath(context)}/models/${encodeURIComponent(normalizedID)}`
}

function queryValue(value: string | number | null | undefined): boolean {
  return value !== undefined && value !== null && value !== '' && value !== 'all'
}

export function createEnterpriseQuery(values: Record<string, string | number | null | undefined> = {}): string {
  const query = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (queryValue(value)) query.set(key, String(value))
  })
  return query.toString()
}

function listOptions(options: { page?: number; page_size?: number }): { page: number; page_size: number } {
  return { page: options.page ?? ENTERPRISE_FIRST_PAGE, page_size: options.page_size ?? ENTERPRISE_PAGE_SIZE }
}

function requestOptions(options: EnterpriseListOptions): EnterpriseListOptions {
  return { accessToken: options.accessToken ?? getAccessToken() ?? undefined, signal: options.signal }
}

export function getEnterpriseContext(context: EnterpriseRequestContext, options: EnterpriseListOptions = {}): Promise<EnterpriseContext> {
  return fetchAuthenticatedJson<EnterpriseContext>(`${enterpriseBasePath(context)}/context`, requestOptions(options))
}

export function getEnterpriseGovernance(context: EnterpriseRequestContext, options: EnterpriseListOptions = {}): Promise<EnterpriseGovernanceResponse> {
  return fetchAuthenticatedJson<EnterpriseGovernanceResponse>(`${enterpriseBasePath(context)}/governance`, requestOptions(options))
}

export function getEnterpriseModels(context: EnterpriseRequestContext, options: EnterpriseModelsRequest = {}): Promise<EnterpriseModelPage> {
  const query = createEnterpriseQuery({
    ...listOptions(options),
    keyword: options.keyword,
    modality: options.modality,
    include_disabled: options.include_disabled ? 1 : undefined,
  })
  return fetchAuthenticatedJson<EnterpriseModelPage>(`${enterpriseBasePath(context)}/models?${query}`, requestOptions(options))
}

export function getEnterpriseMembers(context: EnterpriseRequestContext, options: EnterpriseMembersRequest = {}): Promise<EnterpriseMemberPage> {
  const query = createEnterpriseQuery({ ...listOptions(options), keyword: options.keyword, role: options.role, tag_id: options.tag_id, status: options.status })
  return fetchAuthenticatedJson<EnterpriseMemberPage>(`${enterpriseBasePath(context)}/members?${query}`, requestOptions(options))
}

export type EnterpriseModelUpdateInput = {
  enabled: boolean
  // 可见范围字段为可选，以兼容尚未支持范围设置的旧部署；新页面会始终
  // 在保存已有范围时原样提交三者，避免切换启用状态时意外重置范围。
  visibility_scope?: 'all' | 'partial'
  department_ids?: string[]
  member_ids?: string[]
  expected_version: EnterpriseVersion
}

export function getEnterpriseDepartments(context: EnterpriseRequestContext, options: EnterpriseDepartmentsRequest = {}): Promise<EnterpriseDepartmentPage> {
  // 部门目录同样是分页接口；显式传入页码，供懒加载完整部门树时逐页读取。
  const query = createEnterpriseQuery({ ...listOptions(options), parent_id: options.parent_id, name: options.name })
  return fetchAuthenticatedJson<EnterpriseDepartmentPage>(`${enterpriseBasePath(context)}/departments?${query}`, requestOptions(options))
}

export function getEnterpriseDepartment(context: EnterpriseRequestContext, departmentID: string, options: EnterpriseListOptions = {}): Promise<EnterpriseDepartment> {
  return fetchAuthenticatedJson<EnterpriseDepartment>(`${enterpriseBasePath(context)}/departments/${encodeURIComponent(departmentID.trim())}`, requestOptions(options))
}

export function getEnterpriseDepartmentMembers(context: EnterpriseRequestContext, departmentID: string, options: EnterpriseDepartmentMembersRequest = {}): Promise<EnterpriseMemberPage> {
  const query = createEnterpriseQuery({ ...listOptions(options), name: options.name, email: options.email, phone: options.phone, status: options.status })
  return fetchAuthenticatedJson<EnterpriseMemberPage>(`${enterpriseBasePath(context)}/departments/${encodeURIComponent(departmentID.trim())}/members?${query}`, requestOptions(options))
}

export function createEnterpriseDepartment(context: EnterpriseRequestContext, input: { parent_id?: string | null; name: string } & Partial<EnterpriseDepartmentLimits>, options: EnterpriseListOptions = {}): Promise<EnterpriseDepartment> {
  return mutate<EnterpriseDepartment>(`${enterpriseBasePath(context)}/departments`, 'POST', input, options)
}

export function updateEnterpriseDepartment(context: EnterpriseRequestContext, departmentID: string, input: { parent_id?: string | null; name: string; expected_version: EnterpriseVersion } & Partial<EnterpriseDepartmentLimits>, options: EnterpriseListOptions = {}): Promise<EnterpriseDepartment> {
  return mutate<EnterpriseDepartment>(`${enterpriseBasePath(context)}/departments/${encodeURIComponent(departmentID.trim())}`, 'PUT', input, options)
}

export function deleteEnterpriseDepartment(context: EnterpriseRequestContext, departmentID: string, expectedVersion: EnterpriseVersion, options: EnterpriseListOptions = {}): Promise<void> {
  return mutate<void>(`${enterpriseBasePath(context)}/departments/${encodeURIComponent(departmentID.trim())}`, 'DELETE', { expected_version: expectedVersion }, options)
}

export function updateEnterpriseMemberDepartment(context: EnterpriseRequestContext, memberID: string, input: { department_id: string; expected_version: EnterpriseVersion }, options: EnterpriseListOptions = {}): Promise<EnterpriseMember> {
  return mutate<EnterpriseMember>(`${memberPath(context, memberID)}/department`, 'PUT', input, options)
}

export function removeEnterpriseMember(context: EnterpriseRequestContext, memberID: string, expectedVersion: EnterpriseVersion, options: EnterpriseListOptions = {}): Promise<EnterpriseMember> {
  return mutate<EnterpriseMember>(memberPath(context, memberID), 'DELETE', { expected_version: expectedVersion }, options)
}

// 成员批量角色/状态修改必须一次性提交，服务端保证整批事务性和版本校验。
export function batchUpdateEnterpriseMembers(context: EnterpriseRequestContext, input: EnterpriseMemberBatchRequest, options: EnterpriseListOptions = {}): Promise<EnterpriseMemberBatchResponse> {
  const { accessToken: _inputAccessToken, signal: _inputSignal, ...body } = input
  return mutate<EnterpriseMemberBatchResponse>(`${enterpriseBasePath(context)}/members/batch`, 'POST', body, { ...options, accessToken: options.accessToken ?? _inputAccessToken, signal: options.signal ?? _inputSignal })
}

// 兼容旧调用方可能采用的动词后置命名；两者共享同一请求实现。
export const updateEnterpriseMembersBatch = batchUpdateEnterpriseMembers

// 治理页面需要完整成员目录，按服务端允许的分页大小逐页读取，避免请求超出后端分页上限。
export async function getAllEnterpriseMembers(context: EnterpriseRequestContext, options: EnterpriseListOptions = {}): Promise<EnterpriseMember[]> {
  const members: EnterpriseMember[] = []
  let page = ENTERPRISE_FIRST_PAGE
  let total = 0
  do {
    const result = await getEnterpriseMembers(context, { ...options, page, page_size: ENTERPRISE_PAGE_SIZE })
    members.push(...result.items)
    total = result.total
    if (result.items.length === 0 || members.length >= total) break
    page += 1
  } while (page <= Math.ceil(total / ENTERPRISE_PAGE_SIZE))
  return members
}

export function getEnterpriseMember(context: EnterpriseRequestContext, memberID: string, options: EnterpriseListOptions = {}): Promise<EnterpriseMember> {
  return fetchAuthenticatedJson<EnterpriseMember>(memberPath(context, memberID), requestOptions(options))
}

export function getEnterpriseTags(context: EnterpriseRequestContext, options: EnterpriseListOptions = {}): Promise<EnterpriseTag[]> {
  return fetchAuthenticatedJson<EnterpriseTag[]>(`${enterpriseBasePath(context)}/tags`, requestOptions(options))
}

export function getEnterpriseJoinRequests(context: EnterpriseRequestContext, options: EnterpriseJoinRequestsRequest = {}): Promise<EnterpriseJoinRequestPage> {
  const query = createEnterpriseQuery({ ...listOptions(options), keyword: options.keyword, status: options.status })
  return fetchAuthenticatedJson<EnterpriseJoinRequestPage>(`${enterpriseBasePath(context)}/join-requests?${query}`, requestOptions(options))
}

export function getEnterpriseInvitations(context: EnterpriseRequestContext, options: EnterpriseInvitationsRequest = {}): Promise<EnterpriseInvitationPage> {
  const query = createEnterpriseQuery({ ...listOptions(options), status: options.status })
  return fetchAuthenticatedJson<EnterpriseInvitationPage>(`${enterpriseBasePath(context)}/invitations?${query}`, requestOptions(options))
}

export function getEnterpriseInvitationUsages(context: EnterpriseRequestContext, linkID: string, options: EnterpriseListOptions = {}): Promise<EnterpriseInvitationUsageList> {
  return fetchAuthenticatedJson<EnterpriseInvitationUsageList | EnterpriseInvitationUsage[]>(`${invitationPath(context, linkID)}/usages`, requestOptions(options))
    .then((response) => ({
      // 当前接口固定返回 data.items；兼容灰度旧服务曾返回的 data 裸数组。
      items: Array.isArray(response) ? response : Array.isArray(response.items) ? response.items : [],
    }))
}

// 公开邀请解析允许匿名访问；携带已有登录态时由服务端补充当前用户状态。
export function getInvitationPreview(token: string, options: EnterpriseListOptions = {}): Promise<EnterpriseInvitationPreview> {
  const query = new URLSearchParams({ token: token.trim() })
  return fetchJson<EnterpriseInvitationPreview>(`/api/user/invitations?${query.toString()}`, requestOptions(options))
}

export function submitInvitationJoin(input: EnterpriseInvitationJoinInput, options: EnterpriseListOptions = {}): Promise<EnterpriseInvitationJoinResult> {
  return fetchAuthenticatedJson<EnterpriseInvitationJoinResult>('/api/user/invitations', { ...requestOptions(options), method: 'POST', body: input })
}

function createUsageQuery(options: EnterpriseUsageRequest): string {
  // 新版企业用量只接受 range/custom + member/model/status；严禁发送旧 month、
  // granularity 或 api_key_id，避免后端按未知参数直接返回 400。
  return createEnterpriseQuery({
    range: options.range,
    start_at: options.start_at,
    end_at: options.end_at,
    member_id: options.member_id,
    model: options.model,
    status: options.status,
    ...listOptions(options),
  })
}

function createAnalyticsQuery(options: EnterpriseAnalyticsRequest): string {
  return createEnterpriseQuery({ range: options.range, month: options.month, start_at: options.start_at, end_at: options.end_at, member_id: options.member_id })
}

export function getEnterpriseUsage(context: EnterpriseRequestContext, options: EnterpriseUsageRequest = {}): Promise<EnterpriseUsageResponse> {
  const query = createUsageQuery(options)
  return fetchAuthenticatedJson<EnterpriseUsageResponse>(`${enterpriseBasePath(context)}/usage${query ? `?${query}` : ''}`, requestOptions(options))
}

export function getEnterpriseAnalytics(context: EnterpriseRequestContext, options: EnterpriseAnalyticsRequest = {}): Promise<EnterpriseAnalyticsResponse> {
  return fetchAuthenticatedJson<EnterpriseAnalyticsResponse>(`${enterpriseBasePath(context)}/analytics?${createAnalyticsQuery(options)}`, requestOptions(options))
    // 分析接口的列表均非分页字段，暂无用量时统一归一为空数组，避免图表和表格读取 undefined。
    .then((response) => ({
      ...response,
      tools: response.tools ?? [],
      members: response.members ?? [],
      models: response.models ?? [],
      daily_usage_trend: Array.isArray(response.daily_usage_trend) ? response.daily_usage_trend : [],
      model_token_trend: response.model_token_trend ?? [],
      member_model_trend: response.member_model_trend ?? [],
    }))
}

export function getEnterpriseAuditLogs(context: EnterpriseRequestContext, options: EnterpriseAuditLogsRequest = {}): Promise<EnterpriseAuditLogPage> {
  // 页面历史上使用 failed；审计服务端枚举固定为 failure。只在查询边界
  // 做映射，响应仍保留服务端原值，展示层由 auditResultLabel 同时兼容两种写法。
  const result = options.result === 'failed' ? 'failure' : options.result
  const query = createEnterpriseQuery({ ...listOptions(options), category: options.category, action: options.action, actor_id: options.actor_id, result, start_at: options.start_at, end_at: options.end_at })
  return fetchAuthenticatedJson<EnterpriseAuditLogPage>(`${enterpriseBasePath(context)}/audit-logs?${query}`, requestOptions(options))
}

export function getEnterpriseAuditLog(context: EnterpriseRequestContext, eventID: string, options: EnterpriseListOptions = {}): Promise<EnterpriseAuditLog> {
  return fetchAuthenticatedJson<EnterpriseAuditLog>(`${enterpriseBasePath(context)}/audit-logs/${encodeURIComponent(eventID.trim())}`, requestOptions(options))
}

function mutate<T>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown, options: EnterpriseListOptions): Promise<T> {
  return fetchAuthenticatedJson<T>(path, { ...requestOptions(options), method, body })
}

export function updateEnterpriseMemberRole(context: EnterpriseRequestContext, memberID: string, input: { role: string; expected_version: EnterpriseVersion }, options: EnterpriseListOptions = {}): Promise<EnterpriseMember> {
  return mutate<EnterpriseMember>(`${memberPath(context, memberID)}/role`, 'PUT', input, options)
}

export function updateEnterpriseMemberStatus(context: EnterpriseRequestContext, memberID: string, input: { status: string; expected_version: EnterpriseVersion }, options: EnterpriseListOptions = {}): Promise<EnterpriseMember> {
  return mutate<EnterpriseMember>(`${memberPath(context, memberID)}/status`, 'PUT', input, options)
}

export function updateEnterpriseMemberTag(context: EnterpriseRequestContext, memberID: string, input: { tag_id: string; expected_version: EnterpriseVersion }, options: EnterpriseListOptions = {}): Promise<EnterpriseMember> {
  return mutate<EnterpriseMember>(`${memberPath(context, memberID)}/tag`, 'PUT', input, options)
}

export function updateEnterpriseMemberBudget(context: EnterpriseRequestContext, memberID: string, input: { cost_limit_yuan: string | null; period_type: string; expected_version: EnterpriseVersion }, options: EnterpriseListOptions = {}): Promise<EnterpriseMember> {
  return mutate<EnterpriseMember>(`${memberPath(context, memberID)}/budget`, 'PUT', input, options)
}

export function createEnterpriseTag(context: EnterpriseRequestContext, input: EnterpriseTagInput, options: EnterpriseListOptions = {}): Promise<EnterpriseTag> {
  return mutate<EnterpriseTag>(`${enterpriseBasePath(context)}/tags`, 'POST', input, options)
}

export function updateEnterpriseTag(context: EnterpriseRequestContext, tagID: string, input: EnterpriseTagInput & { expected_version: EnterpriseVersion }, options: EnterpriseListOptions = {}): Promise<EnterpriseTag> {
  return mutate<EnterpriseTag>(tagPath(context, tagID), 'PUT', input, options)
}

export function deleteEnterpriseTag(context: EnterpriseRequestContext, tagID: string, expectedVersion: EnterpriseVersion, options: EnterpriseListOptions = {}): Promise<void> {
  return mutate<void>(tagPath(context, tagID), 'DELETE', { expected_version: expectedVersion }, options)
}

export function reviewEnterpriseJoinRequest(context: EnterpriseRequestContext, requestID: string, input: { action: string; role?: string; rejection_reason?: string }, options: EnterpriseListOptions = {}): Promise<EnterpriseJoinRequest> {
  return mutate<EnterpriseJoinRequest>(`${enterpriseBasePath(context)}/join-requests/${encodeURIComponent(requestID.trim())}`, 'PUT', input, options)
}

export function createEnterpriseInvitation(context: EnterpriseRequestContext, input: EnterpriseInvitationInput, options: EnterpriseListOptions = {}): Promise<EnterpriseInvitation> {
  return mutate<EnterpriseInvitation>(`${enterpriseBasePath(context)}/invitations`, 'POST', input, options)
}

export function updateEnterpriseInvitation(context: EnterpriseRequestContext, linkID: string, input: { action: 'revoke' | 'disable' | 'regenerate'; expected_version: EnterpriseVersion }, options: EnterpriseListOptions = {}): Promise<EnterpriseInvitation> {
  return mutate<EnterpriseInvitation>(invitationPath(context, linkID), 'PATCH', input, options)
}

export function updateEnterpriseModel(context: EnterpriseRequestContext, modelID: string, input: EnterpriseModelUpdateInput, options: EnterpriseListOptions = {}): Promise<EnterpriseModel> {
  return mutate<EnterpriseModel>(modelPath(context, modelID), 'PATCH', input, options)
}

export function createEnterpriseRole(context: EnterpriseRequestContext, input: EnterpriseRoleInput, options: EnterpriseListOptions = {}): Promise<EnterpriseRole> {
  return mutate<EnterpriseRole>(`${enterpriseBasePath(context)}/roles`, 'POST', input, options)
}

export function updateEnterpriseRole(context: EnterpriseRequestContext, roleID: string, input: EnterpriseRoleInput & { expected_version: EnterpriseVersion }, options: EnterpriseListOptions = {}): Promise<EnterpriseRole> {
  return mutate<EnterpriseRole>(rolePath(context, roleID), 'PUT', input, options)
}

export function deleteEnterpriseRole(context: EnterpriseRequestContext, roleID: string, expectedVersion: EnterpriseVersion, options: EnterpriseListOptions = {}): Promise<void> {
  return mutate<void>(rolePath(context, roleID), 'DELETE', { expected_version: expectedVersion }, options)
}

const ENTERPRISE_ERROR_KEYS: Record<number, string> = {
  140001: 'api.enterprise.errors.140001',
  140003: 'api.enterprise.errors.140003',
  140004: 'api.enterprise.errors.140004',
  140005: 'api.enterprise.errors.140005',
  140006: 'api.enterprise.errors.140006',
  140007: 'api.enterprise.errors.140007',
}

export function getEnterpriseErrorMessage(error: unknown): string {
  if (!isApiError(error)) return i18n.t('api.enterprise.requestFailed')
  if (error.apiMessage) return error.apiMessage
  if (error.status === 403 || error.code === 140002) return i18n.t('api.enterprise.forbidden')
  const messageKey = ENTERPRISE_ERROR_KEYS[error.code]
  return messageKey ? i18n.t(messageKey) : error.message || i18n.t('api.enterprise.requestFailed')
}

export function getEnterpriseRequestId(error: unknown): string | null {
  return isApiError(error) ? error.requestId : null
}
