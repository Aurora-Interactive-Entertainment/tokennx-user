import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPublicHomepage, getPublicHomepageAssetURL } from './homepage'

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

    await expect(getPublicHomepage()).resolves.toEqual({ cards: [], promotion_models: [], ad_slots: [], news: [], partners: [] })
  })

  it('响应不是对象时返回可识别的 API 错误', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response([]))

    await expect(getPublicHomepage()).rejects.toMatchObject({ name: 'ApiError', status: 502, code: 100003 })
  })
})
