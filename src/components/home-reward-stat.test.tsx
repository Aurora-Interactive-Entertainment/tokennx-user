import { describe, expect, it } from 'vitest'
import { getHomeRewardStatScale } from './home-reward-stat'

describe('首页奖励统计数字', () => {
  it('两位以内保持设计稿字号', () => {
    expect(getHomeRewardStatScale('0')).toBe(1)
    expect(getHomeRewardStatScale('22')).toBe(1)
  })

  it('三位数与收益的四位数字同档，不再更大', () => {
    // 收益展示的是四位数字（形如 0.00），三位数按同档字号渲染，避免相邻卡片数字一大一小。
    expect(getHomeRewardStatScale('222')).toBe(getHomeRewardStatScale('0.00'))
  })

  it('位数更多时在同一档基础上继续缩小', () => {
    const scales = ['222', '22222', '222222', '2222222'].map(getHomeRewardStatScale)

    for (let index = 1; index < scales.length; index += 1) {
      expect(scales[index]).toBeLessThan(scales[index - 1])
    }
    expect(scales.at(-1)).toBeGreaterThan(0)
  })
})
