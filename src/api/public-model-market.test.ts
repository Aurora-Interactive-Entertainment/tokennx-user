import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPublicModelMarket } from './public-model-market'

const basePrice = { meter_kind: 'output_token', unit: 'token', currency: 'CNY', unit_quantity: 1_000_000, unit_price_yuan: '12.000000000000' }

function marketResponse(prices: unknown[]) {
  return new Response(JSON.stringify({ code: 0, msg: 'success', data: {
    version: '1', carousels: [], topics: [{ id: 'video', status: 'active', sort_order: 0, name: '视频', model_ids: ['video-1'], models: [{ id: 'video-1', name: 'Video 1', company: 'Example', modality: 'video', prices }] }],
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
})
