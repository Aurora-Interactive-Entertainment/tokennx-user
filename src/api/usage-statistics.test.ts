import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createUsageStatisticsQuery, getUsageFilters, getUsageModels, getUsageSummary, getUsageTrend } from './usage-statistics'

function apiResponse(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, msg: 'success', data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

const PERSONAL = { account_type: 'personal' } as const
const ENTERPRISE = { account_type: 'enterprise', enterprise_id: 'enterprise-1' } as const

describe('usage statistics API client', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('builds account context and omits all-valued filters', () => {
    expect(createUsageStatisticsQuery(PERSONAL, { range: '7d', source: 'all', status: 'all' })).toBe('account_type=personal&range=7d')
    expect(createUsageStatisticsQuery(ENTERPRISE, { member_id: 'member-1', model: 'gpt-test', start_at: 1782864000000 })).toBe('account_type=enterprise&enterprise_id=enterprise-1&member_id=member-1&model=gpt-test&start_at=1782864000000')
    expect(() => createUsageStatisticsQuery({ account_type: 'enterprise' })).toThrow()
  })

  it('calls filters, summary, trend and paginated models with their documented paths', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(apiResponse({})))
    const options = { accessToken: 'usage-token' }
    await getUsageFilters(PERSONAL, options)
    await getUsageSummary(PERSONAL, { range: '7d', source: 'api' }, options)
    await getUsageTrend(ENTERPRISE, { range: 'custom', granularity: 'month', metric: 'cost', member_id: 'member-1', start_at: 1, end_at: 2 }, options)
    await getUsageModels(PERSONAL, { range: '30d', page: 3, page_size: 50, model: 'gpt-test' }, options)
    const urls = fetchMock.mock.calls.map(([url]) => new URL(String(url), window.location.origin))
    expect(urls[0].pathname).toBe('/api/user/usage/filters')
    expect(urls[1].pathname).toBe('/api/user/usage/summary')
    expect(urls[1].searchParams.get('source')).toBe('api')
    expect(urls[2].pathname).toBe('/api/user/usage/trend')
    expect(urls[2].searchParams.get('granularity')).toBe('month')
    expect(urls[2].searchParams.get('metric')).toBe('cost')
    expect(urls[3].pathname).toBe('/api/user/usage/models')
    expect(urls[3].searchParams.get('page')).toBe('3')
    expect(urls[3].searchParams.get('page_size')).toBe('50')
  })
})
