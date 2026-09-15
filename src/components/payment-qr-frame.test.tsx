import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { submitPaymentFormHTML } from '@/api/payment-form'
import { PaymentQRCodeFrame } from './payment-qr-frame'

vi.mock('@/api/payment-form', () => ({
  submitPaymentFormHTML: vi.fn(() => vi.fn()),
}))

const PAYMENT_FORM_HTML = '<form action="https://openapi.alipay.com/gateway.do" method="POST"><input name="biz_content" value="{&quot;qrcode_width&quot;:&quot;200&quot;}"><input name="sign" value="signature"></form>'
const LOADING_LABEL = '正在加载支付二维码，请稍候…'

function renderFrame(formHTML = PAYMENT_FORM_HTML) {
  return render(<PaymentQRCodeFrame formHTML={formHTML} title="支付宝二维码" errorMessage="加载失败" loadingLabel={LOADING_LABEL} onError={vi.fn()} />)
}

// 渠道页面跨域后读取 location 会抛错，用不可读的 contentWindow 模拟已经导航到支付宝页面。
function markFrameAsPaymentPage(frame: HTMLElement) {
  Object.defineProperty(frame, 'contentWindow', {
    configurable: true,
    get: () => ({ get location(): Location { throw new Error('blocked by cross origin') } }),
  })
}

describe('支付宝支付二维码 iframe', () => {
  beforeEach(() => {
    vi.mocked(submitPaymentFormHTML).mockClear()
  })

  it('根据签名表单中的二维码宽度等比填满容器', () => {
    renderFrame()

    const frame = screen.getByTitle('支付宝二维码')
    expect(frame).toHaveStyle({ width: '200px', height: '200px', transform: 'scale(1.25)' })
    expect(submitPaymentFormHTML).toHaveBeenCalledWith(PAYMENT_FORM_HTML, expect.objectContaining({ target: expect.stringMatching(/^alipay-payment-/) }))
  })

  it('无法读取有效宽度时保持默认尺寸', () => {
    renderFrame("<form><input name='biz_content' value='{}'></form>")

    expect(screen.getByTitle('支付宝二维码')).toHaveStyle({ width: '250px', height: '250px', transform: 'scale(1)' })
  })

  it('读取 action 中签名参数的二维码宽度且原样提交表单', () => {
    const form = '<form method="post" action="https://openapi.alipay.com/gateway.do?sign=test&amp;biz_content=%7B%22qrcode_width%22%3A200%7D"><input type="submit"></form>'
    renderFrame(form)
    expect(screen.getByTitle('支付宝二维码')).toHaveStyle({ width: '200px', height: '200px', transform: 'scale(1.25)' })
    expect(submitPaymentFormHTML).toHaveBeenCalledWith(form, expect.any(Object))
  })

  it('二维码页面加载完成前用加载占位覆盖，避免出现空白区域', () => {
    renderFrame()

    expect(screen.getByRole('status')).toHaveTextContent(LOADING_LABEL)
  })

  it('插入 iframe 触发的首个 about:blank 事件不算加载完成', () => {
    renderFrame()

    // 无 src 的 iframe 插入后浏览器会先加载 about:blank 并触发一次 load。
    fireEvent.load(screen.getByTitle('支付宝二维码'))

    expect(screen.getByRole('status')).toHaveTextContent(LOADING_LABEL)
  })

  it('导航到渠道页面后隐藏加载占位', () => {
    renderFrame()
    const frame = screen.getByTitle('支付宝二维码')
    // 先确认占位确实在，这条用例才能挡住"占位永不消失"以外的回滚方式。
    expect(screen.getByRole('status')).toBeInTheDocument()
    markFrameAsPaymentPage(frame)

    fireEvent.load(frame)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('渠道页面始终加载不出来时按超时撤掉占位，不会一直转圈', () => {
    vi.useFakeTimers()
    try {
      renderFrame()
      expect(screen.getByRole('status')).toBeInTheDocument()

      act(() => { vi.advanceTimersByTime(15000) })

      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('表单提交失败时只展示错误,不再叠加加载占位', () => {
    vi.mocked(submitPaymentFormHTML).mockImplementationOnce(() => { throw new Error('invalid form') })

    renderFrame()

    expect(screen.getByRole('alert')).toHaveTextContent('加载失败')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('alert').closest('.payment-qr-frame-shell')).toHaveAttribute('aria-busy', 'false')
  })
})
