import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { ToolUsageClients } from '@/api/tool-usage'
import { MODEL_CHART_COLORS } from '@/components/chart-colors'
import { ChartHoverLegend } from '@/components/chart-hover-legend'
import { useResolvedTheme } from '@/theme'

echarts.use([BarChart, GridComponent, TooltipComponent, SVGRenderer])

export function formatToolUsageTokens(value: number): string {
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(value >= 10_000_000_000_000 ? 0 : 1)}T`
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(value >= 10_000_000_000 ? 0 : 1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`
  return Math.round(value).toLocaleString()
}

function weekLabel(week: string, language: string, includeYear = false): string {
  const [year, month, day] = week.split('-').map(Number)
  if (!year || !month || !day) return week
  return new Intl.DateTimeFormat(language.startsWith('en') ? 'en-US' : 'zh-CN', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' as const } : {}),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function ToolUsageClientsChart({ data }: { data: ToolUsageClients }) {
  const { t, i18n } = useTranslation()
  const chartRef = useRef<HTMLDivElement>(null)
  const theme = useResolvedTheme()
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(Math.max(0, data.weeks.length - 1))
  const [legendVisible, setLegendVisible] = useState(false)
  const seriesData = useMemo(() => data.items.map((item) => {
    const values = new Map(item.weekly_usage.map((usage) => [new Date(usage.week_start).toISOString().slice(0, 10), usage.total_tokens]))
    return { name: item.name, values: data.weeks.map((week) => values.get(week) ?? 0) }
  }), [data.items, data.weeks])

  useEffect(() => {
    setSelectedWeekIndex(Math.max(0, data.weeks.length - 1))
    setLegendVisible(false)
  }, [data.weeks])

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
      tooltip: { trigger: 'axis', showContent: false, confine: true, axisPointer: { type: 'shadow' } },
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
    const selectNearestWeek = (event: { offsetX: number }) => {
      const weekPositions = data.weeks.map((_, index) => Number(chart.convertToPixel({ xAxisIndex: 0 }, index)))
      let nearestIndex = 0
      let nearestDistance = Number.POSITIVE_INFINITY
      weekPositions.forEach((position, index) => {
        const distance = Math.abs(position - event.offsetX)
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestIndex = index
        }
      })
      setSelectedWeekIndex(nearestIndex)
    }
    const hoverMedia = window.matchMedia('(hover: hover) and (pointer: fine)')
    const supportsHover = () => hoverMedia.matches && node.clientWidth > 560
    let hoverInteraction = supportsHover()
    const handlePointerMove = (event: { offsetX: number }) => {
      if (!hoverInteraction) return
      selectNearestWeek(event)
      setLegendVisible(true)
    }
    const handlePointerOut = () => {
      if (hoverInteraction) setLegendVisible(false)
    }
    const handleChartTap = (event: { offsetX: number }) => {
      if (hoverInteraction) return
      selectNearestWeek(event)
      setLegendVisible(true)
    }
    const handleOutsideTap = (event: PointerEvent) => {
      const panel = node.closest('.apps-chart-panel')
      if (!hoverInteraction && event.target instanceof Node && !panel?.contains(event.target)) setLegendVisible(false)
    }
    chart.getZr().on('mousemove', handlePointerMove)
    chart.getZr().on('globalout', handlePointerOut)
    chart.getZr().on('click', handleChartTap)
    document.addEventListener('pointerdown', handleOutsideTap, true)
    let mobile = node.clientWidth <= 560
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      chart.resize()
      const nextMobile = node.clientWidth <= 560
      if (nextMobile !== mobile) {
        mobile = nextMobile
        chart.setOption(responsiveOption())
      }
      const nextHoverInteraction = supportsHover()
      if (nextHoverInteraction !== hoverInteraction) {
        hoverInteraction = nextHoverInteraction
        setLegendVisible(false)
      }
    }) : null
    resizeObserver?.observe(node)
    return () => {
      resizeObserver?.disconnect()
      document.removeEventListener('pointerdown', handleOutsideTap, true)
      chart.getZr().off('mousemove', handlePointerMove)
      chart.getZr().off('globalout', handlePointerOut)
      chart.getZr().off('click', handleChartTap)
      chart.dispose()
    }
  }, [data.weeks, i18n.language, seriesData, theme])

  const selectedWeek = data.weeks[selectedWeekIndex] ?? data.weeks.at(-1) ?? ''
  const selectedValues = data.items.map((item, index) => ({
    id: item.id,
    name: item.name,
    value: seriesData[index]?.values[selectedWeekIndex] ?? 0,
    color: MODEL_CHART_COLORS[index % MODEL_CHART_COLORS.length],
  }))
  const total = selectedValues.reduce((sum, item) => sum + item.value, 0)

  return <>
    <div className="apps-echart" ref={chartRef} role="img" aria-label={t('public.apps.chartLabel')} />
    <ChartHoverLegend
      className="apps-chart-legend"
      visible={legendVisible}
      ariaLabel={t('public.apps.legendLabel')}
      dateTime={selectedWeek}
      dateLabel={weekLabel(selectedWeek, i18n.language, true)}
      items={selectedValues.map((item) => ({ ...item, value: formatToolUsageTokens(item.value) }))}
      totalLabel={t('public.apps.all')}
      totalValue={formatToolUsageTokens(total)}
    />
  </>
}
