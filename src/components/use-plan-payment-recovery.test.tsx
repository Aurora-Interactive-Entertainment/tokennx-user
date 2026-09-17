import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeBillingPaymentOrder, createBillingPaymentOrder, getBillingPaymentOrder, startBillingPayment, type BillingPaymentOrder } from '@/api/billing'
import { paymentIntentScope, readPendingPaymentIntent } from '@/api/pending-payment-intent'
import { usePlanPayment } from './use-plan-payment'

const identity = vi.hoisted(() => ({ userID: '' }))
vi.mock('@/auth/token-storage', async original => ({ ...await original<object>(), getAccessTokenUserId: () => identity.userID }))
vi.mock('@/api/billing', async original => ({ ...await original<object>(), createBillingPaymentOrder: vi.fn(), getBillingPaymentOrder: vi.fn(), startBillingPayment: vi.fn(), closeBillingPaymentOrder: vi.fn() }))
vi.mock('@/observability/payment-log', () => ({ recordPaymentTransition: vi.fn() }))

const context = { account_type: 'enterprise' as const, enterprise_id: 'enterprise-1' }
const pending = { id: 'order-1', status: 'pending', amount_yuan: '12.50', amount_cent: '1250', order_type: 'plan_purchase', account_type: 'enterprise', enterprise_id: 'enterprise-1', paid_at: null } as BillingPaymentOrder
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  identity.userID = crypto.randomUUID()
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request'))
  vi.mocked(createBillingPaymentOrder).mockResolvedValue(pending)
  vi.mocked(getBillingPaymentOrder).mockImplementation(async id => ({ ...pending, id }))
  vi.mocked(startBillingPayment).mockImplementation(async (id, _key, options) => ({ order: { ...pending, id }, transaction: { payment_product: options?.channel === 'alipay' ? 'alipay_page' : 'wechat_native', amount_cent: '1250' } as never, qrcode_url: 'weixin://test/order', payment_url: 'https://qr.alipay.com/test' }))
  vi.mocked(closeBillingPaymentOrder).mockResolvedValue({ ...pending, status: 'closed' })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('套餐待付会话恢复与操作互斥', () => {
  it('离开后重新同意恢复原订单和支付键，未同意时不启动付款', async () => {
    const first = renderHook(() => usePlanPayment(context, 'plan-1'))
    expect(readPendingPaymentIntent(paymentIntentScope(context, 'plan', 'plan-1'))).toBeNull()
    await act(() => first.result.current.setAgreed(true))
    const payKey = vi.mocked(startBillingPayment).mock.calls[0][1]
    first.unmount()
    const second = renderHook(() => usePlanPayment(context, 'plan-1'))
    expect(second.result.current.agreed).toBe(false)
    expect(startBillingPayment).toHaveBeenCalledOnce()
    await act(() => second.result.current.setAgreed(true))
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce()
    expect(startBillingPayment).toHaveBeenLastCalledWith('order-1', payKey, expect.any(Object), context)
    expect(second.result.current.qr).toBe('weixin://test/order')
    expect(readPendingPaymentIntent(paymentIntentScope(context, 'plan', 'plan-1'))).toMatchObject({ orderID: 'order-1', amountYuan: '12.50' })
  })

  it('创建响应丢失后重新进入保留创建幂等键和相同请求体', async () => {
    vi.mocked(createBillingPaymentOrder).mockRejectedValueOnce(new TypeError('network'))
    const first = renderHook(() => usePlanPayment(context, 'plan-1'))
    await act(() => first.result.current.setAgreed(true))
    const createKey = vi.mocked(createBillingPaymentOrder).mock.calls[0][2]
    first.unmount()
    const second = renderHook(() => usePlanPayment(context, 'plan-1'))
    await act(() => second.result.current.setAgreed(true))
    expect(createBillingPaymentOrder).toHaveBeenLastCalledWith(context, { plan_id: 'plan-1', quantity: 1 }, createKey, expect.any(Object))
    expect(second.result.current.order?.id).toBe('order-1')
  })

  it('两个预先挂载的入口共享同一创建意图，不使用两个独立创建键', async () => {
    const first = renderHook(() => usePlanPayment(context, 'plan-1'))
    const second = renderHook(() => usePlanPayment(context, 'plan-1'))
    await act(() => first.result.current.setAgreed(true))
    await act(() => second.result.current.setAgreed(true))
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce()
    expect(new Set(vi.mocked(startBillingPayment).mock.calls.map(call => call[1])).size).toBe(1)
  })

  it('两个入口同时创建且结果在途时，创建和支付均使用相同幂等键', async () => {
    const creating = deferred<BillingPaymentOrder>()
    vi.mocked(createBillingPaymentOrder).mockReturnValue(creating.promise)
    const first = renderHook(() => usePlanPayment(context, 'plan-1'))
    const second = renderHook(() => usePlanPayment(context, 'plan-1'))
    let requests!: Promise<void>[]
    act(() => { requests = [first.result.current.setAgreed(true), second.result.current.setAgreed(true)] })
    expect(new Set(vi.mocked(createBillingPaymentOrder).mock.calls.map(call => call[2])).size).toBe(1)
    await act(async () => { creating.resolve(pending); await Promise.all(requests) })
    expect(new Set(vi.mocked(startBillingPayment).mock.calls.map(call => call[1])).size).toBe(1)
  })

  it.each(['user', 'enterprise', 'plan'])('恢复按 %s 隔离，不继承另一主体或商品', async scopeChange => {
    const first = renderHook(() => usePlanPayment(context, 'plan-1'))
    await act(() => first.result.current.setAgreed(true))
    const firstKey = vi.mocked(createBillingPaymentOrder).mock.calls[0][2]
    first.unmount()
    if (scopeChange === 'user') identity.userID = crypto.randomUUID()
    const nextContext = scopeChange === 'enterprise' ? { ...context, enterprise_id: 'enterprise-2' } : context
    const nextPlan = scopeChange === 'plan' ? 'plan-2' : 'plan-1'
    vi.mocked(createBillingPaymentOrder).mockResolvedValue({ ...pending, id: 'order-2', enterprise_id: nextContext.enterprise_id })
    vi.mocked(startBillingPayment).mockResolvedValue({ order: { ...pending, id: 'order-2', enterprise_id: nextContext.enterprise_id }, qrcode_url: 'weixin://test/order-2', transaction: {} as never })
    const second = renderHook(() => usePlanPayment(nextContext, nextPlan))
    await act(() => second.result.current.setAgreed(true))
    expect(createBillingPaymentOrder).toHaveBeenCalledTimes(2)
    expect(vi.mocked(createBillingPaymentOrder).mock.calls[1][2]).not.toBe(firstKey)
  })

  it.each(['closed', 'expired'])('恢复查到 %s 后清理意图，本次不自动创建另一订单', async status => {
    const first = renderHook(() => usePlanPayment(context, 'plan-1'))
    await act(() => first.result.current.setAgreed(true))
    first.unmount()
    vi.mocked(getBillingPaymentOrder).mockResolvedValue({ ...pending, status })
    const second = renderHook(() => usePlanPayment(context, 'plan-1'))
    await act(() => second.result.current.setAgreed(true))
    expect(second.result.current.order?.status).toBe(status)
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce()
    expect(startBillingPayment).toHaveBeenCalledOnce()
    expect(readPendingPaymentIntent(paymentIntentScope(context, 'plan', 'plan-1'))).toBeNull()
  })

  it('已付未入账保留意图并只查单，确认 paid_at 后才清理和通知', async () => {
    const first = renderHook(() => usePlanPayment(context, 'plan-1'))
    await act(() => first.result.current.setAgreed(true))
    first.unmount()
    vi.mocked(getBillingPaymentOrder).mockResolvedValue({ ...pending, status: 'paid', paid_at: null })
    const onPaid = vi.fn()
    const second = renderHook(() => usePlanPayment(context, 'plan-1', onPaid))
    await act(() => second.result.current.setAgreed(true))
    expect(readPendingPaymentIntent(paymentIntentScope(context, 'plan', 'plan-1'))).not.toBeNull()
    expect(startBillingPayment).toHaveBeenCalledOnce()
    expect(onPaid).not.toHaveBeenCalled()
    vi.mocked(getBillingPaymentOrder).mockResolvedValue({ ...pending, status: 'paid', paid_at: Date.now() })
    await act(() => second.result.current.refresh())
    expect(onPaid).toHaveBeenCalledOnce()
    expect(readPendingPaymentIntent(paymentIntentScope(context, 'plan', 'plan-1'))).toBeNull()
  })

  it.each([
    { id: 'another-order' }, { plan_id: 'another-plan' }, { amount_yuan: '13.50', amount_cent: '1350' },
  ])('恢复时拒绝显式矛盾的订单信息 %j 并保留待查意图', async mismatch => {
    const first = renderHook(() => usePlanPayment(context, 'plan-1'))
    await act(() => first.result.current.setAgreed(true))
    first.unmount()
    vi.mocked(getBillingPaymentOrder).mockResolvedValue({ ...pending, ...mismatch })
    const second = renderHook(() => usePlanPayment(context, 'plan-1'))
    await act(() => second.result.current.setAgreed(true))
    expect(second.result.current.blocked).toBe(true)
    expect(second.result.current.qr).toBe('')
    expect(startBillingPayment).toHaveBeenCalledOnce()
    expect(readPendingPaymentIntent(paymentIntentScope(context, 'plan', 'plan-1'))).not.toBeNull()
  })

  it('企业订单允许其他经办人，个人订单拒绝显式不属于当前登录用户的响应', async () => {
    vi.mocked(createBillingPaymentOrder).mockResolvedValue({ ...pending, user_id: 'another-enterprise-member' })
    const enterprise = renderHook(() => usePlanPayment(context, 'plan-1'))
    await act(() => enterprise.result.current.setAgreed(true))
    expect(enterprise.result.current.blocked).toBe(false)
    expect(startBillingPayment).toHaveBeenCalledOnce()
    enterprise.unmount()
    vi.mocked(createBillingPaymentOrder).mockResolvedValue({ ...pending, account_type: 'personal', enterprise_id: undefined, user_id: 'another-personal-user' })
    const personal = renderHook(() => usePlanPayment({ account_type: 'personal' }, 'plan-1'))
    await act(() => personal.result.current.setAgreed(true))
    expect(personal.result.current.blocked).toBe(true)
    expect(startBillingPayment).toHaveBeenCalledOnce()
  })

  it('换渠道关单中协议开关不能解锁旧支付；确认关闭后才用新订单', async () => {
    const closing = deferred<BillingPaymentOrder>()
    vi.mocked(closeBillingPaymentOrder).mockReturnValue(closing.promise)
    const { result } = renderHook(() => usePlanPayment(context, 'plan-1'))
    await act(() => result.current.setAgreed(true))
    let switching!: Promise<void>
    act(() => { switching = result.current.selectMethod('alipay') })
    expect(result.current.consentLocked).toBe(true)
    await act(() => result.current.setAgreed(false))
    await act(() => result.current.setAgreed(true))
    expect(startBillingPayment).toHaveBeenCalledOnce()
    vi.mocked(createBillingPaymentOrder).mockResolvedValue({ ...pending, id: 'order-2' })
    await act(async () => { closing.resolve({ ...pending, status: 'closed' }); await switching })
    expect(result.current.method).toBe('alipay')
    expect(result.current.order?.id).toBe('order-2')
    expect(result.current.consentLocked).toBe(false)
    expect(readPendingPaymentIntent(paymentIntentScope(context, 'plan', 'plan-1'))?.orderID).toBe('order-2')
  })

  it('恢复订单尚未同意时切渠道，先查询并关闭旧单再等待协议', async () => {
    const first = renderHook(() => usePlanPayment(context, 'plan-1'))
    await act(() => first.result.current.setAgreed(true))
    first.unmount()
    const second = renderHook(() => usePlanPayment(context, 'plan-1'))
    await act(() => second.result.current.selectMethod('alipay'))
    expect(closeBillingPaymentOrder).toHaveBeenCalledWith('order-1', expect.any(Object), context)
    expect(second.result.current.method).toBe('alipay')
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce()
    expect(startBillingPayment).toHaveBeenCalledOnce()
    expect(readPendingPaymentIntent(paymentIntentScope(context, 'plan', 'plan-1'))).toBeNull()
  })

  it('换渠道关单期间卸载，迟到的关闭结果不能再创建或支付', async () => {
    const closing = deferred<BillingPaymentOrder>()
    vi.mocked(closeBillingPaymentOrder).mockReturnValue(closing.promise)
    const first = renderHook(() => usePlanPayment(context, 'plan-1'))
    await act(() => first.result.current.setAgreed(true))
    let switching!: Promise<void>
    act(() => { switching = first.result.current.selectMethod('alipay') })
    const signal = vi.mocked(closeBillingPaymentOrder).mock.calls[0][1]?.signal
    first.unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => { closing.resolve({ ...pending, status: 'closed' }); await switching })
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce()
    expect(startBillingPayment).toHaveBeenCalledOnce()
    expect(readPendingPaymentIntent(paymentIntentScope(context, 'plan', 'plan-1'))?.orderID).toBe('order-1')
    vi.mocked(getBillingPaymentOrder).mockResolvedValue({ ...pending, status: 'closed' })
    const second = renderHook(() => usePlanPayment(context, 'plan-1'))
    await act(() => second.result.current.setAgreed(true))
    expect(readPendingPaymentIntent(paymentIntentScope(context, 'plan', 'plan-1'))).toBeNull()
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce()
  })

  it('创建结果未知时切渠道先以原键恢复关单，再创建独立的新渠道订单', async () => {
    vi.mocked(createBillingPaymentOrder).mockRejectedValueOnce(new TypeError('network'))
    const first = renderHook(() => usePlanPayment(context, 'plan-1'))
    await act(() => first.result.current.setAgreed(true))
    const key = vi.mocked(createBillingPaymentOrder).mock.calls[0][2]
    first.unmount()
    const second = renderHook(() => usePlanPayment(context, 'plan-1'))
    await act(() => second.result.current.selectMethod('alipay'))
    expect(vi.mocked(createBillingPaymentOrder).mock.calls[1][2]).toBe(key)
    expect(closeBillingPaymentOrder).toHaveBeenCalledWith('order-1', expect.any(Object), context)
    vi.mocked(createBillingPaymentOrder).mockResolvedValue({ ...pending, id: 'order-2' })
    await act(() => second.result.current.setAgreed(true))
    expect(vi.mocked(createBillingPaymentOrder).mock.calls[2][2]).not.toBe(key)
    expect(startBillingPayment).toHaveBeenLastCalledWith('order-2', expect.any(String), expect.objectContaining({ channel: 'alipay' }), context)
  })

  it('第二入口切渠道时先恢复并关闭原单，第一入口迟到的创建结果不能支付或复活旧意图', async () => {
    const creating = deferred<BillingPaymentOrder>()
    vi.mocked(createBillingPaymentOrder).mockReturnValueOnce(creating.promise)
    const first = renderHook(() => usePlanPayment(context, 'plan-1'))
    const second = renderHook(() => usePlanPayment(context, 'plan-1'))
    let starting!: Promise<void>
    act(() => { starting = first.result.current.setAgreed(true) })
    const key = vi.mocked(createBillingPaymentOrder).mock.calls[0][2]
    await act(() => second.result.current.selectMethod('alipay'))
    expect(vi.mocked(createBillingPaymentOrder).mock.calls[1][2]).toBe(key)
    expect(closeBillingPaymentOrder).toHaveBeenCalledOnce()
    expect(startBillingPayment).not.toHaveBeenCalled()
    vi.mocked(createBillingPaymentOrder).mockResolvedValue({ ...pending, id: 'order-2' })
    await act(() => second.result.current.setAgreed(true))
    const saved = readPendingPaymentIntent(paymentIntentScope(context, 'plan', 'plan-1'))
    await act(async () => { creating.resolve(pending); await starting })
    expect(startBillingPayment).toHaveBeenCalledOnce()
    expect(startBillingPayment).toHaveBeenCalledWith('order-2', expect.any(String), expect.objectContaining({ channel: 'alipay' }), context)
    expect(first.result.current.order).toBeNull()
    expect(readPendingPaymentIntent(paymentIntentScope(context, 'plan', 'plan-1'))).toEqual(saved)
  })

  it('身份未知无法持久化时，取消创建再切渠道仍先同键恢复收尾', async () => {
    identity.userID = ''
    const creating = deferred<BillingPaymentOrder>()
    vi.mocked(createBillingPaymentOrder).mockReturnValueOnce(creating.promise)
    const { result } = renderHook(() => usePlanPayment(context, 'plan-1'))
    let starting!: Promise<void>
    act(() => { starting = result.current.setAgreed(true) })
    const key = vi.mocked(createBillingPaymentOrder).mock.calls[0][2]
    await act(() => result.current.setAgreed(false))
    await act(() => result.current.selectMethod('alipay'))
    expect(vi.mocked(createBillingPaymentOrder).mock.calls[1][2]).toBe(key)
    expect(closeBillingPaymentOrder).toHaveBeenCalledOnce()
    await act(async () => { creating.resolve(pending); await starting })
    expect(result.current.method).toBe('alipay')
    expect(startBillingPayment).not.toHaveBeenCalled()
  })
})
