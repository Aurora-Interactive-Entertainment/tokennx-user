import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { submitPaymentFormHTML } from '@/api/payment-form'
import { PaymentQRCodeFrame } from './payment-qr-frame'

vi.mock('@/api/payment-form', () => ({
  submitPaymentFormHTML: vi.fn(() => vi.fn()),
}))

const PAYMENT_FORM_HTML = '<form action="https://openapi.alipay.com/gateway.do" method="POST"><input name="biz_content" value="{&quot;qrcode_width&quot;:&quot;200&quot;}"><input name="sign" value="signature"></form>'

describe('支付宝支付二维码 iframe', () => {
  beforeEach(() => {
    vi.mocked(submitPaymentFormHTML).mockClear()
  })

  it('根据签名表单中的二维码宽度等比填满容器', () => {
    render(<PaymentQRCodeFrame formHTML={PAYMENT_FORM_HTML} title="支付宝二维码" errorMessage="加载失败" onError={vi.fn()} />)

    const frame = screen.getByTitle('支付宝二维码')
    expect(frame).toHaveStyle({ width: '200px', height: '200px', transform: 'scale(1.25)' })
    expect(submitPaymentFormHTML).toHaveBeenCalledWith(PAYMENT_FORM_HTML, expect.objectContaining({ target: expect.stringMatching(/^alipay-payment-/) }))
  })

  it('无法读取有效宽度时保持默认尺寸', () => {
    render(<PaymentQRCodeFrame formHTML="<form><input name='biz_content' value='{}'></form>" title="支付宝二维码" errorMessage="加载失败" onError={vi.fn()} />)

    expect(screen.getByTitle('支付宝二维码')).toHaveStyle({ width: '250px', height: '250px', transform: 'scale(1)' })
  })
})
