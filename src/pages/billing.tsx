import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Modal from '@/components/app-modal'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { IconDownload, IconRefresh, IconTickCircle } from '@douyinfe/semi-icons'
import { isAuthenticationFailure } from '@/api/http'
import {
  BILLING_FIRST_PAGE,
  BILLING_PAGE_SIZE,
	getBillingAnalysis,
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
  type BillingLedgerItem,
  type BillingPaymentOrder,
	 type BillingStatementLine,
} from '@/api/billing'
import { BannerNotice, EmptyPanel, PageTitle } from '@/components/common'
import { TraePagination } from '@/components/trae-pagination'
import { MoneyText } from '@/components/money'
import { PaymentQRCodeFrame } from '@/components/payment-qr-frame'
import { CompatSelect as Select } from '@/components/semi-compat'
import { useAppStore, type Workspace } from '@/data/app-state'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'
import i18n from '@/i18n'
import { formatApiTime, formatCount, formatSignedYuanExact, formatYuan, formatYuanExact, isZeroYuan } from '@/utils/format'

export type BillingTab = 'overview' | 'recharge' | 'subscription' | 'invoice'
type ResourceStatus = 'idle' | 'loading' | 'success' | 'error'
type BillingSource = 'all' | 'model_consume' | 'recharge' | 'reward'
type InvoiceTaxpayerType = 'enterprise' | 'personal'

interface ResourceState<T> {
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
  ['recharge', 'console.billing.recharge'],
  ['subscription', 'console.billing.subscriptionPack'],
  ['invoice', 'console.billing.invoice'],
]

// 中文：页脚套餐入口通过查询参数直达对应页签，非法值统一回退到账务概览。
function billingTabFromSearch(search: string): BillingTab {
  const tab = new URLSearchParams(search).get('tab')
  return BILLING_TABS.some(([key]) => key === tab) ? tab as BillingTab : 'overview'
}

const RECHARGE_OPTIONS = [100, 500, 1000, 5000] as const
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

function signedLedgerAmount(item: BillingLedgerItem): string {
  return formatSignedYuanExact(item.amount_yuan, item.direction)
}

function ledgerReference(item: BillingLedgerItem): string {
  return item.model_alias?.trim() || item.api_key_id?.trim() || ''
}

// 账本类型按服务端稳定标识展示，确保赠送记录不会落入模型消费的兜底分支。
export function ledgerKindLabel(kind: BillingLedgerItem['kind']): string {
  if (kind === 'recharge') return i18n.t('console.billing.recharge')
  if (kind === 'reward') return i18n.t('console.billing.gift')
  return i18n.t('console.billing.modelConsumption')
}

export function statementKindLabel(line: Pick<BillingStatementLine, 'line_type' | 'source_type' | 'title' | 'description'>): string {
  const source = `${line.line_type} ${line.source_type} ${line.title} ${line.description}`.toLocaleLowerCase()
  if (source.includes('partial') || source.includes('部分')) return i18n.t('console.billing.statementPartialRevoke')
  if (source.includes('revoke') || source.includes('撤销')) return i18n.t('console.billing.statementRevoke')
  if (source.includes('expire') || source.includes('过期')) return i18n.t('console.billing.statementRewardExpired')
  if (source.includes('consume') || source.includes('usage') || source.includes('消费')) return i18n.t('console.billing.statementConsume')
  if (source.includes('reward') || source.includes('grant') || source.includes('bonus') || source.includes('奖励') || source.includes('赠送')) return i18n.t('console.billing.statementRewardGranted')
  if (source.includes('other') || source.includes('其他')) return i18n.t('console.billing.statementOther')
  return i18n.language.startsWith('en') ? line.line_type || i18n.t('console.billing.statementOther') : line.title || line.line_type
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
  else if (!Number.isFinite(availableAmount) || amount > availableAmount) errors.amount_yuan = i18n.t('console.billing.invoiceAmountExceeded', { amount: formatYuan(available) })

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

function paymentStatusCopy(status: string): { tone: 'info' | 'warning' | 'success'; label: string } {
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

function PaymentReturnNotice({ state, onRetry }: { state: ResourceState<BillingPaymentOrder>; onRetry: () => void }) {
  if (state.status === 'idle') return null
  if (state.status === 'loading') return <BannerNotice><span>{i18n.t('console.billing.paymentQuerying')}</span></BannerNotice>
  if (state.status === 'error') return <BannerNotice tone="warning"><span className="billing-request-error-copy"><strong>{state.error}</strong>{state.requestId ? <small>{i18n.t('console.common.requestIdValue', { requestId: state.requestId })}</small> : null}</span><Button theme="borderless" size="small" icon={<IconRefresh />} onClick={onRetry}>{i18n.t('console.common.reload')}</Button></BannerNotice>
  if (!state.data) return null
  const copy = paymentStatusCopy(state.data.status)
  return <BannerNotice tone={copy.tone}><span className="billing-request-error-copy"><strong>{copy.label}</strong><small>{i18n.t('console.billing.paymentReturnOrder', { orderNo: state.data.order_no })}</small></span></BannerNotice>
}

function Metric({ label, value, note, tone = '', action }: { label: string; value: ReactNode; note: ReactNode; tone?: string; action?: ReactNode }) {
  return <article className={`metric-card billing-metric-card${tone ? ` ${tone}` : ''}`}><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong>{action ?? <span className="metric-note">{note}</span>}{action ? <span className="metric-note">{note}</span> : null}</article>
}

function BillingPagination({ page, total, pageSize, label, disabled, onPageChange, onPageSizeChange }: { page: number; total: number; pageSize: number; label: string; disabled: boolean; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void }) {
  return <TraePagination ariaLabel={label} currentPage={page} pageSize={pageSize} total={total} summary={i18n.t('console.billing.pagination', { page, total: formatCount(total) })} disabled={disabled} onChange={(nextPage, nextPageSize) => { if (nextPageSize !== pageSize) onPageSizeChange(nextPageSize); else onPageChange(nextPage) }} />
}

function LedgerTable({ items }: { items: BillingLedgerItem[] }) {
  return <div className="source-table-scroll billing-ledger-scroll" role="region" aria-label={i18n.t('console.billing.ledgerTable')} tabIndex={0}><table className="ledger-table"><thead><tr><th>{i18n.t('console.billing.time')}</th><th>{i18n.t('console.billing.type')}</th><th>{i18n.t('console.billing.source')}</th><th>{i18n.t('console.billing.relatedDescription')}</th><th>{i18n.t('console.billing.amountChange')}</th><th>{i18n.t('console.billing.balance')}</th></tr></thead><tbody>{items.map((item) => <tr key={`${item.kind}-${item.id}`}><td>{formatApiTime(item.occurred_at)}</td><td>{ledgerKindLabel(item.kind)}</td><td>{item.channel || '--'}</td><td><strong>{item.description || '--'}</strong>{item.request_id && item.kind !== 'reward' ? <small>{item.request_id}</small> : null}{ledgerReference(item) ? <small>{ledgerReference(item)}</small> : null}</td><td className={item.direction === 'income' ? 'amount-positive' : 'amount-negative'}><MoneyText value={item.amount_yuan} direction={item.direction} /></td><td>{item.balance_after_yuan ? <MoneyText value={item.balance_after_yuan} /> : '--'}</td></tr>)}</tbody></table></div>
}

function RequestFocus({ data, requestId }: { data: BillingAnalysisResponse | null; requestId: string }) {
  if (!requestId) return null
  const entry = data?.ledger.items.find((item) => item.request_id === requestId)
  return <div className="callout request-focus" aria-live="polite"><strong>{entry ? i18n.t('console.billing.requestSummary', { requestId }) : i18n.t('console.billing.requestNotFound', { requestId })}</strong><span>{entry ? <>{entry.description} · {entry.direction === 'expense' ? i18n.t('console.common.success') : i18n.t('console.billing.notBilled')} · {entry.direction === 'expense' ? <>{i18n.t('console.billing.cost')} <MoneyText value={entry.amount_yuan} /></> : i18n.t('console.billing.notBilled')}</> : i18n.t('console.billing.cleanedRequest')}</span><div className="request-focus-actions"><Link className="btn btn-secondary btn-sm" to="/console/billing">{i18n.t('console.billing.allLedger')}</Link></div></div>
}

function AnalysisTab({ state, periodValue, apiKeyID, model, source, requestedRecordId, onRecharge, onSubscription, onInvoice, onSourceChange, onFilterChange, onPageChange, onPageSizeChange, page, pageSize, onRetry, onExport }: { state: ResourceState<BillingAnalysisResponse>; periodValue: string; apiKeyID: string; model: string; source: BillingSource; requestedRecordId: string; onRecharge: () => void; onSubscription: () => void; onInvoice: () => void; onSourceChange: (source: BillingSource) => void; onFilterChange: (key: 'period' | 'apiKey' | 'model', value: string) => void; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void; page: number; pageSize: number; onRetry: () => void; onExport: () => void }) {
  if (state.status === 'loading' || state.status === 'idle') return <BillingLoading label={i18n.t('console.billing.loadingAnalysis')} />
  if (state.status === 'error') return <BillingError state={state} onRetry={onRetry} />
  const data = state.data
  if (!data) return <EmptyPanel title={i18n.t('console.billing.noAnalysis')} description={i18n.t('console.billing.noAnalysisHint')} />
  const { metrics, wallet, ledger, period } = data
  // 中文：费用筛选只暴露有别名的模型，旧 code 仅留在服务端兼容查询中。
  const filters = {
    ...data.filters,
    models: data.filters.models.flatMap((option) => {
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
  const visibleItems = requestedRecordId ? ledger.items.filter((item) => item.request_id === requestedRecordId) : ledger.items
  const visibleTotal = requestedRecordId ? visibleItems.length : ledger.total
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
          <span id="billing-period-filter-label" className="billing-filter-label">
            {i18n.t('console.billing.billingPeriod')}
          </span>
          <Select id="billing-period-filter" className="billing-filter" aria-labelledby="billing-period-filter-label" value={periodValue} onChange={(value) => onFilterChange('period', String(value))} onSelect={(value) => onFilterChange('period', String(value))} block>
            {filters.periods.map((option) => (
              <Select.Option value={option.value} key={option.value}>
                {billingPeriodLabel(option)}
              </Select.Option>
            ))}
          </Select>
        </label>
        <label className="billing-filter-field" htmlFor="billing-api-key-filter">
          <span id="billing-api-key-filter-label" className="billing-filter-label">
            {i18n.t('console.billing.apiKey')}
          </span>
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
          <span id="billing-model-filter-label" className="billing-filter-label">
            {i18n.t('console.billing.model')}
          </span>
          <Select id="billing-model-filter" className="billing-filter" aria-labelledby="billing-model-filter-label" value={model} onChange={(value) => onFilterChange('model', String(value))} onSelect={(value) => onFilterChange('model', String(value))} block>
            <Select.Option value="">{i18n.t('console.billing.allModels')}</Select.Option>
            {filters.models.map((option) => (
              <Select.Option value={option.code} key={option.code}>
                {option.name || option.code}
              </Select.Option>
            ))}
          </Select>
        </label>
      </div>
      <div className="metric-grid billing-metrics-grid">
        <Metric label={i18n.t('console.billing.currentCost')} value={<MoneyText value={metrics.total_cost_yuan} />} note={i18n.t('console.billing.modelSpend')} tone="highlight" />
        <Metric label={i18n.t('console.billing.inputCost')} value={<MoneyText value={metrics.input_cost_yuan} />} note={i18n.t('console.billing.textInput')} />
        <Metric label={i18n.t('console.billing.outputCost')} value={<MoneyText value={metrics.output_cost_yuan} />} note={i18n.t('console.billing.textOutput')} />
        <Metric
          label={i18n.t('console.billing.imageCount')}
          value={i18n.t('console.billing.imageQuantity', {
            count: formatCount(metrics.image_count),
          })}
          note={
            <>
              {i18n.t('console.billing.cost')} <MoneyText value={metrics.image_cost_yuan} />
            </>
          }
        />
        <Metric
          label={i18n.t('console.billing.audioCount')}
          value={i18n.t('console.billing.audioQuantity', {
            count: formatCount(metrics.audio_count),
          })}
          note={
            <>
              {i18n.t('console.billing.cost')} <MoneyText value={metrics.audio_cost_yuan} />
            </>
          }
        />
        <Metric
          label={i18n.t('console.billing.videoCount')}
          value={i18n.t('console.billing.videoQuantity', {
            count: formatCount(metrics.video_count),
          })}
          note={
            <>
              {i18n.t('console.billing.cost')} <MoneyText value={metrics.video_cost_yuan} />
            </>
          }
        />
        <Metric label={i18n.t('console.billing.averageRequestCost')} value={<MoneyText value={metrics.average_request_cost_yuan} />} note={i18n.t('console.billing.billedSuccessRequests')} />
        <Metric label={i18n.t('console.billing.averageMillionTokenCost')} value={<MoneyText value={metrics.average_million_token_yuan} />} note={i18n.t('console.billing.textCallsOnly')} />
        <Metric
          label={i18n.t('console.billing.availableAmount')}
          value={<MoneyText value={metrics.billable_amount_yuan} />}
          note={i18n.t('console.billing.billableBalance')}
          tone="highlight"
          action={
            <Button className="metric-card-action" theme="outline" size="small" onClick={onInvoice}>
              {i18n.t('console.billing.goInvoice')}
            </Button>
          }
        />{' '}
      </div>
      <section className="analysis-section" id="ledgerSection" aria-labelledby="ledgerHeading">
        <div className="section-heading">
          <div>
            <h2 id="ledgerHeading" tabIndex={-1}>
              {i18n.t('console.billing.ledger')}
            </h2>
          </div>
          <div className="ledger-toolbar">
            <span className="section-meta">
              {i18n.t('console.billing.billedRequestCount', {
                count: formatCount(metrics.request_count),
              })}
            </span>
            <label className="ledger-filter-field" htmlFor="billing-source-filter">
              <span id="billing-source-filter-label" className="billing-filter-label">
                {i18n.t('console.billing.consumptionType')}
              </span>
              <Select id="billing-source-filter" className="billing-filter" aria-labelledby="billing-source-filter-label" value={source} onChange={(value) => onSourceChange(String(value) as BillingSource)} onSelect={(value) => onSourceChange(String(value) as BillingSource)}>
                <Select.Option value="all">{i18n.t('console.billing.all')}</Select.Option>
                <Select.Option value="model_consume">{i18n.t('console.billing.modelConsumption')}</Select.Option>
                <Select.Option value="recharge">{i18n.t('console.billing.recharge')}</Select.Option>
                <Select.Option value="reward">{i18n.t('console.billing.gift')}</Select.Option>
              </Select>
            </label>
            <Button theme="outline" size="small" icon={<IconDownload />} onClick={onExport} disabled={visibleItems.length === 0}>
              {i18n.t('console.billing.exportCsv')}
            </Button>
          </div>
        </div>
        {visibleItems.length === 0 ? (
          <EmptyPanel title={i18n.t('console.billing.noLedger')} description={i18n.t('console.billing.adjustLedger')} />
        ) : (
          <div className="table-scroll">
            <LedgerTable items={visibleItems} />
          </div>
        )}
        <BillingPagination page={page} total={visibleTotal} pageSize={ledger.page_size || pageSize} label={i18n.t('console.billing.ledgerPagination')} disabled={state.status !== 'success'} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />
      </section>
    </section>
  )
}

function RechargeTab({ context, onOrderUpdated, onAuthFailure }: { context: BillingContext; onOrderUpdated: () => void; onAuthFailure: () => void }) {
  const [amount, setAmount] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [paymentOrder, setPaymentOrder] = useState<BillingPaymentOrder | null>(null)
  const [paymentFormHTML, setPaymentFormHTML] = useState('')
  const [paymentFormError, setPaymentFormError] = useState('')
  const [paymentQueryError, setPaymentQueryError] = useState('')
  const [paymentQuerying, setPaymentQuerying] = useState(false)
  const [paymentRefreshToken, setPaymentRefreshToken] = useState(0)
  const personalOnly = context.account_type === 'personal'

  const handlePaymentFormError = useCallback((error: unknown) => {
    setPaymentFormError(getBillingErrorMessage(error))
  }, [])

  useEffect(() => {
    if (!paymentOrder || !isPaymentActive(paymentOrder.status)) return
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
  }, [onOrderUpdated, paymentOrder?.id, paymentOrder?.status, paymentRefreshToken])

  function choose(value: number): void {
    setSelected(value)
    setAmount(String(value))
  }

  async function handleRecharge(): Promise<void> {
    const value = parseAmount(amount)
    if (value === null) {
      Toast.error(i18n.t('console.billing.quickAmountError'))
      return
    }
    if (!personalOnly) {
      Toast.warning(i18n.t('console.billing.enterpriseRechargeUnavailable'))
      return
    }
    if (submitting) return
    setSubmitting(true)
    setPaymentOrder(null)
    setPaymentFormHTML('')
    setPaymentFormError('')
    setPaymentQueryError('')
    try {
      const order = await createBillingPaymentOrder(context, { amount_yuan: amount.trim() }, createIdempotencyKey('payment-order'))
      const payment = await startBillingPayment(context, order.id, createIdempotencyKey('payment-start'))
      setPaymentOrder(payment.order)
      if (!payment.form_html.trim()) {
        if (payment.order.status === 'paid') {
          onOrderUpdated()
          Toast.success(i18n.t('console.billing.paymentStatusPaid'))
          return
        }
        throw new Error(i18n.t('api.billing.paymentFormInvalid'))
      }
      setPaymentFormHTML(payment.form_html)
    } catch (error) {
      if (isAuthenticationFailure(error)) {
        onAuthFailure()
        return
      }
      Toast.error(getBillingErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const paymentCopy = paymentOrder ? paymentStatusCopy(paymentOrder.status) : null
  const paymentActive = paymentOrder ? isPaymentActive(paymentOrder.status) : false

  return (
    <section className="billing-subpage billing-recharge-page">
      <BannerNotice><strong>{i18n.t('console.billing.paymentTitle')}</strong><span>{i18n.t('console.billing.paymentDescription')}</span></BannerNotice>
      {!personalOnly ? <BannerNotice tone="warning">{i18n.t('console.billing.enterpriseRechargeUnavailable')}</BannerNotice> : null}
      <div className="billing-subpage-copy"><h2>{i18n.t('console.billing.quickAmount')}</h2><p>{i18n.t('console.billing.quickAmountHint')}</p></div>
      <div className="recharge-options" id="rechargeOptions">{RECHARGE_OPTIONS.map((value) => <button type="button" className={`recharge-option${selected === value ? ' active' : ''}`} aria-pressed={selected === value} key={value} onClick={() => choose(value)}><span className="recharge-amount"><MoneyText value={value} /></span></button>)}</div>
      <div className="billing-custom-amount"><label className="billing-filter-field"><span className="billing-filter-label">{i18n.t('console.billing.customAmount')}</span><input className="input" inputMode="decimal" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => { setSelected(null); setAmount(event.target.value) }} placeholder={i18n.t('console.billing.rechargeInput')} /></label><span>{i18n.t('console.billing.amountUnit')}</span><Button theme="solid" type="primary" loading={submitting} disabled={!personalOnly || submitting} onClick={() => void handleRecharge()}>{i18n.t('console.billing.alipayPay')}</Button></div>
      <p className="billing-demo-note">{i18n.t('console.billing.paymentSecurityNote')}</p>
      {paymentOrder && paymentCopy ? <section className="payment-qr-panel" aria-labelledby="paymentQrTitle">
        <div className="payment-qr-panel-head"><div><h2 id="paymentQrTitle">{i18n.t('console.billing.paymentFrameTitle')}</h2><p>{i18n.t('console.billing.paymentReturnOrder', { orderNo: paymentOrder.order_no })}</p></div><Button theme="outline" size="small" icon={<IconRefresh />} loading={paymentQuerying} disabled={!paymentActive || paymentQuerying} onClick={() => { setPaymentQueryError(''); setPaymentRefreshToken((value) => value + 1) }}>{i18n.t('console.billing.paymentRefresh')}</Button></div>
        <BannerNotice tone={paymentCopy.tone}><span>{paymentCopy.label}</span></BannerNotice>
        {paymentQueryError ? <BannerNotice tone="warning"><span>{paymentQueryError}</span></BannerNotice> : null}
        {paymentFormError ? <BannerNotice tone="warning"><span>{paymentFormError}</span></BannerNotice> : null}
        {paymentActive && paymentFormHTML ? <><p className="payment-qr-hint">{i18n.t('console.billing.paymentFrameHint')}</p><PaymentQRCodeFrame formHTML={paymentFormHTML} title={i18n.t('console.billing.paymentFrameTitle')} errorMessage={i18n.t('api.billing.paymentFormInvalid')} onError={handlePaymentFormError} /></> : null}
      </section> : null}
    </section>
  )
}

function SubscriptionTab() {
  return <section className="empty-state billing-empty-subscription"><h3>{i18n.t('console.billing.subscriptionClosed')}</h3><p>{i18n.t('console.billing.subscriptionClosedHint')}</p></section>
}

function InvoiceHistory({ response, downloadingInvoiceID, onDownload }: { response: BillingInvoiceResponse; downloadingInvoiceID: string | null; onDownload: (item: BillingInvoiceItem) => void }) {
  const history = response.history
  return <section className="invoice-history" aria-labelledby="invoiceHistoryHeading"><h2 id="invoiceHistoryHeading">{i18n.t('console.billing.invoiceHistory')}</h2>{history.items.length === 0 ? <EmptyPanel title={i18n.t('console.billing.noInvoice')} description={i18n.t('console.billing.invoiceHint')} /> : <div className="invoice-table-scroll" role="region" aria-label={i18n.t('console.billing.invoiceHistoryTable')} tabIndex={0}><table className="invoice-history-table"><thead><tr><th>{i18n.t('console.billing.submittedAt')}</th><th>{i18n.t('console.billing.invoiceAmount')}</th><th>{i18n.t('console.billing.invoiceEntity')}</th><th>{i18n.t('console.billing.invoiceMethod')}</th><th>{i18n.t('console.billing.invoiceTitle')}</th><th>{i18n.t('console.billing.invoiceType')}</th><th>{i18n.t('console.billing.status')}</th><th>{i18n.t('console.billing.operation')}</th></tr></thead><tbody>{history.items.map((item) => { const downloading = downloadingInvoiceID === item.id; return <tr key={item.id}><td>{formatApiTime(item.submitted_at)}</td><td><MoneyText value={item.amount_yuan} /></td><td>{response.account.name}</td><td>{i18n.t('console.billing.manualApply')}</td><td>{item.title_masked || '--'}</td><td>{invoiceTypeLabel(item.invoice_type)}</td><td><span className={invoiceStatusClass(item.status)}>{invoiceStatusLabel(item)}</span></td><td>{item.download_url ? <a href={item.download_url} download aria-busy={downloading} aria-disabled={downloading} onClick={(event) => { event.preventDefault(); if (!downloading) onDownload(item) }}>{downloading ? i18n.t('console.billing.downloading') : i18n.t('console.billing.view')}</a> : <span className="invoice-status-pending">{i18n.t('console.billing.invoiceProcessing')}</span>}</td></tr> })}</tbody></table></div>}</section>
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
        <label className={fieldClass('amount_yuan')}><span className="invoice-field-label">{i18n.t('console.billing.invoiceAmountYuan')} <em>*</em></span><input id="invoice-amount" className="input" inputMode="decimal" type="number" min="0.01" max={available} step="0.01" value={form.amount_yuan} onChange={(event) => onChange('amount_yuan', event.target.value)} placeholder={i18n.t('console.billing.amountMax', { amount: formatYuan(available) })} required aria-invalid={Boolean(errors.amount_yuan)} aria-describedby="invoice-amount_yuan-error" />{fieldError('amount_yuan')}</label>
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
  return <section id="invoiceSection" className="invoice-page" aria-labelledby="invoiceHeading" tabIndex={-1}><h2 id="invoiceHeading" className="sr-only">{i18n.t('console.billing.invoice')}</h2><div className="invoice-faq"><button type="button" className="invoice-faq-toggle" aria-expanded={faqOpen} aria-controls="invoiceFaqBody" onClick={onToggleFaq}><span>{i18n.t('console.billing.invoiceFaq')}</span><span className="sr-only">{i18n.t('console.billing.invoiceFaqToggle')}</span></button><div className="invoice-faq-body" id="invoiceFaqBody" hidden={!faqOpen}>{i18n.t('console.billing.invoiceFaqHint')}</div></div><div id="invoiceOverview" data-invoice-view="overview"><p className="invoice-demo-note">{i18n.t('console.billing.localInvoiceNote')}</p><div className="invoice-metrics" aria-label={i18n.t('console.billing.invoiceOverview')}><Metric label={i18n.t('console.billing.availableAmount')} value={<MoneyText value={data.available_amount_yuan} />} note={i18n.t('console.billing.available')} tone="invoice-metric-primary" action={<Button className="invoice-metric-action" theme="solid" type="primary" size="small" onClick={onOpenDialog} disabled={isZeroYuan(data.available_amount_yuan)}>{i18n.t('console.billing.invoiceNow')}</Button>} /><Metric label={i18n.t('console.billing.issued')} value={formatCount(data.issued_count ?? 0)} note={i18n.t('console.billing.issuedDone')} /><Metric label={i18n.t('console.billing.issuing')} value={formatCount(data.pending_count ?? 0)} note={i18n.t('console.billing.waiting')} /></div><InvoiceHistory response={data} downloadingInvoiceID={downloadingInvoiceID} onDownload={onDownload} /><BillingPagination page={page} total={data.history.total} pageSize={data.history.page_size || pageSize} label={i18n.t('console.billing.invoiceHistory')} disabled={state.status !== 'success'} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} /></div></section>
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
  const [analysisPage, setAnalysisPage] = useState(BILLING_FIRST_PAGE)
  const [analysisPageSize, setAnalysisPageSize] = useState(BILLING_PAGE_SIZE)
  const [invoicePage, setInvoicePage] = useState(BILLING_FIRST_PAGE)
  const [invoicePageSize, setInvoicePageSize] = useState(BILLING_PAGE_SIZE)
  const [period, setPeriod] = useState(currentPeriod)
  const [apiKeyID, setApiKeyID] = useState('')
  const [model, setModel] = useState('')
  const [source, setSource] = useState<BillingSource>('all')
  const [analysisState, setAnalysisState] = useState<ResourceState<BillingAnalysisResponse>>(resourceState())
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
    setAnalysisPage(BILLING_FIRST_PAGE)
    setAnalysisPageSize(BILLING_PAGE_SIZE)
    setInvoicePage(BILLING_FIRST_PAGE)
    setInvoicePageSize(BILLING_PAGE_SIZE)
    setApiKeyID('')
    setModel('')
    setSource('all')
    setPeriod(currentPeriod())
    setInvoiceState(resourceState())
    setPaymentReturnState(resourceState())
  }, [contextKey, requestedTab])

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
    void getBillingAnalysis(context, { period, api_key_id: apiKeyID || undefined, model: model || undefined, source, page: analysisPage, page_size: analysisPageSize, signal: controller.signal }).then((data) => {
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
  }, [analysisPage, analysisPageSize, apiKeyID, context, handleAuthFailure, loadError, model, period, reloadToken, source])

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

  function changeAnalysisFilter(key: 'period' | 'apiKey' | 'model', value: string): void {
    setAnalysisPage(BILLING_FIRST_PAGE)
    if (key === 'period') setPeriod(value)
    if (key === 'apiKey') setApiKeyID(value)
    if (key === 'model') setModel(value)
  }

  function exportCSV(): void {
    const ledger = analysisState.data?.ledger.items ?? []
    const rows = [[t('console.billing.time'), t('console.billing.type'), t('console.billing.source'), t('console.billing.relatedDescription'), t('console.billing.amountChange'), t('console.billing.balance')], ...ledger.map((item) => [formatApiTime(item.occurred_at), ledgerKindLabel(item.kind), item.channel, item.description, signedLedgerAmount(item), item.balance_after_yuan ? formatYuanExact(item.balance_after_yuan) : '--'])]
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

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % BILLING_TABS.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + BILLING_TABS.length) % BILLING_TABS.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = BILLING_TABS.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    setActiveTab(BILLING_TABS[nextIndex][0])
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus()
  }

  const onTabChange = (tab: BillingTab): void => {
    setActiveTab(tab)
    if (tab === 'invoice' && invoiceState.status === 'idle') setInvoicePage(BILLING_FIRST_PAGE)
  }

  let content: ReactNode
  if (activeTab === 'overview') content = <AnalysisTab state={analysisState} periodValue={period} apiKeyID={apiKeyID} model={model} source={source} requestedRecordId={requestedRecordId} onRecharge={() => onTabChange('recharge')} onSubscription={() => onTabChange('subscription')} onInvoice={() => onTabChange('invoice')} onSourceChange={(value) => { setSource(value); setAnalysisPage(BILLING_FIRST_PAGE) }} onFilterChange={changeAnalysisFilter} onPageChange={setAnalysisPage} onPageSizeChange={(nextPageSize) => { setAnalysisPageSize(nextPageSize); setAnalysisPage(BILLING_FIRST_PAGE) }} page={analysisPage} pageSize={analysisPageSize} onRetry={() => setReloadToken((value) => value + 1)} onExport={exportCSV} />
  else if (activeTab === 'recharge') content = <RechargeTab context={context} onOrderUpdated={() => setReloadToken((value) => value + 1)} onAuthFailure={handleAuthFailure} />
  else if (activeTab === 'subscription') content = <SubscriptionTab />
  else content = <InvoiceTab state={invoiceState} faqOpen={invoiceFaqOpen} downloadingInvoiceID={downloadingInvoiceID} onToggleFaq={() => setInvoiceFaqOpen((value) => !value)} onRetry={() => setReloadToken((value) => value + 1)} onOpenDialog={openInvoiceDialog} onDownload={(item) => void downloadInvoice(item)} onPageChange={setInvoicePage} onPageSizeChange={(nextPageSize) => { setInvoicePageSize(nextPageSize); setInvoicePage(BILLING_FIRST_PAGE) }} page={invoicePage} pageSize={invoicePageSize} />

  return <div className="page-stack billing-console-page"><PageTitle title={t('console.billing.title')} description={t('console.billing.description')} /><RequestFocus data={analysisState.data} requestId={requestedRecordId} /><PaymentReturnNotice state={paymentReturnState} onRetry={() => setPaymentReturnRetryToken((value) => value + 1)} /><div className="billing-tabs" role="tablist" aria-label={t('console.billing.title')}>{BILLING_TABS.map(([key, label], index) => <button id={`tab-${key}`} type="button" role="tab" aria-controls={`panel-${key}`} aria-selected={activeTab === key} tabIndex={activeTab === key ? 0 : -1} className={activeTab === key ? 'active' : ''} key={key} onClick={() => onTabChange(key)} onKeyDown={(event) => onTabKeyDown(event, index)}>{t(label)}</button>)}</div><div className="billing-tab-panel" role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>{content}</div><InvoiceDialog open={dialogOpen} available={invoiceState.data?.available_amount_yuan ?? '0.00'} form={invoiceForm} errors={invoiceFormErrors} step={dialogStep} submitting={submittingInvoice} onClose={closeInvoiceDialog} onChange={updateInvoiceForm} onNext={nextInvoiceStep} onBack={() => { setDialogStep(1); setInvoiceFormErrors({}) }} onSubmit={() => void submitInvoice()} /></div>
}
