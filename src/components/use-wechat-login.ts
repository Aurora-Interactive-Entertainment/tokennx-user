import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { exchangeWechatCode, requestWechatQr, type AuthUser, type WechatQrResult } from '@/api/auth'
import { parseWechatRedirectUri, readWechatCallback } from '@/auth/wechat-authorization'
import { isApiError } from '@/api/http'
import { clearAuthTokens } from '@/auth/token-storage'
import { authError, completeWechatLogin, invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'

export type WechatLoginView = 'idle' | 'loading' | 'pending' | 'completing' | 'binding' | 'expired' | 'error'

export function useWechatLogin(options: {
  enabled: boolean
  onSuccess: (user: AuthUser) => void
  onBinding: (ticket: string) => void
}) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const [attempt, setAttempt] = useState(0)
  const [view, setView] = useState<WechatLoginView>('idle')
  const [session, setSession] = useState<WechatQrResult | null>(null)
  const [error, setError] = useState('')
  const frameRef = useRef<HTMLIFrameElement>(null)
  // 顶层兜底窗口必须保留引用，回调页返回的消息要校验 event.source。
  const popupRef = useRef<Window | null>(null)
  const latest = useRef({ ...options, t })
  latest.current = { ...options, t }

  useEffect(() => {
    if (!options.enabled || !attempt) return
    let active = true
    let exchanging = false
    let qr: WechatQrResult | null = null
    let timer: number | undefined
    let expiryTimer: number | undefined
    const controller = new AbortController()
    popupRef.current = null
    const stop = () => {
      active = false
      qr = null
      window.clearTimeout(timer)
      window.clearTimeout(expiryTimer)
      window.removeEventListener('message', onMessage)
      controller.abort()
    }
    const fail = (message: string, next: 'expired' | 'error' = 'error') => {
      if (!active) return
      setSession(null)
      setView(next)
      setError(message)
      stop()
    }
    const expire = () => fail(latest.current.t('login.wechatExpired'), 'expired')

    async function exchange(code: string, current: WechatQrResult, failures = 0): Promise<void> {
      if (!active) return
      if (Date.now() >= current.expires_at) return expire()
      try {
        const result = await exchangeWechatCode(code, current.state, { signal: controller.signal })
        if (!active) return
        window.clearTimeout(expiryTimer)
        setError('')
        if (result?.status === 'pending_binding' || result?.binding_required) {
          if (!result.binding_ticket?.trim()) return fail(latest.current.t('login.missingBindingTicket'))
          // 后端明确表示未绑定的微信身份不构成本站登录；清掉旧令牌和 Redux 状态，避免误判为已登录。
          clearAuthTokens({ force: true })
          dispatch(invalidateAuth())
          setView('binding')
          latest.current.onBinding(result.binding_ticket)
          stop()
          return
        }
        if (result?.status !== 'succeeded' || result.binding_required) return fail(latest.current.t('login.emptyWechatResult'))
        const user = await dispatch(completeWechatLogin(result)).unwrap()
        if (!active) return
        latest.current.onSuccess(user)
        stop()
      } catch (cause) {
        if (!active) return
        if (isApiError(cause)) {
          if (cause.status === 404 || cause.code === 160007 || (cause.status === 409 && cause.code === 100006)) return expire()
          // 只有明确的 503 允许复用 state；网络超时和 500 的写入结果未知，不能重放授权码。
          if (cause.status === 503 && failures < 2) {
            setError(latest.current.t('login.wechatReconnecting'))
            timer = window.setTimeout(() => void exchange(code, current, failures + 1), 2000 * (failures + 1))
            return
          }
        }
        const message = isApiError(cause) ? authError(cause).message : latest.current.t('login.loginFailed')
        fail(message)
      }
    }

    function onMessage(event: MessageEvent) {
      if (!active || !qr || exchanging) return
      const callbackOrigin = parseWechatRedirectUri(qr.redirect_uri)?.origin
      const frameCode = readWechatCallback(event, frameRef.current?.contentWindow, qr.state, callbackOrigin)
      const popupCode = readWechatCallback(event, popupRef.current, qr.state, callbackOrigin)
      const code = frameCode ?? popupCode
      if (!code) return
      // 在发请求前同步锁定本次二维码，重复消息和 StrictMode 都不能并发兑换。
      exchanging = true
      // 回调已到达，停止二维码过期计时；否则兑换过程中定时器触发会把这次请求中断成“已过期”。
      window.clearTimeout(expiryTimer)
      setSession(null)
      setView('completing')
      void exchange(code, qr)
    }

    setView('loading')
    setSession(null)
    setError('')
    window.addEventListener('message', onMessage)
    // 延迟启动，StrictMode 清理检查和关闭弹窗时不会创建多余的 state。
    timer = window.setTimeout(() => {
      void requestWechatQr({ signal: controller.signal }).then(result => {
        if (!active) return
        qr = result
        if (qr.expires_at <= Date.now()) return expire()
        setSession(qr)
        setView('pending')
        expiryTimer = window.setTimeout(expire, Math.min(qr.expires_at - Date.now(), 2_147_483_647))
      }).catch(cause => {
        if (active) fail(isApiError(cause) ? cause.message : authError(cause).message)
      })
    }, 0)
    return stop
  }, [attempt, dispatch, options.enabled])

  function openInNewWindow(url: string): void {
    try {
      // 不传 noopener/noreferrer，回调页需要通过 window.opener 把授权码发回登录页。
      const popup = window.open(url, '_blank')
      popupRef.current = popup
      // 被浏览器拦截时 window.open 返回 null 而不抛错，必须显式提示，否则用户点了没有任何反应。
      if (!popup) setError(latest.current.t('login.popupBlocked'))
    } catch {
      popupRef.current = null
      setError(latest.current.t('login.popupBlocked'))
    }
  }

  return { view, session, error, frameRef, openInNewWindow, start: () => setAttempt(value => value + 1) }
}
