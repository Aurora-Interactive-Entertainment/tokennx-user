import { fetchJson } from './http'
import { isApiTimestamp, type ApiTimeValue, type ApiTimestamp } from '@/utils/format'

// 中文：认证接口统一使用 Unix 毫秒时间戳表示访问令牌和刷新令牌的过期时间。
export type AuthTimestamp = number

// 中文：只接受安全整数时间戳，避免非法数值进入令牌续期流程。
export function isAuthTimestamp(value: unknown): value is AuthTimestamp {
  return isApiTimestamp(value)
}

export interface AuthUser {
  id: string
  display_name: string
  avatar_url: string
  locale: string
  timezone: string
  status: 'active' | string
  phone_masked?: string
  email_masked?: string
  /** 认证响应中的首次登录标记；服务端字段名固定为 promt_required。 */
  promt_required?: boolean
}

export interface VerificationCodeResult {
  // 中文：新验证码接口成功体固定为空对象；这些字段仅用于兼容灰度期间的旧后端。
  destination_masked?: string
  expires_at?: ApiTimeValue
  retry_after_seconds?: number
}

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
  state: string
  authorize_url: string
  expires_at: ApiTimestamp
}

export interface WechatStatusResult {
  status: 'pending' | 'ready'
  result?: AuthResult
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
    // 中文：设备信息和语言由请求头推断，邀请码只允许放在查询参数中。
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

export function requestWechatQr(): Promise<WechatQrResult> {
  return fetchJson<WechatQrResult>('/api/auth/wechat/qr')
}

export function getWechatStatus(state: string): Promise<WechatStatusResult> {
  return fetchJson<WechatStatusResult>(`/api/auth/wechat/status?state=${encodeURIComponent(state)}`)
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
    // 中文：设备信息和语言通过请求头由服务端推断，绑定接口请求体只保留业务字段。
    body: { binding_ticket: bindingTicket, phone, code },
  })
}

let refreshPromise: Promise<AuthResult> | null = null

export function refreshSession(refreshToken: string): Promise<AuthResult> {
  if (!refreshPromise) {
    refreshPromise = fetchJson<AuthResult>('/api/auth/refresh', {
      method: 'POST',
      // 中文：刷新接口只接收刷新令牌，设备信息由服务端从浏览器请求头生成。
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
