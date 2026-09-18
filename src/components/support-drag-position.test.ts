import { describe, expect, it } from 'vitest'
import { clampSupportPoint, getSupportBounds, parseSupportPosition, restoreSupportPoint, snapSupportPoint } from './support-drag-position'
import type { DragBounds, SupportEdge } from './support-drag-position'

const noInsets = { top: 0, right: 0, bottom: 0, left: 0 }
const bounds: DragBounds = { left: 12, right: 331, top: 56, bottom: 710 }

describe('客服入口安全位置', () => {
  it('同时保留完整按钮尺寸、四边安全区和屏幕内侧间距', () => {
    expect(getSupportBounds(
      { left: 0, top: 0, width: 390, height: 844 },
      { width: 47, height: 88 },
      { top: 44, right: 0, bottom: 34, left: 0 },
    )).toEqual(bounds)
  })

  it('使用视觉视口偏移，软键盘或缩放后的边界仍基于可见区域', () => {
    expect(getSupportBounds(
      { left: 20, top: 100, width: 320, height: 420 },
      { width: 47, height: 88 },
      { top: 0, right: 10, bottom: 20, left: 5 },
      8,
    )).toEqual({ left: 33, right: 275, top: 108, bottom: 404 })
  })

  it('窗口过小则缩减间距并收敛坐标，不产生反向范围', () => {
    expect(getSupportBounds(
      { left: 0, top: 0, width: 50, height: 95 },
      { width: 47, height: 88 }, noInsets,
    )).toEqual({ left: 1.5, right: 1.5, top: 3.5, bottom: 3.5 })
    expect(getSupportBounds(
      { left: 10, top: 20, width: 20, height: 30 },
      { width: 47, height: 88 }, noInsets,
    )).toEqual({ left: 10, right: 10, top: 20, bottom: 20 })
  })

  it('拖出所有边界时约束到屏幕内', () => {
    expect(clampSupportPoint({ x: -200, y: 1200 }, bounds)).toEqual({ x: 12, y: 710 })
    expect(clampSupportPoint({ x: 1200, y: -200 }, bounds)).toEqual({ x: 331, y: 56 })
  })

  it.each<[SupportEdge, { x: number; y: number }, { x: number; y: number }]>([
    ['left', { x: 30, y: 300 }, { x: 12, y: 300 }],
    ['right', { x: 320, y: 300 }, { x: 331, y: 300 }],
    ['top', { x: 150, y: 70 }, { x: 150, y: 56 }],
    ['bottom', { x: 150, y: 700 }, { x: 150, y: 710 }],
  ])('松手吸附到距离最近的 %s 边', (edge, point, expected) => {
    const snapped = snapSupportPoint(point, bounds)
    expect(snapped.point).toEqual(expected)
    expect(snapped.position.edge).toBe(edge)
    expect(restoreSupportPoint(snapped.position, bounds)).toEqual(expected)
  })

  it('存储边与比例，旋转屏幕后保留相对位置且仍然在新范围内', () => {
    const { position } = snapSupportPoint({ x: 325, y: 383 }, bounds)
    const landscapeBounds = getSupportBounds(
      { left: 0, top: 0, width: 844, height: 390 },
      { width: 47, height: 88 },
      { top: 0, right: 44, bottom: 21, left: 44 },
    )
    expect(position).toEqual({ version: 1, edge: 'right', ratio: 0.5 })
    expect(restoreSupportPoint(position, landscapeBounds)).toEqual({ x: 741, y: 140.5 })
  })

  it('角落等距时选边稳定，收敛范围不会产生 NaN 比例', () => {
    expect(snapSupportPoint({ x: 12, y: 56 }, bounds).position).toEqual({ version: 1, edge: 'left', ratio: 0 })
    const collapsed = { left: 8, right: 8, top: 9, bottom: 9 }
    expect(snapSupportPoint({ x: 8, y: 9 }, collapsed)).toEqual({
      point: { x: 8, y: 9 }, position: { version: 1, edge: 'left', ratio: 0.5 },
    })
  })
})

describe('客服位置持久化解析', () => {
  it.each<SupportEdge>(['left', 'right', 'top', 'bottom'])('读取 %s 边的有效位置', edge => {
    const position = { version: 1, edge, ratio: 0.75 }
    expect(parseSupportPosition(JSON.stringify(position))).toEqual(position)
  })

  it('接受比例端点，忽略存储数据中的额外属性', () => {
    expect(parseSupportPosition('{"version":1,"edge":"left","ratio":0,"extra":true}')).toEqual({ version: 1, edge: 'left', ratio: 0 })
    expect(parseSupportPosition('{"version":1,"edge":"bottom","ratio":1}')).toEqual({ version: 1, edge: 'bottom', ratio: 1 })
  })

  it.each([
    null, '', 'not json', 'null', '[]', '1', '"right"', '{}',
    '{"version":2,"edge":"right","ratio":0.5}',
    '{"version":"1","edge":"right","ratio":0.5}',
    '{"version":1,"edge":"center","ratio":0.5}',
    '{"version":1,"edge":"right","ratio":"0.5"}',
    '{"version":1,"edge":"right","ratio":-0.1}',
    '{"version":1,"edge":"right","ratio":1.1}',
    '{"version":1,"edge":"right","ratio":1e999}',
    '{"version":1,"edge":"right"}',
  ])('损坏或不合法的位置数据安全回退：%s', serialized => {
    expect(parseSupportPosition(serialized)).toBeNull()
  })
})
