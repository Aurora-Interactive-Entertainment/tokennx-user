import { useEffect, useId, useState } from 'react'
import { submitPaymentFormHTML } from '@/api/payment-form'

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

export function PaymentQRCodeFrame({ formHTML, title, errorMessage, onError }: PaymentQRCodeFrameProps) {
  const frameName = frameNameForID(useId())
  const [submissionFailed, setSubmissionFailed] = useState(false)

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
    <div className="payment-qr-frame-shell">
      {submissionFailed ? <div className="payment-qr-frame-error" role="alert">{errorMessage}</div> : <iframe className="payment-qr-frame" name={frameName} title={title} referrerPolicy="strict-origin-when-cross-origin" />}
    </div>
  )
}
