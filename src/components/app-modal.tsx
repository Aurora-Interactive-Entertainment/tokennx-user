import { useLayoutEffect, useRef } from 'react'
import SemiModal, { type ModalReactProps } from '@douyinfe/semi-ui/lib/es/modal'

const defaultModalContainer = () => document.getElementById('app-mount') ?? document.body

/**
 * Shared modal defaults for the application shell. Preventing focus-driven
 * scrolling keeps the underlying console at its current position when a
 * dialog opens after the user has scrolled the page.
 */
export default function AppModal(props: ModalReactProps) {
  const openingScrollPosition = useRef<{ left: number; top: number } | null>(null)
  const wasVisible = useRef(false)

  if (props.visible && !wasVisible.current && typeof window !== 'undefined') {
    openingScrollPosition.current = { left: window.scrollX, top: window.scrollY }
  }
  wasVisible.current = Boolean(props.visible)

  useLayoutEffect(() => {
    const position = openingScrollPosition.current
    if (!position || typeof window === 'undefined') return

    let frameOne = 0
    let frameTwo = 0
    let timer = 0
    const restore = () => {
      const root = document.documentElement
      const previousScrollBehavior = root.style.scrollBehavior
      root.style.scrollBehavior = 'auto'
      window.scrollTo({ left: position.left, top: position.top, behavior: 'instant' as ScrollBehavior })
      frameTwo = window.requestAnimationFrame(() => {
        root.style.scrollBehavior = previousScrollBehavior
        if (!props.visible) openingScrollPosition.current = null
      })
    }
    const schedule = () => {
      frameOne = window.requestAnimationFrame(() => {
        frameTwo = window.requestAnimationFrame(restore)
      })
    }

    // Semi toggles body overflow during its mount/update lifecycle. Waiting a
    // pair of frames lets that change settle before restoring the page anchor.
    if (props.visible) schedule()
    // Semi releases body scroll after its close transition (120ms).
    else timer = window.setTimeout(schedule, 180)

    return () => {
      window.clearTimeout(timer)
      window.cancelAnimationFrame(frameOne)
      window.cancelAnimationFrame(frameTwo)
    }
  }, [props.visible])

  useLayoutEffect(() => {
    if (!props.visible || typeof document === 'undefined') return
    const pageWidth = document.body.getBoundingClientRect().width
    document.documentElement.style.setProperty('--modal-page-width', `${pageWidth}px`)
    return () => {
      document.documentElement.style.removeProperty('--modal-page-width')
    }
  }, [props.visible])

  const getPopupContainer = props.getPopupContainer ?? defaultModalContainer

  // Every application dialog uses the same viewport-centred layout. Keeping
  // this default here prevents individual pages from drifting back to Semi's
  // top-aligned modal behavior.
  return <SemiModal {...props} getPopupContainer={getPopupContainer} centered preventScroll />
}
