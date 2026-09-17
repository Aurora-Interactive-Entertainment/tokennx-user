import type { ReactNode } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppModal from './app-modal'

// 此处只验证公共页面样式的生命周期，业务关闭交互由真实 Modal 的页面用例覆盖。
vi.mock('@douyinfe/semi-ui/lib/es/modal', () => ({ default: ({ visible, children }: { visible: boolean; children: ReactNode }) => visible ? <div role="dialog">{children}</div> : null }))

let frames: Map<number, FrameRequestCallback>
let sequence = 0

function nextFrame() {
  act(() => {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach((callback) => callback(0))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  frames = new Map()
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++sequence, callback)
    return sequence
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id) })
})

afterEach(() => {
  cleanup()
  document.documentElement.style.removeProperty('scroll-behavior')
  document.documentElement.style.removeProperty('--modal-page-width')
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('AppModal 页面样式恢复', () => {
  it.each(['unmount', 'close'] as const)('恢复帧执行前 %s 仍还原原始滚动样式', (action) => {
    document.documentElement.style.setProperty('scroll-behavior', 'smooth', 'important')
    const view = render(<AppModal visible>内容</AppModal>)
    nextFrame()
    nextFrame()
    expect(document.documentElement.style.scrollBehavior).toBe('auto')
    if (action === 'unmount') view.unmount()
    else {
      view.rerender(<AppModal visible={false}>内容</AppModal>)
      act(() => { vi.advanceTimersByTime(180) })
      nextFrame()
      nextFrame()
      nextFrame()
    }
    expect(document.documentElement.style.scrollBehavior).toBe('smooth')
    expect(document.documentElement.style.getPropertyPriority('scroll-behavior')).toBe('important')
  })

  it('嵌套弹窗关闭后保留首个弹窗的页面宽度，全部关闭后恢复原值', () => {
    document.documentElement.style.setProperty('--modal-page-width', '80vw')
    const measure = vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({ width: 1185 } as DOMRect)
    const view = render(<><AppModal visible>支付</AppModal><AppModal visible={false}>协议</AppModal></>)
    expect(document.documentElement.style.getPropertyValue('--modal-page-width')).toBe('1185px')
    measure.mockReturnValue({ width: 1200 } as DOMRect)
    view.rerender(<><AppModal visible>支付</AppModal><AppModal visible>协议</AppModal></>)
    view.rerender(<><AppModal visible>支付</AppModal><AppModal visible={false}>协议</AppModal></>)
    expect(document.documentElement.style.getPropertyValue('--modal-page-width')).toBe('1185px')
    view.unmount()
    expect(document.documentElement.style.getPropertyValue('--modal-page-width')).toBe('80vw')
  })

  it('同时关闭多个弹窗不会把临时 auto 当成原始滚动样式', () => {
    const view = render(<><AppModal visible>支付</AppModal><AppModal visible>协议</AppModal></>)
    nextFrame()
    nextFrame()
    view.unmount()
    expect(document.documentElement.style.scrollBehavior).toBe('')
    expect(document.documentElement.style.getPropertyValue('--modal-page-width')).toBe('')
  })
})
