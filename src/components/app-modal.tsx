import { useLayoutEffect, useRef } from 'react'
import SemiModal, { type ModalReactProps } from '@douyinfe/semi-ui/lib/es/modal'
import './app-modal.css'

const defaultModalContainer = () => document.getElementById('app-mount') ?? document.body

/**
 * 中文：提供应用标准弹窗的公共行为，并在弹窗开关时保持页面原有滚动位置。
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

    // 中文：等待 Semi 完成 body 滚动锁更新后再恢复页面锚点，避免弹窗出现时页面跳动。
    if (props.visible) schedule()
    // 中文：Semi 在关闭动画结束后释放滚动锁，因此延迟到动画完成后再恢复。
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
  // 中文：标准类负责公共外观，业务类仅用于弹窗宽高和正文内部布局差异。
  const className = ['app-modal', props.className].filter(Boolean).join(' ')
  const modalContentClass = ['app-modal-content', props.modalContentClass].filter(Boolean).join(' ')

  // 中文：所有应用弹窗默认在视口居中，并统一阻止背景页面滚动。
  return (
    <SemiModal
      {...props}
      className={className}
      modalContentClass={modalContentClass}
      getPopupContainer={getPopupContainer}
      centered
      preventScroll
    />
  )
}
