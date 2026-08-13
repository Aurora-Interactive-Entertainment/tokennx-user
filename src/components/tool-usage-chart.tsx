import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { ToolUsageClients } from '@/api/tool-usage'
import { useResolvedTheme } from '@/theme'

echarts.use([BarChart, GridComponent, TooltipComponent, SVGRenderer])
const TOOL_COLORS = ['#ef794e', '#dc67a8', '#b9b865', '#7816ae', '#3e92d7', '#4eb5a7', '#d39c53', '#8d72d9'] as const

export function formatToolUsageTokens(value: number): string {
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(value >= 10_000_000_000_000 ? 0 : 1)}T`
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(value >= 10_000_000_000 ? 0 : 1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`
  return Math.round(value).toLocaleString()
}

function monthLabel(month: string, language: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber) return month
  if (language.startsWith('en')) return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, monthNumber - 1, 1)))
  return `${year}年${monthNumber}月`
}

export function ToolUsageClientsChart({ data }: { data: ToolUsageClients }) {
  const { t, i18n } = useTranslation()
  const chartRef = useRef<HTMLDivElement>(null)
  const theme = useResolvedTheme()
  const seriesData = useMemo(() => data.items.map((item) => {
    const values = new Map(item.monthly_usage.map((usage) => [usage.month, usage.total_tokens]))
    return { name: item.tool, values: data.months.map((month) => values.get(month) ?? 0) }
  }), [data.items, data.months])

  useEffect(() => {
    const node = chartRef.current
    if (!node || data.months.length === 0 || seriesData.length === 0) return undefined
    const chart = echarts.init(node, undefined, { renderer: 'svg' })
    const light = theme === 'light'
    chart.setOption({
      animationDuration: 420,
      grid: { left: 58, right: 20, top: 24, bottom: 54, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value: string | number) => formatToolUsageTokens(Number(value)) },
      xAxis: { type: 'category', data: data.months.map((month) => monthLabel(month, i18n.language)), axisLine: { lineStyle: { color: light ? 'rgba(23,24,27,.16)' : 'rgba(255,255,255,.14)' } }, axisTick: { show: false }, axisLabel: { color: light ? '#737984' : '#8b8b8b', fontSize: 12, margin: 16 } },
      yAxis: { type: 'value', min: 0, splitNumber: 4, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: light ? '#737984' : '#8b8b8b', fontSize: 12, formatter: (value: number) => formatToolUsageTokens(value) }, splitLine: { lineStyle: { color: light ? 'rgba(23,24,27,.08)' : 'rgba(255,255,255,.07)' } } },
      series: seriesData.map((item, index) => ({ name: item.name, type: 'bar', stack: 'tokens', barMaxWidth: 42, emphasis: { focus: 'series' }, itemStyle: { color: TOOL_COLORS[index % TOOL_COLORS.length] }, data: item.values })),
    })
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => chart.resize()) : null
    resizeObserver?.observe(node)
    return () => { resizeObserver?.disconnect(); chart.dispose() }
  }, [data.months, i18n.language, seriesData, theme])

  return <div className="apps-echart" ref={chartRef} role="img" aria-label={t('public.apps.chartLabel')} />
}
