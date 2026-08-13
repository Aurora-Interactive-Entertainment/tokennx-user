import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { RecentModelUsage } from '@/api/model-rankings'
import { useResolvedTheme } from '@/theme'

echarts.use([BarChart, GridComponent, TooltipComponent, SVGRenderer])

export const RANKING_SERIES_COLORS = ['#f476b7', '#a979ef', '#3981ec', '#ddd784', '#ebb849', '#f47154', '#b86bbd', '#d64f25', '#678032', '#e7834f'] as const

export function formatRankingTokens(value: number): string {
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(value >= 10_000_000_000_000 ? 0 : 1)}T`
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(value >= 10_000_000_000 ? 0 : 1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`
  return Math.round(value).toLocaleString()
}

function monthLabel(month: string, language: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber) return month
  return language.startsWith('en')
    ? new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, monthNumber - 1, 1)))
    : `${year}年${monthNumber}月`
}

export function RankingRecentUsageChart({ data }: { data: RecentModelUsage }) {
  const { t, i18n } = useTranslation()
  const chartRef = useRef<HTMLDivElement>(null)
  const theme = useResolvedTheme()
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(Math.max(0, data.months.length - 1))
  const usageByModel = useMemo(() => data.items.map((item) => {
    const monthly = new Map(item.monthly_usage.map((usage) => [usage.month, usage.total_tokens]))
    return data.months.map((month) => monthly.get(month) ?? 0)
  }), [data.items, data.months])

  useEffect(() => {
    setSelectedMonthIndex(Math.max(0, data.months.length - 1))
  }, [data.months])

  useEffect(() => {
    const node = chartRef.current
    if (!node || data.months.length === 0 || data.items.length === 0) return undefined
    const chart = echarts.init(node, undefined, { renderer: 'svg', width: node.clientWidth || 720, height: node.clientHeight || 508 })
    const light = theme === 'light'
    chart.setOption({
      animationDuration: 420,
      color: [...RANKING_SERIES_COLORS],
      grid: { left: 72, right: 12, top: 18, bottom: 58 },
      tooltip: {
        show: false,
        confine: true,
      },
      xAxis: {
        type: 'category',
        data: data.months.map((month) => monthLabel(month, i18n.language)),
        axisLine: { lineStyle: { color: light ? 'rgba(23,24,27,.16)' : 'rgba(255,255,255,.14)' } },
        axisTick: { show: false },
        axisLabel: { color: light ? '#737984' : '#8b8b8b', fontSize: 12, margin: 18 },
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
    const selectMonth = (params: { dataIndex?: unknown }) => {
      if (typeof params.dataIndex === 'number') setSelectedMonthIndex(params.dataIndex)
    }
    const selectNearestMonth = (event: { offsetX: number }) => {
      const monthPositions = data.months.map((_, index) => Number(chart.convertToPixel({ xAxisIndex: 0 }, index)))
      let nearestIndex = 0
      let nearestDistance = Number.POSITIVE_INFINITY
      monthPositions.forEach((position, index) => {
        const distance = Math.abs(position - event.offsetX)
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestIndex = index
        }
      })
      setSelectedMonthIndex(nearestIndex)
    }
    chart.on('mouseover', selectMonth)
    chart.on('click', selectMonth)
    chart.getZr().on('mousemove', selectNearestMonth)
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => chart.resize()) : null
    resizeObserver?.observe(node)
    return () => {
      resizeObserver?.disconnect()
      chart.getZr().off('mousemove', selectNearestMonth)
      chart.dispose()
    }
  }, [data.items, data.months, i18n.language, theme, usageByModel])

  const selectedMonth = data.months[selectedMonthIndex] ?? data.months.at(-1) ?? ''
  const selectedValues = data.items.map((item, index) => ({
    code: item.code,
    name: item.name,
    value: usageByModel[index]?.[selectedMonthIndex] ?? 0,
    color: RANKING_SERIES_COLORS[index % RANKING_SERIES_COLORS.length],
  }))
  const total = selectedValues.reduce((sum, item) => sum + item.value, 0)

  return <>
    <div className="ranking-chart ranking-echart" ref={chartRef} role="img" aria-label={t('public.rankings.chartLabel')} />
    <aside className="ranking-legend" aria-label={t('public.rankings.legendLabel')}>
      <time dateTime={selectedMonth}>{monthLabel(selectedMonth, i18n.language)}</time>
      <div className="ranking-legend-list">{selectedValues.map((item) => <span key={item.code}><i style={{ backgroundColor: item.color }} /><strong title={item.name}>{item.name}</strong><em>{formatRankingTokens(item.value)}</em></span>)}</div>
      <div className="ranking-legend-total"><strong>{t('public.rankings.all')}</strong><em>{formatRankingTokens(total)}</em></div>
    </aside>
  </>
}
