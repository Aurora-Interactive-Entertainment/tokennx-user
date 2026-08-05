import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './http'
import { submitPaymentFormHTML } from './payment-form'

describe('支付宝支付表单提交器', () => {
  beforeEach(() => {
    document.querySelectorAll('form[data-payment-test]').forEach((form) => form.remove())
  })

  it('只复制受控表单字段并提交到指定窗口，不执行返回脚本', () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
      this.setAttribute('data-payment-test', 'submitted')
    })
    const script = vi.spyOn(document, 'createElement')

    const cleanup = submitPaymentFormHTML('<form action="https://openapi.alipay.com/gateway.do" method="POST"><input name="sign" value="signature"><input name="biz_content" value="{&quot;amount&quot;:&quot;50.00&quot;}"><script>window.__paymentScriptExecuted = true</script></form>', { target: '_self' })

    const form = document.querySelector<HTMLFormElement>('form[data-payment-test]')
    expect(form).not.toBeNull()
    expect(form).toHaveAttribute('method', 'POST')
    expect(form).toHaveAttribute('target', '_self')
    expect(form?.action).toBe('https://openapi.alipay.com/gateway.do')
    expect(Array.from(form?.querySelectorAll('input') ?? []).map((input) => [input.name, input.value])).toEqual([
      ['sign', 'signature'],
      ['biz_content', '{"amount":"50.00"}'],
    ])
    expect(script).not.toHaveBeenCalledWith('script')
    expect((window as Window & { __paymentScriptExecuted?: boolean }).__paymentScriptExecuted).toBeUndefined()
    cleanup()
    submit.mockRestore()
  })

  it('支持把支付表单提交到商家页面 iframe 并清理临时表单', () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
      this.setAttribute('data-payment-test', 'submitted')
    })

    const cleanup = submitPaymentFormHTML('<form action="https://openapi.alipay.com/gateway.do" method="POST"><input name="sign" value="signature"></form>', { target: 'alipay-payment-frame' })

    const form = document.querySelector<HTMLFormElement>('form[data-payment-test]')
    expect(form).toHaveAttribute('target', 'alipay-payment-frame')
    cleanup()
    expect(form?.isConnected).toBe(false)
    submit.mockRestore()
  })

  it('拒绝缺少表单、非 POST 或没有字段的支付响应', () => {
    expect(() => submitPaymentFormHTML('', { target: '_self' })).toThrowError(ApiError)
    expect(() => submitPaymentFormHTML('<form action="https://openapi.alipay.com/gateway.do" method="GET"><input name="sign" value="x"></form>', { target: '_self' })).toThrowError('支付宝支付表单无效，请重新发起支付')
    expect(() => submitPaymentFormHTML('<form action="https://openapi.alipay.com/gateway.do" method="POST"></form>', { target: '_self' })).toThrowError('支付宝支付表单无效，请重新发起支付')
    expect(() => submitPaymentFormHTML('<form action="https://openapi.alipay.com/gateway.do" method="POST"><input name="sign" value="x"></form>', { target: 'invalid target' })).toThrowError('支付宝支付表单无效，请重新发起支付')
  })
})
