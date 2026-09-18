import { describe, expect, it } from 'vitest'
import type { HomepageEntry } from '@/api/homepage'
import { homepageEntryIsCurrent, homepagePopupCampaign } from './homepage-display'

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

describe('首页活动弹窗数据', () => {
  const now = 1789459200000
  const coverUrl = 'https://cdn.example.com/campaign.png'

  function popup(overrides: Partial<HomepageEntry> = {}): HomepageEntry {
    return {
      id: 'popup',
      kind: 'popup',
      status: 'active',
      pinned: false,
      sort_order: 0,
      data: { cover_url: coverUrl },
      ...overrides,
    }
  }

  it('接口没有活动数据时不产生弹窗', () => {
    expect(homepagePopupCampaign(undefined, 'zh-CN', now)).toBeNull()
    expect(homepagePopupCampaign([], 'zh-CN', now)).toBeNull()
  })

  it('把接口字段映射为弹窗图片、倒计时和主按钮数据', () => {
    const campaign = homepagePopupCampaign([
      popup({
        expires_at: now + 86_400_000,
        data: {
          cover_url: coverUrl,
          url: 'https://tokennx.cn',
          url_text: '立即参与',
          login_required: false,
          translations: { 'zh-CN': { title: '新用户注册即领' } },
        },
      }),
    ], 'zh-CN', now)

    expect(campaign).toEqual({
      image: coverUrl,
      copy: '新用户注册即领',
      activityEndAt: now + 86_400_000,
      targetUrl: 'https://tokennx.cn',
      targetText: '立即参与',
      loginRequired: false,
    })
  })

  it('封面可选，已过期的活动条目不展示弹窗', () => {
    expect(homepagePopupCampaign([popup({ data: { expires_at: now + 1000, url: '/models' } })], 'zh-CN', now)).toMatchObject({ image: undefined, activityEndAt: now + 1000, targetUrl: '/models' })
    expect(homepagePopupCampaign([popup({ data: { cover_url: coverUrl, expires_at: now - 1000 } })], 'zh-CN', now)).toBeNull()
  })

  it('仅登录可见的活动按当前登录态过滤，并继续选择公开活动', () => {
    const restricted = popup({ pinned: true, data: { cover_url: coverUrl, login_required: true } })
    const publicPopup = popup({ data: { cover_url: 'https://cdn.example.com/public.png', login_required: false } })
    expect(homepagePopupCampaign([restricted], 'zh-CN', now, false)).toBeNull()
    expect(homepagePopupCampaign([restricted], 'zh-CN', now, true)?.loginRequired).toBe(true)
    expect(homepagePopupCampaign([restricted, publicPopup], 'zh-CN', now, false)?.image).toBe(publicPopup.data.cover_url)
  })

  it('同置顶状态按 sort_order 升序选择，支持 data 中的毫秒到期时间', () => {
    const campaign = homepagePopupCampaign([
      popup({ sort_order: 2 }),
      popup({ sort_order: 1, data: { cover_url: coverUrl, expires_at: now + 1000 } }),
    ], 'zh-CN', now)
    expect(campaign?.activityEndAt).toBe(now + 1000)
  })

  it('多条活动同时命中时优先展示置顶条目', () => {
    const campaign = homepagePopupCampaign([
      popup({ id: 'plain', data: { cover_url: 'https://cdn.example.com/plain.png' } }),
      popup({ id: 'pinned', pinned: true, sort_order: 5, data: { cover_url: 'https://cdn.example.com/pinned.png' } }),
    ], 'zh-CN', now)

    expect(campaign?.image).toBe('https://cdn.example.com/pinned.png')
  })
})
