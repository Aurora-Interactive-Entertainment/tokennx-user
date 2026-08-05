import i18n from '@/i18n'
import { ApiError, fetchJson, makeApiUrl } from './http'

export const PUBLIC_HOMEPAGE_PATH = '/api/homepage'
export const PUBLIC_HOMEPAGE_ASSET_PATH = '/api/homepage/assets'

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

export interface HomepageEntry {
  id: string
  kind: HomepageKind
  status: 'active'
  sort_order: number
  pinned: boolean
  model_id?: string
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

function parseEntry(value: unknown, expectedKind: HomepageKind): HomepageEntry | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.trim() === '' || value.kind !== expectedKind || value.status !== 'active') return null
  if (typeof value.sort_order !== 'number' || !Number.isInteger(value.sort_order) || typeof value.pinned !== 'boolean' || !isRecord(value.data)) return null
  if (!isHomepageKind(value.kind)) return null
  return {
    id: value.id,
    kind: value.kind,
    status: 'active',
    sort_order: value.sort_order,
    pinned: value.pinned,
    ...(typeof value.model_id === 'string' ? { model_id: value.model_id } : {}),
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
  }
}

export async function getPublicHomepage(): Promise<PublicHomepage> {
  return parseHomepage(await fetchJson<unknown>(PUBLIC_HOMEPAGE_PATH))
}
