import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBillingPaymentOrder, type BillingContext, type BillingPaymentOrder } from '@/api/billing'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import { usePaymentReturn } from './use-payment-return'

vi.mock('@/api/billing', async (original) => ({ ...await original<object>(), getBillingPaymentOrder: vi.fn() }))
const ORDER = { id: 'return-order', status: 'paying', paid_at: null } as BillingPaymentOrder
function signIn(id: string) {
  saveAuthTokens({ status: 'succeeded', binding_required: false, access_token: `${id}-access`, refresh_token: `${id}-refresh`, refresh_expires_at: Date.UTC(2099, 0, 1), user: { id, display_name: id, avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' } })
}
function props(context: BillingContext = { account_type: 'personal' }) { return { context, orderID: ORDER.id, onAuthFailure: vi.fn(), onSettled: vi.fn() } }

describe('支付回跳查询隔离', () => {
  beforeEach(() => {
    vi.resetAllMocks(); localStorage.clear(); sessionStorage.clear()
    clearAuthTokens({ force: true, broadcast: false }); signIn('user-a')
  })
  afterEach(cleanup)

  it('账号切换即中止相同订单ID的旧查单，迟到响应不能覆盖新账号', async () => {
    let resolveOld!: (order: BillingPaymentOrder) => void
    vi.mocked(getBillingPaymentOrder).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve })).mockResolvedValue({ ...ORDER, status: 'paid', paid_at: Date.now(), user_id: 'user-b' })
    const options = props()
    const { result, rerender } = renderHook((value) => usePaymentReturn(value), { initialProps: options })
    await act(async () => {})
    const signal = vi.mocked(getBillingPaymentOrder).mock.calls[0][1]?.signal
    clearAuthTokens({ force: true, broadcast: false }); signIn('user-b')
    rerender({ ...options })
    await act(async () => {})
    expect(signal?.aborted).toBe(true)
    expect(getBillingPaymentOrder).toHaveBeenCalledTimes(2)
    await act(async () => resolveOld({ ...ORDER, user_id: 'user-a' }))
    expect(result.current.state.data?.user_id).toBe('user-b')
    expect(options.onSettled).toHaveBeenCalledTimes(1)
  })

  it('切换企业不会显示旧主体数据，离开时中止查询', async () => {
    let resolveOld!: (order: BillingPaymentOrder) => void
    vi.mocked(getBillingPaymentOrder).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve })).mockResolvedValue({ ...ORDER, status: 'closed', account_type: 'enterprise', enterprise_id: 'enterprise-b' })
    const options = props({ account_type: 'enterprise', enterprise_id: 'enterprise-a' })
    const { result, rerender, unmount } = renderHook((value) => usePaymentReturn(value), { initialProps: options })
    rerender({ ...options, context: { account_type: 'enterprise', enterprise_id: 'enterprise-b' } })
    expect(result.current.state.data).toBeNull()
    await act(async () => {})
    await act(async () => resolveOld({ ...ORDER, account_type: 'enterprise', enterprise_id: 'enterprise-a' }))
    expect(result.current.state.data?.enterprise_id).toBe('enterprise-b')
    unmount()
    expect(vi.mocked(getBillingPaymentOrder).mock.calls[1][1]?.signal?.aborted).toBe(true)
  })

  it('错配查单结果不作为成功展示，手动重试合法结果后只通知到账一次', async () => {
    vi.mocked(getBillingPaymentOrder).mockResolvedValueOnce({ ...ORDER, id: 'wrong-id', status: 'paid', paid_at: Date.now() }).mockResolvedValue({ ...ORDER, status: 'paid', paid_at: Date.now() })
    const options = props()
    const { result } = renderHook(() => usePaymentReturn(options))
    await act(async () => {})
    expect(result.current.state.status).toBe('error')
    expect(options.onSettled).not.toHaveBeenCalled()
    await act(async () => result.current.retry())
    expect(result.current.state.status).toBe('success')
    await act(async () => result.current.retry())
    expect(options.onSettled).toHaveBeenCalledTimes(1)
  })
})
