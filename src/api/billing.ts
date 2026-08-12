import { fetchAuthenticatedJson, fetchAuthenticatedResponse } from './authenticated'
import { ApiError, isApiError, type FetchJsonOptions } from './http'
import type { ApiTimeValue } from '@/utils/format'
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
  expires_at: ApiTimeValue | null
  status: BillingBonusGrantStatus
  created_at: ApiTimeValue
  frozen_amount_yuan?: string
  updated_at?: ApiTimeValue
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
  grant_expires_at: ApiTimeValue | null
  status: BillingRewardStatus
  skip_reason_code: string | null
  failure_reason_code: string | null
  version: string
  created_at: ApiTimeValue
  updated_at: ApiTimeValue
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
  occurred_at: ApiTimeValue
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
  occurred_at: ApiTimeValue
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
  period: { value: string; label: string; start: ApiTimeValue; end: ApiTimeValue }
  filters: BillingAnalysisFilters
  metrics: BillingAnalysisMetrics
  ledger: BillingPageResult<BillingLedgerItem>
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
  submitted_at: ApiTimeValue
  completed_at: ApiTimeValue | null
  file_type: string
  download_url: string
  rejection_reason?: string
}

export interface BillingInvoiceResponse {
  account: BillingAccount
  available_amount_yuan: string
  issued_amount_yuan: string
  pending_amount_yuan: string
  issued_count?: number | string
  pending_count?: number | string
  history: BillingPageResult<BillingInvoiceItem>
}

export interface BillingInvoiceInput {
  amount_yuan: string
  title: string
  tax_identifier: string
  taxpayer_type: 'enterprise' | 'personal'
  email: string
  project_name: string
  invoice_type: 'normal' | 'special'
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
  expires_at: ApiTimeValue | null
  succeeded_at: ApiTimeValue | null
  closed_at: ApiTimeValue | null
  created_at: ApiTimeValue
  updated_at: ApiTimeValue
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
  expires_at: ApiTimeValue | null
  paid_at: ApiTimeValue | null
  closed_at: ApiTimeValue | null
  created_at: ApiTimeValue
  updated_at: ApiTimeValue
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
  form_html: string
}

export const BILLING_PAYMENT_SCENE_PC: BillingPaymentScene = 'pc'

export type BillingStatementDirectionFilter = 'all' | BillingStatementDirection

export interface BillingAnalysisRequestOptions extends BillingRequestOptions {
  period?: string
  api_key_id?: string
  model?: string
  source?: 'all' | 'model_consume' | 'recharge' | 'reward'
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

export function getBillingStatements(context: BillingContext, options: BillingRequestOptions & { direction?: BillingStatementDirectionFilter } = {}): Promise<BillingPageResult<BillingStatementLine>> {
  const page = listOptions(options)
  const query = createBillingQuery(context, { ...page, direction: options.direction ?? 'all' })
  return fetchAuthenticatedJson<BillingPageResult<BillingStatementLine>>(`${BILLING_PATH}/statements?${query}`, requestOptions(options))
}

export function getBillingAnalysis(context: BillingContext, options: BillingAnalysisRequestOptions = {}): Promise<BillingAnalysisResponse> {
  const page = listOptions(options)
  const query = createBillingQuery(context, {
    ...page,
    period: options.period,
    api_key_id: options.api_key_id,
    model: options.model,
    source: options.source ?? 'all',
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

function paymentContextQuery(context: BillingContext): string {
  if (context.account_type !== 'personal') {
    throw new ApiError(i18n.t('api.billing.paymentPersonalOnly'), 400, 140001, null)
  }
  return createBillingQuery(context)
}

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
  const query = paymentContextQuery(context)
  return fetchAuthenticatedJson<BillingPaymentOrder>(`${PAYMENT_ORDER_PATH}?${query}`, {
    ...paymentIdempotencyOptions(idempotencyKey, options),
    body: input,
  })
}

export function startBillingPayment(context: BillingContext, orderID: string, idempotencyKey: string, options: Pick<BillingRequestOptions, 'accessToken' | 'signal'> = {}): Promise<BillingPaymentStartResult> {
  paymentContextQuery(context)
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
  if (error.status === 403 || error.code === 120001) return i18n.t('api.billing.forbidden')
  const messageKey = BILLING_ERROR_KEYS[error.code]
  return messageKey ? i18n.t(messageKey) : error.message
}

export function getBillingRequestId(error: unknown): string | null {
  return isApiError(error) ? error.requestId : null
}
