import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers'
import type { ToolUsageClients } from '@/api/tool-usage'
import { MODEL_CHART_COLORS } from '@/components/chart-colors'
import { ChartHoverLegend } from '@/components/chart-hover-legend'
import { useResolvedTheme } from '@/theme'
import { getChartRenderer } from '@/components/chart-renderer'

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer, SVGRenderer])

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

/** 悬浮信息框宽度，与样式中 .chart-hover-legend 的 width 保持一致。 */
const LEGEND_WIDTH = 210
/** 信息框与鼠标、面板边缘之间保留的间距。 */
const LEGEND_GAP = 24

export function ToolUsageClientsChart({ data }: { data: ToolUsageClients }) {
  const { t, i18n } = useTranslation()
  const chartRef = useRef<HTMLDivElement>(null)
  const theme = useResolvedTheme()
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(Math.max(0, data.weeks.length - 1))
  const selectedWeekIndexRef = useRef(Math.max(0, data.weeks.length - 1))
  const [legendVisible, setLegendVisible] = useState(false)
  const [legendPosition, setLegendPosition] = useState<{ x: number; y: number } | null>(null)
  const legendPositionRef = useRef<{ x: number; y: number } | null>(null)
  const legendVisibleRef = useRef(false)
  const lastPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const seriesData = useMemo(() => data.items.map((item) => {
    const values = new Map(item.weekly_usage.map((usage) => [new Date(usage.week_start).toISOString().slice(0, 10), usage.total_tokens]))
    return { name: item.name, values: data.weeks.map((week) => values.get(week) ?? 0) }
  }), [data.items, data.weeks])
  // 堆叠后每周总量峰值，用于无数据时给 y 轴兜底一个整数刻度范围。
  const maxWeeklyTotal = useMemo(() => {
    let max = 0
    data.weeks.forEach((_, weekIndex) => {
      const total = seriesData.reduce((sum, series) => sum + (series.values[weekIndex] ?? 0), 0)
      if (total > max) max = total
    })
    return max
  }, [data.weeks, seriesData])

  // 同步 ref 供事件回调/ResizeObserver 读取最新状态，避免重建图表。
  useEffect(() => {
    legendVisibleRef.current = legendVisible
  }, [legendVisible])

  /** 同时更新 ref 与 state，保证回调内能立即读到最新坐标。 */
  const applyLegendPosition = (position: { x: number; y: number } | null) => {
    const previous = legendPositionRef.current
    if (previous === position || (previous && position && Math.abs(previous.x - position.x) < 1 && Math.abs(previous.y - position.y) < 1)) return
    legendPositionRef.current = position
    setLegendPosition(position)
  }

  useEffect(() => {
    const lastIndex = Math.max(0, data.weeks.length - 1)
    selectedWeekIndexRef.current = lastIndex
    setSelectedWeekIndex(lastIndex)
    legendVisibleRef.current = false
    setLegendVisible(false)
    applyLegendPosition(null)
  }, [data.weeks])

  useEffect(() => {
    const node = chartRef.current
    if (!node || data.weeks.length === 0 || seriesData.length === 0) return undefined
    const chart = echarts.init(node, undefined, { renderer: getChartRenderer() })
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
      tooltip: { trigger: 'axis', showContent: false, confine: true, axisPointer: { type: 'shadow', animation: false } },
      xAxis: { type: 'category', axisLine: { lineStyle: { color: light ? 'rgba(23,24,27,.16)' : 'rgba(255,255,255,.14)' } }, axisTick: { show: false }, ...initialResponsiveOption.xAxis },
      yAxis: {
        type: 'value',
        min: 0,
        // 无数据时兜底上界，避免刻度出现 0.25/0.5 这类小数被四舍五入成重复的 0/1。
        max: maxWeeklyTotal > 0 ? undefined : 4,
        // 刻度只取整数，保证格式化后的标签不重复。
        minInterval: 1,
        splitNumber: 4,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: light ? '#737984' : '#8b8b8b', fontSize: 12, formatter: (value: number) => formatToolUsageTokens(value) },
        splitLine: { lineStyle: { color: light ? 'rgba(23,24,27,.08)' : 'rgba(255,255,255,.07)' } },
      },
      series: seriesData.map((item, index) => ({
        name: item.name,
        type: 'bar',
        stack: 'tokens',
        barMaxWidth: 42,
        // 堆叠柱按整根柱子响应 hover，避免单独突出当前工具色块。
        emphasis: { focus: 'none', itemStyle: { opacity: 1 } },
        blur: { itemStyle: { opacity: 1 } },
        itemStyle: { color: MODEL_CHART_COLORS[index % MODEL_CHART_COLORS.length] },
        data: item.values,
      })),
    })
    let weekPositions = data.weeks.map((_, index) => Number(chart.convertToPixel({ xAxisIndex: 0 }, index)))
    const selectNearestWeek = (event: { offsetX: number }) => {
      let nearestIndex = 0
      let nearestDistance = Number.POSITIVE_INFINITY
      weekPositions.forEach((position, index) => {
        const distance = Math.abs(position - event.offsetX)
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestIndex = index
        }
      })
      if (nearestIndex === selectedWeekIndexRef.current) return
      selectedWeekIndexRef.current = nearestIndex
      setSelectedWeekIndex(nearestIndex)
    }
    /** 右侧空间足够时停靠面板右侧，否则换算为面板坐标跟随鼠标显示。 */
    const updateLegendPosition = (clientX: number, clientY: number) => {
      const panel = node.closest('.apps-chart-panel')
      if (!(panel instanceof HTMLElement)) {
        applyLegendPosition(null)
        return
      }
      const panelRect = panel.getBoundingClientRect()
      if (window.innerWidth - panelRect.right >= LEGEND_WIDTH + LEGEND_GAP) {
        applyLegendPosition(null)
        return
      }
      // 鼠标坐标换算为相对面板的坐标，优先显示在鼠标右下方。
      let x = clientX - panelRect.left + LEGEND_GAP
      let y = clientY - panelRect.top + LEGEND_GAP
      // 右侧放不下时翻转到鼠标左侧。
      if (x + LEGEND_WIDTH > panelRect.width - 8) x = clientX - panelRect.left - LEGEND_WIDTH - LEGEND_GAP
      // 底部放不下时向上收拢，避免超出面板。
      const legendHeight = panel.querySelector('.chart-hover-legend')?.getBoundingClientRect().height ?? 0
      if (legendHeight > 0 && y + legendHeight > panelRect.height - 8) y = panelRect.height - legendHeight - 8
      applyLegendPosition({ x: Math.max(8, x), y: Math.max(8, y) })
    }
    const hoverMedia = window.matchMedia('(hover: hover) and (pointer: fine)')
    const supportsHover = () => hoverMedia.matches && node.clientWidth > 560
    let hoverInteraction = supportsHover()
    type PointerMoveEvent = { offsetX: number; event?: { clientX: number; clientY: number } }
    let pendingPointerEvent: PointerMoveEvent | null = null
    let pointerFrame: number | null = null
    const processPointerMove = () => {
      pointerFrame = null
      const event = pendingPointerEvent
      pendingPointerEvent = null
      if (!event || !hoverInteraction) return
      selectNearestWeek(event)
      if (!legendVisibleRef.current) {
        legendVisibleRef.current = true
        setLegendVisible(true)
      }
      if (event.event) {
        lastPointerRef.current = { x: event.event.clientX, y: event.event.clientY }
        updateLegendPosition(event.event.clientX, event.event.clientY)
      }
    }
    const handlePointerMove = (event: PointerMoveEvent) => {
      if (!hoverInteraction) return
      pendingPointerEvent = event
      if (pointerFrame === null) pointerFrame = requestAnimationFrame(processPointerMove)
    }
    const handlePointerOut = () => {
      if (hoverInteraction) {
        pendingPointerEvent = null
        if (pointerFrame !== null) cancelAnimationFrame(pointerFrame)
        pointerFrame = null
        legendVisibleRef.current = false
        setLegendVisible(false)
        applyLegendPosition(null)
      }
    }
    const handleChartTap = (event: { offsetX: number; event?: { clientX: number; clientY: number } }) => {
      if (hoverInteraction) return
      selectNearestWeek(event)
      legendVisibleRef.current = true
      setLegendVisible(true)
      if (event.event) {
        lastPointerRef.current = { x: event.event.clientX, y: event.event.clientY }
        updateLegendPosition(event.event.clientX, event.event.clientY)
      }
    }
    const handleOutsideTap = (event: PointerEvent) => {
      const panel = node.closest('.apps-chart-panel')
      if (!hoverInteraction && event.target instanceof Node && !panel?.contains(event.target)) {
        legendVisibleRef.current = false
        setLegendVisible(false)
        applyLegendPosition(null)
      }
    }
    chart.getZr().on('mousemove', handlePointerMove)
    chart.getZr().on('globalout', handlePointerOut)
    chart.getZr().on('click', handleChartTap)
    document.addEventListener('pointerdown', handleOutsideTap, true)
    let mobile = node.clientWidth <= 560
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      chart.resize()
      weekPositions = data.weeks.map((_, index) => Number(chart.convertToPixel({ xAxisIndex: 0 }, index)))
      const nextMobile = node.clientWidth <= 560
      if (nextMobile !== mobile) {
        mobile = nextMobile
        chart.setOption(responsiveOption())
      }
      const nextHoverInteraction = supportsHover()
      if (nextHoverInteraction !== hoverInteraction) {
        hoverInteraction = nextHoverInteraction
        legendVisibleRef.current = false
        setLegendVisible(false)
        applyLegendPosition(null)
        return
      }
      // 尺寸变化后重新计算信息框位置，避免跟随模式下越界。
      if (legendVisibleRef.current && legendPositionRef.current) {
        updateLegendPosition(lastPointerRef.current.x, lastPointerRef.current.y)
      }
    }) : null
    resizeObserver?.observe(node)
    return () => {
      if (pointerFrame !== null) cancelAnimationFrame(pointerFrame)
      resizeObserver?.disconnect()
      document.removeEventListener('pointerdown', handleOutsideTap, true)
      chart.getZr().off('mousemove', handlePointerMove)
      chart.getZr().off('globalout', handlePointerOut)
      chart.getZr().off('click', handleChartTap)
      chart.dispose()
    }
  }, [data.weeks, i18n.language, maxWeeklyTotal, seriesData, theme])

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
      position={legendPosition}
    />
  </>
}
