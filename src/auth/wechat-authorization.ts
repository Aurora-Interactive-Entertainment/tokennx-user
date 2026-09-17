import type { WechatQrResult } from '@/api/auth'

/** 微信身份识别和快捷授权由官方页面完成，官网只传递公开展示参数。 */
export const WECHAT_AUTHORIZATION_ORIGIN = 'https://open.weixin.qq.com'
export const WECHAT_CALLBACK_MESSAGE = 'token-nx:wechat-callback'
export const WECHAT_CALLBACK_PATH = '/weixin/callback'
export const WECHAT_FORMAL_CALLBACK_ORIGIN = 'https://tokennx.cn'

/** 只向明确受信任的站点发送授权码；微信跳转丢失 referrer 时逐一限定目标 origin。 */
export function wechatCallbackTargetOrigins(referrer: string, currentOrigin = window.location.origin): string[] {
  const trusted = new Set([currentOrigin, WECHAT_FORMAL_CALLBACK_ORIGIN, 'https://www.tokennx.cn'])
  try {
    const configured = import.meta.env.VITE_PUBLIC_SITE_ORIGIN?.trim()
    if (configured) {
      const url = new URL(configured)
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) trusted.add(url.origin)
    }
  } catch {
    // 错误站点配置不能扩大回调消息的发送范围。
  }
  if (!referrer) return [...trusted]
  try {
    const source = new URL(referrer)
    if (source.username || source.password || !['http:', 'https:'].includes(source.protocol)) return []
    if (source.origin === WECHAT_AUTHORIZATION_ORIGIN) return [...trusted]
    if (trusted.has(source.origin)) return [source.origin]
    // 正式回调地址也用于本地联调，仅允许浏览器回环地址的精确 origin，不能泛化为任意开发域名。
    if (['localhost', '127.0.0.1', '[::1]'].includes(source.hostname)) return [source.origin]
  } catch {
    // 无法解析的来源不具备接收一次性授权码的资格。
  }
  return []
}

export interface WechatCallbackPayload {
  code: string
  state: string
}

/** 读取并校验微信回调查询参数；授权码只在内存中短暂传递给登录页。 */
export function parseWechatCallbackSearch(search: string): WechatCallbackPayload | null {
  const params = new URLSearchParams(search)
  const code = params.get('code')?.trim() ?? ''
  const state = params.get('state')?.trim() ?? ''
  if (!code || code.length > 512 || !state || state.length > 256 || !/^[A-Za-z0-9_-]+$/.test(state)) return null
  return { code, state }
}

export function parseWechatRedirectUri(value: string): URL | null {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash ||
      url.searchParams.has('code') || url.searchParams.has('state')) return null
    return url
  } catch {
    return null
  }
}

export function wechatFrameUrl(session: WechatQrResult, theme: 'light' | 'dark', language: string): string {
  const url = new URL('/connect/qrconnect', WECHAT_AUTHORIZATION_ORIGIN)
  // URLSearchParams 只编码一次，必须原样使用后端提供的回调地址和 state。
  url.searchParams.set('appid', session.app_id)
  url.searchParams.set('scope', session.scope)
  url.searchParams.set('redirect_uri', session.redirect_uri)
  url.searchParams.set('state', session.state)
  // 与微信官方 WxLogin 组件保持一致，让授权页按内嵌 JS SDK 模式初始化。
  url.searchParams.set('login_type', 'jssdk')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('self_redirect', 'true')
  url.searchParams.set('stylelite', '1')
  url.searchParams.set('fast_login', '1')
  url.searchParams.set('color_scheme', theme)
  url.searchParams.set('lang', language.startsWith('en') ? 'en' : 'zh_CN')
  // 官方组件会为每次授权附加时间戳，避免浏览器复用旧的本机微信探测页面。
  url.searchParams.set('ts', Date.now().toString())
  url.hash = 'wechat_redirect'
  return url.toString()
}

export function readWechatCallback(event: MessageEvent, frame: Window | null | undefined, state: string, callbackOrigin = window.location.origin): string | null {
  // 同时校验同源、实际 iframe 窗口和当前 state，其他窗口不能注入授权码。
  if (!frame || event.origin !== callbackOrigin || event.source !== frame) return null
  const data: unknown = event.data
  if (!data || typeof data !== 'object') return null
  const message = data as Record<string, unknown>
  if (message.type !== WECHAT_CALLBACK_MESSAGE || message.state !== state ||
    typeof message.code !== 'string' || !message.code.trim() || message.code.length > 512) return null
  return message.code
}
