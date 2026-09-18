import { apiTimeToDate, apiTimeToMilliseconds } from './format'
import {
  getPublicHomepageAssetURL,
  getPublicHomepageMediaURL,
  type HomepageEntry,
  type HomepageTranslation,
} from '@/api/homepage'
import type { ActivityCampaign } from '@/components/activity-campaign-modal'

// 同时兼容条目根字段和 CMS data 字段的下架时间；不为未配置的资讯猜测有效期。
export function homepageEntryIsCurrent(entry: HomepageEntry, now: number): boolean {
  const expiry = entry.expires_at ?? entry.data.expires_at ?? entry.data.unpublish_at
  const date = typeof expiry === 'number' ? apiTimeToDate(expiry) : null
  return !date || date.getTime() > now
}

export function homepageLocale(language: string): 'zh-CN' | 'en-US' {
  return language.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
}

export function homepageTranslation(entry: HomepageEntry, language: string): HomepageTranslation {
  const locale = homepageLocale(language)
  return entry.data.translations?.[locale] ?? entry.data.translations?.['zh-CN'] ?? entry.data.translations?.['en-US'] ?? {}
}

export function homepageString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized || undefined
}

export function homepageMediaURL(objectID: string | undefined, fallbackURL: unknown): string | undefined {
  return getPublicHomepageAssetURL(objectID) ?? getPublicHomepageMediaURL(fallbackURL)
}

// 首页运营条目在不同版本接口中可能把图片放在翻译字段或条目根字段，统一从接口数据解析。
export function homepageEntryMediaURL(entry: HomepageEntry, language: string): string | undefined {
  const locale = homepageLocale(language)
  const localizedContent = entry.data.translations?.[locale]
  const fallbackLocale = locale === 'en-US' ? 'zh-CN' : 'en-US'
  const fallbackContent = entry.data.translations?.[fallbackLocale]
  const rootData = entry.data
  const rootObjectID = homepageString(rootData.image_object_id)
  const rootImageURL = homepageString(rootData.image_url) ?? homepageString(rootData.cover_url)
  return homepageMediaURL(
    homepageString(localizedContent?.image_object_id) ?? homepageString(fallbackContent?.image_object_id) ?? rootObjectID,
    homepageString(localizedContent?.image_url)
      ?? homepageString(localizedContent?.cover_url)
      ?? homepageString(fallbackContent?.image_url)
      ?? homepageString(fallbackContent?.cover_url)
      ?? rootImageURL,
  )
}

/**
 * 从首页活动条目中挑选当前要展示的弹窗，按有效期和登录态过滤。
 * 没有可展示的活动时返回 null，调用方据此不渲染弹窗。
 */
export function homepagePopupCampaign(
  popups: HomepageEntry[] | undefined,
  language: string,
  now: number,
  authenticated = false,
): ActivityCampaign | null {
  const candidates = [...(popups ?? [])]
    .filter((entry) => homepageEntryIsCurrent(entry, now))
    .filter((entry) => entry.data.login_required !== true || authenticated)
    .sort((left, right) => Number(right.pinned) - Number(left.pinned) || left.sort_order - right.sort_order)

  const entry = candidates[0]
  if (!entry) return null
  const image = homepageEntryMediaURL(entry, language)
  const content = homepageTranslation(entry, language)
  const endAt = apiTimeToMilliseconds(entry.expires_at ?? entry.data.expires_at)
  const targetUrl = homepageString(entry.data.url)
  const targetText = homepageString(entry.data.url_text)
  return {
    image,
    copy: homepageString(content.title) ?? homepageString(content.description),
    ...(endAt === null ? {} : { activityEndAt: endAt }),
    ...(targetUrl ? { targetUrl } : {}),
    ...(targetText ? { targetText } : {}),
    ...(typeof entry.data.login_required === 'boolean' ? { loginRequired: entry.data.login_required } : {}),
  }
}
