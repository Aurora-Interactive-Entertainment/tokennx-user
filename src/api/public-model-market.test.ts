import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPublicModelMarket } from './public-model-market'

const basePrice = { meter_kind: 'output_token', unit: 'token', currency: 'CNY', unit_quantity: 1_000_000, unit_price_yuan: '12.000000000000' }

function marketResponse(prices: unknown[], modelFields: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ code: 0, msg: 'success', data: {
    version: '1', carousels: [], topics: [{ id: 'video', status: 'active', sort_order: 0, name: '视频', model_ids: ['video-1'], models: [{ id: 'video-1', name: 'Video 1', company: 'Example', modality: 'video', prices, ...modelFields }] }],
  } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('公开模型报价解析', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('保留同计费项报价的分辨率和视频输入条件', async () => {
    const prices = [
      { ...basePrice, conditions: { resolution: '720p', video_input: 'false' } },
      { ...basePrice, unit_price_yuan: '18.000000000000', conditions: { resolution: '720p', video_input: 'true' } },
    ]
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(marketResponse(prices))
    const result = await getPublicModelMarket()
    expect(result.topics[0].models?.[0].prices).toEqual(prices)
  })

  it('保留未知 JSON 条件，不编造或删除后端规格', async () => {
    const price = { ...basePrice, conditions: { fps: 24, premium: false, modes: ['standard', 'fast'], range: { min: 1, max: 10 } } }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(marketResponse([price]))
    const result = await getPublicModelMarket()
    expect(result.topics[0].models?.[0].prices).toEqual([price])
  })

  it('无条件和格式异常的条件均不影响原有有效价格', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(marketResponse([basePrice, { ...basePrice, conditions: ['invalid'] }, { ...basePrice, conditions: null }]))
    const result = await getPublicModelMarket()
    expect(result.topics[0].models?.[0].prices).toEqual([basePrice, basePrice, basePrice])
  })

  it('保留现价的计量项、时段、阶梯和媒体规格，供对应官方原价匹配', async () => {
    const price = { ...basePrice, meter_code: 'video_output_token', tier_no: 2, lower_bound: 128000, upper_bound: 256000, selector_meter_code: 'input_token', period_key: 'business', rule_kind: 'usage', width: 1280, height: 720, quality_level: 'standard', duration_seconds: 5, tool_code: 'render', conditions: { resolution: '720p', video_input: 'false' } }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(marketResponse([price]))
    const result = await getPublicModelMarket()
    expect(result.topics[0].models?.[0].prices).toEqual([price])
  })

  it('官方报价保留原币种、精度、字符串阶梯边界以及 false，避免把平台现价当原价', async () => {
    const templatePrice = { meter_type: 'input_token', meter_unit: 'token', tier_no: 1, tier_condition_meter: 'input_token', tier_lower_bound: '0', tier_upper_bound: '9007199254740993', currency: 'USD', unit_quantity: 1000000, unit_price: '30.000000000001', price_type_description: '输入价格', discount_description: '', discount_validity: '', limited_free: false, source_url: 'https://example.com/pricing', captured_on: '2026-09-17', quality_level: 'hd', duration_seconds: 5 }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(marketResponse([basePrice], { template_id: 'official', template_prices: [templatePrice] }))
    const result = await getPublicModelMarket()
    expect(result.topics[0].models?.[0]).toMatchObject({ prices: [basePrice], template_id: 'official', template_prices: [templatePrice] })
  })

  it.each([null, []])('旧官方报价为 %j 时仍保留官方时段原价和独立时区', async (templatePrices) => {
    const rule = { kind: 'token', meter_code: 'input_token', tier_no: 1, lower_bound: 0, unit_quantity: 1000000, unit_price_yuan: '8.000000000000', rounding_mode: 'half_up', upper_bound: 128000, conditions: { mode: 'standard' } }
    const period = { key: 'official-business', name: '日间', default: false, weekday_mask: 31, start_minute: 480, end_minute: 1200, rules: [rule] }
    const modelFields = { pricing_timezone: 'UTC', pricing_periods: [{ ...period, key: 'sale', rules: [{ ...rule, unit_price_yuan: '6.4' }] }], current_period_key: 'sale', template_prices: templatePrices, template_pricing_timezone: 'Asia/Shanghai', template_pricing_periods: [period] }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(marketResponse([basePrice], modelFields))
    const result = await getPublicModelMarket()
    expect(result.topics[0].models?.[0]).toMatchObject(modelFields)
  })

  it('无效官方报价或时段不导致有效现价丢失，缺失字段不编造原价', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(marketResponse([basePrice], { template_prices: [null, {}, { meter_type: 'input_token', unit_price: 8 }], template_pricing_periods: [{ key: 'bad' }] }))
    const result = await getPublicModelMarket()
    expect(result.topics[0].models?.[0]).toMatchObject({ prices: [basePrice], template_prices: [], template_pricing_periods: [] })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(marketResponse([basePrice]))
    const legacy = await getPublicModelMarket()
    expect(legacy.topics[0].models?.[0]).not.toHaveProperty('template_prices')
    expect(legacy.topics[0].models?.[0]).not.toHaveProperty('template_pricing_periods')
  })
})
