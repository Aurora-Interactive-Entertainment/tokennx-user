import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SUPPORT_MOBILE_QUERY, SUPPORT_POSITION_KEY } from './use-support-drag'

let useSupportDrag: typeof import('./use-support-drag').useSupportDrag

// jsdom 没有 PointerEvent；补齐浏览器的指针标识，测试真实的 React 事件流。
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number
  readonly isPrimary: boolean
  readonly pointerType: string
  constructor(type: string, options: PointerEventInit = {}) {
    super(type, options)
    this.pointerId = options.pointerId ?? 1
    this.isPrimary = options.isPrimary ?? true
    this.pointerType = options.pointerType ?? 'touch'
  }
}

type TestViewport = EventTarget & { width: number; height: number; offsetLeft: number; offsetTop: number }
let viewport: TestViewport
let mobile: boolean
let media: MediaQueryList

function Harness({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  const { triggerRef, safeAreaRef, buttonProps, panelSide } = useSupportDrag({ onClick, disabled })
  return <div data-testid="widget" data-support-side={panelSide} style={{ position: 'fixed', right: 24, bottom: 24 }}>
    <section data-testid="panel" style={{ position: 'absolute', right: 0, bottom: 100 }}>客服面板</section>
    <span ref={safeAreaRef} style={{ paddingTop: 44, paddingRight: 0, paddingBottom: 34, paddingLeft: 0 }} />
    <div ref={triggerRef} data-testid="trigger"><button {...buttonProps}>客服</button></div>
  </div>
}

function setup(disabled = false) {
  const onClick = vi.fn()
  const view = render(<Harness onClick={onClick} disabled={disabled} />)
  const button = screen.getByRole('button', { name: '客服' })
  const trigger = screen.getByTestId('trigger')
  const pointers = new Set<number>()
  button.setPointerCapture = vi.fn(id => { pointers.add(id) })
  button.hasPointerCapture = vi.fn(id => pointers.has(id))
  button.releasePointerCapture = vi.fn(id => { pointers.delete(id) })
  return { ...view, button, trigger, onClick }
}

function point(trigger: HTMLElement) { return { x: Number.parseFloat(trigger.style.left), y: Number.parseFloat(trigger.style.top) } }
function frame() { act(() => { vi.advanceTimersByTime(20) }) }
function pointer(button: HTMLElement, type: 'down' | 'move' | 'up' | 'cancel' | 'lost', x: number, y: number, extra: PointerEventInit = {}) {
  const options = { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y, ...extra }
  const events = { down: fireEvent.pointerDown, move: fireEvent.pointerMove, up: fireEvent.pointerUp, cancel: fireEvent.pointerCancel, lost: fireEvent.lostPointerCapture }
  events[type](button, options)
}
function drag(button: HTMLElement, trigger: HTMLElement, dx: number, dy: number) {
  const start = point(trigger)
  pointer(button, 'down', start.x + 20, start.y + 20)
  pointer(button, 'move', start.x + 20 + dx, start.y + 20 + dy)
  frame()
  pointer(button, 'up', start.x + 20 + dx, start.y + 20 + dy)
}
function tap(button: HTMLElement, trigger: HTMLElement) {
  const start = point(trigger)
  pointer(button, 'down', start.x + 20, start.y + 20)
  pointer(button, 'up', start.x + 20, start.y + 20)
  fireEvent.click(button, { detail: 1 })
}
function expectInside(trigger: HTMLElement) {
  const current = point(trigger)
  expect(current.x).toBeGreaterThanOrEqual(viewport.offsetLeft + 12)
  expect(current.x + 47).toBeLessThanOrEqual(viewport.offsetLeft + viewport.width - 12)
  expect(current.y).toBeGreaterThanOrEqual(viewport.offsetTop + 44 + 12)
  expect(current.y + 88).toBeLessThanOrEqual(viewport.offsetTop + viewport.height - 34 - 12)
}

beforeEach(async () => {
  // 每个用例使用独立的会话内位置缓存，存储异常测试不能污染后续挂载。
  vi.resetModules()
  useSupportDrag = (await import('./use-support-drag')).useSupportDrag
  vi.useFakeTimers()
  mobile = true
  viewport = Object.assign(new EventTarget(), { width: 390, height: 844, offsetLeft: 0, offsetTop: 0 })
  vi.stubGlobal('visualViewport', viewport)
  vi.stubGlobal('PointerEvent', TestPointerEvent)
  const target = new EventTarget()
  media = Object.assign(target, { media: SUPPORT_MOBILE_QUERY, onchange: null, addListener: vi.fn(), removeListener: vi.fn() }) as unknown as MediaQueryList
  Object.defineProperty(media, 'matches', { get: () => mobile })
  vi.spyOn(window, 'matchMedia').mockReturnValue(media)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => window.setTimeout(() => callback(performance.now()), 16))
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => window.clearTimeout(id))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const trigger = this.dataset.testid === 'trigger' ? this : this.closest<HTMLElement>('[data-testid="trigger"]')
    return new DOMRect(Number.parseFloat(trigger?.style.left ?? '') || 319, Number.parseFloat(trigger?.style.top ?? '') || 732, 47, 88)
  })
  localStorage.setItem(SUPPORT_POSITION_KEY, JSON.stringify({ version: 1, edge: 'right', ratio: 0.5 }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.removeItem(SUPPORT_POSITION_KEY)
  vi.useRealTimers()
})

describe('移动端客服入口手势', () => {
  it('轻触及阈值内手抖照常打开，不写入位置', () => {
    const { button, trigger, onClick } = setup()
    const saved = localStorage.getItem(SUPPORT_POSITION_KEY)
    const start = point(trigger)
    pointer(button, 'down', start.x + 20, start.y + 20)
    pointer(button, 'move', start.x + 23, start.y + 22)
    pointer(button, 'up', start.x + 23, start.y + 22)
    fireEvent.click(button, { detail: 1 })
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(point(trigger)).toEqual(start)
    expect(localStorage.getItem(SUPPORT_POSITION_KEY)).toBe(saved)
  })

  it('拖动松手吸附最近边，屏蔽这次兼容点击，下次轻触正常打开', () => {
    const { button, trigger, onClick } = setup()
    drag(button, trigger, -280, -40)
    expect(point(trigger).x).toBe(12)
    expectInside(trigger)
    expect(JSON.parse(localStorage.getItem(SUPPORT_POSITION_KEY)!)).toMatchObject({ version: 1, edge: 'left' })
    fireEvent.click(button, { detail: 1 })
    expect(onClick).not.toHaveBeenCalled()
    tap(button, trigger)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(button.releasePointerCapture).toHaveBeenCalledWith(1)
  })

  it('浏览器没有派发拖动兼容点击时，下次轻触也不会被吞掉', () => {
    const { button, trigger, onClick } = setup()
    drag(button, trigger, -280, 0)
    tap(button, trigger)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('松手吸边后更新面板方向，左右切换后点击仍正常', () => {
    const { button, trigger, onClick } = setup()
    const widget = screen.getByTestId('widget')
    const start = point(trigger)
    expect(widget).toHaveAttribute('data-support-side', 'right')
    pointer(button, 'down', start.x + 20, start.y + 20)
    pointer(button, 'move', start.x - 260, start.y + 20)
    frame()
    expect(widget).toHaveAttribute('data-support-side', 'right')
    pointer(button, 'up', start.x - 260, start.y + 20)
    expect(widget).toHaveAttribute('data-support-side', 'left')
    tap(button, trigger)
    drag(button, trigger, 300, 0)
    expect(widget).toHaveAttribute('data-support-side', 'right')
    tap(button, trigger)
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['top', 100, 66, 'left'],
    ['top', 250, 66, 'right'],
    ['bottom', 100, 700, 'left'],
    ['bottom', 250, 700, 'right'],
  ] as const)('吸附 %s 边 x=%s、y=%s 时从 %s 侧弹出', (edge, x, y, side) => {
    const { button, trigger } = setup()
    const start = point(trigger)
    drag(button, trigger, x - start.x, y - start.y)
    expect(JSON.parse(localStorage.getItem(SUPPORT_POSITION_KEY)!)).toMatchObject({ edge })
    expect(screen.getByTestId('widget')).toHaveAttribute('data-support-side', side)
    expectInside(trigger)
  })

  it('拖动后键盘或辅助技术的点击仍有效', () => {
    const { button, trigger, onClick } = setup()
    drag(button, trigger, -280, 0)
    fireEvent.click(button, { detail: 0 })
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('没有 move 事件时，也按松手坐标识别拖动', () => {
    const { button, trigger, onClick } = setup()
    const start = point(trigger)
    pointer(button, 'down', start.x + 20, start.y + 20)
    pointer(button, 'up', start.x - 250, start.y + 20)
    fireEvent.click(button, { detail: 1 })
    expect(onClick).not.toHaveBeenCalled()
    expect(point(trigger).x).toBe(12)
  })

  it.each(['cancel', 'lost'] as const)('%s 中断后结束拖动，重新点击照常打开', type => {
    const { button, trigger, onClick } = setup()
    const start = point(trigger)
    pointer(button, 'down', start.x + 20, start.y + 20)
    pointer(button, 'move', start.x - 250, start.y + 20)
    pointer(button, type, start.x - 250, start.y + 20)
    expectInside(trigger)
    expect(trigger).not.toHaveAttribute('data-support-dragging')
    tap(button, trigger)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('忽略第二根手指及右键，不让另一指针接管手势', () => {
    const { button, trigger } = setup()
    const start = point(trigger)
    pointer(button, 'down', 20, 20, { isPrimary: false, pointerId: 2 })
    pointer(button, 'move', 200, 200, { isPrimary: false, pointerId: 2 })
    pointer(button, 'up', 200, 200, { isPrimary: false, pointerId: 2 })
    pointer(button, 'down', 20, 20, { button: 2 })
    pointer(button, 'move', 200, 200)
    pointer(button, 'up', 200, 200)
    expect(point(trigger)).toEqual(start)
    pointer(button, 'down', start.x + 20, start.y + 20)
    pointer(button, 'move', 0, 0, { pointerId: 2, isPrimary: false })
    pointer(button, 'up', 0, 0, { pointerId: 2, isPrimary: false })
    expect(point(trigger)).toEqual(start)
    pointer(button, 'up', start.x + 20, start.y + 20)
  })

  it('面板打开或入口禁用期间不拖动，入口定位不会移动面板及外层', () => {
    const { button, trigger, rerender, onClick } = setup()
    drag(button, trigger, -280, 0)
    expect(screen.getByTestId('widget')).toHaveStyle({ position: 'fixed', right: '24px', bottom: '24px' })
    expect(screen.getByTestId('widget').style.left).toBe('')
    expect(screen.getByTestId('panel')).toHaveStyle({ position: 'absolute', right: '0px', bottom: '100px' })
    expect(screen.getByTestId('panel').style.left).toBe('')
    const saved = point(trigger)
    rerender(<Harness onClick={onClick} disabled />)
    drag(button, trigger, 200, 100)
    expect(point(trigger)).toEqual(saved)
  })
})

describe('客服位置恢复与屏幕变化', () => {
  it('切页卸载重挂载及从存储读取时恢复吸边位置', () => {
    const first = setup()
    drag(first.button, first.trigger, -280, 90)
    const saved = point(first.trigger)
    first.unmount()
    const second = setup()
    expect(point(second.trigger)).toEqual(saved)
    expect(screen.getByTestId('widget')).toHaveAttribute('data-support-side', 'left')
    expectInside(second.trigger)
  })

  it.each(['resize', 'orientationchange'])('%s 后按保存比例恢复，始终留在安全区内', event => {
    const { trigger } = setup()
    const saved = localStorage.getItem(SUPPORT_POSITION_KEY)
    viewport.width = 844
    viewport.height = 390
    act(() => { window.dispatchEvent(new Event(event)) })
    frame()
    expect(point(trigger)).toEqual({ x: 785, y: 156 })
    expectInside(trigger)
    expect(localStorage.getItem(SUPPORT_POSITION_KEY)).toBe(saved)
  })

  it('视觉视口缩小及偏移后仍可见，恢复高度时不丢失原始相对位置', () => {
    const { trigger } = setup()
    const original = point(trigger)
    const saved = localStorage.getItem(SUPPORT_POSITION_KEY)
    Object.assign(viewport, { width: 320, height: 400, offsetLeft: 30, offsetTop: 100 })
    act(() => { viewport.dispatchEvent(new Event('resize')); viewport.dispatchEvent(new Event('scroll')) })
    frame()
    expectInside(trigger)
    expect(point(trigger)).toEqual({ x: 291, y: 261 })
    Object.assign(viewport, { width: 390, height: 844, offsetLeft: 0, offsetTop: 0 })
    act(() => { viewport.dispatchEvent(new Event('resize')) })
    frame()
    expect(point(trigger)).toEqual(original)
    expect(localStorage.getItem(SUPPORT_POSITION_KEY)).toBe(saved)
  })

  it('切到桌面移除拖动定位，点击不变；回到移动端继续恢复保存位置', () => {
    const { button, trigger, onClick } = setup()
    drag(button, trigger, -280, 0)
    const saved = point(trigger)
    mobile = false
    act(() => { media.dispatchEvent(new Event('change')) })
    frame()
    expect(trigger.style.left).toBe('')
    expect(trigger.style.top).toBe('')
    expect(trigger).not.toHaveAttribute('data-support-mobile')
    expect(screen.getByTestId('widget')).not.toHaveAttribute('data-support-side')
    pointer(button, 'down', 20, 20, { pointerType: 'mouse' })
    pointer(button, 'move', 200, 200, { pointerType: 'mouse' })
    pointer(button, 'up', 200, 200, { pointerType: 'mouse' })
    fireEvent.click(button, { detail: 1 })
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(trigger.style.left).toBe('')
    mobile = true
    act(() => { media.dispatchEvent(new Event('change')) })
    frame()
    expect(point(trigger)).toEqual(saved)
    expect(screen.getByTestId('widget')).toHaveAttribute('data-support-side', 'left')
  })

  it('桌面首次挂载不使用保存的移动端定位', () => {
    mobile = false
    const { button, trigger, onClick } = setup()
    expect(trigger.style.left).toBe('')
    expect(trigger.style.top).toBe('')
    expect(screen.getByTestId('widget')).not.toHaveAttribute('data-support-side')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(window.matchMedia).toHaveBeenCalledWith(SUPPORT_MOBILE_QUERY)
  })

  it('损坏的位置存储安全回退，仍能拖动和点击', () => {
    localStorage.setItem(SUPPORT_POSITION_KEY, '{broken')
    const { button, trigger, onClick } = setup()
    expectInside(trigger)
    drag(button, trigger, -280, -100)
    tap(button, trigger)
    expect(onClick).toHaveBeenCalledTimes(1)
    expectInside(trigger)
  })

  it('存储读取或写入被浏览器拒绝不阻断手势和点击', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'QuotaExceededError') })
    const { button, trigger, onClick } = setup()
    expectInside(trigger)
    drag(button, trigger, -280, -100)
    tap(button, trigger)
    expect(onClick).toHaveBeenCalledTimes(1)
    expectInside(trigger)
  })

  it('写入失败但旧位置仍可读取时，切页重挂优先恢复最新会话位置', () => {
    const stalePosition = localStorage.getItem(SUPPORT_POSITION_KEY)
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError') })
    const first = setup()
    drag(first.button, first.trigger, -280, 90)
    const latestPoint = point(first.trigger)
    expect(latestPoint.x).toBe(12)
    expect(localStorage.getItem(SUPPORT_POSITION_KEY)).toBe(stalePosition)
    first.unmount()

    const second = setup()
    expect(point(second.trigger)).toEqual(latestPoint)
    tap(second.button, second.trigger)
    expect(second.onClick).toHaveBeenCalledTimes(1)

    // 存储恢复后下一次拖动正常持久化，不长期依赖会话内回退。
    write.mockRestore()
    drag(second.button, second.trigger, 290, -70)
    const recoveredPoint = point(second.trigger)
    expect(JSON.parse(localStorage.getItem(SUPPORT_POSITION_KEY)!)).toMatchObject({ edge: 'right' })
    second.unmount()
    expect(point(setup().trigger)).toEqual(recoveredPoint)
  })

  it('卸载时释放捕获并清理动画与视口监听', () => {
    const { button, trigger, unmount } = setup()
    const start = point(trigger)
    pointer(button, 'down', start.x + 20, start.y + 20)
    pointer(button, 'move', start.x - 200, start.y + 20)
    const removeViewport = vi.spyOn(viewport, 'removeEventListener')
    unmount()
    expect(button.releasePointerCapture).toHaveBeenCalledWith(1)
    expect(removeViewport).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(removeViewport).toHaveBeenCalledWith('scroll', expect.any(Function))
    act(() => { vi.runOnlyPendingTimers() })
    expect(vi.getTimerCount()).toBe(0)
  })
})
