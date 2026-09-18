export type SupportEdge = 'left' | 'right' | 'top' | 'bottom'

export interface SupportPosition {
  version: 1
  edge: SupportEdge
  ratio: number
}

export interface DragPoint { x: number; y: number }
export interface DragBounds { left: number; right: number; top: number; bottom: number }

interface SupportViewport { left: number; top: number; width: number; height: number }
interface SupportSize { width: number; height: number }
interface SupportInsets { top: number; right: number; bottom: number; left: number }

const finiteOrZero = (value: number): number => Number.isFinite(value) ? value : 0
const nonNegative = (value: number): number => Math.max(0, finiteOrZero(value))
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

function axisBounds(origin: number, length: number, size: number, startInset: number, endInset: number, gap: number): [number, number] {
  const start = finiteOrZero(origin)
  const end = start + Math.max(0, nonNegative(length) - nonNegative(size))
  const min = clamp(start + nonNegative(startInset) + gap, start, end)
  const max = clamp(end - nonNegative(endInset) - gap, start, end)
  if (min <= max) return [min, max]
  // 极小窗口不足以容纳安全间距时收敛为同一点，不能生成反向范围把按钮推到屏幕外。
  const center = (min + max) / 2
  return [center, center]
}

export function getSupportBounds(viewport: SupportViewport, size: SupportSize, insets: SupportInsets, gap = 12): DragBounds {
  const safeGap = nonNegative(gap)
  const [left, right] = axisBounds(viewport.left, viewport.width, size.width, insets.left, insets.right, safeGap)
  const [top, bottom] = axisBounds(viewport.top, viewport.height, size.height, insets.top, insets.bottom, safeGap)
  return { left, right, top, bottom }
}

export function clampSupportPoint(point: DragPoint, bounds: DragBounds): DragPoint {
  return {
    x: clamp(Number.isFinite(point.x) ? point.x : bounds.left, bounds.left, bounds.right),
    y: clamp(Number.isFinite(point.y) ? point.y : bounds.top, bounds.top, bounds.bottom),
  }
}

export function snapSupportPoint(point: DragPoint, bounds: DragBounds): { point: DragPoint; position: SupportPosition } {
  const current = clampSupportPoint(point, bounds)
  const distances: [SupportEdge, number][] = [
    ['left', current.x - bounds.left],
    ['right', bounds.right - current.x],
    ['top', current.y - bounds.top],
    ['bottom', bounds.bottom - current.y],
  ]
  const [edge] = distances.reduce((nearest, candidate) => candidate[1] < nearest[1] ? candidate : nearest)
  const vertical = edge === 'left' || edge === 'right'
  const min = vertical ? bounds.top : bounds.left
  const max = vertical ? bounds.bottom : bounds.right
  const coordinate = vertical ? current.y : current.x
  // 持久化沿边的相对位置，横竖屏切换后按新可用区域恢复，而不是复用旧像素坐标。
  const position: SupportPosition = { version: 1, edge, ratio: max > min ? (coordinate - min) / (max - min) : 0.5 }
  return { point: restoreSupportPoint(position, bounds), position }
}

export function restoreSupportPoint(position: SupportPosition, bounds: DragBounds): DragPoint {
  const ratio = clamp(finiteOrZero(position.ratio), 0, 1)
  const x = bounds.left + (bounds.right - bounds.left) * ratio
  const y = bounds.top + (bounds.bottom - bounds.top) * ratio
  switch (position.edge) {
    case 'left': return { x: bounds.left, y }
    case 'right': return { x: bounds.right, y }
    case 'top': return { x, y: bounds.top }
    case 'bottom': return { x, y: bounds.bottom }
  }
}

export function parseSupportPosition(serialized: string | null): SupportPosition | null {
  if (!serialized) return null
  try {
    const value: unknown = JSON.parse(serialized)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const { version, edge, ratio } = value as Record<string, unknown>
    if (version !== 1 || (edge !== 'left' && edge !== 'right' && edge !== 'top' && edge !== 'bottom')) return null
    if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) return null
    return { version, edge, ratio }
  } catch {
    return null
  }
}
