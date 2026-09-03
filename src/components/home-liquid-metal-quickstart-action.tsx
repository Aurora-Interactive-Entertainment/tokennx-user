import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { LoginRequiredAction } from '@/components/common'
import { HomeQuickstartIconRotator } from '@/components/home-quickstart-icon-rotator'
import './home-liquid-metal-quickstart-action.css'

type LiquidMessage =
  | { type: 'liquid-metal-action'; kind: 'hover' | 'press' | 'focus'; value: boolean }
  | { type: 'liquid-metal-action'; kind: 'pointer' | 'ripple'; x: number; y: number }

type HomeLiquidMetalQuickstartActionProps = {
  children: ReactNode
  returnPath: string
}

export function HomeLiquidMetalQuickstartAction({ children, returnPath }: HomeLiquidMetalQuickstartActionProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const stateRef = useRef({ hover: false, press: false, focus: false })

  const post = useCallback((message: LiquidMessage) => {
    iframeRef.current?.contentWindow?.postMessage(message, '*')
  }, [])

  const sync = useCallback(() => {
    const state = stateRef.current
    post({ type: 'liquid-metal-action', kind: 'hover', value: state.hover || state.focus || state.press })
    post({ type: 'liquid-metal-action', kind: 'focus', value: state.focus })
    post({ type: 'liquid-metal-action', kind: 'press', value: state.press })
  }, [post])

  useEffect(() => {
    // 中文：指针移出按钮后仍监听释放，避免按压状态因事件落在窗口外而卡住。
    const releaseFromWindow = () => {
      if (!stateRef.current.press) return
      stateRef.current.press = false
      sync()
    }
    window.addEventListener('pointerup', releaseFromWindow)
    window.addEventListener('pointercancel', releaseFromWindow)
    return () => {
      window.removeEventListener('pointerup', releaseFromWindow)
      window.removeEventListener('pointercancel', releaseFromWindow)
      stateRef.current = { hover: false, press: false, focus: false }
    }
  }, [sync])

  const localPoint = (event: PointerEvent<HTMLSpanElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: (event.clientX - (rect.left + rect.width / 2)) / rect.height,
      y: (event.clientY - (rect.top + rect.height / 2)) / rect.height,
    }
  }

  const handlePointerEnter = (event: PointerEvent<HTMLSpanElement>) => {
    stateRef.current.hover = true
    sync()
    const point = localPoint(event)
    post({ type: 'liquid-metal-action', kind: 'pointer', ...point })
  }

  const handlePointerLeave = () => {
    stateRef.current.hover = false
    sync()
  }

  const handlePointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    if (!stateRef.current.hover && !stateRef.current.press) return
    post({ type: 'liquid-metal-action', kind: 'pointer', ...localPoint(event) })
  }

  const handlePointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    stateRef.current.press = true
    sync()
    post({ type: 'liquid-metal-action', kind: 'ripple', ...localPoint(event) })
  }

  const releasePointer = () => {
    stateRef.current.press = false
    sync()
  }

  const handleFocus = (event: React.FocusEvent<HTMLSpanElement>) => {
    const target = event.target
    stateRef.current.focus = target instanceof HTMLElement && target.matches(':focus-visible')
    sync()
  }

  const handleBlur = () => {
    stateRef.current.focus = false
    sync()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if ((event.key !== 'Enter' && event.key !== ' ') || event.repeat) return
    stateRef.current.press = true
    sync()
    post({ type: 'liquid-metal-action', kind: 'ripple', x: 0, y: 0 })
  }

  const handleKeyUp = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    releasePointer()
  }

  return (
    <span
      className="home-liquid-metal-quickstart"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={releasePointer}
      onPointerCancel={releasePointer}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    >
      <iframe
        ref={iframeRef}
        className="home-liquid-metal-quickstart__fx"
        title=""
        aria-hidden="true"
        src="/liquid-metal-quickstart.html"
        sandbox="allow-scripts"
        tabIndex={-1}
        onLoad={sync}
      />
      <LoginRequiredAction className="home-liquid-metal-quickstart__link" returnPath={returnPath}>
        <HomeQuickstartIconRotator />
        <span className="home-liquid-metal-quickstart__label">{children}</span>
      </LoginRequiredAction>
    </span>
  )
}
