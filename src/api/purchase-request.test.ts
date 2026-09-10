import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccessToken } from '@/auth/token-storage'
import { fetchAuthenticatedJson } from './authenticated'
import { ApiError, fetchJson } from './http'
import { fetchPurchaseJson } from './purchase-request'

vi.mock('@/auth/token-storage', () => ({ getAccessToken: vi.fn() }))
vi.mock('./authenticated', () => ({ fetchAuthenticatedJson: vi.fn() }))
vi.mock('./http', async (original) => ({ ...await original<object>(), fetchJson: vi.fn() }))

describe('公开套餐临时联调请求', () => {
  beforeEach(() => vi.resetAllMocks())
  it('没有令牌也发送请求，服务端 401 原样返回', async () => {
    vi.mocked(getAccessToken).mockReturnValue(null)
    const error = new ApiError('未登录', 401, 160001, null)
    vi.mocked(fetchJson).mockRejectedValue(error)
    await expect(fetchPurchaseJson('/api/user/payment/orders', { guestDebug: true, method: 'POST', body: { plan_id: 'real-plan-id', quantity: 1 } })).rejects.toBe(error)
    expect(fetchJson).toHaveBeenCalledWith('/api/user/payment/orders', expect.objectContaining({ method: 'POST', accessToken: undefined, body: { plan_id: 'real-plan-id', quantity: 1 } }))
    expect(fetchAuthenticatedJson).not.toHaveBeenCalled()
  })
  it('普通入口仍使用原认证流程，调试入口携带已有令牌', async () => {
    await fetchPurchaseJson('/api/user/payment/orders')
    expect(fetchAuthenticatedJson).toHaveBeenCalledOnce()
    vi.mocked(getAccessToken).mockReturnValue('existing-test-token')
    await fetchPurchaseJson('/api/user/payment/orders', { guestDebug: true })
    expect(fetchJson).toHaveBeenCalledWith('/api/user/payment/orders', { accessToken: 'existing-test-token' })
  })
})
