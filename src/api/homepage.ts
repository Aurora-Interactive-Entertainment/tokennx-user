import i18n from '@/i18n'
import { ApiError, fetchJson, makeApiUrl } from './http'

export const PUBLIC_HOMEPAGE_PATH = '/api/homepage'
export const PUBLIC_HOMEPAGE_ASSET_PATH = '/api/homepage/assets'
export const PUBLIC_HOMEPAGE_STATS_PATH = '/api/homepage/stats'

const PUBLIC_OBJECT_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/

export type HomepageKind = 'card' | 'promotion_model' | 'ad_slot' | 'news' | 'partner'
export type HomepageDiscountKind = 'half' | 'free' | 'custom'
export type HomepageLocale = 'zh-CN' | 'en-US'

export interface HomepageTranslation {
  title?: string
  description?: string
  action_text?: string
  summary?: string
  content_html?: string
  image_url?: string
  image_object_id?: string
  link_url?: string
  name?: string
  logo_url?: string
  logo_object_id?: string
}

export interface HomepageModelPrice {
  meter_kind: string
  unit_price_yuan: string | number
  unit_quantity: number
  currency?: string
  unit?: string
}

export interface HomepagePromotionModel {
  id: string
  alias?: string
  name: string
  company: string
  modality?: string
  prices: HomepageModelPrice[]
  availability?: { rate: number }
}

export interface HomepageEntry {
  id: string
  kind: HomepageKind
  status: 'active'
  sort_order: number
  pinned: boolean
  model_id?: string
  model?: HomepagePromotionModel
  data: {
    translations?: Partial<Record<HomepageLocale, HomepageTranslation>>
    discount_kind?: HomepageDiscountKind
    [key: string]: unknown
  }
  updated_at?: number | string
}

export interface PublicHomepage {
  cards: HomepageEntry[]
  promotion_models: HomepageEntry[]
  ad_slots: HomepageEntry[]
  news: HomepageEntry[]
  partners: HomepageEntry[]
  promotion: unknown[]
}

export interface PublicHomepageStats {
  tokenVolume: number
  apiCalls: number
}

// 中文：只为后端签发的公开对象 ID 生成媒体地址，避免把未校验的内容字段拼接进 URL。
export function getPublicHomepageAssetURL(objectID: string | undefined): string | undefined {
  const normalizedObjectID = objectID?.trim() ?? ''
  if (!PUBLIC_OBJECT_ID_PATTERN.test(normalizedObjectID)) return undefined
  return makeApiUrl(`${PUBLIC_HOMEPAGE_ASSET_PATH}/${encodeURIComponent(normalizedObjectID)}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isHomepageKind(value: unknown): value is HomepageKind {
  return value === 'card' || value === 'promotion_model' || value === 'ad_slot' || value === 'news' || value === 'partner'
}

function parseHomepageModelPrice(value: unknown): HomepageModelPrice | null {
  if (!isRecord(value) || typeof value.meter_kind !== 'string') return null
  if (typeof value.unit_price_yuan !== 'string' && typeof value.unit_price_yuan !== 'number') return null
  if (typeof value.unit_quantity !== 'number' || !Number.isFinite(value.unit_quantity) || value.unit_quantity <= 0) return null
  return {
    meter_kind: value.meter_kind,
    unit_price_yuan: value.unit_price_yuan,
    unit_quantity: value.unit_quantity,
    ...(typeof value.currency === 'string' ? { currency: value.currency } : {}),
    ...(typeof value.unit === 'string' ? { unit: value.unit } : {}),
  }
}

function parseHomepagePromotionModel(value: unknown): HomepagePromotionModel | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()) return undefined
  if (typeof value.name !== 'string' || !value.name.trim() || typeof value.company !== 'string' || !value.company.trim()) return undefined
  const availability = isRecord(value.availability) && typeof value.availability.rate === 'number' && Number.isFinite(value.availability.rate)
    ? { rate: value.availability.rate }
    : undefined
  return {
    id: value.id,
    ...(typeof value.alias === 'string' && value.alias.trim() ? { alias: value.alias } : {}),
    name: value.name,
    company: value.company,
    ...(typeof value.modality === 'string' ? { modality: value.modality } : {}),
    prices: Array.isArray(value.prices) ? value.prices.flatMap((price) => {
      const parsed = parseHomepageModelPrice(price)
      return parsed ? [parsed] : []
    }) : [],
    ...(availability ? { availability } : {}),
  }
}

function parseEntry(value: unknown, expectedKind: HomepageKind): HomepageEntry | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.trim() === '' || value.kind !== expectedKind || value.status !== 'active') return null
  if (typeof value.sort_order !== 'number' || !Number.isInteger(value.sort_order) || typeof value.pinned !== 'boolean' || !isRecord(value.data)) return null
  if (!isHomepageKind(value.kind)) return null
  const model = parseHomepagePromotionModel(value.model)
  return {
    id: value.id,
    kind: value.kind,
    status: 'active',
    sort_order: value.sort_order,
    pinned: value.pinned,
    ...(typeof value.model_id === 'string' ? { model_id: value.model_id } : {}),
    ...(model ? { model } : {}),
    data: value.data as HomepageEntry['data'],
    ...(typeof value.updated_at === 'number' || typeof value.updated_at === 'string' ? { updated_at: value.updated_at } : {}),
  }
}

function parseEntries(value: unknown, kind: HomepageKind): HomepageEntry[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const entry = parseEntry(item, kind)
    return entry ? [entry] : []
  })
}

function parseHomepage(value: unknown): PublicHomepage {
  if (!isRecord(value)) throw new ApiError(i18n.t('api.homepage.invalidResponse'), 502, 100003, null)
  return {
    cards: parseEntries(value.cards, 'card'),
    promotion_models: parseEntries(value.promotion_models, 'promotion_model'),
    ad_slots: parseEntries(value.ad_slots, 'ad_slot'),
    news: parseEntries(value.news, 'news'),
    partners: parseEntries(value.partners, 'partner'),
    promotion: Array.isArray(value.promotion) ? value.promotion : [],
  }
}

function parseHomepageStatValue(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key]
    const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return null
}

function parseHomepageStats(value: unknown): PublicHomepageStats {
  if (!isRecord(value)) throw new ApiError(i18n.t('api.homepage.invalidResponse'), 502, 100003, null)
  const tokenTotal = parseHomepageStatValue(value, ['token_total'])
  const apiCallTotal = parseHomepageStatValue(value, ['api_call_total'])
  if (tokenTotal === null || apiCallTotal === null) throw new ApiError(i18n.t('api.homepage.invalidResponse'), 502, 100003, null)
  return { tokenVolume: Math.floor(tokenTotal / 1_000_000), apiCalls: apiCallTotal }
}

export async function getPublicHomepage(accessToken?: string): Promise<PublicHomepage> {
  return parseHomepage(await fetchJson<unknown>(PUBLIC_HOMEPAGE_PATH, accessToken ? { accessToken } : {}))
}

export async function getPublicHomepageStats(): Promise<PublicHomepageStats> {
  return parseHomepageStats(await fetchJson<unknown>(PUBLIC_HOMEPAGE_STATS_PATH))
}
