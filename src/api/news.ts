import { getActiveLanguage, type AppLanguage } from '@/i18n'
import type { ApiTimeValue } from '@/utils/format'
import { fetchJson, makeApiUrl } from './http'

export type NewsLocale = AppLanguage

export interface NewsArticle {
  id: string
  title: string
  category: string
  description: string
  cover_image?: string
  publish_date: ApiTimeValue
  read_time?: number
  author?: string
  tags?: string[]
  pinned?: boolean
  updated_at?: ApiTimeValue
  click_count?: number
  visit_count?: number
}

export interface NewsDetail extends NewsArticle {
  content: string
  /** Some deployments use the same field name as public documents. */
  content_markdown?: string
}

export interface NewsListResponse {
  items: NewsArticle[]
  page: number
  page_size: number
  total: number
  has_more: boolean
}

export interface NewsListFilters {
  keyword?: string
  tag?: string
}

interface NewsApiItem {
  id?: unknown
  title?: unknown
  summary?: unknown
  description?: unknown
  content?: unknown
  content_markdown?: unknown
  cover_url?: unknown
  cover_image?: unknown
  tags?: unknown
  pinned?: unknown
  published_at?: unknown
  publish_date?: unknown
  updated_at?: unknown
  read_time?: unknown
  author?: unknown
  click_count?: unknown
  visit_count?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isTimeValue(value: unknown): value is ApiTimeValue {
  return (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && Boolean(value.trim()))
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function resolveNewsContentImageUrl(value: string, pageOrigin = typeof window === 'undefined' ? '' : window.location.origin): string | undefined {
  const normalized = value.trim()
  if (!normalized || (/^[a-z][a-z\d+.-]*:/i.test(normalized) && !/^https?:/i.test(normalized))) return undefined

  try {
    // 中文：开发环境沿用当前站点代理，正式环境沿用配置的 API Base URL，并统一输出绝对地址。
    const resolved = new URL(makeApiUrl(normalized), pageOrigin || undefined)
    return resolved.protocol === 'http:' || resolved.protocol === 'https:' ? resolved.toString() : undefined
  } catch {
    return undefined
  }
}

function normalizeArticle(value: unknown, includeContent = false): NewsArticle | NewsDetail | null {
  if (!isRecord(value)) return null
  const item = value as NewsApiItem
  const id = optionalString(item.id)
  const title = optionalString(item.title)
  if (!id || !title) return null
  const tags = Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag.trim())).map((tag) => tag.trim()) : []
  const publishDate = isTimeValue(item.published_at) ? item.published_at : isTimeValue(item.publish_date) ? item.publish_date : ''
  const article: NewsArticle = {
    id,
    title,
    category: tags[0] ?? 'News',
    description: optionalString(item.summary) ?? optionalString(item.description) ?? '',
    ...(optionalString(item.cover_url) ?? optionalString(item.cover_image) ? { cover_image: optionalString(item.cover_url) ?? optionalString(item.cover_image) } : {}),
    publish_date: publishDate,
    ...(optionalNumber(item.read_time) ? { read_time: optionalNumber(item.read_time) } : {}),
    ...(optionalString(item.author) ? { author: optionalString(item.author) } : {}),
    ...(tags.length ? { tags } : {}),
    ...(typeof item.pinned === 'boolean' ? { pinned: item.pinned } : {}),
    ...(isTimeValue(item.updated_at) ? { updated_at: item.updated_at } : {}),
    ...(optionalNumber(item.click_count) !== undefined ? { click_count: optionalNumber(item.click_count) } : {}),
    ...(optionalNumber(item.visit_count) !== undefined ? { visit_count: optionalNumber(item.visit_count) } : {}),
  }
  if (!includeContent) return article
  return {
    ...article,
    content: typeof item.content === 'string' ? item.content : '',
    ...(typeof item.content_markdown === 'string' ? { content_markdown: item.content_markdown } : {}),
  }
}

function localeValue(locale?: NewsLocale): NewsLocale {
  return locale ?? getActiveLanguage()
}

function resolveSignalAndLocale(value: AbortSignal | NewsLocale | undefined, localeOrSignal?: AbortSignal | NewsLocale): { signal?: AbortSignal; locale: NewsLocale } {
  const isAbortSignal = (candidate: unknown): candidate is AbortSignal => typeof AbortSignal !== 'undefined' && candidate instanceof AbortSignal
  if (typeof value === 'string') return { locale: value, signal: isAbortSignal(localeOrSignal) ? localeOrSignal : undefined }
  return { signal: value, locale: localeValue(typeof localeOrSignal === 'string' ? localeOrSignal : undefined) }
}

export async function getNewsList(page = 1, pageSize = 20, signalOrLocale?: AbortSignal | NewsLocale, localeOrSignal?: AbortSignal | NewsLocale, filters?: NewsListFilters): Promise<NewsListResponse> {
  const resolved = resolveSignalAndLocale(signalOrLocale, localeOrSignal)
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)))
  const url = makeApiUrl('/api/news')
  const params = new URLSearchParams({ page: String(safePage), page_size: String(safePageSize), locale: resolved.locale })
  if (filters?.keyword?.trim()) params.set('keyword', filters.keyword.trim())
  if (filters?.tag?.trim()) params.set('tag', filters.tag.trim())
  const value = await fetchJson<unknown>(`${url}?${params.toString()}`, { signal: resolved.signal })
  const payload = isRecord(value) ? value : {}
  const rawItems = Array.isArray(payload.items) ? payload.items : []
  const items = rawItems.flatMap((item) => {
    const article = normalizeArticle(item)
    return article && 'content' in article === false ? [article] : []
  })
  const responsePage = typeof payload.page === 'number' && Number.isFinite(payload.page) ? Math.max(1, Math.floor(payload.page)) : safePage
  const responsePageSize = typeof payload.page_size === 'number' && Number.isFinite(payload.page_size) ? Math.min(100, Math.max(1, Math.floor(payload.page_size))) : safePageSize
  const total = typeof payload.total === 'number' && Number.isFinite(payload.total) ? Math.max(0, Math.floor(payload.total)) : items.length
  return { items, page: responsePage, page_size: responsePageSize, total, has_more: responsePage * responsePageSize < total }
}

export async function getNewsDetail(id: string, signalOrLocale?: AbortSignal | NewsLocale, localeOrSignal?: AbortSignal | NewsLocale): Promise<NewsDetail> {
  const resolved = resolveSignalAndLocale(signalOrLocale, localeOrSignal)
  const url = makeApiUrl(`/api/news/${encodeURIComponent(id)}`)
  const params = new URLSearchParams({ locale: resolved.locale })
  const value = await fetchJson<unknown>(`${url}?${params.toString()}`, { signal: resolved.signal })
  const article = normalizeArticle(value, true)
  if (!article || !('content' in article)) throw new Error('Invalid news response')
  return article
}
