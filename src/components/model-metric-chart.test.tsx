import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as echarts from 'echarts/core'
import i18n from '@/i18n'
import type { UserModelMetricPoint } from '@/api/user-models'
import { buildMetricChartOption, metricAxisLabels, metricSeriesValues, metricTooltipText, ModelMetricChart, ModelMetricChartCard } from './model-metric-chart'

// 2026-09-16T00:00:00Z / 2026-09-17T00:00:00Z
const DAY_ONE = Date.UTC(2026, 8, 16)
const DAY_TWO = Date.UTC(2026, 8, 17)
const DAY = 86_400_000

function point(timestamp: number, value: number | null): UserModelMetricPoint {
  return { timestamp, value }
}

const labels = ['2026-09-16', '2026-09-17']
const values: Array<number | null> = [1280, null]

function option(overrides: Partial<Parameters<typeof buildMetricChartOption>[0]> = {}) {
  return buildMetricChartOption({
    labels, values, title: '吞吐量趋势图', unit: 'tokens/s', unavailableLabel: '暂无数据', dark: false, surface: '#fff',
    ...overrides,
  })
}

function renderedTooltip(node: HTMLElement, dataIndex: number): string {
  const chart = echarts.getInstanceByDom(node)!
  const tooltip = chart.getOption().tooltip as Array<{ formatter: (params: unknown) => string }>
  return tooltip[0].formatter([{ dataIndex }])
}

beforeEach(async () => { await i18n.changeLanguage('zh-CN') })
afterEach(async () => { await i18n.changeLanguage('zh-CN') })

describe('模型指标时序的轴标签与取值', () => {
  it('保留完整 UTC 日期用于提示，横轴仍显示简短月日', () => {
    expect(metricAxisLabels([point(DAY_ONE, 1), point(DAY_TWO, 2)])).toEqual(labels)
    expect(option().xAxis.axisLabel.formatter(labels[0])).toBe('09-16')
    expect(metricAxisLabels([point(Date.parse('2026-09-17T01:00:00+08:00'), 1)])).toEqual(['2026-09-16'])
  })

  it('原始序列保留缺数据与真实零值的区别，供悬停提示使用', () => {
    expect(metricSeriesValues([
      point(DAY_ONE, 0),
      point(DAY_ONE + DAY, null),
      point(DAY_ONE + DAY * 2, Number.NaN),
      point(DAY_ONE + DAY * 3, Number.POSITIVE_INFINITY),
    ])).toEqual([0, null, null, null])
  })

  it('提示文案区分缺数据和真实零值', () => {
    expect(metricTooltipText(null, 'ms', '暂无数据')).toBe('暂无数据')
    expect(metricTooltipText(0, 'ms', '暂无数据')).toBe('0.0000 ms')
    expect(metricTooltipText(1234, 'ms', '暂无数据')).toBe('1,234.0000 ms')
    expect(metricTooltipText(1234, '', '暂无数据')).toBe('1,234.0000')
  })

  it('提示固定四位小数并四舍五入，刻度保持原有精度', () => {
    expect(metricTooltipText(66.8953687821612, 'tokens/s', '暂无数据')).toBe('66.8954 tokens/s')
    expect(metricTooltipText(0.000001, 'tokens/s', '暂无数据')).toBe('0.0000 tokens/s')
    expect(option().yAxis.axisLabel.formatter(0.000001)).toBe('0.000001')
    expect(metricTooltipText(0.12345678901234567, 'ms', '暂无数据')).toBe('0.1235 ms')
  })
})

describe('模型指标折线图配置', () => {
  it('X 轴保留完整日期，缺数据日期在折线上按零绘制', () => {
    const chart = option()
    expect(chart.xAxis.data).toEqual(labels)
    expect(chart.series[0]?.data).toEqual([1280, 0])
    expect(values).toEqual([1280, null])
  })

  it('缺数据和真实零值都画在零线上，悬停提示分别显示暂无数据与带单位的零', () => {
    const chart = option({ values: [null, 0] })
    expect(chart.series[0]?.data).toEqual([0, 0])
    expect(chart.tooltip.formatter([{ dataIndex: 0 }])).toContain('暂无数据')
    expect(chart.tooltip.formatter([{ dataIndex: 0 }])).not.toContain('0.0000 tokens/s')
    expect(chart.tooltip.formatter([{ dataIndex: 1 }])).toContain('0.0000 tokens/s')
    expect(chart.tooltip.formatter([{ dataIndex: 1 }])).not.toContain('暂无数据')
  })

  it('非负指标从零开始并留顶部空间，完整容纳刻度文字', () => {
    const chart = option()
    expect(chart.yAxis.min).toBe(0)
    expect(chart.yAxis.boundaryGap).toEqual([0, '12%'])
    expect(chart.yAxis.axisLabel.formatter(1234)).toBe('1,234')
    expect(chart.yAxis.splitLine.lineStyle.type).toBe('dashed')
    expect(chart.grid.outerBoundsMode).toBe('same')
    expect(chart.grid.outerBoundsContain).toBe('axisLabel')
    expect(chart.grid).not.toHaveProperty('containLabel')
  })

  it('提示浮层同时给出日期、指标名和带单位的数值', () => {
    const withValue = option().tooltip.formatter([{ dataIndex: 0 }])
    expect(withValue).toContain('2026-09-16 UTC')
    expect(withValue).toContain('吞吐量趋势图')
    expect(withValue).toContain('1,280.0000 tokens/s')

    const missing = option().tooltip.formatter([{ dataIndex: 1 }])
    expect(missing).toContain('2026-09-17 UTC')
    expect(missing).toContain('暂无数据')
  })

  it('提示中的日期、标题、单位和缺样本文案均按纯文本转义', () => {
    const title = '<img src=x onerror="alert(1)"> & 指标'
    const unit = 'tokens/s<script>alert(1)</script>'
    const unsafeLabel = '2026-09-16<svg onload="alert(1)">'
    const host = document.createElement('div')
    host.innerHTML = option({ labels: [unsafeLabel], values: [0], title, unit }).tooltip.formatter([{ dataIndex: 0 }])
    expect(host.querySelector('img, script, svg')).toBeNull()
    expect(host).toHaveTextContent(unsafeLabel)
    expect(host).toHaveTextContent(title)
    expect(host).toHaveTextContent(`0.0000 ${unit}`)

    host.innerHTML = option({ values: [null], unavailableLabel: '<img src=x>暂无数据' }).tooltip.formatter([{ dataIndex: 0 }])
    expect(host.querySelector('img')).toBeNull()
    expect(host).toHaveTextContent('<img src=x>暂无数据')
  })

  it('极窄图日期刻度抽稀时仍渲染全部七天的真实点与缺数据零点', () => {
    const chart = echarts.init(null, undefined, { renderer: 'svg', ssr: true, width: 110, height: 140 })
    try {
      // 真实渲染验证点符号，避免仅检查配置却漏掉 ECharts 对日期刻度的自动抽稀。
      chart.setOption({ ...option({
        labels: metricAxisLabels(Array.from({ length: 7 }, (_, index) => point(DAY_ONE + DAY * index, null))),
        values: [null, null, null, 0.000001, null, null, null],
      }), animation: false })
      const svg = new DOMParser().parseFromString(chart.renderToSVGString(), 'image/svg+xml')
      expect(svg.querySelectorAll('path[fill="#fff"][stroke="#72b8e8"]')).toHaveLength(7)
      expect(svg.documentElement.outerHTML).not.toContain('NaN')
    } finally {
      chart.dispose()
    }
  })

  it('深浅色只影响文字与网格颜色，不改变数据', () => {
    const light = option()
    const dark = option({ dark: true, surface: '#202124' })
    expect(dark.series[0]?.data).toEqual(light.series[0]?.data)
    expect(dark.xAxis.axisLabel.color).not.toBe(light.xAxis.axisLabel.color)
    expect(dark.tooltip.backgroundColor).not.toBe(light.tooltip.backgroundColor)
  })
})

describe('模型指标折线图渲染', () => {
  it('没有时序数据时显示占位而不是空图', () => {
    render(<ModelMetricChart title="吞吐量趋势图" points={[]} unit="tokens/s" unavailableLabel="暂无数据" />)
    expect(screen.getByRole('img', { name: '吞吐量趋势图' })).toHaveTextContent('暂无数据')
  })

  it('日期桶全部为 null 时仍绘制零线，悬停保持暂无数据', () => {
    const { container } = render(
      <ModelMetricChart title="首 Token 延迟趋势图" points={[point(DAY_ONE, null), point(DAY_ONE + DAY, null)]} unit="ms" unavailableLabel="暂无数据" />,
    )
    expect(container.querySelector('.model-detail-chart-empty')).toBeNull()
    const chart = screen.getByRole('img', { name: '首 Token 延迟趋势图' })
    expect(chart).toHaveClass('model-metric-chart')
    expect(renderedTooltip(chart, 0)).toContain('暂无数据')
    expect(renderedTooltip(chart, 1)).toContain('暂无数据')
  })

  it('存在有效数据时挂载图表容器并保留无障碍名称', () => {
    const { container } = render(
      <ModelMetricChart title="吞吐量趋势图" points={[point(DAY_ONE, 1280), point(DAY_ONE + DAY, 640)]} unit="tokens/s" unavailableLabel="暂无数据" />,
    )
    expect(container.querySelector('.model-detail-chart-empty')).toBeNull()
    expect(screen.getByRole('img', { name: '吞吐量趋势图' })).toHaveClass('model-metric-chart')
  })

  it('只有真实零值时仍显示图表，不会误报暂无数据', () => {
    render(<ModelMetricChart title="首 Token 延迟趋势图" points={[point(DAY_ONE, 0), point(DAY_TWO, null)]} unit="ms" unavailableLabel="暂无数据" />)
    expect(screen.getByRole('img', { name: '首 Token 延迟趋势图' })).toHaveClass('model-metric-chart')
    expect(screen.queryByText('暂无数据')).toBeNull()
  })
})

describe('模型指标卡片统计口径与简洁展示', () => {
  it('保留接口 P50 与单位，图表下方不再显示覆盖天数和说明', () => {
    const points = Array.from({ length: 7 }, (_, index) => point(DAY_ONE + DAY * index, index === 0 ? 0 : index === 3 ? 0.000001 : null))
    const { container } = render(<ModelMetricChartCard label="吞吐量" title="吞吐量趋势图" unit="默认单位" series={{ points, unit: 'tokens/s', statistic: 'p50' }} />)

    expect(screen.getByText('P50')).toHaveAttribute('title', '当日有效样本的中位数（P50）')
    expect(screen.getByText('tokens/s')).toBeInTheDocument()
    expect(screen.queryByText('默认单位')).toBeNull()
    expect(screen.queryByText(/UTC 日统计|有数据.*天|空白日期|不代表数值/)).toBeNull()
    expect(container.querySelector('.model-detail-chart-card > p')).toBeNull()
  })

  it('P95 卡片悬停区分缺数据与零值，中英文切换同步更新提示', async () => {
    const points = Array.from({ length: 7 }, (_, index) => point(DAY_ONE + DAY * index, index === 1 ? 0 : null))
    render(<ModelMetricChartCard label="首 Token 延迟" title="首 Token 延迟趋势图" unit="ms" series={{ points, unit: 'ms', statistic: 'p95' }} />)

    expect(screen.getByText('P95')).toHaveAttribute('title', '当日有效样本的第 95 百分位（P95）')
    const chart = screen.getByRole('img', { name: '首 Token 延迟趋势图' })
    expect(renderedTooltip(chart, 0)).toContain('暂无数据')
    expect(renderedTooltip(chart, 1)).toContain('0.0000 ms')
    expect(screen.queryByText(/UTC 日统计|有数据.*天|空白日期/)).toBeNull()

    await act(async () => { await i18n.changeLanguage('en-US') })
    expect(screen.getByText('P95')).toHaveAttribute('title', '95th percentile of valid daily samples (P95)')
    expect(renderedTooltip(chart, 0)).toContain('No data')
    expect(renderedTooltip(chart, 0)).not.toContain('暂无数据')
    expect(renderedTooltip(chart, 1)).toContain('0.0000 ms')
    expect(screen.queryByText(/Daily \(UTC\)|Data on|Blank dates/)).toBeNull()
  })

  it('没有接口序列时沿用单位和空状态，不虚构统计口径或覆盖天数', () => {
    render(<ModelMetricChartCard label="吞吐量" title="吞吐量趋势图" unit="tokens/s" />)
    expect(screen.getByText('tokens/s')).toBeInTheDocument()
    expect(screen.getByText('暂无数据')).toBeInTheDocument()
    expect(screen.queryByText(/P50|P95|有数据/)).toBeNull()
  })
})
