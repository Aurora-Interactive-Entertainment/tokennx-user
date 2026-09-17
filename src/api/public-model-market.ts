import i18n from '@/i18n'
import { ApiError, fetchJson } from './http'
import type { UserModelPricingPeriod, UserModelPricingRule } from './user-models'

export const PUBLIC_MODEL_MARKET_PATH = '/api/model-market'

export interface PublicMarketPrice {
  meter_code?: string
  meter_kind: string
  unit: string
  currency: string
  unit_quantity: number
  unit_price_yuan: string
  tier_no?: number
  selector_meter_code?: string
  period_key?: string
  rule_kind?: UserModelPricingRule['kind']
  lower_bound?: number
  upper_bound?: number
  width?: number
  height?: number
  quality_level?: string
  duration_seconds?: number
  tool_code?: string
  conditions?: Record<string, unknown>
}

export interface PublicMarketTemplatePrice {
  meter_type: string
  meter_unit: string
  tier_no: number
  tier_condition_meter: string
  tier_lower_bound: string
  tier_upper_bound: string
  currency: string
  unit_quantity: number
  unit_price: string
  price_type_description: string
  discount_description: string
  discount_validity: string
  limited_free: boolean
  source_url: string
  captured_on: string
  quality_level?: string
  duration_seconds?: number
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
  pricing_timezone?: string
  pricing_periods?: UserModelPricingPeriod[]
  current_period_key?: string
  template_id?: string
  template_prices?: PublicMarketTemplatePrice[] | null
  template_pricing_timezone?: string
  template_pricing_periods?: UserModelPricingPeriod[]
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

function isRuleKind(value: unknown): value is UserModelPricingRule['kind'] {
  return value === 'token' || value === 'request' || value === 'usage' || value === 'tool'
}

function parsePriceDimensions(value: Record<string, unknown>) {
  return {
    ...(typeof value.tier_no === 'number' ? { tier_no: value.tier_no } : {}),
    ...(typeof value.lower_bound === 'number' ? { lower_bound: value.lower_bound } : {}),
    ...(typeof value.upper_bound === 'number' ? { upper_bound: value.upper_bound } : {}),
    ...(typeof value.width === 'number' ? { width: value.width } : {}),
    ...(typeof value.height === 'number' ? { height: value.height } : {}),
    ...(typeof value.quality_level === 'string' ? { quality_level: value.quality_level } : {}),
    ...(typeof value.duration_seconds === 'number' ? { duration_seconds: value.duration_seconds } : {}),
    ...(typeof value.tool_code === 'string' ? { tool_code: value.tool_code } : {}),
  }
}

function parsePrice(value: unknown): PublicMarketPrice | null {
  if (!isRecord(value) || typeof value.meter_kind !== 'string' || typeof value.unit !== 'string' || typeof value.currency !== 'string' || typeof value.unit_quantity !== 'number' || typeof value.unit_price_yuan !== 'string') return null
  return {
    ...(typeof value.meter_code === 'string' ? { meter_code: value.meter_code } : {}),
    meter_kind: value.meter_kind,
    unit: value.unit,
    currency: value.currency,
    unit_quantity: value.unit_quantity,
    unit_price_yuan: value.unit_price_yuan,
    ...(typeof value.selector_meter_code === 'string' ? { selector_meter_code: value.selector_meter_code } : {}),
    ...(typeof value.period_key === 'string' ? { period_key: value.period_key } : {}),
    ...(isRuleKind(value.rule_kind) ? { rule_kind: value.rule_kind } : {}),
    ...parsePriceDimensions(value),
    // 条件决定报价适用的规格，不能只保留金额而把不同档位显示成同一项。
    ...(isRecord(value.conditions) ? { conditions: value.conditions } : {}),
  }
}

function parseTemplatePrice(value: unknown): PublicMarketTemplatePrice | null {
  if (!isRecord(value) || typeof value.meter_type !== 'string' || typeof value.meter_unit !== 'string' || typeof value.currency !== 'string' || typeof value.unit_quantity !== 'number' || typeof value.unit_price !== 'string' || typeof value.tier_no !== 'number') return null
  return {
    meter_type: value.meter_type,
    meter_unit: value.meter_unit,
    tier_no: value.tier_no,
    tier_condition_meter: typeof value.tier_condition_meter === 'string' ? value.tier_condition_meter : '',
    tier_lower_bound: typeof value.tier_lower_bound === 'string' ? value.tier_lower_bound : '',
    tier_upper_bound: typeof value.tier_upper_bound === 'string' ? value.tier_upper_bound : '',
    currency: value.currency,
    unit_quantity: value.unit_quantity,
    // 官方报价保留原币种与十进制字符串，不能与平台现价混用或自行换算汇率。
    unit_price: value.unit_price,
    price_type_description: typeof value.price_type_description === 'string' ? value.price_type_description : '',
    discount_description: typeof value.discount_description === 'string' ? value.discount_description : '',
    discount_validity: typeof value.discount_validity === 'string' ? value.discount_validity : '',
    limited_free: value.limited_free === true,
    source_url: typeof value.source_url === 'string' ? value.source_url : '',
    captured_on: typeof value.captured_on === 'string' ? value.captured_on : '',
    ...(typeof value.quality_level === 'string' ? { quality_level: value.quality_level } : {}),
    ...(typeof value.duration_seconds === 'number' ? { duration_seconds: value.duration_seconds } : {}),
  }
}

function parsePricingRule(value: unknown): UserModelPricingRule | null {
  if (!isRecord(value) || !isRuleKind(value.kind) || typeof value.meter_code !== 'string' || typeof value.tier_no !== 'number' || typeof value.lower_bound !== 'number' || typeof value.unit_quantity !== 'number' || typeof value.unit_price_yuan !== 'string') return null
  if (value.rounding_mode !== 'up' && value.rounding_mode !== 'down' && value.rounding_mode !== 'half_up' && value.rounding_mode !== 'half_even') return null
  const conditions = isRecord(value.conditions) && Object.values(value.conditions).every((condition) => typeof condition === 'string') ? value.conditions as Record<string, string> : undefined
  return {
    ...parsePriceDimensions(value),
    kind: value.kind,
    meter_code: value.meter_code,
    tier_no: value.tier_no,
    lower_bound: value.lower_bound,
    unit_quantity: value.unit_quantity,
    unit_price_yuan: value.unit_price_yuan,
    rounding_mode: value.rounding_mode,
    ...(conditions ? { conditions } : {}),
  }
}

function parsePricingPeriod(value: unknown): UserModelPricingPeriod | null {
  if (!isRecord(value) || typeof value.key !== 'string' || typeof value.name !== 'string' || typeof value.default !== 'boolean' || typeof value.weekday_mask !== 'number' || typeof value.start_minute !== 'number' || typeof value.end_minute !== 'number' || !Array.isArray(value.rules)) return null
  return {
    key: value.key,
    name: value.name,
    default: value.default,
    weekday_mask: value.weekday_mask,
    start_minute: value.start_minute,
    end_minute: value.end_minute,
    rules: value.rules.flatMap((rule) => { const parsed = parsePricingRule(rule); return parsed ? [parsed] : [] }),
  }
}

function parseModel(value: unknown): PublicMarketModel | null {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.company !== 'string' || typeof value.modality !== 'string') return null
  const id = typeof value.id === 'string' ? value.id : value.name
  const prices = Array.isArray(value.prices) ? value.prices.flatMap((price) => { const parsed = parsePrice(price); return parsed ? [parsed] : [] }) : []
  return {
    id,
    alias: typeof value.alias === 'string' && value.alias.trim() ? value.alias : id,
    name: value.name,
    company: value.company,
    modality: value.modality,
    ...(typeof value.description === 'string' ? { description: value.description } : {}),
    ...(typeof value.icon_url === 'string' ? { icon_url: value.icon_url } : {}),
    ...(typeof value.launched_at === 'number' ? { launched_at: value.launched_at } : {}),
    prices,
    ...(typeof value.pricing_timezone === 'string' ? { pricing_timezone: value.pricing_timezone } : {}),
    ...(Array.isArray(value.pricing_periods) ? { pricing_periods: value.pricing_periods.flatMap((period) => { const parsed = parsePricingPeriod(period); return parsed ? [parsed] : [] }) } : {}),
    ...(typeof value.current_period_key === 'string' ? { current_period_key: value.current_period_key } : {}),
    ...(typeof value.template_id === 'string' ? { template_id: value.template_id } : {}),
    ...(value.template_prices === null ? { template_prices: null } : Array.isArray(value.template_prices) ? { template_prices: value.template_prices.flatMap((price) => { const parsed = parseTemplatePrice(price); return parsed ? [parsed] : [] }) } : {}),
    ...(typeof value.template_pricing_timezone === 'string' ? { template_pricing_timezone: value.template_pricing_timezone } : {}),
    // 官方模版可仅提供时段规则；不能因为旧报价数组为空就丢弃原价。
    ...(Array.isArray(value.template_pricing_periods) ? { template_pricing_periods: value.template_pricing_periods.flatMap((period) => { const parsed = parsePricingPeriod(period); return parsed ? [parsed] : [] }) } : {}),
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
