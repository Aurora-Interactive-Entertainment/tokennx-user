import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import './payment-qr-code.css'

interface PaymentQRCodeProps {
  value: string
  title: string
  errorMessage: string
  onError: (error: unknown) => void
}

// 中文：支付接口返回二维码内容后在当前页面生成 canvas，避免跨域支付页内部尺寸不可控。
export function PaymentQRCode({ value, title, errorMessage, onError }: PaymentQRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [generationFailed, setGenerationFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !value.trim()) return
    let disposed = false
    setGenerationFailed(false)
    canvas.width = 0
    canvas.height = 0

    void QRCode.toCanvas(canvas, value.trim(), {
      width: 320,
      margin: 2,
      color: { dark: '#111827', light: '#ffffff' },
    }).catch((error: unknown) => {
      if (disposed) return
      setGenerationFailed(true)
      onError(error)
    })

    return () => {
      disposed = true
    }
  }, [onError, value])

  return (
    <div className="payment-qr-code-shell">
      {generationFailed ? <div className="payment-qr-code-error" role="alert">{errorMessage}</div> : <canvas ref={canvasRef} className="payment-qr-code" aria-label={title} />}
    </div>
  )
}
