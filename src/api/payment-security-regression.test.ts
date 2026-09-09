import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, resolveBackendBaseUrl } from './http'
import { downloadBillingInvoice } from './billing'
import { isAllowedAlipayPaymentUrl, submitPaymentFormHTML } from './payment-form'
import { billingDateRangeToUtcMilliseconds } from '@/pages/billing'

describe('支付边界安全回归', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    document.querySelectorAll('form[data-payment-test]').forEach((form) => form.remove())
  })

  it('仅允许官方 HTTPS 支付地址，拒绝明文和外域地址', () => {
    expect(isAllowedAlipayPaymentUrl('https://openapi.alipay.com/gateway.do')).toBe(true)
    expect(isAllowedAlipayPaymentUrl('http://openapi.alipay.com/gateway.do')).toBe(false)
    expect(isAllowedAlipayPaymentUrl('https://evil.example/collect')).toBe(false)
    expect(isAllowedAlipayPaymentUrl('/gateway.do')).toBe(false)
  })

  it('支付表单禁止把签名字段提交到非官方地址', () => {
    expect(() => submitPaymentFormHTML(
      '<form action="http://openapi.alipay.com/gateway.do" method="POST"><input name="sign" value="sig"></form>',
      { target: '_self' },
    )).toThrow(ApiError)
    expect(() => submitPaymentFormHTML(
      '<form action="https://evil.example/collect" method="POST"><input name="sign" value="sig"></form>',
      { target: '_self' },
    )).toThrow(ApiError)
  })

  it('发票下载不向外部地址发送认证请求', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await expect(downloadBillingInvoice('https://evil.example/invoice.pdf', { accessToken: 'billing-token' })).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('生产环境地址校验拒绝 HTTP、相对地址和带凭据的 URL', () => {
    expect(resolveBackendBaseUrl('https://api.example.com/', undefined, undefined, true)).toBe('https://api.example.com')
    expect(() => resolveBackendBaseUrl('http://api.example.com', undefined, undefined, true)).toThrow()
    expect(() => resolveBackendBaseUrl('/api', undefined, undefined, true)).toThrow()
    expect(() => resolveBackendBaseUrl('https://user:pass@api.example.com', undefined, undefined, true)).toThrow()
  })

  it('账单日期按 UTC 日边界发送，结束时间为排他边界', () => {
    const range = billingDateRangeToUtcMilliseconds([
      new Date(2026, 7, 1, 0, 0, 0),
      new Date(2026, 7, 3, 23, 59, 59),
    ])
    expect(range).toEqual({
      startAt: Date.UTC(2026, 7, 1),
      endAt: Date.UTC(2026, 7, 4),
    })
  })
})
