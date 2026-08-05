import { fetchAuthenticatedJson } from './authenticated'
import { ApiError, isApiError } from './http'
import type { ApiTimeValue } from '@/utils/format'
import i18n from '@/i18n'

const API_KEY_PATH = '/api/user/api-keys'

export const API_KEY_NAME_MAX_LENGTH = 32
export const API_KEY_TAG_MAX_LENGTH = 32
export const API_KEY_TAG_TEXT_MAX_LENGTH = 120
export const API_KEY_MAX_TAG_COUNT = 16

export type ApiKeyStatus = 'active' | 'disabled' | 'expired'
export type ApiKeyScope = 'all' | 'selected'
export type ApiKeyBillingSource = 'balance' | 'subscription'
export type ApiKeyStatusFilter = 'all' | 'active' | 'disabled'

export type UserApiKeyContext =
  | { account_type: 'personal' }
  | { account_type: 'enterprise'; enterprise_id: string }

export interface ApiKeyModel {
  id: string
  alias: string
  name: string
  company: string
}

export interface ApiKeyLimits {
  enabled: boolean
  cost_limit_yuan: string | null
  used_amount_yuan: string
  rpm: number | null
  tpm: number | null
  concurrency: number | null
}

export interface ApiKeyCreator {
  id: string
  display_name: string
  masked_phone: string
}

export interface UserApiKey {
  id: string
  name: string
  masked_key: string
  secret: string
  status: ApiKeyStatus
  scope: ApiKeyScope
  model_ids: string[] | null
  models: ApiKeyModel[]
  tags: string[]
  billing_source: ApiKeyBillingSource
  limits: ApiKeyLimits
  creator: ApiKeyCreator
  created_at: ApiTimeValue
  expires_at: ApiTimeValue | null
  last_used_at: ApiTimeValue | null
}

export interface UserApiKeyList {
  items: UserApiKey[]
  available_models: ApiKeyModel[]
}

export interface UserApiKeyMutation {
  name: string
  tags: string[]
  expires_at: string | null
  scope: ApiKeyScope
  model_ids: string[]
  billing_source: ApiKeyBillingSource
  limits_enabled: boolean
  cost_limit_yuan: string | null
  rpm: number | null
  tpm: number | null
  concurrency: number | null
}

export interface CreatedUserApiKey {
  item: UserApiKey
  secret: string
}

export interface UserApiKeyActivity {
  id: string
  event_type: string
  actor_type: string
  occurred_at: ApiTimeValue
  snapshot: Record<string, unknown>
}

export interface UserApiKeyActivityList {
  items: UserApiKeyActivity[]
}

function contextQuery(context: UserApiKeyContext, values: Record<string, string | number | undefined> = {}): string {
  const params = new URLSearchParams({ account_type: context.account_type })
  if (context.account_type === 'enterprise') {
    const enterpriseID = context.enterprise_id.trim()
    if (!enterpriseID) throw new Error(i18n.t('api.apiKeys.contextMissing'))
    params.set('enterprise_id', enterpriseID)
  }
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, String(value))
  })
  return params.toString()
}

export function getUserApiKeys(context: UserApiKeyContext, filter: ApiKeyStatusFilter = 'all'): Promise<UserApiKeyList> {
  return fetchAuthenticatedJson<UserApiKeyList>(`${API_KEY_PATH}?${contextQuery(context, { status: filter })}`)
}

export function createUserApiKey(context: UserApiKeyContext, input: UserApiKeyMutation): Promise<CreatedUserApiKey> {
  return fetchAuthenticatedJson<CreatedUserApiKey>(`${API_KEY_PATH}?${contextQuery(context)}`, { method: 'POST', body: input })
}

export function updateUserApiKey(context: UserApiKeyContext, keyId: string, input: UserApiKeyMutation): Promise<UserApiKey> {
  return fetchAuthenticatedJson<UserApiKey>(`${API_KEY_PATH}/${encodeURIComponent(keyId)}?${contextQuery(context)}`, { method: 'PUT', body: input })
}

export function enableUserApiKey(context: UserApiKeyContext, keyId: string): Promise<UserApiKey> {
  return fetchAuthenticatedJson<UserApiKey>(`${API_KEY_PATH}/${encodeURIComponent(keyId)}/enable?${contextQuery(context)}`, { method: 'POST', body: {} })
}

export function disableUserApiKey(context: UserApiKeyContext, keyId: string): Promise<UserApiKey> {
  return fetchAuthenticatedJson<UserApiKey>(`${API_KEY_PATH}/${encodeURIComponent(keyId)}/disable?${contextQuery(context)}`, { method: 'POST', body: {} })
}

export function revokeUserApiKey(context: UserApiKeyContext, keyId: string): Promise<Record<string, never>> {
  return fetchAuthenticatedJson<Record<string, never>>(`${API_KEY_PATH}/${encodeURIComponent(keyId)}?${contextQuery(context)}`, { method: 'DELETE' })
}

export function getUserApiKeyActivity(context: UserApiKeyContext, keyId: string, limit = 20): Promise<UserApiKeyActivityList> {
  return fetchAuthenticatedJson<UserApiKeyActivityList>(`${API_KEY_PATH}/${encodeURIComponent(keyId)}/activity?${contextQuery(context, { limit })}`)
}

export function getUserApiKeyErrorMessage(error: unknown): string {
  if (!isApiError(error)) return i18n.t('api.apiKeys.requestFailed')
  const messageKeys: Record<number, string> = {
    100001: 'api.apiKeys.invalidInput',
    100004: 'api.apiKeys.missing',
    100006: 'api.apiKeys.stateChanged',
    100007: 'api.apiKeys.unavailable',
    100009: 'api.apiKeys.expired',
    110001: 'api.apiKeys.sessionExpired',
  }
  return messageKeys[error.code] ? i18n.t(messageKeys[error.code]) : error.message
}

export function isUserApiKeyValidationError(error: unknown): boolean {
  return isApiError(error) && error.code === 100001
}

export function createUserApiKeyInputError(message: string): ApiError {
  return new ApiError(message, 400, 100001, null)
}
