import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
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
vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn().mockResolvedValue(undefined) } }))

function expectNoPayment() {
  expect(document.querySelector('.purchase-payment-modal')).toBeNull()
  expect(createBillingPaymentOrder).not.toHaveBeenCalled()
  expect(startBillingPayment).not.toHaveBeenCalled()
  expect(getBillingPaymentOrder).not.toHaveBeenCalled()
}

describe('套餐付款弹窗', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(QRCode.toCanvas).mockResolvedValue(undefined)
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

  it('通过实名后仍等待同意协议，登录失效交由认证流程处理', async () => {
    vi.mocked(createBillingPaymentOrder).mockRejectedValue(new ApiError('未登录', 401, 160001, null))
    const onAuthFailure = vi.fn()
    render(<MemoryRouter><PurchasePaymentModal open planName="deepSeek" planID="plan-deepseek" onClose={vi.fn()} onAuthFailure={onAuthFailure} /></MemoryRouter>)
    const checkbox = await screen.findByRole('checkbox')
    expect(createBillingPaymentOrder).not.toHaveBeenCalled()
    fireEvent.click(checkbox)
    await waitFor(() => expect(vi.mocked(createBillingPaymentOrder).mock.calls.length).toBe(1))
    expect(getRealNameProfile).toHaveBeenCalledOnce()
    expect(vi.mocked(getRealNameProfile).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(createBillingPaymentOrder).mock.invocationCallOrder[0])
    expect(vi.mocked(createBillingPaymentOrder).mock.calls[0][1]).toEqual({ plan_id: 'plan-deepseek', quantity: 1 })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认购买' })).not.toBeInTheDocument()
    expect(onAuthFailure).toHaveBeenCalledOnce()
  })

  it('普通入口勾选协议后下单，无需确认按钮', async () => {
    vi.mocked(createBillingPaymentOrder).mockResolvedValue({ id: 'paid-order', status: 'paid', paid_at: 1, amount_yuan: '1.00' } as never)
    render(<MemoryRouter><PurchasePaymentModal open planName="deepSeek" planID="real-plan-id" onClose={vi.fn()} /></MemoryRouter>)
    expect(createBillingPaymentOrder).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('checkbox'))
    await waitFor(() => expect(createBillingPaymentOrder).toHaveBeenCalledOnce())
  })

  it('默认微信，二维码返回前显示加载并锁定渠道，取消协议后清空二维码', async () => {
    const order = { id: 'order-1', status: 'pending', amount_yuan: '12.50', paid_at: null }
    let resolve!: (value: unknown) => void
    vi.mocked(createBillingPaymentOrder).mockResolvedValue(order as never)
    vi.mocked(getBillingPaymentOrder).mockResolvedValue(order as never)
    vi.mocked(startBillingPayment).mockImplementation(() => new Promise(done => { resolve = done as typeof resolve }))
    render(<MemoryRouter><PurchasePaymentModal open planName="Max" planID="plan-1" onClose={vi.fn()} /></MemoryRouter>)
    const checkbox = await screen.findByRole('checkbox')
    expect(screen.getByRole('radio', { name: '微信支付' })).toBeChecked()
    expect(screen.getByText('请先同意服务协议')).toBeInTheDocument()
    expect(document.querySelector('.purchase-payment-qr canvas')).toBeNull()
    fireEvent.click(checkbox)
    await waitFor(() => expect(startBillingPayment).toHaveBeenCalledOnce())
    expect(document.querySelector('.purchase-payment-qr')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('radio', { name: '支付宝支付' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: '微信支付' })).toBeDisabled()
    expect(checkbox).toBeEnabled()
    await act(async () => resolve({ order, transaction: {}, qrcode_url: 'weixin://test-only' }))
    expect(screen.getByLabelText('扫码支付')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '支付宝支付' })).toBeEnabled()
    fireEvent.click(checkbox)
    expect(screen.getByText('请先同意服务协议')).toBeInTheDocument()
    expect(document.querySelector('.purchase-payment-qr canvas')).toBeNull()
    expect(screen.queryByRole('button', { name: '刷新支付状态' })).toBeNull()
  })

  it('未实名时仅展示认证提示，不挂载支付弹窗或调用支付接口', async () => {
    vi.mocked(getRealNameProfile).mockResolvedValue({ status: 'unverified' })
    const onClose = vi.fn()
    render(<MemoryRouter><PurchasePaymentModal open planName="deepSeek" planID="plan-1" onClose={onClose} /></MemoryRouter>)
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
    const view = render(<MemoryRouter><PurchasePaymentModal open planName="deepSeek" planID="plan-1" onClose={onClose} /></MemoryRouter>)
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expectNoPayment()
    view.unmount()
    vi.mocked(getRealNameProfile).mockResolvedValueOnce({ status: 'failed' }).mockRejectedValueOnce(new Error('offline'))
    render(<MemoryRouter><PurchasePaymentModal open planName="deepSeek" planID="plan-1" onClose={onClose} /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: '我已完成认证' }))
    await waitFor(() => expect(appToast.error).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: '我已完成认证' })).toBeEnabled()
    expectNoPayment()
  })

  it('关闭复查中的认证提示后，迟到的成功响应不能打开支付', async () => {
    let resolve!: (profile: RealNameProfile) => void
    vi.mocked(getRealNameProfile).mockResolvedValueOnce({ status: 'expired' }).mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    render(<MemoryRouter><PurchasePaymentModal open planName="deepSeek" planID="plan-1" onClose={vi.fn()} /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: '我已完成认证' }))
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    await act(async () => resolve({ status: 'verified' }))
    expectNoPayment()
  })

  it('服务端再次要求实名时卸载支付弹窗，不能继续付款或查单', async () => {
    vi.mocked(createBillingPaymentOrder).mockRejectedValue(new ApiError('实名认证', 403, 170008, null))
    render(<MemoryRouter><PurchasePaymentModal open planName="deepSeek" planID="plan-1" onClose={vi.fn()} /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('checkbox'))
    await screen.findByRole('heading', { name: '实名认证', level: 2 })
    expect(document.querySelector('.purchase-payment-modal')).toBeNull()
    expect(startBillingPayment).not.toHaveBeenCalled()
    expect(getBillingPaymentOrder).not.toHaveBeenCalled()
    vi.mocked(getRealNameProfile).mockResolvedValue({ status: 'unverified' })
    fireEvent.click(screen.getByRole('button', { name: '我已完成认证' }))
    await waitFor(() => expect(getRealNameProfile).toHaveBeenCalledTimes(2))
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce()
  })

  it('企业购买不要求操作人完成个人实名，企业权限仍交由下单接口校验', async () => {
    vi.mocked(getRealNameProfile).mockResolvedValue({ status: 'unverified' })
    const context = { account_type: 'enterprise' as const, enterprise_id: 'enterprise-1' }
    vi.mocked(createBillingPaymentOrder).mockRejectedValue(new ApiError('企业无购买权限', 403, 170012, null, '企业无购买权限'))
    render(<MemoryRouter><PurchasePaymentModal open context={context} planName="Max" planID="plan-1" onClose={vi.fn()} /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('checkbox'))
    expect(await screen.findByRole('alert')).toHaveTextContent('企业无购买权限')
    expect(getRealNameProfile).not.toHaveBeenCalled()
    expect(createBillingPaymentOrder).toHaveBeenCalledWith(context, { plan_id: 'plan-1', quantity: 1 }, expect.any(String), expect.any(Object))
    expect(startBillingPayment).not.toHaveBeenCalled()
  })

  it('发起支付失败后可在弹窗重试，复用原订单而非再次购买', async () => {
    const pending = { id: 'order-1', status: 'pending', amount_yuan: '12.50', paid_at: null }
    vi.mocked(createBillingPaymentOrder).mockResolvedValue(pending as never)
    vi.mocked(getBillingPaymentOrder).mockResolvedValue(pending as never)
    vi.mocked(startBillingPayment).mockRejectedValueOnce(new ApiError('渠道暂不可用', 503, 170007, null, '渠道暂不可用')).mockResolvedValueOnce({ order: { ...pending, status: 'paid', paid_at: 1 } } as never)
    render(<MemoryRouter><PurchasePaymentModal open planName="Max" planID="plan-1" priceCent="20000" onClose={vi.fn()} /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('checkbox'))
    expect(await screen.findByRole('alert')).toHaveTextContent('渠道暂不可用')
    expect(screen.getByRole('checkbox')).toBeEnabled()
    expect(screen.getByRole('button', { name: '重试支付' }).closest('.purchase-payment-methods')).not.toBeNull()
    expect(screen.getByText('¥12.50')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试支付' }))
    await screen.findByText('套餐购买成功')
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce()
    expect(startBillingPayment).toHaveBeenCalledTimes(2)
    expect(vi.mocked(startBillingPayment).mock.calls[0][1]).toBe(vi.mocked(startBillingPayment).mock.calls[1][1])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
