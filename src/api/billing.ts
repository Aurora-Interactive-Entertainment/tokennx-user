import { fetchAuthenticatedJson, fetchAuthenticatedResponse } from './authenticated'
import { API_BASE_URL, BACKEND_BASE_URL, ApiError, isApiError, type FetchJsonOptions } from './http'
import type { ApiTimestamp } from '@/utils/format'
import i18n from '@/i18n'

const BILLING_PATH = '/api/user/billing'
const ACCOUNT_OVERVIEW_PATH = '/api/user/account/overview'

export const BILLING_FIRST_PAGE = 1
export const BILLING_PAGE_SIZE = 20

export type BillingAccountType = 'personal' | 'enterprise'

export interface BillingContext {
  account_type: BillingAccountType
  enterprise_id?: string
}

export interface AccountOverviewResponse {
  account_balance_yuan: string
  invitation_reward_yuan: string
  invoiceable_amount_yuan: string
}

export interface BillingRequestOptions extends Pick<FetchJsonOptions, 'accessToken' | 'signal'> {
  page?: number
  page_size?: number
}

export interface BillingAccount {
  id: string
  type: BillingAccountType
  name: string
}

export interface BillingWallet {
  id: string
  currency: 'CNY' | string
  status: 'active' | 'disabled' | string
  paid_available_yuan: string
  bonus_available_yuan: string
  paid_frozen_yuan: string
  bonus_frozen_yuan: string
  debt_yuan: string
  total_available_yuan: string
  total_balance_yuan: string
  version: string
}

export type BillingBonusGrantStatus = 'active' | 'exhausted' | 'expired' | 'revoked' | string

export interface BillingBonusGrant {
  id: string
  source_type: string
  source_display_name: string
  total_amount_yuan: string
  available_amount_yuan: string
  consumed_amount_yuan: string
  expires_at: ApiTimestamp | null
  status: BillingBonusGrantStatus
  created_at: ApiTimestamp
  frozen_amount_yuan?: string
  updated_at?: ApiTimestamp
}

export interface BillingWalletResponse {
  account: BillingAccount
  wallet: BillingWallet
  bonus_grants: BillingBonusGrant[]
}

export type BillingRewardStatus = 'pending' | 'processing' | 'succeeded' | 'skipped' | 'failed' | 'partially_revoked' | 'revoked' | string

export interface BillingRewardIssuance {
  id: string
  rule_id: string
  rule_code: string
  trigger_type: string
  event_id: string
  // 中文：去重键属于服务端内部字段，新接口不会返回；保留可选字段兼容旧响应。
  dedupe_key?: string
  recipient_role: string
  recipient_type: string
  recipient_id: string
  account_type: BillingAccountType
  billing_account_id: string
  wallet_id: string | null
  amount_yuan: string
  granted_amount_yuan: string
  consumed_amount_yuan: string
  available_amount_yuan: string
  revoked_amount_yuan: string
  grant_id: string | null
  grant_expires_at: ApiTimestamp | null
  status: BillingRewardStatus
  skip_reason?: string
  skip_reason_code: string | null
  failure_reason_code: string | null
  journal_id?: string | null
  reversal_journal_id?: string | null
  version: string | number
  created_at: ApiTimestamp
  updated_at: ApiTimestamp
}

export type BillingStatementDirection = 'income' | 'expense' | 'adjustment'

export interface BillingStatementLine {
  id: string
  line_type: string
  source_type: string
  title: string
  description: string
  direction: BillingStatementDirection
  amount_yuan: string
  balance_after_yuan: string
  occurred_at: ApiTimestamp
  request_id: string | null
}

export interface BillingPageResult<T> {
  items: T[]
  page: number
  page_size: number
  total: number
}

export interface BillingSummaryResponse {
  // 中文：新接口将 account/wallet/bonus_grants 收敛在 wallet 对象内；account 保留为旧版本兼容字段。
  account?: BillingAccount
  wallet: BillingWalletResponse
  recent_rewards: BillingRewardIssuance[]
  recent_statements: BillingStatementLine[]
  unread_rewards: string
  unread_reward_count?: number | string
}

export interface BillingAnalysisOption {
  value: string
  label: string
}

export interface BillingAnalysisApiKey {
  id: string
  name: string
  masked_key: string
  status: string
}

export interface BillingAnalysisModel {
  code: string
  alias: string
  name: string
  vendor: string
}

export interface BillingAnalysisFilters {
  periods: BillingAnalysisOption[]
  api_keys: BillingAnalysisApiKey[]
  models: BillingAnalysisModel[]
}

export interface BillingRedemptionResult {
  amount_yuan: string
  expires_at: ApiTimestamp | null
  bonus_balance_yuan: string
}

export interface BillingDailyModelCost {
  date: string
  model_id?: string
  model_code?: string
  model_name?: string
  cost_yuan: string
}

export interface BillingDailyBillingTypeCost {
  date: string
  billing_type: 'subscription' | 'balance' | string
  cost_yuan: string
}

export interface BillingDailyApiKeyCost {
  date: string
  api_key_id?: string
  api_key_name?: string
  cost_yuan: string
}

/** 中文：费用分析接口返回的 ECharts 趋势图结构。日期轴使用 UTC 日桶时间戳，序列值单位为元。 */
export interface BillingCostChartSeries {
  name: string
  type: 'line' | string
  stack?: string
  data: number[]
}

export interface BillingCostChart {
  x_axis?: {
    type: 'category' | string
    boundary_gap: boolean
    data: number[]
  }
  y_axis?: {
    type: 'value' | string
  }
  // 中文：以下驼峰字段只用于兼容灰度期间的旧账务服务响应。
  xAxis?: { type: 'category' | string; boundaryGap: boolean; data: number[] }
  yAxis?: { type: 'value' | string }
  series: BillingCostChartSeries[]
}

export interface BillingAnalysisMetrics {
  total_cost_yuan: string
  input_cost_yuan: string
  output_cost_yuan: string
  image_cost_yuan: string
  audio_cost_yuan: string
  video_cost_yuan: string
  average_request_cost_yuan: string
  average_million_token_yuan: string
  billable_amount_yuan: string
  request_count: string
  input_tokens: string
  output_tokens: string
  image_count: string
  audio_count: string
  video_count: string
}

/** 中文：额度明细是可选扩展字段，兼容不同账务服务版本返回的明细口径。 */
export interface BillingQuotaDetails {
  recharge_yuan?: string
  reward_yuan?: string
  gift_yuan?: string
  invitation_yuan?: string
  expired_yuan?: string
  usage_yuan?: string
  total_yuan?: string
}

export type BillingLedgerKind = 'model_consume' | 'recharge' | 'reward' | string

export interface BillingLedgerItem {
  id: string
  occurred_at: ApiTimestamp
  kind: BillingLedgerKind
  channel: string
  description: string
  amount_yuan: string
  direction: BillingStatementDirection
  balance_after_yuan: string
  api_key_id?: string
  model_code?: string
  model_alias?: string
  request_id?: string
}

export interface BillingAnalysisResponse {
  account: BillingAccount
  wallet: Pick<BillingWallet, 'currency' | 'status' | 'paid_available_yuan' | 'bonus_available_yuan' | 'total_available_yuan' | 'total_balance_yuan' | 'debt_yuan'>
  period?: { value: string; label: string; start: ApiTimestamp; end: ApiTimestamp }
  filters?: BillingAnalysisFilters
  metrics: BillingAnalysisMetrics
  quota_details?: BillingQuotaDetails
  // 中文：兼容新版 ECharts 结构和旧版数组/分页结构，便于灰度期间平滑切换。
  model_daily_costs?: BillingCostChart | BillingDailyModelCost[] | BillingPageResult<BillingDailyModelCost>
  billing_type_daily_costs?: BillingCostChart | BillingDailyBillingTypeCost[] | BillingPageResult<BillingDailyBillingTypeCost>
  api_key_daily_costs?: BillingCostChart | BillingDailyApiKeyCost[] | BillingPageResult<BillingDailyApiKeyCost>
  ledger?: BillingPageResult<BillingLedgerItem>
}

export type BillingInvoiceStatus = 'submitted' | 'reviewing' | 'approved' | 'rejected' | 'issued' | 'voided' | string

export interface BillingInvoiceItem {
  id: string
  request_no: string
  amount_yuan: string
  status: BillingInvoiceStatus
  status_label: string
  title_masked: string
  invoice_type: 'normal' | 'special' | string
  submitted_at: ApiTimestamp
  completed_at: ApiTimestamp | null
  file_type: string
  download_url: string
  rejection_reason?: string
}

export type BillingInvoiceType = 'normal' | 'special'

export interface BillingInvoiceOption<T extends string = string> {
  value: T
  label: string
}

// 中文：开票弹窗的只读信息与可选项统一由发票查询接口下发。
export interface BillingInvoiceApplicationForm {
  title: string
  tax_identifier?: string
  amount_yuan: string
  invoice_types: BillingInvoiceOption<BillingInvoiceType>[]
  project_names: BillingInvoiceOption[]
}

export interface BillingInvoiceResponse {
  account: BillingAccount
  available_amount_yuan: string
  issued_amount_yuan: string
  pending_amount_yuan: string
  issued_count?: number | string
  pending_count?: number | string
  history: BillingPageResult<BillingInvoiceItem>
  application_form?: BillingInvoiceApplicationForm
}

export interface BillingInvoiceInput {
  amount_yuan: string
  title: string
  tax_identifier?: string
  taxpayer_type?: 'enterprise' | 'personal'
  email?: string
  project_name?: string
  invoice_type?: BillingInvoiceType
}

export type BillingPaymentScene = 'pc' | 'h5'
export type BillingPaymentOrderStatus = 'pending' | 'paying' | 'paid' | 'closed' | 'expired' | 'exception' | string

export interface BillingPaymentTransaction {
  id: string
  payment_no: string
  attempt_no: number
  payment_product: 'alipay_page' | 'alipay_wap' | string
  amount_cent: string | number
  amount_yuan: string
  status: 'created' | 'pending' | 'succeeded' | 'failed' | 'closed' | 'expired' | 'exception' | string
  provider_transaction_no?: string
  provider_order_no?: string
  payment_url?: string
  expires_at: ApiTimestamp | null
  succeeded_at: ApiTimestamp | null
  closed_at: ApiTimestamp | null
  created_at: ApiTimestamp
  updated_at: ApiTimestamp
  version: number | string
}

export interface BillingPaymentOrder {
  id: string
  order_no: string
  order_type: string
  status: BillingPaymentOrderStatus
  currency: string
  amount_cent: string | number
  amount_yuan: string
  paid_amount_cent: string | number
  account_type?: BillingAccountType
  enterprise_id?: string
  enterprise_name?: string
  paid_amount_yuan: string
  billing_account_id: string
  user_id?: string
  user_display_name?: string
  expires_at: ApiTimestamp | null
  paid_at: ApiTimestamp | null
  closed_at: ApiTimestamp | null
  created_at: ApiTimestamp
  updated_at: ApiTimestamp
  version: number | string
  transactions?: BillingPaymentTransaction[]
}

export interface BillingPaymentCreateInput {
  amount_yuan: string
  description?: string
}

export interface BillingPaymentStartResult {
  order: BillingPaymentOrder
  transaction: BillingPaymentTransaction
  form_html?: string
  /** 中文：新支付接口可直接返回二维码内容，旧接口仍通过 form_html 兼容。 */
  payment_url?: string
  qr_code?: string
  qr_code_url?: string
  qr_url?: string
}

export interface BillingPaymentRequestOptions extends Pick<BillingRequestOptions, 'accessToken' | 'signal'> {
  /** 支付场景，默认电脑网站；移动端可传 h5。 */
  scene?: BillingPaymentScene
  channel?: 'alipay' | string
}

export const BILLING_PAYMENT_SCENE_PC: BillingPaymentScene = 'pc'

export type BillingStatementDirectionFilter = 'all' | BillingStatementDirection

export interface BillingStatementRequestOptions extends BillingRequestOptions {
  direction?: BillingStatementDirectionFilter
  line_type?: string
  source_type?: string
  started_at?: string
  ended_at?: string
}

export interface BillingAnalysisRequestOptions extends BillingRequestOptions {
  /** 旧页面月份输入，仅在客户端转换为 start_at/end_at，不发送给新接口。 */
  period?: string
  start_at?: string | number
  end_at?: string | number
  api_key_id?: string
  model?: string
  /** 旧接口筛选项；新费用分析接口不再接收。 */
  source?: string
  billing_type?: 'subscription' | 'balance' | string
  member_id?: string
  department_id?: string
}

export interface BillingBonusGrantRequestOptions extends BillingRequestOptions {
  source_type?: string
  status?: string
}

export function createBillingQuery(context: BillingContext, extra: Record<string, string | number | undefined> = {}): string {
  if (context.account_type === 'enterprise' && !context.enterprise_id) {
    throw new ApiError(i18n.t('api.billing.contextMissing'), 400, 100001, null)
  }

  const params = new URLSearchParams({ account_type: context.account_type })
  if (context.account_type === 'enterprise' && context.enterprise_id) params.set('enterprise_id', context.enterprise_id)
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) params.set(key, String(value))
  }
  return params.toString()
}

function listOptions(options: BillingRequestOptions): { page: number; page_size: number } {
  return {
    page: options.page ?? BILLING_FIRST_PAGE,
    page_size: options.page_size ?? BILLING_PAGE_SIZE,
  }
}

function requestOptions(options: BillingRequestOptions): Pick<BillingRequestOptions, 'accessToken' | 'signal'> {
  return { accessToken: options.accessToken, signal: options.signal }
}

export function getBillingWallet(context: BillingContext, options: Pick<BillingRequestOptions, 'accessToken' | 'signal'> = {}): Promise<BillingWalletResponse> {
  const query = createBillingQuery(context)
  return fetchAuthenticatedJson<BillingWalletResponse>(`${BILLING_PATH}/wallet?${query}`, options)
}

export function getAccountOverview(context: BillingContext, options: Pick<BillingRequestOptions, 'accessToken' | 'signal'> = {}): Promise<AccountOverviewResponse> {
  const query = createBillingQuery(context)
  return fetchAuthenticatedJson<AccountOverviewResponse>(`${ACCOUNT_OVERVIEW_PATH}?${query}`, options)
}

export function getBillingSummary(context: BillingContext, options: Pick<BillingRequestOptions, 'accessToken' | 'signal'> = {}): Promise<BillingSummaryResponse> {
  const query = createBillingQuery(context)
  type SummaryWire = Omit<BillingSummaryResponse, 'wallet' | 'unread_rewards'> & {
    wallet: BillingWalletResponse | BillingWallet
    unread_rewards?: string
    unread_reward_count?: number | string
  }
  return fetchAuthenticatedJson<SummaryWire>(`${BILLING_PATH}/summary?${query}`, options).then((value) => {
    // 中文：灰度期间旧服务返回扁平 wallet/unread_reward_count，统一在边界转换成新契约。
    const rawWallet = value.wallet as BillingWalletResponse | BillingWallet | undefined
    const wallet = rawWallet && typeof rawWallet === 'object' && 'wallet' in rawWallet
      ? rawWallet
      : { account: value.account ?? { id: '', type: context.account_type, name: '' }, wallet: rawWallet ?? ({} as BillingWallet), bonus_grants: [] }
    return {
      ...value,
      account: value.account ?? wallet.account,
      wallet,
      unread_rewards: typeof value.unread_rewards === 'string'
        ? value.unread_rewards
        : String(value.unread_reward_count ?? '0'),
    }
  })
}

export function getBillingRewards(context: BillingContext, options: BillingRequestOptions = {}): Promise<BillingPageResult<BillingRewardIssuance>> {
  const page = listOptions(options)
  const query = createBillingQuery(context, page)
  return fetchAuthenticatedJson<BillingPageResult<BillingRewardIssuance>>(`${BILLING_PATH}/rewards?${query}`, requestOptions(options))
}

export function getBillingBonusGrants(context: BillingContext, options: BillingBonusGrantRequestOptions = {}): Promise<BillingPageResult<BillingBonusGrant>> {
  const page = listOptions(options)
  const query = createBillingQuery(context, { ...page, source_type: options.source_type, status: options.status })
  return fetchAuthenticatedJson<BillingPageResult<BillingBonusGrant>>(`${BILLING_PATH}/bonus-grants?${query}`, requestOptions(options))
}

export function getBillingStatements(context: BillingContext, options: BillingStatementRequestOptions = {}): Promise<BillingPageResult<BillingStatementLine>> {
  const page = listOptions(options)
  const query = createBillingQuery(context, {
    ...page,
    direction: options.direction,
    line_type: options.line_type,
    source_type: options.source_type,
    started_at: options.started_at,
    ended_at: options.ended_at,
  })
  return fetchAuthenticatedJson<BillingPageResult<BillingStatementLine>>(`${BILLING_PATH}/statements?${query}`, requestOptions(options))
}

/** 中文：兑换码核销使用请求编号保证超时重试不会重复入账。 */
export function redeemBillingCode(
  code: string,
  options: Pick<BillingRequestOptions, 'accessToken' | 'signal'> & { requestId?: string } = {},
): Promise<BillingRedemptionResult> {
  const requestCode = code.trim()
  // 中文：兑换码格式在客户端先校验，避免把明显无效的请求发送到服务端；服务端仍会做最终校验。
  if (!/^[A-Za-z0-9]{12}$/.test(requestCode)) {
    return Promise.reject(new ApiError(i18n.t('api.billing.errors.100001'), 400, 100001, null))
  }
  const requestId = options.requestId?.trim() || (
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `redeem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  )
  const headers = { 'X-Request-ID': requestId }
  return fetchAuthenticatedJson<BillingRedemptionResult>('/api/user/redemption-codes/redeem', {
    accessToken: options.accessToken,
    signal: options.signal,
    method: 'POST',
    body: { code: requestCode },
    ...(headers ? { headers } : {}),
  })
}

export function getBillingAnalysis(context: BillingContext, options: BillingAnalysisRequestOptions = {}): Promise<BillingAnalysisResponse> {
  // 中文：费用分析接口使用时间范围，period 仅作为旧调用方的兼容输入。
  let startAt = options.start_at
  let endAt = options.end_at
  if ((!startAt || !endAt) && options.period) {
    const match = /^(\d{4})-(\d{1,2})$/.exec(options.period.trim())
    if (match) {
      const year = Number(match[1])
      const month = Number(match[2])
      const start = new Date(Date.UTC(year, month - 1, 1))
      const end = new Date(Date.UTC(year, month, 1))
      startAt = start.getTime()
      endAt = end.getTime()
    }
  }
  const query = createBillingQuery(context, {
    start_at: startAt,
    end_at: endAt,
    api_key_id: options.api_key_id,
    model: options.model,
    billing_type: options.billing_type,
    member_id: options.member_id,
    department_id: options.department_id,
  })
  return fetchAuthenticatedJson<BillingAnalysisResponse>(`${BILLING_PATH}/analysis?${query}`, requestOptions(options))
}

export function getBillingInvoices(context: BillingContext, options: BillingRequestOptions = {}): Promise<BillingInvoiceResponse> {
  const page = listOptions(options)
  const query = createBillingQuery(context, page)
  return fetchAuthenticatedJson<BillingInvoiceResponse>(`${BILLING_PATH}/invoices?${query}`, requestOptions(options))
}

export function submitBillingInvoice(context: BillingContext, input: BillingInvoiceInput, idempotencyKey: string, options: Pick<BillingRequestOptions, 'accessToken' | 'signal'> = {}): Promise<BillingInvoiceItem> {
  const query = createBillingQuery(context)
  return fetchAuthenticatedJson<BillingInvoiceItem>(`${BILLING_PATH}/invoices?${query}`, {
    ...options,
    method: 'POST',
    body: input,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

const PAYMENT_ORDER_PATH = '/api/user/payment/orders'

function paymentIdempotencyOptions(idempotencyKey: string, options: Pick<BillingRequestOptions, 'accessToken' | 'signal'>): FetchJsonOptions {
  const normalizedKey = idempotencyKey.trim()
  if (!normalizedKey) throw new ApiError(i18n.t('api.billing.paymentIdempotencyRequired'), 400, 170001, null)
  return { ...options, method: 'POST', headers: { 'Idempotency-Key': normalizedKey } }
}

function paymentOrderPath(orderID: string, suffix = '', context: BillingContext = { account_type: 'personal' }): string {
  const normalizedID = orderID.trim()
  if (!normalizedID) throw new ApiError(i18n.t('api.billing.paymentOrderRequired'), 400, 170001, null)
  const path = `${PAYMENT_ORDER_PATH}/${encodeURIComponent(normalizedID)}${suffix}`
  return `${path}?${createBillingQuery(context)}`
}

export function createBillingPaymentOrder(context: BillingContext, input: BillingPaymentCreateInput, idempotencyKey: string, options: Pick<BillingRequestOptions, 'accessToken' | 'signal'> = {}): Promise<BillingPaymentOrder> {
  // 中文：订单创建时发送当前账务主体，企业充值因此直接进入对应企业钱包。
  const query = createBillingQuery(context)
  return fetchAuthenticatedJson<BillingPaymentOrder>(`${PAYMENT_ORDER_PATH}?${query}`, {
    ...paymentIdempotencyOptions(idempotencyKey, options),
    body: input,
  })
}

export function startBillingPayment(orderID: string, idempotencyKey: string, options: BillingPaymentRequestOptions = {}, context?: BillingContext): Promise<BillingPaymentStartResult> {
  const { scene = BILLING_PAYMENT_SCENE_PC, channel, accessToken, signal } = options
  return fetchAuthenticatedJson<BillingPaymentStartResult>(paymentOrderPath(orderID, '/pay', context), {
    ...paymentIdempotencyOptions(idempotencyKey, { accessToken, signal }),
    body: { scene, ...(channel ? { channel } : {}) },
  })
}

export function getBillingPaymentOrder(orderID: string, options: Pick<BillingRequestOptions, 'accessToken' | 'signal'> = {}, context?: BillingContext): Promise<BillingPaymentOrder> {
  return fetchAuthenticatedJson<BillingPaymentOrder>(paymentOrderPath(orderID, '', context), options)
}

export function closeBillingPaymentOrder(orderID: string, options: Pick<BillingRequestOptions, 'accessToken' | 'signal'> = {}, context?: BillingContext): Promise<BillingPaymentOrder> {
  return fetchAuthenticatedJson<BillingPaymentOrder>(paymentOrderPath(orderID, '/close', context), {
    ...paymentIdempotencyOptions(`close-${orderID}`, options),
    // 中文：关单接口要求显式空 JSON 对象，不能省略请求体。
    body: {},
  })
}

export function downloadBillingInvoice(url: string, options: Pick<BillingRequestOptions, 'accessToken' | 'signal'> = {}): Promise<Response> {
	const normalizedURL = url.trim()
	if (!isTrustedBillingInvoiceDownloadUrl(normalizedURL)) {
    return Promise.reject(new ApiError(i18n.t('api.billing.requestFailed'), 400, 0, null))
  }
	return fetchAuthenticatedResponse(normalizedURL, options)
}

// 中文：发票下载地址只允许当前站点或配置的后端地址，并限制到发票下载接口，避免把 Bearer Token 发送到外域。
export function isTrustedBillingInvoiceDownloadUrl(value: string): boolean {
  const normalized = value.trim()
  if (!normalized || normalized.startsWith('//')) return false
  const isAbsolute = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized)
  let parsed: URL
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : BACKEND_BASE_URL
    parsed = new URL(normalized, base)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  if (parsed.username || parsed.password || parsed.hash) return false
  if (isAbsolute) {
    const allowedOrigins = new Set<string>()
    if (typeof window !== 'undefined') allowedOrigins.add(window.location.origin)
    try {
      allowedOrigins.add(new URL(BACKEND_BASE_URL).origin)
    } catch {
      return false
    }
    if (API_BASE_URL) {
      try {
        allowedOrigins.add(new URL(API_BASE_URL).origin)
      } catch {
        return false
      }
    }
    if (!allowedOrigins.has(parsed.origin)) return false
  }
  return /^\/api\/user\/billing\/invoices\/[^/]+\/download$/.test(parsed.pathname)
}

const BILLING_ERROR_KEYS: Record<number, string> = {
  100001: 'api.billing.errors.100001',
  100002: 'api.billing.errors.100002',
  100004: 'api.billing.errors.100004',
  100006: 'api.billing.errors.100006',
  130001: 'api.billing.errors.130001',
  130002: 'api.billing.errors.130002',
  130003: 'api.billing.errors.130003',
  130004: 'api.billing.errors.130004',
  130005: 'api.billing.errors.130005',
  130006: 'api.billing.errors.130006',
  130007: 'api.billing.errors.130007',
  130008: 'api.billing.errors.130008',
  130009: 'api.billing.errors.130009',
  130010: 'api.billing.errors.130010',
  130011: 'api.billing.errors.130011',
  130103: 'api.billing.errors.130103',
  130104: 'api.billing.errors.130104',
  130105: 'api.billing.errors.130105',
  140001: 'api.billing.errors.140001',
  140002: 'api.billing.errors.140002',
  140003: 'api.billing.errors.140003',
  140004: 'api.billing.errors.140004',
  140005: 'api.billing.errors.140005',
  140006: 'api.billing.errors.140006',
  140007: 'api.billing.errors.140007',
  140008: 'api.billing.errors.140008',
  170001: 'api.billing.errors.170001',
  170003: 'api.billing.errors.170003',
  170004: 'api.billing.errors.170004',
  170005: 'api.billing.errors.170005',
  170007: 'api.billing.errors.170007',
  170008: 'api.billing.errors.170008',
  170012: 'api.billing.errors.170012',
}

export function getBillingErrorMessage(error: unknown): string {
  if (!isApiError(error)) return i18n.t('api.billing.requestFailed')
  if (error.apiMessage) return error.apiMessage
  // 中文：实名认证业务码可能使用 403 HTTP 状态，必须优先展示服务端返回的真实提示。
  if (error.code === 140008) return error.message.trim() || i18n.t('api.billing.errors.140008')
  if (error.status === 403 || error.code === 120001) return i18n.t('api.billing.forbidden')
  const messageKey = BILLING_ERROR_KEYS[error.code]
  return messageKey ? i18n.t(messageKey) : error.message || i18n.t('api.billing.requestFailed')
}

export function getBillingRequestId(error: unknown): string | null {
  return isApiError(error) ? error.requestId : null
}
