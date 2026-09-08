import { describe, expect, it } from 'vitest'
import { normalizeBillingCostChart } from './billing-cost-charts'

describe('账务费用图表接口适配', () => {
  it('读取新接口的 snake_case 坐标轴并按日期和值下标配对', () => {
    expect(normalizeBillingCostChart({
      x_axis: { type: 'category', boundary_gap: false, data: [1785542400000, 1785628800000] },
      y_axis: { type: 'value' },
      series: [{ name: 'GPT-5', type: 'line', stack: 'Total', data: [5, 0] }],
    }, 'zh-CN')).toEqual({
      labels: ['8月1日', '8月2日'],
      series: [{ name: 'GPT-5', data: [5, 0] }],
    })
  })

  it('兼容灰度旧服务的驼峰坐标轴', () => {
    expect(normalizeBillingCostChart({
      xAxis: { type: 'category', boundaryGap: false, data: [1785542400000] },
      yAxis: { type: 'value' },
      series: [{ name: 'balance', type: 'line', data: [1.25] }],
    }, 'en-US').series[0]?.data).toEqual([1.25])
  })
})
