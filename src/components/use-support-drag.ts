import { useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { clampSupportPoint, getSupportBounds, parseSupportPosition, restoreSupportPoint, snapSupportPoint, type DragBounds, type DragPoint, type SupportPosition } from './support-drag-position'
import './support-drag.css'

export const SUPPORT_POSITION_KEY = 'token-nx:support-position:v1'
export const SUPPORT_MOBILE_QUERY = '(max-width: 720px), (max-width: 1024px) and (max-height: 480px) and (orientation: landscape)'
const DRAG_THRESHOLD = 6
const SNAP_DURATION = 280
let memoryPosition: SupportPosition | null = null
let positionWriteFailed = false

type Gesture = { pointerId: number; startX: number; startY: number; origin: DragPoint; dragged: boolean; target: HTMLButtonElement }

function readPosition(): SupportPosition | null {
  if (positionWriteFailed && memoryPosition) return memoryPosition
  try { return parseSupportPosition(window.localStorage.getItem(SUPPORT_POSITION_KEY)) ?? (positionWriteFailed ? memoryPosition : null) }
  catch { return memoryPosition }
}

function savePosition(position: SupportPosition): void {
  memoryPosition = position
  try { window.localStorage.setItem(SUPPORT_POSITION_KEY, JSON.stringify(position)); positionWriteFailed = false }
  catch { positionWriteFailed = true /* 只写入失败时，也要在本次会话的切页重挂后保留位置。 */ }
}

export function useSupportDrag({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  const [panelSide, setPanelSide] = useState<'left' | 'right'>()
  const triggerRef = useRef<HTMLDivElement>(null)
  const safeAreaRef = useRef<HTMLSpanElement>(null)
  const enabledRef = useRef(false)
  const disabledRef = useRef(disabled)
  const onClickRef = useRef(onClick)
  disabledRef.current = disabled
  onClickRef.current = onClick
  const gestureRef = useRef<Gesture | null>(null)
  const pointRef = useRef<DragPoint>({ x: 0, y: 0 })
  const boundsRef = useRef<DragBounds>({ left: 0, right: 0, top: 0, bottom: 0 })
  const positionRef = useRef<SupportPosition | null>(null)
  const paintFrameRef = useRef<number | null>(null)
  const snapTimerRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)

  function syncPanelSide(): void {
    // 顶部或底部吸边时，也按悬浮球所在的左右半屏决定面板展开方向。
    const { left, right } = boundsRef.current
    setPanelSide(pointRef.current.x < (left + right) / 2 ? 'left' : 'right')
  }

  function stopSnap(): void {
    if (snapTimerRef.current !== null) window.clearTimeout(snapTimerRef.current)
    snapTimerRef.current = null
    triggerRef.current?.removeAttribute('data-support-snapping')
  }

  function paint(): void {
    const node = triggerRef.current
    if (!node) return
    node.style.left = `${pointRef.current.x}px`
    node.style.top = `${pointRef.current.y}px`
  }

  function flushPaint(): void {
    if (paintFrameRef.current !== null) window.cancelAnimationFrame(paintFrameRef.current)
    paintFrameRef.current = null
    paint()
  }

  function releasePointer(gesture: Gesture): void {
    try {
      if (gesture.target.hasPointerCapture?.(gesture.pointerId)) gesture.target.releasePointerCapture(gesture.pointerId)
    } catch { /* 旋转、切页或浏览器取消手势时，指针可能已经释放。 */ }
  }

  function finishGesture(animate: boolean): void {
    const gesture = gestureRef.current
    if (!gesture) return
    gestureRef.current = null
    if (gesture.dragged) {
      suppressClickRef.current = true
      flushPaint()
      const snapped = snapSupportPoint(pointRef.current, boundsRef.current)
      positionRef.current = snapped.position
      savePosition(snapped.position)
      const node = triggerRef.current
      // 先固定松手时的位置，再开启吸边过渡，避免同帧样式合并导致瞬移。
      if (animate && node) {
        void node.offsetWidth
        node.setAttribute('data-support-snapping', '')
        snapTimerRef.current = window.setTimeout(stopSnap, SNAP_DURATION)
      }
      node?.removeAttribute('data-support-dragging')
      pointRef.current = snapped.point
      syncPanelSide()
      paint()
    }
    releasePointer(gesture)
  }

  useLayoutEffect(() => {
    const node = triggerRef.current
    if (!node) return
    const media = window.matchMedia(SUPPORT_MOBILE_QUERY)
    let viewportFrame: number | null = null
    positionRef.current = readPosition()

    function updateViewport(): void {
      viewportFrame = null
      finishGesture(false)
      stopSnap()
      const enabled = media.matches
      enabledRef.current = enabled
      if (!enabled) {
        setPanelSide(undefined)
        node!.removeAttribute('data-support-mobile')
        node!.removeAttribute('data-support-dragging')
        node!.style.removeProperty('left')
        node!.style.removeProperty('top')
        return
      }
      const button = node!.querySelector('button')
      if (!button) return
      const rect = button.getBoundingClientRect()
      const viewport = window.visualViewport
      const safeStyle = safeAreaRef.current ? window.getComputedStyle(safeAreaRef.current) : null
      const inset = (property: 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft') => Math.max(0, Number.parseFloat(safeStyle?.[property] ?? '0') || 0)
      boundsRef.current = getSupportBounds({
        left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0,
        width: viewport?.width ?? (document.documentElement.clientWidth || window.innerWidth),
        height: viewport?.height ?? window.innerHeight,
      }, { width: button.offsetWidth || rect.width || 47, height: button.offsetHeight || rect.height || 47 }, {
        top: inset('paddingTop'), right: inset('paddingRight'), bottom: inset('paddingBottom'), left: inset('paddingLeft'),
      })
      if (!positionRef.current) positionRef.current = snapSupportPoint({ x: rect.left, y: rect.top }, boundsRef.current).position
      // 视口变化只重投影，不把键盘弹起时的临时高度写成新的永久位置。
      pointRef.current = restoreSupportPoint(positionRef.current, boundsRef.current)
      syncPanelSide()
      node!.setAttribute('data-support-mobile', '')
      flushPaint()
    }

    function scheduleViewport(): void {
      if (viewportFrame === null) viewportFrame = window.requestAnimationFrame(updateViewport)
    }

    updateViewport()
    media.addEventListener('change', scheduleViewport)
    window.addEventListener('resize', scheduleViewport)
    window.addEventListener('orientationchange', scheduleViewport)
    window.visualViewport?.addEventListener('resize', scheduleViewport)
    window.visualViewport?.addEventListener('scroll', scheduleViewport)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleViewport)
    const button = node.querySelector('button')
    if (button) observer?.observe(button)
    return () => {
      media.removeEventListener('change', scheduleViewport)
      window.removeEventListener('resize', scheduleViewport)
      window.removeEventListener('orientationchange', scheduleViewport)
      window.visualViewport?.removeEventListener('resize', scheduleViewport)
      window.visualViewport?.removeEventListener('scroll', scheduleViewport)
      observer?.disconnect()
      if (viewportFrame !== null) window.cancelAnimationFrame(viewportFrame)
      if (paintFrameRef.current !== null) window.cancelAnimationFrame(paintFrameRef.current)
      paintFrameRef.current = null
      stopSnap()
      const gesture = gestureRef.current
      gestureRef.current = null
      if (gesture) releasePointer(gesture)
      node.removeAttribute('data-support-mobile')
      node.removeAttribute('data-support-dragging')
      node.style.removeProperty('left')
      node.style.removeProperty('top')
    }
  }, [])

  useLayoutEffect(() => { if (disabled) { finishGesture(false); stopSnap() } }, [disabled])

  function onPointerDown(event: PointerEvent<HTMLButtonElement>): void {
    // 新一轮按下清除上次拖动留下的兼容 click，随后轻触可立即正常打开。
    if (event.isPrimary === false || event.button !== 0 || gestureRef.current) return
    suppressClickRef.current = false
    if (!enabledRef.current || disabledRef.current) return
    const node = triggerRef.current!
    const rect = node.getBoundingClientRect()
    // 仅打断吸边时读取过渡中的坐标；原开合缩放不应改变拖动起点。
    const origin = node.hasAttribute('data-support-snapping') ? { x: rect.left, y: rect.top } : pointRef.current
    stopSnap()
    pointRef.current = clampSupportPoint(origin, boundsRef.current)
    flushPaint()
    gestureRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: pointRef.current, dragged: false, target: event.currentTarget }
    try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch { /* 不支持指针捕获时仍保留按钮内的点击。 */ }
  }

  function movePointer(event: PointerEvent<HTMLButtonElement>): void {
    const gesture = gestureRef.current
    if (!gesture || event.pointerId !== gesture.pointerId) return
    const dx = event.clientX - gesture.startX, dy = event.clientY - gesture.startY
    if (!gesture.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    gesture.dragged = true
    event.preventDefault()
    triggerRef.current?.setAttribute('data-support-dragging', '')
    pointRef.current = clampSupportPoint({ x: gesture.origin.x + dx, y: gesture.origin.y + dy }, boundsRef.current)
    if (paintFrameRef.current === null) paintFrameRef.current = window.requestAnimationFrame(() => { paintFrameRef.current = null; paint() })
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>): void {
    if (gestureRef.current?.pointerId !== event.pointerId) return
    movePointer(event)
    if (gestureRef.current?.dragged) event.preventDefault()
    finishGesture(true)
  }

  function onPointerCancel(event: PointerEvent<HTMLButtonElement>): void {
    if (gestureRef.current?.pointerId === event.pointerId) finishGesture(true)
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    // 键盘/辅助技术产生 detail=0 的点击不属于拖动后的浏览器兼容点击。
    const nativePointer = event.nativeEvent as globalThis.PointerEvent
    if (suppressClickRef.current && (event.detail !== 0 || Boolean(nativePointer.pointerType))) {
      suppressClickRef.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    suppressClickRef.current = false
    stopSnap()
    onClickRef.current()
  }

  return { triggerRef, safeAreaRef, panelSide, buttonProps: {
    onPointerDown, onPointerMove: movePointer, onPointerUp, onPointerCancel, onLostPointerCapture: onPointerCancel,
    onClick: handleClick,
    onContextMenu: (event: MouseEvent<HTMLButtonElement>) => { if (enabledRef.current) event.preventDefault() },
  } }
}
