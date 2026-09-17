import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { UserModelItem, UserModelPricingPeriod, UserModelPricingRule } from '@/api/user-models'
import { userModelToRecord } from '@/data/models'
import i18n from '@/i18n'
import { ModelTimePricing } from './model-time-pricing'

const inputRule: UserModelPricingRule = {
  kind: 'token', meter_code: 'input_token', tier_no: 1, lower_bound: 0,
  unit_quantity: 1_000_000, unit_price_yuan: '0.25', rounding_mode: 'up',
}

function period(overrides: Partial<UserModelPricingPeriod> = {}): UserModelPricingPeriod {
  return {
    key: 'business', name: '工作时段', default: false, weekday_mask: 31,
    start_minute: 480, end_minute: 1200, rules: [inputRule], ...overrides,
  }
}

function model(overrides: Partial<UserModelItem> = {}) {
  return userModelToRecord({
    id: 'custom-provider-model', name: 'Custom Provider Model', company: 'Custom Provider',
    modality: 'text', billing_mode: 'token', description: '', capabilities: null,
    provider_count: 1, prices: null, ...overrides,
  })
}

beforeEach(async () => { await i18n.changeLanguage('zh-CN') })
afterEach(async () => { await i18n.changeLanguage('zh-CN') })

describe('目录真实峰谷定价', () => {
  it('历史 DeepSeek 模型未返回定价时段时不展示推测的峰谷价', () => {
    const legacy = model({ id: 'deepseek-chat', company: 'DeepSeek' })
    const { container, rerender } = render(<ModelTimePricing model={legacy} />)
    expect(container).toBeEmptyDOMElement()

    rerender(<ModelTimePricing model={{ ...legacy, pricingPeriods: [] }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('按任意厂商的接口数据展示时区、工作日和默认兜底，并遵从服务端当前时段', () => {
    render(<ModelTimePricing model={model({
      pricing_timezone: 'America/New_York', current_period_key: 'fallback',
      pricing_periods: [period(), period({
        key: 'fallback', name: '常规低谷', default: true, weekday_mask: 127, start_minute: 0, end_minute: 1440,
      })],
    })} />)

    expect(screen.getByText('峰谷价')).toBeInTheDocument()
    expect(screen.getByText('时区：America/New_York')).toBeInTheDocument()
    expect(screen.getByText('周一至周五 · 08:00–20:00')).toBeInTheDocument()
    expect(screen.getByText('其余时段适用（默认）')).toBeInTheDocument()
    expect(screen.queryByText('每天 · 00:00–24:00')).toBeNull()
    expect(within(screen.getByText('常规低谷').closest('section')!).getByText('当前生效')).toBeInTheDocument()
    expect(within(screen.getByText('工作时段').closest('section')!).queryByText('当前生效')).toBeNull()
  })

  it('展示星期组合和 24:00 结束边界，未知当前时段不擅自标记', () => {
    render(<ModelTimePricing model={model({
      current_period_key: 'not-in-response',
      pricing_periods: [
        period({ key: 'selected-days', weekday_mask: 65, start_minute: 1260, end_minute: 1440 }),
        period({ key: 'every-day', weekday_mask: 127, start_minute: 0, end_minute: 480 }),
      ],
    })} />)

    expect(screen.getByText('周一 / 周日 · 21:00–24:00')).toBeInTheDocument()
    expect(screen.getByText('每天 · 00:00–08:00')).toBeInTheDocument()
    expect(screen.queryByText('当前生效')).toBeNull()
  })

  it('按去除首尾空格后的名称聚合同价时段，并将默认时间段展示为谷价', () => {
    const rules = [
      { ...inputRule, meter_code: 'cache_hit_token', unit_price_yuan: '0.04' },
      { ...inputRule, unit_price_yuan: '2' },
      { ...inputRule, meter_code: 'output_token', unit_price_yuan: '8' },
    ]
    const { container } = render(<ModelTimePricing model={model({
      current_period_key: 'afternoon',
      pricing_periods: [
        period({ key: 'morning', name: '峰价', start_minute: 540, end_minute: 720, rules }),
        period({ key: 'afternoon', name: ' 峰价 ', start_minute: 840, end_minute: 1080, rules }),
        period({ key: 'fallback', name: '默认时间段  ', default: true }),
      ],
    })} />)

    expect(container.querySelectorAll('.model-time-pricing-period')).toHaveLength(2)
    const peak = screen.getByText('峰价').closest('section')!
    expect(within(peak).getByText('周一至周五 · 09:00–12:00')).toBeInTheDocument()
    expect(within(peak).getByText('周一至周五 · 14:00–18:00')).toBeInTheDocument()
    expect(within(peak).getAllByRole('listitem')).toHaveLength(3)
    expect(within(peak).getByText('¥0.04')).toBeInTheDocument()
    expect(within(peak).getByText('¥2')).toBeInTheDocument()
    expect(within(peak).getByText('¥8')).toBeInTheDocument()
    expect(within(peak).getByText('当前生效')).toBeInTheDocument()
    expect(peak).toHaveClass('is-current')
    const offPeak = screen.getByText('谷价').closest('section')!
    expect(within(offPeak).getByText('其余时段适用（默认）')).toBeInTheDocument()
    expect(within(offPeak).queryByText('当前生效')).toBeNull()
    expect(screen.queryByText('默认时间段')).toBeNull()
    expect(screen.queryByText('阶梯 1：0 及以上 tokens')).toBeNull()
  })

  it('合并同名卡片时保留每种价格及计费规格对应的时间范围', () => {
    render(<ModelTimePricing model={model({ pricing_periods: [
      period({ key: 'morning', name: '峰价', start_minute: 540, end_minute: 720 }),
      period({ key: 'afternoon', name: '峰价', start_minute: 840, end_minute: 1080, rules: [{ ...inputRule, unit_price_yuan: '1.5' }] }),
      period({ key: 'evening', name: '峰价', start_minute: 1080, end_minute: 1200, rules: [{ ...inputRule, rounding_mode: 'down' }] }),
    ] })} />)

    expect(screen.getAllByText('峰价')).toHaveLength(1)
    const morning = screen.getByText('周一至周五 · 09:00–12:00').closest('.model-time-pricing-rate-group')!
    const afternoon = screen.getByText('周一至周五 · 14:00–18:00').closest('.model-time-pricing-rate-group')!
    const evening = screen.getByText('周一至周五 · 18:00–20:00').closest('.model-time-pricing-rate-group')!
    expect(within(morning as HTMLElement).getByText('¥0.25')).toBeInTheDocument()
    expect(within(afternoon as HTMLElement).getByText('¥1.5')).toBeInTheDocument()
    expect(within(evening as HTMLElement).getByText('¥0.25')).toBeInTheDocument()
    expect(morning).not.toBe(evening)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('相同完整规则不因返回顺序或条件字段顺序不同而重复展示', () => {
    const first = { ...inputRule, conditions: { context_window: '128k', quality: 'high' } }
    const output = { ...inputRule, meter_code: 'output_token', unit_price_yuan: '8' }
    render(<ModelTimePricing model={model({ pricing_periods: [
      period({ key: 'morning', name: '峰价', start_minute: 540, end_minute: 720, rules: [first, output] }),
      period({ key: 'afternoon', name: '峰价', start_minute: 840, end_minute: 1080, rules: [output, { ...inputRule, conditions: { quality: 'high', context_window: '128k' } }] }),
    ] })} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('周一至周五 · 09:00–12:00')).toBeInTheDocument()
    expect(screen.getByText('周一至周五 · 14:00–18:00')).toBeInTheDocument()
    expect(screen.getByText(/context_window: 128k/)).toBeInTheDocument()
  })

  it('不同自定义名称和未命名时段分别保留，不因同价而合并', () => {
    const { container } = render(<ModelTimePricing model={model({ pricing_periods: [
      period({ key: 'custom-a', name: '工作时段' }),
      period({ key: 'custom-b', name: '夜间时段' }),
      period({ key: 'unnamed-a', name: '' }),
      period({ key: '默认时间段', name: '  ' }),
    ] })} />)

    expect(container.querySelectorAll('.model-time-pricing-period')).toHaveLength(4)
    expect(screen.getByText('工作时段')).toBeInTheDocument()
    expect(screen.getByText('夜间时段')).toBeInTheDocument()
    expect(screen.getByText('unnamed-a')).toBeInTheDocument()
    expect(screen.getByText('默认时间段')).toBeInTheDocument()
    expect(screen.queryByText('谷价')).toBeNull()
  })

  it('峰价及默认时间段标题支持英文，自定义名称不被覆盖', async () => {
    render(<ModelTimePricing model={model({ pricing_periods: [
      period({ key: 'peak', name: ' 峰价 ' }),
      period({ key: 'fallback', name: '默认时间段  ', default: true }),
      period({ key: 'custom', name: ' 自定义时段 ' }),
    ] })} />)

    await act(async () => { await i18n.changeLanguage('en-US') })

    expect(screen.getByText('Peak')).toBeInTheDocument()
    expect(screen.getByText('Off-peak')).toBeInTheDocument()
    expect(screen.getByText('自定义时段')).toBeInTheDocument()
    expect(screen.queryByText('默认时间段')).toBeNull()
  })

  it('保留所有 Token 阶梯和金额精度，极小单价不显示为零', () => {
    render(<ModelTimePricing model={model({ pricing_periods: [period({ rules: [
      { ...inputRule, upper_bound: 128000, unit_price_yuan: '0.000000000000000001' },
      { ...inputRule, tier_no: 2, lower_bound: 128000, unit_price_yuan: '1.234567890123456789' },
      { ...inputRule, meter_code: 'output_token', unit_price_yuan: '2.00' },
    ] })] })} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getAllByText('输入 tokens')).toHaveLength(2)
    expect(screen.getByText('输出 tokens')).toBeInTheDocument()
    expect(screen.getByText('阶梯 1：0–128,000 tokens')).toBeInTheDocument()
    expect(screen.getByText('阶梯 2：128,000 及以上 tokens')).toBeInTheDocument()
    expect(screen.getByText('¥0.000000000000000001')).toBeInTheDocument()
    expect(screen.getByText('¥1.234567890123456789')).toBeInTheDocument()
    expect(screen.getAllByText('/ 百万 tokens')).toHaveLength(3)
  })

  it('隐藏各计量项唯一且从零开始无上界的阶梯说明，保留价格及实际限制', () => {
    render(<ModelTimePricing model={model({ pricing_periods: [period({ rules: [
      { ...inputRule, conditions: { context_window: '128k' } },
      { ...inputRule, meter_code: 'cache_hit_token', unit_price_yuan: '0.04' },
      { ...inputRule, meter_code: 'output_token', lower_bound: 128000, unit_price_yuan: '8' },
      { ...inputRule, meter_code: 'cache_creation_input_token', upper_bound: 32000, unit_price_yuan: '0.5' },
    ] })] })} />)

    expect(screen.queryByText('阶梯 1：0 及以上 tokens')).toBeNull()
    expect(screen.getByText('¥0.25')).toBeInTheDocument()
    expect(screen.getByText('¥0.04')).toBeInTheDocument()
    expect(screen.getByText('context_window: 128k')).toBeInTheDocument()
    expect(screen.getByText('阶梯 1：128,000 及以上 tokens')).toBeInTheDocument()
    expect(screen.getByText('阶梯 1：0–32,000 tokens')).toBeInTheDocument()
  })

  it('完整显示媒体规格与工具条件，并使用计量项返回的价格单位', () => {
    render(<ModelTimePricing model={model({
      prices: [{ meter_code: 'video_seconds', meter_kind: 'usage', unit: 'second', currency: 'CNY', unit_quantity: 1, unit_price_yuan: '0.8', tier_no: 0 }],
      pricing_periods: [period({ rules: [
        { ...inputRule, kind: 'usage', meter_code: 'video_seconds', tier_no: 0, unit_quantity: 1, width: 1920, height: 1080, quality_level: 'hd', duration_seconds: 5, conditions: { resolution: '1080p', video_input: 'false' } },
        { ...inputRule, kind: 'tool', meter_code: 'search_calls', tier_no: 0, unit_quantity: 1000, tool_code: 'web_search', conditions: { search_context: 'high' } },
      ] })],
    })} />)

    const video = screen.getByText('video_seconds').closest('li')!
    expect(video).toHaveTextContent('1920 × 1080 px')
    expect(video).toHaveTextContent('质量：hd')
    expect(video).toHaveTextContent('时长 5 秒')
    expect(video).toHaveTextContent('分辨率: 1080p')
    expect(video).toHaveTextContent('不含视频输入')
    expect(video).toHaveTextContent('/ 1 秒')
    const tool = screen.getByText('search_calls').closest('li')!
    expect(tool).toHaveTextContent('工具：web_search')
    expect(tool).toHaveTextContent('search_context: high')
    expect(tool).toHaveTextContent('/ 1,000 计量单位')
  })

  it('未知用量使用中性单位，已返回的自定义单位和用途保持可读', () => {
    render(<ModelTimePricing model={model({
      prices: [{ meter_code: 'custom_cached_input', meter_kind: 'custom', unit: 'megapixel', currency: 'CNY', unit_quantity: 10, unit_price_yuan: '0.25', tier_no: 0, purpose: 'cache_hit' }],
      pricing_periods: [period({ rules: [
        { ...inputRule, kind: 'usage', meter_code: 'custom_usage', tier_no: 0, unit_quantity: 50 },
        { ...inputRule, kind: 'usage', meter_code: 'custom_cached_input', tier_no: 0, unit_quantity: 10 },
      ] })],
    })} />)

    expect(screen.getByText('custom_usage').closest('li')).toHaveTextContent('/ 50 计量单位')
    expect(screen.getByText('缓存命中价格').closest('li')).toHaveTextContent('/ 10 megapixel')
    expect(screen.queryByText(/次请求/)).toBeNull()
  })

  it('切换英文后同步翻译时段信息、阶梯、单位和媒体说明', async () => {
    render(<ModelTimePricing model={model({
      pricing_timezone: 'Asia/Shanghai', current_period_key: 'business',
      pricing_periods: [period({ rules: [{ ...inputRule, upper_bound: 128000, quality_level: 'hd', duration_seconds: 5, tool_code: 'web_search' }] }), period({ key: 'fallback', default: true })],
    })} />)

    await act(async () => { await i18n.changeLanguage('en-US') })

    expect(screen.getByText('Time-of-day pricing')).toBeInTheDocument()
    expect(screen.getByText('Time zone: Asia/Shanghai')).toBeInTheDocument()
    expect(screen.getByText('Mon–Fri · 08:00–20:00')).toBeInTheDocument()
    expect(screen.getByText('All other times (default)')).toBeInTheDocument()
    expect(screen.getByText('Current')).toBeInTheDocument()
    expect(screen.getAllByText('Input tokens')).toHaveLength(2)
    expect(screen.getAllByText('/ M tokens')).toHaveLength(2)
    expect(screen.getByText(/Quality: hd/)).toHaveTextContent('Tier 1: 0–128,000 tokens')
    expect(screen.getByText(/Quality: hd/)).toHaveTextContent('Duration: 5 seconds')
    expect(screen.getByText(/Quality: hd/)).toHaveTextContent('Tool: web_search')
    expect(screen.queryByText('Tier 1: 0 and above tokens')).toBeNull()
    expect(screen.queryByText('峰谷价')).toBeNull()
  })
})
