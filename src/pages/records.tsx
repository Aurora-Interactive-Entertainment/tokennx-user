import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Modal from '@douyinfe/semi-ui/lib/es/modal'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { IconCopy, IconRefresh, IconSearch } from '@douyinfe/semi-icons'
import { AnalyticsTimeRangePicker, isTimeRangeAllowed, type TimeRangePreset, type TimeRangeValue } from '@/components/analytics-time-range-picker'
import { BannerNotice, EmptyPanel, PageTitle } from '@/components/common'
import { MoneyText } from '@/components/money'
import { AppPagination } from '@/components/app-pagination'
import { CompatInput as Input, CompatSelect as Select } from '@/components/semi-compat'
import { getAccessToken } from '@/auth/token-storage'
import { getUsageRecords, getUsageRecordsErrorMessage, getUsageRecordsRequestId, RECORDS_PAGE_SIZE, type UsageRecordItem, type UsageRecordsQuery, type UsageRecordsResponse, type UsageRecordsSource, type UsageRecordsStatus } from '@/api/usage-records'
import { isAuthenticationFailure } from '@/api/http'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'
import { useAppStore } from '@/data/app-state'
import i18n from '@/i18n'
import { apiTimeToISOString, formatApiTime, formatLocalDateInput, localDateToTimestamp, shiftLocalDate } from '@/utils/format'

const RECORDS_PAGE_MIN = 1
const DATE_RANGE_TODAY = 'today'
const DATE_RANGE_WEEK = '7d'
const DATE_RANGE_MONTH = '30d'
const DATE_RANGE_CUSTOM = 'custom'
const DATE_RANGE_VALUES = new Set([DATE_RANGE_TODAY, DATE_RANGE_WEEK, DATE_RANGE_MONTH, DATE_RANGE_CUSTOM])
const RECORDS_CUSTOM_RANGE_DAYS = 6
const RECORDS_SOURCE_VALUES = new Set<UsageRecordsSource>(['all', 'api', 'console-test'])
const RECORDS_STATUS_VALUES = new Set<UsageRecordsStatus>(['all', 'success', 'error', 'cancelled'])

type RecordsFilterState = {
  range: string
  model: string
  source: UsageRecordsSource
  status: UsageRecordsStatus
  apiKeyID: string
  memberID: string
  requestID: string
  startDate: string
  endDate: string
}

type RecordsStatus = 'success' | 'error' | 'cancelled' | string

function createDefaultFilterState(): RecordsFilterState {
  return { range: DATE_RANGE_MONTH, model: 'all', source: 'all', status: 'all', apiKeyID: 'all', memberID: 'all', requestID: '', startDate: '', endDate: '' }
}

function customDateDefaults(): Pick<RecordsFilterState, 'startDate' | 'endDate'> {
  const today = new Date()
  return { startDate: formatLocalDateInput(shiftLocalDate(today, -RECORDS_CUSTOM_RANGE_DAYS)), endDate: formatLocalDateInput(today) }
}

function normalizeFilterValue<T extends string>(value: string | null, allowed: Set<T>, fallback: T): T {
  return value && allowed.has(value as T) ? value as T : fallback
}

function initialFilterState(searchParams: URLSearchParams): RecordsFilterState {
  const requestedRange = normalizeFilterValue(searchParams.get('range'), DATE_RANGE_VALUES, DATE_RANGE_MONTH)
  const requestedStartDate = searchParams.get('startDate')?.trim() || ''
  const requestedEndDate = searchParams.get('endDate')?.trim() || ''
  const range = requestedRange === DATE_RANGE_CUSTOM && !isTimeRangeAllowed(requestedStartDate, requestedEndDate, 'last-90-days')
    ? DATE_RANGE_MONTH
    : requestedRange
  return {
    range,
    model: searchParams.get('model')?.trim() || 'all',
    source: normalizeFilterValue(searchParams.get('source')?.trim() || null, RECORDS_SOURCE_VALUES, 'all'),
    status: normalizeFilterValue(searchParams.get('status')?.trim() || null, RECORDS_STATUS_VALUES, 'all'),
    apiKeyID: searchParams.get('keyId')?.trim() || searchParams.get('api_key_id')?.trim() || 'all',
    memberID: searchParams.get('member_id')?.trim() || 'all',
    requestID: searchParams.get('request')?.trim() || searchParams.get('request_id')?.trim() || '',
    startDate: range === DATE_RANGE_CUSTOM ? requestedStartDate : '',
    endDate: range === DATE_RANGE_CUSTOM ? requestedEndDate : '',
  }
}

function sameFilterState(left: RecordsFilterState, right: RecordsFilterState): boolean {
  return left.range === right.range && left.model === right.model && left.source === right.source && left.status === right.status
    && left.apiKeyID === right.apiKeyID && left.memberID === right.memberID && left.requestID === right.requestID
    && left.startDate === right.startDate && left.endDate === right.endDate
}

function formatInteger(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString(i18n.language.startsWith('en') ? 'en-US' : 'zh-CN') : '--'
}

function formatLatency(value: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--'
  return i18n.t('console.common.seconds', { value: (value / 1000).toFixed(2) })
}

// 首 Token 耗时仅对流式请求有意义；非流式或缺失时后端返回 null，此处统一显示占位符。
function formatFirstToken(value: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--'
  return i18n.t('console.common.seconds', { value: (value / 1000).toFixed(2) })
}

function streamLabel(stream: boolean | null): string {
  if (stream === true) return i18n.t('console.records.stream')
  if (stream === false) return i18n.t('console.records.nonStream')
  return '--'
}

function relayFormatLabel(format: string | undefined): string {
  switch ((format ?? '').trim()) {
    case 'openai': return 'OpenAI'
    case 'claude': return 'Claude'
    case 'gemini': return 'Gemini'
    case 'openai_responses': return 'OpenAI Responses'
    case 'openai_responses_compaction': return 'OpenAI Responses'
    case 'openai_audio': return 'OpenAI Audio'
    case 'openai_image': return 'OpenAI Image'
    case 'openai_realtime': return 'OpenAI Realtime'
    case 'rerank': return 'Rerank'
    case 'embedding': return 'Embedding'
    case 'task': return i18n.t('console.records.asyncTask')
    case 'mj_proxy': return 'Midjourney'
    case '': return '--'
    default: return format ?? '--'
  }
}

function formatCost(value: string, visible: boolean): ReactNode {
  if (!visible) return '--'
  return <MoneyText value={value} />
}

function formatRate(value: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--'
  return `${value.toFixed(2)}%`
}

function statusLabel(status: RecordsStatus): string {
  if (status === 'success') return i18n.t('console.records.successStatus')
  if (status === 'cancelled') return i18n.t('console.records.cancelledStatus')
  if (status === 'error') return i18n.t('console.records.errorStatus')
  return status || i18n.t('console.records.unknownStatus')
}

function sourceLabel(source: string): string {
  return source === 'console-test' ? i18n.t('console.records.consoleTest') : source === 'api' ? i18n.t('console.records.apiCall') : source || '--'
}

function clientPlatformLabel(platform: string): string {
  if (platform === 'codex') return 'Codex'
  if (platform === 'claudecli') return 'Claude CLI'
  if (platform === 'gemincli') return 'Gemini CLI'
  if (platform === 'web') return i18n.t('console.records.browser')
  return i18n.t('console.records.unknownClient')
}

function dateRangeQuery(filters: RecordsFilterState): Pick<UsageRecordsQuery, 'start_at' | 'end_at'> {
  if (filters.range === DATE_RANGE_CUSTOM) return { start_at: localDateToTimestamp(filters.startDate), end_at: localDateToTimestamp(filters.endDate, true) }
  const today = new Date()
  const end = formatLocalDateInput(today)
  const start = filters.range === DATE_RANGE_TODAY ? end : formatLocalDateInput(shiftLocalDate(today, -(filters.range === DATE_RANGE_WEEK ? 6 : 29)))
  return { start_at: localDateToTimestamp(start), end_at: localDateToTimestamp(end, true) }
}

function initialOption<T extends { id: string; name: string }>(options: T[], selected: string, fallbackLabel: string): T[] {
  if (selected === 'all' || options.some((option) => option.id === selected)) return options
  return [{ id: selected, name: fallbackLabel } as T, ...options]
}

function initialModelOption(response: UsageRecordsResponse | null): UsageRecordsResponse['filters']['models'] {
  const options = response?.filters.models ?? []
  return options.filter((option) => option.alias?.trim())
}

function updateSearchParameters(searchParams: URLSearchParams, patch: Partial<Record<keyof RecordsFilterState, string>>): URLSearchParams {
  const next = new URLSearchParams(searchParams)
  const fields: Array<[keyof RecordsFilterState, string]> = [
    ['range', 'range'],
    ['model', 'model'],
    ['source', 'source'],
    ['status', 'status'],
    ['apiKeyID', 'keyId'],
    ['memberID', 'member_id'],
    ['requestID', 'request'],
    ['startDate', 'startDate'],
    ['endDate', 'endDate'],
  ]
  fields.forEach(([key, parameter]) => {
    const value = patch[key]
    if (value === undefined) return
    if (!value || value === 'all') next.delete(parameter)
    else next.set(parameter, value)
    if (parameter === 'keyId') next.delete('api_key_id')
    if (parameter === 'request') next.delete('request_id')
  })
  return next
}

function statusClass(status: string): string {
  return status === 'success' ? 'success' : status === 'cancelled' ? 'cancelled' : 'error'
}

// 中文：time 元素的机器可读值统一使用 UTC ISO 字符串，兼容后端秒/毫秒时间戳。
function semanticDateTime(value: UsageRecordItem['occurred_at']): string | undefined {
  return apiTimeToISOString(value) ?? undefined
}

function RecordDetail({ record, canViewBilling, onClose }: { record: UsageRecordItem; canViewBilling: boolean; onClose: () => void }) {
  return <div className="records-detail-content">
    <div className="records-detail-summary">
      <span className={`records-status records-status--${statusClass(record.status)}`}><i aria-hidden="true" />{statusLabel(record.status)}</span>
      <time dateTime={semanticDateTime(record.occurred_at)}>{formatApiTime(record.occurred_at)}</time>
    </div>
    <section className="records-detail-section" aria-labelledby="records-detail-request">
      <h3 id="records-detail-request">{i18n.t('console.records.requestInfo')}</h3>
      <dl className="records-detail-grid">
        <div><dt>{i18n.t('console.records.requestId')}</dt><dd className="records-mono">{record.request_id}</dd></div>
        <div><dt>{i18n.t('console.records.eventType')}</dt><dd>{record.event_type || '--'}</dd></div>
        <div><dt>{i18n.t('console.records.model')}</dt><dd>{record.model_name || i18n.t('console.records.unnamedModel')}</dd></div>
        <div><dt>{i18n.t('console.records.modelAlias')}</dt><dd className="records-mono">{record.model_alias || i18n.t('console.records.noAlias')}</dd></div>
        <div><dt>{i18n.t('console.records.callSource')}</dt><dd>{sourceLabel(record.source)}</dd></div>
        <div><dt>{i18n.t('console.records.platform')}</dt><dd>{clientPlatformLabel(record.client_platform)}</dd></div>
        <div><dt>{i18n.t('console.records.callType')}</dt><dd>{streamLabel(record.stream)}</dd></div>
        <div><dt>{i18n.t('console.records.apiStyle')}</dt><dd>{relayFormatLabel(record.relay_format)}</dd></div>
        <div><dt>{i18n.t('console.records.channel')}</dt><dd>{record.channel || '--'}</dd></div>
        <div><dt>{i18n.t('console.records.apiKey')}</dt><dd>{record.api_key_name || (record.source === 'console-test' ? i18n.t('console.records.consoleTest') : '--')}</dd></div>
        <div><dt>{i18n.t('console.records.member')}</dt><dd>{record.member_name || record.member_id || '--'}</dd></div>
      </dl>
    </section>
    <section className="records-detail-section" aria-labelledby="records-detail-usage">
      <h3 id="records-detail-usage">{i18n.t('console.records.metering')}</h3>
      <dl className="records-detail-grid">
        <div><dt>{i18n.t('console.records.inputTokens')}</dt><dd>{formatInteger(record.input_tokens)}</dd></div>
        <div><dt>{i18n.t('console.records.outputTokens')}</dt><dd>{formatInteger(record.output_tokens)}</dd></div>
        <div><dt>{i18n.t('console.records.cachedTokens')}</dt><dd>{formatInteger(record.cached_tokens)}</dd></div>
        <div><dt>{i18n.t('console.records.cacheHitRate')}</dt><dd>{formatRate(record.cache_hit_rate)}</dd></div>
        <div><dt>{i18n.t('console.records.latency')}</dt><dd>{formatLatency(record.latency_ms)}</dd></div>
        <div><dt>{i18n.t('console.records.firstToken')}</dt><dd>{formatFirstToken(record.first_token_ms)}</dd></div>
        <div><dt>{i18n.t('console.records.cost')}</dt><dd>{formatCost(record.cost_yuan, canViewBilling)}</dd></div>
        <div><dt>{i18n.t('console.records.statusCode')}</dt><dd>{record.status_code || '--'}</dd></div>
      </dl>
    </section>
    {record.task_id || record.task_status || record.task_reason ? <section className="records-detail-section" aria-labelledby="records-detail-task">
      <h3 id="records-detail-task">{i18n.t('console.records.taskInfo')}</h3>
      <dl className="records-detail-grid"><div><dt>{i18n.t('console.records.taskId')}</dt><dd className="records-mono">{record.task_id || '--'}</dd></div><div><dt>{i18n.t('console.records.taskStatus')}</dt><dd>{record.task_status || '--'}</dd></div><div><dt>{i18n.t('console.records.taskReason')}</dt><dd>{record.task_reason || '--'}</dd></div></dl>
    </section> : null}
    {record.status !== 'success' && (record.error_code || record.error_message) ? <section className="records-detail-error" aria-labelledby="records-detail-error-title">
      <h3 id="records-detail-error-title">{i18n.t('console.records.failureSummary')}</h3>
      <strong>{record.error_code || i18n.t('console.records.callFailed')}</strong>
      <p>{record.error_message || i18n.t('console.records.serverNoError')}</p>
    </section> : null}
    <div className="records-detail-footer"><span>{i18n.t('console.records.bodyNotSaved')}</span><Button theme="solid" type="primary" onClick={onClose}>{i18n.t('console.common.close')}</Button></div>
  </div>
}

export function RecordsPage() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const store = useAppStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<RecordsFilterState>(() => initialFilterState(searchParams))
  const [page, setPage] = useState(RECORDS_PAGE_MIN)
  const [pageSize, setPageSize] = useState(RECORDS_PAGE_SIZE)
  const [data, setData] = useState<UsageRecordsResponse | null>(null)
  const [selected, setSelected] = useState<UsageRecordItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const previousWorkspaceKey = useRef(`${store.activeWorkspace.type}:${store.activeWorkspace.id}`)
  const openedRequestKey = useRef<string | null>(null)
  const workspaceContext = useMemo(() => store.activeWorkspace.type === 'enterprise'
    ? { account_type: 'enterprise' as const, enterprise_id: store.activeWorkspace.id }
    : { account_type: 'personal' as const }, [store.activeWorkspace.id, store.activeWorkspace.type])
  const workspaceKey = `${workspaceContext.account_type}:${workspaceContext.enterprise_id ?? 'personal'}`

  useEffect(() => {
    if (previousWorkspaceKey.current === workspaceKey) return
    previousWorkspaceKey.current = workspaceKey
    setPage(RECORDS_PAGE_MIN)
    setFilters(createDefaultFilterState())
    setSelected(null)
    setSearchParams({}, { replace: true })
  }, [setSearchParams, workspaceKey])

  const searchQueryString = searchParams.toString()
  useEffect(() => {
    const nextFilters = initialFilterState(new URLSearchParams(searchQueryString))
    setFilters((previous) => sameFilterState(previous, nextFilters) ? previous : nextFilters)
    setPage(RECORDS_PAGE_MIN)
  }, [searchQueryString])

  const query = useMemo<UsageRecordsQuery>(() => {
    const range = dateRangeQuery(filters)
    return {
      page,
      page_size: pageSize,
      api_key_id: filters.apiKeyID === 'all' ? undefined : filters.apiKeyID,
      model: filters.model === 'all' ? undefined : filters.model,
      source: filters.source,
      status: filters.status,
      member_id: filters.memberID === 'all' ? undefined : filters.memberID,
      request_id: filters.requestID.trim() || undefined,
      ...range,
    }
  }, [filters, page, pageSize])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    getUsageRecords(workspaceContext, { ...query, accessToken: getAccessToken() ?? undefined, signal: controller.signal }).then((response) => {
      if (!active) return
      setData(response)
      if (response.page !== page) setPage(response.page || RECORDS_PAGE_MIN)
    }).catch((reason: unknown) => {
      if (!active || controller.signal.aborted) return
      if (isAuthenticationFailure(reason)) {
        dispatch(invalidateAuth())
        navigate('/', { replace: true })
        return
      }
      setError({ message: getUsageRecordsErrorMessage(reason), requestId: getUsageRecordsRequestId(reason) })
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [dispatch, navigate, page, query, reloadToken, workspaceContext])

  useEffect(() => {
    if (loading || !data || !filters.requestID || selected) return
    const record = data.items.find((item) => item.request_id === filters.requestID)
    const requestKey = `${workspaceKey}:${filters.requestID}`
    if (record && openedRequestKey.current !== requestKey) {
      openedRequestKey.current = requestKey
      setSelected(record)
    }
  }, [data, filters.requestID, loading, selected, workspaceKey])

  useEffect(() => {
    if (!data || filters.model === 'all') return
    const selectedModel = data.filters.models.find((option) => option.alias === filters.model || option.code === filters.model)
    const nextAlias = selectedModel?.alias?.trim() || 'all'
    if (nextAlias === filters.model) return
    setFilters((previous) => previous.model === filters.model ? { ...previous, model: nextAlias } : previous)
    setSearchParams(updateSearchParameters(searchParams, { model: nextAlias }), { replace: true })
  }, [data, filters.model, searchParams, setSearchParams])

  function updateFilter<Key extends keyof RecordsFilterState>(key: Key, value: RecordsFilterState[Key]): void {
    const nextValue = String(value)
    const patch: Partial<Record<keyof RecordsFilterState, string>> = { [key]: nextValue }
    if (key === 'range' && nextValue !== DATE_RANGE_CUSTOM) {
      patch.startDate = ''
      patch.endDate = ''
    }
    setFilters((previous) => {
      const next = { ...previous, [key]: value }
      if (key === 'range' && nextValue !== DATE_RANGE_CUSTOM) {
        next.startDate = ''
        next.endDate = ''
      }
      return next
    })
    setSelected(null)
    setSearchParams(updateSearchParameters(searchParams, patch), { replace: true })
    setPage(RECORDS_PAGE_MIN)
  }

  function resetFilters(): void {
    setFilters(createDefaultFilterState())
    setSelected(null)
    setPage(RECORDS_PAGE_MIN)
    setSearchParams({}, { replace: true })
  }

  async function copyRequestID(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value)
      Toast.success(t('console.records.requestIdCopied'))
    } catch {
      Toast.error(t('console.records.unsupportedCopy'))
    }
  }

  const apiKeyOptions = initialOption(data?.filters.api_keys ?? [], filters.apiKeyID, t('console.usage.currentKey'))
  const modelOptions = initialModelOption(data)
  const memberOptions = initialOption(data?.filters.members ?? [], filters.memberID, t('console.usage.currentMember'))
  const currentItems = data?.items ?? []
  const currentPageSize = data?.page_size || pageSize
  const rangePresets: readonly TimeRangePreset<string>[] = [
    { label: t('console.records.today'), value: DATE_RANGE_TODAY },
    { label: t('console.records.recent7Days'), value: DATE_RANGE_WEEK },
    { label: t('console.records.recent30Days'), value: DATE_RANGE_MONTH },
    { label: t('console.records.custom'), value: DATE_RANGE_CUSTOM },
  ]

  function updateTimeRange(value: TimeRangeValue<string>): void {
    const patch: Partial<Record<keyof RecordsFilterState, string>> = {
      range: value.range,
      startDate: value.range === DATE_RANGE_CUSTOM ? value.startDate : '',
      endDate: value.range === DATE_RANGE_CUSTOM ? value.endDate : '',
    }
    setFilters((previous) => ({ ...previous, range: value.range, startDate: patch.startDate ?? '', endDate: patch.endDate ?? '' }))
    setSelected(null)
    setSearchParams(updateSearchParameters(searchParams, patch), { replace: true })
    setPage(RECORDS_PAGE_MIN)
  }

  return <div className="page-stack records-console-page usage-records-page">
    <PageTitle title={t('console.records.title')} description={t('console.records.description')} />
    {error && data ? <BannerNotice tone="warning"><span className="records-error-copy"><strong>{error.message}</strong>{error.requestId ? <small>{t('console.common.requestIdValue', { requestId: error.requestId })}</small> : null}</span><Button theme="borderless" size="small" icon={<IconRefresh />} onClick={() => setReloadToken((value) => value + 1)}>{t('console.records.retry')}</Button></BannerNotice> : null}
    <section className="records-filters-panel" aria-label={t('console.records.filter')}>
      <div className="records-filter-main-row">
        <div className="records-filter-field records-filter-field--range"><span>{t('console.records.timeRange')}</span><AnalyticsTimeRangePicker value={{ range: filters.range, startDate: filters.startDate, endDate: filters.endDate }} presets={rangePresets} defaultCustomValue={customDateDefaults()} dateRestriction="last-90-days" onChange={updateTimeRange} /></div>
        <label className="records-filter-field" htmlFor="records-model"><span>{t('console.records.model')}</span><Select id="records-model" value={modelOptions.some((option) => option.alias === filters.model) ? filters.model : 'all'} onChange={(value) => updateFilter('model', String(value))} block><Select.Option value="all">{t('console.records.allModels')}</Select.Option>{modelOptions.map((option) => <Select.Option value={option.alias} key={option.alias}>{t('console.common.modelWithAlias', { name: option.name, alias: option.alias })}</Select.Option>)}</Select></label>
        <label className="records-filter-field" htmlFor="records-source"><span>{t('console.records.callSource')}</span><Select id="records-source" value={filters.source} onChange={(value) => updateFilter('source', String(value) as UsageRecordsSource)} block><Select.Option value="all">{t('console.records.allSources')}</Select.Option><Select.Option value="console-test">{t('console.records.consoleTest')}</Select.Option><Select.Option value="api">{t('console.records.apiCall')}</Select.Option></Select></label>
        <label className="records-filter-field" htmlFor="records-status"><span>{t('console.records.status')}</span><Select id="records-status" value={filters.status} onChange={(value) => updateFilter('status', String(value) as UsageRecordsStatus)} block><Select.Option value="all">{t('console.records.allStatuses')}</Select.Option><Select.Option value="success">{t('console.records.successStatus')}</Select.Option><Select.Option value="error">{t('console.records.errorStatus')}</Select.Option><Select.Option value="cancelled">{t('console.records.cancelledStatus')}</Select.Option></Select></label>
        <label className="records-filter-field" htmlFor="records-api-key"><span>{t('console.records.apiKey')}</span><Select id="records-api-key" value={filters.apiKeyID} onChange={(value) => updateFilter('apiKeyID', String(value))} block><Select.Option value="all">{t('console.records.allKeys')}</Select.Option>{apiKeyOptions.map((option) => <Select.Option value={option.id} key={option.id}>{option.name}</Select.Option>)}</Select></label>
        {data?.can_filter_members ? <label className="records-filter-field" htmlFor="records-member"><span>{t('console.records.member')}</span><Select id="records-member" value={filters.memberID} onChange={(value) => updateFilter('memberID', String(value))} block><Select.Option value="all">{t('console.records.allMembers')}</Select.Option>{memberOptions.map((option) => <Select.Option value={option.id} key={option.id}>{option.name}</Select.Option>)}</Select></label> : null}
        <label className="records-filter-field records-filter-field--request" htmlFor="records-request"><span>{t('console.records.requestId')}</span><Input id="records-request" className="records-request-input" size="large" value={filters.requestID} onChange={(value) => updateFilter('requestID', value)} placeholder={t('console.records.exactRequest')} aria-label={t('console.records.requestId')} suffix={<IconSearch aria-hidden="true" />} showClear /></label>
        <Button className="records-reset-button" theme="borderless" icon={<IconRefresh />} onClick={resetFilters}>{t('console.records.resetFilters')}</Button>
      </div>
    </section>
    {error && !data ? <section className="records-error-state" role="alert"><strong>{error.message}</strong>{error.requestId ? <small>{t('console.common.requestIdValue', { requestId: error.requestId })}</small> : null}<Button theme="outline" icon={<IconRefresh />} onClick={() => setReloadToken((value) => value + 1)}>{t('console.records.retry')}</Button></section> : loading ? <div className="records-loading" role="status"><span className="records-loading-spinner" />{t('console.records.loading')}</div> : currentItems.length === 0 ? <EmptyPanel title={t('console.records.noRecords')} description={t('console.records.noVisibleRecords')} action={<Button theme="outline" onClick={resetFilters}>{t('console.records.clearFilters')}</Button>} /> : <>
      <div className="source-table-scroll records-table-scroll" role="region" aria-label={t('console.records.title')} tabIndex={0}>
    <table className="records-source-table records-api-table"><thead><tr><th>{t('console.records.timeRange')}</th><th>{t('console.records.requestId')}</th><th>{t('console.records.model')}</th><th>{t('console.records.platform')}</th><th>{t('console.records.status')}</th><th>{t('console.records.inputTokens')}</th><th>{t('console.records.outputTokens')}</th><th>{t('console.records.cacheHitRate')}</th><th>{t('console.records.latency')}</th><th>{t('console.records.firstToken')}</th><th>{t('console.records.cost')}</th><th>{t('console.records.operation')}</th></tr></thead><tbody>{currentItems.map((record) => <tr key={record.id}><td><time dateTime={semanticDateTime(record.occurred_at)}>{formatApiTime(record.occurred_at)}</time></td><td><span className="records-request-cell"><code>{record.request_id}</code><button type="button" className="records-icon-button" aria-label={t('console.records.copyRequestLabel', { requestId: record.request_id })} title={t('console.records.copyRequest')} onClick={() => void copyRequestID(record.request_id)}><IconCopy /></button></span></td><td><span className="records-model-cell"><strong>{record.model_name || t('console.records.unnamedModel')}</strong><small>{record.model_alias || t('console.records.noAlias')}</small></span></td><td>{clientPlatformLabel(record.client_platform)}</td><td><span className={`records-status records-status--${statusClass(record.status)}`}><i aria-hidden="true" />{statusLabel(record.status)}</span></td><td>{formatInteger(record.input_tokens)}</td><td>{formatInteger(record.output_tokens)}</td><td>{formatRate(record.cache_hit_rate)}</td><td>{formatLatency(record.latency_ms)}</td><td>{formatFirstToken(record.first_token_ms)}</td><td>{formatCost(record.cost_yuan, data?.can_view_billing ?? false)}</td><td><Button theme="borderless" size="small" onClick={() => setSelected(record)}>{t('console.records.details')}</Button></td></tr>)}</tbody></table>
      </div>
      <AppPagination ariaLabel={t('console.records.page')} currentPage={page} pageSize={currentPageSize} total={data?.total ?? 0} summary={t('console.records.rangeSummary', { start: (page - 1) * currentPageSize + 1, end: Math.min(page * currentPageSize, data?.total ?? 0), total: data?.total ?? 0 })} disabled={loading} onPageChange={setPage} onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(RECORDS_PAGE_MIN) }} />
    </>}
    <Modal title={selected ? `${t('console.records.requestDetail')} · ${selected.request_id}` : t('console.records.requestDetail')} visible={Boolean(selected)} onCancel={() => setSelected(null)} footer={null} width="720px"><div className="records-detail-modal">{selected ? <RecordDetail record={selected} canViewBilling={data?.can_view_billing ?? false} onClose={() => setSelected(null)} /> : null}</div></Modal>
  </div>
}
