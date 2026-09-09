import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import DatePicker from '@douyinfe/semi-ui/lib/es/datePicker'
import Tooltip from '@douyinfe/semi-ui/lib/es/tooltip'
import Modal from '@/components/app-modal'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { IconCoinMoneyStroked, IconDownload, IconGiftStroked, IconHistory, IconInfoCircle, IconMoneyExchangeStroked, IconRefresh, IconShareMoneyStroked, IconTaskMoneyStroked, IconTicketCodeExchangeStroked } from '@douyinfe/semi-icons'
import { isApiError, isAuthenticationFailure } from '@/api/http'
import {
  BILLING_FIRST_PAGE,
  BILLING_PAGE_SIZE,
	getBillingAnalysis,
	getBillingStatements,
	getBillingErrorMessage,
	createBillingPaymentOrder,
	getBillingPaymentOrder,
	closeBillingPaymentOrder,
	getBillingInvoices,
	getBillingRequestId,
	startBillingPayment,
	downloadBillingInvoice,
  submitBillingInvoice,
  type BillingAnalysisResponse,
  type BillingAnalysisFilters,
  type BillingContext,
  type BillingInvoiceInput,
  type BillingInvoiceItem,
  type BillingInvoiceResponse,
  type BillingPageResult,
  type BillingPaymentOrder,
  type BillingPaymentStartResult,
  type BillingStatementLine,
} from '@/api/billing'
import { getAllUserApiKeys } from '@/api/user-api-keys'
import { getAllUserModels } from '@/api/user-models'
import { getAllEnterpriseMembers, getEnterpriseDepartments, type EnterpriseDepartment, type EnterpriseMember } from '@/api/enterprise-console'
import { BannerNotice, EmptyPanel, PageTitle } from '@/components/common'
import { appToast } from '@/components/app-toast'
import { TraePagination } from '@/components/trae-pagination'
import { BackofficeMoneyText as MoneyText } from '@/components/money'
import { PaymentQRCodeFrame } from '@/components/payment-qr-frame'
import { PaymentQRCode } from '@/components/payment-qr-code'
import { isAllowedAlipayPaymentUrl } from '@/api/payment-form'
import { CompatSelect as Select } from '@/components/semi-compat'
import alipayIcon from '@/assets/payment-icons/alipay.svg'
import wechatIcon from '@/assets/payment-icons/wechat.svg'
import { useAppStore, type Workspace } from '@/data/app-state'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'
import i18n from '@/i18n'
import { BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES, formatApiTime, formatCount, formatPersonOptionLabel, formatYuan, isZeroYuan } from '@/utils/format'
import { addLocalDays, endOfLocalDay, startOfLocalDay } from '@/utils/date-range'
import { createExportTask, downloadExportTask, getExportErrorMessage, saveExportResponse, waitForExportTask } from '@/api/exports'
import { BillingCostCharts } from '@/components/billing-cost-charts'
import { ConsoleTabs } from '@/components/console-tabs'
import { BillingInvoiceDialog } from '@/components/billing-invoice-dialog'
import {
  createInvoiceForm,
  getInvoiceDialogOptions,
  validateInvoiceForm,
  type InvoiceForm,
  type InvoiceFormErrors,
} from '@/components/billing-invoice-form'
import RealNameRequiredDialog from '@/components/real-name-required-dialog'
import { BalanceAlertDialog } from '@/components/balance-alert-dialog'
import { BillingRedemptionDialog } from '@/components/billing-redemption-dialog'
import '@/components/trae-date-picker.css'

export { validateInvoiceForm } from '@/components/billing-invoice-form'

export type BillingTab = 'overview' | 'invoice'
type ResourceStatus = 'idle' | 'loading' | 'success' | 'error'
type BillingStatementTypeFilter = 'all' | 'model_consume' | 'recharge' | 'reward'

export interface ResourceState<T> {
  status: ResourceStatus
  data: T | null
  error: string
  requestId: string | null
}

const BILLING_TABS: readonly [BillingTab, string][] = [
  ['overview', 'console.billing.costTab'],
  ['invoice', 'console.billing.invoice'],
]

// 中文：费用页通过查询参数直达费用或发票页签，非法值统一回退到账务概览。
function billingTabFromSearch(search: string): BillingTab {
  const tab = new URLSearchParams(search).get('tab')
  return BILLING_TABS.some(([key]) => key === tab) ? tab as BillingTab : 'overview'
}

// 中文：快捷金额与新的充值管理设计稿保持一致，桌面端优先在一行内完整展示。
const RECHARGE_OPTIONS = [100, 200, 500, 1000, 2000, 5000, 10000] as const
const MIN_RECHARGE_AMOUNT = 10
const PAYMENT_STATUS_POLL_INTERVAL_MS = 2000
// 中文：支付查单只在有限时间内自动进行，避免网络异常时无限请求后端。
const PAYMENT_STATUS_POLL_TIMEOUT_MS = 5 * 60 * 1000
const PAYMENT_STATUS_POLL_MAX_INTERVAL_MS = 10 * 1000
const PAYMENT_ACTIVE_STATUSES = new Set(['pending', 'paying'])
const DEFAULT_INVOICE_FILE_EXTENSION = 'pdf'
export function billingContextForWorkspace(workspace: Pick<Workspace, 'id' | 'type'>): BillingContext {
  return workspace.type === 'enterprise' ? { account_type: 'enterprise', enterprise_id: workspace.id } : { account_type: 'personal' }
}

export function billingContextKey(context: BillingContext): string {
  return context.account_type === 'enterprise' ? `${context.account_type}:${context.enterprise_id ?? ''}` : context.account_type
}

function currentPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function billingPeriodLabel(option: { value: string; label: string }): string {
  const match = /^(\d{4})-(\d{1,2})$/.exec(option.value.trim())
  if (!match) return option.label || option.value
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
  try {
    return new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(date)
  } catch {
    return option.label || option.value
  }
}

function resourceState<T>(status: ResourceStatus = 'idle', data: T | null = null): ResourceState<T> {
  return { status, data, error: '', requestId: null }
}

function defaultBillingDateRange(): Date[] {
  const today = startOfLocalDay(new Date())
  return [addLocalDays(today, -30), endOfLocalDay(today)]
}

// 中文：按日期选择器的日历日期生成 UTC 边界，避免本地时区导致账单跨日偏移。
export function billingDateRangeToUtcMilliseconds(range: readonly Date[]): { startAt?: number; endAt?: number } {
  const start = range[0]
  const end = range[1]
  return {
    startAt: start ? Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) : undefined,
    endAt: end ? Date.UTC(end.getFullYear(), end.getMonth(), end.getDate() + 1) : undefined,
  }
}

// 中文：部门筛选需要包含多级部门，按父节点逐层拉取并展平目录。
async function loadBillingDepartments(enterpriseID: string, signal: AbortSignal): Promise<EnterpriseDepartment[]> {
  const result: EnterpriseDepartment[] = []
  const pending: Array<string | undefined> = [undefined]
  while (pending.length > 0) {
    const parentID = pending.shift()
    const items: EnterpriseDepartment[] = []
    let page = 1
    let total = 0
    do {
      const response = await getEnterpriseDepartments({ enterprise_id: enterpriseID }, { parent_id: parentID, page, page_size: 20, signal })
      items.push(...(response.items ?? []))
      total = response.total ?? items.length
      if (!response.items?.length || items.length >= total) break
      page += 1
    } while (page <= Math.ceil(total / 20))
    result.push(...items)
    items.forEach((item) => {
      if (item.child_count > 0) pending.push(item.id)
    })
  }
  return result
}

const EMPTY_BILLING_FILTERS: BillingAnalysisFilters = { periods: [], api_keys: [], models: [] }

// 中文：费用分析新版不再返回 filters，筛选目录分别来自 API Key 和用户模型目录接口。
async function loadBillingFilterCatalog(context: BillingContext, signal: AbortSignal): Promise<BillingAnalysisFilters> {
  const keyContext = context.account_type === 'enterprise' && context.enterprise_id
    ? { account_type: 'enterprise' as const, enterprise_id: context.enterprise_id }
    : { account_type: 'personal' as const }
  const [keys, models] = await Promise.all([
    getAllUserApiKeys(keyContext, 'all', { signal }),
    getAllUserModels({
      account_type: context.account_type,
      ...(context.account_type === 'enterprise' && context.enterprise_id ? { enterprise_id: context.enterprise_id } : {}),
    }, signal),
  ])
  return {
    periods: [],
    api_keys: keys.items.map((item) => ({ id: item.id, name: item.name, masked_key: item.masked_key, status: item.status })),
    models: models.items.map((item) => ({
      code: item.alias || item.code || item.id,
      alias: item.alias || item.code || item.id,
      name: item.name || item.alias || item.code || item.id,
      vendor: item.company || '',
    })),
  }
}

function invoiceStatusClass(status: string): string {
  if (status === 'issued') return 'invoice-status-issued'
  if (status === 'submitted' || status === 'reviewing' || status === 'approved') return 'invoice-status-pending'
  if (status === 'rejected' || status === 'voided') return 'invoice-status-failed'
  return ''
}

const INVOICE_STATUS_KEYS: Record<string, string> = {
  submitted: 'console.billing.statusSubmitted',
  reviewing: 'console.billing.statusReviewing',
  approved: 'console.billing.statusApproved',
  rejected: 'console.billing.statusRejected',
  issued: 'console.billing.statusIssued',
  voided: 'console.billing.statusVoided',
}

function invoiceStatusLabel(item: BillingInvoiceItem): string {
  const key = INVOICE_STATUS_KEYS[item.status]
  return key ? i18n.t(key) : item.status_label || item.status || i18n.t('console.billing.statusUnknown')
}

function invoiceTypeLabel(type: string): string {
  return i18n.t(type === 'special' ? 'console.billing.invoiceTypeSpecial' : 'console.billing.invoiceTypeNormal')
}

export function statementKindLabel(line: Pick<BillingStatementLine, 'line_type' | 'source_type' | 'title' | 'description'>): string {
  const source = `${line.line_type} ${line.source_type} ${line.title} ${line.description}`.toLocaleLowerCase()
  if (source.includes('partial') || source.includes('部分')) return i18n.t('console.billing.statementPartialRevoke')
  if (source.includes('revoke') || source.includes('撤销')) return i18n.t('console.billing.statementRevoke')
  if (source.includes('expire') || source.includes('过期')) return i18n.t('console.billing.statementRewardExpired')
  if ((source.includes('model') || source.includes('模型')) && (source.includes('consume') || source.includes('usage') || source.includes('消费'))) return i18n.t('console.billing.modelConsumption')
  if (source.includes('consume') || source.includes('usage') || source.includes('消费')) return i18n.t('console.billing.statementConsume')
  if (source.includes('recharge') || source.includes('topup') || source.includes('top-up') || source.includes('充值')) return i18n.t('console.billing.recharge')
  if (source.includes('reward') || source.includes('grant') || source.includes('bonus') || source.includes('奖励') || source.includes('赠送')) return i18n.t('console.billing.statementRewardGranted')
  if (source.includes('other') || source.includes('其他')) return i18n.t('console.billing.statementOther')
  return i18n.language.startsWith('en') ? line.line_type || i18n.t('console.billing.statementOther') : line.title || line.line_type
}

function statementDescription(line: BillingStatementLine): string {
  const values = [line.title, line.description].map((value) => value.trim()).filter(Boolean)
  return [...new Set(values)].join(' · ') || '--'
}

function createIdempotencyKey(prefix = 'request'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function parseAmount(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

type RechargeAmountValidation = 'required' | 'invalid' | 'minimum' | null

function validateRechargeAmount(value: string): RechargeAmountValidation {
  const normalized = value.trim()
  if (!normalized) return 'required'
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return 'invalid'
  const amount = Number(normalized)
  if (!Number.isFinite(amount)) return 'invalid'
  return amount < MIN_RECHARGE_AMOUNT ? 'minimum' : null
}

// 中文：输入框只保留数字、小数点和两位小数，避免负号、字母等字符进入支付请求。
function sanitizeRechargeAmountInput(value: string): string {
  const sanitized = value.replace(/[^\d.]/g, '')
  const separatorIndex = sanitized.indexOf('.')
  if (separatorIndex < 0) return sanitized
  const integerPart = sanitized.slice(0, separatorIndex)
  const decimalPart = sanitized.slice(separatorIndex + 1).replace(/\./g, '').slice(0, 2)
  return `${integerPart}.${decimalPart}`
}

function BillingLoading({ label }: { label: string }) {
  return <div className="billing-loading" role="status"><span className="api-keys-loading-spinner" />{label}</div>
}

function BillingError({ state, onRetry }: { state: ResourceState<unknown>; onRetry: () => void }) {
  useEffect(() => {
    if (!state.error) return
    appToast.error(state.error)
  }, [state.error])
  return null
}

const EMPTY_ANALYSIS_WALLET: BillingAnalysisResponse['wallet'] = {
  currency: 'CNY',
  status: 'active',
  paid_available_yuan: '0',
  bonus_available_yuan: '0',
  total_available_yuan: '0',
  total_balance_yuan: '0',
  debt_yuan: '0',
}

const EMPTY_ANALYSIS_METRICS: BillingAnalysisResponse['metrics'] = {
  total_cost_yuan: '0',
  input_cost_yuan: '0',
  output_cost_yuan: '0',
  image_cost_yuan: '0',
  audio_cost_yuan: '0',
  video_cost_yuan: '0',
  average_request_cost_yuan: '0',
  average_million_token_yuan: '0',
  billable_amount_yuan: '0',
  request_count: '0',
  input_tokens: '0',
  output_tokens: '0',
  image_count: '0',
  audio_count: '0',
  video_count: '0',
}

export function paymentStatusCopy(status: string): { tone: 'info' | 'warning' | 'success'; label: string } {
  if (status === 'paid') return { tone: 'success', label: i18n.t('console.billing.paymentStatusPaid') }
  if (status === 'pending') return { tone: 'info', label: i18n.t('console.billing.paymentStatusPending') }
  if (status === 'paying') return { tone: 'info', label: i18n.t('console.billing.paymentStatusPaying') }
  if (status === 'closed') return { tone: 'warning', label: i18n.t('console.billing.paymentStatusClosed') }
  if (status === 'expired') return { tone: 'warning', label: i18n.t('console.billing.paymentStatusExpired') }
  if (status === 'exception') return { tone: 'warning', label: i18n.t('console.billing.paymentStatusException') }
  return { tone: 'warning', label: i18n.t('console.billing.paymentStatusUnknown') }
}

function isPaymentActive(status: string): boolean {
  return PAYMENT_ACTIVE_STATUSES.has(status)
}

// 中文：支付订单的 paid 状态必须同时具备服务端确认时间，避免不完整响应被展示为已到账。
function isPaymentSettled(order: Pick<BillingPaymentOrder, 'status' | 'paid_at'>): boolean {
  return order.status === 'paid' && Boolean(order.paid_at)
}

function isPaymentOrderPollable(order: Pick<BillingPaymentOrder, 'status' | 'paid_at'>): boolean {
  return isPaymentActive(order.status) || (order.status === 'paid' && !order.paid_at)
}

function paymentOrderStatusCopy(order: Pick<BillingPaymentOrder, 'status' | 'paid_at'>): ReturnType<typeof paymentStatusCopy> {
  return paymentStatusCopy(isPaymentSettled(order) ? order.status : order.status === 'paid' ? 'unknown' : order.status)
}

function extractPaymentQRCodeValue(payment: BillingPaymentStartResult): string {
  const candidates = [
    payment.transaction?.payment_url,
    payment.payment_url,
    payment.qr_code,
    payment.qr_code_url,
    payment.qr_url,
  ]
  return candidates.find((value): value is string => typeof value === 'string' && isAllowedAlipayPaymentUrl(value))?.trim() ?? ''
}

export function PaymentReturnNotice({ state, onRetry }: { state: ResourceState<BillingPaymentOrder>; onRetry: () => void }) {
  useEffect(() => {
    if (state.status !== 'error' || !state.error) return
    appToast.error(state.error)
  }, [state.error, state.status])
  if (state.status === 'idle') return null
  if (state.status === 'loading') return <BannerNotice><span>{i18n.t('console.billing.paymentQuerying')}</span></BannerNotice>
  if (state.status === 'error') return null
  if (!state.data) return null
  const copy = paymentOrderStatusCopy(state.data)
  return <BannerNotice tone={copy.tone}><span className="billing-request-error-copy"><strong>{copy.label}</strong><small>{i18n.t('console.billing.paymentReturnOrder', { orderNo: state.data.order_no })}</small></span></BannerNotice>
}

function Metric({ label, value, note, tone = '', action, noteAsTooltip = false }: { label: string; value: ReactNode; note?: ReactNode; tone?: string; action?: ReactNode; noteAsTooltip?: boolean }) {
  const tooltipContent = typeof note === 'string' || typeof note === 'number' ? String(note) : ''
  return <article className={`metric-card billing-metric-card${noteAsTooltip ? ' billing-metric-card--tooltip' : ''}${tone ? ` ${tone}` : ''}`}><div className="billing-metric-heading"><span className="metric-label">{label}</span>{noteAsTooltip && tooltipContent ? <BillingSectionInfo content={tooltipContent} /> : null}</div>{action ? <div className="metric-action-slot">{action}</div> : null}<strong className="metric-value">{value}</strong>{note && !noteAsTooltip ? <span className="metric-note">{note}</span> : null}</article>
}

function BillingPagination({ page, total, pageSize, label, disabled, onPageChange, onPageSizeChange }: { page: number; total: number; pageSize: number; label: string; disabled: boolean; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void }) {
  return <TraePagination ariaLabel={label} currentPage={page} pageSize={pageSize} total={total} summary={i18n.t('console.billing.pagination', { page, total: formatCount(total) })} disabled={disabled} onChange={(nextPage, nextPageSize) => { if (nextPageSize !== pageSize) onPageSizeChange(nextPageSize); else onPageChange(nextPage) }} />
}

function LedgerTable({ items }: { items: BillingStatementLine[] }) {
  return <div className="source-table-scroll billing-ledger-scroll" role="region" aria-label={i18n.t('console.billing.ledgerTable')} tabIndex={0}><table className="ledger-table"><thead><tr><th>{i18n.t('console.billing.time')}</th><th>{i18n.t('console.billing.type')}</th><th>{i18n.t('console.billing.relatedDescription')}</th><th>{i18n.t('console.billing.amountChange')}</th><th>{i18n.t('console.billing.balance')}</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{formatApiTime(item.occurred_at)}</td><td>{statementKindLabel(item)}</td><td><strong>{statementDescription(item)}</strong></td><td className={item.direction === 'income' ? 'amount-positive' : item.direction === 'expense' ? 'amount-negative' : ''}><MoneyText value={item.amount_yuan} direction={item.direction} /></td><td>{item.balance_after_yuan ? <MoneyText value={item.balance_after_yuan} /> : '--'}</td></tr>)}</tbody></table></div>
}

function BillingLedgerSection({ state, lineType, page, pageSize, onLineTypeChange, onPageChange, onPageSizeChange, onRetry, onExport, exporting }: { state: ResourceState<BillingPageResult<BillingStatementLine>>; lineType: BillingStatementTypeFilter; page: number; pageSize: number; onLineTypeChange: (value: BillingStatementTypeFilter) => void; onPageChange: (value: number) => void; onPageSizeChange: (value: number) => void; onRetry: () => void; onExport: () => void; exporting: boolean }) {
  const data = state.data
  const loading = state.status === 'loading' || state.status === 'idle'
  return <section className="analysis-section billing-ledger-section" aria-labelledby="billingLedgerHeading">
    <div className="section-heading">
      <h2 id="billingLedgerHeading">{i18n.t('console.billing.ledger')}</h2>
      <div className="ledger-toolbar">
        <span className="section-meta">{i18n.t('console.billing.ledgerCount', { count: formatCount(data?.total ?? 0) })}</span>
        <label className="ledger-filter-field" htmlFor="billing-ledger-type-filter">
          <span id="billing-ledger-type-filter-label">{i18n.t('console.billing.consumptionType')}</span>
          <Select id="billing-ledger-type-filter" className="billing-filter" dropdownClassName="billing-filter-dropdown" aria-labelledby="billing-ledger-type-filter-label" value={lineType} disabled={loading} onChange={(value) => onLineTypeChange(String(value) as BillingStatementTypeFilter)} onSelect={(value) => onLineTypeChange(String(value) as BillingStatementTypeFilter)}>
            <Select.Option value="all">{i18n.t('console.billing.all')}</Select.Option>
            <Select.Option value="model_consume">{i18n.t('console.billing.modelConsumption')}</Select.Option>
            <Select.Option value="recharge">{i18n.t('console.billing.recharge')}</Select.Option>
            <Select.Option value="reward">{i18n.t('console.billing.gift')}</Select.Option>
          </Select>
        </label>
        <Button className="billing-export-button" theme="outline" size="small" icon={<IconDownload />} loading={exporting} disabled={!data?.items.length || loading || exporting} onClick={onExport}>{i18n.t('console.billing.exportCsv')}</Button>
      </div>
    </div>
    {loading && !data ? <BillingLoading label={i18n.t('console.billing.loadingLedger')} /> : state.status === 'error' ? <BillingError state={state} onRetry={onRetry} /> : !data?.items.length ? <EmptyPanel surface="table" title={i18n.t('console.billing.noLedger')} description={i18n.t('console.billing.adjustLedger')} /> : <div className="table-scroll"><LedgerTable items={data.items} /></div>}
    <BillingPagination page={data?.page ?? page} pageSize={data?.page_size ?? pageSize} total={data?.total ?? 0} label={i18n.t('console.billing.ledgerPagination')} disabled={loading} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />
  </section>
}

function RequestFocus({ data, requestId }: { data: BillingAnalysisResponse | null; requestId: string }) {
  if (!requestId) return null
  const entry = data?.ledger?.items?.find((item) => item.request_id === requestId)
  return <div className="callout request-focus" aria-live="polite"><strong>{entry ? i18n.t('console.billing.requestSummary', { requestId }) : i18n.t('console.billing.requestNotFound', { requestId })}</strong><span>{entry ? <>{entry.description} · {entry.direction === 'expense' ? i18n.t('console.common.success') : i18n.t('console.billing.notBilled')} · {entry.direction === 'expense' ? <>{i18n.t('console.billing.cost')} <MoneyText value={entry.amount_yuan} /></> : i18n.t('console.billing.notBilled')}</> : i18n.t('console.billing.cleanedRequest')}</span><div className="request-focus-actions"><Link className="btn btn-secondary btn-sm" to="/console/billing">{i18n.t('console.billing.allLedger')}</Link></div></div>
}

type BillingQuotaRow = { key: string; label: string; value: string; icon: ReactNode; tone?: 'recharge' | 'reward' | 'gift' | 'invitation' | 'expired' | 'negative' | 'total' }

function safeAmount(value: string | number | undefined | null): number {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) && amount >= 0 ? amount : 0
}

function PlainMoney({ value, negative = false }: { value: string; negative?: boolean }) {
  const display = formatYuan(value, BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES)
  return <span>{negative && display !== '--' ? `-${display}` : display}</span>
}

function BillingSectionInfo({ content }: { content: string }) {
  // 中文：信息说明仅保留图标触发器，提示内容交给 Semi Tooltip 渲染，避免正文常驻占位。
  return <Tooltip className="app-info-tooltip billing-info-tooltip" content={content} position="top"><span className="billing-info-trigger" tabIndex={0} aria-label={content}><IconInfoCircle className="billing-info-icon" aria-hidden="true" /></span></Tooltip>
}

// 中文：Token NX 积分卡片，积分按当前周期消耗的输入+输出 token 汇总展示。
function PointsBalanceCard({ metrics }: { metrics: BillingAnalysisResponse['metrics'] }) {
  const points = safeAmount(metrics.input_tokens) + safeAmount(metrics.output_tokens)
  return <article className="billing-balance-card">
    <div className="billing-balance-card-heading"><span>{i18n.t('console.billing.pointsBalance')}</span><BillingSectionInfo content={i18n.t('console.billing.pointsBalanceHint')} /></div>
    <strong>{formatCount(points)}</strong>
  </article>
}

function AccountBalanceSection({ wallet, metrics, onRecharge, onBalanceAlert, onRedeem }: { wallet: BillingAnalysisResponse['wallet']; metrics: BillingAnalysisResponse['metrics']; onRecharge: () => void; onBalanceAlert: () => void; onRedeem?: () => void }) {
  return <section className="billing-balance-section" aria-labelledby="billingBalanceHeading">
    <h2 id="billingBalanceHeading" className="billing-subsection-heading">{i18n.t('console.billing.accountBalance')}</h2>
    <div className="billing-balance-grid">
      <article className="billing-balance-card billing-balance-card-total">
        <div className="billing-balance-card-heading"><span>{i18n.t('console.billing.totalBalance')}</span><BillingSectionInfo content={i18n.t('console.billing.totalBalanceHint')} /><button type="button" className="billing-balance-alert-link" onClick={onBalanceAlert}>{i18n.t('console.billing.balanceReminder')}</button></div>
        <div className="billing-balance-card-footer">
          <strong className="billing-balance-total-value"><PlainMoney value={wallet.total_balance_yuan || wallet.total_available_yuan} /></strong>
          <Button className="billing-balance-recharge-button" theme="solid" size="small" onClick={onRecharge}>{i18n.t('console.billing.rechargeNow')}</Button>
        </div>
      </article>
      <article className="billing-balance-card">
        <div className="billing-balance-card-heading"><span>{i18n.t('console.billing.rechargeBalance')}</span><BillingSectionInfo content={i18n.t('console.billing.rechargeBalanceHint')} /></div>
        <strong><PlainMoney value={wallet.paid_available_yuan} /></strong>
      </article>
      <article className="billing-balance-card">
        <div className="billing-balance-card-heading"><span>{i18n.t('console.billing.rewardBalance')}</span><BillingSectionInfo content={i18n.t('console.billing.rewardBalanceHint')} /></div>
        <div className="billing-reward-card-footer">
          <strong><PlainMoney value={wallet.bonus_available_yuan} /></strong>
          {onRedeem ? <Button className="billing-redeem-button" theme="borderless" size="small" onClick={onRedeem}>{i18n.t('console.billing.redeemCode')}</Button> : null}
        </div>
      </article>
      <PointsBalanceCard metrics={metrics} />
    </div>
  </section>
}

function CreditDetailsSection({ data }: { data: BillingAnalysisResponse }) {
  const wallet = data.wallet ?? EMPTY_ANALYSIS_WALLET
  const metrics = data.metrics ?? EMPTY_ANALYSIS_METRICS
  const quota = data.quota_details
  const ledgerItems = data.ledger?.items ?? []
  const sumLedger = (predicate: (item: NonNullable<BillingAnalysisResponse['ledger']>['items'][number]) => boolean): string => ledgerItems.filter(predicate).reduce((sum, item) => sum + safeAmount(item.amount_yuan), 0).toString()
  const usageFromLedger = sumLedger((item) => item.direction === 'expense')
  const rechargeFromLedger = sumLedger((item) => item.kind === 'recharge' || /充值|top.?up/i.test(item.description))
  const rewardFromLedger = sumLedger((item) => item.kind === 'reward' || /奖励|reward|bonus/i.test(item.description))
  const giftFromLedger = sumLedger((item) => /赠送|gift/i.test(item.description))
  const invitationFromLedger = sumLedger((item) => /推广|邀请|invitation|promotion|referr/i.test(item.description))
  const expiredFromLedger = sumLedger((item) => /过期|expire/i.test(item.description))
  const total = safeAmount(quota?.total_yuan) || safeAmount(wallet.total_balance_yuan || wallet.total_available_yuan)
  const rows: BillingQuotaRow[] = [
    { key: 'recharge', label: i18n.t('console.billing.quotaRecharge'), value: quota?.recharge_yuan ?? (rechargeFromLedger !== '0' ? rechargeFromLedger : wallet.paid_available_yuan), icon: <IconCoinMoneyStroked aria-hidden="true" />, tone: 'recharge' },
    { key: 'reward', label: i18n.t('console.billing.quotaReward'), value: quota?.reward_yuan ?? (rewardFromLedger !== '0' ? rewardFromLedger : wallet.bonus_available_yuan), icon: <IconTicketCodeExchangeStroked aria-hidden="true" />, tone: 'reward' },
    { key: 'gift', label: i18n.t('console.billing.quotaGift'), value: quota?.gift_yuan ?? giftFromLedger, icon: <IconGiftStroked aria-hidden="true" />, tone: 'gift' },
    { key: 'invitation', label: i18n.t('console.billing.quotaInvitation'), value: quota?.invitation_yuan ?? invitationFromLedger, icon: <IconShareMoneyStroked aria-hidden="true" />, tone: 'invitation' },
    { key: 'expired', label: i18n.t('console.billing.quotaExpired'), value: quota?.expired_yuan ?? expiredFromLedger, icon: <IconHistory aria-hidden="true" />, tone: 'expired' },
    { key: 'usage', label: i18n.t('console.billing.quotaUsage'), value: quota?.usage_yuan ?? (usageFromLedger !== '0' ? usageFromLedger : metrics.total_cost_yuan), icon: <IconTaskMoneyStroked aria-hidden="true" />, tone: 'negative' },
    { key: 'total', label: i18n.t('console.billing.totalBalance'), value: wallet.total_balance_yuan || wallet.total_available_yuan, icon: <IconMoneyExchangeStroked aria-hidden="true" />, tone: 'total' },
  ]
  return <section className="billing-quota-section" aria-labelledby="billingQuotaHeading">
    <h2 id="billingQuotaHeading" className="billing-subsection-heading">{i18n.t('console.billing.quotaDetails')}</h2>
    <div className="billing-quota-list">
      {rows.map((row) => {
        const amount = safeAmount(row.value)
        const percent = total > 0 ? Math.min(100, Math.max(0, amount / total * 100)) : 0
        return <div className={`billing-quota-row${row.tone ? ` is-${row.tone}` : ''}`} key={row.key}>
          <span className="billing-quota-label"><span className="billing-quota-icon">{row.icon}</span>{row.label}</span>
          {row.key === 'total' ? <span className="billing-quota-track-placeholder" aria-hidden="true" /> : <div className="billing-quota-track" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>}
          <strong className="billing-quota-value"><PlainMoney value={row.value} negative={row.tone === 'negative'} /></strong>
        </div>
      })}
    </div>
  </section>
}

function AnalysisTab({ state, ledger, dateRange, apiKeyID, model, billingType, departmentID, memberID, departments, members, directoryLoading, directoryEnabled, filterCatalog, onRecharge, onBalanceAlert, onRedeem, onFilterChange, onDateRangeChange, onRetry }: { state: ResourceState<BillingAnalysisResponse>; ledger: ReactNode; dateRange: Date[]; apiKeyID: string; model: string; billingType: string; departmentID: string; memberID: string; departments: EnterpriseDepartment[]; members: EnterpriseMember[]; directoryLoading: boolean; directoryEnabled: boolean; filterCatalog: BillingAnalysisFilters; onRecharge: () => void; onBalanceAlert: () => void; onRedeem?: () => void; onFilterChange: (key: 'apiKey' | 'model' | 'billingType' | 'department' | 'member', value: string) => void; onDateRangeChange: (value: Date[]) => void; onRetry: () => void }) {
  if (state.status === 'loading' || state.status === 'idle') return <BillingLoading label={i18n.t('console.billing.loadingAnalysis')} />
  if (state.status === 'error') return <BillingError state={state} onRetry={onRetry} />
  const data = state.data
  if (!data) return <EmptyPanel title={i18n.t('console.billing.noAnalysis')} description={i18n.t('console.billing.noAnalysisHint')} />
  // 中文：后端在部分旧版本或权限受限场景下可能省略分析子对象，统一使用空数据渲染。
  const metrics = data.metrics ?? EMPTY_ANALYSIS_METRICS
  const wallet = data.wallet ?? EMPTY_ANALYSIS_WALLET
  // 中文：优先使用独立目录接口返回的筛选项，旧响应仍可通过 data.filters 灰度兼容。
  const sourceFilters = data.filters ?? filterCatalog
  const filters = {
    periods: sourceFilters.periods ?? [],
    api_keys: sourceFilters.api_keys ?? [],
    models: (sourceFilters.models ?? []).flatMap((option) => {
      const alias = option.alias?.trim() || option.code?.trim() || ''
      if (!alias) return []
      return [{
        ...option,
        code: alias,
        name: option.name || `${i18n.t('console.playground.unnamedModel')}（${option.vendor || i18n.t('console.common.unknown')} · ${alias}）`,
      }]
    }),
  }
  const otherCost = (Number(metrics.image_cost_yuan || 0) + Number(metrics.audio_cost_yuan || 0) + Number(metrics.video_cost_yuan || 0)).toFixed(4)
  return (
    <section id="billing-analysis" className="billing-analysis" aria-labelledby="analysisHeading">
      <div className="billing-balance-and-quota">
        <AccountBalanceSection wallet={wallet} metrics={metrics} onRecharge={onRecharge} onBalanceAlert={onBalanceAlert} onRedeem={onRedeem} />
        <CreditDetailsSection data={data} />
      </div>
      <div className="analysis-header">
        <h2 className="analysis-heading" id="analysisHeading">{i18n.t('console.billing.analysis')}</h2>
      </div>
      <div className="billing-filter-grid" aria-label={i18n.t('console.billing.filterLabel')}>
        <label className="billing-filter-field" htmlFor="billing-period-filter">
          <span id="billing-period-filter-label" className="billing-filter-label billing-filter-label-hidden">{i18n.t('console.billing.billingPeriod')}</span>
          <DatePicker className="trae-date-picker billing-filter-date-picker" dropdownClassName="trae-date-picker-dropdown" type="dateRange" value={dateRange} format="yyyy-MM-dd" rangeSeparator=" ~ " presetPosition="left" showClear={false} presets={[{ text: i18n.t('console.billing.last7Days'), start: addLocalDays(startOfLocalDay(new Date()), -6), end: endOfLocalDay(new Date()) }, { text: i18n.t('console.billing.last30Days'), start: addLocalDays(startOfLocalDay(new Date()), -30), end: endOfLocalDay(new Date()) }, { text: i18n.t('console.billing.last90Days'), start: addLocalDays(startOfLocalDay(new Date()), -89), end: endOfLocalDay(new Date()) }]} onChange={(value) => { if (!Array.isArray(value)) return; const dates = value.filter((item): item is Date => item instanceof Date); if (dates.length === 2) onDateRangeChange(dates) }} aria-labelledby="billing-period-filter-label" />
        </label>
        <label className="billing-filter-field" htmlFor="billing-api-key-filter">
          <span id="billing-api-key-filter-label" className="billing-filter-label billing-filter-label-hidden">{i18n.t('console.billing.apiKey')}</span>
          <Select id="billing-api-key-filter" className="billing-filter" aria-labelledby="billing-api-key-filter-label" value={apiKeyID} onChange={(value) => onFilterChange('apiKey', String(value))} onSelect={(value) => onFilterChange('apiKey', String(value))} block>
            <Select.Option value="">{i18n.t('console.billing.allApiKeys')}</Select.Option>
            {filters.api_keys.map((option) => (
              <Select.Option value={option.id} key={option.id}>
                {option.name} · {option.masked_key}
              </Select.Option>
            ))}
          </Select>
        </label>
        <label className="billing-filter-field" htmlFor="billing-model-filter">
          <span id="billing-model-filter-label" className="billing-filter-label billing-filter-label-hidden">{i18n.t('console.billing.model')}</span>
          <Select id="billing-model-filter" className="billing-filter" aria-labelledby="billing-model-filter-label" value={model} onChange={(value) => onFilterChange('model', String(value))} onSelect={(value) => onFilterChange('model', String(value))} block>
            <Select.Option value="">{i18n.t('console.billing.allModels')}</Select.Option>
            {filters.models.map((option) => (
              <Select.Option value={option.code} key={option.code}>
                {option.name || option.code}
              </Select.Option>
            ))}
          </Select>
        </label>
        <label className="billing-filter-field" htmlFor="billing-billing-type-filter">
          <span id="billing-billing-type-filter-label" className="billing-filter-label billing-filter-label-hidden">{i18n.t('console.billing.billingType')}</span>
          <Select id="billing-billing-type-filter" className="billing-filter" aria-labelledby="billing-billing-type-filter-label" value={billingType} onChange={(value) => onFilterChange('billingType', String(value))} onSelect={(value) => onFilterChange('billingType', String(value))} block>
            <Select.Option value="">{i18n.t('console.billing.allBillingTypes')}</Select.Option>
            <Select.Option value="subscription">{i18n.t('console.billing.subscription')}</Select.Option>
            <Select.Option value="balance">{i18n.t('console.billing.balanceType')}</Select.Option>
          </Select>
        </label>
        {directoryEnabled ? <label className="billing-filter-field" htmlFor="billing-department-filter">
          <span id="billing-department-filter-label" className="billing-filter-label billing-filter-label-hidden">{i18n.t('console.billing.department')}</span>
          <Select id="billing-department-filter" className="billing-filter" aria-labelledby="billing-department-filter-label" value={departmentID} loading={directoryLoading} onChange={(value) => onFilterChange('department', String(value))} onSelect={(value) => onFilterChange('department', String(value))} block>
            <Select.Option value="">{i18n.t('console.billing.allDepartments')}</Select.Option>
            {departments.map((department) => <Select.Option key={department.id} value={department.id}>{department.name}</Select.Option>)}
          </Select>
        </label> : null}
        {directoryEnabled ? <label className="billing-filter-field" htmlFor="billing-member-filter">
          <span id="billing-member-filter-label" className="billing-filter-label billing-filter-label-hidden">{i18n.t('console.billing.member')}</span>
          <Select id="billing-member-filter" className="billing-filter" aria-labelledby="billing-member-filter-label" value={memberID} loading={directoryLoading} filter searchPosition="dropdown" searchPlaceholder={i18n.t('console.billing.searchMember')} onChange={(value) => onFilterChange('member', String(value))} onSelect={(value) => onFilterChange('member', String(value))} block>
            <Select.Option value="">{i18n.t('console.billing.allMembers')}</Select.Option>
            {members.map((member) => <Select.Option key={member.id} value={member.id}>{formatPersonOptionLabel(member.display_name || member.user_id, member.masked_contact)}</Select.Option>)}
          </Select>
        </label> : null}
      </div>
      <div className="metric-grid billing-metrics-grid">
        <Metric label={i18n.t('console.billing.currentCost')} value={<MoneyText value={metrics.total_cost_yuan} />} note={i18n.t('console.billing.modelSpend')} tone="highlight" noteAsTooltip />
        <Metric label={i18n.t('console.billing.inputCost')} value={<MoneyText value={metrics.input_cost_yuan} />} note={i18n.t('console.billing.textInput')} noteAsTooltip />
        <Metric label={i18n.t('console.billing.outputCost')} value={<MoneyText value={metrics.output_cost_yuan} />} note={i18n.t('console.billing.textOutput')} noteAsTooltip />
        <Metric label={i18n.t('console.billing.otherCost')} value={<MoneyText value={otherCost} />} note={i18n.t('console.billing.otherCostHint')} noteAsTooltip />
        <Metric label={i18n.t('console.billing.averageRequestCost')} value={<MoneyText value={metrics.average_request_cost_yuan} />} note={i18n.t('console.billing.billedSuccessRequests')} noteAsTooltip />
        <Metric label={i18n.t('console.billing.averageMillionTokenCost')} value={<MoneyText value={metrics.average_million_token_yuan} />} note={i18n.t('console.billing.textCallsOnly')} noteAsTooltip />
      </div>
      <BillingCostCharts modelCosts={data.model_daily_costs ?? []} billingTypeCosts={data.billing_type_daily_costs ?? []} apiKeyCosts={data.api_key_daily_costs ?? []} />
      {ledger}
    </section>
  )
}

// 中文：充值表单独立复用在充值管理页面，费用页仅保留费用概览和发票页签。
export function RechargeTab({ context, onOrderUpdated, onAuthFailure }: { context: BillingContext; onOrderUpdated: () => void; onAuthFailure: () => void }) {
  const navigate = useNavigate()
  const [amount, setAmount] = useState('100')
  const [selected, setSelected] = useState<number | null>(100)
  const [submitting, setSubmitting] = useState(false)
  const [paymentOrder, setPaymentOrder] = useState<BillingPaymentOrder | null>(null)
  const [paymentFormHTML, setPaymentFormHTML] = useState('')
  const [paymentQRCodeValue, setPaymentQRCodeValue] = useState('')
  const [paymentFormError, setPaymentFormError] = useState('')
  const [paymentQueryError, setPaymentQueryError] = useState('')
  const [paymentQuerying, setPaymentQuerying] = useState(false)
  const [paymentRefreshToken, setPaymentRefreshToken] = useState(0)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const paymentOrderIdempotencyKeyRef = useRef<string | null>(null)
  const paymentStartIdempotencyKeyRef = useRef<string | null>(null)
  const pendingPaymentOrderIDRef = useRef<string | null>(null)
  const agreementAccepted = true
  const [paymentMethod, setPaymentMethod] = useState<'alipay' | 'wechat'>('alipay')
  const [realNameDialogOpen, setRealNameDialogOpen] = useState(false)

  const handlePaymentFormError = useCallback((error: unknown) => {
    setPaymentFormError(getBillingErrorMessage(error))
  }, [])

  async function closePaymentDialog(): Promise<void> {
    const orderToClose = paymentOrder
    // 中文：关闭二维码弹窗即结束本次支付会话，避免后台继续查单或复用旧二维码。
    setPaymentDialogOpen(false)
    setPaymentOrder(null)
    setPaymentFormHTML('')
    setPaymentQRCodeValue('')
    setPaymentFormError('')
    setPaymentQueryError('')
    setPaymentQuerying(false)
    if (!orderToClose || !isPaymentActive(orderToClose.status)) return
    // 中文：关单完成前暂时锁住充值按钮，避免用户立即创建第二个未确认订单。
    setSubmitting(true)
    try {
      await closeBillingPaymentOrder(orderToClose.id, {}, context)
      paymentOrderIdempotencyKeyRef.current = null
      paymentStartIdempotencyKeyRef.current = null
      pendingPaymentOrderIDRef.current = null
      onOrderUpdated()
    } catch (error) {
      if (isAuthenticationFailure(error)) {
        onAuthFailure()
        return
      }
      // 中文：关单失败不阻塞用户继续操作，但保留错误提示，便于用户重新查询订单状态。
      Toast.warning(getBillingErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (!paymentDialogOpen || !paymentOrder || !isPaymentOrderPollable(paymentOrder)) return
    const controller = new AbortController()
    let disposed = false
    let timer: number | undefined
    const startedAt = Date.now()
    let failureCount = 0

    // 中文：前置模式没有可靠的跨域支付回跳，持续通过服务端查单确认最终状态。
    const poll = async (): Promise<void> => {
      if (disposed) return
      if (Date.now() - startedAt >= PAYMENT_STATUS_POLL_TIMEOUT_MS) {
        setPaymentQueryError(i18n.t('console.billing.paymentStatusUnknown'))
        setPaymentQuerying(false)
        return
      }
      setPaymentQuerying(true)
      try {
        const latestOrder = await getBillingPaymentOrder(paymentOrder.id, { signal: controller.signal }, context)
        if (disposed) return
        failureCount = 0
        setPaymentQueryError('')
        setPaymentOrder(latestOrder)
        if (!isPaymentOrderPollable(latestOrder)) {
          paymentOrderIdempotencyKeyRef.current = null
          paymentStartIdempotencyKeyRef.current = null
          pendingPaymentOrderIDRef.current = null
          onOrderUpdated()
          return
        }
        timer = window.setTimeout(() => void poll(), PAYMENT_STATUS_POLL_INTERVAL_MS)
      } catch (error) {
        if (disposed || controller.signal.aborted) return
        failureCount += 1
        setPaymentQueryError(getBillingErrorMessage(error))
        const retryDelay = Math.min(PAYMENT_STATUS_POLL_MAX_INTERVAL_MS, PAYMENT_STATUS_POLL_INTERVAL_MS * (2 ** Math.min(failureCount - 1, 3)))
        timer = window.setTimeout(() => void poll(), retryDelay)
      } finally {
        if (!disposed) setPaymentQuerying(false)
      }
    }

    void poll()
    return () => {
      disposed = true
      controller.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [context.account_type, context.enterprise_id, onOrderUpdated, paymentDialogOpen, paymentOrder?.id, paymentOrder?.status, paymentRefreshToken])

  function choose(value: number): void {
    paymentOrderIdempotencyKeyRef.current = null
    paymentStartIdempotencyKeyRef.current = null
    pendingPaymentOrderIDRef.current = null
    setSelected(value)
    setAmount(String(value))
  }

  async function handleRecharge(): Promise<void> {
    if (paymentMethod !== 'alipay') {
      Toast.warning(i18n.t('console.billing.wechatPaymentUnavailable'))
      return
    }
    const amountValidation = validateRechargeAmount(amount)
    const value = parseAmount(amount)
    if (amountValidation !== null || value === null) {
      Toast.error(i18n.t(amountValidation === 'required' ? 'console.billing.amountRequired' : amountValidation === 'minimum' ? 'console.billing.amountMinimum' : 'console.billing.amountInvalid'))
      return
    }
    if (submitting) return
    setSubmitting(true)
    setPaymentOrder(null)
    setPaymentDialogOpen(false)
    setPaymentFormHTML('')
    setPaymentQRCodeValue('')
    setPaymentFormError('')
    setPaymentQueryError('')
    try {
      const orderIdempotencyKey = paymentOrderIdempotencyKeyRef.current ?? createIdempotencyKey('payment-order')
      paymentOrderIdempotencyKeyRef.current = orderIdempotencyKey
      const order = pendingPaymentOrderIDRef.current
        ? await getBillingPaymentOrder(pendingPaymentOrderIDRef.current, {}, context)
        : await createBillingPaymentOrder(context, { amount_yuan: amount.trim() }, orderIdempotencyKey)
      pendingPaymentOrderIDRef.current = order.id
      // 中文：支付、查单接口同样需要携带当前账务主体，否则企业订单会被路由到个人接口。
      const startIdempotencyKey = paymentStartIdempotencyKeyRef.current ?? createIdempotencyKey('payment-start')
      paymentStartIdempotencyKeyRef.current = startIdempotencyKey
      const payment = await startBillingPayment(order.id, startIdempotencyKey, {}, context)
      setPaymentOrder(payment.order)
      if (!isPaymentOrderPollable(payment.order)) {
        paymentOrderIdempotencyKeyRef.current = null
        paymentStartIdempotencyKeyRef.current = null
        pendingPaymentOrderIDRef.current = null
      }
      const qrCodeValue = extractPaymentQRCodeValue(payment)
      const formHTML = payment.form_html?.trim() ?? ''
      setPaymentQRCodeValue(qrCodeValue)
      if (!formHTML && !qrCodeValue) {
        if (isPaymentSettled(payment.order)) {
          paymentOrderIdempotencyKeyRef.current = null
          paymentStartIdempotencyKeyRef.current = null
          pendingPaymentOrderIDRef.current = null
          onOrderUpdated()
          Toast.success(i18n.t('console.billing.paymentStatusPaid'))
          return
        }
        throw new Error(i18n.t('api.billing.paymentFormInvalid'))
      }
      setPaymentFormHTML(formHTML)
      setPaymentDialogOpen(true)
    } catch (error) {
      if (isAuthenticationFailure(error)) {
        onAuthFailure()
        return
      }
      if (isApiError(error) && error.code === 140008) {
        // 中文：实名认证拦截仅展示引导弹窗，避免顶部提示与弹窗重复。
        setRealNameDialogOpen(true)
        return
      }
      Toast.error(getBillingErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const paymentCopy = paymentOrder ? paymentOrderStatusCopy(paymentOrder) : null
  const paymentActive = paymentOrder ? isPaymentOrderPollable(paymentOrder) : false
  const rechargeAmount = parseAmount(amount)
  const amountValidation = selected === null ? validateRechargeAmount(amount) : null
  const amountValidationMessage = amountValidation === 'required' ? i18n.t('console.billing.amountRequired') : amountValidation === 'minimum' ? i18n.t('console.billing.amountMinimum') : amountValidation === 'invalid' ? i18n.t('console.billing.amountInvalid') : ''
  const customAmountSelected = selected === null && Boolean(amount.trim())

  return (
    <section className="billing-subpage billing-recharge-page">
      <div className="recharge-form-panel">
        <div className="recharge-form-heading"><h2>{i18n.t('console.billing.chooseRechargeAmount')}</h2><p>{i18n.t('console.billing.rechargeInvoiceHint')}</p></div>
        <div className="recharge-form-row recharge-amount-row">
          <div className="recharge-form-label"><strong>{i18n.t('console.billing.rechargeAmount')}</strong><span className="recharge-required" aria-hidden="true">*</span></div>
          <div className="recharge-amount-content">
            <div className="recharge-options" id="rechargeOptions">
              {RECHARGE_OPTIONS.map((value) => <button type="button" className={`recharge-option${selected === value ? ' active' : ''}`} aria-pressed={selected === value} key={value} onClick={() => choose(value)}><span className="recharge-amount">{value} {i18n.t('console.billing.amountUnit')}</span><span className="recharge-selected-corner" aria-hidden="true">✓</span></button>)}
              <label className={`recharge-option recharge-option-other${customAmountSelected ? ' active' : ''}`} htmlFor="rechargeCustomAmount"><input id="rechargeCustomAmount" aria-label={i18n.t('console.billing.otherAmount')} aria-describedby="rechargeAmountValidation" aria-invalid={amountValidation !== null} inputMode="decimal" type="text" value={selected === null ? amount : ''} onFocus={() => { if (selected !== null) { paymentOrderIdempotencyKeyRef.current = null; paymentStartIdempotencyKeyRef.current = null; pendingPaymentOrderIDRef.current = null; setSelected(null); setAmount('') } }} onChange={(event) => { paymentOrderIdempotencyKeyRef.current = null; paymentStartIdempotencyKeyRef.current = null; pendingPaymentOrderIDRef.current = null; setSelected(null); setAmount(sanitizeRechargeAmountInput(event.target.value)) }} placeholder={i18n.t('console.billing.otherAmountPlaceholder')} /><span className="recharge-selected-corner" aria-hidden="true">✓</span></label>
            </div>
            {amountValidationMessage ? <p className="recharge-amount-validation" id="rechargeAmountValidation" role="alert">{amountValidationMessage}</p> : null}
          </div>
        </div>
        <div className="recharge-form-row recharge-method-row">
          <div className="recharge-form-label"><strong>{i18n.t('console.billing.paymentPlatform')}</strong><span className="recharge-required" aria-hidden="true">*</span></div>
          <div className="recharge-method-controls">
            <button type="button" className={`recharge-method-option${paymentMethod === 'wechat' ? ' is-selected' : ''}`} aria-pressed={paymentMethod === 'wechat'} onClick={() => setPaymentMethod('wechat')}><img className="recharge-method-icon" src={wechatIcon} alt="" /><span>{i18n.t('console.billing.wechat')}</span><span className="recharge-selected-corner" aria-hidden="true">✓</span></button>
            <button type="button" className={`recharge-method-option${paymentMethod === 'alipay' ? ' is-selected' : ''}`} aria-label={i18n.t('console.billing.alipayPay')} aria-pressed={paymentMethod === 'alipay'} onClick={() => setPaymentMethod('alipay')}><img className="recharge-method-icon" src={alipayIcon} alt="" /><span>{i18n.t('console.billing.alipay')}</span><span className="recharge-selected-corner" aria-hidden="true">✓</span></button>
          </div>
        </div>
        <div className="recharge-form-actions"><Button className="recharge-confirm-button" theme="solid" type="primary" aria-label={i18n.t('console.billing.rechargeNow')} loading={submitting} disabled={submitting || !agreementAccepted || rechargeAmount === null || rechargeAmount < MIN_RECHARGE_AMOUNT || amountValidation !== null} onClick={() => void handleRecharge()}>{i18n.t('console.billing.rechargeNow')}</Button><span>{i18n.t('console.billing.viewRechargeRecordsPrefix')} <Link to="/console/billing">{i18n.t('console.billing.rechargeRecords')}</Link></span></div>
      </div>
      {paymentOrder && paymentCopy && paymentDialogOpen ? <Modal visible title={i18n.t('console.billing.rechargeModalTitle')} onCancel={closePaymentDialog} footer={null} className="payment-qr-dialog">
        <div className="payment-qr-dialog-content">
          <div className="payment-qr-dialog-order"><p>{i18n.t('console.billing.paymentReturnOrder', { orderNo: paymentOrder.order_no })}</p><span>{paymentCopy.label}</span></div>
          <strong className="payment-qr-dialog-amount">{formatYuan(paymentOrder.amount_yuan, 2)}</strong>
          {paymentQueryError ? <BannerNotice tone="warning"><span>{paymentQueryError}</span></BannerNotice> : null}
          {paymentFormError ? <BannerNotice tone="warning"><span>{paymentFormError}</span></BannerNotice> : null}
          {paymentActive && (paymentQRCodeValue || paymentFormHTML) ? <><p className="payment-qr-hint">{i18n.t('console.billing.paymentFrameHint')}</p>{paymentQRCodeValue ? <PaymentQRCode value={paymentQRCodeValue} title={i18n.t('console.billing.paymentFrameTitle')} errorMessage={i18n.t('api.billing.paymentFormInvalid')} onError={handlePaymentFormError} /> : <PaymentQRCodeFrame formHTML={paymentFormHTML} title={i18n.t('console.billing.paymentFrameTitle')} errorMessage={i18n.t('api.billing.paymentFormInvalid')} onError={handlePaymentFormError} />}<Button className="payment-qr-refresh-button" theme="outline" size="small" icon={<IconRefresh />} loading={paymentQuerying} disabled={!paymentActive || paymentQuerying} onClick={() => { setPaymentQueryError(''); setPaymentRefreshToken((value) => value + 1) }}>{i18n.t('console.billing.paymentRefresh')}</Button></> : null}
        </div>
      </Modal> : null}
      <RealNameRequiredDialog
        visible={realNameDialogOpen}
        onCancel={() => setRealNameDialogOpen(false)}
        onCompleted={() => setRealNameDialogOpen(false)}
        // 中文：直接切换路由，避免先关闭弹窗再导航造成短暂的遮罩闪烁。
        onVerify={() => navigate('/console/real-name')}
      />
    </section>
  )
}

function InvoiceHistory({ response, downloadingInvoiceID, onDownload }: { response: BillingInvoiceResponse; downloadingInvoiceID: string | null; onDownload: (item: BillingInvoiceItem) => void }) {
  const history = response.history
  return <section className="invoice-history" aria-labelledby="invoiceHistoryHeading"><h2 id="invoiceHistoryHeading">{i18n.t('console.billing.invoiceHistory')}</h2>{history.items.length === 0 ? <EmptyPanel surface="table" title={i18n.t('console.billing.noInvoice')} description={i18n.t('console.billing.invoiceHint')} /> : <div className="invoice-table-scroll" role="region" aria-label={i18n.t('console.billing.invoiceHistoryTable')} tabIndex={0}><table className="invoice-history-table"><thead><tr><th>{i18n.t('console.billing.submittedAt')}</th><th>{i18n.t('console.billing.invoiceAmount')}</th><th>{i18n.t('console.billing.invoiceEntity')}</th><th>{i18n.t('console.billing.invoiceMethod')}</th><th>{i18n.t('console.billing.invoiceTitle')}</th><th>{i18n.t('console.billing.invoiceType')}</th><th>{i18n.t('console.billing.status')}</th><th>{i18n.t('console.billing.operation')}</th></tr></thead><tbody>{history.items.map((item) => { const downloading = downloadingInvoiceID === item.id; return <tr key={item.id}><td>{formatApiTime(item.submitted_at)}</td><td><MoneyText value={item.amount_yuan} /></td><td>{response.account.name}</td><td>{i18n.t('console.billing.manualApply')}</td><td>{item.title_masked || '--'}</td><td>{invoiceTypeLabel(item.invoice_type)}</td><td><span className={invoiceStatusClass(item.status)}>{invoiceStatusLabel(item)}</span></td><td>{item.download_url ? <a href={item.download_url} download aria-busy={downloading} aria-disabled={downloading} onClick={(event) => { event.preventDefault(); if (!downloading) onDownload(item) }}>{downloading ? i18n.t('console.billing.downloading') : i18n.t('console.billing.view')}</a> : <span className="invoice-status-pending">{i18n.t('console.billing.invoiceProcessing')}</span>}</td></tr> })}</tbody></table></div>}</section>
}

function InvoiceTab({ state, faqOpen, downloadingInvoiceID, onToggleFaq, onRetry, onOpenDialog, onDownload, onPageChange, onPageSizeChange, page, pageSize }: { state: ResourceState<BillingInvoiceResponse>; faqOpen: boolean; downloadingInvoiceID: string | null; onToggleFaq: () => void; onRetry: () => void; onOpenDialog: () => void; onDownload: (item: BillingInvoiceItem) => void; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void; page: number; pageSize: number }) {
  if (state.status === 'loading' || state.status === 'idle') return <BillingLoading label={i18n.t('console.billing.invoiceLoading')} />
  if (state.status === 'error') return <BillingError state={state} onRetry={onRetry} />
  if (!state.data) return <EmptyPanel title={i18n.t('console.billing.invoiceInfo')} description={i18n.t('console.billing.invoiceInfoHint')} />
  const data = state.data
  return <section id="invoiceSection" className="invoice-page" aria-labelledby="invoiceHeading" tabIndex={-1}><h2 id="invoiceHeading" className="sr-only">{i18n.t('console.billing.invoice')}</h2><div className="invoice-faq"><button type="button" className="invoice-faq-toggle" aria-expanded={faqOpen} aria-controls="invoiceFaqBody" onClick={onToggleFaq}><span>{i18n.t('console.billing.invoiceFaq')}</span><span className="sr-only">{i18n.t('console.billing.invoiceFaqToggle')}</span></button><div className="invoice-faq-body" id="invoiceFaqBody" hidden={!faqOpen}>{i18n.t('console.billing.invoiceFaqHint')}</div></div><div id="invoiceOverview" data-invoice-view="overview"><p className="invoice-demo-note">{i18n.t('console.billing.localInvoiceNote')}</p><div className="invoice-metrics" aria-label={i18n.t('console.billing.invoiceOverview')}><Metric label={i18n.t('console.billing.availableAmount')} value={<MoneyText value={data.available_amount_yuan} />} tone="invoice-metric-primary" action={<Button className="invoice-metric-action" theme="solid" type="primary" size="small" onClick={onOpenDialog} disabled={isZeroYuan(data.available_amount_yuan)}>{i18n.t('console.billing.invoiceNow')}</Button>} /><Metric label={i18n.t('console.billing.issued')} value={formatCount(data.issued_count ?? 0)} note={i18n.t('console.billing.issuedDone')} /><Metric label={i18n.t('console.billing.issuing')} value={formatCount(data.pending_count ?? 0)} note={i18n.t('console.billing.waiting')} /></div><InvoiceHistory response={data} downloadingInvoiceID={downloadingInvoiceID} onDownload={onDownload} /><BillingPagination page={page} total={data.history.total} pageSize={data.history.page_size || pageSize} label={i18n.t('console.billing.invoiceHistory')} disabled={state.status !== 'success'} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} /></div></section>
}

export function BillingPage() {
  const { t } = useTranslation()
  const store = useAppStore()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const activeWorkspace = store.activeWorkspace
  const context = useMemo(() => billingContextForWorkspace(activeWorkspace), [activeWorkspace.id, activeWorkspace.type])
  const contextKey = useMemo(() => billingContextKey(context), [context])
  const requestedTab = useMemo(() => billingTabFromSearch(location.search), [location.search])
  const requestedRecordId = useMemo(() => new URLSearchParams(location.search).get('request')?.trim() ?? '', [location.search])
  const paymentReturnOrderID = useMemo(() => new URLSearchParams(location.search).get('order_id')?.trim() ?? '', [location.search])
  const [activeTab, setActiveTab] = useState<BillingTab>(requestedTab)
  const [reloadToken, setReloadToken] = useState(0)
  const [ledgerPage, setLedgerPage] = useState(BILLING_FIRST_PAGE)
  const [ledgerPageSize, setLedgerPageSize] = useState(BILLING_PAGE_SIZE)
  const [ledgerLineType, setLedgerLineType] = useState<BillingStatementTypeFilter>('all')
  const [invoicePage, setInvoicePage] = useState(BILLING_FIRST_PAGE)
  const [invoicePageSize, setInvoicePageSize] = useState(BILLING_PAGE_SIZE)
  const [period, setPeriod] = useState(currentPeriod)
  const [dateRange, setDateRange] = useState<Date[]>(defaultBillingDateRange)
  const [apiKeyID, setApiKeyID] = useState('')
  const [model, setModel] = useState('')
  const [billingType, setBillingType] = useState('')
  const [departmentID, setDepartmentID] = useState('')
  const [memberID, setMemberID] = useState('')
  const [departments, setDepartments] = useState<EnterpriseDepartment[]>([])
  const [members, setMembers] = useState<EnterpriseMember[]>([])
  const [directoryLoading, setDirectoryLoading] = useState(false)
  const [analysisFilters, setAnalysisFilters] = useState<BillingAnalysisFilters>(EMPTY_BILLING_FILTERS)
  const filterCatalogLoadedRef = useRef('')
  const [analysisState, setAnalysisState] = useState<ResourceState<BillingAnalysisResponse>>(resourceState())
  const [ledgerState, setLedgerState] = useState<ResourceState<BillingPageResult<BillingStatementLine>>>(resourceState())
  const [invoiceState, setInvoiceState] = useState<ResourceState<BillingInvoiceResponse>>(resourceState())
  const [invoiceFaqOpen, setInvoiceFaqOpen] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogStep, setDialogStep] = useState<1 | 2 | 3>(1)
  const [invoiceForm, setInvoiceForm] = useState<InvoiceForm>(() => createInvoiceForm(null, 'personal'))
  const [invoiceFormErrors, setInvoiceFormErrors] = useState<InvoiceFormErrors>({})
  const [submittingInvoice, setSubmittingInvoice] = useState(false)
  const invoiceIdempotencyKeyRef = useRef<string | null>(null)
  const [downloadingInvoiceID, setDownloadingInvoiceID] = useState<string | null>(null)
  const invoiceDownloadLockRef = useRef(false)
  const [exportingLedger, setExportingLedger] = useState(false)
  const ledgerExportLockRef = useRef(false)
  const [paymentReturnState, setPaymentReturnState] = useState<ResourceState<BillingPaymentOrder>>(resourceState())
  const [paymentReturnRetryToken, setPaymentReturnRetryToken] = useState(0)
  const [balanceAlertOpen, setBalanceAlertOpen] = useState(false)
  const [redemptionOpen, setRedemptionOpen] = useState(false)

  // 中文：兼容旧版费用页充值链接，保留订单参数后转到新的充值管理页面。
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('tab') !== 'recharge') return
    const orderID = params.get('order_id')?.trim()
    navigate(`/console/recharge${orderID ? `?order_id=${encodeURIComponent(orderID)}` : ''}`, { replace: true })
  }, [location.search, navigate])

  const handleAuthFailure = useCallback(() => {
    dispatch(invalidateAuth())
    navigate('/', { replace: true })
  }, [dispatch, navigate])

  const loadError = useCallback((error: unknown): ResourceState<never> => ({ status: 'error', data: null, error: getBillingErrorMessage(error), requestId: getBillingRequestId(error) }), [])

  useEffect(() => {
    setActiveTab(requestedTab)
    setLedgerPage(BILLING_FIRST_PAGE)
    setLedgerPageSize(BILLING_PAGE_SIZE)
    setLedgerLineType('all')
    setInvoicePage(BILLING_FIRST_PAGE)
    setInvoicePageSize(BILLING_PAGE_SIZE)
    setApiKeyID('')
    setModel('')
    setBillingType('')
    setDepartmentID('')
    setMemberID('')
    setDepartments([])
    setMembers([])
    setAnalysisFilters(EMPTY_BILLING_FILTERS)
    filterCatalogLoadedRef.current = ''
    setPeriod(currentPeriod())
    setDateRange(defaultBillingDateRange())
    setLedgerState(resourceState())
    setInvoiceState(resourceState())
    setPaymentReturnState(resourceState())
    setRedemptionOpen(false)
  }, [contextKey, requestedTab])

  useEffect(() => {
    if (context.account_type !== 'enterprise' || !context.enterprise_id) return
    const controller = new AbortController()
    setDirectoryLoading(true)
    void Promise.all([
      loadBillingDepartments(context.enterprise_id, controller.signal),
      getAllEnterpriseMembers({ enterprise_id: context.enterprise_id }, { signal: controller.signal }),
    ]).then(([departmentResult, memberResult]) => {
      if (controller.signal.aborted) return
      setDepartments(departmentResult ?? [])
      setMembers(memberResult ?? [])
    }).catch(() => {
      if (!controller.signal.aborted) {
        setDepartments([])
        setMembers([])
      }
    }).finally(() => {
      if (!controller.signal.aborted) setDirectoryLoading(false)
    })
    return () => controller.abort()
  }, [context.account_type, context.enterprise_id])

  useEffect(() => {
    if (!paymentReturnOrderID) {
      setPaymentReturnState(resourceState())
      return
    }
    const controller = new AbortController()
    setActiveTab('overview')
    setPaymentReturnState((previous) => ({ ...resourceState('loading'), data: previous.data }))
    // 中文：支付回跳查单沿用当前账务主体，企业订单不能落到个人接口。
    void getBillingPaymentOrder(paymentReturnOrderID, { signal: controller.signal }, context).then((order) => {
      if (controller.signal.aborted) return
      setPaymentReturnState({ status: 'success', data: order, error: '', requestId: null })
      setReloadToken((value) => value + 1)
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      if (isAuthenticationFailure(error)) {
        handleAuthFailure()
        return
      }
      setPaymentReturnState(loadError(error))
    })
    return () => controller.abort()
  }, [context.account_type, context.enterprise_id, handleAuthFailure, loadError, paymentReturnOrderID, paymentReturnRetryToken])

  useEffect(() => {
    const controller = new AbortController()
    setAnalysisState((previous) => ({ ...resourceState('loading'), data: previous.data }))
    const { startAt, endAt } = billingDateRangeToUtcMilliseconds(dateRange)
    void getBillingAnalysis(context, { start_at: startAt, end_at: endAt, api_key_id: apiKeyID || undefined, model: model || undefined, billing_type: billingType || undefined, department_id: departmentID || undefined, member_id: memberID || undefined, signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return
      setAnalysisState({ status: 'success', data, error: '', requestId: null })
      // 中文：新版分析响应不含 filters；目录只在当前账务主体首次成功返回后补拉一次。
      if (!data.filters && filterCatalogLoadedRef.current !== contextKey) {
        filterCatalogLoadedRef.current = contextKey
        void loadBillingFilterCatalog(context, controller.signal).then((catalog) => {
          if (!controller.signal.aborted) setAnalysisFilters(catalog)
        }).catch((error: unknown) => {
          if (!controller.signal.aborted && isAuthenticationFailure(error)) handleAuthFailure()
        })
      }
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      if (isAuthenticationFailure(error)) {
        handleAuthFailure()
        return
      }
      setAnalysisState(loadError(error))
    })
    return () => controller.abort()
  }, [apiKeyID, billingType, context, contextKey, dateRange, departmentID, handleAuthFailure, loadError, memberID, model, reloadToken])

  useEffect(() => {
    if (activeTab !== 'overview') return
    const controller = new AbortController()
    setLedgerState((previous) => ({ ...resourceState('loading'), data: previous.data }))
    // 中文：账本是独立的完整流水列表，仅使用自身分页和类型筛选。
    void getBillingStatements(context, {
      page: ledgerPage,
      page_size: ledgerPageSize,
      line_type: ledgerLineType === 'all' ? undefined : ledgerLineType,
      signal: controller.signal,
    }).then((data) => {
      if (!controller.signal.aborted) setLedgerState({ status: 'success', data, error: '', requestId: null })
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      if (isAuthenticationFailure(error)) {
        handleAuthFailure()
        return
      }
      setLedgerState(loadError(error))
    })
    return () => controller.abort()
  }, [activeTab, context, handleAuthFailure, ledgerLineType, ledgerPage, ledgerPageSize, loadError, reloadToken])

  useEffect(() => {
    if (activeTab !== 'invoice') return
    const controller = new AbortController()
    setInvoiceState((previous) => ({ ...resourceState('loading'), data: previous.data }))
    void getBillingInvoices(context, { page: invoicePage, page_size: invoicePageSize, signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setInvoiceState({ status: 'success', data, error: '', requestId: null })
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      if (isAuthenticationFailure(error)) {
        handleAuthFailure()
        return
      }
      setInvoiceState(loadError(error))
    })
    return () => controller.abort()
  }, [activeTab, context, handleAuthFailure, invoicePage, invoicePageSize, loadError, reloadToken])

  function changeAnalysisFilter(key: 'apiKey' | 'model' | 'billingType' | 'department' | 'member', value: string): void {
    if (key === 'apiKey') setApiKeyID(value)
    if (key === 'model') setModel(value)
    if (key === 'billingType') setBillingType(value)
    if (key === 'department') setDepartmentID(value)
    if (key === 'member') setMemberID(value)
  }

  function changeAnalysisDateRange(value: Date[]): void {
    setDateRange(value)
    if (value[0]) setPeriod(`${value[0].getFullYear()}-${String(value[0].getMonth() + 1).padStart(2, '0')}`)
  }

  async function exportCSV(): Promise<void> {
    // 中文：ref 锁在状态更新前生效，防止账本导出按钮被连续点击创建重复任务。
    if (ledgerExportLockRef.current || exportingLedger) return
    ledgerExportLockRef.current = true
    setExportingLedger(true)
    try {
      // 中文：账本导出提交完整账务主体和当前类型筛选，服务端负责生成全部匹配流水。
      const sourceType = ledgerLineType === 'model_consume' ? 'usage' : ledgerLineType === 'recharge' ? 'paid' : ledgerLineType === 'reward' ? 'reward' : undefined
      const task = await createExportTask(
        {
          export_code: 'billing.statements',
          format: 'csv',
          context: context.account_type === 'enterprise' ? { account_type: 'enterprise', enterprise_id: context.enterprise_id ?? '' } : { account_type: 'personal' },
          filters: sourceType ? { source_type: sourceType } : undefined,
          file_name: '账本明细',
        },
        { idempotencyKey: createIdempotencyKey('billing-export') },
      )
      const completed = await waitForExportTask(task.id)
      const response = await downloadExportTask(completed.id)
      await saveExportResponse(response, completed.file_name, '账本明细')
      Toast.success(t('console.billing.ledgerExported'))
    } catch (error) {
      if (isAuthenticationFailure(error)) {
        handleAuthFailure()
        return
      }
      Toast.error(getExportErrorMessage(error))
    } finally {
      ledgerExportLockRef.current = false
      setExportingLedger(false)
    }
  }

  function openInvoiceDialog(): void {
    setInvoiceForm(createInvoiceForm(invoiceState.data, activeWorkspace.type))
    setInvoiceFormErrors({})
    setDialogStep(1)
    invoiceIdempotencyKeyRef.current = null
    setDialogOpen(true)
  }

  function closeInvoiceDialog(): void {
    if (submittingInvoice) return
    setDialogOpen(false)
    setDialogStep(1)
    setInvoiceFormErrors({})
  }

  function updateInvoiceForm(key: keyof InvoiceForm, value: string): void {
    // 中文：修改申请内容后必须使用新的幂等键，避免服务端把不同申请误判为同一次请求。
    if (!submittingInvoice) invoiceIdempotencyKeyRef.current = null
    setInvoiceForm((previous) => ({ ...previous, [key]: value }))
    setInvoiceFormErrors((previous) => {
      if (!previous[key]) return previous
      const next = { ...previous }
      delete next[key]
      return next
    })
  }

  function nextInvoiceStep(): void {
    const errors = validateInvoiceForm(invoiceForm, invoiceState.data?.available_amount_yuan ?? '0')
    setInvoiceFormErrors(errors)
    if (Object.keys(errors).length > 0) return
    setDialogStep(2)
  }

  async function submitInvoice(): Promise<void> {
    if (submittingInvoice) return
    const invoiceType = invoiceForm.invoice_type
    if (!invoiceType) return
    setSubmittingInvoice(true)
    const email = invoiceForm.email.trim()
    const input: BillingInvoiceInput = {
      amount_yuan: invoiceForm.amount_yuan,
      title: invoiceForm.title,
      tax_identifier: invoiceForm.tax_identifier,
      taxpayer_type: invoiceForm.taxpayer_type,
      ...(email ? { email } : {}),
      project_name: invoiceForm.project_name,
      invoice_type: invoiceType,
    }
    try {
      const idempotencyKey = invoiceIdempotencyKeyRef.current ?? createIdempotencyKey('billing-invoice')
      invoiceIdempotencyKeyRef.current = idempotencyKey
      await submitBillingInvoice(context, input, idempotencyKey)
      invoiceIdempotencyKeyRef.current = null
      setDialogStep(3)
      setReloadToken((value) => value + 1)
      Toast.success(t('console.billing.invoiceSubmitted'))
    } catch (error) {
      if (isAuthenticationFailure(error)) {
        handleAuthFailure()
        return
      }
      Toast.error(getBillingErrorMessage(error))
    } finally {
      setSubmittingInvoice(false)
    }
  }

  async function downloadInvoice(item: BillingInvoiceItem): Promise<void> {
    // 中文：ref 锁在状态更新前生效，避免发票下载链接被连续点击触发重复请求。
    if (invoiceDownloadLockRef.current || downloadingInvoiceID) return
    invoiceDownloadLockRef.current = true
    setDownloadingInvoiceID(item.id)
    try {
      const response = await downloadBillingInvoice(item.download_url)
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      const extension = item.file_type.trim() || DEFAULT_INVOICE_FILE_EXTENSION
      anchor.href = url
      anchor.download = `发票${item.request_no ? `-${item.request_no}` : ''}.${extension}`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      Toast.success(t('console.billing.invoiceDownloaded'))
    } catch (error) {
      if (isAuthenticationFailure(error)) {
        handleAuthFailure()
        return
      }
      Toast.error(getBillingErrorMessage(error))
    } finally {
      invoiceDownloadLockRef.current = false
      setDownloadingInvoiceID(null)
    }
  }

  const onTabChange = (tab: BillingTab): void => {
    setActiveTab(tab)
    if (tab === 'invoice' && invoiceState.status === 'idle') setInvoicePage(BILLING_FIRST_PAGE)
  }

  const ledgerSection = <BillingLedgerSection state={ledgerState} lineType={ledgerLineType} page={ledgerPage} pageSize={ledgerPageSize} onLineTypeChange={(value) => { setLedgerLineType(value); setLedgerPage(BILLING_FIRST_PAGE) }} onPageChange={setLedgerPage} onPageSizeChange={(value) => { setLedgerPageSize(value); setLedgerPage(BILLING_FIRST_PAGE) }} onRetry={() => setReloadToken((value) => value + 1)} onExport={() => void exportCSV()} exporting={exportingLedger} />

  let content: ReactNode
  if (activeTab === 'overview') content = <AnalysisTab state={analysisState} ledger={ledgerSection} dateRange={dateRange} apiKeyID={apiKeyID} model={model} billingType={billingType} departmentID={departmentID} memberID={memberID} departments={departments} members={members} directoryLoading={directoryLoading} directoryEnabled={context.account_type === 'enterprise'} filterCatalog={analysisFilters} onRecharge={() => navigate('/console/recharge')} onBalanceAlert={() => setBalanceAlertOpen(true)} onRedeem={context.account_type === 'personal' ? () => setRedemptionOpen(true) : undefined} onFilterChange={changeAnalysisFilter} onDateRangeChange={changeAnalysisDateRange} onRetry={() => setReloadToken((value) => value + 1)} />
  else content = <InvoiceTab state={invoiceState} faqOpen={invoiceFaqOpen} downloadingInvoiceID={downloadingInvoiceID} onToggleFaq={() => setInvoiceFaqOpen((value) => !value)} onRetry={() => setReloadToken((value) => value + 1)} onOpenDialog={openInvoiceDialog} onDownload={(item) => void downloadInvoice(item)} onPageChange={setInvoicePage} onPageSizeChange={(nextPageSize) => { setInvoicePageSize(nextPageSize); setInvoicePage(BILLING_FIRST_PAGE) }} page={invoicePage} pageSize={invoicePageSize} />

  return <div className="page-stack billing-console-page"><PageTitle title={t('console.billing.title')} description={t('console.billing.description')} /><RequestFocus data={analysisState.data} requestId={requestedRecordId} /><PaymentReturnNotice state={paymentReturnState} onRetry={() => setPaymentReturnRetryToken((value) => value + 1)} /><ConsoleTabs items={BILLING_TABS.map(([itemKey, label]) => ({ itemKey, tab: t(label) }))} activeKey={activeTab} onChange={(value) => onTabChange(value as BillingTab)} ariaLabel={t('console.billing.title')} /><div className="billing-tab-panel" role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>{content}</div><BillingInvoiceDialog open={dialogOpen} form={invoiceForm} options={getInvoiceDialogOptions(invoiceState.data)} errors={invoiceFormErrors} step={dialogStep} submitting={submittingInvoice} onClose={closeInvoiceDialog} onChange={updateInvoiceForm} onNext={nextInvoiceStep} onBack={() => { setDialogStep(1); setInvoiceFormErrors({}) }} onSubmit={() => void submitInvoice()} /><BalanceAlertDialog visible={balanceAlertOpen} onClose={() => setBalanceAlertOpen(false)} onAuthFailure={handleAuthFailure} /><BillingRedemptionDialog visible={redemptionOpen} onClose={() => setRedemptionOpen(false)} onSuccess={() => setReloadToken((value) => value + 1)} onAuthFailure={handleAuthFailure} /></div>
}
