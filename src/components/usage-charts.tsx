import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { UsageDistributionItem, UsageTrendBucket, UsageTrendGranularity, UsageTrendMetric as StatisticsTrendMetric } from '@/api/usage-statistics'
import { formatCurrency, formatYuanExact } from '@/utils/format'
import { useResolvedTheme } from '@/theme'
import i18n from '@/i18n'

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, SVGRenderer])

const DISTRIBUTION_ROW_HEIGHT = 36
const DISTRIBUTION_MIN_HEIGHT = 228
const TREND_COLORS = {
  requests: '#83a2ff',
  cost: '#65b994',
  tokens: '#d9b66d',
} as const

// 中文：图表坐标轴/标签/网格线颜色随主题切换，避免亮色模式下沿用近白色导致文字不可见。
type ChartPalette = {
  axisLabel: string
  axisLabelSoft: string
  axisLine: string
  splitLine: string
  categoryLabel: string
  seriesLabel: string
  symbolBorder: string
}

const CHART_PALETTES: Record<'light' | 'dark', ChartPalette> = {
  dark: {
    axisLabel: 'rgba(231,237,248,.55)',
    axisLabelSoft: 'rgba(231,237,248,.5)',
    axisLine: 'rgba(255,255,255,.14)',
    splitLine: 'rgba(255,255,255,.06)',
    categoryLabel: '#e7edf8',
    seriesLabel: 'rgba(231,237,248,.7)',
    symbolBorder: '#111923',
  },
  light: {
    axisLabel: 'rgba(48,52,59,.62)',
    axisLabelSoft: 'rgba(48,52,59,.55)',
    axisLine: 'rgba(23,24,27,.16)',
    splitLine: 'rgba(23,24,27,.08)',
    categoryLabel: '#30343b',
    seriesLabel: 'rgba(48,52,59,.75)',
    symbolBorder: '#ffffff',
  },
}

export type UsageTrendMetric = StatisticsTrendMetric
export type UsageDistributionTone = 'model' | 'key'

type UsageTrendChartProps = {
  data: UsageTrendBucket[]
  metric: UsageTrendMetric
  canViewBilling: boolean
  granularity?: UsageTrendGranularity
}

type UsageDistributionChartProps = {
  data: UsageDistributionItem[]
  tone: UsageDistributionTone
  canViewBilling: boolean
  metric?: UsageTrendMetric
}

function numberLabel(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString(i18n.language.startsWith('en') ? 'en-US' : 'zh-CN') : '--'
}

function costValue(value: string, canViewBilling: boolean): number {
  if (!canViewBilling) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function trendValue(point: UsageTrendBucket, metric: UsageTrendMetric, canViewBilling: boolean): number {
  if (metric === 'requests') return point.request_count ?? 0
  if (metric === 'tokens') return (point.input_tokens ?? 0) + (point.output_tokens ?? 0) + (point.cached_tokens ?? 0)
  return costValue(point.cost_yuan ?? '', canViewBilling)
}

function trendValueLabel(value: number, metric: UsageTrendMetric, canViewBilling: boolean): string {
  if (metric === 'cost') return canViewBilling ? formatCurrency(value) : '--'
  return numberLabel(value)
}

function trendTooltipLabel(point: UsageTrendBucket | undefined, value: number, metric: UsageTrendMetric, canViewBilling: boolean): string {
  if (metric === 'cost') return canViewBilling && point ? formatYuanExact(point.cost_yuan ?? '0') : '--'
  return trendValueLabel(value, metric, canViewBilling)
}

function trendAxisLabel(value: number, metric: UsageTrendMetric, canViewBilling: boolean): string {
  if (metric === 'cost') return canViewBilling ? formatCurrency(value) : '--'
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}m`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(Math.round(value))
}

function EmptyChart({ title, description }: { title: string; description: string }) {
  return <div className="usage-chart-empty"><strong>{title}</strong><span>{description}</span></div>
}

function formatBucketLabel(timestamp: number, granularity: UsageTrendGranularity): string {
  const date = new Date(timestamp)
  if (granularity === 'hour') return `${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')} ${String(date.getUTCHours()).padStart(2, '0')}:00`
  if (granularity === 'month') return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function UsageTrendChart({ data, metric, canViewBilling, granularity = 'day' }: UsageTrendChartProps) {
  const { t } = useTranslation()
  const chartRef = useRef<HTMLDivElement>(null)
  const theme = useResolvedTheme()
  const chartData = useMemo(() => data.map((point) => ({
    label: formatBucketLabel(point.bucket_start, granularity),
    value: trendValue(point, metric, canViewBilling),
    rawValue: point.cost_yuan,
  })), [canViewBilling, data, granularity, metric])

  useEffect(() => {
    const node = chartRef.current
    if (!node || chartData.length === 0) return undefined
    const chart = echarts.init(node, undefined, { renderer: 'svg' })
    const color = TREND_COLORS[metric]
    const palette = CHART_PALETTES[theme]
    chart.setOption({
      animationDuration: 420,
      grid: { left: 46, right: 24, top: 20, bottom: 34, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color, opacity: 0.45 } },
        formatter: (params: unknown) => {
          const item = (Array.isArray(params) ? params[0] : params) as { axisValue?: string | number; dataIndex?: number; value?: string | number } | undefined
          const dataIndex = typeof item?.dataIndex === 'number' ? item.dataIndex : -1
          const point = data[dataIndex]
          const value = Number(item?.value)
          const label = metric === 'requests' ? t('console.usage.requests') : metric === 'cost' ? t('console.usage.cost') : t('console.usage.tokens')
          return `${item?.axisValue ?? ''}<br/>${label}：${trendTooltipLabel(point, value, metric, canViewBilling)}`
        },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: chartData.map((point) => point.label),
        axisLine: { lineStyle: { color: palette.axisLine } },
        axisTick: { show: false },
        axisLabel: { color: palette.axisLabel, fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        min: 0,
        splitNumber: 4,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: palette.axisLabel, fontSize: 11, formatter: (value: number) => trendAxisLabel(value, metric, canViewBilling) },
        splitLine: { lineStyle: { color: [palette.splitLine], type: 'dashed' } },
      },
      series: [{
        type: 'line',
        name: metric === 'requests' ? t('console.usage.requests') : metric === 'cost' ? t('console.usage.cost') : t('console.usage.tokens'),
        smooth: true,
        showSymbol: chartData.length <= 14,
        symbol: 'circle',
        symbolSize: 7,
        data: chartData.map((point) => point.value),
        lineStyle: { width: 2, color },
        itemStyle: { color, borderColor: palette.symbolBorder, borderWidth: 2 },
        areaStyle: { color, opacity: 0.12 },
      }],
    })
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => chart.resize()) : null
    resizeObserver?.observe(node)
    return () => {
      resizeObserver?.disconnect()
      chart.dispose()
    }
  }, [canViewBilling, chartData, metric, t, theme])

  if (chartData.length === 0) return <EmptyChart title={t('console.usage.noData')} description={t('console.usage.noDataHint')} />
  return <div className="usage-echart usage-trend-echart" ref={chartRef} role="img" aria-label={t('console.usage.trend')} />
}

function distributionValue(item: UsageDistributionItem, metric: UsageTrendMetric): number {
  if (metric === 'cost') return Number(item.cost_yuan ?? 0) || 0
  if (metric === 'tokens') return (item.input_tokens ?? 0) + (item.output_tokens ?? 0) + (item.cached_tokens ?? 0)
  return item.request_count ?? 0
}

export function UsageDistributionChart({ data, tone, canViewBilling, metric = 'requests' }: UsageDistributionChartProps) {
  const { t } = useTranslation()
  const chartRef = useRef<HTMLDivElement>(null)
  const theme = useResolvedTheme()
  const chartData = useMemo(() => data.map((item) => ({
    name: tone === 'model'
      ? t('console.common.modelWithAlias', { name: item.name || t('console.usage.unnamedModel'), alias: item.alias?.trim() || t('console.usage.noAlias') })
      : item.name?.trim() || t('console.common.unknown'),
    value: distributionValue(item, metric),
  })), [data, metric, t, tone])
  const height = Math.max(DISTRIBUTION_MIN_HEIGHT, chartData.length * DISTRIBUTION_ROW_HEIGHT)

  useEffect(() => {
    const node = chartRef.current
    if (!node || chartData.length === 0) return undefined
    const chart = echarts.init(node, undefined, { renderer: 'svg' })
    const color = tone === 'model' ? '#d9b66d' : '#83a2ff'
    const palette = CHART_PALETTES[theme]
    chart.setOption({
      animationDuration: 420,
      grid: { left: 16, right: 28, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (value: string | number) => metric === 'cost' ? (canViewBilling ? formatCurrency(Number(value)) : '--') : numberLabel(Number(value)),
      },
      xAxis: {
        type: 'value',
        min: 0,
        splitNumber: 4,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: palette.axisLabelSoft, fontSize: 10 },
        splitLine: { lineStyle: { color: [palette.splitLine], type: 'dashed' } },
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: chartData.map((item) => item.name),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: palette.categoryLabel, fontSize: 11, width: 112, overflow: 'truncate' },
      },
      series: [{
        type: 'bar',
        name: metric === 'requests' ? t('console.usage.requests') : metric === 'tokens' ? t('console.usage.tokens') : t('console.usage.cost'),
        barMaxWidth: 14,
        data: chartData.map((item) => item.value),
        itemStyle: { color, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: palette.seriesLabel, fontSize: 11, formatter: (params: { value?: number }) => metric === 'cost' ? (canViewBilling ? formatCurrency(Number(params.value ?? 0)) : '--') : numberLabel(Number(params.value ?? 0)) },
      }],
    })
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => chart.resize()) : null
    resizeObserver?.observe(node)
    return () => {
      resizeObserver?.disconnect()
      chart.dispose()
    }
  }, [canViewBilling, chartData, metric, t, tone, theme])

  if (chartData.length === 0) return <EmptyChart title={t('console.usage.noData')} description={t('console.usage.noDataHint')} />
  return <div className="usage-echart usage-distribution-echart" data-row-count={chartData.length} style={{ height }} ref={chartRef} role="img" aria-label={tone === 'model' ? t('console.usage.modelDistribution') : t('console.usage.keyDistribution')} />
}
