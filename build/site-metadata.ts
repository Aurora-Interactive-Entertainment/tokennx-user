import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

const DEFAULT_SITE_ORIGIN = 'https://tokennx.cn'

// HTML、sitemap、robots 共用发布域名，避免换域名后静态抓取入口仍指向旧站。
export function siteMetadataPlugin(configuredOrigin?: string): Plugin {
  const origin = new URL(configuredOrigin?.trim() || DEFAULT_SITE_ORIGIN)
  if (!['https:', 'http:'].includes(origin.protocol) || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) {
    throw new Error('VITE_PUBLIC_SITE_ORIGIN 必须是完整的 HTTP(S) 站点域名，不含路径或凭据')
  }
  let config: ResolvedConfig
  const transform = (source: string) => source.replaceAll(DEFAULT_SITE_ORIGIN, origin.origin)
  return {
    name: 'token-nx-site-metadata',
    configResolved(value) { config = value },
    transformIndexHtml: transform,
    generateBundle() {
      for (const fileName of ['robots.txt', 'sitemap.xml', 'llms.txt']) {
        this.emitFile({ type: 'asset', fileName, source: transform(readFileSync(resolve(config.publicDir, fileName), 'utf8')) })
      }
    },
  }
}
