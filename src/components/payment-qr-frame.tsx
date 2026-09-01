import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { submitPaymentFormHTML } from '@/api/payment-form'

const PAYMENT_QR_DISPLAY_SIZE = 250
const PAYMENT_QR_MIN_SOURCE_SIZE = 100
const PAYMENT_QR_MAX_SOURCE_SIZE = 600

interface PaymentQRCodeFrameProps {
  formHTML: string
  title: string
  errorMessage: string
  onError: (error: unknown) => void
}

function frameNameForID(id: string): string {
  const normalizedID = id.replace(/[^A-Za-z0-9_-]/g, '')
  return `alipay-payment-${normalizedID || 'frame'}`
}

// 中文：仅读取已签名 biz_content 中的尺寸用于展示缩放，不能修改字段内容，否则支付宝验签会失败。
function paymentQRCodeSourceSize(formHTML: string): number {
  if (typeof DOMParser === 'undefined') return PAYMENT_QR_DISPLAY_SIZE
  try {
    const parsed = new DOMParser().parseFromString(formHTML.trim(), 'text/html')
    const bizContent = parsed.querySelector<HTMLInputElement>('form input[name="biz_content"]')?.value
    if (!bizContent) return PAYMENT_QR_DISPLAY_SIZE
    const payload = JSON.parse(bizContent) as { qrcode_width?: unknown }
    const sourceSize = Number(payload.qrcode_width)
    if (!Number.isFinite(sourceSize) || sourceSize < PAYMENT_QR_MIN_SOURCE_SIZE || sourceSize > PAYMENT_QR_MAX_SOURCE_SIZE) return PAYMENT_QR_DISPLAY_SIZE
    return sourceSize
  } catch {
    return PAYMENT_QR_DISPLAY_SIZE
  }
}

export function PaymentQRCodeFrame({ formHTML, title, errorMessage, onError }: PaymentQRCodeFrameProps) {
  const frameName = frameNameForID(useId())
  const shellRef = useRef<HTMLDivElement>(null)
  const [submissionFailed, setSubmissionFailed] = useState(false)
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
    // 中文：窄屏时以容器实际宽度重新计算比例，保证二维码四边同时缩放且不被裁切。
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateDisplaySize)
    observer.observe(shell)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cleanup: (() => void) | undefined
    setSubmissionFailed(false)
    try {
      // 中文：支付宝前置模式要求商户页面用 iframe 请求其支付页面，不能让表单接管顶层窗口。
      cleanup = submitPaymentFormHTML(formHTML, { target: frameName })
    } catch (error) {
      setSubmissionFailed(true)
      onError(error)
    }
    return () => cleanup?.()
  }, [formHTML, frameName, onError])

  return (
    <div ref={shellRef} className="payment-qr-frame-shell">
      {submissionFailed ? <div className="payment-qr-frame-error" role="alert">{errorMessage}</div> : <iframe className="payment-qr-frame" name={frameName} title={title} scrolling="no" referrerPolicy="strict-origin-when-cross-origin" style={{ width: sourceSize, height: sourceSize, transform: `scale(${frameScale})` }} />}
    </div>
  )
}
