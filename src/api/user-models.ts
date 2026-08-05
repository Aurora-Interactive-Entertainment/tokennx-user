import { fetchAuthenticatedJson } from './authenticated'
import { ApiError, isApiError } from './http'
import i18n from '@/i18n'

export const USER_MODELS_PATH = '/api/user/models'

export type UserModelAccountType = 'personal' | 'enterprise'

export interface UserModelsQuery {
  account_type: UserModelAccountType
  enterprise_id?: string
}

export interface UserModelPrice {
  meter_code: string
  meter_kind: string
  unit: string
  currency: string
  unit_quantity: number
  unit_price_yuan: string
  tier_no: number
  selector_meter_code?: string
}

export interface UserModelItem {
  id: string
  code?: string
  alias?: string
  name: string
  company: string
  modality: string
  billing_mode: string
  context_window_tokens?: number
  description: string
  capabilities: string[] | null
  provider_count: number
  total_tokens?: string | number
  prices: UserModelPrice[] | null
}

export interface UserModelList {
  items: UserModelItem[]
}

function buildUserModelsPath(query: UserModelsQuery): string {
  const params = new URLSearchParams({ account_type: query.account_type })
  if (query.account_type === 'enterprise' && query.enterprise_id?.trim()) {
    params.set('enterprise_id', query.enterprise_id.trim())
  }
  return `${USER_MODELS_PATH}?${params.toString()}`
}

function isUserModelList(value: unknown): value is UserModelList {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<UserModelList>
  return Array.isArray(candidate.items)
}

export function getUserModels(query: UserModelsQuery): Promise<UserModelList> {
  return fetchAuthenticatedJson<unknown>(buildUserModelsPath(query)).then((value) => {
    if (!isUserModelList(value)) throw new ApiError(i18n.t('api.models.invalidResponse'), 502, 100002, null)
    return value
  })
}

export function getUserModelsErrorMessage(error: unknown): string {
  if (!isApiError(error)) return i18n.t('api.models.loadFailed')
  const messageKeys: Record<number, string> = {
    100001: 'api.models.invalidQuery',
    100002: 'api.models.invalidResponse',
    100007: 'api.models.unavailable',
    110001: 'api.models.sessionExpired',
    120003: 'api.models.forbidden',
  }
  return messageKeys[error.code] ? i18n.t(messageKeys[error.code]) : error.message
}
