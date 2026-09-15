import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import { getProductPlans, getPublicProductPlans, getPurchasedProductPlans, getRecentProductPlanPurchases } from './product-plans'

const publicPlan = {
  id: 'real-plan-1', code: 'text-1m', name: '文本套餐', display_name: '文本套餐', type: 'model_quota_bundle', description: '日常调用',
  group_name: '文本模型', group_sort_order: 10, cover_url: '', model_id: 'model-1', model_code: 'text', model_name: '文本模型', model_count: 1,
  models: [{ model_id: 'model-1', model_code: 'text', model_name: '文本模型', model_type: 'text', entitlement_mode: 'token_quota', token_quota: '9007199254740993', request_quota: null, discount_rate: null }],
  price: { price_cent: '9900', currency: 'CNY', validity_seconds: 2592000 },
  rpm_limit: 60, tpm_limit: 100000, concurrency_limit: 5, first_purchase_bonus_token: '100000', first_purchase_bonus_request: 0,
}

describe('公开与用户套餐列表接口', () => {
  beforeEach(() => saveAuthTokens({ status: 'succeeded', binding_required: false, access_token: 'plan-token', refresh_token: 'refresh', refresh_expires_at: Date.UTC(2099, 0, 1) }))
  afterEach(() => { vi.restoreAllMocks(); clearAuthTokens() })

  it.each([true, false])('公开目录无需登录且不携带令牌，已有令牌=%s', async (loggedIn) => {
    if (!loggedIn) clearAuthTokens()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { items: [publicPlan], total: 1, page: 2, page_size: 20 } })))
    const result = await getPublicProductPlans('enterprise', { page: 2, page_size: 20 })
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/product-plans?account_type=enterprise&page=2&page_size=20')
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization')).toBe(false)
    expect(result.items[0].models[0].token_quota).toBe('9007199254740993')
    expect(result.items[0]).not.toHaveProperty('can_purchase')
    expect(result.items[0]).not.toHaveProperty('purchase_limit')
  })

  it('登录目录携带令牌及企业上下文，完整保留购买资格', async () => {
    const item = { ...publicPlan, can_purchase: false, stock_remaining: 0, purchase_limit: 3, purchased_count: 3, first_purchase_bonus_available: false }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { items: [item], total: 1, page: 1, page_size: 100 } })))
    const result = await getProductPlans({ account_type: 'enterprise', enterprise_id: 'ent-1' })
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/user/product-plans?account_type=enterprise&enterprise_id=ent-1&page=1&page_size=100')
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer plan-token')
    expect(result.items[0]).toEqual(item)
  })

  it('已购套餐接口携带主体、状态和分页参数，并保留额度字符串', async () => {
    const purchased = {
      id: 'entitlement-1', plan_id: 'real-plan-1', plan_code: 'text-1m', plan_name: '文本套餐', display_name: '文本套餐',
      account_type: 'enterprise', status: 'active', paid_amount_cent: '9900', order_no: 'order-1', starts_at: 1, expires_at: 2,
      activated_at: 1, terminated_at: null, termination_reason: '', models: [{
        model_id: 'model-1', model_code: 'text', model_name: '文本模型', model_type: 'text', entitlement_mode: 'token_quota',
        token_quota_total: '9007199254740993', token_quota_used: '1', token_quota_frozen: '0', token_quota_remaining: '9007199254740992',
        request_quota_total: null, request_quota_used: null, request_quota_frozen: null, request_quota_remaining: null,
      }],
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { items: [purchased], total: 1, page: 2, page_size: 20 } })))
    const result = await getPurchasedProductPlans({ account_type: 'enterprise', enterprise_id: 'ent-1' }, { status: 'active', page: 2, page_size: 20 })
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/user/product-plans/purchased?account_type=enterprise&enterprise_id=ent-1&status=active&page=2&page_size=20')
    expect(result.items[0].models[0].token_quota_remaining).toBe('9007199254740992')
  })

  it('读取公开最近购买动态，不携带登录令牌并过滤无效记录', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 0, data: {
      items: [
        { purchase_time: 1789000000000, buyer_phone: '138****5678', plan_title: '专业套餐', price_cent: '9900', price_yuan: '99.00' },
        { purchase_time: 'invalid', buyer_phone: '', plan_title: '无效', price_cent: '1', price_yuan: '0.01' },
      ],
    } })))
    const result = await getRecentProductPlanPurchases()
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/product-plans/purchases/recent?limit=5')
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization')).toBe(false)
    expect(result.items).toEqual([{ purchase_time: 1789000000000, buyer_phone: '138****5678', plan_title: '专业套餐', price_cent: '9900', price_yuan: '99.00' }])
  })
})
