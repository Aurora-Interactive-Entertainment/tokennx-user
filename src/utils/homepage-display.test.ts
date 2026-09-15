import { describe, expect, it } from 'vitest'
import type { HomepageEntry } from '@/api/homepage'
import { homepageEntryIsCurrent } from './homepage-display'

describe('首页资讯有效期', () => {
  it('兼容 CMS 下架时间并在到期边界隐藏条目', () => {
    const now = 1789459200000
    const entry: HomepageEntry = { id: 'news', kind: 'news', status: 'active', pinned: false, sort_order: 0, data: {} }
    expect(homepageEntryIsCurrent(entry, now)).toBe(true)
    expect(homepageEntryIsCurrent({ ...entry, expires_at: now }, now)).toBe(false)
    expect(homepageEntryIsCurrent({ ...entry, data: { expires_at: now + 1000 } }, now)).toBe(true)
    expect(homepageEntryIsCurrent({ ...entry, data: { unpublish_at: now - 1000 } }, now)).toBe(false)
  })
})
