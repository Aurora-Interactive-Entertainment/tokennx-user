import type { ReactNode } from 'react'
import Tabs from '@douyinfe/semi-ui/lib/es/tabs'
import './console-tabs.css'

export interface ConsoleTabItem {
  itemKey: string
  tab: ReactNode
  disabled?: boolean
}

interface ConsoleTabsProps {
  items: readonly ConsoleTabItem[]
  activeKey: string
  onChange: (activeKey: string) => void
  className?: string
  ariaLabel?: string
}

/** 中文：后台页面统一使用 Semi Tabs，保证新增页签沿用同一套交互和视觉规范。 */
export function ConsoleTabs({ items, activeKey, onChange, className = '', ariaLabel }: ConsoleTabsProps) {
  return (
    <Tabs
      type="line"
      size="medium"
      activeKey={activeKey}
      onChange={onChange}
      // 中文：Semi Tabs 的类型要求可变数组，这里复制一份避免修改调用方的只读配置。
      tabList={items.map((item) => ({ ...item }))}
      className={`console-tabs${className ? ` ${className}` : ''}`}
      aria-label={ariaLabel}
    />
  )
}

export default ConsoleTabs
