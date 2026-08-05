import { fetchJson } from './http'
import type { ApiTimeValue } from '@/utils/format'

// 中文：认证接口统一使用 Unix 毫秒时间戳表示访问令牌和刷新令牌的过期时间。
export type AuthTimestamp = number

// 中文：只接受安全整数时间戳，避免非法数值进入令牌续期流程。
export function isAuthTimestamp(value: unknown): value is AuthTimestamp {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
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
}

export interface VerificationCodeResult {
  destination_masked: string
  expires_at: ApiTimeValue
  retry_after_seconds: number
}

export type EmailCodeResult = VerificationCodeResult
export type PhoneCodeResult = VerificationCodeResult

export interface AuthResult {
  status: 'succeeded' | 'pending_binding'
  binding_required: boolean
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
  expires_at: ApiTimeValue
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

export function sendPhoneCode(destination: string, locale = 'zh-CN'): Promise<PhoneCodeResult> {
  return fetchJson<PhoneCodeResult>('/api/auth/phone/code', {
    method: 'POST',
    body: { destination, locale },
  })
}

export function loginByPhone(destination: string, code: string, device: DeviceInfo, locale = 'zh-CN'): Promise<AuthResult> {
  return fetchJson<AuthResult>('/api/auth/phone/login', {
    method: 'POST',
    body: { destination, code, locale, ...device },
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

export function bindWechatPhone(bindingTicket: string, phone: string, code: string, device: DeviceInfo, locale = 'zh-CN'): Promise<AuthResult> {
  return fetchJson<AuthResult>('/api/auth/bind-phone', {
    method: 'POST',
    body: { binding_ticket: bindingTicket, phone, code, locale, ...device },
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
