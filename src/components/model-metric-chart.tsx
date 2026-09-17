import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers'
import { useResolvedTheme } from '@/theme'
import type { UserModelMetricPoint, UserModelMetricSeries } from '@/api/user-models'
import { getActiveLocale } from '@/i18n'
import { getChartRenderer } from '@/components/chart-renderer'
import './model-metric-chart.css'

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer, SVGRenderer])

const METRIC_LINE_COLOR = '#72b8e8'

type MetricChartOptionInput = {
  labels: string[]
  values: Array<number | null>
  title: string
  unit: string
  unavailableLabel: string
  dark: boolean
  surface: string
}

export function MetricChartEmpty({ title, description }: { title: string; description: string }) {
  return <div className="model-detail-chart-empty" role="img" aria-label={title}><span>{description}</span></div>
}

/**
 * 后端时序按 UTC 日期切分，标尺沿用 UTC 以保持与服务端窗口一致；
 * 改用本地时区会在负偏移时区把标签整体偏移一天。
 */
export function metricAxisLabels(points: UserModelMetricPoint[]): string[] {
  return points.map((point) => new Date(point.timestamp).toISOString().slice(0, 10))
}

export function metricSeriesValues(points: UserModelMetricPoint[]): Array<number | null> {
  return points.map((point) => (point.value !== null && Number.isFinite(point.value) ? point.value : null))
}

function metricTooltipIndex(params: unknown): number {
  const first = (Array.isArray(params) ? params[0] : params) as { dataIndex?: number } | undefined
  return Number.isInteger(first?.dataIndex) ? first!.dataIndex! : -1
}

export function formatMetricValue(value: number): string {
  // 默认数字格式仅保留三位小数，会把有效的小吞吐量/延迟显示成 0。
  return new Intl.NumberFormat(getActiveLocale(), { maximumSignificantDigits: 15 }).format(value)
}

export function metricTooltipText(value: number | null, unit: string, unavailableLabel: string): string {
  if (value === null) return unavailableLabel
  // 提示固定四位小数，仅格式化展示，不改变绘图使用的原始数值。
  const formatted = new Intl.NumberFormat(getActiveLocale(), { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value)
  return unit ? `${formatted} ${unit}` : formatted
}

export function buildMetricChartOption({ labels, values, title, unit, unavailableLabel, dark, surface }: MetricChartOptionInput) {
  const textColor = dark ? '#aeb3bf' : '#68717d'
  const gridColor = dark ? 'rgba(255,255,255,.1)' : 'rgba(23,24,27,.1)'
  const pointerColor = dark ? '#aeb3bf' : '#68717d'
  return {
    animationDuration: 260,
    // ECharts 6 的边界约束同时容纳刻度和端点，避免窄图及大数值标签被裁切。
    grid: { left: 8, right: 12, top: 12, bottom: 8, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    tooltip: {
      trigger: 'axis',
      confine: true,
      // 关闭默认浮层过渡，避免鼠标快速移动时 tooltip 滞后。
      transitionDuration: 0,
      axisPointer: {
        type: 'line',
        snap: true,
        animation: false,
        lineStyle: { type: 'dashed', width: 1, color: pointerColor },
        label: { show: false },
      },
      backgroundColor: dark ? '#202124' : '#fff',
      borderColor: dark ? '#777b84' : '#d8dadd',
      borderWidth: 1,
      textStyle: { color: dark ? '#f2f4f8' : '#30343b', fontSize: 12 },
      formatter: (params: unknown) => {
        const index = metricTooltipIndex(params)
        if (index < 0 || index >= labels.length) return ''
        const text = metricTooltipText(values[index] ?? null, unit, unavailableLabel)
        // 单位和标题可能来自接口或翻译，插入 HTML 浮层前统一转义。
        const escape = echarts.format.encodeHTML
        return `<div>${escape(labels[index])} UTC</div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><i style="width:8px;height:8px;border-radius:50%;background:${METRIC_LINE_COLOR}"></i><span>${escape(title)}</span><strong>${escape(text)}</strong></div>`
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: true,
      data: labels,
      axisLine: { lineStyle: { color: gridColor } },
      axisTick: { show: false },
      axisLabel: { color: textColor, fontSize: 10, hideOverlap: true, formatter: (value: string) => value.slice(-5) },
    },
    yAxis: {
      type: 'value',
      // 两项均为非负指标；统一从 0 起并留顶部余量，避免截断坐标夸大少量样本的变化。
      min: 0,
      boundaryGap: [0, '12%'],
      splitNumber: 3,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: textColor, fontSize: 10, formatter: (value: number) => formatMetricValue(value) },
      splitLine: { lineStyle: { color: gridColor, type: 'dashed' } },
    },
    series: [{
      type: 'line',
      name: title,
      // 缺数据的日期按 0 绘制，提示仍读取原始 values，区分缺失值与真实零值。
      data: values.map((value) => value ?? 0),
      connectNulls: false,
      smooth: false,
      // 仅七个日桶，所有日期的点都应可见，不能随日期刻度抽稀而隐藏。
      showAllSymbol: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { width: 1.5, color: METRIC_LINE_COLOR },
      itemStyle: { color: surface, borderColor: METRIC_LINE_COLOR, borderWidth: 1.5 },
      emphasis: { scale: false },
    }],
  }
}

export function ModelMetricChart({ title, points, unit, unavailableLabel, statistic }: {
  title: string
  points: UserModelMetricPoint[]
  unit: string
  unavailableLabel: string
  statistic?: string
}) {
  const theme = useResolvedTheme()
  const chartRef = useRef<HTMLDivElement>(null)
  const labels = useMemo(() => metricAxisLabels(points), [points])
  const values = useMemo(() => metricSeriesValues(points), [points])
  const hasPoints = points.length > 0

  useEffect(() => {
    const node = chartRef.current
    if (!node || !hasPoints) return undefined
    const chart = echarts.init(node, undefined, { renderer: getChartRenderer() })
    const dark = theme === 'dark'
    const card = node.closest('.model-detail-chart-card')
    const surface = (card ? getComputedStyle(card).backgroundColor : '') || (dark ? '#202124' : '#fff')
    const tooltipTitle = statistic ? `${title} · ${statistic.toUpperCase()}` : title
    chart.setOption(buildMetricChartOption({ labels, values, title: tooltipTitle, unit, unavailableLabel, dark, surface }))
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => chart.resize()) : null
    observer?.observe(node)
    return () => {
      observer?.disconnect()
      chart.dispose()
    }
  }, [hasPoints, labels, unavailableLabel, theme, title, unit, values, statistic])

  if (!hasPoints) return <MetricChartEmpty title={title} description={unavailableLabel} />
  return <div className="model-metric-chart" ref={chartRef} role="img" aria-label={title} />
}

export function ModelMetricChartCard({ label, title, series, unit }: {
  label: string
  title: string
  series?: UserModelMetricSeries
  unit: string
}) {
  const { t } = useTranslation()
  const points = series?.points ?? []
  const statistic = series?.statistic?.trim()
  const statisticHint = statistic?.toLowerCase() === 'p50' ? t('console.modelDetail.metricP50')
    : statistic?.toLowerCase() === 'p95' ? t('console.modelDetail.metricP95') : statistic
  const displayUnit = series?.unit ?? unit
  return (
    <figure className="model-detail-chart-card">
      <figcaption><strong>{label}{statistic ? <small className="model-metric-statistic" title={statisticHint}>{statistic.toUpperCase()}</small> : null}</strong><span>{displayUnit}</span></figcaption>
      <ModelMetricChart title={title} points={points} unit={displayUnit} statistic={statistic} unavailableLabel={t('console.modelDetail.noData')} />
    </figure>
  )
}
