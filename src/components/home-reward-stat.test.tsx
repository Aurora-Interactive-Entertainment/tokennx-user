import { describe, expect, it } from 'vitest'
import { getHomeRewardStatScale } from './home-reward-stat'

describe('首页奖励统计数字', () => {
  it('两位以内保持原字号，超过两位后随位数增加持续缩小', () => {
    const scales = ['00', '123', '1234', '12345'].map(getHomeRewardStatScale)

    expect(scales[0]).toBe(1)
    expect(scales[1]).toBeLessThan(scales[0])
    expect(scales[2]).toBeLessThan(scales[1])
    expect(scales[3]).toBeLessThan(scales[2])
  })
})
