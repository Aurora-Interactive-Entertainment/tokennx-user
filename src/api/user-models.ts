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
  purpose?: string
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

export interface UserModelTag {
  label: string
  color?: string
}

export interface UserModelSpecifications {
  max_output_tokens?: number
  input_modalities: string[]
  output_modalities: string[]
  recommended_protocol?: { code: string; name: string } | null
  capability_limits: Record<string, Record<string, unknown>>
}

export interface UserModelMetricPoint {
  timestamp: number
  value: number | null
}

export interface UserModelActivity {
  unit: string
  points: UserModelMetricPoint[]
}

export interface UserModelMetricSeries extends UserModelActivity {
  statistic: string
}

export interface UserModelMetrics {
  window?: { start_at: number; end_at: number; granularity: string; timezone: string }
  activity: UserModelActivity
  throughput: UserModelMetricSeries
  first_token_latency: UserModelMetricSeries
  availability: { rate: number; success_requests: number; valid_requests: number }
  cumulative_usage: { value: string; unit: string }
}

export interface UserModelDetail {
  model: UserModelItem
  tags: UserModelTag[] | null
  specifications: UserModelSpecifications
  metrics: UserModelMetrics
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

function buildUserModelDetailPath(model: string, query: UserModelsQuery): string {
  const params = new URLSearchParams({ account_type: query.account_type })
  if (query.account_type === 'enterprise' && query.enterprise_id?.trim()) {
    params.set('enterprise_id', query.enterprise_id.trim())
  }
  return `${USER_MODELS_PATH}/${encodeURIComponent(model.trim())}?${params.toString()}`
}

function isUserModelDetail(value: unknown): value is UserModelDetail {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<UserModelDetail>
  return Boolean(candidate.model && typeof candidate.model === 'object' && candidate.specifications && candidate.metrics)
}

export function getUserModelDetail(model: string, query: UserModelsQuery): Promise<UserModelDetail> {
  return fetchAuthenticatedJson<unknown>(buildUserModelDetailPath(model, query)).then((value) => {
    if (!isUserModelDetail(value)) throw new ApiError(i18n.t('api.models.invalidResponse'), 502, 100002, null)
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
