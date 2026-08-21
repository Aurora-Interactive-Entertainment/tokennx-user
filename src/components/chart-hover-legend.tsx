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
}

/** 统一排名页与应用页的图表悬浮信息框，避免同类数据展示出现样式偏差。 */
export function ChartHoverLegend({ visible, ariaLabel, dateTime, dateLabel, items, totalLabel, totalValue, className = '' }: ChartHoverLegendProps) {
  return (
    <aside className={`chart-hover-legend${className ? ` ${className}` : ''}${visible ? ' is-visible' : ''}`} aria-hidden={!visible} aria-label={ariaLabel}>
      {visible ? <>
        <time dateTime={dateTime}>{dateLabel}</time>
        <div className="chart-hover-legend-list">{items.map((item) => <span key={item.id}><i style={{ backgroundColor: item.color }} /><strong title={item.name}>{item.name}</strong><em>{item.value}</em></span>)}</div>
        <div className="chart-hover-legend-total"><strong>{totalLabel}</strong><em>{totalValue}</em></div>
      </> : null}
    </aside>
  )
}
