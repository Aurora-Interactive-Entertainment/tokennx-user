import i18n from '@/i18n'
import { ApiError, fetchJson } from './http'

export const PUBLIC_MODEL_MARKET_PATH = '/api/model-market'

export interface PublicMarketPrice {
  meter_kind: string
  unit: string
  currency: string
  unit_quantity: number
  unit_price_yuan: string
}

export interface PublicMarketModel {
  id: string
  alias: string
  name: string
  company: string
  modality: string
  description?: string
  icon_url?: string
  launched_at?: number
  prices: PublicMarketPrice[]
}

export interface PublicMarketCarousel {
  id: string
  status: string
  sort_order: number
  title: string
  title_en?: string
  description: string
  description_en?: string
  tags: string[]
  tags_en?: string[]
  image_url?: string
  model_id?: string
  model_name?: string
  model?: PublicMarketModel
}

export interface PublicMarketTopic {
  id: string
  status: string
  sort_order: number
  name: string
  name_en?: string
  model_ids: string[] | null
  models?: PublicMarketModel[]
}

export interface PublicModelMarket {
  carousels: PublicMarketCarousel[]
  topics: PublicMarketTopic[]
  version: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function invalidResponse(): ApiError {
  return new ApiError(i18n.t('api.http.unreadableResponse'), 502, 100003, null)
}

function parsePrice(value: unknown): PublicMarketPrice | null {
  if (!isRecord(value) || typeof value.meter_kind !== 'string' || typeof value.unit !== 'string' || typeof value.currency !== 'string' || typeof value.unit_quantity !== 'number' || typeof value.unit_price_yuan !== 'string') return null
  return { meter_kind: value.meter_kind, unit: value.unit, currency: value.currency, unit_quantity: value.unit_quantity, unit_price_yuan: value.unit_price_yuan }
}

function parseModel(value: unknown): PublicMarketModel | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.company !== 'string' || typeof value.modality !== 'string') return null
  const prices = Array.isArray(value.prices) ? value.prices.flatMap((price) => { const parsed = parsePrice(price); return parsed ? [parsed] : [] }) : []
  return {
    id: value.id,
    alias: typeof value.alias === 'string' && value.alias.trim() ? value.alias : value.id,
    name: value.name,
    company: value.company,
    modality: value.modality,
    ...(typeof value.description === 'string' ? { description: value.description } : {}),
    ...(typeof value.icon_url === 'string' ? { icon_url: value.icon_url } : {}),
    ...(typeof value.launched_at === 'number' ? { launched_at: value.launched_at } : {}),
    prices,
  }
}

function parseCarousel(value: unknown): PublicMarketCarousel | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.status !== 'string' || typeof value.sort_order !== 'number' || typeof value.title !== 'string' || typeof value.description !== 'string') return null
  // 轮播配置允许不绑定模型；兼容接口当前返回的 model_name 字段，避免整条数据被过滤。
  const modelId = typeof value.model_id === 'string' ? value.model_id : undefined
  const modelName = typeof value.model_name === 'string' && value.model_name.trim() ? value.model_name.trim() : undefined
  return {
    id: value.id,
    status: value.status,
    sort_order: value.sort_order,
    title: value.title,
    ...(typeof value.title_en === 'string' ? { title_en: value.title_en } : {}),
    description: value.description,
    ...(typeof value.description_en === 'string' ? { description_en: value.description_en } : {}),
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    ...(Array.isArray(value.tags_en) ? { tags_en: value.tags_en.filter((tag): tag is string => typeof tag === 'string') } : {}),
    ...(typeof value.image_url === 'string' ? { image_url: value.image_url } : {}),
    ...(modelId ? { model_id: modelId } : {}),
    ...(modelName ? { model_name: modelName } : {}),
    ...(parseModel(value.model) ? { model: parseModel(value.model) ?? undefined } : {}),
  }
}

function parseTopic(value: unknown): PublicMarketTopic | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.status !== 'string' || typeof value.sort_order !== 'number' || typeof value.name !== 'string') return null
  return {
    id: value.id,
    status: value.status,
    sort_order: value.sort_order,
    name: value.name,
    ...(typeof value.name_en === 'string' ? { name_en: value.name_en } : {}),
    model_ids: Array.isArray(value.model_ids) ? value.model_ids.filter((id): id is string => typeof id === 'string') : null,
    ...(Array.isArray(value.models) ? { models: value.models.flatMap((model) => { const parsed = parseModel(model); return parsed ? [parsed] : [] }) } : {}),
  }
}

function parseMarket(data: unknown): PublicModelMarket {
  if (!isRecord(data)) throw invalidResponse()
  if (!Array.isArray(data.carousels) || !Array.isArray(data.topics) || typeof data.version !== 'string') throw invalidResponse()
  return {
    carousels: data.carousels.flatMap((carousel) => { const parsed = parseCarousel(carousel); return parsed ? [parsed] : [] }).sort((a, b) => a.sort_order - b.sort_order),
    topics: data.topics.flatMap((topic) => { const parsed = parseTopic(topic); return parsed ? [parsed] : [] }).sort((a, b) => a.sort_order - b.sort_order),
    version: data.version,
  }
}

export function getPublicModelMarket(signal?: AbortSignal): Promise<PublicModelMarket> {
  return fetchJson<unknown>(PUBLIC_MODEL_MARKET_PATH, { signal }).then(parseMarket)
}
