import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './http'
import {
  RECORDS_PAGE_SIZE,
  createUsageRecordsQuery,
  createUsageSummaryQuery,
  getUsageRecords,
  getUsageRecordsErrorMessage,
  getUsageRecordsRequestId,
  getUsageSummary,
  getUsageSummaryErrorMessage,
  getUsageSummaryRequestId,
  type UsageRecordsContext,
} from './usage-records'

function apiResponse(data: unknown, status = 200, code = 0, msg = 'success', requestId = 'records-request-id'): Response {
  return new Response(JSON.stringify({ code, msg, data }), { status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId } })
}

const PERSONAL_CONTEXT: UsageRecordsContext = { account_type: 'personal' }
const ENTERPRISE_CONTEXT: UsageRecordsContext = { account_type: 'enterprise', enterprise_id: 'enterprise-1' }

describe('用户调用记录 API 客户端', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('生成个人和企业隔离的筛选查询，并拒绝缺少企业 ID', () => {
    expect(createUsageRecordsQuery(PERSONAL_CONTEXT, { page: 2, page_size: RECORDS_PAGE_SIZE, source: 'api' })).toBe('account_type=personal&page=2&page_size=20&source=api')
    expect(createUsageRecordsQuery(ENTERPRISE_CONTEXT, { member_id: 'member-1', model: 'gpt-test', start_at: 1782864000000 })).toBe('account_type=enterprise&enterprise_id=enterprise-1&member_id=member-1&model=gpt-test&start_at=1782864000000')
    expect(() => createUsageRecordsQuery({ account_type: 'enterprise' })).toThrowError('企业调用记录上下文缺少企业 ID')
  })

  it('调用记录接口并传递认证、分页与详情筛选参数', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse({ items: [], page: 1, page_size: 20, total: 0 }))
    await getUsageRecords(ENTERPRISE_CONTEXT, { page: 3, page_size: 10, api_key_id: 'key-1', model: 'gpt-test', source: 'console-test', status: 'cancelled', request_id: 'request-1', member_id: 'member-1', start_at: 1782864000000, end_at: 1785542400000, accessToken: 'records-token' })
    const call = fetchMock.mock.calls[0]
    const url = new URL(String(call?.[0]), window.location.origin)
    expect(url.pathname).toBe('/api/user/usage/records')
    expect(url.searchParams.get('enterprise_id')).toBe('enterprise-1')
    expect(url.searchParams.get('page')).toBe('3')
    expect(url.searchParams.get('api_key_id')).toBe('key-1')
    expect(url.searchParams.get('status')).toBe('cancelled')
    expect(url.searchParams.get('member_id')).toBe('member-1')
    expect(new Headers(call?.[1]?.headers).get('Authorization')).toBe('Bearer records-token')
    expect(new Headers(call?.[1]?.headers).get('X-Request-ID')).toBeTruthy()
  })

  it('生成并调用用量摘要接口，隔离时间范围和账务筛选参数', async () => {
    expect(createUsageSummaryQuery(PERSONAL_CONTEXT, { range: '7d', page: 1, page_size: 20, source: 'all' })).toBe('account_type=personal&range=7d&page=1&page_size=20')
    expect(createUsageSummaryQuery(ENTERPRISE_CONTEXT, { range: 'custom', member_id: 'member-1', start_at: 1782864000000, end_at: 1785542400000 })).toBe('account_type=enterprise&enterprise_id=enterprise-1&range=custom&member_id=member-1&start_at=1782864000000&end_at=1785542400000')
    expect(() => createUsageSummaryQuery({ account_type: 'enterprise' })).toThrowError('企业用量统计上下文缺少企业 ID')

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse({ metrics: { request_count: 0 }, trend: [], models: [], api_keys: [], sources: [], model_rows: [] }, 200, 0, 'success', 'summary-request-id'))
    await getUsageSummary(ENTERPRISE_CONTEXT, { range: 'custom', page: 2, page_size: 10, api_key_id: 'key-1', model: 'gpt-test', source: 'api', status: 'success', member_id: 'member-1', start_at: 1782864000000, end_at: 1785542400000, accessToken: 'summary-token' })
    const call = fetchMock.mock.calls[0]
    const url = new URL(String(call?.[0]), window.location.origin)
    expect(url.pathname).toBe('/api/user/usage/summary')
    expect(url.searchParams.get('range')).toBe('custom')
    expect(url.searchParams.get('api_key_id')).toBe('key-1')
    expect(url.searchParams.get('member_id')).toBe('member-1')
    expect(new Headers(call?.[1]?.headers).get('Authorization')).toBe('Bearer summary-token')
  })

  it('保留服务端请求 ID 并映射常见错误', () => {
    expect(getUsageRecordsErrorMessage(new ApiError('forbidden', 403, 120002, 'records-forbidden'))).toBe('当前工作空间没有查看这些调用记录的权限')
    expect(getUsageRecordsErrorMessage(new ApiError('unavailable', 503, 100002, 'records-unavailable'))).toBe('调用记录服务暂时不可用，请稍后重试')
    expect(getUsageRecordsErrorMessage(new Error('network'))).toBe('调用记录请求失败，请稍后重试')
    expect(getUsageRecordsRequestId(new ApiError('bad', 400, 100001, 'records-bad'))).toBe('records-bad')
    expect(getUsageRecordsRequestId(new Error('bad'))).toBeNull()
    expect(getUsageSummaryErrorMessage(new ApiError('forbidden', 403, 120002, 'summary-forbidden'))).toBe('当前工作空间没有查看用量统计的权限')
    expect(getUsageSummaryErrorMessage(new ApiError('unavailable', 503, 100002, 'summary-unavailable'))).toBe('用量统计服务暂时不可用，请稍后重试')
    expect(getUsageSummaryErrorMessage(new Error('network'))).toBe('用量统计请求失败，请稍后重试')
    expect(getUsageSummaryRequestId(new ApiError('bad', 400, 100001, 'summary-bad'))).toBe('summary-bad')
    expect(getUsageSummaryRequestId(new Error('bad'))).toBeNull()
  })
})
