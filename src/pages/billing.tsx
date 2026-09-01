import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import DatePicker from '@douyinfe/semi-ui/lib/es/datePicker'
import Modal from '@/components/app-modal'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { IconDownload, IconRefresh, IconTickCircle } from '@douyinfe/semi-icons'
import { isApiError, isAuthenticationFailure } from '@/api/http'
import {
  BILLING_FIRST_PAGE,
  BILLING_PAGE_SIZE,
	getBillingAnalysis,
	getBillingStatements,
	getBillingErrorMessage,
	createBillingPaymentOrder,
	getBillingPaymentOrder,
	getBillingInvoices,
	getBillingRequestId,
	startBillingPayment,
	downloadBillingInvoice,
  submitBillingInvoice,
  type BillingAnalysisResponse,
  type BillingContext,
  type BillingInvoiceInput,
  type BillingInvoiceItem,
  type BillingInvoiceResponse,
  type BillingPageResult,
  type BillingPaymentOrder,
  type BillingPaymentStartResult,
  type BillingStatementLine,
} from '@/api/billing'
import { getAllEnterpriseMembers, getEnterpriseDepartments, type EnterpriseDepartment, type EnterpriseMember } from '@/api/enterprise-console'
import { BannerNotice, EmptyPanel, PageTitle } from '@/components/common'
import { TraePagination } from '@/components/trae-pagination'
import { BackofficeMoneyText as MoneyText } from '@/components/money'
import { PaymentQRCodeFrame } from '@/components/payment-qr-frame'
import { PaymentQRCode } from '@/components/payment-qr-code'
import { CompatSelect as Select } from '@/components/semi-compat'
import alipayIcon from '@/assets/payment-icons/alipay.svg'
import wechatIcon from '@/assets/payment-icons/wechat.svg'
import { useAppStore, type Workspace } from '@/data/app-state'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'
import i18n from '@/i18n'
import { BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES, formatApiTime, formatCount, formatSignedYuanExact, formatYuan, formatYuanExact, isZeroYuan } from '@/utils/format'
import { addLocalDays, endOfLocalDay, startOfLocalDay } from '@/utils/date-range'
import { BillingCostCharts } from '@/components/billing-cost-charts'
import { ConsoleTabs } from '@/components/console-tabs'
import RealNameRequiredDialog from '@/components/real-name-required-dialog'

export type BillingTab = 'overview' | 'invoice'
type ResourceStatus = 'idle' | 'loading' | 'success' | 'error'
type BillingStatementTypeFilter = 'all' | 'model_consume' | 'recharge' | 'reward'
type InvoiceTaxpayerType = 'enterprise' | 'personal'

export interface ResourceState<T> {
  status: ResourceStatus
  data: T | null
  error: string
  requestId: string | null
}

interface InvoiceForm {
  amount_yuan: string
  title: string
  tax_identifier: string
  taxpayer_type: InvoiceTaxpayerType
  email: string
  project_name: string
  invoice_type: 'normal' | 'special'
}

export type InvoiceFormErrors = Partial<Record<keyof InvoiceForm, string>>

const BILLING_TABS: readonly [BillingTab, string][] = [
  ['overview', 'console.billing.costTab'],
  ['invoice', 'console.billing.invoice'],
]

// 中文：费用页通过查询参数直达费用或发票页签，非法值统一回退到账务概览。
function billingTabFromSearch(search: string): BillingTab {
  const tab = new URLSearchParams(search).get('tab')
  return BILLING_TABS.some(([key]) => key === tab) ? tab as BillingTab : 'overview'
}

// 中文：快捷金额与充值管理页设计稿保持一致，金额按钮按四列排列。
const RECHARGE_OPTIONS = [10, 50, 100, 1000, 2000, 5000, 10000] as const
const MIN_RECHARGE_AMOUNT = 10
const PAYMENT_STATUS_POLL_INTERVAL_MS = 2000
const PAYMENT_ACTIVE_STATUSES = new Set(['pending', 'paying'])
const DEFAULT_INVOICE_FILE_EXTENSION = 'pdf'
const MAX_INVOICE_TITLE_LENGTH = 255
const MAX_TAX_IDENTIFIER_LENGTH = 128
const MAX_EMAIL_LENGTH = 320
const MAX_PROJECT_NAME_LENGTH = 255

function defaultInvoiceForm(accountName = '', workspaceType: Workspace['type'] = 'personal', projectName = i18n.t('console.billing.defaultProjectName')): InvoiceForm {
  return {
    amount_yuan: '',
    title: accountName,
    tax_identifier: '',
    taxpayer_type: workspaceType === 'enterprise' ? 'enterprise' : 'personal',
    email: '',
    project_name: projectName,
    invoice_type: workspaceType === 'enterprise' ? 'special' : 'normal',
  }
}

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

function escapeCSV(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
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

export function validateInvoiceForm(form: InvoiceForm, available: string): InvoiceFormErrors {
  const errors: InvoiceFormErrors = {}
  const amount = parseAmount(form.amount_yuan)
  const availableAmount = Number(available)
  if (amount === null) errors.amount_yuan = i18n.t('console.billing.invoiceFormAmount')
  else if (!Number.isFinite(availableAmount) || amount > availableAmount) errors.amount_yuan = i18n.t('console.billing.invoiceAmountExceeded', { amount: formatYuan(available, BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES) })

  const title = form.title.trim()
  if (!title) errors.title = i18n.t('console.billing.invoiceTitleRequired')
  else if (Array.from(title).length > MAX_INVOICE_TITLE_LENGTH) errors.title = i18n.t('console.billing.invoiceTitleTooLong', { count: MAX_INVOICE_TITLE_LENGTH })

  const taxIdentifier = form.tax_identifier.trim()
  if (form.taxpayer_type === 'enterprise' && !taxIdentifier) errors.tax_identifier = i18n.t('console.billing.taxpayerRequired')
  else if (Array.from(taxIdentifier).length > MAX_TAX_IDENTIFIER_LENGTH) errors.tax_identifier = i18n.t('console.billing.taxpayerTooLong', { count: MAX_TAX_IDENTIFIER_LENGTH })

  const email = form.email.trim()
  if (!email) errors.email = i18n.t('console.billing.emailRequired')
  else if (email.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = i18n.t('console.billing.emailInvalid')

  if (Array.from(form.project_name.trim()).length > MAX_PROJECT_NAME_LENGTH) errors.project_name = i18n.t('console.billing.projectNameTooLong', { count: MAX_PROJECT_NAME_LENGTH })
  return errors
}

function BillingLoading({ label }: { label: string }) {
  return <div className="billing-loading" role="status"><span className="api-keys-loading-spinner" />{label}</div>
}

function BillingError({ state, onRetry }: { state: ResourceState<unknown>; onRetry: () => void }) {
  return <BannerNotice tone="warning"><span className="billing-request-error-copy"><strong>{state.error}</strong>{state.requestId ? <small>{i18n.t('console.common.requestIdValue', { requestId: state.requestId })}</small> : null}</span><Button theme="borderless" size="small" icon={<IconRefresh />} onClick={onRetry}>{i18n.t('console.common.reload')}</Button></BannerNotice>
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

function extractPaymentQRCodeValue(payment: BillingPaymentStartResult): string {
  const candidates = [
    payment.transaction?.payment_url,
    payment.payment_url,
    payment.qr_code,
    payment.qr_code_url,
    payment.qr_url,
  ]
  return candidates.find((value): value is string => typeof value === 'string' && Boolean(value.trim()))?.trim() ?? ''
}

export function PaymentReturnNotice({ state, onRetry }: { state: ResourceState<BillingPaymentOrder>; onRetry: () => void }) {
  if (state.status === 'idle') return null
  if (state.status === 'loading') return <BannerNotice><span>{i18n.t('console.billing.paymentQuerying')}</span></BannerNotice>
  if (state.status === 'error') return <BannerNotice tone="warning"><span className="billing-request-error-copy"><strong>{state.error}</strong>{state.requestId ? <small>{i18n.t('console.common.requestIdValue', { requestId: state.requestId })}</small> : null}</span><Button theme="borderless" size="small" icon={<IconRefresh />} onClick={onRetry}>{i18n.t('console.common.reload')}</Button></BannerNotice>
  if (!state.data) return null
  const copy = paymentStatusCopy(state.data.status)
  return <BannerNotice tone={copy.tone}><span className="billing-request-error-copy"><strong>{copy.label}</strong><small>{i18n.t('console.billing.paymentReturnOrder', { orderNo: state.data.order_no })}</small></span></BannerNotice>
}

function Metric({ label, value, note, tone = '', action }: { label: string; value: ReactNode; note?: ReactNode; tone?: string; action?: ReactNode }) {
  return <article className={`metric-card billing-metric-card${tone ? ` ${tone}` : ''}`}><span className="metric-label">{label}</span>{action ? <div className="metric-action-slot">{action}</div> : null}<strong className="metric-value">{value}</strong>{note ? <span className="metric-note">{note}</span> : null}</article>
}

function BillingPagination({ page, total, pageSize, label, disabled, onPageChange, onPageSizeChange }: { page: number; total: number; pageSize: number; label: string; disabled: boolean; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void }) {
  return <TraePagination ariaLabel={label} currentPage={page} pageSize={pageSize} total={total} summary={i18n.t('console.billing.pagination', { page, total: formatCount(total) })} disabled={disabled} onChange={(nextPage, nextPageSize) => { if (nextPageSize !== pageSize) onPageSizeChange(nextPageSize); else onPageChange(nextPage) }} />
}

function LedgerTable({ items }: { items: BillingStatementLine[] }) {
  return <div className="source-table-scroll billing-ledger-scroll" role="region" aria-label={i18n.t('console.billing.ledgerTable')} tabIndex={0}><table className="ledger-table"><thead><tr><th>{i18n.t('console.billing.time')}</th><th>{i18n.t('console.billing.type')}</th><th>{i18n.t('console.billing.relatedDescription')}</th><th>{i18n.t('console.billing.amountChange')}</th><th>{i18n.t('console.billing.balance')}</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{formatApiTime(item.occurred_at)}</td><td>{statementKindLabel(item)}</td><td><strong>{statementDescription(item)}</strong>{item.request_id ? <small>{item.request_id}</small> : null}</td><td className={item.direction === 'income' ? 'amount-positive' : item.direction === 'expense' ? 'amount-negative' : ''}><MoneyText value={item.amount_yuan} direction={item.direction} /></td><td>{item.balance_after_yuan ? <MoneyText value={item.balance_after_yuan} /> : '--'}</td></tr>)}</tbody></table></div>
}

function BillingLedgerSection({ state, lineType, page, pageSize, onLineTypeChange, onPageChange, onPageSizeChange, onRetry, onExport }: { state: ResourceState<BillingPageResult<BillingStatementLine>>; lineType: BillingStatementTypeFilter; page: number; pageSize: number; onLineTypeChange: (value: BillingStatementTypeFilter) => void; onPageChange: (value: number) => void; onPageSizeChange: (value: number) => void; onRetry: () => void; onExport: () => void }) {
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
        <Button theme="outline" size="small" icon={<IconDownload />} disabled={!data?.items.length || loading} onClick={onExport}>{i18n.t('console.billing.exportCsv')}</Button>
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

function AnalysisTab({ state, ledger, dateRange, apiKeyID, model, billingType, departmentID, memberID, departments, members, directoryLoading, directoryEnabled, onRecharge, onSubscription, onFilterChange, onDateRangeChange, onRetry }: { state: ResourceState<BillingAnalysisResponse>; ledger: ReactNode; dateRange: Date[]; apiKeyID: string; model: string; billingType: string; departmentID: string; memberID: string; departments: EnterpriseDepartment[]; members: EnterpriseMember[]; directoryLoading: boolean; directoryEnabled: boolean; onRecharge: () => void; onSubscription: () => void; onFilterChange: (key: 'apiKey' | 'model' | 'billingType' | 'department' | 'member', value: string) => void; onDateRangeChange: (value: Date[]) => void; onRetry: () => void }) {
  if (state.status === 'loading' || state.status === 'idle') return <BillingLoading label={i18n.t('console.billing.loadingAnalysis')} />
  if (state.status === 'error') return <BillingError state={state} onRetry={onRetry} />
  const data = state.data
  if (!data) return <EmptyPanel title={i18n.t('console.billing.noAnalysis')} description={i18n.t('console.billing.noAnalysisHint')} />
  // 中文：后端在部分旧版本或权限受限场景下可能省略分析子对象，统一使用空数据渲染。
  const metrics = data.metrics ?? EMPTY_ANALYSIS_METRICS
  const wallet = data.wallet ?? EMPTY_ANALYSIS_WALLET
  // 中文：费用筛选只暴露有别名的模型，旧 code 仅留在服务端兼容查询中。
  // 中文：兼容旧版或权限受限接口未返回筛选项的情况，避免费用页因空数据白屏。
  const filters = {
    periods: data.filters?.periods ?? [],
    api_keys: data.filters?.api_keys ?? [],
    models: (data.filters?.models ?? []).flatMap((option) => {
      const alias = option.alias?.trim() || ''
      if (!alias) return []
      return [
        {
          ...option,
          code: alias,
          name: `${option.name || i18n.t('console.playground.unnamedModel')}（${option.vendor || i18n.t('console.common.unknown')} · ${alias}）`,
        },
      ]
    }),
  }
  const otherCost = (Number(metrics.image_cost_yuan || 0) + Number(metrics.audio_cost_yuan || 0) + Number(metrics.video_cost_yuan || 0)).toFixed(4)
  return (
    <section id="billing-analysis" className="billing-analysis" aria-labelledby="analysisHeading">
      <div className="analysis-header">
        <h2 className="analysis-heading" id="analysisHeading">
          {i18n.t('console.billing.analysis')}
        </h2>
        <div className="analysis-actions">
          <span className="balance-inline">
            {i18n.t('console.billing.balance')}
            <strong>
              <MoneyText value={wallet.total_balance_yuan || wallet.total_available_yuan} />
            </strong>
          </span>
          <Button theme="solid" type="primary" size="small" onClick={onRecharge}>
            {i18n.t('console.billing.rechargeNow')}
          </Button>
          <Button theme="outline" size="small" onClick={onSubscription}>
            {i18n.t('console.billing.subscriptionManage')}
          </Button>
        </div>
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
            {members.map((member) => <Select.Option key={member.id} value={member.id}>{member.display_name || member.user_id}</Select.Option>)}
          </Select>
        </label> : null}
      </div>
      <div className="metric-grid billing-metrics-grid">
        <Metric label={i18n.t('console.billing.currentCost')} value={<MoneyText value={metrics.total_cost_yuan} />} note={i18n.t('console.billing.modelSpend')} tone="highlight" />
        <Metric label={i18n.t('console.billing.inputCost')} value={<MoneyText value={metrics.input_cost_yuan} />} note={i18n.t('console.billing.textInput')} />
        <Metric label={i18n.t('console.billing.outputCost')} value={<MoneyText value={metrics.output_cost_yuan} />} note={i18n.t('console.billing.textOutput')} />
        <Metric label={i18n.t('console.billing.otherCost')} value={<MoneyText value={otherCost} />} note={i18n.t('console.billing.otherCostHint')} />
        <Metric label={i18n.t('console.billing.averageRequestCost')} value={<MoneyText value={metrics.average_request_cost_yuan} />} note={i18n.t('console.billing.billedSuccessRequests')} />
        <Metric label={i18n.t('console.billing.averageMillionTokenCost')} value={<MoneyText value={metrics.average_million_token_yuan} />} note={i18n.t('console.billing.textCallsOnly')} />
      </div>
      <BillingCostCharts modelCosts={data.model_daily_costs ?? []} billingTypeCosts={data.billing_type_daily_costs ?? []} apiKeyCosts={data.api_key_daily_costs ?? []} />
      {ledger}
    </section>
  )
}

// 中文：充值表单独立复用在充值管理页面，费用页仅保留费用概览和发票页签。
export function RechargeTab({ context, onOrderUpdated, onAuthFailure }: { context: BillingContext; onOrderUpdated: () => void; onAuthFailure: () => void }) {
  const navigate = useNavigate()
  const [amount, setAmount] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [paymentOrder, setPaymentOrder] = useState<BillingPaymentOrder | null>(null)
  const [paymentFormHTML, setPaymentFormHTML] = useState('')
  const [paymentQRCodeValue, setPaymentQRCodeValue] = useState('')
  const [paymentFormError, setPaymentFormError] = useState('')
  const [paymentQueryError, setPaymentQueryError] = useState('')
  const [paymentQuerying, setPaymentQuerying] = useState(false)
  const [paymentRefreshToken, setPaymentRefreshToken] = useState(0)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [agreementAccepted, setAgreementAccepted] = useState(true)
  const [paymentMethod, setPaymentMethod] = useState<'alipay' | 'wechat'>('alipay')
  const [realNameDialogOpen, setRealNameDialogOpen] = useState(false)

  const handlePaymentFormError = useCallback((error: unknown) => {
    setPaymentFormError(getBillingErrorMessage(error))
  }, [])

  function closePaymentDialog(): void {
    // 中文：关闭二维码弹窗即结束本次支付会话，避免后台继续查单或复用旧二维码。
    setPaymentDialogOpen(false)
    setPaymentOrder(null)
    setPaymentFormHTML('')
    setPaymentQRCodeValue('')
    setPaymentFormError('')
    setPaymentQueryError('')
    setPaymentQuerying(false)
  }

  useEffect(() => {
    if (!paymentDialogOpen || !paymentOrder || !isPaymentActive(paymentOrder.status)) return
    const controller = new AbortController()
    let disposed = false
    let timer: number | undefined

    // 中文：前置模式没有可靠的跨域支付回跳，持续通过服务端查单确认最终状态。
    const poll = async (): Promise<void> => {
      if (disposed) return
      setPaymentQuerying(true)
      try {
        const latestOrder = await getBillingPaymentOrder(paymentOrder.id, { signal: controller.signal })
        if (disposed) return
        setPaymentQueryError('')
        setPaymentOrder(latestOrder)
        if (!isPaymentActive(latestOrder.status)) {
          onOrderUpdated()
          return
        }
        timer = window.setTimeout(() => void poll(), PAYMENT_STATUS_POLL_INTERVAL_MS)
      } catch (error) {
        if (disposed || controller.signal.aborted) return
        setPaymentQueryError(getBillingErrorMessage(error))
        timer = window.setTimeout(() => void poll(), PAYMENT_STATUS_POLL_INTERVAL_MS)
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
  }, [onOrderUpdated, paymentDialogOpen, paymentOrder?.id, paymentOrder?.status, paymentRefreshToken])

  function choose(value: number): void {
    setSelected(value)
    setAmount(String(value))
  }

  async function handleRecharge(): Promise<void> {
    if (paymentMethod !== 'alipay') {
      Toast.warning(i18n.t('console.billing.wechatPaymentUnavailable'))
      return
    }
    const value = parseAmount(amount)
    if (value === null || value < MIN_RECHARGE_AMOUNT) {
      Toast.error(i18n.t('console.billing.quickAmountError'))
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
      const order = await createBillingPaymentOrder(context, { amount_yuan: amount.trim() }, createIdempotencyKey('payment-order'))
      const payment = await startBillingPayment(order.id, createIdempotencyKey('payment-start'))
      setPaymentOrder(payment.order)
      const qrCodeValue = extractPaymentQRCodeValue(payment)
      const formHTML = payment.form_html?.trim() ?? ''
      setPaymentQRCodeValue(qrCodeValue)
      if (!formHTML && !qrCodeValue) {
        if (payment.order.status === 'paid') {
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
        // 中文：后端业务码是实名认证拦截时，同时保留真实 msg 并展示引导弹窗。
        Toast.error(getBillingErrorMessage(error))
        setRealNameDialogOpen(true)
        return
      }
      Toast.error(getBillingErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const paymentCopy = paymentOrder ? paymentStatusCopy(paymentOrder.status) : null
  const paymentActive = paymentOrder ? isPaymentActive(paymentOrder.status) : false
  const rechargeAmount = parseAmount(amount)

  return (
    <section className="billing-subpage billing-recharge-page">
      <div className="recharge-form-panel">
        <div className="recharge-form-row recharge-amount-row">
          <div className="recharge-form-label"><strong>{i18n.t('console.billing.paymentAmount')}</strong><span className="recharge-required">（{i18n.t('console.billing.required')}）</span></div>
          <div className="recharge-amount-content">
            <div className="recharge-options" id="rechargeOptions">
              {RECHARGE_OPTIONS.map((value) => <button type="button" className={`recharge-option${selected === value ? ' active' : ''}`} aria-pressed={selected === value} key={value} onClick={() => choose(value)}><span className="recharge-amount">¥{value}</span></button>)}
              <button type="button" className={`recharge-option recharge-option-other${selected === null && amount.trim() ? ' active' : ''}`} aria-pressed={selected === null && Boolean(amount.trim())} onClick={() => { setSelected(null); setAmount('') }}><span className="recharge-amount">{i18n.t('console.billing.otherAmount')}</span></button>
            </div>
          </div>
        </div>
        <div className="recharge-form-row recharge-custom-row">
          <label className="recharge-form-label" htmlFor="rechargeCustomAmount">{i18n.t('console.billing.otherAmount')}</label>
          <div className="recharge-custom-input-wrap"><input id="rechargeCustomAmount" className="input" inputMode="decimal" type="number" min={MIN_RECHARGE_AMOUNT} step="0.01" value={amount} onChange={(event) => { setSelected(null); setAmount(event.target.value) }} placeholder={i18n.t('console.billing.rechargeInput')} /><span>{i18n.t('console.billing.amountUnit')}</span></div>
        </div>
        <div className="recharge-form-row recharge-method-row">
          <div className="recharge-form-label"><strong>{i18n.t('console.billing.paymentMethod')}</strong><span className="recharge-required">（{i18n.t('console.billing.required')}）</span></div>
          <div className="recharge-method-controls">
            <button type="button" className={`recharge-method-option${paymentMethod === 'alipay' ? ' is-selected' : ''}`} aria-label={i18n.t('console.billing.alipayPay')} aria-pressed={paymentMethod === 'alipay'} onClick={() => setPaymentMethod('alipay')}><img className="recharge-method-icon" src={alipayIcon} alt="" /><span>{i18n.t('console.billing.alipay')}</span></button>
            <button type="button" className={`recharge-method-option${paymentMethod === 'wechat' ? ' is-selected' : ''}`} aria-pressed={paymentMethod === 'wechat'} onClick={() => setPaymentMethod('wechat')}><img className="recharge-method-icon" src={wechatIcon} alt="" /><span>{i18n.t('console.billing.wechat')}</span></button>
          </div>
        </div>
        <label className="recharge-agreement"><input type="checkbox" checked={agreementAccepted} onChange={(event) => setAgreementAccepted(event.target.checked)} /><span>{i18n.t('console.billing.rechargeAgreementPrefix')} <Link to="/recharge-agreement">{i18n.t('footer.rechargeAgreement')}</Link></span></label>
        <Button className="recharge-confirm-button" theme="solid" type="primary" aria-label={i18n.t('console.billing.confirmPayment')} loading={submitting} disabled={submitting || !agreementAccepted || rechargeAmount === null || rechargeAmount < MIN_RECHARGE_AMOUNT} onClick={() => void handleRecharge()}><span>{i18n.t('console.billing.confirmPayment')}</span>{rechargeAmount !== null ? <span aria-hidden="true"> {formatYuan(rechargeAmount, 2)}</span> : null}</Button>
        <p className="billing-demo-note">{i18n.t('console.billing.paymentSecurityNote')}</p>
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

function InvoiceDialog({ open, available, form, errors, step, submitting, onClose, onChange, onNext, onBack, onSubmit }: { open: boolean; available: string; form: InvoiceForm; errors: InvoiceFormErrors; step: 1 | 2 | 3; submitting: boolean; onClose: () => void; onChange: (key: keyof InvoiceForm, value: string) => void; onNext: () => void; onBack: () => void; onSubmit: () => void }) {
  const fieldError = (key: keyof InvoiceForm): ReactNode => errors[key] ? <small className="invoice-field-error" id={`invoice-${key}-error`} role="alert">{errors[key]}</small> : null
  const fieldClass = (key: keyof InvoiceForm): string => `invoice-field${errors[key] ? ' has-error' : ''}`
  return <Modal visible={open} title={step === 1 ? i18n.t('console.billing.applyInvoice') : step === 2 ? i18n.t('console.billing.confirmInvoice') : i18n.t('console.billing.invoiceSuccess')} onCancel={onClose} footer={null} className="invoice-dialog">
    <div className="invoice-steps"><span className={step >= 1 ? 'active' : ''}>1 {i18n.t('console.billing.fillStep')}</span><i /><span className={step >= 2 ? 'active' : ''}>2 {i18n.t('console.billing.confirmStep')}</span><i /><span className={step >= 3 ? 'active' : ''}>3 {i18n.t('console.billing.doneStep')}</span></div>
    {step === 1 ? <div className="dialog-body">
      <div className="invoice-form-grid">
        <label className={fieldClass('title')}><span className="invoice-field-label">{i18n.t('console.billing.invoiceTitle')} <em>*</em></span><input id="invoice-title" className="input" value={form.title} onChange={(event) => onChange('title', event.target.value)} required placeholder={i18n.t('console.billing.invoiceTitleRequired')} aria-invalid={Boolean(errors.title)} aria-describedby="invoice-title-error" />{fieldError('title')}</label>
        <label className={fieldClass('tax_identifier')}><span className="invoice-field-label">{i18n.t('console.billing.taxpayerId')}{form.taxpayer_type === 'enterprise' ? <em>*</em> : null}</span><input id="invoice-tax-identifier" className="input" value={form.tax_identifier} onChange={(event) => onChange('tax_identifier', event.target.value)} placeholder={i18n.t('console.billing.taxpayerIdPlaceholder')} aria-invalid={Boolean(errors.tax_identifier)} aria-describedby="invoice-tax_identifier-error" />{fieldError('tax_identifier')}</label>
        <label className={fieldClass('taxpayer_type')}><span className="invoice-field-label">{i18n.t('console.billing.taxpayerType')}</span><select id="invoice-taxpayer-type" className="input" value={form.taxpayer_type} onChange={(event) => onChange('taxpayer_type', event.target.value)} aria-invalid={Boolean(errors.taxpayer_type)} aria-describedby="invoice-taxpayer_type-error"><option value="enterprise">{i18n.t('console.billing.enterprise')}</option><option value="personal">{i18n.t('console.billing.personal')}</option></select>{fieldError('taxpayer_type')}</label>
        <label className={fieldClass('invoice_type')}><span className="invoice-field-label">{i18n.t('console.billing.invoiceType')}</span><select id="invoice-type" className="input" value={form.invoice_type} onChange={(event) => onChange('invoice_type', event.target.value)} aria-invalid={Boolean(errors.invoice_type)} aria-describedby="invoice-invoice_type-error"><option value="special">{invoiceTypeLabel('special')}</option><option value="normal">{invoiceTypeLabel('normal')}</option></select>{fieldError('invoice_type')}</label>
        <label className={fieldClass('project_name')}><span className="invoice-field-label">{i18n.t('console.billing.projectName')}</span><input id="invoice-project-name" className="input" value={form.project_name} readOnly aria-invalid={Boolean(errors.project_name)} aria-describedby="invoice-project_name-error" />{fieldError('project_name')}<small className="invoice-field-note">{i18n.t('console.billing.projectNameHint')}</small></label>
        <label className={fieldClass('amount_yuan')}><span className="invoice-field-label">{i18n.t('console.billing.invoiceAmountYuan')} <em>*</em></span><input id="invoice-amount" className="input" inputMode="decimal" type="number" min="0.01" max={available} step="0.01" value={form.amount_yuan} onChange={(event) => onChange('amount_yuan', event.target.value)} placeholder={i18n.t('console.billing.amountMax', { amount: formatYuan(available, BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES) })} required aria-invalid={Boolean(errors.amount_yuan)} aria-describedby="invoice-amount_yuan-error" />{fieldError('amount_yuan')}</label>
        <div className={fieldClass('email') + ' invoice-field-wide'}><label className="invoice-field-label" htmlFor="invoice-email">{i18n.t('console.billing.receivingEmail')} <em>*</em></label><input id="invoice-email" className="input" type="email" value={form.email} onChange={(event) => onChange('email', event.target.value)} placeholder={i18n.t('console.billing.accountEmail')} required aria-invalid={Boolean(errors.email)} aria-describedby="invoice-email-error" />{fieldError('email')}<small className="invoice-field-note">{i18n.t('console.billing.emailHint')}</small></div>
      </div>
      <p className="invoice-demo-note">{i18n.t('console.billing.invoiceSubmitDemo')}</p>
      <div className="dialog-foot"><Link className="invoice-enterprise-link" to="/console/enterprise-create">{i18n.t('console.billing.enterpriseVerification')}</Link><Button theme="borderless" onClick={onClose}>{i18n.t('console.common.cancel')}</Button><Button theme="solid" type="primary" onClick={onNext}>{i18n.t('console.billing.confirmInvoice')}</Button></div>
    </div> : step === 2 ? <div className="dialog-body">
      <p className="invoice-dialog-note">{i18n.t('console.billing.confirmInvoiceInfo')}</p>
      <dl className="invoice-confirm-grid"><dt>{i18n.t('console.billing.invoiceTitle')}</dt><dd>{form.title}</dd><dt>{i18n.t('console.billing.taxpayerType')}</dt><dd>{form.taxpayer_type === 'enterprise' ? i18n.t('console.billing.enterprise') : i18n.t('console.billing.personal')}</dd><dt>{i18n.t('console.billing.invoiceType')}</dt><dd>{invoiceTypeLabel(form.invoice_type)}</dd><dt>{i18n.t('console.billing.invoiceAmount')}</dt><dd><MoneyText value={form.amount_yuan} /></dd><dt>{i18n.t('console.billing.receivingEmail')}</dt><dd>{form.email}</dd></dl>
      <div className="dialog-foot"><Button theme="borderless" onClick={onBack} disabled={submitting}>{i18n.t('console.billing.checkAgain')}</Button><Button theme="solid" type="primary" loading={submitting} onClick={onSubmit}>{i18n.t('console.billing.confirmSubmit')}</Button></div>
    </div> : <div className="dialog-body invoice-success"><div className="invoice-success-mark" aria-hidden="true"><IconTickCircle /></div><p className="invoice-dialog-note">{i18n.t('console.billing.invoiceSuccessHint')}</p><p className="invoice-demo-note">{i18n.t('console.billing.invoiceSuccessDemo')}</p><div className="dialog-foot"><Button theme="solid" type="primary" onClick={onClose}>{i18n.t('console.common.confirm')}</Button></div></div>}
  </Modal>
}

function InvoiceTab({ state, faqOpen, downloadingInvoiceID, onToggleFaq, onRetry, onOpenDialog, onDownload, onPageChange, onPageSizeChange, page, pageSize }: { state: ResourceState<BillingInvoiceResponse>; faqOpen: boolean; downloadingInvoiceID: string | null; onToggleFaq: () => void; onRetry: () => void; onOpenDialog: () => void; onDownload: (item: BillingInvoiceItem) => void; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void; page: number; pageSize: number }) {
  if (state.status === 'loading' || state.status === 'idle') return <BillingLoading label={i18n.t('console.billing.invoiceLoading')} />
  if (state.status === 'error') return <BillingError state={state} onRetry={onRetry} />
  if (!state.data) return <EmptyPanel title={i18n.t('console.billing.invoiceInfo')} description={i18n.t('console.billing.invoiceInfoHint')} />
  const data = state.data
  return <section id="invoiceSection" className="invoice-page" aria-labelledby="invoiceHeading" tabIndex={-1}><h2 id="invoiceHeading" className="sr-only">{i18n.t('console.billing.invoice')}</h2><div className="invoice-faq"><button type="button" className="invoice-faq-toggle" aria-expanded={faqOpen} aria-controls="invoiceFaqBody" onClick={onToggleFaq}><span>{i18n.t('console.billing.invoiceFaq')}</span><span className="sr-only">{i18n.t('console.billing.invoiceFaqToggle')}</span></button><div className="invoice-faq-body" id="invoiceFaqBody" hidden={!faqOpen}>{i18n.t('console.billing.invoiceFaqHint')}</div></div><div id="invoiceOverview" data-invoice-view="overview"><p className="invoice-demo-note">{i18n.t('console.billing.localInvoiceNote')}</p><div className="invoice-metrics" aria-label={i18n.t('console.billing.invoiceOverview')}><Metric label={i18n.t('console.billing.availableAmount')} value={<MoneyText value={data.available_amount_yuan} />} tone="invoice-metric-primary" action={<Button className="invoice-metric-action" theme="solid" type="primary" size="small" onClick={onOpenDialog} disabled={isZeroYuan(data.available_amount_yuan)}>{i18n.t('console.billing.invoiceNow')}</Button>} /><Metric label={i18n.t('console.billing.issued')} value={formatCount(data.issued_count ?? 0)} note={i18n.t('console.billing.issuedDone')} /><Metric label={i18n.t('console.billing.issuing')} value={formatCount(data.pending_count ?? 0)} note={i18n.t('console.billing.waiting')} /></div><InvoiceHistory response={data} downloadingInvoiceID={downloadingInvoiceID} onDownload={onDownload} /><BillingPagination page={page} total={data.history.total} pageSize={data.history.page_size || pageSize} label={i18n.t('console.billing.invoiceHistory')} disabled={state.status !== 'success'} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} /></div></section>
}

export function BillingPage() {
  const { t, i18n: translation } = useTranslation()
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
  const [analysisState, setAnalysisState] = useState<ResourceState<BillingAnalysisResponse>>(resourceState())
  const [ledgerState, setLedgerState] = useState<ResourceState<BillingPageResult<BillingStatementLine>>>(resourceState())
  const [invoiceState, setInvoiceState] = useState<ResourceState<BillingInvoiceResponse>>(resourceState())
  const [invoiceFaqOpen, setInvoiceFaqOpen] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogStep, setDialogStep] = useState<1 | 2 | 3>(1)
  const [invoiceForm, setInvoiceForm] = useState<InvoiceForm>(() => defaultInvoiceForm())
  const [invoiceFormErrors, setInvoiceFormErrors] = useState<InvoiceFormErrors>({})
  const [submittingInvoice, setSubmittingInvoice] = useState(false)
  const [downloadingInvoiceID, setDownloadingInvoiceID] = useState<string | null>(null)
  const [paymentReturnState, setPaymentReturnState] = useState<ResourceState<BillingPaymentOrder>>(resourceState())
  const [paymentReturnRetryToken, setPaymentReturnRetryToken] = useState(0)

  // 中文：兼容旧版费用页充值链接，保留订单参数后转到新的充值管理页面。
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('tab') !== 'recharge') return
    const orderID = params.get('order_id')?.trim()
    navigate(`/console/recharge${orderID ? `?order_id=${encodeURIComponent(orderID)}` : ''}`, { replace: true })
  }, [location.search, navigate])

  // 中文：项目名称由当前语言资源决定且字段只读，语言切换时同步已有表单，避免提交旧语言的演示值。
  useEffect(() => {
    setInvoiceForm((previous) => ({ ...previous, project_name: t('console.billing.defaultProjectName') }))
  }, [t, translation.language])

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
    setPeriod(currentPeriod())
    setDateRange(defaultBillingDateRange())
    setLedgerState(resourceState())
    setInvoiceState(resourceState())
    setPaymentReturnState(resourceState())
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
    void getBillingPaymentOrder(paymentReturnOrderID, { signal: controller.signal }).then((order) => {
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
  }, [handleAuthFailure, loadError, paymentReturnOrderID, paymentReturnRetryToken])

  useEffect(() => {
    const controller = new AbortController()
    setAnalysisState((previous) => ({ ...resourceState('loading'), data: previous.data }))
    const startAt = dateRange[0]?.getTime()
    const endAt = dateRange[1] ? dateRange[1].getTime() + 1 : undefined
    void getBillingAnalysis(context, { start_at: startAt, end_at: endAt, api_key_id: apiKeyID || undefined, model: model || undefined, billing_type: billingType || undefined, department_id: departmentID || undefined, member_id: memberID || undefined, signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return
      setAnalysisState({ status: 'success', data, error: '', requestId: null })
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      if (isAuthenticationFailure(error)) {
        handleAuthFailure()
        return
      }
      setAnalysisState(loadError(error))
    })
    return () => controller.abort()
  }, [apiKeyID, billingType, context, dateRange, departmentID, handleAuthFailure, loadError, memberID, model, reloadToken])

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

  function exportCSV(): void {
    const ledger = ledgerState.data?.items ?? []
    const rows = [[t('console.billing.time'), t('console.billing.type'), t('console.billing.relatedDescription'), t('console.billing.amountChange'), t('console.billing.balance')], ...ledger.map((item) => [formatApiTime(item.occurred_at), statementKindLabel(item), statementDescription(item), formatSignedYuanExact(item.amount_yuan, item.direction), item.balance_after_yuan ? formatYuanExact(item.balance_after_yuan) : '--'])]
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCSV).join(',')).join('\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `token-nx-billing-${period}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    Toast.success(t('console.billing.ledgerExported'))
  }

  function openInvoiceDialog(): void {
    setInvoiceForm({ ...defaultInvoiceForm(invoiceState.data?.account.name, activeWorkspace.type, t('console.billing.defaultProjectName')), amount_yuan: invoiceState.data?.available_amount_yuan ?? '' })
    setInvoiceFormErrors({})
    setDialogStep(1)
    setDialogOpen(true)
  }

  function closeInvoiceDialog(): void {
    if (submittingInvoice) return
    setDialogOpen(false)
    setDialogStep(1)
    setInvoiceFormErrors({})
  }

  function updateInvoiceForm(key: keyof InvoiceForm, value: string): void {
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
    setSubmittingInvoice(true)
    const input: BillingInvoiceInput = {
      amount_yuan: invoiceForm.amount_yuan,
      title: invoiceForm.title,
      tax_identifier: invoiceForm.tax_identifier,
      taxpayer_type: invoiceForm.taxpayer_type,
      email: invoiceForm.email,
      project_name: invoiceForm.project_name,
      invoice_type: invoiceForm.invoice_type,
    }
    try {
      await submitBillingInvoice(context, input, createIdempotencyKey())
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
    if (downloadingInvoiceID) return
    setDownloadingInvoiceID(item.id)
    try {
      const response = await downloadBillingInvoice(item.download_url)
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      const extension = item.file_type.trim() || DEFAULT_INVOICE_FILE_EXTENSION
      anchor.href = url
      anchor.download = `${item.request_no || 'invoice'}.${extension}`
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
      setDownloadingInvoiceID(null)
    }
  }

  const onTabChange = (tab: BillingTab): void => {
    setActiveTab(tab)
    if (tab === 'invoice' && invoiceState.status === 'idle') setInvoicePage(BILLING_FIRST_PAGE)
  }

  const ledgerSection = <BillingLedgerSection state={ledgerState} lineType={ledgerLineType} page={ledgerPage} pageSize={ledgerPageSize} onLineTypeChange={(value) => { setLedgerLineType(value); setLedgerPage(BILLING_FIRST_PAGE) }} onPageChange={setLedgerPage} onPageSizeChange={(value) => { setLedgerPageSize(value); setLedgerPage(BILLING_FIRST_PAGE) }} onRetry={() => setReloadToken((value) => value + 1)} onExport={exportCSV} />

  let content: ReactNode
  if (activeTab === 'overview') content = <AnalysisTab state={analysisState} ledger={ledgerSection} dateRange={dateRange} apiKeyID={apiKeyID} model={model} billingType={billingType} departmentID={departmentID} memberID={memberID} departments={departments} members={members} directoryLoading={directoryLoading} directoryEnabled={context.account_type === 'enterprise'} onRecharge={() => navigate('/console/recharge')} onSubscription={() => navigate('/console/trae-enterprise/subscription')} onFilterChange={changeAnalysisFilter} onDateRangeChange={changeAnalysisDateRange} onRetry={() => setReloadToken((value) => value + 1)} />
  else content = <InvoiceTab state={invoiceState} faqOpen={invoiceFaqOpen} downloadingInvoiceID={downloadingInvoiceID} onToggleFaq={() => setInvoiceFaqOpen((value) => !value)} onRetry={() => setReloadToken((value) => value + 1)} onOpenDialog={openInvoiceDialog} onDownload={(item) => void downloadInvoice(item)} onPageChange={setInvoicePage} onPageSizeChange={(nextPageSize) => { setInvoicePageSize(nextPageSize); setInvoicePage(BILLING_FIRST_PAGE) }} page={invoicePage} pageSize={invoicePageSize} />

  return <div className="page-stack billing-console-page"><PageTitle title={t('console.billing.title')} description={t('console.billing.description')} /><RequestFocus data={analysisState.data} requestId={requestedRecordId} /><PaymentReturnNotice state={paymentReturnState} onRetry={() => setPaymentReturnRetryToken((value) => value + 1)} /><ConsoleTabs items={BILLING_TABS.map(([itemKey, label]) => ({ itemKey, tab: t(label) }))} activeKey={activeTab} onChange={(value) => onTabChange(value as BillingTab)} ariaLabel={t('console.billing.title')} /><div className="billing-tab-panel" role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>{content}</div><InvoiceDialog open={dialogOpen} available={invoiceState.data?.available_amount_yuan ?? '0.00'} form={invoiceForm} errors={invoiceFormErrors} step={dialogStep} submitting={submittingInvoice} onClose={closeInvoiceDialog} onChange={updateInvoiceForm} onNext={nextInvoiceStep} onBack={() => { setDialogStep(1); setInvoiceFormErrors({}) }} onSubmit={() => void submitInvoice()} /></div>
}
