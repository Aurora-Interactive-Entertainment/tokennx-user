import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import { IconRefresh } from '@douyinfe/semi-icons'
import { AnalyticsTimeRangePicker, type TimeRangePreset, type TimeRangeValue } from '@/components/analytics-time-range-picker'
import { BannerNotice, PageTitle } from '@/components/common'
import { appToast } from '@/components/app-toast'
import { CompatSelect as Select } from '@/components/semi-compat'
import { MoneyText } from '@/components/money'
import { UsageDistributionChart, UsageTrendChart, type UsageTrendMetric } from '@/components/usage-charts'
import { AppPagination } from '@/components/app-pagination'
import { getAccessToken } from '@/auth/token-storage'
import { isAuthenticationFailure } from '@/api/http'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'
import { useAppStore } from '@/data/app-state'
import i18n from '@/i18n'
import { formatLocalDateInput, localDateToTimestamp, shiftLocalDate } from '@/utils/format'
import {
  getUsageFilters, getUsageModels, getUsageStatisticsErrorMessage, getUsageSummary, getUsageTrend,
  USAGE_MODELS_PAGE_SIZE, type UsageFiltersResponse, type UsageModelRow, type UsageModelsQuery,
  type UsageStatisticsContext, type UsageStatisticsQuery, type UsageStatisticsRange, type UsageStatisticsSource,
  type UsageStatisticsStatus, type UsageTrendGranularity, type UsageTrendResponse,
} from '@/api/usage-statistics'

const DATE_RANGE_TODAY: UsageStatisticsRange = 'today'
const DATE_RANGE_WEEK: UsageStatisticsRange = '7d'
const DATE_RANGE_MONTH: UsageStatisticsRange = '30d'
const DATE_RANGE_CUSTOM: UsageStatisticsRange = 'custom'
const DEFAULT_CUSTOM_RANGE_DAYS = 6
const ERROR_TOAST_DEDUPE_MS = 3500

type UsageFilterState = { range: UsageStatisticsRange; model: string; source: UsageStatisticsSource; status: UsageStatisticsStatus; apiKeyID: string; memberID: string; startDate: string; endDate: string }
function customDateDefaults(): Pick<UsageFilterState, 'startDate' | 'endDate'> {
  const today = new Date()
  return { startDate: formatLocalDateInput(shiftLocalDate(today, -DEFAULT_CUSTOM_RANGE_DAYS)), endDate: formatLocalDateInput(today) }
}

function dateRangeQuery(filters: UsageFilterState): Pick<UsageStatisticsQuery, 'start_at' | 'end_at'> {
  if (filters.range !== DATE_RANGE_CUSTOM) return {}
  return { start_at: filters.startDate ? localDateToTimestamp(filters.startDate) : undefined, end_at: filters.endDate ? localDateToTimestamp(filters.endDate, true) : undefined }
}

function createDefaultFilters(): UsageFilterState {
  return { range: DATE_RANGE_WEEK, model: 'all', source: 'all', status: 'all', apiKeyID: 'all', memberID: 'all', startDate: '', endDate: '' }
}

function formatInteger(value: number | undefined): string {
  return Number.isFinite(value) ? (value as number).toLocaleString(i18n.language.startsWith('en') ? 'en-US' : 'zh-CN') : '--'
}

function formatCost(value: string | undefined, visible: boolean): ReactNode {
  if (!visible || value === undefined) return '--'
  return <MoneyText value={value} />
}

function formatLatency(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '--' : i18n.t('console.common.seconds', { value: (value / 1000).toFixed(2) })
}

function formatRate(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '--' : `${value.toFixed(1)}%`
}

function UsageSelect({ id, label, value, onChange, children }: { id: string; label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  const labelID = `${id}-label`
  return <div className="usage-reference-filter"><span id={labelID}>{label}</span><Select id={id} value={value} onChange={(nextValue) => onChange(String(nextValue))} onSelect={(nextValue) => onChange(String(nextValue))} block aria-labelledby={labelID}>{children}</Select></div>
}

function UsageMetric({ label, value, primary = false }: { label: string; value: ReactNode; primary?: boolean }) {
  return <article className={`usage-reference-metric${primary ? ' is-primary' : ''}`}><span>{label}</span><strong>{value}</strong></article>
}

function UsageTableEmpty({ description }: { description: string }) {
  return <tr><td className="usage-table-empty" colSpan={7}>{description}</td></tr>
}

export function UsagePage({ enterprise = false }: { enterprise?: boolean }) {
  const { t } = useTranslation()
  const store = useAppStore()
  if (enterprise && store.activeWorkspace.type !== 'enterprise') return <div className="page-stack usage-reference-page"><PageTitle title={t('console.usage.enterpriseTitle')} description={t('console.usage.enterpriseDescription')} /><BannerNotice tone="warning">{t('console.usage.enterpriseSwitch')}</BannerNotice></div>
  return <UsageSummaryPage enterpriseRoute={enterprise} />
}

function UsageSummaryPage({ enterpriseRoute }: { enterpriseRoute: boolean }) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const store = useAppStore()
  const [filters, setFilters] = useState<UsageFilterState>(createDefaultFilters)
  const [trendMetric, setTrendMetric] = useState<UsageTrendMetric>('requests')
  const [granularity, setGranularity] = useState<UsageTrendGranularity>('day')
  const [filterOptions, setFilterOptions] = useState<UsageFiltersResponse | null>(null)
  const [summary, setSummary] = useState<{ can_view_billing: boolean; metrics: { request_count: number; input_tokens: number; output_tokens: number; total_cost_yuan: string; average_latency_ms: number | null; success_rate: number | null } } | null>(null)
  const [trend, setTrend] = useState<UsageTrendResponse | null>(null)
  const [modelRows, setModelRows] = useState<UsageModelRow[]>([])
  const [modelTotal, setModelTotal] = useState(0)
  const [modelPage, setModelPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)
  const previousWorkspaceKey = useRef(`${store.activeWorkspace.type}:${store.activeWorkspace.id}`)
  const usageErrorToastRef = useRef<{ message: string; expiresAt: number } | null>(null)
  const workspaceContext = useMemo<UsageStatisticsContext>(() => store.activeWorkspace.type === 'enterprise' ? { account_type: 'enterprise', enterprise_id: store.activeWorkspace.id } : { account_type: 'personal' }, [store.activeWorkspace.id, store.activeWorkspace.type])
  const workspaceKey = `${workspaceContext.account_type}:${workspaceContext.enterprise_id ?? 'personal'}`
  const baseQuery = useMemo<UsageStatisticsQuery>(() => ({ range: filters.range, api_key_id: filters.apiKeyID === 'all' ? undefined : filters.apiKeyID, model: filters.model === 'all' ? undefined : filters.model, source: filters.source, status: filters.status, member_id: filters.memberID === 'all' ? undefined : filters.memberID, ...dateRangeQuery(filters) }), [filters])

  useEffect(() => {
    if (previousWorkspaceKey.current === workspaceKey) return
    previousWorkspaceKey.current = workspaceKey
    setFilters(createDefaultFilters()); setFilterOptions(null); setSummary(null); setTrend(null); setModelPage(1)
  }, [workspaceKey])

  useEffect(() => {
    const controller = new AbortController(); let active = true
    getUsageFilters(workspaceContext, { accessToken: getAccessToken() ?? undefined, signal: controller.signal }).then((value) => { if (active) { setFilterOptions(value); setFilters((previous) => value.can_filter_members || previous.memberID === 'all' ? previous : { ...previous, memberID: 'all' }) } }).catch((reason: unknown) => { if (active && !controller.signal.aborted) handleRequestError(reason) })
    return () => { active = false; controller.abort() }
  }, [reloadToken, workspaceContext])

  function handleRequestError(reason: unknown): void {
    if (isAuthenticationFailure(reason)) { dispatch(invalidateAuth()); navigate('/', { replace: true }); return }
    const message = getUsageStatisticsErrorMessage(reason)
    const now = Date.now()
    const previous = usageErrorToastRef.current
    if (previous?.message === message && previous.expiresAt > now) return
    usageErrorToastRef.current = { message, expiresAt: now + ERROR_TOAST_DEDUPE_MS }
    appToast.error(message)
  }

  useEffect(() => {
    const controller = new AbortController(); let active = true
    setLoading(true)
    getUsageSummary(workspaceContext, baseQuery, { accessToken: getAccessToken() ?? undefined, signal: controller.signal }).then((value) => { if (active) setSummary(value) }).catch((reason: unknown) => { if (active && !controller.signal.aborted) handleRequestError(reason) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; controller.abort() }
  }, [baseQuery, dispatch, navigate, reloadToken, workspaceContext])

  useEffect(() => {
    const controller = new AbortController(); let active = true
    getUsageTrend(workspaceContext, { ...baseQuery, granularity, metric: trendMetric }, { accessToken: getAccessToken() ?? undefined, signal: controller.signal }).then((value) => { if (active) setTrend(value) }).catch((reason: unknown) => { if (active && !controller.signal.aborted) handleRequestError(reason) })
    return () => { active = false; controller.abort() }
  }, [baseQuery, dispatch, granularity, navigate, reloadToken, trendMetric, workspaceContext])

  useEffect(() => {
    const controller = new AbortController(); let active = true
    const query: UsageModelsQuery = { ...baseQuery, page: modelPage, page_size: USAGE_MODELS_PAGE_SIZE }
    getUsageModels(workspaceContext, query, { accessToken: getAccessToken() ?? undefined, signal: controller.signal }).then((value) => { if (active) { setModelRows(value.items); setModelTotal(value.total) } }).catch((reason: unknown) => { if (active && !controller.signal.aborted) handleRequestError(reason) })
    return () => { active = false; controller.abort() }
  }, [baseQuery, dispatch, modelPage, navigate, reloadToken, workspaceContext])

  function updateFilter<Key extends keyof UsageFilterState>(key: Key, value: UsageFilterState[Key]): void { setFilters((previous) => ({ ...previous, [key]: value })); setModelPage(1) }
  function updateTimeRange(value: TimeRangeValue<UsageStatisticsRange>): void { setFilters((previous) => ({ ...previous, ...value })); setModelPage(1) }
  function resetFilters(): void { setFilters(createDefaultFilters()); setTrendMetric('requests'); setGranularity('day'); setModelPage(1); setReloadToken((value) => value + 1) }

  const metrics = summary?.metrics
  const canViewBilling = summary?.can_view_billing ?? trend?.can_view_billing ?? false
  const english = i18n.language.startsWith('en')
  const granularityLabel = english ? 'Time granularity' : '时间颗粒度'
  const granularityLabels = english ? { hour: 'Hour', day: 'Day', week: 'Week', month: 'Month' } : { hour: '小时', day: '天', week: '周', month: '月' }
  const rangePresets: readonly TimeRangePreset<UsageStatisticsRange>[] = [{ label: t('console.usage.today'), value: DATE_RANGE_TODAY }, { label: t('console.usage.recent7Days'), value: DATE_RANGE_WEEK }, { label: t('console.usage.recent30Days'), value: DATE_RANGE_MONTH }, { label: t('console.usage.custom'), value: DATE_RANGE_CUSTOM }]
  const selectedModel = filterOptions?.models.find((option) => option.code === filters.model || option.alias === filters.model)
  const modelValue = selectedModel ? filters.model : 'all'
  const memberValue = filterOptions?.members.some((option) => option.id === filters.memberID) ? filters.memberID : 'all'
  const pageCount = Math.max(1, Math.ceil(modelTotal / USAGE_MODELS_PAGE_SIZE))

  return <div className="page-stack usage-reference-page" aria-busy={loading}>
    <PageTitle title={enterpriseRoute ? t('console.usage.enterpriseTitle') : t('console.usage.title')} description={enterpriseRoute ? t('console.usage.enterpriseDescription') : t('console.usage.description')} />
    <section className="usage-reference-filters" aria-label={t('console.usage.filter')}>
      <div className="usage-reference-time-filter"><span className="usage-reference-filter-label">{t('console.usage.timeRange')}</span><AnalyticsTimeRangePicker value={{ range: filters.range, startDate: filters.startDate, endDate: filters.endDate }} presets={rangePresets} defaultCustomValue={customDateDefaults()} dateRestriction="last-90-days" onChange={updateTimeRange} /></div>
      <div className="usage-reference-filter-grid">
        <UsageSelect id="usage-model-filter" label={t('console.usage.model')} value={modelValue} onChange={(value) => updateFilter('model', value)}><Select.Option value="all">{t('console.usage.allModels')}</Select.Option>{(filterOptions?.models ?? []).map((option) => <Select.Option value={option.code} key={option.code}>{t('console.common.modelWithAlias', { name: option.name, alias: option.alias || option.code })}</Select.Option>)}</UsageSelect>
        <UsageSelect id="usage-key-filter" label={t('console.usage.apiKey')} value={filters.apiKeyID} onChange={(value) => updateFilter('apiKeyID', value)}><Select.Option value="all">{t('console.usage.allKeys')}</Select.Option>{(filterOptions?.api_keys ?? []).map((option) => <Select.Option value={option.id} key={option.id}>{option.name}</Select.Option>)}</UsageSelect>
        <UsageSelect id="usage-status-filter" label={t('console.usage.status')} value={filters.status} onChange={(value) => updateFilter('status', value as UsageStatisticsStatus)}><Select.Option value="all">{t('console.usage.allStatuses')}</Select.Option>{(filterOptions?.statuses ?? []).map((option) => <Select.Option value={option.value} key={option.value}>{t(`console.usage.${option.value}Status`)}</Select.Option>)}</UsageSelect>
        {filterOptions?.can_filter_members ? <UsageSelect id="usage-member-filter" label={t('console.usage.member')} value={memberValue} onChange={(value) => updateFilter('memberID', value)}><Select.Option value="all">{t('console.usage.allMembers')}</Select.Option>{filterOptions.members.map((option) => <Select.Option value={option.id} key={option.id}>{option.name}</Select.Option>)}</UsageSelect> : null}
      </div>
      <Button className="usage-reference-reset" theme="borderless" icon={<IconRefresh />} onClick={resetFilters}>{t('console.usage.resetFilters')}</Button>
    </section>

    {loading && !summary ? <div className="usage-reference-loading" role="status"><span className="records-loading-spinner" />{t('console.usage.loading')}</div> : <>
      <div className="usage-reference-primary-metrics"><UsageMetric label={t('console.usage.totalCost')} value={formatCost(metrics?.total_cost_yuan, canViewBilling)} primary /><UsageMetric label={t('console.usage.requestCount')} value={t('console.usage.requestUnit', { count: formatInteger(metrics?.request_count) })} /></div>
      <div className="usage-reference-secondary-metrics"><UsageMetric label={t('console.usage.inputTokens')} value={formatInteger(metrics?.input_tokens)} /><UsageMetric label={t('console.usage.outputTokens')} value={formatInteger(metrics?.output_tokens)} /><UsageMetric label={t('console.usage.successRate')} value={formatRate(metrics?.success_rate)} /><UsageMetric label={t('console.usage.averageLatency')} value={formatLatency(metrics?.average_latency_ms)} /></div>
      <p className="usage-cost-note" role="note">{t('console.usage.costNote')}</p>

      <section className="usage-reference-trend-section" aria-labelledby="usage-trend-title"><div className="usage-reference-section-header"><h2 id="usage-trend-title">{t('console.usage.trend')}</h2><div className="usage-reference-trend-controls"><div className="usage-reference-trend-tabs" role="group" aria-label={granularityLabel}><button type="button" className={granularity === 'hour' ? 'active' : ''} aria-pressed={granularity === 'hour'} onClick={() => setGranularity('hour')}>{granularityLabels.hour}</button><button type="button" className={granularity === 'day' ? 'active' : ''} aria-pressed={granularity === 'day'} onClick={() => setGranularity('day')}>{granularityLabels.day}</button><button type="button" className={granularity === 'week' ? 'active' : ''} aria-pressed={granularity === 'week'} onClick={() => setGranularity('week')}>{granularityLabels.week}</button><button type="button" className={granularity === 'month' ? 'active' : ''} aria-pressed={granularity === 'month'} onClick={() => setGranularity('month')}>{granularityLabels.month}</button></div><div className="usage-reference-trend-tabs" role="group" aria-label={t('console.usage.trendMetric')}><button type="button" className={trendMetric === 'requests' ? 'active' : ''} aria-pressed={trendMetric === 'requests'} onClick={() => setTrendMetric('requests')}>{t('console.usage.requests')}</button><button type="button" className={trendMetric === 'cost' ? 'active' : ''} aria-pressed={trendMetric === 'cost'} onClick={() => setTrendMetric('cost')}>{t('console.usage.cost')}</button><button type="button" className={trendMetric === 'tokens' ? 'active' : ''} aria-pressed={trendMetric === 'tokens'} onClick={() => setTrendMetric('tokens')}>{t('console.usage.tokens')}</button></div></div></div><div className="usage-reference-trend-chart"><UsageTrendChart data={trend?.buckets ?? []} metric={trendMetric} granularity={trend?.granularity ?? granularity} canViewBilling={canViewBilling} /></div></section>

      <div className="usage-reference-distributions"><section className="usage-reference-chart-card" aria-labelledby="usage-model-chart-title"><h2 id="usage-model-chart-title">{t('console.usage.modelDistribution')}</h2><p>{t('console.usage.requestSummary', { count: trend?.model_distribution.length ?? 0 })}</p><UsageDistributionChart data={trend?.model_distribution ?? []} tone="model" metric={trendMetric} canViewBilling={canViewBilling} /></section><section className="usage-reference-chart-card" aria-labelledby="usage-key-chart-title"><h2 id="usage-key-chart-title">{t('console.usage.keyDistribution')}</h2><p>{t('console.usage.keySummary', { count: trend?.api_key_distribution.length ?? 0 })}</p><UsageDistributionChart data={trend?.api_key_distribution ?? []} tone="key" metric={trendMetric} canViewBilling={canViewBilling} /></section></div>

      <section className="usage-reference-detail-section" aria-labelledby="usage-detail-title"><div className="usage-reference-section-header"><div><h2 id="usage-detail-title">{t('console.usage.detail')}</h2><p>{t('console.usage.modelCount', { count: modelTotal })}</p></div></div><div className="source-table-scroll usage-reference-table-scroll" role="region" aria-label={t('console.usage.detail')} tabIndex={0}><table className="usage-reference-detail-table"><thead><tr><th>{t('console.usage.model')}</th><th>{t('console.usage.requestCount')}</th><th>{t('console.usage.inputTokens')}</th><th>{t('console.usage.outputTokens')}</th><th>{t('console.usage.totalCost')}</th><th>{t('console.usage.averageLatency')}</th><th>{t('console.usage.requestRecords')}</th></tr></thead><tbody>{modelRows.length ? modelRows.map((row) => <tr key={row.model_code}><td><strong>{row.model_name || t('console.usage.unnamedModel')}</strong><small>{row.model_alias || row.model_code}</small></td><td>{formatInteger(row.requests)}</td><td>{formatInteger(row.input_tokens)}</td><td>{formatInteger(row.output_tokens)}</td><td className={canViewBilling ? 'amount-positive' : ''}>{formatCost(row.cost_yuan, canViewBilling)}</td><td>{formatLatency(row.average_latency_ms)}</td><td><Link to={`/console/records?model=${encodeURIComponent(row.model_code)}`}>{t('console.usage.viewRecords')}</Link></td></tr>) : <UsageTableEmpty description={metrics?.request_count ? t('console.usage.noModelDetail') : t('console.usage.noVisibleData')} />}</tbody></table></div><AppPagination ariaLabel={english ? 'Model details pagination' : '模型明细分页'} currentPage={modelPage} pageSize={USAGE_MODELS_PAGE_SIZE} total={modelTotal} summary={english ? `${modelTotal} models · Page ${modelPage}/${pageCount}` : `共 ${modelTotal} 个模型 · 第 ${modelPage}/${pageCount} 页`} onPageChange={setModelPage} /></section>
    </>}
  </div>
}
