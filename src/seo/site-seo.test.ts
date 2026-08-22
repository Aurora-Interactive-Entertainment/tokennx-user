import { describe, expect, it } from 'vitest'
import { resolveSeo } from './site-seo'

describe('site SEO metadata', () => {
  it('resolves the Chinese homepage with canonical and language alternates', () => {
    const seo = resolveSeo('/', 'zh-CN')
    expect(seo.noindex).toBe(false)
    expect(seo.canonicalUrl).toBe('https://tokennx.com/')
    expect(seo.alternateUrls).toEqual([
      { locale: 'zh-CN', url: 'https://tokennx.com/' },
      { locale: 'en', url: 'https://tokennx.com/en/' },
      { locale: 'x-default', url: 'https://tokennx.com/' },
    ])
    expect(seo.copy.title).toContain('合规')
  })

  it('uses the /en prefix for English public pages', () => {
    const seo = resolveSeo('/en/models', 'zh-CN')
    expect(seo.locale).toBe('en-US')
    expect(seo.canonicalUrl).toBe('https://tokennx.com/en/models/')
    expect(seo.copy.title).toBe('Model Pricing & Capabilities - Token NX')
  })

  it('keeps the public quickstart page indexable', () => {
    const seo = resolveSeo('/quickstart', 'zh-CN')
    expect(seo.noindex).toBe(false)
    expect(seo.canonicalUrl).toBe('https://tokennx.com/quickstart/')
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
