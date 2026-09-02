import { fetchAuthenticatedJson, fetchAuthenticatedResponse } from './authenticated'
import { ApiError, isApiError, type FetchJsonOptions } from './http'
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
  dedupe_key: string
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
  skip_reason_code: string | null
  failure_reason_code: string | null
  version: string
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
  account: BillingAccount
  wallet: BillingWallet
  recent_rewards: BillingRewardIssuance[]
  recent_statements: BillingStatementLine[]
  unread_reward_count: number | string
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
  xAxis: {
    type: 'category' | string
    boundaryGap: boolean
    data: number[]
  }
  yAxis: {
    type: 'value' | string
  }
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
  tax_identifier: string
  taxpayer_type: 'enterprise' | 'personal'
  email?: string
  project_name: string
  invoice_type: BillingInvoiceType
}

export type BillingPaymentScene = 'pc'
export type BillingPaymentOrderStatus = 'pending' | 'paying' | 'paid' | 'closed' | 'expired' | 'exception' | string

export interface BillingPaymentTransaction {
  id: string
  payment_no: string
  attempt_no: number
  payment_product: 'alipay_page' | 'alipay_wap' | string
  amount_cent: number
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
  amount_cent: number
  amount_yuan: string
  paid_amount_cent: number
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
  period?: string
  start_at?: string | number
  end_at?: string | number
  api_key_id?: string
  model?: string
  source?: string
  billing_type?: 'subscription' | 'balance' | string
  member_id?: string
  department_id?: string
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
  return fetchAuthenticatedJson<BillingSummaryResponse>(`${BILLING_PATH}/summary?${query}`, options)
}

export function getBillingRewards(context: BillingContext, options: BillingRequestOptions = {}): Promise<BillingPageResult<BillingRewardIssuance>> {
  const page = listOptions(options)
  const query = createBillingQuery(context, page)
  return fetchAuthenticatedJson<BillingPageResult<BillingRewardIssuance>>(`${BILLING_PATH}/rewards?${query}`, requestOptions(options))
}

export function getBillingBonusGrants(context: BillingContext, options: BillingRequestOptions = {}): Promise<BillingPageResult<BillingBonusGrant>> {
  const page = listOptions(options)
  const query = createBillingQuery(context, page)
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
    period: options.period,
    start_at: startAt,
    end_at: endAt,
    api_key_id: options.api_key_id,
    model: options.model,
    source: options.source,
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
  if (!normalizedKey) throw new ApiError(i18n.t('api.billing.paymentIdempotencyRequired'), 400, 140001, null)
  return { ...options, method: 'POST', headers: { 'Idempotency-Key': normalizedKey } }
}

function paymentOrderPath(orderID: string, suffix = ''): string {
  const normalizedID = orderID.trim()
  if (!normalizedID) throw new ApiError(i18n.t('api.billing.paymentOrderRequired'), 400, 140001, null)
  return `${PAYMENT_ORDER_PATH}/${encodeURIComponent(normalizedID)}${suffix}`
}

export function createBillingPaymentOrder(context: BillingContext, input: BillingPaymentCreateInput, idempotencyKey: string, options: Pick<BillingRequestOptions, 'accessToken' | 'signal'> = {}): Promise<BillingPaymentOrder> {
  // 中文：订单创建时发送当前账务主体，企业充值因此直接进入对应企业钱包。
  const query = createBillingQuery(context)
  return fetchAuthenticatedJson<BillingPaymentOrder>(`${PAYMENT_ORDER_PATH}?${query}`, {
    ...paymentIdempotencyOptions(idempotencyKey, options),
    body: input,
  })
}

export function startBillingPayment(orderID: string, idempotencyKey: string, options: Pick<BillingRequestOptions, 'accessToken' | 'signal'> = {}): Promise<BillingPaymentStartResult> {
  return fetchAuthenticatedJson<BillingPaymentStartResult>(paymentOrderPath(orderID, '/pay'), {
    ...paymentIdempotencyOptions(idempotencyKey, options),
    body: { scene: BILLING_PAYMENT_SCENE_PC },
  })
}

export function getBillingPaymentOrder(orderID: string, options: Pick<BillingRequestOptions, 'accessToken' | 'signal'> = {}): Promise<BillingPaymentOrder> {
  return fetchAuthenticatedJson<BillingPaymentOrder>(paymentOrderPath(orderID), options)
}

export function closeBillingPaymentOrder(orderID: string, options: Pick<BillingRequestOptions, 'accessToken' | 'signal'> = {}): Promise<BillingPaymentOrder> {
  return fetchAuthenticatedJson<BillingPaymentOrder>(paymentOrderPath(orderID, '/close'), paymentIdempotencyOptions(`close-${orderID}`, options))
}

export function downloadBillingInvoice(url: string, options: Pick<BillingRequestOptions, 'accessToken' | 'signal'> = {}): Promise<Response> {
	return fetchAuthenticatedResponse(url, options)
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
  140001: 'api.billing.errors.140001',
  140002: 'api.billing.errors.140002',
  140003: 'api.billing.errors.140003',
  140004: 'api.billing.errors.140004',
  140005: 'api.billing.errors.140005',
  140006: 'api.billing.errors.140006',
  140007: 'api.billing.errors.140007',
  140008: 'api.billing.errors.140008',
}

export function getBillingErrorMessage(error: unknown): string {
  if (!isApiError(error)) return i18n.t('api.billing.requestFailed')
  // 中文：实名认证业务码可能使用 403 HTTP 状态，必须优先展示服务端返回的真实提示。
  if (error.code === 140008) return error.message.trim() || i18n.t('api.billing.errors.140008')
  if (error.status === 403 || error.code === 120001) return i18n.t('api.billing.forbidden')
  const messageKey = BILLING_ERROR_KEYS[error.code]
  return messageKey ? i18n.t(messageKey) : error.message
}

export function getBillingRequestId(error: unknown): string | null {
  return isApiError(error) ? error.requestId : null
}
