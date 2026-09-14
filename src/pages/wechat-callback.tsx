import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WECHAT_AUTHORIZATION_ORIGIN, WECHAT_CALLBACK_MESSAGE, parseWechatCallbackSearch } from '@/auth/wechat-authorization'
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
    if (window.opener && !window.opener.closed) {
      // 顶层兜底窗口没有 parent iframe，通过 opener 把一次性授权码交回登录页。
      let openerOrigin = '*'
      try {
        if (document.referrer) {
          const referrerOrigin = new URL(document.referrer).origin
          if (referrerOrigin !== WECHAT_AUTHORIZATION_ORIGIN) openerOrigin = referrerOrigin
        }
      } catch {
        // 登录页仍会校验 origin、state 和 source，无法读取 referrer 时使用通配目标不放宽接收校验。
      }
      window.opener.postMessage(message, openerOrigin)
      setState('sent')
      return
    }
    if (window.parent === window) {
      setState('standalone')
      return
    }
    // 跨域本地联调时，回调页通过 referrer 得到发起二维码页面的精确 origin；生产同源时仍使用当前 origin。
    let parentOrigin = '*'
    try {
      if (document.referrer) {
        const referrerOrigin = new URL(document.referrer).origin
        // 微信内部跳转的 referrer 可能仍是 open.weixin.qq.com，不能把消息发回微信页面。
        if (referrerOrigin !== WECHAT_AUTHORIZATION_ORIGIN) parentOrigin = referrerOrigin
      }
    } catch {
      // 无法读取 referrer 时仍允许一次性回调消息发送，登录页会继续校验 event.origin/source/state。
    }
    window.parent.postMessage(message, parentOrigin)
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
