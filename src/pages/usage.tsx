import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import { IconRefresh } from '@douyinfe/semi-icons'
import { BannerNotice, PageTitle } from '@/components/common'
import { MoneyText } from '@/components/money'
import { UsageDistributionChart, UsageTrendChart, type UsageTrendMetric } from '@/components/usage-charts'
import { getAccessToken } from '@/auth/token-storage'
import { isAuthenticationFailure } from '@/api/http'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'
import { useAppStore } from '@/data/app-state'
import i18n from '@/i18n'
import { formatLocalDateInput, localDateToTimestamp, shiftLocalDate } from '@/utils/format'
import {
  getUsageSummary,
  getUsageSummaryErrorMessage,
  getUsageSummaryRequestId,
  USAGE_SUMMARY_FIRST_PAGE,
  USAGE_SUMMARY_PAGE_SIZE,
  type UsageRecordsContext,
  type UsageRecordsSource,
  type UsageRecordsStatus,
  type UsageSummaryQuery,
  type UsageSummaryRange,
  type UsageSummaryResponse,
} from '@/api/usage-records'

const DATE_RANGE_TODAY: UsageSummaryRange = 'today'
const DATE_RANGE_WEEK: UsageSummaryRange = '7d'
const DATE_RANGE_MONTH: UsageSummaryRange = '30d'
const DATE_RANGE_CUSTOM: UsageSummaryRange = 'custom'
const DEFAULT_CUSTOM_RANGE_DAYS = 6

type UsageFilterState = {
  range: UsageSummaryRange
  model: string
  source: UsageRecordsSource
  status: UsageRecordsStatus
  apiKeyID: string
  memberID: string
  startDate: string
  endDate: string
}

function customDateDefaults(): Pick<UsageFilterState, 'startDate' | 'endDate'> {
  const today = new Date()
  return { startDate: formatLocalDateInput(shiftLocalDate(today, -DEFAULT_CUSTOM_RANGE_DAYS)), endDate: formatLocalDateInput(today) }
}

function dateRangeQuery(filters: UsageFilterState): Pick<UsageSummaryQuery, 'start_at' | 'end_at'> {
  if (filters.range === DATE_RANGE_CUSTOM) {
    return {
      start_at: filters.startDate ? localDateToTimestamp(filters.startDate) : undefined,
      end_at: filters.endDate ? localDateToTimestamp(filters.endDate, true) : undefined,
    }
  }
  const today = new Date()
  const end = formatLocalDateInput(today)
  const days = filters.range === DATE_RANGE_TODAY ? 0 : filters.range === DATE_RANGE_WEEK ? DEFAULT_CUSTOM_RANGE_DAYS : 29
  const start = formatLocalDateInput(shiftLocalDate(today, -days))
  return { start_at: localDateToTimestamp(start), end_at: localDateToTimestamp(end, true) }
}

function createDefaultFilters(): UsageFilterState {
  return { range: DATE_RANGE_WEEK, model: 'all', source: 'all', status: 'all', apiKeyID: 'all', memberID: 'all', startDate: '', endDate: '' }
}

function formatInteger(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString(i18n.language.startsWith('en') ? 'en-US' : 'zh-CN') : '--'
}

function formatCost(value: string, visible: boolean): ReactNode {
  if (!visible) return '--'
  return <MoneyText value={value} />
}

function formatLatency(value: number | null): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '--' : i18n.t('console.common.seconds', { value: (value / 1000).toFixed(2) })
}

function formatRate(value: number | null): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '--' : `${value.toFixed(1)}%`
}

function selectOption<T extends { id: string; name: string }>(options: T[], selected: string, fallbackLabel: string): T[] {
  if (selected === 'all' || options.some((option) => option.id === selected)) return options
  return [{ id: selected, name: fallbackLabel } as T, ...options]
}

function modelOption(options: UsageSummaryResponse['filters']['models'], selected: string): UsageSummaryResponse['filters']['models'] {
  const available = options.filter((option) => option.alias?.trim())
  if (selected === 'all' || available.some((option) => option.alias === selected)) return available
  return available
}

function UsageSelect({ id, label, value, onChange, children }: { id: string; label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="usage-reference-filter" htmlFor={id}><span>{label}</span><select id={id} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>
}

function UsageMetric({ label, value, unit, primary = false }: { label: string; value: ReactNode; unit?: string; primary?: boolean }) {
  return <article className={`usage-reference-metric${primary ? ' is-primary' : ''}`}><span>{label}</span><strong>{value}</strong>{unit ? <small>{unit}</small> : null}</article>
}

function UsageTableEmpty({ description }: { description: string }) {
  return <tr><td className="usage-table-empty" colSpan={7}>{description}</td></tr>
}

export function UsagePage({ enterprise = false }: { enterprise?: boolean }) {
  const { t } = useTranslation()
  const store = useAppStore()
  if (enterprise && store.activeWorkspace.type !== 'enterprise') {
    return <div className="page-stack usage-reference-page"><PageTitle title={t('console.usage.enterpriseTitle')} description={t('console.usage.enterpriseDescription')} /><BannerNotice tone="warning">{t('console.usage.enterpriseSwitch')}</BannerNotice></div>
  }
  return <UsageSummaryPage enterpriseRoute={enterprise} />
}

function UsageSummaryPage({ enterpriseRoute }: { enterpriseRoute: boolean }) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const store = useAppStore()
  const [filters, setFilters] = useState<UsageFilterState>(createDefaultFilters)
  const [trendMetric, setTrendMetric] = useState<UsageTrendMetric>('requests')
  const [data, setData] = useState<UsageSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const previousWorkspaceKey = useRef(`${store.activeWorkspace.type}:${store.activeWorkspace.id}`)
  const workspaceContext = useMemo<UsageRecordsContext>(() => store.activeWorkspace.type === 'enterprise'
    ? { account_type: 'enterprise', enterprise_id: store.activeWorkspace.id }
    : { account_type: 'personal' }, [store.activeWorkspace.id, store.activeWorkspace.type])
  const workspaceKey = `${workspaceContext.account_type}:${workspaceContext.enterprise_id ?? 'personal'}`
  const query = useMemo<UsageSummaryQuery>(() => ({
    range: filters.range,
    page: USAGE_SUMMARY_FIRST_PAGE,
    page_size: USAGE_SUMMARY_PAGE_SIZE,
    api_key_id: filters.apiKeyID === 'all' ? undefined : filters.apiKeyID,
    model: filters.model === 'all' ? undefined : filters.model,
    source: filters.source,
    status: filters.status,
    member_id: filters.memberID === 'all' ? undefined : filters.memberID,
    ...dateRangeQuery(filters),
  }), [filters])

  useEffect(() => {
    if (previousWorkspaceKey.current === workspaceKey) return
    previousWorkspaceKey.current = workspaceKey
    setFilters(createDefaultFilters())
    setData(null)
  }, [workspaceKey])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    getUsageSummary(workspaceContext, { ...query, accessToken: getAccessToken() ?? undefined, signal: controller.signal }).then((response) => {
      if (active) setData(response)
    }).catch((reason: unknown) => {
      if (!active || controller.signal.aborted) return
      if (isAuthenticationFailure(reason)) {
        dispatch(invalidateAuth())
        navigate('/', { replace: true })
        return
      }
      setError({ message: getUsageSummaryErrorMessage(reason), requestId: getUsageSummaryRequestId(reason) })
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [dispatch, navigate, query, reloadToken, workspaceContext])

  function updateFilter<Key extends keyof UsageFilterState>(key: Key, value: UsageFilterState[Key]): void {
    setFilters((previous) => ({ ...previous, [key]: value }))
  }

  function updateRange(value: UsageSummaryRange): void {
    setFilters((previous) => ({ ...previous, range: value, ...(value === DATE_RANGE_CUSTOM ? customDateDefaults() : { startDate: '', endDate: '' }) }))
  }

  function resetFilters(): void {
    setFilters(createDefaultFilters())
    setTrendMetric('requests')
  }

  const apiKeyOptions = selectOption(data?.filters.api_keys ?? [], filters.apiKeyID, t('console.usage.currentKey'))
  const modelOptions = modelOption(data?.filters.models ?? [], filters.model)
  const memberOptions = selectOption(data?.filters.members ?? [], filters.memberID, t('console.usage.currentMember'))
  const metrics = data?.metrics
  const modelRows = data?.model_rows ?? []
  const trendData = data?.trend ?? []
  const hasVisibleData = Boolean(metrics?.request_count)

  useEffect(() => {
    if (!data || filters.model === 'all') return
    const selectedModel = data.filters.models.find((option) => option.alias === filters.model || option.code === filters.model)
    const nextAlias = selectedModel?.alias?.trim() || 'all'
    if (nextAlias === filters.model) return
    setFilters((previous) => previous.model === filters.model ? { ...previous, model: nextAlias } : previous)
  }, [data, filters.model])

  return <div className="page-stack usage-reference-page" aria-busy={loading}>
    <PageTitle title={enterpriseRoute ? t('console.usage.enterpriseTitle') : t('console.usage.title')} description={enterpriseRoute ? t('console.usage.enterpriseDescription') : t('console.usage.description')} actions={<Button theme="borderless" icon={<IconRefresh />} aria-label={t('console.usage.refresh')} title={t('console.usage.refresh')} onClick={() => setReloadToken((value) => value + 1)} />} />
    {error ? <BannerNotice tone="warning"><span className="usage-error-copy"><strong>{error.message}</strong>{error.requestId ? <small>{t('console.common.requestIdValue', { requestId: error.requestId })}</small> : null}</span><Button theme="borderless" size="small" icon={<IconRefresh />} onClick={() => setReloadToken((value) => value + 1)}>{t('console.usage.reload')}</Button></BannerNotice> : null}
    <section className="usage-reference-filters" aria-label={t('console.usage.filter')}>
      <div className="usage-reference-time-filter"><span className="usage-reference-filter-label">{t('console.usage.timeRange')}</span><div className="usage-reference-range-tabs" role="group" aria-label={t('console.usage.timeRange')}><button type="button" className={filters.range === DATE_RANGE_TODAY ? 'active' : ''} aria-pressed={filters.range === DATE_RANGE_TODAY} onClick={() => updateRange(DATE_RANGE_TODAY)}>{t('console.usage.today')}</button><button type="button" className={filters.range === DATE_RANGE_WEEK ? 'active' : ''} aria-pressed={filters.range === DATE_RANGE_WEEK} onClick={() => updateRange(DATE_RANGE_WEEK)}>{t('console.usage.recent7Days')}</button><button type="button" className={filters.range === DATE_RANGE_MONTH ? 'active' : ''} aria-pressed={filters.range === DATE_RANGE_MONTH} onClick={() => updateRange(DATE_RANGE_MONTH)}>{t('console.usage.recent30Days')}</button><button type="button" className={filters.range === DATE_RANGE_CUSTOM ? 'active' : ''} aria-pressed={filters.range === DATE_RANGE_CUSTOM} onClick={() => updateRange(DATE_RANGE_CUSTOM)}>{t('console.usage.custom')}</button></div></div>
      <div className="usage-reference-filter-grid">
        <UsageSelect id="usage-model-filter" label={t('console.usage.model')} value={modelOptions.some((option) => option.alias === filters.model) ? filters.model : 'all'} onChange={(value) => updateFilter('model', value)}><option value="all">{t('console.usage.allModels')}</option>{modelOptions.map((option) => <option value={option.alias} key={option.alias}>{t('console.common.modelWithAlias', { name: option.name, alias: option.alias })}</option>)}</UsageSelect>
        <UsageSelect id="usage-key-filter" label={t('console.usage.apiKey')} value={filters.apiKeyID} onChange={(value) => updateFilter('apiKeyID', value)}><option value="all">{t('console.usage.allKeys')}</option>{apiKeyOptions.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</UsageSelect>
        <UsageSelect id="usage-source-filter" label={t('console.usage.source')} value={filters.source} onChange={(value) => updateFilter('source', value as UsageRecordsSource)}><option value="all">{t('console.usage.allSources')}</option><option value="console-test">{t('console.usage.consoleTest')}</option><option value="api">{t('console.usage.apiCall')}</option></UsageSelect>
        <UsageSelect id="usage-status-filter" label={t('console.usage.status')} value={filters.status} onChange={(value) => updateFilter('status', value as UsageRecordsStatus)}><option value="all">{t('console.usage.allStatuses')}</option><option value="success">{t('console.usage.successStatus')}</option><option value="error">{t('console.usage.errorStatus')}</option><option value="cancelled">{t('console.usage.cancelledStatus')}</option></UsageSelect>
        {data?.can_filter_members ? <UsageSelect id="usage-member-filter" label={t('console.usage.member')} value={filters.memberID} onChange={(value) => updateFilter('memberID', value)}><option value="all">{t('console.usage.allMembers')}</option>{memberOptions.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</UsageSelect> : null}
        {filters.range === DATE_RANGE_CUSTOM ? <div className="usage-reference-date-range"><label htmlFor="usage-start-date">{t('console.usage.startDate')}<input id="usage-start-date" type="date" value={filters.startDate} onChange={(event) => updateFilter('startDate', event.target.value)} /></label><label htmlFor="usage-end-date">{t('console.usage.endDate')}<input id="usage-end-date" type="date" value={filters.endDate} onChange={(event) => updateFilter('endDate', event.target.value)} /></label></div> : null}
      </div>
      <Button className="usage-reference-reset" theme="borderless" icon={<IconRefresh />} onClick={resetFilters}>{t('console.usage.resetFilters')}</Button>
    </section>

    {error && !data ? <section className="usage-reference-error" role="alert"><strong>{error.message}</strong>{error.requestId ? <small>{t('console.common.requestIdValue', { requestId: error.requestId })}</small> : null}<Button theme="outline" icon={<IconRefresh />} onClick={() => setReloadToken((value) => value + 1)}>{t('console.usage.reload')}</Button></section> : loading && !data ? <div className="usage-reference-loading" role="status"><span className="records-loading-spinner" />{t('console.usage.loading')}</div> : <>
      <div className="usage-reference-primary-metrics"><UsageMetric label={t('console.usage.totalCost')} value={formatCost(metrics?.total_cost_yuan ?? '', data?.can_view_billing ?? false)} primary /><UsageMetric label={t('console.usage.requestCount')} value={t('console.usage.requestUnit', { count: formatInteger(metrics?.request_count ?? 0) })} /></div>
      <div className="usage-reference-secondary-metrics"><UsageMetric label={t('console.usage.inputTokens')} value={formatInteger(metrics?.input_tokens ?? 0)} /><UsageMetric label={t('console.usage.outputTokens')} value={formatInteger(metrics?.output_tokens ?? 0)} /><UsageMetric label={t('console.usage.successRate')} value={formatRate(metrics?.success_rate ?? null)} /><UsageMetric label={t('console.usage.averageLatency')} value={formatLatency(metrics?.average_latency_ms ?? null)} /></div>
      <p className="usage-cost-note" role="note">{t('console.usage.costNote')}</p>

      <section className="usage-reference-trend-section" aria-labelledby="usage-trend-title"><div className="usage-reference-section-header"><h2 id="usage-trend-title">{t('console.usage.trend')}</h2><div className="usage-reference-trend-tabs" role="group" aria-label={t('console.usage.trendMetric')}><button type="button" className={trendMetric === 'requests' ? 'active' : ''} aria-pressed={trendMetric === 'requests'} onClick={() => setTrendMetric('requests')}>{t('console.usage.requests')}</button><button type="button" className={trendMetric === 'cost' ? 'active' : ''} aria-pressed={trendMetric === 'cost'} onClick={() => setTrendMetric('cost')}>{t('console.usage.cost')}</button><button type="button" className={trendMetric === 'tokens' ? 'active' : ''} aria-pressed={trendMetric === 'tokens'} onClick={() => setTrendMetric('tokens')}>{t('console.usage.tokens')}</button></div></div><div className="usage-reference-trend-chart"><UsageTrendChart data={trendData} metric={trendMetric} canViewBilling={data?.can_view_billing ?? false} /></div></section>

      <div className="usage-reference-distributions"><section className="usage-reference-chart-card" aria-labelledby="usage-model-chart-title"><h2 id="usage-model-chart-title">{t('console.usage.modelDistribution')}</h2><p>{t('console.usage.requestSummary', { count: data?.models.length ?? 0 })}</p><UsageDistributionChart data={data?.models ?? []} tone="model" canViewBilling={data?.can_view_billing ?? false} /></section><section className="usage-reference-chart-card" aria-labelledby="usage-key-chart-title"><h2 id="usage-key-chart-title">{t('console.usage.keyDistribution')}</h2><p>{t('console.usage.keySummary', { count: data?.api_keys.length ?? 0 })}</p><UsageDistributionChart data={data?.api_keys ?? []} tone="key" canViewBilling={data?.can_view_billing ?? false} /></section></div>

      <section className="usage-reference-detail-section" aria-labelledby="usage-detail-title"><div className="usage-reference-section-header"><div><h2 id="usage-detail-title">{t('console.usage.detail')}</h2><p>{t('console.usage.modelCount', { count: data?.total_models ?? 0 })}</p></div></div><div className="source-table-scroll usage-reference-table-scroll" role="region" aria-label={t('console.usage.detail')} tabIndex={0}><table className="usage-reference-detail-table"><thead><tr><th>{t('console.usage.model')}</th><th>{t('console.usage.requestCount')}</th><th>{t('console.usage.inputTokens')}</th><th>{t('console.usage.outputTokens')}</th><th>{t('console.usage.totalCost')}</th><th>{t('console.usage.averageLatency')}</th><th>{t('console.usage.requestRecords')}</th></tr></thead><tbody>{modelRows.length ? modelRows.map((row) => { const alias = row.model_alias.trim(); return <tr key={row.model_code}><td><strong>{row.model_name || t('console.usage.unnamedModel')}</strong><small>{alias || t('console.usage.noAlias')}</small></td><td>{formatInteger(row.requests)}</td><td>{formatInteger(row.input_tokens)}</td><td>{formatInteger(row.output_tokens)}</td><td className={data?.can_view_billing ? 'amount-positive' : ''}>{formatCost(row.cost_yuan, data?.can_view_billing ?? false)}</td><td>{formatLatency(row.average_latency_ms)}</td><td>{alias ? <Link to={`/console/records?model=${encodeURIComponent(alias)}`}>{t('console.usage.viewRecords')}</Link> : <span>{t('console.usage.noAlias')}</span>}</td></tr> }) : <UsageTableEmpty description={hasVisibleData ? t('console.usage.noModelDetail') : t('console.usage.noVisibleData')} />}</tbody></table></div></section>
    </>}
  </div>
}
