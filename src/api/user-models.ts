import { fetchAuthenticatedJson } from './authenticated'
import { ApiError, isApiError } from './http'
import i18n from '@/i18n'

export const USER_MODELS_PATH = '/api/user/models'

export type UserModelAccountType = 'personal' | 'enterprise'
export type UserModelModality = 'text' | 'embedding' | 'rerank' | 'image' | 'audio' | 'video' | 'multimodal'

export interface UserModelsQuery {
  account_type: UserModelAccountType
  enterprise_id?: string
  activity_id?: string
  model_type?: UserModelModality
  page?: number
  page_size?: number
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
  max_tokens?: number
  icon_url?: string
  description: string
  capabilities: string[] | null
  tags?: UserModelTag[]
  activities?: UserModelActivity[]
  activity_ids?: string[]
  provider_count: number
  total_tokens?: string | number
  prices: UserModelPrice[] | null
  availability?: {
    rate?: number
    sample_count?: number
    success_count?: number
    window_hours?: number
    hourly?: Array<{
      hour_start: number
      rate: number
      sample_count?: number
      success_count?: number
    }>
  }
}

export interface UserModelList {
  items: UserModelItem[]
  activities: UserModelActivitySummary[]
  total?: number
  page?: number
  page_size?: number
}

export interface UserModelTag {
  label: string
  color?: string
}

export interface UserModelActivitySummary {
  id: string
  name: string
  model_count: number
  sort_order: number
}

export interface UserModelActivity {
  id: string
  name: string
  description?: string
  status: 'active' | string
  starts_at?: string
  ends_at?: string
  sort_order: number
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

export interface UserModelMetricActivity {
  unit: string
  points: UserModelMetricPoint[]
}

export interface UserModelMetricSeries extends UserModelMetricActivity {
  statistic: string
}

export interface UserModelMetrics {
  window?: { start_at: number; end_at: number; granularity: string; timezone: string }
  activity: UserModelMetricActivity
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
  if (query.activity_id?.trim()) params.set('activity_id', query.activity_id.trim())
  if (query.model_type) params.set('model_type', query.model_type)
  if (query.page !== undefined) params.set('page', String(Math.max(1, Math.floor(query.page))))
  if (query.page_size !== undefined) params.set('page_size', String(Math.min(100, Math.max(1, Math.floor(query.page_size)))))
  return `${USER_MODELS_PATH}?${params.toString()}`
}

function isUserModelList(value: unknown): value is UserModelList {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<UserModelList>
  return Array.isArray(candidate.items) && (candidate.activities === undefined || Array.isArray(candidate.activities))
}

export function getUserModels(query: UserModelsQuery): Promise<UserModelList> {
  return fetchAuthenticatedJson<unknown>(buildUserModelsPath(query)).then((value) => {
    if (!isUserModelList(value)) throw new ApiError(i18n.t('api.models.invalidResponse'), 502, 100002, null)
    return { ...value, activities: value.activities ?? [] }
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
