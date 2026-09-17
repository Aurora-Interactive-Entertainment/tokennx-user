import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import source from './build-version-guard.js?raw'
import { normalizeBuildVersion } from '../../build/build-version'

type Guard = NonNullable<Window['__TOKEN_NX_UPDATE_GUARD__']>

function boot(options: { url?: string; version?: string; latest?: string; storage?: Storage; fetch?: typeof fetch } = {}) {
  const doc = document.implementation.createHTMLDocument('静默更新测试')
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
  // 执行构建真正内联的守卫，验证浏览器发布行为。
  new Function('window', 'document', source)(win, doc)
  const guard = win.__TOKEN_NX_UPDATE_GUARD__!
  const navigate = (path: string) => { location.href = new URL(path, location).href; return guard.routeChanged() }
  return { doc, win, guard, request, replace, location, navigate }
}

function editInput(app: ReturnType<typeof boot>, initial = '') {
  const field = app.doc.createElement('textarea')
  field.defaultValue = initial
  app.doc.body.append(field)
  field.dispatchEvent(new Event('focusin', { bubbles: true }))
  field.value = initial + '未提交内容'
  field.dispatchEvent(new Event('input', { bubbles: true }))
  return field
}

function delayedFetch() {
  let resolve!: (value: { ok: boolean; json: () => Promise<{ version: string }> }) => void
  const request = vi.fn(() => new Promise(done => { resolve = done })) as unknown as typeof fetch
  return { request, respond: (version = 'build-new') => resolve({ ok: true, json: async () => ({ version }) }) }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-17T10:00:00Z'))
  window.sessionStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('仅在切页时静默更新', () => {
  it('首次加载和后台轮询只记录新版，停留当前页不刷新也不发送提示事件', async () => {
    const app = boot()
    const notice = vi.fn()
    app.win.addEventListener('token-nx:update-available', notice)
    await app.guard.routeChanged()
    await vi.advanceTimersByTimeAsync(90_000)
    expect(app.guard.pendingVersion).toBe('build-new')
    expect(app.request).toHaveBeenCalledTimes(4)
    expect(app.replace).not.toHaveBeenCalled()
    expect(notice).not.toHaveBeenCalled()
  })

  it('定时发现新版本后仍等待真正的页面切换', async () => {
    const request = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ version: 'build-old' }) })
      .mockResolvedValue({ ok: true, json: async () => ({ version: 'build-new' }) })
    const app = boot({ fetch: request, url: 'https://example.test/console' })
    await app.guard.routeChanged()
    await vi.advanceTimersByTimeAsync(30_001)
    expect(app.guard.pendingVersion).toBe('build-new')
    expect(app.replace).not.toHaveBeenCalled()
    await app.navigate('/console/usage?range=month#details')
    const target = new URL(app.replace.mock.calls[0][0])
    expect(target.pathname).toBe('/console/usage')
    expect(target.searchParams.get('range')).toBe('month')
    expect(target.hash).toBe('#details')
    expect(target.searchParams.get('__token_nx_build')).toBe('build-new')
  })

  it.each(['.release-20260917', '_release-20260917', '-release-20260917', 'v'.repeat(200)])('构建器规范化的版本能在切页时更新：%s', async input => {
    const latest = normalizeBuildVersion(input)
    const app = boot({ latest })
    await app.guard.check()
    expect(app.replace).not.toHaveBeenCalled()
    await app.navigate('/models')
    expect(new URL(app.replace.mock.calls[0][0]).searchParams.get('__token_nx_build')).toBe(latest)
    expect(app.request).toHaveBeenCalledWith(expect.stringMatching(/^\/version.json\?t=\d+$/), expect.objectContaining({ cache: 'no-store', credentials: 'omit' }))
  })

  it('查询参数、同页重挂载与锚点变化不触发更新', async () => {
    const app = boot({ url: 'https://example.test/console/quickstart?model=one' })
    await app.guard.check()
    await app.guard.routeChanged()
    await app.navigate('/console/quickstart?model=two')
    await app.navigate('/console/quickstart?model=two#sample')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(app.replace).not.toHaveBeenCalled()
    await app.navigate('/console/models')
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it('相同版本合并请求和节流，切页也不刷新', async () => {
    const app = boot({ latest: 'build-old' })
    await Promise.all([app.guard.check(), app.guard.check(), app.guard.routeChanged()])
    await app.navigate('/models')
    expect(app.request).toHaveBeenCalledTimes(1)
    expect(app.replace).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5_001)
    await app.navigate('/docs')
    expect(app.request).toHaveBeenCalledTimes(2)
    expect(app.replace).not.toHaveBeenCalled()
  })

  it('切页时的快速探针响应可立即更新，不依赖下一次轮询', async () => {
    const app = boot({ latest: 'build-old' })
    await app.guard.check()
    await vi.advanceTimersByTimeAsync(5_001)
    vi.mocked(app.request).mockResolvedValue({ ok: true, json: async () => ({ version: 'build-new' }) } as Response)
    await app.navigate('/docs')
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it('探针慢响应不会在用户已进入页面后突然刷新', async () => {
    const response = delayedFetch()
    const app = boot({ fetch: response.request })
    const navigation = app.navigate('/docs')
    await vi.advanceTimersByTimeAsync(1_001)
    response.respond()
    await navigation
    expect(app.guard.pendingVersion).toBe('build-new')
    expect(app.replace).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(app.replace).not.toHaveBeenCalled()
    await app.navigate('/models')
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it.each(['pointerdown', 'keydown', 'input', 'change', 'submit', 'wheel', 'touchstart'])('等待探针期间出现 %s 交互，跳过本次更新', async event => {
    const response = delayedFetch()
    const app = boot({ fetch: response.request })
    const navigation = app.navigate('/docs')
    await vi.advanceTimersByTimeAsync(100)
    app.doc.dispatchEvent(new Event(event, { cancelable: true }))
    response.respond()
    await navigation
    expect(app.replace).not.toHaveBeenCalled()
    await app.navigate('/models')
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it('等待探针期间发生操作，即使迅速结束也不会在同页补刷新', async () => {
    const response = delayedFetch()
    const app = boot({ fetch: response.request })
    const navigation = app.navigate('/docs')
    await vi.advanceTimersByTimeAsync(100)
    const release = app.guard.blockReload()
    release()
    response.respond()
    await navigation
    expect(app.replace).not.toHaveBeenCalled()
    await app.navigate('/models')
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it('等待探针时路由再次切换，只允许最新目标刷新一次', async () => {
    const response = delayedFetch()
    const app = boot({ fetch: response.request })
    const first = app.navigate('/docs')
    const second = app.navigate('/models?filter=text#list')
    await vi.advanceTimersByTimeAsync(100)
    response.respond()
    await Promise.all([first, second])
    expect(app.replace).toHaveBeenCalledTimes(1)
    expect(new URL(app.replace.mock.calls[0][0]).pathname).toBe('/models')
  })

  it('等待探针时仅查询参数变化，也取消旧切页的刷新资格', async () => {
    const response = delayedFetch()
    const app = boot({ fetch: response.request })
    const navigation = app.navigate('/docs')
    await vi.advanceTimersByTimeAsync(100)
    app.location.search = '?search=new'
    response.respond()
    await navigation
    expect(app.replace).not.toHaveBeenCalled()
  })

  it('切页被并行操作阻挡后，全部结束仍等待下次切页；重复释放不误解锁', async () => {
    const app = boot()
    const releaseA = app.guard.blockReload()
    const releaseB = app.guard.blockReload()
    await app.guard.check()
    await app.navigate('/console/recharge')
    releaseA()
    releaseA()
    await app.navigate('/console/usage')
    expect(app.replace).not.toHaveBeenCalled()
    releaseB()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(app.replace).not.toHaveBeenCalled()
    await app.navigate('/console')
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it('切页开始时仍在操作，即使探针返回前结束也等待下次切页', async () => {
    const response = delayedFetch()
    const app = boot({ fetch: response.request })
    const release = app.guard.blockReload()
    const navigation = app.navigate('/docs')
    await vi.advanceTimersByTimeAsync(100)
    release()
    response.respond()
    await navigation
    expect(app.replace).not.toHaveBeenCalled()
  })

  it.each(['reset', 'unmount'])('草稿 %s 后不会在当前页刷新，下一次切页才更新', async action => {
    const app = boot()
    const field = editInput(app, '已保存内容')
    await app.guard.check()
    await app.navigate('/docs')
    expect(app.replace).not.toHaveBeenCalled()
    if (action === 'reset') {
      field.value = '已保存内容'
      field.dispatchEvent(new Event('input', { bubbles: true }))
    } else field.remove()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(app.replace).not.toHaveBeenCalled()
    await app.navigate('/models')
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it('清空已有内容仍是未保存修改，不能因值为空而切页刷新', async () => {
    const app = boot()
    const field = editInput(app, '已有内容')
    field.value = ''
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await app.guard.check()
    await app.navigate('/docs')
    expect(app.replace).not.toHaveBeenCalled()
  })

  it('可见弹窗阻止切页刷新，关闭后也不会补刷新', async () => {
    const app = boot()
    const dialog = app.doc.createElement('section')
    dialog.setAttribute('role', 'dialog')
    let visible = true
    dialog.getClientRects = () => (visible ? [new DOMRect()] : []) as unknown as DOMRectList
    app.doc.body.append(dialog)
    const field = app.doc.createElement('input')
    dialog.append(field)
    field.value = '弹窗草稿'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await app.guard.check()
    await app.navigate('/docs')
    expect(app.replace).not.toHaveBeenCalled()
    visible = false
    await vi.advanceTimersByTimeAsync(60_000)
    expect(app.replace).not.toHaveBeenCalled()
    await app.navigate('/models')
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it('业务管理的已保存输入不重复成为草稿，焦点仍受保护', async () => {
    const app = boot()
    const field = app.doc.createElement('input')
    field.setAttribute('data-build-update-managed', '')
    app.doc.body.append(field)
    field.value = '已经保存'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    Object.defineProperty(app.doc, 'activeElement', { configurable: true, value: field })
    await app.guard.check()
    await app.navigate('/docs')
    expect(app.replace).not.toHaveBeenCalled()
    Object.defineProperty(app.doc, 'activeElement', { configurable: true, value: app.doc.body })
    await vi.advanceTimersByTimeAsync(2_000)
    expect(app.replace).not.toHaveBeenCalled()
    await app.navigate('/models')
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it.each(['focus', 'pageshow', 'online'])('%s 只探测，不会自动刷新', async event => {
    const app = boot()
    await app.guard.check()
    await vi.advanceTimersByTimeAsync(30_001)
    app.win.dispatchEvent(new Event(event))
    await app.guard.check()
    expect(app.request).toHaveBeenCalledTimes(2)
    expect(app.replace).not.toHaveBeenCalled()
  })

  it('后台不检查，恢复前台也不刷新', async () => {
    const app = boot()
    await app.guard.check()
    Object.defineProperty(app.doc, 'visibilityState', { configurable: true, value: 'hidden' })
    await vi.advanceTimersByTimeAsync(60_001)
    await app.navigate('/docs')
    expect(app.request).toHaveBeenCalledTimes(1)
    expect(app.replace).not.toHaveBeenCalled()
    Object.defineProperty(app.doc, 'visibilityState', { configurable: true, value: 'visible' })
    app.doc.dispatchEvent(new Event('visibilitychange'))
    await app.guard.check()
    expect(app.request).toHaveBeenCalledTimes(2)
    expect(app.replace).not.toHaveBeenCalled()
    await app.navigate('/models')
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it.each(['/weixin/callback', '/?code=one-time&state=opaque'])('授权回调不检查、不刷新：%s', async path => {
    const app = boot({ url: 'https://example.test' + path })
    await app.guard.routeChanged()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(app.request).not.toHaveBeenCalled()
    expect(app.replace).not.toHaveBeenCalled()
    expect(app.guard.pendingVersion).toBe('')
  })

  it('探针返回前进入授权回调，不能重载一次性授权码', async () => {
    const response = delayedFetch()
    const app = boot({ fetch: response.request })
    const navigation = app.navigate('/docs')
    await vi.advanceTimersByTimeAsync(100)
    app.location.href = 'https://example.test/weixin/callback?code=once&state=state'
    response.respond()
    await navigation
    expect(app.replace).not.toHaveBeenCalled()
    expect(app.guard.pendingVersion).toBe('')
  })

  it('等待切页期间版本回退为当前版本，不再刷新', async () => {
    const request = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ version: 'build-new' }) })
      .mockResolvedValue({ ok: true, json: async () => ({ version: 'build-old' }) })
    const app = boot({ fetch: request })
    await app.guard.check()
    await vi.advanceTimersByTimeAsync(30_000)
    await app.navigate('/docs')
    expect(app.guard.pendingVersion).toBe('')
    expect(app.replace).not.toHaveBeenCalled()
  })

  it('离线、失败或无效探针保留页面，下次检查恢复后切页可更新', async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ version: '<html>' }) })
      .mockResolvedValue({ ok: true, json: async () => ({ version: 'build-new' }) })
    const app = boot({ fetch: request })
    await app.guard.check()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(app.guard.pendingVersion).toBe('build-new')
    expect(app.replace).not.toHaveBeenCalled()
    await app.navigate('/docs')
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it('探针超时释放在途锁，不打断页面，后续检查可以继续', async () => {
    const request = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('timeout')))
    })) as unknown as typeof fetch
    const app = boot({ fetch: request })
    await vi.advanceTimersByTimeAsync(38_001)
    expect(request).toHaveBeenCalledTimes(2)
    expect(app.replace).not.toHaveBeenCalled()
  })

  it('缓存异常时按版本对冷却，冷却结束也只能在下一次切页尝试', async () => {
    window.sessionStorage.setItem('token-nx:build-guard', JSON.stringify({ from: 'build-old', to: 'build-new', at: Date.now() }))
    const app = boot()
    await app.guard.check()
    await app.navigate('/docs')
    expect(app.replace).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_001)
    expect(app.replace).not.toHaveBeenCalled()
    await app.navigate('/models')
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it.each(['build-old', JSON.stringify({ from: 'build-old', to: 'build-other', at: 0 })])('旧标记不永久阻止切页更新：%s', async record => {
    window.sessionStorage.setItem('token-nx:build-guard', record)
    const app = boot()
    await app.guard.check()
    await app.navigate('/docs')
    expect(app.replace).toHaveBeenCalledTimes(1)
  })

  it('存储被禁用时使用 URL 冷却；页面首次加载不会二次刷新', async () => {
    const storage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } } as unknown as Storage
    const first = boot({ storage })
    await first.guard.check()
    await first.navigate('/docs')
    const next = boot({ storage, url: first.replace.mock.calls[0][0] })
    await next.guard.routeChanged()
    await next.navigate('/models' + next.location.search)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(next.replace).not.toHaveBeenCalled()
  })
})
