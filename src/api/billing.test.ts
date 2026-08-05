import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './http'
import {
  BILLING_PAGE_SIZE,
  BILLING_PAYMENT_SCENE_PC,
  closeBillingPaymentOrder,
  createBillingQuery,
  createBillingPaymentOrder,
  getBillingAnalysis,
  getBillingBonusGrants,
  getBillingErrorMessage,
  getBillingInvoices,
  getBillingRequestId,
  getBillingRewards,
  getBillingStatements,
  getBillingSummary,
  getBillingWallet,
  getBillingPaymentOrder,
  startBillingPayment,
  submitBillingInvoice,
  type BillingContext,
} from './billing'

function apiResponse(data: unknown, status = 200, code = 0, msg = 'success', requestId = 'server-request-id'): Response {
  return new Response(JSON.stringify({ code, msg, data }), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
  })
}

const PERSONAL_CONTEXT: BillingContext = { account_type: 'personal' }
const ENTERPRISE_CONTEXT: BillingContext = { account_type: 'enterprise', enterprise_id: '01K0ENTERPRISEPUBLICIDEX01' }

describe('用户账务 API 客户端', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('按账户类型生成隔离查询参数，并拒绝缺少企业 ID 的上下文', () => {
    expect(createBillingQuery(PERSONAL_CONTEXT)).toBe('account_type=personal')
    expect(createBillingQuery(ENTERPRISE_CONTEXT, { page: 2, page_size: BILLING_PAGE_SIZE })).toBe('account_type=enterprise&enterprise_id=01K0ENTERPRISEPUBLICIDEX01&page=2&page_size=20')
    expect(() => createBillingQuery({ account_type: 'enterprise' })).toThrowError('企业账务上下文缺少企业 ID')
  })

  it('接入钱包、摘要、奖励、赠送批次和流水的合同路径及分页参数', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => apiResponse({}))
    await getBillingWallet(PERSONAL_CONTEXT, { accessToken: 'billing-token' })
    await getBillingSummary(ENTERPRISE_CONTEXT, { accessToken: 'billing-token' })
    await getBillingRewards(PERSONAL_CONTEXT, { page: 2, page_size: 50, accessToken: 'billing-token' })
    await getBillingBonusGrants(ENTERPRISE_CONTEXT, { page: 3, page_size: 10, accessToken: 'billing-token' })
    await getBillingStatements(PERSONAL_CONTEXT, { page: 4, page_size: 30, direction: 'expense', accessToken: 'billing-token' })

    const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input), window.location.origin))
    expect(urls.map((url) => url.pathname)).toEqual([
      '/api/user/billing/wallet',
      '/api/user/billing/summary',
      '/api/user/billing/rewards',
      '/api/user/billing/bonus-grants',
      '/api/user/billing/statements',
    ])
    expect(urls[0].searchParams.get('account_type')).toBe('personal')
    expect(urls[0].searchParams.get('enterprise_id')).toBeNull()
    expect(urls[1].searchParams.get('enterprise_id')).toBe(ENTERPRISE_CONTEXT.enterprise_id)
    expect(urls[2].searchParams.get('page')).toBe('2')
    expect(urls[2].searchParams.get('page_size')).toBe('50')
    expect(urls[3].searchParams.get('page')).toBe('3')
    expect(urls[4].searchParams.get('direction')).toBe('expense')
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('X-Request-ID')).toBeTruthy()
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer billing-token')
  })

  it('接入费用分析、发票概览和发票申请，并传递筛选与幂等参数', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, requestOptions) => {
      const url = new URL(String(input), window.location.origin)
      if (url.pathname.endsWith('/invoices') && requestOptions?.method === 'POST') return apiResponse({ id: 'invoice-1' })
      return apiResponse({})
    })
    await getBillingAnalysis(ENTERPRISE_CONTEXT, { period: '2026-07', api_key_id: 'key-1', model: 'gpt-4o', source: 'recharge', page: 2, page_size: 10, accessToken: 'billing-token' })
    await getBillingInvoices(PERSONAL_CONTEXT, { page: 3, page_size: 5, accessToken: 'billing-token' })
	await submitBillingInvoice(PERSONAL_CONTEXT, { amount_yuan: '20.00', title: '测试企业', tax_identifier: '91310000TEST', taxpayer_type: 'enterprise', email: 'billing@example.com', project_name: '模型服务', invoice_type: 'special' }, 'invoice-idempotency-1', { accessToken: 'billing-token' })

    const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input), window.location.origin))
    expect(urls.map((url) => url.pathname)).toEqual(['/api/user/billing/analysis', '/api/user/billing/invoices', '/api/user/billing/invoices'])
    expect(urls[0]?.searchParams.get('period')).toBe('2026-07')
    expect(urls[0]?.searchParams.get('api_key_id')).toBe('key-1')
    expect(urls[0]?.searchParams.get('model')).toBe('gpt-4o')
    expect(urls[0]?.searchParams.get('source')).toBe('recharge')
    expect(urls[1]?.searchParams.get('page')).toBe('3')
    expect(urls[1]?.searchParams.get('page_size')).toBe('5')
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe('POST')
    expect(new Headers(fetchMock.mock.calls[2]?.[1]?.headers).get('Idempotency-Key')).toBe('invoice-idempotency-1')
	expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toMatchObject({ amount_yuan: '20.00', taxpayer_type: 'enterprise', invoice_type: 'special' })
  })

  it('只通过电脑网站支付创建充值订单、生成支付宝表单并支持查单关单', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, requestOptions) => {
      const url = new URL(String(input), window.location.origin)
      if (url.pathname.endsWith('/pay')) return apiResponse({ order: { id: 'order-1' }, transaction: { id: 'transaction-1' }, form_html: '<form></form>' })
      return apiResponse({ id: 'order-1', order_no: 'ORDER-1', status: 'pending' })
    })

    await createBillingPaymentOrder(PERSONAL_CONTEXT, { amount_yuan: '50.00', description: '账户充值' }, 'payment-order-1', { accessToken: 'billing-token' })
    await startBillingPayment(PERSONAL_CONTEXT, 'order-1', 'payment-start-1', { accessToken: 'billing-token' })
    await getBillingPaymentOrder('order-1', { accessToken: 'billing-token' })
    await closeBillingPaymentOrder('order-1', { accessToken: 'billing-token' })

    const calls = fetchMock.mock.calls.map(([input, options]) => ({ url: new URL(String(input), window.location.origin), options }))
    expect(calls.map(({ url }) => url.pathname)).toEqual([
      '/api/user/payment/orders',
      '/api/user/payment/orders/order-1/pay',
      '/api/user/payment/orders/order-1',
      '/api/user/payment/orders/order-1/close',
    ])
    expect(calls[0].url.searchParams.get('account_type')).toBe('personal')
    expect(calls[0].options?.method).toBe('POST')
    expect(JSON.parse(String(calls[0].options?.body))).toEqual({ amount_yuan: '50.00', description: '账户充值' })
    expect(new Headers(calls[0].options?.headers).get('Idempotency-Key')).toBe('payment-order-1')
    expect(JSON.parse(String(calls[1].options?.body))).toEqual({ scene: BILLING_PAYMENT_SCENE_PC })
    expect(new Headers(calls[1].options?.headers).get('Idempotency-Key')).toBe('payment-start-1')
    expect(calls[2].options?.method).toBeUndefined()
    expect(calls[3].options?.method).toBe('POST')
    expect(new Headers(calls[3].options?.headers).get('Idempotency-Key')).toBe('close-order-1')
    expect(new Headers(calls[1].options?.headers).get('Authorization')).toBe('Bearer billing-token')
  })

  it('拒绝企业充值上下文和缺失支付幂等标识', async () => {
    expect(() => createBillingPaymentOrder(ENTERPRISE_CONTEXT, { amount_yuan: '20.00' }, 'payment-order-1')).toThrowError('当前支付宝充值仅支持个人空间')
    expect(() => startBillingPayment(PERSONAL_CONTEXT, 'order-1', '  ')).toThrowError('支付请求缺少幂等标识，请重试')
    expect(() => closeBillingPaymentOrder('  ')).toThrowError('支付订单编号不能为空')
  })

  it('映射权限、1300xx 和网络错误，同时保留服务端请求 ID', () => {
    expect(getBillingErrorMessage(new ApiError('forbidden', 403, 120001, 'req-403'))).toBe('当前工作空间没有账务查看权限')
    expect(getBillingErrorMessage(new ApiError('retry', 503, 130009, 'req-130009'))).toBe('奖励依赖暂时不可用，请稍后重试')
    expect(getBillingErrorMessage(new ApiError('revoked', 409, 130006, 'req-130006'))).toBe('该奖励没有可撤销余额')
    expect(getBillingErrorMessage(new ApiError('invoice unavailable', 409, 130011, 'req-130011'))).toBe('当前可开票金额不足')
    expect(getBillingErrorMessage(new ApiError('payment unavailable', 503, 140007, 'req-140007'))).toBe('支付宝渠道暂不可用，请稍后重试')
    expect(getBillingErrorMessage(new Error('offline'))).toBe('账务请求失败，请稍后重试')
    expect(getBillingRequestId(new ApiError('bad', 400, 100001, 'req-1'))).toBe('req-1')
    expect(getBillingRequestId(new Error('bad'))).toBeNull()
  })
})
