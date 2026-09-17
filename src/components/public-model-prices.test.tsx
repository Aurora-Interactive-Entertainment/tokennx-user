import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { PublicMarketPrice, PublicMarketTemplatePrice } from '@/api/public-model-market'
import type { UserModelPricingPeriod, UserModelPricingRule } from '@/api/user-models'
import { PublicModelPrices } from './public-model-prices'

const basePrice: PublicMarketPrice = {
  meter_code: 'output_token', meter_kind: 'output_token', unit: 'token', currency: 'CNY',
  unit_quantity: 1_000_000, unit_price_yuan: '12.000000000000', tier_no: 1, lower_bound: 0,
}
const inputPrice: PublicMarketPrice = { ...basePrice, meter_code: 'input_token', meter_kind: 'input_token', unit_price_yuan: '6.4' }

function templatePrice(overrides: Partial<PublicMarketTemplatePrice> = {}): PublicMarketTemplatePrice {
  return {
    meter_type: 'output_token', meter_unit: 'token', tier_no: 1, tier_condition_meter: '',
    tier_lower_bound: '0', tier_upper_bound: '', currency: 'CNY', unit_quantity: 1_000_000,
    unit_price: '20.000000000000', price_type_description: '', discount_description: '',
    discount_validity: '', limited_free: false, source_url: '', captured_on: '', ...overrides,
  }
}

function rule(overrides: Partial<UserModelPricingRule> = {}): UserModelPricingRule {
  return {
    kind: 'token', meter_code: 'output_token', tier_no: 1, lower_bound: 0,
    unit_quantity: 1_000_000, unit_price_yuan: '20', rounding_mode: 'up', ...overrides,
  }
}

function period(overrides: Partial<UserModelPricingPeriod> = {}): UserModelPricingPeriod {
  return {
    key: 'default', name: '默认', default: true, weekday_mask: 127,
    start_minute: 0, end_minute: 1440, rules: [rule()], ...overrides,
  }
}

const priceCell = (label: string) => screen.getByText(label).closest('div')!

beforeEach(async () => { await i18n.changeLanguage('zh-CN') })
afterEach(async () => { vi.useRealTimers(); await i18n.changeLanguage('zh-CN') })

describe('公开模型输入输出原价与现价', () => {
  it('缓存位于最前也仅展示固定输入输出两格，隐藏工具与额外规格', () => {
    const { container } = render(<PublicModelPrices prices={[
      { ...basePrice, meter_code: 'cache_read_token', meter_kind: 'cache_read_token', unit_price_yuan: '1.6' },
      { ...basePrice, meter_code: 'tool_calls', meter_kind: 'tool', unit: 'request', unit_quantity: 1, unit_price_yuan: '0.2' },
      basePrice, inputPrice,
      { ...basePrice, tier_no: 2, lower_bound: 128_000, unit_price_yuan: '30' },
    ]} />)
    expect(Array.from(container.querySelectorAll('dt')).map((item) => item.textContent)).toEqual(['输入 / M Tokens', '输出 / M Tokens'])
    expect(priceCell('输入 / M Tokens').querySelector('strong')).toHaveTextContent('¥6.4')
    expect(priceCell('输出 / M Tokens').querySelector('strong')).toHaveTextContent('¥12')
    expect(screen.queryByText(/缓存|工具|价格档位|分辨率/)).toBeNull()
    expect(container.querySelector('.models-showcase-card-prices--scroll')).toBeNull()
  })

  it('选择基础阶梯与不含视频输入的规格，而非数组首个高价档位', () => {
    render(<PublicModelPrices prices={[
      { ...basePrice, tier_no: 2, lower_bound: 128_000, unit_price_yuan: '30', conditions: { resolution: '720p', video_input: 'false' } },
      { ...basePrice, unit_price_yuan: '18', conditions: { resolution: '720p', video_input: 'true' } },
      { ...basePrice, conditions: { resolution: '720p', video_input: false } },
    ]} />)
    expect(priceCell('输出 / M Tokens').querySelector('strong')).toHaveTextContent('¥12')
    expect(screen.queryByText(/720p|视频输入/)).toBeNull()
  })

  it('使用接口提供的官方原价，不按折扣推算也不把原价改成现价', () => {
    render(<PublicModelPrices prices={[inputPrice, basePrice]} templatePrices={[
      templatePrice({ meter_type: 'input_token', unit_price: '8' }),
      templatePrice({ unit_price: '10' }),
    ]} />)
    expect(priceCell('输入 / M Tokens').querySelector('del')).toHaveTextContent('¥8')
    expect(priceCell('输入 / M Tokens').querySelector('strong')).toHaveTextContent('¥6.4')
    expect(priceCell('输出 / M Tokens').querySelector('del')).toHaveTextContent('¥10')
    expect(priceCell('输出 / M Tokens').querySelector('strong')).toHaveTextContent('¥12')
  })

  it('原价和现价的零值均有效，缺失原价保留空位而不编造', () => {
    const { rerender } = render(<PublicModelPrices prices={[{ ...inputPrice, unit_price_yuan: '0' }, basePrice]} templatePrices={[
      templatePrice({ meter_type: 'input_token', unit_price: '0' }),
    ]} />)
    const input = priceCell('输入 / M Tokens')
    expect(input.querySelector('del')).toHaveTextContent('¥0')
    expect(input.querySelector('strong')).toHaveTextContent('¥0')
    expect(priceCell('输出 / M Tokens').querySelector('del')).toBeNull()
    rerender(<PublicModelPrices prices={[]} />)
    expect(screen.getAllByText('--')).toHaveLength(2)
    expect(document.querySelectorAll('dt')).toHaveLength(2)
    expect(document.querySelector('del')).toBeNull()
  })

  it('按原计量单位、币种和字符串精度展示原价与现价', async () => {
    render(<PublicModelPrices prices={[
      { ...inputPrice, unit_quantity: 1000, unit_price_yuan: '0.002000000000' },
      { ...basePrice, currency: 'USD', unit_price_yuan: '4.000100000000000001' },
    ]} templatePrices={[
      templatePrice({ meter_type: 'input_token', unit_quantity: 1000, unit_price: '0.003000000000' }),
      templatePrice({ currency: 'USD', unit_price: '6.123456789012345678' }),
    ]} />)
    expect(priceCell('输入 / 1000 token').querySelector('del')).toHaveTextContent('¥0.003')
    expect(priceCell('输入 / 1000 token').querySelector('strong')).toHaveTextContent('¥0.002')
    expect(priceCell('输出 / M Tokens').querySelector('del')).toHaveTextContent('USD6.123456789012345678')
    expect(priceCell('输出 / M Tokens').querySelector('strong')).toHaveTextContent('USD4.000100000000000001')
    await act(async () => { await i18n.changeLanguage('en-US') })
    expect(screen.getByText('Input / 1000 token')).toBeInTheDocument()
    expect(screen.getByText('Output / M Tokens')).toBeInTheDocument()
  })

  it('优先使用官方时段规则，并按照官方时区选择当前生效原价', () => {
    // UTC 已过零点而上海为工作时段，防止按浏览器本地时区选到错误原价。
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-17T02:00:00Z'))
    render(<PublicModelPrices prices={[basePrice]} templatePrices={[templatePrice({ unit_price: '99' })]}
      templatePricingTimezone="Asia/Shanghai" templatePricingPeriods={[
        period({ rules: [rule({ unit_price_yuan: '40' })] }),
        period({ key: 'daytime', name: '工作时段', default: false, weekday_mask: 31, start_minute: 480, end_minute: 1200, rules: [rule({ unit_price_yuan: '20' })] }),
      ]} />)
    expect(priceCell('输出 / M Tokens').querySelector('del')).toHaveTextContent('¥20')
    expect(priceCell('输出 / M Tokens').querySelector('strong')).toHaveTextContent('¥12')
  })

  it('仅配对同计量项、阶梯、单位数量和条件的官方原价', () => {
    render(<PublicModelPrices prices={[{ ...basePrice, conditions: { resolution: '720p', video_input: false } }]}
      templatePricingPeriods={[period({ rules: [
        rule({ unit_price_yuan: '80', conditions: { resolution: '1080p', video_input: 'false' } }),
        rule({ unit_price_yuan: '60', conditions: { resolution: '720p', video_input: 'true' } }),
        rule({ tier_no: 2, lower_bound: 128_000, unit_price_yuan: '50', conditions: { resolution: '720p', video_input: 'false' } }),
        rule({ unit_quantity: 1000, unit_price_yuan: '0.02', conditions: { resolution: '720p', video_input: 'false' } }),
        rule({ unit_price_yuan: '20', conditions: { resolution: '720p', video_input: 'false' } }),
      ] })]} />)
    expect(priceCell('输出 / M Tokens').querySelector('del')).toHaveTextContent('¥20')
  })

  it('找不到同规格原价时不拿其他分辨率或无规格旧报价代替', () => {
    render(<PublicModelPrices prices={[{ ...basePrice, conditions: { resolution: '720p', video_input: 'false' } }]}
      templatePrices={[templatePrice({ unit_price: '99' })]}
      templatePricingPeriods={[period({ rules: [rule({ unit_price_yuan: '80', conditions: { resolution: '1080p', video_input: 'false' } })] })]} />)
    expect(priceCell('输出 / M Tokens').querySelector('del')).toBeNull()
    expect(priceCell('输出 / M Tokens').querySelector('strong')).toHaveTextContent('¥12')
  })

  it('旧官方报价也按阶梯、质量和时长匹配，避免同边界的其他规格冒充原价', () => {
    render(<PublicModelPrices prices={[{ ...basePrice, quality_level: 'hd', duration_seconds: 5 }]} templatePrices={[
      templatePrice({ tier_no: 2, unit_price: '99', quality_level: 'hd', duration_seconds: 5 }),
      templatePrice({ unit_price: '80', quality_level: 'sd', duration_seconds: 5 }),
      templatePrice({ unit_price: '60', quality_level: 'hd', duration_seconds: 10 }),
      templatePrice({ unit_price: '20', quality_level: 'hd', duration_seconds: 5 }),
    ]} />)
    expect(priceCell('输出 / M Tokens').querySelector('del')).toHaveTextContent('¥20')
  })

  it('官方未分阶梯原价可匹配无上界基础档，有上界时不擅自配对', () => {
    const official = [templatePrice({ tier_no: 0 })]
    const { rerender } = render(<PublicModelPrices prices={[basePrice]} templatePrices={official} />)
    expect(priceCell('输出 / M Tokens').querySelector('del')).toHaveTextContent('¥20')
    rerender(<PublicModelPrices prices={[{ ...basePrice, upper_bound: 128_000 }]} templatePrices={official} />)
    expect(priceCell('输出 / M Tokens').querySelector('del')).toBeNull()
  })

  it('非法分母显示不可用状态，不把无效金额伪装成报价', () => {
    render(<PublicModelPrices prices={[{ ...basePrice, unit_quantity: 0 }]} templatePrices={[templatePrice()]} />)
    expect(screen.getAllByText('--')).toHaveLength(2)
    expect(document.querySelector('del')).toBeNull()
    expect(screen.queryByTitle(/¥|CNY/)).toBeNull()
  })
})
