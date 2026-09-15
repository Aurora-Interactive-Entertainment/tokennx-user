import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Spin from '@douyinfe/semi-ui/lib/es/spin'
import { submitPaymentFormHTML } from '@/api/payment-form'
import './payment-qr-frame.css'

const PAYMENT_QR_DISPLAY_SIZE = 250
const PAYMENT_QR_MIN_SOURCE_SIZE = 100
const PAYMENT_QR_MAX_SOURCE_SIZE = 600
// 渠道页面被网络策略拒绝内嵌或导航根本没发生时不会有新的 load 事件，
// 超过这个时间就撤掉占位，避免加载提示一直盖住浏览器自己的报错页。
const PAYMENT_FRAME_LOAD_TIMEOUT_MS = 15000

interface PaymentQRCodeFrameProps {
  formHTML: string
  title: string
  errorMessage: string
  loadingLabel: string
  onError: (error: unknown) => void
}

function frameNameForID(id: string): string {
  const normalizedID = id.replace(/[^A-Za-z0-9_-]/g, '')
  return `alipay-payment-${normalizedID || 'frame'}`
}

// 仅读取已签名 biz_content 中的尺寸用于展示缩放，不能修改字段内容，否则支付宝验签会失败。
function paymentQRCodeSourceSize(formHTML: string): number {
  if (typeof DOMParser === 'undefined') return PAYMENT_QR_DISPLAY_SIZE
  try {
    const parsed = new DOMParser().parseFromString(formHTML.trim(), 'text/html')
    const sourceForm = parsed.querySelector('form')
    const bizContent = sourceForm?.querySelector<HTMLInputElement>('input[name="biz_content"]')?.value
      || new URL(sourceForm?.getAttribute('action') || '').searchParams.get('biz_content')
    if (!bizContent) return PAYMENT_QR_DISPLAY_SIZE
    const payload = JSON.parse(bizContent) as { qrcode_width?: unknown }
    const sourceSize = Number(payload.qrcode_width)
    if (!Number.isFinite(sourceSize) || sourceSize < PAYMENT_QR_MIN_SOURCE_SIZE || sourceSize > PAYMENT_QR_MAX_SOURCE_SIZE) return PAYMENT_QR_DISPLAY_SIZE
    return sourceSize
  } catch {
    return PAYMENT_QR_DISPLAY_SIZE
  }
}

// iframe 插入后浏览器会先加载 about:blank 并触发一次 load，它不是支付二维码页面。
// 渠道页面跨域，读取 location 会抛错，抛错即说明已经离开 about:blank。
function frameShowsPaymentPage(frame: HTMLIFrameElement | null): boolean {
  if (!frame) return false
  try {
    const href = frame.contentWindow?.location.href ?? ''
    return href !== '' && href !== 'about:blank'
  } catch {
    return true
  }
}

export function PaymentQRCodeFrame({ formHTML, title, errorMessage, loadingLabel, onError }: PaymentQRCodeFrameProps) {
  const frameName = frameNameForID(useId())
  const shellRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [submissionFailed, setSubmissionFailed] = useState(false)
  // 表单提交只代表请求发出，二维码页面（含二维码图片）还要等网络返回，这段时间用占位遮罩顶上。
  const [frameLoaded, setFrameLoaded] = useState(false)
  const [displaySize, setDisplaySize] = useState(PAYMENT_QR_DISPLAY_SIZE)
  const sourceSize = useMemo(() => paymentQRCodeSourceSize(formHTML), [formHTML])
  const frameScale = displaySize / sourceSize

  useLayoutEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const updateDisplaySize = () => {
      const nextSize = shell.clientWidth
      if (nextSize > 0) setDisplaySize(nextSize)
    }
    updateDisplaySize()
    // 窄屏时以容器实际宽度重新计算比例，保证二维码四边同时缩放且不被裁切。
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateDisplaySize)
    observer.observe(shell)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cleanup: (() => void) | undefined
    setSubmissionFailed(false)
    setFrameLoaded(false)
    const loadTimeout = window.setTimeout(() => setFrameLoaded(true), PAYMENT_FRAME_LOAD_TIMEOUT_MS)
    try {
      // 支付宝前置模式要求商户页面用 iframe 请求其支付页面，不能让表单接管顶层窗口。
      cleanup = submitPaymentFormHTML(formHTML, { target: frameName })
    } catch (error) {
      setSubmissionFailed(true)
      onError(error)
    }
    return () => {
      window.clearTimeout(loadTimeout)
      cleanup?.()
    }
  }, [formHTML, frameName, onError])

  return (
    <div ref={shellRef} className="payment-qr-frame-shell" aria-busy={!submissionFailed && !frameLoaded}>
      {submissionFailed ? (
        <div className="payment-qr-frame-error" role="alert">{errorMessage}</div>
      ) : (
        <>
          <iframe
            ref={frameRef}
            className="payment-qr-frame"
            name={frameName}
            title={title}
            scrolling="no"
            referrerPolicy="strict-origin-when-cross-origin"
            style={{ width: sourceSize, height: sourceSize, transform: `scale(${frameScale})` }}
            onLoad={() => { if (frameShowsPaymentPage(frameRef.current)) setFrameLoaded(true) }}
          />
          {frameLoaded ? null : (
            <div className="payment-qr-frame-loading" role="status">
              <Spin size="large" />
              <span>{loadingLabel}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
