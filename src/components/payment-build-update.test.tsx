import '@/i18n'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  closeBillingPaymentOrder,
  createBillingPaymentOrder,
  getBillingPaymentOrder,
  startBillingPayment,
  type BillingPaymentOrder,
  type BillingPaymentStartResult,
} from '@/api/billing'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import { RechargeTab } from '@/pages/billing'
import { usePlanPayment } from './use-plan-payment'
import { usePaymentReturn } from './use-payment-return'
import { useBillingPaymentPolling } from './use-billing-payment-polling'

vi.mock('@/api/billing', async (original) => ({ ...await original<object>(), createBillingPaymentOrder: vi.fn(), startBillingPayment: vi.fn(), getBillingPaymentOrder: vi.fn(), closeBillingPaymentOrder: vi.fn() }))
vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn().mockResolvedValue(undefined) } }))

const context = { account_type: 'personal' as const }
const order = { id: 'build-order', order_no: 'BUILD-ORDER', amount_yuan: '100.00', amount_cent: '10000', status: 'pending', paid_at: null } as BillingPaymentOrder
const settled = { ...order, status: 'paid', paid_at: 1_800_000_000_000 }
const holders = new Set<symbol>()
const noop = () => {}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  localStorage.clear()
  sessionStorage.clear()
  clearAuthTokens({ force: true, broadcast: false })
  saveAuthTokens({ status: 'succeeded', binding_required: false, access_token: 'build-token', refresh_token: 'build-refresh', refresh_expires_at: Date.UTC(2099, 0, 1), user: { id: 'build-user', display_name: '测试用户', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' } })
  // 通过真实 bridge 和 hook 接入独立租约，检查组件之间不会误释放彼此的保护。
  window.__TOKEN_NX_UPDATE_GUARD__ = {
    pendingVersion: 'new-build', check: async () => {}, routeChanged: async () => {}, reload: () => holders.size === 0,
    blockReload: () => {
      const holder = Symbol('payment')
      holders.add(holder)
      return () => { holders.delete(holder) }
    },
  }
  vi.mocked(createBillingPaymentOrder).mockResolvedValue(order)
  vi.mocked(startBillingPayment).mockResolvedValue({ order, qrcode_url: 'weixin://wxpay/local-only', qr_code: 'https://qr.alipay.com/local-only' } as BillingPaymentStartResult)
  vi.mocked(getBillingPaymentOrder).mockResolvedValue(order)
  vi.mocked(closeBillingPaymentOrder).mockResolvedValue({ ...order, status: 'closed' })
})

afterEach(() => {
  cleanup()
  expect(holders.size).toBe(0)
  delete window.__TOKEN_NX_UPDATE_GUARD__
  vi.useRealTimers()
})

describe('支付期间的自动版本更新保护', () => {
  it('创建、发起支付及关单未返回时保持保护，确认关单后释放', async () => {
    const creation = deferred<BillingPaymentOrder>()
    const payment = deferred<BillingPaymentStartResult>()
    const closing = deferred<BillingPaymentOrder>()
    vi.mocked(createBillingPaymentOrder).mockReturnValue(creation.promise)
    vi.mocked(startBillingPayment).mockReturnValue(payment.promise)
    vi.mocked(closeBillingPaymentOrder).mockReturnValue(closing.promise)
    const { result } = renderHook(() => usePlanPayment(context, 'plan-1'))
    expect(holders.size).toBe(0)
    let started!: Promise<void>
    act(() => { started = result.current.setAgreed(true) })
    expect(holders.size).toBeGreaterThan(0)
    await act(async () => creation.resolve(order))
    expect(startBillingPayment).toHaveBeenCalledOnce()
    expect(holders.size).toBeGreaterThan(0)
    await act(async () => {
      payment.resolve({ order, qrcode_url: 'weixin://wxpay/local-only' } as BillingPaymentStartResult)
      await started
    })
    let closed!: Promise<void>
    act(() => { closed = result.current.close(noop) })
    expect(holders.size).toBeGreaterThan(0)
    await act(async () => { closing.resolve({ ...order, status: 'closed' }); await closed })
    expect(holders.size).toBe(0)
  })

  it('创建响应丢失仍阻止刷新，离开释放，重进沿原幂等意图恢复', async () => {
    vi.mocked(createBillingPaymentOrder).mockRejectedValueOnce(new Error('response lost'))
    const first = renderHook(() => usePlanPayment(context, 'plan-1'))
    await act(() => first.result.current.setAgreed(true))
    expect(first.result.current.order).toBeNull()
    expect(holders.size).toBeGreaterThan(0)
    const key = vi.mocked(createBillingPaymentOrder).mock.calls[0][2]
    await act(() => first.result.current.setAgreed(false))
    expect(holders.size).toBeGreaterThan(0)
    first.unmount()
    expect(holders.size).toBe(0)
    vi.mocked(createBillingPaymentOrder).mockResolvedValue(settled)
    const restored = renderHook(() => usePlanPayment(context, 'plan-1'))
    expect(holders.size).toBeGreaterThan(0)
    await act(() => restored.result.current.setAgreed(true))
    expect(vi.mocked(createBillingPaymentOrder).mock.calls[1][2]).toBe(key)
    expect(holders.size).toBe(0)
  })

  it('待支付或已付未到账时轮询超时仍阻止刷新，人工重试确认到账后释放', async () => {
    vi.mocked(getBillingPaymentOrder).mockResolvedValue({ ...order, status: 'paid', paid_at: null })
    const { result } = renderHook(() => usePlanPayment(context, 'plan-1'))
    await act(() => result.current.setAgreed(true))
    await act(() => vi.advanceTimersByTimeAsync(300_000))
    expect(result.current.timedOut).toBe(true)
    expect(holders.size).toBeGreaterThan(0)
    vi.mocked(getBillingPaymentOrder).mockResolvedValue(settled)
    await act(async () => result.current.refresh())
    expect(result.current.order).toEqual(settled)
    expect(holders.size).toBe(0)
  })

  it('多个支付入口各自释放，关闭其中一个不会解锁另一个', async () => {
    const first = renderHook(() => usePlanPayment(context, 'plan-1'))
    const second = renderHook(() => usePlanPayment(context, 'plan-2'))
    await act(() => first.result.current.setAgreed(true))
    await act(() => second.result.current.setAgreed(true))
    expect(holders.size).toBeGreaterThanOrEqual(2)
    await act(() => first.result.current.close(noop))
    expect(holders.size).toBeGreaterThan(0)
    await act(() => second.result.current.close(noop))
    expect(holders.size).toBe(0)
  })

  it('取消在途查单立即释放自身租约，迟到返回不影响另一查单', async () => {
    const firstRequest = deferred<BillingPaymentOrder>()
    const secondRequest = deferred<BillingPaymentOrder>()
    vi.mocked(getBillingPaymentOrder).mockReturnValueOnce(firstRequest.promise).mockReturnValueOnce(secondRequest.promise)
    const options = { context, order, enabled: true, refreshToken: 0, onOrder: noop, onError: noop, onTimeout: noop }
    const first = renderHook(() => useBillingPaymentPolling(options))
    const second = renderHook(() => useBillingPaymentPolling(options))
    expect(holders.size).toBe(2)
    act(() => first.result.current())
    expect(holders.size).toBe(1)
    await act(async () => firstRequest.resolve(settled))
    expect(holders.size).toBe(1)
    second.unmount()
    expect(holders.size).toBe(0)
    await act(async () => secondRequest.resolve(settled))
    expect(holders.size).toBe(0)
  })

  it.each(['closed', 'expired', 'paid'])('支付回跳超时保留保护，重试确认%s后释放', async (status) => {
    const { result } = renderHook(() => usePaymentReturn({ context, orderID: order.id, onAuthFailure: noop, onSettled: noop }))
    expect(holders.size).toBeGreaterThan(0)
    await act(() => vi.advanceTimersByTimeAsync(300_000))
    expect(result.current.state.status).toBe('error')
    expect(holders.size).toBeGreaterThan(0)
    vi.mocked(getBillingPaymentOrder).mockResolvedValue({ ...order, status, paid_at: status === 'paid' ? settled.paid_at : null })
    await act(async () => result.current.retry())
    expect(result.current.state.status).toBe('success')
    expect(holders.size).toBe(0)
  })

  it('充值创建结果未知时保护恢复意图，离开后释放，重进确认已到账后结束保护', async () => {
    vi.mocked(createBillingPaymentOrder).mockRejectedValueOnce(new Error('response lost'))
    const mount = () => render(<MemoryRouter><RechargeTab context={context} onOrderUpdated={noop} onAuthFailure={noop} /></MemoryRouter>)
    const first = mount()
    expect(holders.size).toBe(0)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '立即充值' })))
    expect(holders.size).toBeGreaterThan(0)
    first.unmount()
    expect(holders.size).toBe(0)
    vi.mocked(createBillingPaymentOrder).mockResolvedValue(settled)
    mount()
    expect(holders.size).toBeGreaterThan(0)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '立即充值' })))
    expect(holders.size).toBe(0)
    expect(vi.mocked(createBillingPaymentOrder).mock.calls[1][2]).toBe(vi.mocked(createBillingPaymentOrder).mock.calls[0][2])
  })

  it('自定义充值金额由支付状态保护，到账后不残留草稿锁，后续新金额继续保护', async () => {
    const paidCustomOrder = { ...settled, amount_yuan: '12.50', amount_cent: '1250' }
    vi.mocked(createBillingPaymentOrder).mockResolvedValue(paidCustomOrder)
    render(<MemoryRouter><RechargeTab context={context} onOrderUpdated={noop} onAuthFailure={noop} /></MemoryRouter>)
    const input = screen.getByRole('textbox', { name: '其他金额' })
    expect(input).toHaveAttribute('data-build-update-managed')
    expect(holders.size).toBe(0)
    await act(async () => {
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: '12.50' } })
    })
    expect(holders.size).toBeGreaterThan(0)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '立即充值' })))
    expect(input).toHaveValue('12.50')
    expect(holders.size).toBe(0)
    await act(async () => fireEvent.change(input, { target: { value: '18.00' } }))
    expect(holders.size).toBeGreaterThan(0)
    await act(async () => fireEvent.change(input, { target: { value: '12.50' } }))
    expect(holders.size).toBe(0)
  })

  it('未提交的新渠道和预设金额均受保护，回到原选择后可自动更新', async () => {
    render(<MemoryRouter><RechargeTab context={context} onOrderUpdated={noop} onAuthFailure={noop} /></MemoryRouter>)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '微信' })))
    expect(holders.size).toBeGreaterThan(0)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '支付宝支付' })))
    expect(holders.size).toBe(0)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '200 元' })))
    expect(holders.size).toBeGreaterThan(0)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '100 元' })))
    expect(holders.size).toBe(0)
    expect(createBillingPaymentOrder).not.toHaveBeenCalled()
  })
})
