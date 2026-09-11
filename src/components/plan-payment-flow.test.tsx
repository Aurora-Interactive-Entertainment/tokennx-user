import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccessToken } from '@/auth/token-storage'
import type { BillingContext, BillingPaymentOrder } from '@/api/billing'
import { PurchasePaymentModal } from './purchase-payment-modal'
import { usePlanPayment } from './use-plan-payment'

vi.mock('@/auth/token-storage', async (original) => ({ ...await original<object>(), getAccessToken: vi.fn() }))

const personal: BillingContext = { account_type: 'personal' }
const enterprise: BillingContext = { account_type: 'enterprise', enterprise_id: 'enterprise-public-id' }
const pending: BillingPaymentOrder = {
  id: 'order-public-id', order_no: 'TG-P-ORDER', order_type: 'plan_purchase',
  status: 'pending', currency: 'CNY', amount_cent: '2399', amount_yuan: '23.99',
  paid_amount_cent: '0', paid_amount_yuan: '0.00', account_type: 'personal',
  billing_account_id: '11', expires_at: 1789200000000, paid_at: null, closed_at: null,
  created_at: 1789190000000, updated_at: 1789190000000, version: '0',
}
const signedAction = 'https://openapi.alipay.com/gateway.do?app_id=test&sign=a%2Bb%2Fc%3D&biz_content=%7B%22qrcode_width%22%3A200%7D'
const signedForm = `<form method="post" action="${signedAction.replaceAll('&', '&amp;')}"><input type="submit" value="立即支付"></form>`
const envelope = (data: unknown, status = 200, code = 0, msg = 'success') => new Response(JSON.stringify({ code, msg, data }), { status, headers: { 'Content-Type': 'application/json' } })

describe('套餐支付 HTTP 合同与页面联动', () => {
  beforeEach(() => {
    vi.mocked(getAccessToken).mockReturnValue('test-token')
  })
  afterEach(() => vi.restoreAllMocks())

  it('没有登录令牌时不发送下单请求，并通知登录流程', async () => {
    vi.mocked(getAccessToken).mockReturnValue(null)
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const onAuthFailure = vi.fn()
    const { result } = renderHook(() => usePlanPayment(personal, 'plan-public-id', undefined, onAuthFailure))
    await act(() => startPayment(result.current))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onAuthFailure).toHaveBeenCalledOnce()
  })

  it('微信使用真实 HTTP 封装发送套餐 ID 和 pc/wechat，原样接收二维码且不提交假数据金额', async () => {
    const qr = 'weixin://wxpay/bizpayurl?pr=raw%2Bvalue&sign=X%3D'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const path = new URL(String(input), window.location.origin).pathname
      return path.endsWith('/pay') ? envelope({ order: pending, transaction: { payment_product: 'wechat_native', amount_cent: '2399' }, qrcode_url: qr }) : envelope(pending)
    })
    const { result } = renderHook(() => usePlanPayment(personal, 'plan-public-id'))
    expect(fetchMock).not.toHaveBeenCalled()
    await act(() => result.current.setAgreed(true))
    expect(result.current.qr).toBe(qr)
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ plan_id: 'plan-public-id', quantity: 1 })
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ scene: 'pc', channel: 'wechat' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls.every(([url, init]) => new URL(String(url), window.location.origin).searchParams.get('account_type') === 'personal' && new Headers(init?.headers).get('Authorization') === 'Bearer test-token')).toBe(true)
  })

  it('真实客户端串联实名、下单、签名表单与查单，仅 paid 且有 paid_at 时提示套餐成功', async () => {
    let serverOrder = { ...pending, status: 'paying', version: '1' }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      const path = new URL(String(input), window.location.origin).pathname
      if (path === '/api/user/real-name') return envelope({ status: 'verified' })
      if (path === '/api/user/payment/orders') return envelope(pending)
      if (path.endsWith('/pay')) return envelope({ order: serverOrder, transaction: { id: 'transaction-1' }, form_html: signedForm })
      if (path.endsWith('/order-public-id') && (!options?.method || options.method === 'GET')) return envelope(serverOrder)
      throw new Error(`Unexpected request: ${path}`)
    })
    // 只截断外部网关提交，其余使用实际组件、认证客户端和 HTTP 序列化。
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
    const onPaid = vi.fn()
    render(<MemoryRouter><PurchasePaymentModal open planName="Max" planID="plan-public-id" priceCent="20000" context={personal} onPaid={onPaid} onClose={vi.fn()} /></MemoryRouter>)
    const checkbox = await screen.findByRole('checkbox')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText('¥200.00')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '支付宝支付' }))
    fireEvent.click(checkbox)
    await waitFor(() => expect(submit).toHaveBeenCalledOnce())
    expect(screen.getByText('¥23.99')).toBeInTheDocument()
    expect(checkbox).toBeEnabled()
    const form = submit.mock.instances[0] as HTMLFormElement
    expect(form.action).toBe(signedAction)
    expect(form.target).toMatch(/^alipay-payment-/)
    expect(screen.getByTitle('扫码支付')).toHaveStyle({ width: '200px', height: '200px' })

    const paymentRequests = fetchMock.mock.calls.filter(([url]) => String(url).includes('/payment/orders'))
    expect(JSON.parse(String(paymentRequests[0][1]?.body))).toEqual({ plan_id: 'plan-public-id', quantity: 1 })
    expect(JSON.parse(String(paymentRequests[1][1]?.body))).toEqual({ scene: 'pc', channel: 'alipay' })
    const keys = paymentRequests.slice(0, 2).map(([, options]) => new Headers(options?.headers).get('Idempotency-Key'))
    expect(keys[0]).toMatch(/^[\x20-\x7e]{1,128}$/)
    expect(keys[1]).toMatch(/^[\x20-\x7e]{1,128}$/)
    expect(keys[0]).not.toBe(keys[1])
    for (const [url, options] of paymentRequests) {
      const query = new URL(String(url), window.location.origin).searchParams
      expect(query.get('account_type')).toBe('personal')
      expect(query.has('enterprise_id')).toBe(false)
      expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer test-token')
      if (options?.method === 'POST') expect(new Headers(options.headers).get('Content-Type')).toBe('application/json')
    }

    serverOrder = { ...serverOrder, status: 'paid', paid_at: null, version: '2' }
    fireEvent.click(screen.getByRole('button', { name: '刷新支付状态' }))
    await waitFor(() => expect(screen.queryByTitle('扫码支付')).toBeNull())
    expect(onPaid).not.toHaveBeenCalled()
    serverOrder = { ...serverOrder, paid_at: 1789190100000, paid_amount_yuan: '23.99', paid_amount_cent: '2399', version: '3' }
    fireEvent.click(screen.getByRole('button', { name: '刷新支付状态' }))
    await screen.findByText('套餐购买成功')
    expect(onPaid).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: '重试支付' })).toBeNull()
    expect(screen.queryByRole('button', { name: '刷新支付状态' })).toBeNull()
  })

  it('企业订单四个接口沿用同一主体，关单显式发送空 JSON', async () => {
    const order = { ...pending, ...enterprise }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = new URL(String(input), window.location.origin).pathname
      if (path.endsWith('/pay')) return envelope({ order, transaction: {}, form_html: signedForm })
      if (path.endsWith('/close')) return envelope({ ...order, status: 'closed' })
      return envelope(order)
    })
    const { result } = renderHook(() => usePlanPayment(enterprise, 'plan-public-id'))
    await act(() => startPayment(result.current))
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3))
    const onClose = vi.fn()
    await act(() => result.current.close(onClose))
    expect(onClose).toHaveBeenCalledOnce()
    const paths = fetchMock.mock.calls.map(([url]) => new URL(String(url), window.location.origin).pathname)
    expect(paths).toContain('/api/user/payment/orders')
    expect(paths).toContain('/api/user/payment/orders/order-public-id/pay')
    expect(paths).toContain('/api/user/payment/orders/order-public-id')
    expect(paths).toContain('/api/user/payment/orders/order-public-id/close')
    for (const [url, options] of fetchMock.mock.calls) {
      const query = new URL(String(url), window.location.origin).searchParams
      expect(query.get('account_type')).toBe('enterprise')
      expect(query.get('enterprise_id')).toBe(enterprise.enterprise_id)
      if (String(url).includes('/close')) expect(JSON.parse(String(options?.body))).toEqual({})
    }
  })

  it.each([
    [409, 170004, '套餐库存不足'],
    [409, 170005, '幂等请求冲突'],
    [503, 170007, '支付渠道暂不可用'],
  ])('下单失败 %s/%s 保留服务端错误且不调用支付接口', async (status, code, message) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).includes('/real-name')) return envelope({ status: 'verified' })
      return envelope(null, status as number, code as number, message as string)
    })
    render(<MemoryRouter><PurchasePaymentModal open planName="Max" planID="plan-public-id" onClose={vi.fn()} /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('checkbox'))
    expect(await screen.findByRole('alert')).toHaveTextContent(message as string)
    expect(fetchMock.mock.calls.some(([url]) => /\/pay\?/.test(String(url)))).toBe(false)
    expect(screen.getByRole('button', { name: '重试支付' })).toBeEnabled()
  })

  it('下单响应丢失后重试保持请求体和幂等键不变，避免产生第二笔订单', async () => {
    let creates = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = new URL(String(input), window.location.origin).pathname
      if (path === '/api/user/payment/orders' && ++creates === 1) throw new TypeError('Network error')
      if (path.endsWith('/pay')) return envelope({ order: pending, transaction: {}, form_html: signedForm })
      return envelope(pending)
    })
    const { result } = renderHook(() => usePlanPayment(personal, 'plan-public-id'))
    await act(() => startPayment(result.current))
    expect(result.current.error).toBeTruthy()
    await act(() => startPayment(result.current))
    const requests = fetchMock.mock.calls.filter(([url]) => new URL(String(url), window.location.origin).pathname === '/api/user/payment/orders')
    expect(requests).toHaveLength(2)
    expect(requests[0][1]?.body).toBe(requests[1][1]?.body)
    expect(new Headers(requests[0][1]?.headers).get('Idempotency-Key')).toBe(new Headers(requests[1][1]?.headers).get('Idempotency-Key'))
  })
})

// 旧支付宝回归显式选择渠道并同意协议，重试仍走同一会话。
async function startPayment(payment: ReturnType<typeof usePlanPayment>) {
  if (!payment.agreed) { await payment.selectMethod('alipay'); await payment.setAgreed(true) }
  else await payment.start()
}
