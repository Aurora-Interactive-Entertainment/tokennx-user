import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPublicHomepage, getPublicHomepageAssetURL, getPublicHomepageStats } from './homepage'

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ code: 0, msg: 'success', data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('公开首页内容 API', () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('只为合法公开对象 ID生成首页媒体地址', () => {
    expect(getPublicHomepageAssetURL(' 01J00000000000000000000001 ')).toBe('/api/homepage/assets/01J00000000000000000000001')
    expect(getPublicHomepageAssetURL('not-an-object-id')).toBeUndefined()
    expect(getPublicHomepageAssetURL(undefined)).toBeUndefined()
  })

  it('读取五类首页内容并将空数组响应归一化', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      cards: [{ id: 'card-1', kind: 'card', status: 'active', sort_order: 1, pinned: false, data: { translations: { 'zh-CN': { title: '能力' } } } }],
      promotion_models: null,
      ad_slots: [],
      news: [{ id: 'news-1', kind: 'news', status: 'active', sort_order: 1, pinned: true, data: { translations: { 'zh-CN': { title: '动态', summary: '摘要', content_html: '<p>正文</p>' } } } }],
      partners: undefined,
    }))

    await expect(getPublicHomepage()).resolves.toMatchObject({
      cards: [{ id: 'card-1' }],
      promotion_models: [],
      news: [{ pinned: true }],
      partners: [],
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/homepage', expect.objectContaining({ credentials: 'omit' }))
  })

  it('过滤不符合资源类型或基本字段的公开条目', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      cards: [
        { id: 'wrong-kind', kind: 'news', status: 'active', sort_order: 1, pinned: false, data: {} },
        { id: 'missing-data', kind: 'card', status: 'active', sort_order: 1, pinned: false },
      ],
    }))

    await expect(getPublicHomepage()).resolves.toEqual({ cards: [], promotion_models: [], ad_slots: [], news: [], partners: [], promotion: [] })
  })

  it('首次匿名读取复用 HTML 阶段的首页预请求', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    window.__TOKEN_NX_HOMEPAGE_REQUEST__ = Promise.resolve({
      cards: [{ id: 'preloaded-card', kind: 'card', status: 'active', sort_order: 1, pinned: false, data: {} }],
      promotion_models: [],
      ad_slots: [],
      news: [],
      partners: [],
      promotion: [],
    })

    await expect(getPublicHomepage()).resolves.toMatchObject({ cards: [{ id: 'preloaded-card' }] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('读取优惠模型详情、价格和登录后推广数据，并为登录请求携带令牌', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      cards: [],
      promotion_models: [{
        id: 'promotion-1',
        kind: 'promotion_model',
        status: 'active',
        sort_order: 0,
        pinned: false,
        data: { discount_kind: 'half', translations: { 'zh-CN': { title: 'Kimi 2.6' } } },
        model: {
          id: 'model-1',
          alias: 'moonshotai/kimi-k2.6',
          name: 'moonshotai/kimi-k2.6',
          company: 'Moonshot AI',
          modality: 'text',
          prices: [
            { meter_kind: 'input_token', unit_price_yuan: '1.000000000000', unit_quantity: 1_000_000 },
            { meter_kind: 'output_token', unit_price_yuan: '2.000000000000', unit_quantity: 1_000_000 },
          ],
          availability: {
            rate: 79,
            hourly: [
              { hour_start: 1786946400000, rate: 0, sample_count: 1, success_count: 0 },
              { hour_start: 1786950000000, rate: 79, sample_count: 100, success_count: 79 },
            ],
          },
        },
      }],
      ad_slots: [],
      news: [],
      partners: [],
      promotion: [{ id: 'member-promotion' }],
    }))

    await expect(getPublicHomepage('access-token')).resolves.toMatchObject({
      promotion_models: [{
        model: {
          alias: 'moonshotai/kimi-k2.6',
          prices: [{ meter_kind: 'input_token', unit_price_yuan: '1.000000000000' }, { meter_kind: 'output_token' }],
          availability: {
            rate: 79,
            hourly: [
              { hour_start: 1786946400000, rate: 0, sample_count: 1, success_count: 0 },
              { hour_start: 1786950000000, rate: 79, sample_count: 100, success_count: 79 },
            ],
          },
        },
      }],
      promotion: [{ id: 'member-promotion' }],
    })
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers)
    expect(headers.get('Authorization')).toBe('Bearer access-token')
  })

  it('响应不是对象时返回可识别的 API 错误', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response([]))

    await expect(getPublicHomepage()).rejects.toMatchObject({ name: 'ApiError', status: 502, code: 100003 })
  })

  it('读取首页累计统计并兼容数字字符串', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ token_total: '11820495', api_call_total: 800, generated_at: 1786086854834 }))

    await expect(getPublicHomepageStats()).resolves.toEqual({ tokenVolume: 11, apiCalls: 800 })
    expect(fetchMock).toHaveBeenCalledWith('/api/homepage/stats', expect.objectContaining({ credentials: 'omit' }))
  })

  it('首页累计统计字段无效时拒绝更新数据', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ token_total: -1, api_call_total: 'invalid' }))

    await expect(getPublicHomepageStats()).rejects.toMatchObject({ name: 'ApiError', status: 502, code: 100003 })
  })
})
