import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import {
  getEnterpriseUsageDepartments,
  getEnterpriseUsageDetail,
  getEnterpriseUsageMembers,
  getEnterpriseUsageSummary,
} from './enterprise-usage'

function mockApiResponse(data: unknown) {
  // 每次请求创建独立 Response，避免前一次读取后复用已消费的响应体。
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ code: 0, msg: 'success', data }), { status: 200 })))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('企业用量 API', () => {
  beforeEach(() => {
    saveAuthTokens({
      status: 'succeeded',
      binding_required: false,
      access_token: 'enterprise-usage-token',
      refresh_token: 'refresh-token',
      refresh_expires_at: Date.UTC(2099, 0, 1),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearAuthTokens()
  })

  it('请求摘要、人员和部门聚合接口', async () => {
    const fetchMock = mockApiResponse({ items: [], total: 0, page: 1, page_size: 20 })
    const context = { enterprise_id: ' ENT001 ' }

    await getEnterpriseUsageSummary(context, { range: '30d' })
    await getEnterpriseUsageMembers(context, { keyword: '张', page: 2, page_size: 10 })
    await getEnterpriseUsageDepartments(context, { department_name: '研发' })

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/user/enterprise/ENT001/usage/summary?range=30d')
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe('/api/user/enterprise/ENT001/usage/members?keyword=%E5%BC%A0&page=2&page_size=10')
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe('/api/user/enterprise/ENT001/usage/departments?department_name=%E7%A0%94%E5%8F%91&page=1&page_size=20')
  })

  it('只为自定义明细范围发送时间边界，并携带筛选与分页', async () => {
    const fetchMock = mockApiResponse({ items: [], filters: { models: [], api_keys: [], members: [] }, total: 0, page: 3, page_size: 50 })

    await getEnterpriseUsageDetail(
      { enterprise_id: 'enterprise-1' },
      {
        range: 'custom',
        start_at: 1000,
        end_at: 2000,
        member_id: 'member-1',
        model: 'gpt-4o',
        status: 'success',
        page: 3,
        page_size: 50,
        granularity: 'hour',
      },
    )

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://local')
    expect(url.pathname).toBe('/api/user/enterprise/enterprise-1/usage')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      range: 'custom',
      start_at: '1000',
      end_at: '2000',
      member_id: 'member-1',
      model: 'gpt-4o',
      status: 'success',
      page: '3',
      page_size: '50',
      granularity: 'hour',
    })
  })

  it('明细默认按服务端日粒度查询，不重复发送默认粒度参数', async () => {
    const fetchMock = mockApiResponse({ items: [], filters: { models: [], api_keys: [], members: [] }, total: 0 })

    await getEnterpriseUsageDetail(
      { enterprise_id: 'enterprise-1' },
      { range: 'today' },
    )

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://local')
    expect(url.searchParams.get('range')).toBe('today')
    expect(url.searchParams.has('granularity')).toBe(false)
  })
})
