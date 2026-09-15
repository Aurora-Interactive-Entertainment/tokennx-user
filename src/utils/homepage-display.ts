import { apiTimeToDate } from './format'
import type { HomepageEntry } from '@/api/homepage'

// 同时兼容条目根字段和 CMS data 字段的下架时间；不为未配置的资讯猜测有效期。
export function homepageEntryIsCurrent(entry: HomepageEntry, now: number): boolean {
  const expiry = entry.expires_at ?? entry.data.expires_at ?? entry.data.unpublish_at
  const date = typeof expiry === 'number' ? apiTimeToDate(expiry) : null
  return !date || date.getTime() > now
}
