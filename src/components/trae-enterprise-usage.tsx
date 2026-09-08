import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import DatePicker from '@douyinfe/semi-ui/lib/es/datePicker'
import Select from '@douyinfe/semi-ui/lib/es/select'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { IconDownload, IconInfoCircle } from '@douyinfe/semi-icons'
import * as echarts from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import {
  getAllEnterpriseMembers,
  type EnterpriseContext,
} from '@/api/enterprise-console'
import {
  getEnterpriseUsageDetail,
  type EnterpriseUsageDetailResponse,
  type EnterpriseUsageStatus,
} from '@/api/enterprise-usage'
import { TraeTableEmpty } from '@/components/trae-table-empty'
import { TraePagination } from '@/components/trae-pagination'
import {
  EnterpriseError,
  EnterpriseLoading,
  useEnterpriseErrorHandler,
  type EnterpriseRequestError,
} from '@/pages/enterprise-console-shared'
import {
  createExportIdempotencyKey,
  createExportTask,
  downloadExportTask,
  getExportErrorMessage,
  saveExportResponse,
  waitForExportTask,
} from '@/api/exports'
import { isAuthenticationFailure } from '@/api/http'
import { useResolvedTheme } from '@/theme'
import { BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES, formatApiTime, formatCount, formatPersonOptionLabel, formatYuan } from '@/utils/format'
import { addLocalDays as addDays, startOfLocalToday as startOfToday } from '@/utils/date-range'
import './trae-date-picker.css'
import './trae-enterprise-usage.css'

echarts.use([PieChart, TooltipComponent, SVGRenderer])

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

function UsageDonut({ usage, balance }: { usage: number; balance?: number }) {
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
          ...(balance === undefined ? [] : [{ name: t('traeEnterprise.usage.accountBalance'), value: Math.max(balance, 0.0000001), itemStyle: { color: theme === 'dark' ? '#4b515c' : '#c9ced8' } }]),
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

type UsageModelRow = {
  model_code: string
  model_name: string
  model_alias: string
  vendor: string
  requests: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  cost_yuan: string
}

type UsageTotals = {
  requests: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  cost_yuan: string
}

function decimalSum(values: Iterable<string | number | null | undefined>): string {
  // 费用字段是十进制字符串；页面展示可安全使用 Number，最终保留字符串以免
  // 把 API 的金额字段改成浮点数再传回后端。
  const total = Array.from(values).reduce<number>((sum, value) => {
    const number = typeof value === 'number' ? value : Number(value ?? 0)
    return sum + (Number.isFinite(number) ? number : 0)
  }, 0)
  return total.toFixed(BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES)
}

function summarizeUsage(items: EnterpriseUsageDetailResponse['items']): UsageTotals {
  return {
    requests: items.reduce((sum, item) => sum + (Number(item.requests) || 0), 0),
    input_tokens: items.reduce((sum, item) => sum + (Number(item.input_tokens) || 0), 0),
    output_tokens: items.reduce((sum, item) => sum + (Number(item.output_tokens) || 0), 0),
    cached_tokens: items.reduce((sum, item) => sum + (Number(item.cached_tokens) || 0), 0),
    cost_yuan: decimalSum(items.map((item) => item.cost_yuan)),
  }
}

function groupUsageByModel(items: EnterpriseUsageDetailResponse['items']): UsageModelRow[] {
  const groups = new Map<string, UsageModelRow>()
  items.forEach((item) => {
    const key = item.model_code || item.model_name || item.id
    const current = groups.get(key) ?? {
      model_code: item.model_code,
      model_name: item.model_name,
      model_alias: item.model_alias,
      vendor: item.vendor,
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      cached_tokens: 0,
      cost_yuan: '0',
    }
    current.requests += Number(item.requests) || 0
    current.input_tokens += Number(item.input_tokens) || 0
    current.output_tokens += Number(item.output_tokens) || 0
    current.cached_tokens += Number(item.cached_tokens) || 0
    current.cost_yuan = decimalSum([current.cost_yuan, item.cost_yuan])
    groups.set(key, current)
  })
  return Array.from(groups.values()).sort((left, right) => right.requests - left.requests)
}

async function loadAllUsageRows(enterpriseID: string, signal: AbortSignal): Promise<EnterpriseUsageDetailResponse> {
  const first = await getEnterpriseUsageDetail(
    { enterprise_id: enterpriseID },
    { range: 'today', page: 1, page_size: 100, signal },
  )
  const items = [...(first.items ?? [])]
  const total = Number(first.total) || items.length
  let page = 2
  while (items.length < total && page <= Math.ceil(total / 100)) {
    const next = await getEnterpriseUsageDetail(
      { enterprise_id: enterpriseID },
      { range: 'today', page, page_size: 100, signal },
    )
    items.push(...(next.items ?? []))
    if ((next.items ?? []).length === 0) break
    page += 1
  }
  return { ...first, items }
}

type UsageBoardProps = {
  context: EnterpriseContext
  /** 保留旧页面回调以兼容灰度构建；新用量行按模型展示。 */
  onDetail?: (memberID: string) => void
}

export function TraeUsageBoard({ context, onDetail }: UsageBoardProps) {
  const { t } = useTranslation()
  const handleError = useEnterpriseErrorHandler()
  const [overview, setOverview] = useState<EnterpriseUsageDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<EnterpriseRequestError | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    loadAllUsageRows(context.id, controller.signal)
      .then((response) => {
        if (active) setOverview(response)
      })
      .catch((reason: unknown) => {
        if (!active || controller.signal.aborted) return
        setError(handleError(reason))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [context.id, handleError, reload])

  const items = overview?.items ?? []
  const totals = useMemo(() => summarizeUsage(items), [items])
  const modelRows = useMemo(() => groupUsageByModel(items), [items])
  const totalTokens = totals.input_tokens + totals.output_tokens
  const canViewBilling = overview?.can_view_billing ?? false
  const totalCost = Number(totals.cost_yuan)

  return <>
    {error ? (
      <EnterpriseError message={error.message} requestId={error.requestId} onRetry={() => setReload((value) => value + 1)} />
    ) : loading && !overview ? (
      <EnterpriseLoading />
    ) : (
      <div className="trae-usage-summary trae-usage-summary--official">
        <article className="trae-usage-summary-card trae-usage-summary-card--overall">
          <div className="trae-usage-overall-body">
            <div className="trae-usage-overall-copy">
              <div className="trae-usage-summary-heading"><span>{t('traeEnterprise.usage.overall')}</span><IconInfoCircle className="app-info-icon" aria-hidden="true" /></div>
              <div className="trae-usage-overall-details">
                <strong>{canViewBilling ? formatYuan(totals.cost_yuan, BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES) : '--'}</strong>
                <span><i className="is-base" />{t('traeEnterprise.usage.usedCost')} {canViewBilling ? formatYuan(totals.cost_yuan, BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES) : '--'}</span>
              </div>
            </div>
            <UsageDonut usage={Number.isFinite(totalCost) ? totalCost : 0} />
          </div>
        </article>
        <article className="trae-usage-summary-card trae-usage-summary-card--account">
          <div className="trae-usage-summary-heading"><span>{t('traeEnterprise.usage.totalTokens')}</span><IconInfoCircle className="app-info-icon" aria-hidden="true" /></div>
          <strong className="trae-usage-card-money">
            {formatCount(totalTokens)}
            <span>{t('traeEnterprise.usage.tokenUnit')}</span>
          </strong>
          <div className="trae-usage-account-stats">
            <span>{t('traeEnterprise.usage.requestCount')} <b>{formatCount(totals.requests)}</b></span>
          </div>
        </article>
      </div>
    )}

    <section className="trae-section">
      <div className="trae-section-heading"><h2>{t('traeEnterprise.usage.byModel')}</h2></div>
      {loading && modelRows.length === 0 ? <EnterpriseLoading /> : <>
        <div className="trae-table-scroll" aria-busy={loading}>
          <table className="trae-table trae-usage-board-table">
            <thead><tr><th>{t('traeEnterprise.usage.name')}</th><th>{t('traeEnterprise.usage.totalTokens')}</th><th>{t('traeEnterprise.usage.requestCount')}</th><th>{t('traeEnterprise.usage.totalCost')}</th><th>{t('traeEnterprise.usage.operation')}</th></tr></thead>
            <tbody>{modelRows.map((model) => <tr key={model.model_code || model.model_name}>
              <td><span className="trae-person-cell"><span><strong>{model.model_alias || model.model_name || model.model_code || '--'}</strong><small>{model.vendor || model.model_code || '--'}</small></span></span></td>
              <td className="trae-usage-number">{formatCount(model.input_tokens + model.output_tokens)}</td>
              <td className="trae-usage-number">{formatCount(model.requests)}</td>
              <td className="trae-usage-number">{canViewBilling ? formatYuan(model.cost_yuan, BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES) : '--'}</td>
              <td>{onDetail ? <button className="trae-text-button" type="button" onClick={() => onDetail('all')}>{t('traeEnterprise.usage.detailAction')}</button> : null}</td>
            </tr>)}</tbody>
          </table>
          {modelRows.length === 0 ? <TraeTableEmpty hint={t('traeEnterprise.usage.detailEmpty')} /> : null}
        </div>
      </>}
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
  if (range !== 'custom') return { range: range as 'today' | '7d' | '30d' }
  if (dates.length !== 2) return { range: '30d' as const }
  // 后端按 UTC 自然日聚合；DatePicker 给的是本地日期，显式按日期部分
  // 构造 UTC 边界，避免东八区用户查询时整体偏移一天。
  const startAt = Date.UTC(dates[0].getFullYear(), dates[0].getMonth(), dates[0].getDate())
  const endAt = Date.UTC(dates[1].getFullYear(), dates[1].getMonth(), dates[1].getDate() + 1)
  return {
    range: 'custom' as const,
    start_at: startAt,
    end_at: Math.min(Date.now(), endAt),
  }
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
  const [memberContacts, setMemberContacts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const exportLockRef = useRef(false)
  const [error, setError] = useState<EnterpriseRequestError | null>(null)
  const [reload, setReload] = useState(0)
  const today = useMemo(() => startOfToday(), [])
  const minDate = useMemo(() => addDays(today, -89), [today])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    getAllEnterpriseMembers(
      { enterprise_id: context.id },
      { signal: controller.signal },
    ).then((members) => {
      if (!active) return
      // 中文：用量接口的筛选成员可能不含联系方式，按成员 ID 和用户 ID 合并成员目录中的脱敏手机号。
      const contacts: Record<string, string> = {}
      members.forEach((member) => {
        const contact = member.masked_contact?.trim()
        if (!contact) return
        contacts[member.id] = contact
        contacts[member.user_id] = contact
      })
      setMemberContacts(contacts)
    }).catch((reason: unknown) => {
      if (!active || controller.signal.aborted) return
      if (isAuthenticationFailure(reason)) handleError(reason)
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [context.id, handleError])

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

  async function exportDetail(): Promise<void> {
    // 中文：ref 锁避免用量明细导出按钮快速连点创建重复任务。
    if (exportLockRef.current || exporting || data.items.length === 0) return
    exportLockRef.current = true
    setExporting(true)
    try {
      // 中文：企业用量导出使用后端的成员聚合定义；模型和状态筛选仅属于明细查询接口，不能发送给导出接口。
      const filters: Record<string, string> = { range }
      if (range === 'custom' && customRange.length === 2) {
        const start = Date.UTC(customRange[0].getFullYear(), customRange[0].getMonth(), customRange[0].getDate())
        const end = Date.UTC(customRange[1].getFullYear(), customRange[1].getMonth(), customRange[1].getDate() + 1)
        filters.start_at = new Date(start).toISOString()
        filters.end_at = new Date(Math.min(Date.now(), end)).toISOString()
      }
      if (memberID !== 'all') filters.member_id = memberID
      const task = await createExportTask(
        {
          export_code: 'enterprise.usage',
          format: 'csv',
          context: { enterprise_id: context.id },
          filters,
          file_name: '用量明细',
        },
        { idempotencyKey: createExportIdempotencyKey('enterprise-usage') },
      )
      const completed = await waitForExportTask(task.id)
      const response = await downloadExportTask(completed.id)
      await saveExportResponse(response, completed.file_name, '用量明细')
      Toast.success(t('traeEnterprise.usage.downloadSuccess'))
    } catch (error) {
      if (isAuthenticationFailure(error)) {
        handleError(error)
      } else {
        Toast.error(getExportErrorMessage(error))
      }
    } finally {
      exportLockRef.current = false
      setExporting(false)
    }
  }

  const memberOptions = [{ value: 'all', label: t('traeEnterprise.usage.allMembers') }, ...data.filters.members.map((member) => {
    const memberID = member.id || member.member_id || member.user_id || ''
    const phone = member.phone || member.masked_phone || member.phone_masked || member.masked_contact || memberContacts[memberID] || (member.user_id ? memberContacts[member.user_id] : '')
    return { value: memberID, label: formatPersonOptionLabel(member.name, phone || member.email) }
  })]
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
      <button className="trae-icon-button trae-usage-detail-download" type="button" disabled={data.items.length === 0 || loading || exporting} aria-busy={exporting} aria-label={t('traeEnterprise.usage.download')} title={t('traeEnterprise.usage.download')} onClick={() => void exportDetail()}><IconDownload aria-hidden="true" /></button>
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
