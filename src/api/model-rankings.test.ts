import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getModelUsageLeaderboard, getRecentModelUsage } from './model-rankings'

function response(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, msg: 'success', data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('公开模型用量排名接口', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('按指定周期查询排行榜并保留空的对比涨跌率', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      period: 'month',
      started_at: '2026-08-01T00:00:00Z',
      ended_at: '2026-08-13T08:00:00Z',
      previous_from: '2026-07-01T00:00:00Z',
      previous_to: '2026-08-01T00:00:00Z',
      items: [{ rank: 1, code: 'gpt-test', name: '测试模型', total_tokens: 120000, request_count: 320, previous_tokens: 0, change_rate: null }],
    }))

    const result = await getModelUsageLeaderboard('month')

    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/homepage/model-usage/leaderboard?period=month')
    expect(result.items[0]).toMatchObject({ code: 'gpt-test', total_tokens: 120000, change_rate: null })
  })

  it('兼容后端返回毫秒时间戳', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      period: 'day',
      started_at: 1786579200000,
      ended_at: 1786620082973,
      previous_from: 1786492800000,
      previous_to: 1786579200000,
      items: [{ rank: 1, code: 'model-1', name: '模型 1', total_tokens: 100, request_count: 1, previous_tokens: 80, change_rate: 25 }],
    }))

    const result = await getModelUsageLeaderboard('day')

    expect(result.started_at).toBe(1786579200000)
    expect(result.ended_at).toBe(1786620082973)
  })

  it('读取最近六个月及逐月模型用量', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      months: ['2026-03', '2026-04'],
      items: [{ rank: 1, code: 'gpt-test', name: '测试模型', total_tokens: 120000, request_count: 320, monthly_usage: [{ month: '2026-03', total_tokens: 50000, request_count: 120 }] }],
    }))

    const result = await getRecentModelUsage()

    expect(result.months).toEqual(['2026-03', '2026-04'])
    expect(result.items[0].monthly_usage).toEqual([{ month: '2026-03', total_tokens: 50000, request_count: 120 }])
  })
})
