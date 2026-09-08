import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import { ApiError } from './http'
import { getProductPlanDetail } from './product-plans'

describe('套餐详情接口', () => {
  beforeEach(() => {
    saveAuthTokens({ status: 'succeeded', binding_required: false, access_token: 'plan-token', refresh_token: 'refresh', refresh_expires_at: Date.UTC(2099, 0, 1) })
  })
  afterEach(() => { vi.restoreAllMocks(); clearAuthTokens() })

  it('按文档路径和主体类型查询详情，并保留字符串权益字段', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 0, msg: 'success', data: {
      id: 'plan/1', code: 'starter', name: '入门', type: 'quota_bundle', description: '', account_type: 'enterprise', display_name: '入门',
      price: { price_cent: '9900', currency: 'CNY', validity_seconds: 2592000 }, model_count: 1,
      models: [{ model_id: 'model-1', model_code: 'text', model_name: '文本', model_type: 'text', entitlement_mode: 'token_quota', token_quota: '1000000.125', request_quota: null, discount_rate: null }],
    } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const detail = await getProductPlanDetail({ account_type: 'enterprise', enterprise_id: 'ent-1' }, ' plan/1 ')
    expect(detail.models[0]?.token_quota).toBe('1000000.125')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/user/product-plans/plan%2F1?account_type=enterprise')
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer plan-token')
  })

  it('拒绝空套餐 ID 并返回统一参数错误', async () => {
    await expect(getProductPlanDetail({ account_type: 'personal' }, '  ')).rejects.toMatchObject({ status: 400, code: 100001 } satisfies Partial<ApiError>)
  })
})
