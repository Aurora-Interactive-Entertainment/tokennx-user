import { ApiError, fetchJson } from './http'
import { isApiTimestamp, type ApiTimestamp } from '@/utils/format'
import { WECHAT_CALLBACK_PATH, WECHAT_FORMAL_CALLBACK_ORIGIN, parseWechatRedirectUri } from '@/auth/wechat-authorization'
import i18n from '@/i18n'

// 认证接口统一使用 Unix 毫秒时间戳表示访问令牌和刷新令牌的过期时间。
export type AuthTimestamp = number

// 只接受安全整数时间戳，避免非法数值进入令牌续期流程。
export function isAuthTimestamp(value: unknown): value is AuthTimestamp {
  return isApiTimestamp(value)
}

export interface AuthUser {
  id: string
  display_name: string
  avatar_url: string
  locale?: string
  timezone?: string
  status?: 'active' | string
  phone_masked?: string
  email_masked?: string
  /** 认证响应中的首次登录标记；服务端字段名固定为 promt_required。 */
  promt_required?: boolean
}

// 发码成功固定返回空对象，脱敏展示和 60 秒冷却由前端维护。
export type VerificationCodeResult = Record<string, never>

export type EmailCodeResult = VerificationCodeResult
export type PhoneCodeResult = VerificationCodeResult

export interface AuthResult {
  status: 'succeeded' | 'pending_binding'
  binding_required: boolean
  /** 用户本次是否为首次登录；服务端字段名固定为 promt_required。 */
  promt_required?: boolean
  binding_ticket?: string
  access_token?: string
  refresh_token?: string
  access_expires_at?: AuthTimestamp
  refresh_expires_at?: AuthTimestamp
  user?: AuthUser
}

export interface WechatQrResult {
  app_id: string
  scope: 'snsapi_login'
  redirect_uri: string
  state: string
  expires_at: ApiTimestamp
}

export function sendEmailCode(destination: string): Promise<EmailCodeResult> {
  return fetchJson<EmailCodeResult>('/api/auth/email/code', {
    method: 'POST',
    body: { destination },
  })
}

export function loginByEmail(destination: string, code: string, inviteCode?: string): Promise<AuthResult> {
  const query = inviteCode?.trim() ? `?invite_code=${encodeURIComponent(inviteCode.trim())}` : ''
  return fetchJson<AuthResult>(`/api/auth/email/login${query}`, {
    method: 'POST',
    // 设备信息和语言由请求头推断，邀请码只允许放在查询参数中。
    body: { destination, code },
  })
}

export function sendPhoneCode(destination: string, countryCode = '+86'): Promise<PhoneCodeResult> {
  return fetchJson<PhoneCodeResult>('/api/auth/phone/code', {
    method: 'POST',
    body: { destination, country_code: countryCode },
  })
}

export function loginByPhone(destination: string, code: string, inviteCode?: string): Promise<AuthResult> {
  const query = inviteCode?.trim() ? `?invite_code=${encodeURIComponent(inviteCode.trim())}` : ''
  return fetchJson<AuthResult>(`/api/auth/phone/login${query}`, {
    method: 'POST',
    body: { destination, code },
  })
}

export async function requestWechatQr(options: { signal?: AbortSignal } = {}): Promise<WechatQrResult> {
  const result = await fetchJson<WechatQrResult>('/api/auth/wechat/qr', { ...options, cache: 'no-store' })
  if (!result || typeof result.state !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(result.state) ||
    typeof result.app_id !== 'string' || !result.app_id.trim() || result.app_id.length > 128 ||
    result.scope !== 'snsapi_login' || typeof result.redirect_uri !== 'string' || !isApiTimestamp(result.expires_at)) {
    throw new ApiError(i18n.t('login.wechatInvalidResponse'), 502, 0, null)
  }
  const redirect = parseWechatRedirectUri(result.redirect_uri)
  // 回调由前端页面接收；不能把后端配置改写成 localhost 或其他来源。
  const isSameOrigin = redirect?.origin === window.location.origin
  // 本地联调时正式后端只能返回正式回调域名；回调页会根据 referrer 将消息发回 localhost。
  const isLocalFormalCallback = import.meta.env.DEV && redirect?.origin === WECHAT_FORMAL_CALLBACK_ORIGIN && redirect.pathname === WECHAT_CALLBACK_PATH
  if (!redirect || (!isSameOrigin && !isLocalFormalCallback)) {
    throw new ApiError(i18n.t('login.wechatRedirectMismatch'), 502, 0, null)
  }
  return result
}

export function exchangeWechatCode(code: string, state: string, options: { signal?: AbortSignal } = {}): Promise<AuthResult> {
  return fetchJson<AuthResult>('/api/auth/wechat/exchange', {
    ...options, method: 'POST', cache: 'no-store', body: { code, state },
  })
}

export function sendBindingPhoneCode(bindingTicket: string, phone: string, countryCode = '+86'): Promise<PhoneCodeResult> {
  return fetchJson<PhoneCodeResult>('/api/auth/bind-phone/code', {
    method: 'POST',
    body: { binding_ticket: bindingTicket, phone, country_code: countryCode },
  })
}

export function bindWechatPhone(bindingTicket: string, phone: string, code: string, inviteCode?: string): Promise<AuthResult> {
  const query = inviteCode?.trim() ? `?invite_code=${encodeURIComponent(inviteCode.trim())}` : ''
  return fetchJson<AuthResult>(`/api/auth/bind-phone${query}`, {
    method: 'POST',
    // 设备信息和语言通过请求头由服务端推断，绑定接口请求体只保留业务字段。
    body: { binding_ticket: bindingTicket, phone, code },
  })
}

let refreshPromise: Promise<AuthResult> | null = null

export function refreshSession(refreshToken: string): Promise<AuthResult> {
  if (!refreshPromise) {
    refreshPromise = fetchJson<AuthResult>('/api/auth/refresh', {
      method: 'POST',
      // 刷新接口只接收刷新令牌，设备信息由服务端从浏览器请求头生成。
      body: { refresh_token: refreshToken },
    }).finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

export function getCurrentUser(accessToken: string): Promise<AuthUser> {
  return fetchJson<AuthUser>('/api/auth/me', { accessToken })
}

export function logout(accessToken: string): Promise<Record<string, never>> {
  return fetchJson<Record<string, never>>('/api/auth/logout', {
    method: 'POST',
    body: {},
    accessToken,
  })
}
