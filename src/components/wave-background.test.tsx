import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WaveBackground } from './wave-background'

// 引擎是自调度的 requestAnimationFrame 循环，用假定时器避免它跑到用例之外。
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('波浪背景', () => {
  it('启动后标记 is-ready，并把曲线路径与光晕位置写进 SVG', () => {
    const { container } = render(<WaveBackground />)
    const root = container.querySelector('.wave-background')
    expect(root).toHaveClass('is-ready')

    // 曲线由脚本写入；为空说明引擎没跑起来，只会剩一张静态渐变。
    for (const part of ['violet', 'warm', 'cool', 'mist']) {
      expect(root?.querySelector(`[data-part="${part}"]`)?.getAttribute('d'), part).toBeTruthy()
    }
    expect(root?.querySelector('[data-part="sky"]')?.getAttribute('cx')).toBeTruthy()
    expect(root?.querySelector('[data-part="orange"]')?.getAttribute('cx')).toBeTruthy()
  })

  it('同时挂多个实例时 SVG 的 defs id 互不冲突', () => {
    const { container } = render(<><WaveBackground /><WaveBackground /></>)
    const ids = [...container.querySelectorAll('linearGradient, radialGradient, filter')].map((element) => element.id)
    expect(ids.length).toBeGreaterThan(0)
    // id 撞车会让 url(#…) 全解析到第一个实例身上。
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('SVG 里的 url(#…) 引用都能解析到本实例自己的元素', () => {
    const { container } = render(<WaveBackground />)
    const root = container.querySelector('.wave-background')
    const refs = [...root!.querySelectorAll('*')]
      .flatMap((element) => [...element.attributes])
      .map((attribute) => attribute.value)
      .filter((value) => value.startsWith('url(#'))
      .map((value) => value.slice(5, -1))
    expect(refs.length).toBeGreaterThan(0)
    // id 被前缀化后引用必须同步，否则渐变和模糊滤镜会全部失效、只剩底色。
    for (const ref of refs) expect(container.querySelector(`[id="${ref}"]`), ref).not.toBeNull()
  })

  it('作为装饰层对读屏隐藏，不抢外层 role=status 的可访问名', () => {
    const { container } = render(<WaveBackground />)
    expect(container.querySelector('.wave-background')).toHaveAttribute('aria-hidden', 'true')
  })
})
