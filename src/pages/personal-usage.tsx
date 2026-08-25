import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import DatePicker from '@douyinfe/semi-ui/lib/es/datePicker'
import Tooltip from '@douyinfe/semi-ui/lib/es/tooltip'
import { IconDownload, IconInfoCircle } from '@douyinfe/semi-icons'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { useResolvedTheme } from '@/theme'
import { TraePagination } from '@/components/trae-pagination'
import { exportEnterpriseCsv } from './enterprise-console-shared'
import '@/trae-enterprise.css'
import './personal-usage.css'

echarts.use([LineChart, GridComponent, TooltipComponent, SVGRenderer])

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function formatDate(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
}

function formatAxisDate(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
}

function getDates(range: Date[]) {
  const start = range[0] ?? addDays(startOfToday(), -30)
  const end = range[1] ?? startOfToday()
  const dates: Date[] = []
  for (let date = new Date(start); date <= end; date = addDays(date, 1)) dates.push(new Date(date))
  return dates
}

type UsageSeries = { name: string; color: string }

function PersonalUsageTrendChart({ dateRange }: { dateRange: Date[] }) {
  const { t } = useTranslation()
  const theme = useResolvedTheme()
  const chartRef = useRef<HTMLDivElement>(null)
  const dates = useMemo(() => getDates(dateRange), [dateRange])
  const seriesMeta = useMemo<UsageSeries[]>(() => [
    { name: t('console.personalUsage.generated'), color: '#24c98b' },
    { name: t('console.personalUsage.accepted'), color: '#a998ff' },
  ], [t])

  useEffect(() => {
    const node = chartRef.current
    if (!node || dates.length === 0) return undefined
    const chart = echarts.init(node, undefined, { renderer: 'svg' })
    const labels = dates.map(formatDate)
    const peakIndexes = new Set([Math.max(0, Math.floor(dates.length * 0.35)), Math.max(0, dates.length - 1)])
    // 保留截图中的峰值形态，后续接入个人用量接口时只替换这两组序列数据。
    const generated = dates.map((_, index) => peakIndexes.has(index) ? (index === dates.length - 1 ? 27200 : 7200) : 0)
    const accepted = generated.map((value) => value ? Math.round(value * 0.35) : 0)
    const values = [generated, accepted]
    const axisStep = Math.max(1, Math.ceil(labels.length / 12))
    const isDark = theme === 'dark'
    const textColor = isDark ? '#aeb3bf' : '#5d6470'
    const gridColor = isDark ? 'rgba(255,255,255,.1)' : 'rgba(23,24,27,.1)'
    const tooltipBackground = isDark ? '#202124' : '#ffffff'
    const tooltipBorder = isDark ? '#777b84' : '#d8dadd'
    const surface = getComputedStyle(node.closest('.personal-usage-chart-panel') ?? node).backgroundColor || (isDark ? '#202124' : '#ffffff')
    chart.setOption({
      animationDuration: 320,
      grid: { left: 48, right: 20, top: 22, bottom: 42, containLabel: true },
      tooltip: {
        trigger: 'axis', confine: true, backgroundColor: tooltipBackground, borderColor: tooltipBorder, borderWidth: 1, padding: [10, 12],
        textStyle: { color: isDark ? '#f2f4f8' : '#30343b', fontSize: 12 },
        axisPointer: { type: 'cross', lineStyle: { color: isDark ? '#a9aab2' : '#737a86', type: 'dashed', width: 1 }, crossStyle: { color: isDark ? '#a9aab2' : '#737a86', type: 'dashed', width: 1 }, label: { show: true, color: '#fff', backgroundColor: '#596bab' } },
        formatter: (params: unknown) => {
          const items = (Array.isArray(params) ? params : [params]) as Array<{ dataIndex?: number }>
          const index = items[0]?.dataIndex ?? 0
          return `<div style="font-size:12px;line-height:24px"><div style="margin-bottom:3px">${labels[index] ?? ''}</div>${seriesMeta.map((series, seriesIndex) => `<div style="display:flex;align-items:center;gap:8px;min-width:180px"><span style="width:8px;height:8px;border-radius:50%;background:${series.color};display:inline-block"></span><span style="flex:1">${series.name}</span><strong>${values[seriesIndex][index] ?? 0}</strong></div>`).join('')}</div>`
        },
      },
      xAxis: { type: 'category', boundaryGap: false, data: labels, axisLine: { lineStyle: { color: gridColor } }, axisTick: { show: false }, axisLabel: { color: textColor, fontSize: 11, interval: 0, hideOverlap: true, formatter: (_value: string, index: number) => index === 0 || index === labels.length - 1 || index % axisStep === 0 ? labels[index] : '' } },
      yAxis: { type: 'value', min: 0, max: 30000, splitNumber: 6, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: textColor, fontSize: 11 }, splitLine: { lineStyle: { color: gridColor } } },
      series: seriesMeta.map((series, index) => ({ type: 'line', name: series.name, data: values[index], symbol: 'circle', symbolSize: 8, showSymbol: true, smooth: false, lineStyle: { width: 1.1, color: series.color }, itemStyle: { color: surface, borderColor: series.color, borderWidth: 1.2 }, emphasis: { scale: true, itemStyle: { color: surface, borderColor: series.color, borderWidth: 1.5 } } })),
    })
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => chart.resize()) : null
    resizeObserver?.observe(node)
    return () => { resizeObserver?.disconnect(); chart.dispose() }
  }, [dates, seriesMeta, theme])

  return <div className="personal-usage-line-wrap"><div className="personal-usage-line-chart" ref={chartRef} role="img" aria-label={t('console.personalUsage.trend')} /><div className="personal-usage-chart-legend" aria-label={t('console.personalUsage.legend')}>{seriesMeta.map((series) => <span key={series.name}><i style={{ backgroundColor: series.color }} />{series.name}</span>)}</div></div>
}

function PersonalUsageDatePicker({ value, onChange, compact = false }: { value: Date[]; onChange: (value: Date[]) => void; compact?: boolean }) {
  const { t } = useTranslation()
  const today = useMemo(() => startOfToday(), [])
  const minDate = useMemo(() => addDays(today, -90), [today])
  const presets = useMemo(() => [
    { text: t('traeEnterprise.analysis.datePresets.last7'), start: addDays(today, -7), end: today },
    { text: t('traeEnterprise.analysis.datePresets.last30'), start: addDays(today, -30), end: today },
    { text: t('traeEnterprise.analysis.datePresets.last90'), start: minDate, end: today },
  ], [minDate, t, today])
  // 个人用量页沿用 Semi DatePicker，仅在本页覆盖双月布局与最近 90 天限制。
  return <DatePicker className={`trae-date-picker personal-usage-date-picker${compact ? ' personal-usage-cue-date-picker' : ''}`} dropdownClassName={`trae-date-picker-dropdown personal-usage-date-dropdown${compact ? ' personal-usage-cue-date-dropdown' : ''}`} type="dateRange" value={value} format="yyyy-MM-dd" rangeSeparator=" ~ " presets={compact ? undefined : presets} presetPosition={compact ? undefined : 'left'} needConfirm={false} showClear={false} disabledDate={(date) => !date || date < minDate || date > today} onChange={(nextValue) => { if (!Array.isArray(nextValue)) return; const dates = nextValue.filter((item): item is Date => item instanceof Date); if (dates.length === 2 && dates.every((date) => date >= minDate && date <= today)) onChange(dates) }} />
}

type ModelUsageRow = { name: string; amount: string }
const modelRows: ModelUsageRow[] = [
  { name: 'Qwen3.8-Max', amount: '￥97.062' },
  { name: 'Doubao-Seed-Evolving', amount: '￥0.000' },
  { name: 'Doubao-Seed-2.1-Pro', amount: '￥0.000' },
  { name: 'Doubao-Seed-2.1-Turbo', amount: '￥0.000' },
  { name: 'Doubao-Seed-2.0-Code', amount: '￥0.000' },
  { name: 'Kimi-K2.7-Code', amount: '￥0.000' },
]

type CueUsageRow = { id: string; date: string; client: string; model: string; session: string; source: string; tokens: string; calls: string }
const cueUsageRows: CueUsageRow[] = [
  { id: 'cue-1', date: '2026/08/25 10:22:44', client: 'IDE', model: 'Qwen3.8-Max', session: '6a8cfc69051ac33138d6c3e8', source: '基础会话', tokens: '1,001,450', calls: '47' },
  { id: 'cue-2', date: '2026/08/24 17:35:47', client: 'IDE', model: 'Qwen3.8-Max', session: '6a8c0a71f27389fa7310804d', source: '基础会话', tokens: '265,255', calls: '8' },
  { id: 'cue-3', date: '2026/08/24 17:29:01', client: 'IDE', model: 'Qwen3.8-Max', session: '6a8c09f2f27389fa7310804c', source: '基础会话', tokens: '925,222', calls: '24' },
  { id: 'cue-4', date: '2026/08/24 17:23:34', client: 'IDE', model: 'Qwen3.8-Max', session: '6a8c08f2f27389fa7310804b', source: '基础会话', tokens: '248,612', calls: '7' },
  { id: 'cue-5', date: '2026/08/24 17:12:09', client: 'IDE', model: 'Qwen3.8-Max', session: '6a8c07f2f27389fa7310804a', source: '基础会话', tokens: '675,982', calls: '19' },
  { id: 'cue-6', date: '2026/08/24 17:08:17', client: 'IDE', model: 'Qwen3.8-Max', session: '6a8c06f2f27389fa73108049', source: '基础会话', tokens: '634,272', calls: '10' },
  { id: 'cue-7', date: '2026/08/24 16:11:16', client: 'IDE', model: 'Qwen3.8-Max', session: '6a8c05f2f27389fa73108048', source: '基础会话', tokens: '3,066,187', calls: '53' },
  { id: 'cue-8', date: '2026/08/24 14:49:38', client: 'IDE', model: 'Qwen3.8-Max', session: '6a8bfe99f27389fa73108047', source: '基础会话', tokens: '3,231,503', calls: '73' },
  { id: 'cue-9', date: '2026/08/24 13:36:02', client: 'IDE', model: 'Qwen3.8-Max', session: '6a8bd801f27389fa73108046', source: '基础会话', tokens: '4,980,476', calls: '99' },
  { id: 'cue-10', date: '2026/08/23 12:10:22', client: 'IDE', model: 'CUE', session: '-', source: '基础会话', tokens: '7,294', calls: '1' },
]

type CueRange = 'today' | '7d' | '30d' | 'custom'

function parseCueDate(value: string) {
  const [date, time = '00:00:00'] = value.split(' ')
  const [year, month, day] = date.split('/').map(Number)
  const [hours, minutes, seconds] = time.split(':').map(Number)
  return new Date(year, month - 1, day, hours, minutes, seconds)
}

function PersonalUsageCueSection() {
  const { t } = useTranslation()
  const today = useMemo(() => startOfToday(), [])
  const minDate = useMemo(() => addDays(today, -90), [today])
  const [range, setRange] = useState<CueRange>('today')
  const [customRange, setCustomRange] = useState<Date[]>(() => [addDays(today, -6), today])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const selectedRange = range === 'today' ? [today, today] : range === '7d' ? [addDays(today, -6), today] : range === '30d' ? [addDays(today, -29), today] : customRange
  const visibleRows = useMemo(() => {
    const [start, end] = selectedRange
    return cueUsageRows.filter((row) => {
      const date = parseCueDate(row.date)
      return date >= start && date <= addDays(end, 1)
    })
  }, [selectedRange])
  const pagedRows = useMemo(() => visibleRows.slice((page - 1) * pageSize, page * pageSize), [page, pageSize, visibleRows])

  function handleCustomRange(nextValue: Date[]) {
    if (nextValue.length === 2 && nextValue.every((date) => date >= minDate && date <= today)) {
      setCustomRange(nextValue)
      setRange('custom')
      setPage(1)
    }
  }

  function setCueRange(nextRange: CueRange) {
    setRange(nextRange)
    setPage(1)
  }

  function exportRows() {
    exportEnterpriseCsv('personal-cue-usage.csv', [t('console.personalUsage.cue.table.date'), t('console.personalUsage.cue.table.client'), t('console.personalUsage.cue.table.model'), t('console.personalUsage.cue.table.session'), t('console.personalUsage.cue.table.source'), t('console.personalUsage.cue.table.tokens'), t('console.personalUsage.cue.table.calls')], visibleRows.map((row) => [row.date, row.client, row.model, row.session, row.source, row.tokens, row.calls]))
  }

  return <section className="personal-usage-cue" aria-label={t('console.personalUsage.cue.rangeLabel')}><div className="personal-usage-cue-toolbar"><div className="personal-usage-cue-range-buttons" role="group" aria-label={t('console.personalUsage.cue.rangeLabel')}>{([['today', 'today'], ['7d', 'last7'], ['30d', 'last30'], ['custom', 'custom']] as const).map(([value, label]) => <button key={value} className={range === value ? 'is-active' : ''} type="button" onClick={() => setCueRange(value)}>{t(`console.personalUsage.cue.${label}`)}</button>)}</div>{range === 'custom' ? <PersonalUsageDatePicker compact value={customRange} onChange={handleCustomRange} /> : null}<button className="personal-usage-cue-download" type="button" aria-label={t('console.personalUsage.cue.download')} title={t('console.personalUsage.cue.download')} onClick={exportRows}><IconDownload aria-hidden="true" /></button></div><div className="personal-usage-cue-table-wrap"><table className="personal-usage-cue-table"><thead><tr><th>{t('console.personalUsage.cue.table.date')}</th><th>{t('console.personalUsage.cue.table.client')}</th><th>{t('console.personalUsage.cue.table.model')}</th><th>{t('console.personalUsage.cue.table.session')}</th><th>{t('console.personalUsage.cue.table.source')}</th><th>{t('console.personalUsage.cue.table.tokens')}</th><th>{t('console.personalUsage.cue.table.calls')}</th></tr></thead><tbody>{pagedRows.map((row) => <tr key={row.id}><td>{row.date}</td><td>{row.client}</td><td>{row.model}</td><td>{row.session}</td><td>{row.source}</td><td>{row.tokens}</td><td>{row.calls}</td></tr>)}</tbody></table>{visibleRows.length === 0 ? <div className="personal-usage-cue-empty">{t('console.personalUsage.cue.empty')}</div> : null}</div><TraePagination ariaLabel={t('console.personalUsage.cue.rangeLabel')} total={visibleRows.length} currentPage={page} pageSize={pageSize} onChange={(nextPage, nextPageSize) => { setPage(nextPage); setPageSize(nextPageSize); }} /></section>
}

function UsageManagementTab() {
  const { t } = useTranslation()
  return <section className="personal-usage-management" aria-labelledby="personal-usage-model-title"><h2 id="personal-usage-model-title">{t('console.personalUsage.models')}</h2><div className="personal-usage-model-card"><div className="personal-usage-model-total"><span>{t('console.personalUsage.total')}</span><strong>￥97.062 <small>| ￥100 <Tooltip className="app-info-tooltip" content={t('console.personalUsage.limitHint')}><IconInfoCircle className="app-info-icon" aria-hidden="true" /></Tooltip></small></strong></div><div className="personal-usage-model-list">{modelRows.map((row) => <div className="personal-usage-model-row" key={row.name}><span>{row.name}</span><strong>{row.amount}</strong></div>)}</div></div><PersonalUsageCueSection /></section>
}

export function PersonalUsagePage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'board' | 'management'>('board')
  const [dateRange, setDateRange] = useState<Date[]>(() => { const today = startOfToday(); return [addDays(today, -30), today] })
  return <div className="trae-page personal-usage-page"><header className="trae-page-heading"><h1>{t('console.personalUsage.title')} <small>{t('console.personalUsage.resetHint')}</small></h1></header><div className="trae-tabs personal-usage-tabs" role="tablist">{(['board', 'management'] as const).map((item) => <button key={item} className={tab === item ? 'is-active' : ''} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{t(`console.personalUsage.tabs.${item}`)}</button>)}</div>{tab === 'board' ? <section className="personal-usage-board" aria-labelledby="personal-usage-trend-title"><div className="personal-usage-board-heading"><h2 id="personal-usage-trend-title">{t('console.personalUsage.trend')} <Tooltip className="app-info-tooltip" content={t('console.personalUsage.trendHint')}><IconInfoCircle className="app-info-icon" aria-hidden="true" /></Tooltip></h2><PersonalUsageDatePicker value={dateRange} onChange={setDateRange} /></div><div className="personal-usage-chart-panel"><PersonalUsageTrendChart dateRange={dateRange} /></div></section> : <UsageManagementTab />}</div>
}
