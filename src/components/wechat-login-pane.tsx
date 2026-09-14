import { useEffect, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { WechatQrResult } from '@/api/auth'
import { WECHAT_AUTHORIZATION_ORIGIN, wechatFrameUrl } from '@/auth/wechat-authorization'
import { useResolvedTheme } from '@/theme'
import type { WechatLoginView } from './use-wechat-login'
import './wechat-login-pane.css'

function WechatLoginFrame({ session, frameRef, onOpenFallback }: {
  session: WechatQrResult
  frameRef: RefObject<HTMLIFrameElement | null>
  onOpenFallback: (url: string) => void
}) {
  const { t, i18n } = useTranslation()
  const theme = useResolvedTheme()
  // 单次授权过程中固定官方页面参数，主题/语言切换不重载正在授权的二维码。
  const [src] = useState(() => wechatFrameUrl(session, theme, i18n.language))
  const [phase, setPhase] = useState<'loading' | 'ready' | 'callback' | 'slow' | 'failed'>('loading')
  const loadCount = useRef(0)

  useEffect(() => {
    // 只有长时间收不到微信官方就绪消息时才提示“加载较慢”；明确的 iframe error 走失败兜底。
    const slowTimer = window.setTimeout(() => setPhase(value => value === 'loading' ? 'slow' : value), 15000)
    const onMessage = (event: MessageEvent) => {
      // 只信任当前官方 iframe 的就绪通知，postMessage 不可直接签发本站登录态。
      if (event.origin !== WECHAT_AUTHORIZATION_ORIGIN || event.source !== frameRef.current?.contentWindow) return
      try {
        const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (message?.type === 'status' && ['wxReady', 'wxQRcodeReady'].includes(message.status)) {
          setPhase('ready')
          window.clearTimeout(slowTimer)
        }
      } catch { /* 忽略非微信就绪通知。 */ }
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.clearTimeout(slowTimer)
      window.removeEventListener('message', onMessage)
    }
  }, [frameRef])

  return (
    <>
      <div className="wechat-login-frame-shell">
        <iframe
          ref={frameRef}
          className="wechat-login-frame"
          title={t('login.wechatLoginTitle')}
          src={src}
          scrolling="no"
          allow={`local-network-access ${WECHAT_AUTHORIZATION_ORIGIN}; local-network ${WECHAT_AUTHORIZATION_ORIGIN}; loopback-network ${WECHAT_AUTHORIZATION_ORIGIN}`}
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => {
            loadCount.current += 1
            // 首次 load 只代表文档建立；二维码就绪必须等待官方 postMessage。
            // 授权后进入同源回调页，父页面校验消息后兑换登录结果。
            if (loadCount.current > 1) setPhase('callback')
          }}
          // iframe error 是明确的加载失败，不能再显示“加载较慢”。
          onError={() => setPhase('failed')}
        />
        {phase === 'loading' || phase === 'callback' ? (
          <div className="wechat-login-frame-cover" role="status">
            <span className="get-code-spinner" aria-hidden="true" />
            <span>{t(phase === 'callback' ? 'login.wechatCompleting' : 'login.qrLoading')}</span>
          </div>
        ) : null}
      </div>
      {phase === 'slow' ? <p className="wechat-login-hint" role="status">{t('login.wechatFrameSlow')}</p> : null}
      {phase === 'failed' ? (
        <div className="wechat-login-frame-failure" role="status">
          <p>{t('login.wechatFrameFailed')}</p>
          <button
            className="btn btn-primary submit-btn login-capsule-action login-capsule-soft"
            type="button"
            onClick={() => onOpenFallback(src)}
          >
            <span>{t('login.openWechatQr')}</span>
          </button>
        </div>
      ) : null}
    </>
  )
}

export function WechatLoginPane({ session, view, error, frameRef, onOpenFallback, onRetry, onBack }: {
  session: WechatQrResult | null
  view: WechatLoginView
  error: string
  frameRef: RefObject<HTMLIFrameElement | null>
  onOpenFallback: (url: string) => void
  onRetry: () => void
  onBack: () => void
}) {
  const { t } = useTranslation()
  const failed = view === 'error' || view === 'expired'
  return (
    <>
      <h2 className="login-panel-title" id="login-panel-heading">{t('login.wechatLoginTitle')}</h2>
      {session ? <WechatLoginFrame key={session.state} session={session} frameRef={frameRef} onOpenFallback={onOpenFallback} /> : (
        <div className="wechat-login-placeholder" role="status">
          {!failed ? <span className="get-code-spinner" aria-hidden="true" /> : null}
          <span>{t(view === 'expired' ? 'login.wechatExpiredTitle' : failed ? 'login.qrFailed' : view === 'completing' ? 'login.wechatCompleting' : 'login.qrLoading')}</span>
        </div>
      )}
      {error ? <p className={`wechat-status wechat-login-feedback${failed ? ' is-error' : ''}`} role="status" aria-live="polite">{error}</p> : null}
      {/* 正常与过期状态都沿用登录页原有按钮，不再切换成文字链接。 */}
      {(failed || session) && (
        <button className="btn btn-primary submit-btn login-capsule-action login-capsule-soft" type="button" onClick={onRetry}>
          <span>{t('login.refreshQr')}</span>
        </button>
      )}
      <button className="btn login-switch-btn" type="button" onClick={onBack}>{t('login.backToPhone')}</button>
    </>
  )
}
