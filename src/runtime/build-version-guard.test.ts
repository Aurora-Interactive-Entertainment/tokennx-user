import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import source from './build-version-guard.js?raw'
import { normalizeBuildVersion } from '../../build/build-version'

type Guard = NonNullable<Window['__TOKEN_NX_UPDATE_GUARD__']>

function boot(options: { url?: string; version?: string; latest?: string; storage?: Storage; fetch?: typeof fetch } = {}) {
  const doc = document.implementation.createHTMLDocument('更新守卫测试')
  doc.head.innerHTML = `<meta name="token-nx-build-version" content="${options.version ?? 'build-old'}">`
  Object.defineProperty(doc, 'visibilityState', { configurable: true, value: 'visible' })
  const replace = vi.fn()
  const location = Object.assign(new URL(options.url ?? 'https://example.test/'), { replace })
  const request = options.fetch ?? vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: options.latest ?? 'build-new' }) })
  const win = Object.assign(new EventTarget(), {
    location, sessionStorage: options.storage ?? window.sessionStorage,
    fetch: request, setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    __TOKEN_NX_UPDATE_GUARD__: undefined as Guard | undefined,
  })
  // 直接执行构建实际内联的源码，避免测试另一份不参与发布的实现。
  new Function('window', 'document', source)(win, doc)
  return { doc, win, guard: win.__TOKEN_NX_UPDATE_GUARD__!, request, replace, location }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-16T10:00:00Z'))
  window.sessionStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('内联构建版本守卫', () => {
  it.each(['.release-20260917', '_release-20260917', '-release-20260917', 'v'.repeat(200)])('构建器规范化的版本可被浏览器接受：%s', async (input) => {
    const latest = normalizeBuildVersion(input)
    const app = boot({ latest })
    await app.guard.check()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(new URL(app.replace.mock.calls[0][0]).searchParams.get('__token_nx_build')).toBe(latest)
  })

  it('前台一直停留也会每 30 秒检测发布并自动更新', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ version: 'build-old' }) })
      .mockResolvedValue({ ok: true, json: async () => ({ version: 'build-new' }) })
    const app = boot({ url: 'https://example.test/console', fetch })
    await app.guard.routeChanged()
    await vi.advanceTimersByTimeAsync(29_999)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(app.replace).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_001)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it('并行操作必须全部结束；重复释放不会解除其他操作', async () => {
    const app = boot()
    const releaseA = app.guard.blockReload()
    const releaseB = app.guard.blockReload()
    await app.guard.check()
    releaseA()
    releaseA()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(app.replace).not.toHaveBeenCalled()
    releaseB()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.replace).toHaveBeenCalledTimes(1)
    expect(app.request).toHaveBeenCalledTimes(1)
  })

  it('操作结束到刷新之间开始新操作，继续延后刷新', async () => {
    const app = boot()
    const releaseA = app.guard.blockReload()
    await app.guard.check()
    releaseA()
    const releaseB = app.guard.blockReload()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.replace).not.toHaveBeenCalled()
    releaseB()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it('草稿恢复原值后自动更新，不会被曾经输入的记录永久阻塞', async () => {
    const app = boot()
    const field = app.doc.createElement('textarea')
    field.defaultValue = '已保存内容'
    app.doc.body.append(field)
    field.dispatchEvent(new Event('focusin', { bubbles: true }))
    field.value = ''
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await app.guard.check()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.replace).not.toHaveBeenCalled()
    field.value = '已保存内容'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it('保存或取消后关闭弹窗，自动清理已关闭弹窗的草稿保护', async () => {
    const app = boot()
    const dialog = app.doc.createElement('section')
    dialog.setAttribute('role', 'dialog')
    let visible = true
    dialog.getClientRects = () => (visible ? [new DOMRect()] : []) as unknown as DOMRectList
    const field = app.doc.createElement('input')
    dialog.append(field)
    app.doc.body.append(dialog)
    field.value = '编辑内容'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await app.guard.check()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.replace).not.toHaveBeenCalled()
    visible = false
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it('切换路由不会解除仍然挂载的草稿；页面卸载后可自动更新', async () => {
    const app = boot()
    const field = app.doc.createElement('input')
    app.doc.body.append(field)
    field.value = '共享草稿'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await app.guard.check()
    app.location.pathname = '/console'
    await app.guard.routeChanged()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.replace).not.toHaveBeenCalled()
    field.remove()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it('业务管理的已保存输入不重复变成通用草稿，活动焦点仍受保护', async () => {
    const app = boot()
    const field = app.doc.createElement('input')
    field.setAttribute('data-build-update-managed', '')
    app.doc.body.append(field)
    field.value = '历史中已有的提示词'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    Object.defineProperty(app.doc, 'activeElement', { configurable: true, value: field })
    await app.guard.check()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.replace).not.toHaveBeenCalled()
    Object.defineProperty(app.doc, 'activeElement', { configurable: true, value: app.doc.body })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it('等待操作期间发布回退为当前版本，取消待刷新任务', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ version: 'build-new' }) })
      .mockResolvedValue({ ok: true, json: async () => ({ version: 'build-old' }) })
    const app = boot({ fetch })
    const release = app.guard.blockReload()
    await app.guard.check()
    await vi.advanceTimersByTimeAsync(30_000)
    release()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.guard.pendingVersion).toBe('')
    expect(app.replace).not.toHaveBeenCalled()
  })

  it('已发现新版后进入后台或授权回调，也不能由延期定时器刷新', async () => {
    const app = boot()
    await app.guard.check()
    Object.defineProperty(app.doc, 'visibilityState', { configurable: true, value: 'hidden' })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.replace).not.toHaveBeenCalled()
    Object.defineProperty(app.doc, 'visibilityState', { configurable: true, value: 'visible' })
    app.location.pathname = '/weixin/callback'
    await vi.advanceTimersByTimeAsync(30_000)
    expect(app.replace).not.toHaveBeenCalled()
    expect(app.guard.reload()).toBe(false)
  })

  it('发现新版时保留原查询参数和锚点，使用独立版本探针刷新', async () => {
    const app = boot({ url: 'https://example.test/terms?lang=en#refund' })
    await app.guard.check()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.request).toHaveBeenCalledTimes(1)
    expect(app.request).toHaveBeenCalledWith(expect.stringMatching(/^\/version.json\?t=\d+$/), expect.objectContaining({ cache: 'no-store', credentials: 'omit' }))
    const target = new URL(app.replace.mock.calls[0][0])
    expect(target.pathname).toBe('/terms')
    expect(target.searchParams.get('lang')).toBe('en')
    expect(target.hash).toBe('#refund')
    expect(target.searchParams.get('__token_nx_build')).toBe('build-new')
  })

  it('版本相同时不刷新，并合并请求及节流', async () => {
    const app = boot({ latest: 'build-old' })
    await Promise.all([app.guard.check(), app.guard.check(), app.guard.routeChanged()])
    app.win.dispatchEvent(new Event('focus'))
    await app.guard.check()
    expect(app.request).toHaveBeenCalledTimes(1)
    expect(app.replace).not.toHaveBeenCalled()
  })

  it('兼容旧的永久跳过标记，不再阻止更新', async () => {
    window.sessionStorage.setItem('token-nx:build-guard', 'build-old')
    const app = boot()
    await app.guard.check()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it('缓存绕不过去时不循环刷新，冷却后可再次尝试', async () => {
    window.sessionStorage.setItem('token-nx:build-guard', JSON.stringify({ from: 'build-old', to: 'build-new', at: Date.now() }))
    const app = boot()
    await app.guard.check()
    expect(app.replace).not.toHaveBeenCalled()
    expect(app.guard.pendingVersion).toBe('build-new')
    await vi.advanceTimersByTimeAsync(60_001)
    await app.guard.check()
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it('另一新版本不受上次版本对的刷新标记限制', async () => {
    window.sessionStorage.setItem('token-nx:build-guard', JSON.stringify({ from: 'build-old', to: 'build-other', at: Date.now() }))
    const app = boot()
    await app.guard.check()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it('禁用存储时仍能更新，再次拿到旧 HTML 时由 URL 冷却保护', async () => {
    const storage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } } as unknown as Storage
    const first = boot({ storage })
    await first.guard.check()
    await vi.advanceTimersByTimeAsync(1_000)
    const next = boot({ storage, url: first.replace.mock.calls[0][0] })
    await next.guard.check()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(next.replace).not.toHaveBeenCalled()
  })

  it.each(['/weixin/callback', '/?code=one-time&state=opaque'])('不请求或重载一次性授权回调 %s', async (path) => {
    const app = boot({ url: `https://example.test${path}` })
    await app.guard.check()
    expect(app.request).not.toHaveBeenCalled()
    expect(app.guard.reload()).toBe(false)
  })

  it('检查途中进入授权回调也不刷新', async () => {
    const app = boot()
    app.location.pathname = '/weixin/callback'
    await app.guard.check()
    await vi.advanceTimersByTimeAsync(0)
    expect(app.replace).not.toHaveBeenCalled()
    expect(app.guard.pendingVersion).toBe('')
  })

  it('未保存输入延后自动刷新，用户仍可主动更新', async () => {
    const app = boot()
    const field = app.doc.createElement('input')
    app.doc.body.append(field)
    field.value = '未保存内容'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await app.guard.check()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.replace).not.toHaveBeenCalled()
    expect(app.guard.pendingVersion).toBe('build-new')
    expect(app.guard.reload()).toBe(true)
  })

  it('控制台按操作状态保护，操作结束后无需跳转或手动刷新', async () => {
    const app = boot({ url: 'https://example.test/console/recharge' })
    const release = app.guard.blockReload()
    await app.guard.routeChanged()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.replace).not.toHaveBeenCalled()
    release()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.replace).toHaveBeenCalledTimes(1)
    expect(new URL(app.replace.mock.calls[0][0]).pathname).toBe('/console/recharge')
  })

  it('有可见弹窗时延后更新', async () => {
    const app = boot()
    const dialog = app.doc.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.getClientRects = () => [new DOMRect()] as unknown as DOMRectList
    app.doc.body.append(dialog)
    await app.guard.check()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.replace).not.toHaveBeenCalled()
    dialog.remove()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it.each(['focus', 'pageshow', 'online'])('%s 会在节流过期后重新检测', async (event) => {
    const app = boot({ latest: 'build-old' })
    await app.guard.check()
    await vi.advanceTimersByTimeAsync(30_001)
    app.win.dispatchEvent(new Event(event))
    await app.guard.check()
    expect(app.request).toHaveBeenCalledTimes(2)
  })

  it('后台不检查，回到前台再检查', async () => {
    const app = boot({ latest: 'build-old' })
    await app.guard.check()
    Object.defineProperty(app.doc, 'visibilityState', { configurable: true, value: 'hidden' })
    await vi.advanceTimersByTimeAsync(60_001)
    await app.guard.check()
    expect(app.request).toHaveBeenCalledTimes(1)
    Object.defineProperty(app.doc, 'visibilityState', { configurable: true, value: 'visible' })
    app.doc.dispatchEvent(new Event('visibilitychange'))
    await app.guard.check()
    expect(app.request).toHaveBeenCalledTimes(2)
  })

  it('协议跳转缩短检查间隔，普通跳转维持节流', async () => {
    const app = boot({ latest: 'build-old' })
    await app.guard.check()
    await vi.advanceTimersByTimeAsync(5_001)
    app.location.pathname = '/models'
    await app.guard.routeChanged()
    expect(app.request).toHaveBeenCalledTimes(1)
    app.location.pathname = '/privacy'
    await app.guard.routeChanged()
    expect(app.request).toHaveBeenCalledTimes(2)
  })

  it('网络失败和无效探针不刷新，恢复网络后可以重试', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ version: '<html>' }) })
      .mockResolvedValue({ ok: true, json: async () => ({ version: 'build-new' }) })
    const app = boot({ fetch })
    await app.guard.check()
    await vi.advanceTimersByTimeAsync(30_001)
    await app.guard.check()
    expect(app.replace).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(30_001)
    await app.guard.check()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it('探针超时会中止请求，后续检查不被在途锁阻塞', async () => {
    const fetch = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('timeout')))
    })) as unknown as typeof window.fetch
    const app = boot({ fetch })
    await vi.advanceTimersByTimeAsync(8_001)
    await vi.advanceTimersByTimeAsync(30_001)
    void app.guard.check()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
