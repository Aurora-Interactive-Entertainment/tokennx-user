import { useEffect } from 'react'
import { useLocation } from 'react-router'

export function BuildVersionSync() {
  const { pathname } = useLocation()

  useEffect(() => {
    // 只同步页面路径；筛选参数和锚点变化仍属于当前操作，不触发版本更新。
    void window.__TOKEN_NX_UPDATE_GUARD__?.routeChanged()
  }, [pathname])

  return null
}
