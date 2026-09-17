import { describe, expect, it } from 'vitest'
import { publicPath } from './public-path'

describe('公开页面语言路径', () => {
  it('保留详情路径、查询和锚点，支持双向切换', () => {
    expect(publicPath('/docs/id/guide?q=1#example', 'en-US')).toBe('/en/docs/id/guide?q=1#example')
    expect(publicPath('/en/docs/id/guide?q=1#example', 'zh-CN')).toBe('/docs/id/guide?q=1#example')
    expect(publicPath('/', 'en-US')).toBe('/en')
    expect(publicPath('/en', 'zh-CN')).toBe('/')
    expect(publicPath('/en/news/id', 'en-US')).toBe('/en/news/id')
  })
  it('不改写控制台、授权回调和外链', () => {
    for (const path of ['/console/models', '/weixin/callback?code=test', 'https://example.com/docs', '//example.com/docs']) {
      expect(publicPath(path, 'en-US')).toBe(path)
    }
  })
})
