import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ActivityTicker from './activity-ticker'

const GROUP_WIDTH = 300
const VIEWPORT_WIDTH = 800

// jsdom 没有 ResizeObserver；组件只用它触发重新测量，测试里补一个空实现。
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// jsdom 不做布局，给一个确定的组宽和视口宽，让组件走到真实的测量分支。
function stubLayout() {
  const originalRect = Element.prototype.getBoundingClientRect
  const originalClientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')
  Element.prototype.getBoundingClientRect = function () {
    return { width: GROUP_WIDTH } as DOMRect
  }
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => VIEWPORT_WIDTH })
  return () => {
    Element.prototype.getBoundingClientRect = originalRect
    if (originalClientWidth) Object.defineProperty(Element.prototype, 'clientWidth', originalClientWidth)
  }
}

afterEach(cleanup)

describe('购买动态跑马灯', () => {
  it('没有记录时整行不渲染', () => {
    const { container } = render(<ActivityTicker label="购买动态" messages={[]} />)
    expect(container.querySelector('.purchase-activity')).toBeNull()
  })

  it('只有一条记录、且宽度没超出视口时仍然滚动', () => {
    const restore = stubLayout()
    try {
      const { container } = render(
        <ActivityTicker label="购买动态" messages={[<span key="only">157****0607 开通了套餐</span>]} />,
      )
      const track = container.querySelector('.activity-ticker-track')
      expect(track?.className).toContain('is-scrolling')
      // 复制多份铺满视口，单条记录才能无缝循环。
      expect(container.querySelectorAll('.activity-ticker-group').length).toBeGreaterThan(1)
    } finally {
      restore()
    }
  })
})
