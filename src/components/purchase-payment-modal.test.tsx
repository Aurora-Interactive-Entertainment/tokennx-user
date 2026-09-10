import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBillingPaymentOrder, startBillingPayment, getBillingPaymentOrder } from '@/api/billing'
import { getRealNameProfile, type RealNameProfile } from '@/api/real-name'
import { getAccessToken } from '@/auth/token-storage'
import { appToast } from './app-toast'
import { ApiError } from '@/api/http'
import { PurchasePaymentModal } from './purchase-payment-modal'

vi.mock('@/api/billing', async (original) => ({ ...await original<object>(), createBillingPaymentOrder: vi.fn(), startBillingPayment: vi.fn(), getBillingPaymentOrder: vi.fn() }))
vi.mock('@/api/real-name', async (original) => ({ ...await original<object>(), getRealNameProfile: vi.fn() }))
vi.mock('@/auth/token-storage', async (original) => ({ ...await original<object>(), getAccessToken: vi.fn() }))
vi.mock('./app-toast', () => ({ appToast: { error: vi.fn() } }))

function expectNoPayment() {
  expect(document.querySelector('.purchase-payment-modal')).toBeNull()
  expect(createBillingPaymentOrder).not.toHaveBeenCalled()
  expect(startBillingPayment).not.toHaveBeenCalled()
  expect(getBillingPaymentOrder).not.toHaveBeenCalled()
}

describe('公开套餐付款弹窗调试入口', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(getAccessToken).mockReturnValue('test-access-token')
    vi.mocked(getRealNameProfile).mockResolvedValue({ status: 'verified' })
  })
  afterEach(cleanup)

  it('关闭先执行退场动画，动画结束后才通知父组件卸载', async () => {
    const onClose = vi.fn()
    render(<MemoryRouter><PurchasePaymentModal open planName="deepSeek" onClose={onClose} /></MemoryRouter>)
    await screen.findByRole('heading', { name: '支付' })
    fireEvent(document.querySelector('.semi-modal-content-animate-show')!, new Event('webkitAnimationEnd', { bubbles: true }))
    fireEvent(document.querySelector('.semi-modal-mask-animate-show')!, new Event('webkitAnimationEnd', { bubbles: true }))
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() => expect(document.querySelector('.semi-modal-content-animate-hide')).not.toBeNull())
    expect(onClose).not.toHaveBeenCalled()
    fireEvent(document.querySelector('.semi-modal-content-animate-hide')!, new Event('webkitAnimationEnd', { bubbles: true }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('调试入口也必须先通过实名校验才能自动下单', async () => {
    vi.mocked(createBillingPaymentOrder).mockRejectedValue(new ApiError('未登录', 401, 160001, null))
    const onAuthFailure = vi.fn()
    render(<MemoryRouter><PurchasePaymentModal open planName="deepSeek" planID="debug-plan-deepseek" guestDebug onClose={vi.fn()} onAuthFailure={onAuthFailure} /></MemoryRouter>)
    await waitFor(() => expect(vi.mocked(createBillingPaymentOrder).mock.calls.length).toBe(1))
    expect(getRealNameProfile).toHaveBeenCalledOnce()
    expect(vi.mocked(getRealNameProfile).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(createBillingPaymentOrder).mock.invocationCallOrder[0])
    expect(vi.mocked(createBillingPaymentOrder).mock.calls[0][1]).toEqual({ plan_id: 'debug-plan-deepseek', quantity: 1 })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认购买' })).not.toBeInTheDocument()
    expect(onAuthFailure).not.toHaveBeenCalled()
  })

  it('普通入口勾选协议后下单，无需确认按钮', async () => {
    vi.mocked(createBillingPaymentOrder).mockResolvedValue({ id: 'paid-order', status: 'paid', paid_at: 1, amount_yuan: '1.00' } as never)
    render(<MemoryRouter><PurchasePaymentModal open planName="deepSeek" planID="real-plan-id" onClose={vi.fn()} /></MemoryRouter>)
    expect(createBillingPaymentOrder).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('checkbox'))
    await waitFor(() => expect(createBillingPaymentOrder).toHaveBeenCalledOnce())
  })

  it.each([true, false])('未实名时仅展示认证提示，guestDebug=%s 也不挂载支付弹窗或调用支付接口', async (guestDebug) => {
    vi.mocked(getRealNameProfile).mockResolvedValue({ status: 'unverified' })
    const onClose = vi.fn()
    render(<MemoryRouter><PurchasePaymentModal open guestDebug={guestDebug} planName="deepSeek" planID="plan-1" onClose={onClose} /></MemoryRouter>)
    expectNoPayment()
    await screen.findByRole('heading', { name: '实名认证', level: 2 })
    expectNoPayment()
    fireEvent.click(screen.getByRole('button', { name: '我已完成认证' }))
    await waitFor(() => expect(getRealNameProfile).toHaveBeenCalledTimes(2))
    expectNoPayment()
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    expect(onClose).toHaveBeenCalledOnce()
    expectNoPayment()
  })

  it('查询进行中不会先闪出支付弹窗，只有明确 verified 才进入支付', async () => {
    let resolve!: (profile: RealNameProfile) => void
    vi.mocked(getRealNameProfile).mockReturnValue(new Promise((done) => { resolve = done }))
    render(<MemoryRouter><PurchasePaymentModal open planName="deepSeek" planID="plan-1" onClose={vi.fn()} /></MemoryRouter>)
    expectNoPayment()
    await act(async () => resolve({ status: 'verified' }))
    await screen.findByRole('heading', { name: '支付' })
    expect(createBillingPaymentOrder).not.toHaveBeenCalled()
  })

  it('我已完成认证必须复查通过才挂载支付组件', async () => {
    vi.mocked(getRealNameProfile).mockResolvedValueOnce({ status: 'waiting' }).mockResolvedValueOnce({ status: 'verified' })
    render(<MemoryRouter><PurchasePaymentModal open planName="deepSeek" planID="plan-1" onClose={vi.fn()} /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: '我已完成认证' }))
    await screen.findByRole('heading', { name: '支付' })
    expect(getRealNameProfile).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('heading', { name: '实名认证', level: 2 })).toBeNull()
    expect(createBillingPaymentOrder).not.toHaveBeenCalled()
  })

  it('查询失败不进入支付，复查失败保留提示供重试', async () => {
    vi.mocked(getRealNameProfile).mockRejectedValueOnce(new Error('offline'))
    const onClose = vi.fn()
    const view = render(<MemoryRouter><PurchasePaymentModal open guestDebug planName="deepSeek" planID="plan-1" onClose={onClose} /></MemoryRouter>)
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expectNoPayment()
    view.unmount()
    vi.mocked(getRealNameProfile).mockResolvedValueOnce({ status: 'failed' }).mockRejectedValueOnce(new Error('offline'))
    render(<MemoryRouter><PurchasePaymentModal open guestDebug planName="deepSeek" planID="plan-1" onClose={onClose} /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: '我已完成认证' }))
    await waitFor(() => expect(appToast.error).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: '我已完成认证' })).toBeEnabled()
    expectNoPayment()
  })

  it('关闭复查中的认证提示后，迟到的成功响应不能打开支付', async () => {
    let resolve!: (profile: RealNameProfile) => void
    vi.mocked(getRealNameProfile).mockResolvedValueOnce({ status: 'expired' }).mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    render(<MemoryRouter><PurchasePaymentModal open guestDebug planName="deepSeek" planID="plan-1" onClose={vi.fn()} /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: '我已完成认证' }))
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    await act(async () => resolve({ status: 'verified' }))
    expectNoPayment()
  })

  it('服务端再次要求实名时卸载支付弹窗，不能继续付款或查单', async () => {
    vi.mocked(createBillingPaymentOrder).mockRejectedValue(new ApiError('实名认证', 403, 170008, null))
    render(<MemoryRouter><PurchasePaymentModal open guestDebug planName="deepSeek" planID="plan-1" onClose={vi.fn()} /></MemoryRouter>)
    await screen.findByRole('heading', { name: '实名认证', level: 2 })
    expect(document.querySelector('.purchase-payment-modal')).toBeNull()
    expect(startBillingPayment).not.toHaveBeenCalled()
    expect(getBillingPaymentOrder).not.toHaveBeenCalled()
    vi.mocked(getRealNameProfile).mockResolvedValue({ status: 'unverified' })
    fireEvent.click(screen.getByRole('button', { name: '我已完成认证' }))
    await waitFor(() => expect(getRealNameProfile).toHaveBeenCalledTimes(2))
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce()
  })
})
