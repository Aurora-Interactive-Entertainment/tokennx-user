import { useEffect, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { WechatQrResult } from '@/api/auth'
import { WECHAT_AUTHORIZATION_ORIGIN, wechatFrameUrl } from '@/auth/wechat-authorization'
import { useResolvedTheme } from '@/theme'
import type { WechatLoginView } from './use-wechat-login'
import './wechat-login-pane.css'

type WechatFramePhase = 'loading' | 'ready' | 'failed'

function WechatLoginFrame({ session, frameRef, onPhaseChange }: {
  session: WechatQrResult
  frameRef: RefObject<HTMLIFrameElement | null>
  onPhaseChange: (phase: WechatFramePhase) => void
}) {
  const { t, i18n } = useTranslation()
  const theme = useResolvedTheme()
  // 单次授权过程中固定官方页面参数，主题/语言切换不重载正在授权的二维码。
  const [src] = useState(() => wechatFrameUrl(session, theme, i18n.language))
  // 这里只描述二维码自身的加载状态；“正在完成登录”由 use-wechat-login 的 view 驱动。
  const [phase, setPhase] = useState<WechatFramePhase>('loading')

  // 上报给外层：加载慢或加载失败时，外层要让“重新获取二维码”真正可点，
  // 否则界面提示用户刷新、却没有任何按钮可以点。
  useEffect(() => { onPhaseChange(phase) }, [phase, onPhaseChange])

  useEffect(() => {
    // 官方页先发 wxReady（页面脚本就绪），二维码图片真正加载完后才发 wxQRcodeReady；
    // 只有后者能确认二维码已渲染，用 wxReady 提前撤遮罩会露出一个空白方框。
    // 兜底：一直等不到就按加载失败处理，给出可操作的重试入口，而不是留一个空方框。
    const coverFallback = window.setTimeout(() => setPhase(value => value === 'loading' ? 'failed' : value), 5000)
    const onMessage = (event: MessageEvent) => {
      // 只信任当前官方 iframe 的就绪通知，postMessage 不可直接签发本站登录态。
      if (event.origin !== WECHAT_AUTHORIZATION_ORIGIN || event.source !== frameRef.current?.contentWindow) return
      try {
        const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        // 迟到的就绪通知也要认，允许从失败态自愈。
        if (message?.type === 'status' && message.status === 'wxQRcodeReady') {
          setPhase('ready')
          window.clearTimeout(coverFallback)
        }
      } catch { /* 忽略非微信就绪通知。 */ }
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.clearTimeout(coverFallback)
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
          // 微信官方授权页需要访问本机微信桥接服务，权限声明与官方 WxLogin 组件保持一致。
          allow="local-network-access"
          referrerPolicy="strict-origin-when-cross-origin"
          // 就绪只以官方 postMessage 为准；也不能按 load 次数推断“用户已授权”，
          // 否则官方页自身任何一次跳转都会让下面的遮罩永久盖住二维码。
          onError={() => setPhase('failed')}
        />
        {phase === 'loading' || phase === 'failed' ? (
          <div className="wechat-login-frame-cover" role="status">
            {phase === 'loading' ? <span className="get-code-spinner" aria-hidden="true" /> : null}
            <span>{phase === 'failed' ? t('login.wechatFrameFailed') : t('login.qrLoading')}</span>
          </div>
        ) : null}
      </div>
    </>
  )
}

export function WechatLoginPane({ session, view, error, frameRef, onRetry, onBack }: {
  session: WechatQrResult | null
  view: WechatLoginView
  error: string
  frameRef: RefObject<HTMLIFrameElement | null>
  onRetry: () => void
  onBack: () => void
}) {
  const { t } = useTranslation()
  const [framePhase, setFramePhase] = useState<WechatFramePhase>('loading')
  const failed = view === 'error' || view === 'expired'
  // 只在流程出错、二维码过期，或二维码组件本身加载失败时提供刷新入口；
  // 接口还没返回时保持 loading，不要提前给按钮。
  const canRefresh = failed || framePhase === 'failed'
  return (
    <>
      <h2 className="login-panel-title" id="login-panel-heading">{t('login.wechatLoginTitle')}</h2>
      {session ? <WechatLoginFrame key={session.state} session={session} frameRef={frameRef} onPhaseChange={setFramePhase} /> : (
        <div className="wechat-login-placeholder" role="status">
          {!failed ? <span className="get-code-spinner" aria-hidden="true" /> : null}
          <span>{t(view === 'expired' ? 'login.wechatExpiredTitle' : failed ? 'login.qrFailed' : view === 'completing' ? 'login.wechatCompleting' : 'login.qrLoading')}</span>
        </div>
      )}
      {error ? <p className={`wechat-status wechat-login-feedback${failed ? ' is-error' : ''}`} role="status" aria-live="polite">{error}</p> : null}
      {/* 始终占位：不需要刷新时隐藏但保留高度，避免显示/隐藏时把下面的按钮顶得上下跑。 */}
      <button
        className={`btn btn-primary submit-btn login-capsule-action login-capsule-soft${canRefresh ? '' : ' is-slot-hidden'}`}
        type="button"
        onClick={onRetry}
      >
        <span>{t('login.refreshQr')}</span>
      </button>
      <button className="btn login-switch-btn" type="button" onClick={onBack}>{t('login.backToPhone')}</button>
    </>
  )
}
