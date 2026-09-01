import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
import { PaymentQRCode } from './payment-qr-code'

vi.mock('qrcode', () => ({
  default: { toCanvas: vi.fn() },
}))

describe('支付二维码', () => {
  beforeEach(() => {
    vi.mocked(QRCode.toCanvas).mockReset().mockResolvedValue(undefined)
  })

  it('使用接口返回的支付链接生成占满容器的二维码', async () => {
    render(<PaymentQRCode value="https://pay.example.com/order/1" title="支付宝二维码" errorMessage="二维码生成失败" onError={vi.fn()} />)

    const canvas = screen.getByLabelText('支付宝二维码')
    expect(canvas).toHaveClass('payment-qr-code')
    await waitFor(() => expect(QRCode.toCanvas).toHaveBeenCalledWith(canvas, 'https://pay.example.com/order/1', expect.objectContaining({ width: 320, margin: 2 })))
  })

  it('生成失败时显示错误提示并通知调用方', async () => {
    const error = new Error('invalid QR content')
    const onError = vi.fn()
    vi.mocked(QRCode.toCanvas).mockRejectedValueOnce(error)

    render(<PaymentQRCode value="invalid" title="支付宝二维码" errorMessage="二维码生成失败" onError={onError} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('二维码生成失败')
    expect(onError).toHaveBeenCalledWith(error)
  })
})
