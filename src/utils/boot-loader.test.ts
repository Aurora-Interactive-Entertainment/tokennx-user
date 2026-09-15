import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { releaseBootLoader } from './boot-loader'

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = '<div id="boot-loader"><span>Loading</span></div>'
  document.documentElement.classList.remove('app-ready')
})
afterEach(() => {
  vi.runAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('首屏加载层收尾', () => {
  it('重复通知只创建一个兜底计时器，1500ms 后移除加载层', () => {
    releaseBootLoader()
    releaseBootLoader()
    expect(vi.getTimerCount()).toBe(1)
    expect(document.documentElement.classList.contains('app-ready')).toBe(true)
    vi.advanceTimersByTime(1499)
    expect(document.getElementById('boot-loader')).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(document.getElementById('boot-loader')).toBeNull()
  })

  it('只在加载层自身的 opacity 过渡结束时移除，忽略子元素冒泡', () => {
    releaseBootLoader()
    const loader = document.getElementById('boot-loader')!
    const end = new Event('transitionend', { bubbles: true })
    Object.defineProperty(end, 'propertyName', { value: 'opacity' })
    loader.querySelector('span')!.dispatchEvent(end)
    expect(loader.isConnected).toBe(true)
    loader.dispatchEvent(end)
    expect(loader.isConnected).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('后台返回前台时直接完成清理，不依赖被冻结的动画', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    releaseBootLoader()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(document.getElementById('boot-loader')).not.toBeNull()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(document.getElementById('boot-loader')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})
