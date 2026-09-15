import { describe, expect, it } from 'vitest'
import { resolveSeo, SITE_ORIGIN } from './site-seo'
import { CONSOLE_ROUTE_META } from '@/routes/console-route-meta'

// SITE_ORIGIN 按运行环境推导（未配置时取当前站点），断言只校验路径拼装，不锁定域名。
describe('site SEO metadata', () => {
  it('为全部控制台路由设置独立的双语标题并禁止索引', () => {
    for (const [path, meta] of Object.entries(CONSOLE_ROUTE_META)) {
      for (const [locale, title] of [['zh-CN', meta.zh], ['en-US', meta.en]]) {
        const seo = resolveSeo(`/console/${path.replace(':modelId', 'test-model')}/`, locale)
        expect(seo.copy.title).toBe(`${title} - Token NX`)
        expect(seo.noindex).toBe(true)
        expect(seo.canonicalUrl).toBeUndefined()
      }
    }
    expect(resolveSeo('/console', 'zh-CN').copy.title).toBe('控制台 - Token NX')
  })

  it('resolves the Chinese homepage with canonical and language alternates', () => {
    const seo = resolveSeo('/', 'zh-CN')
    expect(seo.noindex).toBe(false)
    expect(seo.canonicalUrl).toBe(`${SITE_ORIGIN}/`)
    expect(seo.alternateUrls).toEqual([
      { locale: 'zh-CN', url: `${SITE_ORIGIN}/` },
      { locale: 'en', url: `${SITE_ORIGIN}/en/` },
      { locale: 'x-default', url: `${SITE_ORIGIN}/` },
    ])
    expect(seo.copy.title).toContain('合规')
  })

  it('uses the /en prefix for English public pages', () => {
    const seo = resolveSeo('/en/models', 'zh-CN')
    expect(seo.locale).toBe('en-US')
    expect(seo.canonicalUrl).toBe(`${SITE_ORIGIN}/en/models/`)
    expect(seo.copy.title).toBe('Model Pricing & Capabilities - Token NX')
  })

  it('keeps the public quickstart page indexable', () => {
    const seo = resolveSeo('/quickstart', 'zh-CN')
    expect(seo.noindex).toBe(false)
    expect(seo.canonicalUrl).toBe(`${SITE_ORIGIN}/quickstart/`)
  })

  it('does not expose unverified model prices in model detail metadata', () => {
    const seo = resolveSeo('/models/deepseek-v4-flash', 'zh-CN')
    expect(seo.noindex).toBe(false)
    expect(seo.copy.description).not.toMatch(/¥|\$|价格\s*\d|price\s*\d/i)
    expect(seo.copy.description).toContain('页面显示')
  })

  it('marks authentication and console routes as noindex', () => {
    for (const path of ['/login', '/join', '/invite', '/console/quickstart', '/en/console/models']) {
      const seo = resolveSeo(path, 'zh-CN')
      expect(seo.noindex, path).toBe(true)
      expect(seo.canonicalUrl, path).toBeUndefined()
      expect(seo.alternateUrls, path).toBeUndefined()
    }
  })
})
