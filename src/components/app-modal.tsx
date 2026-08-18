import { useLayoutEffect, useRef } from 'react'
import SemiModal, { type ModalReactProps } from '@douyinfe/semi-ui/lib/es/modal'

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
    if (!props.visible || !openingScrollPosition.current) return
    if (document.documentElement.scrollHeight <= document.documentElement.clientHeight) return

    const { left, top } = openingScrollPosition.current
    const root = document.documentElement
    const previousScrollBehavior = root.style.scrollBehavior
    root.style.scrollBehavior = 'auto'
    window.scrollTo({ left, top, behavior: 'instant' as ScrollBehavior })
    const frame = window.requestAnimationFrame(() => {
      root.style.scrollBehavior = previousScrollBehavior
    })
    return () => window.cancelAnimationFrame(frame)
  }, [props.visible])

  return <SemiModal {...props} preventScroll />
}
