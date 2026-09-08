import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getToolUsageClients, getToolUsageLeaderboard } from './tool-usage'

function response(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, msg: 'success', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('公开调用端工具用量接口', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('读取丰富工具排行投影及统计时间', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      period: 'day',
      started_at: 1787001600000,
      ended_at: 1787045123000,
      generated_at: 1787045123000,
      items: [{ rank: 1, id: 'tool-1', name: 'Codex', description: '编程工具', logo_url: '', request_count: 120, total_tokens: 42000 }],
    }))

    await expect(getToolUsageLeaderboard('day')).resolves.toMatchObject({
      started_at: 1787001600000,
      items: [{ id: 'tool-1', name: 'Codex', request_count: 120 }],
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('period=day')
  })

  it('兼容简版排行的 tool 编码并读取日期字符串周轴', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({ period: 'month', items: [{ rank: 1, tool: 'codex', request_count: 2, total_tokens: 10 }] }))
      .mockResolvedValueOnce(response({
        weeks: ['2026-08-03'],
        items: [{ id: 'codex', name: 'Codex', description: '', total_count: 2, total_tokens: 10, weekly_usage: [{ week_start: '2026-08-03', request_count: 2, total_tokens: 10 }] }],
      }))

    await expect(getToolUsageLeaderboard('month')).resolves.toMatchObject({ items: [{ id: 'codex', name: 'codex' }] })
    await expect(getToolUsageClients()).resolves.toMatchObject({
      items: [{ weekly_usage: [{ week_start: '2026-08-03' }] }],
    })
  })
})
