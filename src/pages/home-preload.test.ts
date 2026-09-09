import { afterEach, describe, expect, it, vi } from 'vitest'
import html from '../../index.html?raw'

// 中文：直接执行 HTML 中的预加载脚本，避免测试实现与真实首屏入口脱节。
const preloadScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1])
  .find((source) => source.includes('window.__TOKEN_NX_HOMEPAGE_REQUEST__'))
if (!preloadScript) throw new Error('首页预加载脚本缺失')

function runPreload(pathname: string, locale = 'zh-CN', status = 200) {
  vi.useFakeTimers()
  const imageUrls: string[] = []
  const windowMock = {
    location: { pathname },
    localStorage: { getItem: () => locale },
    setTimeout,
    clearTimeout,
    __TOKEN_NX_HOMEPAGE_REQUEST__: undefined as Promise<unknown> | undefined,
  }
  class PreloadImage extends EventTarget {
    set src(value: string) { imageUrls.push(value) }
  }
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    code: 0,
    data: { cards: [{ data: { translations: {
      'zh-CN': { image_url: '/zh-cover.png' },
      'en-US': { image_url: '/en-cover.png' },
    } } }] },
  }), { status }))
  new Function('window', 'fetch', 'Image', 'AbortController', preloadScript!)(windowMock, fetchMock, PreloadImage, AbortController)
  return { fetchMock, imageUrls, request: windowMock.__TOKEN_NX_HOMEPAGE_REQUEST__ }
}

afterEach(() => vi.useRealTimers())

describe('首页 HTML 预加载', () => {
  it.each(['/', '/en', '/en/', '/home'])('%s 在 React 挂载前请求首页内容', async (pathname) => {
    const { fetchMock, request } = runPreload(pathname)
    await request
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith('/api/homepage', expect.objectContaining({ credentials: 'omit', priority: 'high' }))
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['/models', '/en/docs', '/console/api-keys'])('%s 不发起首页预请求', (pathname) => {
    const { fetchMock, request } = runPreload(pathname)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(request).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('英文入口优先加载英文图片，不受已保存中文偏好影响', async () => {
    const { imageUrls, request } = runPreload('/en/', 'zh-CN')
    await request
    expect(imageUrls).toEqual(['/en-cover.png'])
  })

  it('默认入口尊重已保存的英文偏好', async () => {
    const { imageUrls, request } = runPreload('/', 'en-US')
    await request
    expect(imageUrls).toEqual(['/en-cover.png'])
  })

  it('接口异常时返回空预加载结果并清理超时，交由现有页面重试', async () => {
    const { imageUrls, request } = runPreload('/', 'zh-CN', 503)
    await expect(request).resolves.toBeUndefined()
    expect(imageUrls).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
})
