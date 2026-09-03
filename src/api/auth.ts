import { fetchJson } from './http'
import { isApiTimestamp, type ApiTimestamp } from '@/utils/format'

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
  /** 登录后的引导字段，后端上线后可直接控制首次绑定邮箱流程。 */
  first_login?: boolean
  needs_email_binding?: boolean
  bind_email_required?: boolean
  email_binding_required?: boolean
  is_new_user?: boolean
  /** 认证响应中的首次登录引导标记（服务端历史拼写 promt_required 会被归一化）。 */
  prompt_required?: boolean
}

export interface VerificationCodeResult {
  destination_masked: string
  expires_at: ApiTimestamp
  retry_after_seconds: number
}

export type EmailCodeResult = VerificationCodeResult
export type PhoneCodeResult = VerificationCodeResult

export interface AuthResult {
  status: 'succeeded' | 'pending_binding'
  binding_required: boolean
  /** 接口现有字段名，promt_required 少了一个 p。 */
  promt_required?: boolean
  prompt_required?: boolean
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

export interface DeviceInfo {
  device_id?: string
  device_name?: string
}

export function sendEmailCode(destination: string, locale = 'zh-CN'): Promise<EmailCodeResult> {
  return fetchJson<EmailCodeResult>('/api/auth/email/code', {
    method: 'POST',
    body: { destination, locale },
  })
}

export function loginByEmail(destination: string, code: string, device: DeviceInfo, locale = 'zh-CN'): Promise<AuthResult> {
  return fetchJson<AuthResult>('/api/auth/email/login', {
    method: 'POST',
    body: { destination, code, locale, ...device },
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

export function sendBindingPhoneCode(bindingTicket: string, phone: string, locale = 'zh-CN'): Promise<PhoneCodeResult> {
  return fetchJson<PhoneCodeResult>('/api/auth/bind-phone/code', {
    method: 'POST',
    body: { binding_ticket: bindingTicket, phone, locale },
  })
}

export function bindWechatPhone(bindingTicket: string, phone: string, code: string, _device?: DeviceInfo, _locale = 'zh-CN', inviteCode?: string): Promise<AuthResult> {
  const query = inviteCode?.trim() ? `?invite_code=${encodeURIComponent(inviteCode.trim())}` : ''
  return fetchJson<AuthResult>(`/api/auth/bind-phone${query}`, {
    method: 'POST',
    // 中文：设备信息和语言通过请求头由服务端推断，绑定接口请求体只保留业务字段。
    body: { binding_ticket: bindingTicket, phone, code },
  })
}

let refreshPromise: Promise<AuthResult> | null = null

export function refreshSession(refreshToken: string, device: DeviceInfo): Promise<AuthResult> {
  if (!refreshPromise) {
    refreshPromise = fetchJson<AuthResult>('/api/auth/refresh', {
      method: 'POST',
      body: { refresh_token: refreshToken, ...device },
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
