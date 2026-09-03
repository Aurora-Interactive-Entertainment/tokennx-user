import { fetchAuthenticatedJson } from './authenticated'
import { ApiError, isApiError } from './http'
import type { ApiTimestamp } from '@/utils/format'
import i18n from '@/i18n'

const PROFILE_PATH = '/api/user/profile'

export const PROFILE_DISPLAY_NAME_MAX_LENGTH = 20
export const PROFILE_PHONE_LENGTH = 11
export const PROFILE_PHONE_COUNTRY_CODE = '+86'
export const PROFILE_EMAIL_MAX_LENGTH = 254
export const PROFILE_VERIFICATION_CODE_LENGTH = 6
export const PROFILE_DEFAULT_RETRY_SECONDS = 60

export const PROFILE_NOTIFICATION_CODES = [
  'onboarding',
  'security_alerts',
  'billing_updates',
  'low_balance',
  'usage_alerts',
  'workflow_results',
  'invitations',
  'service_updates',
  'product_updates',
] as const

export type ContactProvider = 'phone' | 'email'
export type ContactPurpose = 'current' | 'new'
export type NotificationPreferenceCode = typeof PROFILE_NOTIFICATION_CODES[number]

export interface ProfileContact {
  bound: boolean
  masked_identifier: string
}

export interface UserProfile {
  id: string
  display_name: string
  avatar_url: string
  locale: string
  timezone: string
  status: string
  version: number
  phone: ProfileContact
  email: ProfileContact
}

export interface ProfileContactCodeRequest {
  provider_code: ContactProvider
  purpose: ContactPurpose
  destination: string
  country_code?: string
}

export type ProfileContactCodeResult = unknown[]

export interface UpdateProfileContactRequest {
  current_destination?: string
  current_code?: string
  new_destination: string
  new_code: string
}

export interface EnterpriseMembership {
  id: string
  enterprise_id: string
  enterprise_name: string
  enterprise_code: string
  member_status: 'active' | 'suspended' | string
  join_source: string
  roles: string[]
  owner: boolean
  joined_at: ApiTimestamp
  exited_at?: ApiTimestamp | null
  version: number
}

export interface NotificationPreference {
  code: NotificationPreferenceCode | string
  enabled: boolean
  email_enabled?: boolean
  sms_enabled?: boolean
  default_enabled: boolean
  default_email_enabled?: boolean
  default_sms_enabled?: boolean
  email_supported?: boolean
  sms_supported?: boolean
  mandatory?: boolean
  threshold_supported?: boolean
  threshold_amount_nano?: number
  version: number
}

export interface AccountDeletionPrecheck {
  can_request: boolean
  existing_status?: 'cooling' | 'processing' | string
  cooling_until?: ApiTimestamp
  owner_enterprises: string[]
  member_count: number
  balance_policy: string
}

export interface AccountDeletionRequest {
  confirm: true
  provider_code: ContactProvider
  destination: string
  code: string
}

export interface AccountDeletionResponse {
  id: string
  status: 'cooling' | string
  requested_at: ApiTimestamp
  cooling_until: ApiTimestamp
}

export interface NotificationPreferences {
  items: NotificationPreference[]
}

export type NotificationPreferenceThresholds = Partial<Record<NotificationPreferenceCode, number>>

const PHONE_PATTERN = /^1[3-9][0-9]{9}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function limitDisplayNameLength(value: string): string {
  return Array.from(value).slice(0, PROFILE_DISPLAY_NAME_MAX_LENGTH).join('')
}

export function isValidDisplayName(value: string): boolean {
  const displayName = value.trim()
  return displayName.length > 0 && Array.from(displayName).length <= PROFILE_DISPLAY_NAME_MAX_LENGTH
}

export function isValidContactDestination(provider: ContactProvider, value: string): boolean {
  const destination = value.trim()
  if (provider === 'phone') return destination.length === PROFILE_PHONE_LENGTH && PHONE_PATTERN.test(destination)
  return destination.length <= PROFILE_EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(destination)
}

export function isValidVerificationCode(value: string): boolean {
  return new RegExp(`^[0-9]{${PROFILE_VERIFICATION_CODE_LENGTH}}$`).test(value.trim())
}

export function isNotificationPreferenceCode(value: string): value is NotificationPreferenceCode {
  return (PROFILE_NOTIFICATION_CODES as readonly string[]).includes(value)
}

export function getProfileErrorMessage(error: unknown): string {
	if (!isApiError(error)) return i18n.t('api.profile.requestFailed')
	const messageKeys: Record<number, string> = {
		100001: 'api.profile.invalidInput',
		100004: 'api.profile.missing',
		100006: 'api.profile.stateChanged',
		100007: 'api.profile.authUnavailable',
		110001: 'api.profile.sessionExpired',
		110003: 'api.profile.contactAlreadyBound',
		110004: 'api.profile.codeTooFrequent',
		110005: 'api.profile.contactUnbound',
		110006: 'api.profile.contactVerificationFailed',
		110030: 'api.profile.accountDeletionConflict',
		110031: 'api.profile.accountDeletionEnterpriseBlocked',
		110032: 'api.profile.accountDeletionUnavailable',
		100008: 'api.profile.contactUnchanged',
	}
	return messageKeys[error.code] ? i18n.t(messageKeys[error.code]) : error.message
}

export function getUserProfile(accessToken: string): Promise<UserProfile> {
  return fetchAuthenticatedJson<UserProfile>(PROFILE_PATH, { accessToken })
}

export function updateProfileNickname(accessToken: string, displayName: string): Promise<UserProfile> {
  const normalizedName = displayName.trim()
  if (!isValidDisplayName(normalizedName)) {
    return Promise.reject(new ApiError(i18n.t('api.profile.invalidNickname'), 400, 100001, null))
  }
  return fetchAuthenticatedJson<UserProfile>(`${PROFILE_PATH}/nickname`, {
    method: 'PUT',
    body: { display_name: normalizedName },
    accessToken,
  })
}

export function sendProfileContactCode(accessToken: string, request: ProfileContactCodeRequest): Promise<ProfileContactCodeResult> {
  return fetchAuthenticatedJson<ProfileContactCodeResult>(`${PROFILE_PATH}/contact/code`, {
    method: 'POST',
    body: request,
    accessToken,
  })
}

export function updateProfileContact(accessToken: string, provider: ContactProvider, request: UpdateProfileContactRequest): Promise<UserProfile> {
  return fetchAuthenticatedJson<UserProfile>(`${PROFILE_PATH}/${provider}`, {
    method: 'PUT',
    body: request,
    accessToken,
  })
}

export function getProfileEnterprises(accessToken: string): Promise<EnterpriseMembership[]> {
  return fetchAuthenticatedJson<EnterpriseMembership[]>(`${PROFILE_PATH}/enterprises`, { accessToken })
}

// 中文：注销前置检查只读取状态，不会冻结账号或创建注销申请。
export function getAccountDeletionPrecheck(accessToken: string): Promise<AccountDeletionPrecheck> {
  return fetchAuthenticatedJson<AccountDeletionPrecheck>('/api/user/account-deletion/precheck', { accessToken })
}

// 中文：提交注销申请后服务端会冻结账号并撤销会话，成功响应返回后前端再清理本地令牌。
export function requestAccountDeletion(accessToken: string, request: AccountDeletionRequest): Promise<AccountDeletionResponse> {
  return fetchAuthenticatedJson<AccountDeletionResponse>('/api/user/account-deletion', { method: 'POST', body: request, accessToken })
}

export function getNotificationPreferences(accessToken: string): Promise<NotificationPreferences> {
  return fetchAuthenticatedJson<NotificationPreferences>(`${PROFILE_PATH}/notification-preferences`, { accessToken })
}

export function updateNotificationPreferences(accessToken: string, values: Partial<Record<NotificationPreferenceCode, boolean>>, thresholds?: NotificationPreferenceThresholds): Promise<NotificationPreferences> {
  return fetchAuthenticatedJson<NotificationPreferences>(`${PROFILE_PATH}/notification-preferences`, {
    method: 'PUT',
    body: thresholds ? { values, thresholds } : { values },
    accessToken,
  })
}
