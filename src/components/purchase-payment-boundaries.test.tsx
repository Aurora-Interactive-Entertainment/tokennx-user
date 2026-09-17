import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
import i18n from '@/i18n'
import { closeBillingPaymentOrder, createBillingPaymentOrder, getBillingPaymentOrder, startBillingPayment, type BillingPaymentOrder } from '@/api/billing'
import { PurchasePaymentModal } from './purchase-payment-modal'

vi.mock('@/api/billing', async original => ({ ...await original<object>(), createBillingPaymentOrder: vi.fn(), getBillingPaymentOrder: vi.fn(), startBillingPayment: vi.fn(), closeBillingPaymentOrder: vi.fn() }))
vi.mock('@/auth/token-storage', async original => ({ ...await original<object>(), getAccessToken: () => 'test-token', getAccessTokenUserId: () => undefined }))
vi.mock('@/components/app-toast', () => ({ appToast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn().mockResolvedValue(undefined) } }))

const context = { account_type: 'enterprise' as const, enterprise_id: 'enterprise-1' }
const pending = { id: 'order-1', status: 'pending', order_type: 'plan_purchase', amount_yuan: '12.50', amount_cent: '1250', account_type: 'enterprise', enterprise_id: 'enterprise-1', paid_at: null } as BillingPaymentOrder
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }

beforeEach(async () => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  await i18n.changeLanguage('zh-CN')
  vi.mocked(QRCode.toCanvas).mockResolvedValue(undefined)
  vi.mocked(createBillingPaymentOrder).mockResolvedValue(pending)
  vi.mocked(getBillingPaymentOrder).mockResolvedValue(pending)
  vi.mocked(startBillingPayment).mockResolvedValue({ order: pending, qrcode_url: 'weixin://test/order-1', transaction: { payment_product: 'wechat_native', amount_cent: '1250' } as never })
  vi.mocked(closeBillingPaymentOrder).mockResolvedValue({ ...pending, status: 'closed' })
})
afterEach(async () => { cleanup(); vi.useRealTimers(); await i18n.changeLanguage('zh-CN') })

async function openPayment(onClose = vi.fn(), onPaid = vi.fn()) {
  await act(async () => { render(<MemoryRouter><PurchasePaymentModal open context={context} planID="plan-1" planName="测试套餐" priceCent="1250" onClose={onClose} onPaid={onPaid} /></MemoryRouter>) })
  fireEvent(document.querySelector('.semi-modal-content-animate-show')!, new Event('webkitAnimationEnd', { bubbles: true }))
  fireEvent(document.querySelector('.semi-modal-mask-animate-show')!, new Event('webkitAnimationEnd', { bubbles: true }))
  await act(async () => fireEvent.click(screen.getByRole('checkbox')))
}

describe('支付弹窗超时与切渠道完成反馈', () => {
  it('切渠道关单中锁定协议，先查到到账时在操作完成后自动关闭', async () => {
    const closing = deferred<BillingPaymentOrder>()
    vi.mocked(closeBillingPaymentOrder).mockReturnValue(closing.promise)
    const onClose = vi.fn()
    const onPaid = vi.fn()
    await openPayment(onClose, onPaid)
    fireEvent.click(screen.getByRole('radio', { name: '支付宝支付' }))
    expect(screen.getByRole('checkbox')).toBeDisabled()
    expect(screen.getByRole('radio', { name: '微信支付' })).toBeDisabled()
    vi.mocked(getBillingPaymentOrder).mockResolvedValue({ ...pending, status: 'paid', paid_at: Date.now() })
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(onPaid).toHaveBeenCalledOnce()
    expect(document.querySelector('.semi-modal-content-animate-hide')).toBeNull()
    await act(async () => closing.resolve({ ...pending, status: 'paid', paid_at: Date.now() }))
    expect(document.querySelector('.semi-modal-content-animate-hide')).not.toBeNull()
    fireEvent(document.querySelector('.semi-modal-content-animate-hide')!, new Event('webkitAnimationEnd', { bubbles: true }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce()
    expect(startBillingPayment).toHaveBeenCalledOnce()
  })

  it('无期限订单超时隐藏二维码并明确刷新，刷新只查原订单且可确认迟到付款', async () => {
    const onPaid = vi.fn()
    await openPayment(vi.fn(), onPaid)
    expect(document.querySelector('.payment-qr-code-shell')).not.toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(5 * 60_000))
    const calls = vi.mocked(getBillingPaymentOrder).mock.calls.length
    expect(document.querySelector('.payment-qr-code-shell')).toBeNull()
    expect(screen.getByRole('button', { name: '刷新支付状态' })).toBeEnabled()
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(getBillingPaymentOrder).toHaveBeenCalledTimes(calls)
    vi.mocked(getBillingPaymentOrder).mockResolvedValue({ ...pending, status: 'paid', paid_at: Date.now() })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '刷新支付状态' })))
    expect(onPaid).toHaveBeenCalledOnce()
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce()
    expect(startBillingPayment).toHaveBeenCalledOnce()
    expect(document.querySelector('.semi-modal-content-animate-hide')).not.toBeNull()
  })

  it('超时状态支持英文，明确有效期订单仍自动续查', async () => {
    const order = { ...pending, expires_at: Date.now() + 15 * 60_000 }
    vi.mocked(createBillingPaymentOrder).mockResolvedValue(order)
    vi.mocked(getBillingPaymentOrder).mockResolvedValue(order)
    vi.mocked(startBillingPayment).mockResolvedValue({ order, qrcode_url: 'weixin://test/order-1', transaction: {} as never })
    await openPayment()
    await act(() => vi.advanceTimersByTimeAsync(5 * 60_000))
    expect(document.querySelector('.payment-qr-code-shell')).not.toBeNull()
    const calls = vi.mocked(getBillingPaymentOrder).mock.calls.length
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(vi.mocked(getBillingPaymentOrder).mock.calls.length).toBeGreaterThan(calls)
    cleanup()
    vi.mocked(createBillingPaymentOrder).mockResolvedValue(pending)
    vi.mocked(getBillingPaymentOrder).mockResolvedValue(pending)
    vi.mocked(startBillingPayment).mockResolvedValue({ order: pending, qrcode_url: 'weixin://test/order-1', transaction: {} as never })
    await act(async () => { await i18n.changeLanguage('en-US') })
    await openPayment()
    await act(() => vi.advanceTimersByTimeAsync(5 * 60_000))
    expect(screen.getByRole('button', { name: 'Refresh payment status' })).toBeInTheDocument()
  })
})
