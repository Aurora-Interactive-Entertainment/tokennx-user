import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WECHAT_CALLBACK_MESSAGE, parseWechatCallbackSearch, wechatCallbackTargetOrigins } from '@/auth/wechat-authorization'
import './wechat-callback.css'

type CallbackState = 'processing' | 'sent' | 'invalid' | 'standalone'

/** 微信开放平台回调页：只把 code/state 传回发起二维码的同源登录页，不在这里兑换令牌。 */
export function WechatCallbackPage() {
  const { t } = useTranslation()
  const [state, setState] = useState<CallbackState>('processing')

  useEffect(() => {
    const payload = parseWechatCallbackSearch(window.location.search)
    // 先清理地址栏，避免用户刷新时重复提交一次性授权码。
    const cleanUrl = `${window.location.pathname}${window.location.hash}`
    window.history.replaceState(null, document.title, cleanUrl)
    if (!payload) {
      setState('invalid')
      return
    }
    const message = { type: WECHAT_CALLBACK_MESSAGE, ...payload }
    const targets = wechatCallbackTargetOrigins(document.referrer)
    if (targets.length === 0) {
      setState('invalid')
      return
    }
    if (window.opener && !window.opener.closed) {
      // 顶层兜底窗口没有 parent iframe，通过 opener 把一次性授权码交回登录页。
      for (const origin of targets) window.opener.postMessage(message, origin)
      setState('sent')
      return
    }
    if (window.parent === window) {
      setState('standalone')
      return
    }
    // 仅目标 origin 匹配的窗口能收到消息，保留同源、正式别名和显式回环联调流程。
    for (const origin of targets) window.parent.postMessage(message, origin)
    setState('sent')
  }, [])

  return (
    <main className="wechat-callback-page" role="status" aria-live="polite">
      <p>
        {state === 'processing' ? t('login.wechatCompleting') : null}
        {state === 'sent' ? t('login.wechatCallbackSent') : null}
        {state === 'invalid' ? t('login.wechatCallbackInvalid') : null}
        {state === 'standalone' ? t('login.wechatCallbackStandalone') : null}
      </p>
      {state !== 'processing' && <a href="/login">{t('login.backToPhone')}</a>}
    </main>
  )
}
