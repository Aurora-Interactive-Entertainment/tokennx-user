export interface ChartHoverLegendItem {
  id: string
  name: string
  value: string
  color: string
}

interface ChartHoverLegendProps {
  visible: boolean
  ariaLabel: string
  dateTime: string
  dateLabel: string
  items: ChartHoverLegendItem[]
  totalLabel: string
  totalValue: string
  className?: string
  /** 提供时信息框相对父容器按该坐标跟随鼠标；为 null 时保持默认固定停靠布局。 */
  position?: { x: number; y: number } | null
}

/** 统一排名页与应用页的图表悬浮信息框，避免同类数据展示出现样式偏差。 */
export function ChartHoverLegend({ visible, ariaLabel, dateTime, dateLabel, items, totalLabel, totalValue, className = '', position }: ChartHoverLegendProps) {
  return (
    <aside
      className={`chart-hover-legend${className ? ` ${className}` : ''}${visible ? ' is-visible' : ''}${position ? ' is-following' : ''}`}
      // 中文：跟随鼠标时使用 transform，避免频繁修改 left/top 触发布局。
      style={position ? { left: 0, top: 0, transform: `translate3d(${position.x}px, ${position.y}px, 0)` } : undefined}
      aria-hidden={!visible}
      aria-label={ariaLabel}
    >
      {visible ? <>
        <time dateTime={dateTime}>{dateLabel}</time>
        <div className="chart-hover-legend-list">{items.map((item) => <span key={item.id}><i style={{ backgroundColor: item.color }} /><strong title={item.name}>{item.name}</strong><em>{item.value}</em></span>)}</div>
        <div className="chart-hover-legend-total"><strong>{totalLabel}</strong><em>{totalValue}</em></div>
      </> : null}
    </aside>
  )
}
