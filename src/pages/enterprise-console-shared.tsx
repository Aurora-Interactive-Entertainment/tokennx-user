import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import { IconDownload, IconRefresh } from '@douyinfe/semi-icons'
import { BannerNotice, EmptyPanel, PageTitle } from '@/components/common'
import { MoneyText } from '@/components/money'
import { getAccessToken } from '@/auth/token-storage'
import { getEnterpriseContext, getEnterpriseErrorMessage, getEnterpriseRequestId, type EnterpriseContext, type EnterpriseRequestContext, type EnterpriseRoleOption, type EnterpriseUsageMetrics, type EnterpriseUsageTrendPoint } from '@/api/enterprise-console'
import { isAuthenticationFailure } from '@/api/http'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'
import { useAppStore } from '@/data/app-state'
import { formatCount, formatApiTime, formatYuan, type ApiTimeValue } from '@/utils/format'
import i18n from '@/i18n'

export type EnterpriseCapability = keyof EnterpriseContext['capabilities']

export type EnterpriseRequestError = { message: string; requestId: string | null }

type EnterpriseContextState = {
  context: EnterpriseContext | null
  loading: boolean
  error: { message: string; requestId: string | null } | null
  reload: () => void
}

export function useEnterpriseConsoleContext(): EnterpriseContextState {
  const store = useAppStore()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const enterpriseID = store.activeWorkspace.type === 'enterprise' ? store.activeWorkspace.id : ''
  const [context, setContext] = useState<EnterpriseContext | null>(null)
  const [loading, setLoading] = useState(Boolean(enterpriseID))
  const [error, setError] = useState<EnterpriseContextState['error']>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!enterpriseID) {
      setContext(null)
      setError(null)
      setLoading(false)
      return undefined
    }
    const controller = new AbortController()
    let active = true
    setContext(null)
    setError(null)
    setLoading(true)
    const requestContext: EnterpriseRequestContext = { enterprise_id: enterpriseID }
    getEnterpriseContext(requestContext, { accessToken: getAccessToken() ?? undefined, signal: controller.signal }).then((result) => {
      if (active) setContext(result)
    }).catch((reason: unknown) => {
      if (!active || controller.signal.aborted) return
      if (isAuthenticationFailure(reason)) {
        dispatch(invalidateAuth())
        navigate('/', { replace: true })
        return
      }
      if (active) setError({ message: getEnterpriseErrorMessage(reason), requestId: getEnterpriseRequestId(reason) })
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [dispatch, enterpriseID, navigate, reloadToken])

  const reload = useCallback(() => setReloadToken((value) => value + 1), [])
  return { context, loading, error, reload }
}

export function useEnterpriseErrorHandler(): (reason: unknown) => EnterpriseRequestError | null {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  return useCallback((reason: unknown) => {
    if (isAuthenticationFailure(reason)) {
      dispatch(invalidateAuth())
      navigate('/', { replace: true })
      return null
    }
    return { message: getEnterpriseErrorMessage(reason), requestId: getEnterpriseRequestId(reason) }
  }, [dispatch, navigate])
}

type EnterprisePageShellProps = {
  title: string
  description: string
  actions?: ReactNode
  capability?: EnterpriseCapability
  className?: string
  children: (context: EnterpriseContext) => ReactNode
}

export function EnterprisePageShell({ title, description, actions, capability, className = '', children }: EnterprisePageShellProps) {
  const { t } = useTranslation()
  const store = useAppStore()
  const { context, loading, error, reload } = useEnterpriseConsoleContext()
  const pageTitle = <PageTitle title={title} description={description} actions={actions} />

  if (store.activeWorkspace.type !== 'enterprise') {
    return <div className="page-stack enterprise-gated-page">{pageTitle}<BannerNotice tone="warning">{t('console.enterprise.gated')}</BannerNotice></div>
  }
  if (loading || !context && !error) {
    return <div className="page-stack enterprise-gated-page" aria-busy="true">{pageTitle}<EnterpriseLoading label={t('console.enterprise.contextLoading')} /></div>
  }
  if (error || !context) {
    return <div className="page-stack enterprise-gated-page">{pageTitle}<EnterpriseError message={error?.message ?? t('console.enterprise.contextFailed')} requestId={error?.requestId ?? null} onRetry={reload} /></div>
  }
  if (capability && !context.capabilities[capability]) {
    return <div className="page-stack enterprise-gated-page">{pageTitle}<BannerNotice tone="warning">{t('console.enterprise.noPermission')}</BannerNotice></div>
  }
  return <div className={`page-stack enterprise-console-page${className ? ` ${className}` : ''}`}>{pageTitle}{children(context)}</div>
}

export function EnterpriseLoading({ label }: { label?: string }) {
  const { t } = useTranslation()
  return <div className="enterprise-loading" role="status"><span className="console-loading-spinner" />{label ?? t('console.enterprise.loadData')}</div>
}

export function EnterpriseError({ message, requestId, onRetry }: { message: string; requestId: string | null; onRetry: () => void }) {
  const { t } = useTranslation()
  return <section className="enterprise-error-panel" role="alert"><strong>{message}</strong>{requestId ? <small>{t('console.common.requestIdValue', { requestId })}</small> : null}<Button theme="outline" icon={<IconRefresh aria-hidden="true" />} onClick={onRetry}>{t('console.enterprise.reload')}</Button></section>
}

export function EnterpriseEmpty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <EmptyPanel title={title} description={description} action={action} />
}

export function EnterpriseRefreshButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const { t } = useTranslation()
  const resolvedLabel = label ?? t('console.enterprise.refresh')
  return <Button theme="borderless" icon={<IconRefresh />} aria-label={resolvedLabel} title={resolvedLabel} onClick={onClick} />
}

export function EnterpriseExportButton({ onClick, disabled = false, label }: { onClick: () => void; disabled?: boolean; label?: string }) {
  const { t } = useTranslation()
  const resolvedLabel = label ?? t('console.enterprise.exportCurrent')
  // 中文：图标组件自带的 aria-label 不能覆盖业务动作名称，按钮统一暴露当前导出动作。
  return <Button theme="outline" icon={<IconDownload />} aria-label={resolvedLabel} title={resolvedLabel} disabled={disabled} onClick={onClick}>{resolvedLabel}</Button>
}

export function roleLabel(value: string, options: EnterpriseRoleOption[] = []): string {
  const code = value.trim()
  const option = options.find((item) => item.code === code)
  if (option?.owner_role || code === 'owner') return i18n.t('console.enterpriseSettings.owner')
  return option?.name || code || i18n.t('console.enterprise.roleUnnamed')
}

export function roleVisualClass(value: string, options: EnterpriseRoleOption[] = []): 'owner' | 'custom' {
  return options.find((item) => item.code === value)?.owner_role ? 'owner' : 'custom'
}

export function memberStatusLabel(value: string): string {
  if (value === 'active') return i18n.t('console.enterprise.memberActive')
  if (value === 'suspended') return i18n.t('console.enterprise.memberSuspended')
  if (value === 'removed') return i18n.t('console.enterprise.memberRemoved')
  return value || i18n.t('console.enterprise.memberUnknown')
}

export function joinRequestStatusLabel(value: string): string {
  if (value === 'pending') return i18n.t('console.enterprise.pendingReview')
  if (value === 'approved') return i18n.t('console.enterprise.approved')
  if (value === 'rejected') return i18n.t('console.enterprise.rejected')
  if (value === 'cancelled') return i18n.t('console.enterprise.cancelled')
  return value || i18n.t('console.enterprise.memberUnknown')
}

export function invitationStatusLabel(value: string): string {
  if (value === 'active') return i18n.t('console.enterprise.invitationActive')
  if (value === 'revoked') return i18n.t('console.enterprise.revoked')
  if (value === 'disabled') return i18n.t('console.enterprise.invitationDisabled')
  if (value === 'expired') return i18n.t('console.enterprise.expired')
  if (value === 'exhausted') return i18n.t('console.enterprise.exhausted')
  return value || i18n.t('console.enterprise.memberUnknown')
}

export function auditResultLabel(value: string): string {
  if (value === 'success' || value === 'succeeded') return i18n.t('console.enterprise.resultSuccess')
  if (value === 'failed' || value === 'failure') return i18n.t('console.enterprise.resultFailed')
  return value || i18n.t('console.enterprise.resultUnknown')
}

export function formatEnterpriseTime(value: ApiTimeValue | null | undefined): string {
  return formatApiTime(value)
}

export function formatEnterpriseNumber(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '--' : formatCount(value)
}

export function formatEnterpriseMoney(value: string | null | undefined): string {
  return formatYuan(value)
}

export function formatEnterpriseRate(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '--' : `${value.toFixed(1)}%`
}

export function formatEnterpriseLatency(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '--' : i18n.t('console.enterprise.shared.latencySeconds', { value: (value / 1000).toFixed(2) })
}

export function validateEnterpriseDateRange(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return i18n.t('console.enterprise.chooseDate')
  if (startDate > endDate) return i18n.t('console.enterprise.dateOrder')
  return ''
}

export function EnterpriseValidationError({ message }: { message: string }) {
  return <div className="enterprise-inline-error" role="alert">{message}</div>
}

export function exportEnterpriseCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>): void {
  const escapeCell = (value: string | number | null | undefined): string => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = `\ufeff${[headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n')}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function metricsSummary(metrics: EnterpriseUsageMetrics): Array<[string, string, string]> {
  return [
    [i18n.t('console.enterprise.shared.requests'), formatEnterpriseNumber(metrics.request_count), i18n.t('console.enterprise.shared.requestUnit')],
    [i18n.t('console.enterprise.shared.activeMembers'), formatEnterpriseNumber(metrics.active_members), i18n.t('console.enterprise.shared.people')],
    [i18n.t('console.enterprise.shared.successRate'), formatEnterpriseRate(metrics.success_rate), i18n.t('console.enterprise.shared.currentRange')],
    [i18n.t('console.enterprise.shared.inputTokens'), formatEnterpriseNumber(metrics.input_tokens), 'tokens'],
    [i18n.t('console.enterprise.shared.outputTokens'), formatEnterpriseNumber(metrics.output_tokens), 'tokens'],
    [i18n.t('console.enterprise.shared.cachedTokens'), formatEnterpriseNumber(metrics.cached_tokens), 'tokens'],
    [i18n.t('console.enterprise.shared.totalCost'), formatEnterpriseMoney(metrics.total_cost_yuan), 'CNY'],
    [i18n.t('console.enterprise.shared.averageLatency'), formatEnterpriseLatency(metrics.average_latency_ms), i18n.t('console.enterprise.shared.perRequest')],
  ]
}

type EnterpriseTrendTableProps = {
  data: EnterpriseUsageTrendPoint[]
  metric: 'requests' | 'cost' | 'tokens'
}

export function EnterpriseTrendTable({ data, metric }: EnterpriseTrendTableProps) {
  const { t } = useTranslation()
  const metricLabel = metric === 'requests' ? t('console.enterprise.shared.requests') : metric === 'cost' ? t('console.enterprise.shared.cost') : 'Token'
  return <details className="enterprise-trend-data"><summary>{t('console.enterprise.shared.trendDataTable', { metric: metricLabel })}</summary><div className="source-table-scroll"><table><thead><tr><th>{t('console.enterprise.shared.date')}</th><th>{t('console.enterprise.shared.requests')}</th><th>{t('console.enterprise.shared.inputTokensHeader')}</th><th>{t('console.enterprise.shared.outputTokensHeader')}</th><th>{t('console.enterprise.shared.cost')}</th><th>{t('console.enterprise.shared.averageLatency')}</th></tr></thead><tbody>{data.map((point) => <tr key={point.date}><td>{point.date}</td><td>{formatEnterpriseNumber(point.request_count)}</td><td>{formatEnterpriseNumber(point.input_tokens)}</td><td>{formatEnterpriseNumber(point.output_tokens)}</td><td><MoneyText value={point.cost_yuan} /></td><td>{formatEnterpriseLatency(point.average_latency_ms)}</td></tr>)}</tbody></table></div></details>
}

export function EnterpriseDimensionBars({ title, items, canViewBilling = true, model = false }: { title: string; items: Array<{ name: string; code?: string; alias?: string; requests: number; cost_yuan: string }>; canViewBilling?: boolean; model?: boolean }) {
  const { t } = useTranslation()
  const maxRequests = Math.max(...items.map((item) => item.requests), 0)
  return <section className="enterprise-dimension-card"><div className="enterprise-section-heading"><h2>{title}</h2><span>{t('console.enterprise.shared.dimensions', { count: items.length })}</span></div>{items.length === 0 ? <EnterpriseEmpty title={t('console.enterprise.shared.noDistribution')} description={t('console.enterprise.shared.noDistributionHint')} /> : <ol className="enterprise-dimension-list">{items.map((item) => { const rawName = item.name?.trim() || ''; const safeName = model && rawName === item.code?.trim() ? t('console.enterprise.shared.unregisteredModel') : rawName || (model ? t('console.enterprise.shared.unregisteredModel') : t('console.enterprise.shared.unknownDimension')); const alias = model ? item.alias?.trim() : ''; const label = alias ? t('console.enterprise.shared.modelAlias', { name: safeName, alias }) : safeName; return <li key={label}><div className="enterprise-dimension-meta"><strong title={label}>{label}</strong><span>{formatEnterpriseNumber(item.requests)} {t('console.enterprise.shared.requestUnit')}{canViewBilling ? <> · <MoneyText value={item.cost_yuan} /></> : null}</span></div><div className="enterprise-dimension-track" aria-hidden="true"><i style={{ width: `${maxRequests > 0 ? Math.max(4, item.requests / maxRequests * 100) : 0}%` }} /></div></li> })}</ol>}</section>
}

export function metricsRows(metrics: EnterpriseUsageMetrics): Array<[string, string]> {
  return metricsSummary(metrics).map(([label, value, unit]) => [label, `${value}${unit === 'CNY' ? '' : unit ? ` ${unit}` : ''}`])
}
