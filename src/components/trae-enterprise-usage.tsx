import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import DatePicker from '@douyinfe/semi-ui/lib/es/datePicker'
import Select from '@douyinfe/semi-ui/lib/es/select'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { IconDownload, IconInfoCircle, IconSearch } from '@douyinfe/semi-icons'
import * as echarts from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import {
  getEnterpriseDepartments,
  type EnterpriseContext,
  type EnterpriseDepartment,
} from '@/api/enterprise-console'
import {
  getEnterpriseUsageDepartments,
  getEnterpriseUsageDetail,
  getEnterpriseUsageMembers,
  getEnterpriseUsageSummary,
  type EnterpriseUsageAggregateItem,
  type EnterpriseUsageDepartment,
  type EnterpriseUsageDetailResponse,
  type EnterpriseUsageMember,
  type EnterpriseUsagePage,
  type EnterpriseUsagePeriod,
  type EnterpriseUsageStatus,
  type EnterpriseUsageSummaryResponse,
} from '@/api/enterprise-usage'
import { TraePagination } from '@/components/trae-pagination'
import { TraeTableEmpty } from '@/components/trae-table-empty'
import {
  TraeUsageDepartmentTable,
  type TraeUsageDepartmentNode,
} from '@/components/trae-usage-department-table'
import {
  EnterpriseError,
  EnterpriseLoading,
  exportEnterpriseCsv,
  useEnterpriseErrorHandler,
  type EnterpriseRequestError,
} from '@/pages/enterprise-console-shared'
import { useResolvedTheme } from '@/theme'
import { BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES, formatApiTime, formatCount, formatYuan } from '@/utils/format'
import { addLocalDays as addDays, startOfLocalToday as startOfToday } from '@/utils/date-range'
import './trae-enterprise-usage.css'

echarts.use([PieChart, TooltipComponent, SVGRenderer])

type UsagePeriodLabel = { start: string; end: string }

type UsageSelectProps = {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  searchable?: boolean
  onChange: (value: string) => void
}

function UsageSelect({ label, value, options, searchable = false, onChange }: UsageSelectProps) {
  return (
    <Select
      aria-label={label}
      className="trae-select"
      dropdownClassName="trae-select-dropdown trae-usage-member-select-dropdown"
      filter={searchable}
      searchPosition={searchable ? 'dropdown' : undefined}
      searchPlaceholder={label}
      value={value}
      onChange={(nextValue) => onChange(String(nextValue ?? 'all'))}
    >
      {options.map((option) => <Select.Option key={option.value} value={option.value}>{option.label}</Select.Option>)}
    </Select>
  )
}

function formatPeriodDate(value: string | number, language: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return new Intl.DateTimeFormat(language.startsWith('en') ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function toPeriodLabel(period: EnterpriseUsagePeriod, language: string): UsagePeriodLabel {
  return {
    start: formatPeriodDate(period.start_at, language),
    end: formatPeriodDate(period.end_at, language),
  }
}

function useDebouncedValue(value: string, delay = 250): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [delay, value])
  return debounced
}

function UsageDonut({ usage, balance }: { usage: number; balance: number }) {
  const { t } = useTranslation()
  const theme = useResolvedTheme()
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = chartRef.current
    if (!node) return undefined
    const chart = echarts.init(node, undefined, { renderer: 'svg' })
    chart.setOption({
      animationDuration: 320,
      tooltip: {
        trigger: 'item',
        backgroundColor: '#202124',
        borderColor: '#1DC981',
        borderWidth: 1,
        textStyle: { color: '#ffffff', fontSize: 13 },
        extraCssText: 'border:1px solid #1DC981 !important;background:#202124 !important;color:#ffffff !important;box-shadow:none;',
        formatter: (params: unknown) => {
          const item = params as { name?: string; value?: number }
          return `<span style="color:#ffffff;font-size:13px;line-height:18px;">${item.name ?? ''}</span><br/><span style="display:inline-block;color:#ffffff;font-size:18px;font-weight:700;line-height:24px;">${formatYuan(Number(item.value ?? 0), BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES)}</span>`
        },
      },
      series: [{
        type: 'pie',
        radius: ['58%', '82%'],
        center: ['50%', '50%'],
        label: { show: false },
        itemStyle: { borderColor: theme === 'dark' ? '#24262b' : '#ffffff', borderWidth: 2 },
        emphasis: { scale: true, scaleSize: 4 },
        data: [
          { name: t('traeEnterprise.usage.totalCost'), value: Math.max(usage, 0.0000001), itemStyle: { color: '#1DC981' } },
          { name: t('traeEnterprise.usage.accountBalance'), value: Math.max(balance, 0.0000001), itemStyle: { color: theme === 'dark' ? '#4b515c' : '#c9ced8' } },
        ],
      }],
    })
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => chart.resize()) : null
    observer?.observe(node)
    return () => {
      observer?.disconnect()
      chart.dispose()
    }
  }, [balance, t, theme, usage])

  return <div className="trae-usage-donut" ref={chartRef} role="img" aria-label={t('traeEnterprise.usage.overall')} />
}

async function loadDepartmentCatalog(enterpriseID: string, signal: AbortSignal): Promise<EnterpriseDepartment[]> {
  async function loadChildren(parentID?: string): Promise<EnterpriseDepartment[]> {
    const departments: EnterpriseDepartment[] = []
    let page = 1
    let total = 0
    do {
      const response = await getEnterpriseDepartments(
        { enterprise_id: enterpriseID },
        { parent_id: parentID, page, page_size: 20, signal },
      )
      departments.push(...response.items)
      total = response.total
      if (response.items.length === 0 || departments.length >= total) break
      page += 1
    } while (page <= Math.ceil(total / 20))
    return Promise.all(departments.map(async (department) => ({
      ...department,
      children: department.child_count > 0 ? await loadChildren(department.id) : [],
    }))) as Promise<EnterpriseDepartment[]>
  }
  return loadChildren()
}

async function loadAllUsageDepartments(enterpriseID: string, signal: AbortSignal): Promise<EnterpriseUsageDepartment[]> {
  const items: EnterpriseUsageDepartment[] = []
  let page = 1
  let total = 0
  do {
    const response = await getEnterpriseUsageDepartments(
      { enterprise_id: enterpriseID },
      { page, page_size: 20, signal },
    )
    items.push(...(response.items ?? []))
    total = response.total ?? items.length
    if (response.items.length === 0 || items.length >= total) break
    page += 1
  } while (page <= Math.ceil(total / 20))
  return items
}

type DepartmentWithChildren = EnterpriseDepartment & { children?: DepartmentWithChildren[] }

function mergeDepartmentUsage(
  context: EnterpriseContext,
  catalog: DepartmentWithChildren[],
  usageItems: EnterpriseUsageDepartment[],
  summary: EnterpriseUsageSummaryResponse | null,
): TraeUsageDepartmentNode[] {
  const usageByID = new Map(usageItems.map((item) => [item.department_id, item]))
  const catalogIDs = new Set<string>()
  function mapNode(node: DepartmentWithChildren): TraeUsageDepartmentNode {
    catalogIDs.add(node.id)
    const usage = usageByID.get(node.id)
    return {
      id: node.id,
      name: node.name,
      total: formatYuan(usage?.cost_yuan ?? '0', BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES),
      tokens: formatCount(usage?.total_tokens ?? 0),
      requests: formatCount(usage?.request_count ?? 0),
      children: node.children?.map(mapNode),
    }
  }
  const knownNodes = catalog.map(mapNode)
  const unmatchedNodes = usageItems
    .filter((item) => !catalogIDs.has(item.department_id))
    .map((item) => ({
      id: item.department_id,
      name: item.department_name,
      total: formatYuan(item.cost_yuan, BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES),
      tokens: formatCount(item.total_tokens),
      requests: formatCount(item.request_count),
    }))
  return [{
    id: `enterprise-${context.id}`,
    name: context.name,
    total: formatYuan(summary?.summary.total_cost_yuan ?? '0', BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES),
    tokens: formatCount((summary?.summary.input_tokens ?? 0) + (summary?.summary.output_tokens ?? 0)),
    requests: formatCount(summary?.summary.request_count ?? 0),
    children: [...knownNodes, ...unmatchedNodes],
  }]
}

type UsageBoardProps = {
  context: EnterpriseContext
  onDetail: (memberID: string) => void
  onPeriodChange: (period: UsagePeriodLabel) => void
}

export function TraeUsageBoard({ context, onDetail, onPeriodChange }: UsageBoardProps) {
  const { t, i18n } = useTranslation()
  const handleError = useEnterpriseErrorHandler()
  const [memberQuery, setMemberQuery] = useState('')
  const debouncedMemberQuery = useDebouncedValue(memberQuery)
  const [departmentQuery, setDepartmentQuery] = useState('')
  const [memberPage, setMemberPage] = useState(1)
  const [memberPageSize, setMemberPageSize] = useState(20)
  const [summary, setSummary] = useState<EnterpriseUsageSummaryResponse | null>(null)
  const [members, setMembers] = useState<EnterpriseUsagePage<EnterpriseUsageMember>>({ items: [], total: 0, page: 1, page_size: 20, period: { range: '', start_at: 0, end_at: 0 } })
  const [departments, setDepartments] = useState<TraeUsageDepartmentNode[]>([])
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [membersLoading, setMembersLoading] = useState(true)
  const [overviewError, setOverviewError] = useState<EnterpriseRequestError | null>(null)
  const [membersError, setMembersError] = useState<EnterpriseRequestError | null>(null)
  const [overviewReload, setOverviewReload] = useState(0)
  const [membersReload, setMembersReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setOverviewLoading(true)
    setOverviewError(null)
    Promise.all([
      getEnterpriseUsageSummary({ enterprise_id: context.id }, { signal: controller.signal }),
      loadAllUsageDepartments(context.id, controller.signal),
      loadDepartmentCatalog(context.id, controller.signal),
    ]).then(([nextSummary, usageDepartments, catalog]) => {
      if (!active) return
      setSummary(nextSummary)
      setDepartments(mergeDepartmentUsage(context, catalog as DepartmentWithChildren[], usageDepartments, nextSummary))
      onPeriodChange(toPeriodLabel(nextSummary.period, i18n.language))
    }).catch((reason: unknown) => {
      if (!active || controller.signal.aborted) return
      setOverviewError(handleError(reason))
    }).finally(() => {
      if (active) setOverviewLoading(false)
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [context, handleError, i18n.language, onPeriodChange, overviewReload])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setMembersLoading(true)
    setMembersError(null)
    getEnterpriseUsageMembers(
      { enterprise_id: context.id },
      {
        keyword: debouncedMemberQuery.trim() || undefined,
        page: memberPage,
        page_size: memberPageSize,
        signal: controller.signal,
      },
    ).then((response) => {
      if (active) setMembers({ ...response, items: response.items ?? [] })
    }).catch((reason: unknown) => {
      if (!active || controller.signal.aborted) return
      setMembersError(handleError(reason))
    }).finally(() => {
      if (active) setMembersLoading(false)
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [context.id, debouncedMemberQuery, handleError, memberPage, memberPageSize, membersReload])

  const totalCost = Number(summary?.summary.total_cost_yuan ?? 0)
  const accountAmount = summary?.summary.account_amount_yuan ?? summary?.account_amount_yuan ?? '0'
  const accountBalance = Number(accountAmount)
  const totalTokens = (summary?.summary.input_tokens ?? 0) + (summary?.summary.output_tokens ?? 0)

  return <>
    {overviewError ? (
      <EnterpriseError message={overviewError.message} requestId={overviewError.requestId} onRetry={() => setOverviewReload((value) => value + 1)} />
    ) : overviewLoading && !summary ? (
      <EnterpriseLoading />
    ) : (
      <div className="trae-usage-summary trae-usage-summary--official">
        <article className="trae-usage-summary-card trae-usage-summary-card--overall">
          <div className="trae-usage-overall-body">
            <div className="trae-usage-overall-copy">
              <div className="trae-usage-summary-heading"><span>{t('traeEnterprise.usage.overall')}</span><IconInfoCircle className="app-info-icon" aria-hidden="true" /></div>
              <div className="trae-usage-overall-details">
                <strong>{formatYuan(accountAmount, BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES)}</strong>
                <span><i className="is-base" />{t('traeEnterprise.usage.usedCost')} {formatYuan(summary?.summary.total_cost_yuan ?? '0', BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES)}</span>
              </div>
            </div>
            <UsageDonut usage={Number.isFinite(totalCost) ? totalCost : 0} balance={Number.isFinite(accountBalance) ? accountBalance : 0} />
          </div>
        </article>
        <article className="trae-usage-summary-card trae-usage-summary-card--account">
          <div className="trae-usage-summary-heading"><span>{t('traeEnterprise.usage.totalTokens')}</span><IconInfoCircle className="app-info-icon" aria-hidden="true" /></div>
          <strong className="trae-usage-card-money">
            {formatCount(totalTokens)}
            <span>{t('traeEnterprise.usage.tokenUnit')}</span>
          </strong>
          <div className="trae-usage-account-stats">
            <span>{t('traeEnterprise.usage.requestCount')} <b>{formatCount(summary?.summary.request_count ?? 0)}</b></span>
          </div>
        </article>
      </div>
    )}

    <section className="trae-section">
      <div className="trae-section-heading"><h2>{t('traeEnterprise.usage.people')}</h2></div>
      <div className="trae-toolbar">
        <label className="trae-inline-search trae-inline-search--wide"><IconSearch aria-hidden="true" /><input aria-label={t('traeEnterprise.usage.searchPeople')} placeholder={t('traeEnterprise.usage.searchPeople')} value={memberQuery} onChange={(event) => { setMemberQuery(event.target.value); setMemberPage(1) }} /></label>
      </div>
      {membersError ? (
        <EnterpriseError message={membersError.message} requestId={membersError.requestId} onRetry={() => setMembersReload((value) => value + 1)} />
      ) : membersLoading && members.items.length === 0 ? (
        <EnterpriseLoading />
      ) : <>
        <div className="trae-table-scroll" aria-busy={membersLoading}>
          <table className="trae-table trae-usage-board-table">
            <thead><tr><th>{t('traeEnterprise.usage.name')}</th><th>{t('traeEnterprise.usage.department')}</th><th>{t('traeEnterprise.usage.totalTokens')}</th><th>{t('traeEnterprise.usage.requestCount')}</th><th>{t('traeEnterprise.usage.totalCost')}</th><th>{t('traeEnterprise.usage.operation')}</th></tr></thead>
            <tbody>{members.items.map((member) => <tr key={member.member_id}><td><span className="trae-person-cell"><span><strong>{member.member_name || '--'}</strong><small>{member.email || '--'}</small></span></span></td><td>{member.department_name || '--'}</td><td className="trae-usage-number">{formatCount(member.total_tokens)}</td><td className="trae-usage-number">{formatCount(member.request_count)}</td><td className="trae-usage-number">{formatYuan(member.cost_yuan, BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES)}</td><td><button className="trae-text-button" type="button" onClick={() => onDetail(member.member_id)}>{t('traeEnterprise.usage.detailAction')}</button></td></tr>)}</tbody>
          </table>
          {members.items.length === 0 ? <TraeTableEmpty hint={t('traeEnterprise.usage.detailEmpty')} /> : null}
        </div>
        <TraePagination ariaLabel={t('traeEnterprise.usage.memberPagination')} total={members.total} currentPage={members.page || memberPage} pageSize={members.page_size || memberPageSize} pageSizeOpts={[20, 50, 100]} summary={t('traeEnterprise.usage.paginationSummary', { total: formatCount(members.total) })} disabled={membersLoading} onChange={(nextPage, nextPageSize) => { setMemberPageSize(nextPageSize); setMemberPage(nextPageSize === memberPageSize ? nextPage : 1) }} />
      </>}
    </section>

    <section className="trae-section">
      <div className="trae-section-heading"><h2>{t('traeEnterprise.usage.departments')}</h2></div>
      <div className="trae-toolbar"><label className="trae-inline-search trae-inline-search--wide trae-usage-department-search"><IconSearch aria-hidden="true" /><input aria-label={t('traeEnterprise.usage.searchDepartment')} placeholder={t('traeEnterprise.usage.searchDepartment')} value={departmentQuery} onChange={(event) => setDepartmentQuery(event.target.value)} /></label></div>
      <TraeUsageDepartmentTable dataSource={departments} departmentTitle={t('traeEnterprise.usage.department')} periodTotalTitle={t('traeEnterprise.usage.totalCost')} tokenTitle={t('traeEnterprise.usage.totalTokens')} requestTitle={t('traeEnterprise.usage.requestCount')} query={departmentQuery} />
    </section>
  </>
}

type UsageDetailProps = {
  context: EnterpriseContext
  memberID: string
  onMemberChange: (value: string) => void
}

const EMPTY_DETAIL: EnterpriseUsageDetailResponse = {
  account: { id: '', type: 'enterprise', name: '' },
  can_filter_members: false,
  can_view_billing: false,
  filters: { models: [], api_keys: [], members: [] },
  items: [],
  granularity: 'day',
  page: 1,
  page_size: 20,
  total: 0,
}

function customRangeOptions(range: string, dates: Date[]) {
  if (range !== 'custom' || dates.length !== 2) return { range: range as 'today' | '7d' | '30d' }
  const endOfSelectedDay = new Date(dates[1])
  endOfSelectedDay.setHours(23, 59, 59, 999)
  return {
    range: 'custom' as const,
    start_at: dates[0].getTime(),
    end_at: Math.min(Date.now(), endOfSelectedDay.getTime()),
  }
}

function detailCsvRow(row: EnterpriseUsageAggregateItem): Array<string | number> {
  return [row.bucket_start, row.model_name, row.vendor, row.requests, row.success_count, row.error_count, row.cancelled_count, row.input_tokens, row.output_tokens, row.cached_tokens, row.cost_yuan, row.average_latency_ms ?? '']
}

export function TraeUsageDetail({ context, memberID, onMemberChange }: UsageDetailProps) {
  const { t } = useTranslation()
  const handleError = useEnterpriseErrorHandler()
  const [range, setRange] = useState<'today' | '7d' | '30d' | 'custom'>('30d')
  const [customRange, setCustomRange] = useState<Date[]>(() => [addDays(startOfToday(), -6), startOfToday()])
  const [model, setModel] = useState('all')
  const [status, setStatus] = useState<EnterpriseUsageStatus>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [data, setData] = useState(EMPTY_DETAIL)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<EnterpriseRequestError | null>(null)
  const [reload, setReload] = useState(0)
  const today = useMemo(() => startOfToday(), [])
  const minDate = useMemo(() => addDays(today, -89), [today])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    getEnterpriseUsageDetail(
      { enterprise_id: context.id },
      {
        ...customRangeOptions(range, customRange),
        member_id: memberID,
        model,
        status,
        page,
        page_size: pageSize,
        signal: controller.signal,
      },
    ).then((response) => {
      if (active) setData({ ...response, items: response.items ?? [], filters: { models: response.filters?.models ?? [], api_keys: response.filters?.api_keys ?? [], members: response.filters?.members ?? [] } })
    }).catch((reason: unknown) => {
      if (!active || controller.signal.aborted) return
      setError(handleError(reason))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [context.id, customRange, handleError, memberID, model, page, pageSize, range, reload, status])

  function setPreset(nextRange: typeof range) {
    setRange(nextRange)
    setPage(1)
  }

  function handleCustomRange(nextValue: Date | Date[] | string | string[] | undefined) {
    if (!Array.isArray(nextValue)) return
    const dates = nextValue.filter((item): item is Date => item instanceof Date)
    if (dates.length === 2 && dates.every((date) => date >= minDate && date <= today)) {
      setCustomRange(dates)
      setPage(1)
    }
  }

  function exportDetail() {
    exportEnterpriseCsv(
      'trae-usage-detail.csv',
      [t('traeEnterprise.usage.detailDate'), t('traeEnterprise.usage.model'), t('traeEnterprise.usage.vendor'), t('traeEnterprise.usage.requestCount'), t('traeEnterprise.usage.successCount'), t('traeEnterprise.usage.errorCount'), t('traeEnterprise.usage.cancelledCount'), t('traeEnterprise.usage.inputTokens'), t('traeEnterprise.usage.outputTokens'), t('traeEnterprise.usage.cachedTokens'), t('traeEnterprise.usage.totalCost'), t('traeEnterprise.usage.averageLatency')],
      data.items.map(detailCsvRow),
    )
    Toast.success(t('traeEnterprise.usage.downloadSuccess'))
  }

  const memberOptions = [{ value: 'all', label: t('traeEnterprise.usage.allMembers') }, ...data.filters.members.map((member) => ({ value: member.id, label: member.name }))]
  const modelOptions = [{ value: 'all', label: t('traeEnterprise.usage.allModels') }, ...data.filters.models.map((item) => ({ value: item.code, label: item.alias || item.name || item.code }))]
  const statusOptions = [
    { value: 'all', label: t('traeEnterprise.usage.allStatuses') },
    { value: 'success', label: t('traeEnterprise.usage.success') },
    { value: 'error', label: t('traeEnterprise.usage.error') },
    { value: 'cancelled', label: t('traeEnterprise.usage.cancelled') },
  ]

  return <section className="trae-section trae-usage-detail-section">
    <div className="trae-usage-detail-toolbar">
      {data.can_filter_members || data.filters.members.length > 0 ? <UsageSelect label={t('traeEnterprise.usage.chooseMember')} value={memberID} onChange={(value) => { onMemberChange(value); setPage(1) }} searchable options={memberOptions} /> : null}
      <UsageSelect label={t('traeEnterprise.usage.allModels')} value={model} onChange={(value) => { setModel(value); setPage(1) }} searchable options={modelOptions} />
      <UsageSelect label={t('traeEnterprise.usage.allStatuses')} value={status} onChange={(value) => { setStatus(value as EnterpriseUsageStatus); setPage(1) }} options={statusOptions} />
      <div className="trae-usage-range-buttons">{([['today', t('traeEnterprise.usage.today')], ['7d', t('traeEnterprise.usage.last7')], ['30d', t('traeEnterprise.usage.last30')], ['custom', t('traeEnterprise.usage.custom')]] as const).map(([value, label]) => <button key={value} className={range === value ? 'is-active' : ''} type="button" onClick={() => setPreset(value)}>{label}</button>)}</div>
      {range === 'custom' ? <DatePicker className="trae-date-picker trae-usage-detail-date-picker" dropdownClassName="trae-date-picker-dropdown trae-usage-detail-date-dropdown" type="dateRange" value={customRange} format="yyyy-MM-dd" rangeSeparator=" ~ " showClear={false} disabledDate={(date) => !date || date < minDate || date > today} onChange={handleCustomRange} /> : null}
      <button className="trae-icon-button trae-usage-detail-download" type="button" disabled={data.items.length === 0} aria-label={t('traeEnterprise.usage.download')} title={t('traeEnterprise.usage.download')} onClick={exportDetail}><IconDownload aria-hidden="true" /></button>
    </div>
    {error ? (
      <EnterpriseError message={error.message} requestId={error.requestId} onRetry={() => setReload((value) => value + 1)} />
    ) : loading && data.items.length === 0 ? (
      <EnterpriseLoading />
    ) : <>
      <div className="trae-table-scroll" aria-busy={loading}>
        <table className="trae-table trae-usage-detail-table">
          <thead><tr><th>{t('traeEnterprise.usage.detailDate')}</th><th>{t('traeEnterprise.usage.model')}</th><th>{t('traeEnterprise.usage.vendor')}</th><th>{t('traeEnterprise.usage.requestCount')}</th><th>{t('traeEnterprise.usage.successCount')}</th><th>{t('traeEnterprise.usage.errorCount')}</th><th>{t('traeEnterprise.usage.cancelledCount')}</th><th>{t('traeEnterprise.usage.inputTokens')}</th><th>{t('traeEnterprise.usage.outputTokens')}</th><th>{t('traeEnterprise.usage.cachedTokens')}</th><th>{t('traeEnterprise.usage.totalCost')}</th><th>{t('traeEnterprise.usage.averageLatency')}</th></tr></thead>
          <tbody>{data.items.map((row) => <tr key={row.id}><td>{formatApiTime(row.bucket_start)}</td><td><strong>{row.model_alias || row.model_name || row.model_code}</strong><small>{row.model_code}</small></td><td>{row.vendor || '--'}</td><td className="trae-usage-number">{formatCount(row.requests)}</td><td className="trae-usage-number">{formatCount(row.success_count)}</td><td className="trae-usage-number">{formatCount(row.error_count)}</td><td className="trae-usage-number">{formatCount(row.cancelled_count)}</td><td className="trae-usage-number">{formatCount(row.input_tokens)}</td><td className="trae-usage-number">{formatCount(row.output_tokens)}</td><td className="trae-usage-number">{formatCount(row.cached_tokens)}</td><td className="trae-usage-number">{data.can_view_billing ? formatYuan(row.cost_yuan, BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES) : '--'}</td><td className="trae-usage-number">{row.average_latency_ms == null ? '--' : `${Math.round(row.average_latency_ms)} ms`}</td></tr>)}</tbody>
        </table>
        {data.items.length === 0 ? <TraeTableEmpty hint={t('traeEnterprise.usage.detailEmpty')} /> : null}
      </div>
      <TraePagination ariaLabel={t('traeEnterprise.usage.pagination')} total={data.total} currentPage={data.page || page} pageSize={data.page_size || pageSize} pageSizeOpts={[20, 50, 100]} summary={t('traeEnterprise.usage.paginationSummary', { total: formatCount(data.total) })} disabled={loading} onChange={(nextPage, nextPageSize) => { setPageSize(nextPageSize); setPage(nextPageSize === pageSize ? nextPage : 1) }} />
    </>}
  </section>
}
