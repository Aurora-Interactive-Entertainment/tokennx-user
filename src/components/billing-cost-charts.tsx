import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers'
import { useResolvedTheme } from '@/theme'
import type {
  BillingCostChart,
  BillingDailyApiKeyCost,
  BillingDailyBillingTypeCost,
  BillingDailyModelCost,
  BillingPageResult,
} from '@/api/billing'
import './billing-cost-charts.css'
import { getChartRenderer } from '@/components/chart-renderer'

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer, SVGRenderer])

type CostItems<T> = T[] | BillingPageResult<T> | null | undefined
type ChartInput<T> = BillingCostChart | CostItems<T>
type NormalizedChart = { labels: string[]; series: Array<{ name: string; data: number[] }> }

function numberValue(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatDateLabel(value: string | number, language: string): string {
  const date = typeof value === 'number'
    ? new Date(value)
    : (() => {
        const datePart = String(value || '').slice(0, 10)
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart)
        return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null
      })()
  if (!date || Number.isNaN(date.getTime())) return String(value || '--')
  if (language.toLowerCase().startsWith('zh')) return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`
  try {
    return new Intl.DateTimeFormat(language || 'zh-CN', { month: 'numeric', day: 'numeric', timeZone: 'UTC' }).format(date)
  } catch {
    return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
  }
}

function normalizeItems<T>(items: CostItems<T>): T[] {
  if (Array.isArray(items)) return items
  if (items && Array.isArray(items.items)) return items.items
  return []
}

function isBillingCostChart(value: unknown): value is BillingCostChart {
  if (!value || typeof value !== 'object') return false
  const chart = value as Partial<BillingCostChart>
  return Boolean(chart.xAxis && Array.isArray(chart.xAxis.data) && Array.isArray(chart.series))
}

function normalizeServerChart(chart: BillingCostChart, language: string): NormalizedChart {
  return {
    labels: chart.xAxis.data.map((value) => formatDateLabel(value, language)),
    series: chart.series.map((item) => ({
      name: item.name || '--',
      data: chart.xAxis.data.map((_, index) => numberValue(item.data?.[index])),
    })),
  }
}

// 中文：旧版接口按天返回明细数组，转换为与新版 ECharts 结构相同的多序列数据。
function normalizeLegacyChart<T>(items: CostItems<T>, date: (item: T) => string, name: (item: T) => string, cost: (item: T) => string, language: string): NormalizedChart {
  const rows = normalizeItems(items)
  const dates = Array.from(new Set(rows.map((item) => date(item) || '').filter(Boolean))).sort()
  const seriesMap = new Map<string, Map<string, number>>()
  rows.forEach((item) => {
    const dateValue = date(item) || ''
    if (!dateValue) return
    const seriesName = name(item) || '--'
    const values = seriesMap.get(seriesName) ?? new Map<string, number>()
    values.set(dateValue, (values.get(dateValue) ?? 0) + numberValue(cost(item)))
    seriesMap.set(seriesName, values)
  })
  return {
    labels: dates.map((value) => formatDateLabel(value, language)),
    series: Array.from(seriesMap, ([seriesName, values]) => ({ name: seriesName, data: dates.map((dateValue) => values.get(dateValue) ?? 0) })),
  }
}

function normalizeChart<T>(input: ChartInput<T>, legacy: { date: (item: T) => string; name: (item: T) => string; cost: (item: T) => string }, language: string): NormalizedChart {
  return isBillingCostChart(input) ? normalizeServerChart(input, language) : normalizeLegacyChart(input, legacy.date, legacy.name, legacy.cost, language)
}

// 中文：日期较多时只展示有限数量的刻度，避免横轴文本互相遮挡；数据点和 tooltip 仍保留完整日期。
function dateAxisInterval(labelCount: number): number {
  const maxVisibleLabels = 8
  if (labelCount <= maxVisibleLabels) return 0
  return Math.max(0, Math.ceil(labelCount / maxVisibleLabels) - 1)
}

function BillingCostChart({ title, chart, emptyLabel, chartType = 'line' }: { title: string; chart: NormalizedChart; emptyLabel: string; chartType?: 'line' | 'bar' }) {
  const theme = useResolvedTheme()
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = chartRef.current
    if (!node || chart.series.length === 0) return undefined
    const instance = echarts.init(node, undefined, { renderer: getChartRenderer() })
    const textColor = theme === 'dark' ? '#aeb4c0' : '#667085'
    const axisColor = theme === 'dark' ? '#3b414d' : '#e6e8ec'
    const palette = ['#1dc981', '#4c8bf5', '#f6a623', '#8b5cf6', '#ef5b8d', '#14b8a6']
    instance.setOption({
      animationDuration: 240,
      grid: { top: chart.series.length > 1 ? 38 : 18, right: 12, bottom: 38, left: 48 },
      legend: chart.series.length > 1 ? { top: 0, type: 'scroll', textStyle: { color: textColor, fontSize: 11 } } : undefined,
      tooltip: {
        trigger: 'axis',
        transitionDuration: 0,
        axisPointer: chartType === 'bar' ? { type: 'shadow', animation: false } : { type: 'cross', animation: false, lineStyle: { type: 'dashed', color: textColor } },
        valueFormatter: (value: unknown) => `¥${numberValue(value).toFixed(4)}`,
      },
      xAxis: {
        type: 'category',
        data: chart.labels,
        boundaryGap: false,
        axisLabel: {
          color: textColor,
          fontSize: 11,
          interval: dateAxisInterval(chart.labels.length),
          rotate: 0,
          hideOverlap: true,
        },
        axisLine: { lineStyle: { color: axisColor } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0,
        axisLabel: { color: textColor, fontSize: 11, formatter: (value: number) => `¥${value}` },
        splitLine: { lineStyle: { color: axisColor, type: 'dashed' } },
      },
      series: chart.series.map((item, index) => chartType === 'bar' ? ({
        name: item.name,
        type: 'bar',
        // 中文：同一日期的不同模型费用使用同一堆叠组，呈现累计柱状图。
        stack: 'Total',
        data: item.data,
        barMaxWidth: 38,
        itemStyle: { color: palette[index % palette.length], borderRadius: [3, 3, 0, 0] },
        // 中文：堆叠柱悬浮时不单独强调某个色块，只保留整列的坐标轴选中效果。
        emphasis: { focus: 'none' },
      }) : ({
        name: item.name,
        type: 'line',
        data: item.data,
        smooth: 0.18,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { width: 2, color: palette[index % palette.length] },
        itemStyle: { color: palette[index % palette.length] },
        emphasis: { focus: 'series' },
      })),
    })
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => instance.resize()) : null
    observer?.observe(node)
    return () => {
      observer?.disconnect()
      instance.dispose()
    }
  }, [chart, chartType, theme])

  return (
    <figure className="billing-cost-chart-card" aria-label={title}>
      <figcaption>{title}</figcaption>
      {chart.series.length > 0 ? <div className="billing-cost-chart" ref={chartRef} role="img" aria-label={title} /> : <div className="billing-cost-chart-empty">{emptyLabel}</div>}
    </figure>
  )
}

export function BillingCostCharts({ modelCosts, billingTypeCosts, apiKeyCosts }: {
  modelCosts: ChartInput<BillingDailyModelCost>
  billingTypeCosts: ChartInput<BillingDailyBillingTypeCost>
  apiKeyCosts: ChartInput<BillingDailyApiKeyCost>
}) {
  const { t, i18n } = useTranslation()
  const modelChart = useMemo(() => normalizeChart(modelCosts, { date: (item) => item.date, name: (item) => item.model_name || item.model_code || item.model_id || '--', cost: (item) => item.cost_yuan }, i18n.language), [modelCosts, i18n.language])
  const billingTypeChart = useMemo(() => normalizeChart(billingTypeCosts, { date: (item) => item.date, name: (item) => item.billing_type, cost: (item) => item.cost_yuan }, i18n.language), [billingTypeCosts, i18n.language])
  const apiKeyChart = useMemo(() => normalizeChart(apiKeyCosts, { date: (item) => item.date, name: (item) => item.api_key_name || item.api_key_id || '--', cost: (item) => item.cost_yuan }, i18n.language), [apiKeyCosts, i18n.language])
  const emptyLabel = t('console.billing.chartEmpty')

  return (
    <section className="billing-cost-charts" aria-label={t('console.billing.costCharts')}>
      <BillingCostChart title={t('console.billing.modelCostChart')} chart={modelChart} emptyLabel={emptyLabel} chartType="bar" />
      <BillingCostChart title={t('console.billing.billingTypeCostChart')} chart={billingTypeChart} emptyLabel={emptyLabel} />
      <BillingCostChart title={t('console.billing.apiKeyCostChart')} chart={apiKeyChart} emptyLabel={emptyLabel} />
    </section>
  )
}
