import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { RecentModelUsage } from '@/api/model-rankings'
import { MODEL_CHART_COLORS } from '@/components/chart-colors'
import { ChartHoverLegend } from '@/components/chart-hover-legend'
import { useResolvedTheme } from '@/theme'

echarts.use([BarChart, GridComponent, TooltipComponent, SVGRenderer])

export const RANKING_SERIES_COLORS = MODEL_CHART_COLORS

export function formatRankingTokens(value: number): string {
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(value >= 10_000_000_000_000 ? 0 : 1)}T`
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(value >= 10_000_000_000 ? 0 : 1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`
  return Math.round(value).toLocaleString()
}

function weekDate(week: string): Date | null {
  const [year, month, day] = week.split('-').map(Number)
  if (!year || !month || !day) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  return Number.isNaN(date.getTime()) ? null : date
}

function weekLabel(week: string, language: string, includeYear = false): string {
  const date = weekDate(week)
  if (!date) return week
  return new Intl.DateTimeFormat(language.startsWith('en') ? 'en-US' : 'zh-CN', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' as const } : {}),
    timeZone: 'UTC',
  }).format(date)
}

export function RankingRecentUsageChart({ data }: { data: RecentModelUsage }) {
  const { t, i18n } = useTranslation()
  const chartRef = useRef<HTMLDivElement>(null)
  const theme = useResolvedTheme()
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(Math.max(0, data.weeks.length - 1))
  const [legendVisible, setLegendVisible] = useState(false)
  const usageByModel = useMemo(() => data.items.map((item) => {
    const weekly = new Map(item.weekly_usage.map((usage) => [new Date(usage.week_start).toISOString().slice(0, 10), usage.total_tokens]))
    return data.weeks.map((week) => weekly.get(week) ?? 0)
  }), [data.items, data.weeks])

  useEffect(() => {
    setSelectedWeekIndex(Math.max(0, data.weeks.length - 1))
    setLegendVisible(false)
  }, [data.weeks])

  useEffect(() => {
    const node = chartRef.current
    if (!node || data.weeks.length === 0 || data.items.length === 0) return undefined
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
      color: [...RANKING_SERIES_COLORS],
      grid: initialResponsiveOption.grid,
      tooltip: {
        trigger: 'axis',
        showContent: false,
        confine: true,
        axisPointer: { type: 'shadow' },
      },
      xAxis: {
        type: 'category',
        axisLine: { lineStyle: { color: light ? 'rgba(23,24,27,.16)' : 'rgba(255,255,255,.14)' } },
        axisTick: { show: false },
        ...initialResponsiveOption.xAxis,
      },
      yAxis: {
        type: 'value',
        min: 0,
        splitNumber: 4,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: light ? '#737984' : '#8b8b8b', fontSize: 12, formatter: (value: number) => formatRankingTokens(value) },
        splitLine: { lineStyle: { color: light ? 'rgba(23,24,27,.08)' : 'rgba(255,255,255,.07)' } },
      },
      series: data.items.map((item, index) => ({
        name: item.name,
        type: 'bar',
        stack: 'tokens',
        barMaxWidth: 42,
        emphasis: { focus: 'series' },
        itemStyle: { color: RANKING_SERIES_COLORS[index % RANKING_SERIES_COLORS.length] },
        data: usageByModel[index],
      })),
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
      if (hoverInteraction) {
        setLegendVisible(false)
      }
    }
    const handleChartTap = (event: { offsetX: number }) => {
      if (hoverInteraction) return
      selectNearestWeek(event)
      setLegendVisible(true)
    }
    const handleOutsideTap = (event: PointerEvent) => {
      const layout = node.closest('.ranking-chart-layout')
      if (!hoverInteraction && event.target instanceof Node && !layout?.contains(event.target)) setLegendVisible(false)
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
  }, [data.items, data.weeks, i18n.language, theme, usageByModel])

  const selectedWeek = data.weeks[selectedWeekIndex] ?? data.weeks.at(-1) ?? ''
  const selectedValues = data.items.map((item, index) => ({
    code: item.code,
    name: item.name,
    value: usageByModel[index]?.[selectedWeekIndex] ?? 0,
    color: RANKING_SERIES_COLORS[index % RANKING_SERIES_COLORS.length],
  }))
  const total = selectedValues.reduce((sum, item) => sum + item.value, 0)

  return <>
    <div className="ranking-chart ranking-echart" ref={chartRef} role="img" aria-label={t('public.rankings.chartLabel')} />
    <ChartHoverLegend
      visible={legendVisible}
      ariaLabel={t('public.rankings.legendLabel')}
      dateTime={selectedWeek}
      dateLabel={weekLabel(selectedWeek, i18n.language, true)}
      items={selectedValues.map((item) => ({ id: item.code, name: item.name, value: formatRankingTokens(item.value), color: item.color }))}
      totalLabel={t('public.rankings.all')}
      totalValue={formatRankingTokens(total)}
    />
  </>
}
