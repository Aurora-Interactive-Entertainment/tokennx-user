import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { ToolUsageClients } from '@/api/tool-usage'
import { MODEL_CHART_COLORS } from '@/components/chart-colors'
import { useResolvedTheme } from '@/theme'

echarts.use([BarChart, GridComponent, TooltipComponent, SVGRenderer])

export function formatToolUsageTokens(value: number): string {
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(value >= 10_000_000_000_000 ? 0 : 1)}T`
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(value >= 10_000_000_000 ? 0 : 1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`
  return Math.round(value).toLocaleString()
}

function weekLabel(week: string, language: string): string {
  const [year, month, day] = week.split('-').map(Number)
  if (!year || !month || !day) return week
  return new Intl.DateTimeFormat(language.startsWith('en') ? 'en-US' : 'zh-CN', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function ToolUsageClientsChart({ data }: { data: ToolUsageClients }) {
  const { t, i18n } = useTranslation()
  const chartRef = useRef<HTMLDivElement>(null)
  const theme = useResolvedTheme()
  const seriesData = useMemo(() => data.items.map((item) => {
    const values = new Map(item.weekly_usage.map((usage) => [new Date(usage.week_start).toISOString().slice(0, 10), usage.total_tokens]))
    return { name: item.name, values: data.weeks.map((week) => values.get(week) ?? 0) }
  }), [data.items, data.weeks])

  useEffect(() => {
    const node = chartRef.current
    if (!node || data.weeks.length === 0 || seriesData.length === 0) return undefined
    const chart = echarts.init(node, undefined, { renderer: 'svg' })
    const light = theme === 'light'
    const responsiveOption = () => {
      const mobile = node.clientWidth <= 560
      const labelInterval = Math.max(0, Math.ceil(data.weeks.length / (mobile ? 5 : 8)) - 1)
      return {
        grid: mobile
          ? { left: 8, right: 8, top: 18, bottom: 38, containLabel: true }
          : { left: 72, right: 12, top: 18, bottom: 58 },
        xAxis: {
          data: data.weeks.map((week) => weekLabel(week, i18n.language)),
          axisLabel: {
            color: light ? '#737984' : '#8b8b8b',
            fontSize: mobile ? 10 : 12,
            interval: labelInterval,
            margin: mobile ? 12 : 18,
            showMinLabel: true,
            showMaxLabel: true,
          },
        },
      }
    }
    const initialResponsiveOption = responsiveOption()
    chart.setOption({
      animationDuration: 420,
      grid: initialResponsiveOption.grid,
      tooltip: { trigger: 'axis', confine: true, axisPointer: { type: 'shadow' }, valueFormatter: (value: string | number) => formatToolUsageTokens(Number(value)) },
      xAxis: { type: 'category', axisLine: { lineStyle: { color: light ? 'rgba(23,24,27,.16)' : 'rgba(255,255,255,.14)' } }, axisTick: { show: false }, ...initialResponsiveOption.xAxis },
      yAxis: {
        type: 'value',
        min: 0,
        splitNumber: 4,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: light ? '#737984' : '#8b8b8b', fontSize: 12, formatter: (value: number) => formatToolUsageTokens(value) },
        splitLine: { lineStyle: { color: light ? 'rgba(23,24,27,.08)' : 'rgba(255,255,255,.07)' } },
      },
      series: seriesData.map((item, index) => ({ name: item.name, type: 'bar', stack: 'tokens', barMaxWidth: 42, emphasis: { focus: 'series' }, itemStyle: { color: MODEL_CHART_COLORS[index % MODEL_CHART_COLORS.length] }, data: item.values })),
    })
    let mobile = node.clientWidth <= 560
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      chart.resize()
      const nextMobile = node.clientWidth <= 560
      if (nextMobile !== mobile) {
        mobile = nextMobile
        chart.setOption(responsiveOption())
      }
    }) : null
    resizeObserver?.observe(node)
    return () => { resizeObserver?.disconnect(); chart.dispose() }
  }, [data.weeks, i18n.language, seriesData, theme])

  return <div className="apps-echart" ref={chartRef} role="img" aria-label={t('public.apps.chartLabel')} />
}
