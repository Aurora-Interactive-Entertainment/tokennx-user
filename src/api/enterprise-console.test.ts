import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './http'
import {
  ENTERPRISE_PAGE_SIZE,
  createEnterpriseInvitation,
  createEnterpriseQuery,
  createEnterpriseTag,
  deleteEnterpriseTag,
  getAllEnterpriseMembers,
  getEnterpriseAnalytics,
  getEnterpriseAuditLog,
  getEnterpriseAuditLogs,
  getEnterpriseContext,
  getEnterpriseInvitationUsages,
  getEnterpriseInvitations,
  getInvitationPreview,
  getEnterpriseJoinRequests,
  getEnterpriseMember,
  getEnterpriseMembers,
  getEnterpriseDepartments,
  getEnterpriseDepartmentMembers,
  createEnterpriseDepartment,
  updateEnterpriseMemberDepartment,
  removeEnterpriseMember,
  getEnterpriseModels,
  getEnterpriseTags,
  getEnterpriseUsage,
  getEnterpriseErrorMessage,
  getEnterpriseRequestId,
  reviewEnterpriseJoinRequest,
  submitInvitationJoin,
  updateEnterpriseInvitation,
  updateEnterpriseModel,
  updateEnterpriseMemberBudget,
  updateEnterpriseMemberRole,
  updateEnterpriseMemberStatus,
  updateEnterpriseMemberTag,
  updateEnterpriseTag,
  type EnterpriseRequestContext,
} from './enterprise-console'

function apiResponse(data: unknown, status = 200, code = 0, msg = 'success', requestId = 'enterprise-request-id'): Response {
  return new Response(JSON.stringify({ code, msg, data }), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
  })
}

const CONTEXT: EnterpriseRequestContext = { enterprise_id: 'ent/01K0NX' }

describe('企业控制台 API 客户端', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('生成稳定查询参数并过滤空值和全部筛选项', () => {
    expect(createEnterpriseQuery({ page: 2, page_size: ENTERPRISE_PAGE_SIZE, keyword: 'han', role: 'all', status: '', start_at: null })).toBe('page=2&page_size=20&keyword=han')
    expect(() => getEnterpriseContext({ enterprise_id: ' ' }, { accessToken: 'token' })).toThrowError('企业控制台上下文缺少企业 ID')
  })

  it('覆盖上下文、成员、标签、申请、邀请和邀请使用记录的只读路径', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => apiResponse([]))
    await getEnterpriseContext(CONTEXT, { accessToken: 'enterprise-token' })
    await getEnterpriseMembers(CONTEXT, { page: 2, page_size: 30, keyword: 'han', role: 'administrator', status: 'active', accessToken: 'enterprise-token' })
    await getEnterpriseMember(CONTEXT, 'member-1', { accessToken: 'enterprise-token' })
    await getEnterpriseTags(CONTEXT, { accessToken: 'enterprise-token' })
    await getEnterpriseJoinRequests(CONTEXT, { page: 3, status: 'pending', accessToken: 'enterprise-token' })
    await getEnterpriseInvitations(CONTEXT, { page: 4, status: 'active', accessToken: 'enterprise-token' })
    await getEnterpriseInvitationUsages(CONTEXT, 'link-1', { accessToken: 'enterprise-token' })

    const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input), window.location.origin))
    expect(urls.map((url) => url.pathname)).toEqual([
      '/api/user/enterprise/ent%2F01K0NX/context',
      '/api/user/enterprise/ent%2F01K0NX/members',
      '/api/user/enterprise/ent%2F01K0NX/members/member-1',
      '/api/user/enterprise/ent%2F01K0NX/tags',
      '/api/user/enterprise/ent%2F01K0NX/join-requests',
      '/api/user/enterprise/ent%2F01K0NX/invitations',
      '/api/user/enterprise/ent%2F01K0NX/invitations/link-1/usages',
    ])
    expect(urls[1]?.searchParams.get('keyword')).toBe('han')
    expect(urls[1]?.searchParams.get('role')).toBe('administrator')
    expect(urls[1]?.searchParams.get('page_size')).toBe('30')
    expect(urls[4]?.searchParams.get('status')).toBe('pending')
    expect(urls[5]?.searchParams.get('page_size')).toBe(String(ENTERPRISE_PAGE_SIZE))
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer enterprise-token')
  })

  it('按接口契约读取企业模型目录并编码筛选条件', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => apiResponse({ items: [], total: 0, page: 2, page_size: 10, enabled_count: 0, disabled_count: 0 }))
    await getEnterpriseModels(CONTEXT, { page: 2, page_size: 10, keyword: 'GPT/4', modality: 'text', include_disabled: true, accessToken: 'enterprise-token' })

    const requestURL = new URL(String(fetchMock.mock.calls[0]?.[0]), window.location.origin)
    expect(requestURL.pathname).toBe('/api/user/enterprise/ent%2F01K0NX/models')
    expect(requestURL.searchParams.get('page')).toBe('2')
    expect(requestURL.searchParams.get('page_size')).toBe('10')
    expect(requestURL.searchParams.get('keyword')).toBe('GPT/4')
    expect(requestURL.searchParams.get('modality')).toBe('text')
    expect(requestURL.searchParams.get('include_disabled')).toBe('1')
  })

  it('按企业部门接口契约生成部门、部门成员和成员变更请求', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => apiResponse({ items: [], total: 0, page: 1, page_size: 10 }))
    await getEnterpriseDepartments(CONTEXT, { parent_id: 'dept-root', page_size: 10, accessToken: 'token' })
    await getEnterpriseDepartmentMembers(CONTEXT, 'dept-sales', { name: '张', page: 2, accessToken: 'token' })
    await createEnterpriseDepartment(CONTEXT, { parent_id: null, name: '研发' }, { accessToken: 'token' })
    await updateEnterpriseMemberDepartment(CONTEXT, 'member-1', { department_id: 'dept-sales', expected_version: 3 }, { accessToken: 'token' })
    await removeEnterpriseMember(CONTEXT, 'member-1', 4, { accessToken: 'token' })
    const requests = fetchMock.mock.calls.map(([input, init]) => ({ url: new URL(String(input), window.location.origin), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : null }))
    expect(requests[0]?.url.pathname).toBe('/api/user/enterprise/ent%2F01K0NX/departments')
    expect(requests[0]?.url.searchParams.get('parent_id')).toBe('dept-root')
    expect(requests[1]?.url.pathname).toBe('/api/user/enterprise/ent%2F01K0NX/departments/dept-sales/members')
    expect(requests[1]?.url.searchParams.get('name')).toBe('张')
    expect(requests[2]?.method).toBe('POST')
    expect(requests[3]?.body).toEqual({ department_id: 'dept-sales', expected_version: 3 })
    expect(requests[4]?.method).toBe('DELETE')
    expect(requests[4]?.body).toEqual({ expected_version: 4 })
  })

  it('按服务端分页限制读取全部企业成员', async () => {
    const firstPageItems = Array.from({ length: ENTERPRISE_PAGE_SIZE }, (_, index) => ({ id: `member-${index + 1}` }))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input), window.location.origin)
      const page = Number(url.searchParams.get('page'))
      return page === 1
        ? apiResponse({ items: firstPageItems, total: ENTERPRISE_PAGE_SIZE + 1, page, page_size: ENTERPRISE_PAGE_SIZE })
        : apiResponse({ items: [{ id: `member-${ENTERPRISE_PAGE_SIZE + 1}` }], total: ENTERPRISE_PAGE_SIZE + 1, page, page_size: ENTERPRISE_PAGE_SIZE })
    })

    const members = await getAllEnterpriseMembers(CONTEXT, { accessToken: 'enterprise-token' })

    expect(members).toHaveLength(ENTERPRISE_PAGE_SIZE + 1)
    const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input), window.location.origin))
    expect(urls).toHaveLength(2)
    expect(urls.every((url) => url.searchParams.get('page_size') === String(ENTERPRISE_PAGE_SIZE))).toBe(true)
    expect(urls.map((url) => url.searchParams.get('page'))).toEqual(['1', '2'])
  })

  it('覆盖用量、分析、日志列表和日志详情的筛选参数', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => apiResponse({}))
    await getEnterpriseUsage(CONTEXT, { range: 'custom', start_at: Date.parse('2026-07-01T00:00:00.000Z'), end_at: Date.parse('2026-07-08T00:00:00.000Z'), member_id: 'member-2', page: 2, accessToken: 'token' })
    await getEnterpriseAnalytics(CONTEXT, { range: 'month', month: '2026-07', member_id: 'member-2', accessToken: 'token' })
    await getEnterpriseAuditLogs(CONTEXT, { page: 3, category: 'member', action: 'role.update', actor_id: 'member-1', result: 'success', start_at: Date.parse('2026-07-01T00:00:00.000Z'), end_at: Date.parse('2026-07-31T00:00:00.000Z'), accessToken: 'token' })
    await getEnterpriseAuditLog(CONTEXT, 'event/1', { accessToken: 'token' })

    const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input), window.location.origin))
    expect(urls[0]?.pathname).toBe('/api/user/enterprise/ent%2F01K0NX/usage')
    expect(urls[0]?.searchParams.get('range')).toBe('custom')
    expect(urls[0]?.searchParams.get('member_id')).toBe('member-2')
    expect(urls[1]?.searchParams.get('month')).toBe('2026-07')
    expect(urls[1]?.searchParams.get('member_id')).toBe('member-2')
    expect(urls[2]?.searchParams.get('action')).toBe('role.update')
    expect(urls[2]?.searchParams.get('actor_id')).toBe('member-1')
    expect(urls[3]?.pathname).toBe('/api/user/enterprise/ent%2F01K0NX/audit-logs/event%2F1')
  })

  it('按企业分析接口契约返回指标并归一化缺省列表', async () => {
    const response = {
      period: { range: 'custom', start_at: '2026-08-01T00:00:00Z', end_at: '2026-08-08T00:00:00Z', label: '8 月 1 日至 8 日' },
      metrics: { request_count: 12, cached_tokens: 300, active_members: 2, total_members: 4, success_rate: 91.5, average_latency_ms: 680.5, peak_rpm: 3, peak_tpm: 2400, latest_data_date: '2026-08-07', latest_day_input_tokens: 100, latest_day_output_tokens: 80, cumulative_input_tokens: 1000, cumulative_output_tokens: 800, cumulative_request_count: 20 },
      daily_usage_trend: [{ date: '2026-08-07', active_members: 2 }],
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => apiResponse(response))

    const result = await getEnterpriseAnalytics(CONTEXT, { range: 'custom', start_at: 1000, end_at: 2000, member_id: 'member-1', accessToken: 'token' })

    expect(result.metrics.request_count).toBe(12)
    expect(result.tools).toEqual([])
    expect(result.members).toEqual([])
    expect(result.models).toEqual([])
    expect(result.daily_usage_trend).toEqual([{ date: '2026-08-07', active_members: 2 }])
    expect(result.model_token_trend).toEqual([])
    expect(result.member_model_trend).toEqual([])
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), window.location.origin)
    expect(url.searchParams.get('range')).toBe('custom')
    expect(url.searchParams.get('start_at')).toBe('1000')
    expect(url.searchParams.get('end_at')).toBe('2000')
    expect(url.searchParams.get('member_id')).toBe('member-1')
    expect(url.searchParams.has('page')).toBe(false)
    expect(url.searchParams.has('page_size')).toBe(false)
  })

  it('按接口契约发送成员、标签、申请和邀请写请求', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => apiResponse({}))
    await updateEnterpriseMemberRole(CONTEXT, 'member-1', { role: 'administrator', expected_version: 2 }, { accessToken: 'token' })
    await updateEnterpriseMemberStatus(CONTEXT, 'member-1', { status: 'suspended', expected_version: 3 }, { accessToken: 'token' })
    await updateEnterpriseMemberTag(CONTEXT, 'member-1', { tag_id: 'tag-1', expected_version: 4 }, { accessToken: 'token' })
    await updateEnterpriseMemberBudget(CONTEXT, 'member-1', { cost_limit_yuan: '12.50', period_type: 'monthly', expected_version: 5 }, { accessToken: 'token' })
    await createEnterpriseTag(CONTEXT, { name: '研发', description: '研发成员', daily_cost_limit_yuan: null, weekly_cost_limit_yuan: null, monthly_cost_limit_yuan: '100', concurrency_limit: 2, rpm_limit: 20, tpm_limit: 30000, allowed_models: ['gpt-4o'] }, { accessToken: 'token' })
    await updateEnterpriseTag(CONTEXT, 'tag-1', { name: '研发', description: '更新', daily_cost_limit_yuan: null, weekly_cost_limit_yuan: null, monthly_cost_limit_yuan: null, concurrency_limit: null, rpm_limit: null, tpm_limit: null, allowed_models: [], expected_version: 6 }, { accessToken: 'token' })
    await deleteEnterpriseTag(CONTEXT, 'tag-1', 7, { accessToken: 'token' })
    await reviewEnterpriseJoinRequest(CONTEXT, 'request-1', { action: 'approve', role: 'member' }, { accessToken: 'token' })
    await createEnterpriseInvitation(CONTEXT, { role: 'member', max_uses: 10, expires_at: Date.parse('2026-08-01T00:00:00.000Z') }, { accessToken: 'token' })
    await updateEnterpriseInvitation(CONTEXT, 'link-1', { action: 'revoke', expected_version: 8 }, { accessToken: 'token' })

    const requests = fetchMock.mock.calls.map(([, init]) => ({ method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : null }))
    expect(requests.map((request) => request.method)).toEqual(['PUT', 'PUT', 'PUT', 'PUT', 'POST', 'PUT', 'DELETE', 'PUT', 'POST', 'PATCH'])
    expect(requests[0]?.body).toEqual({ role: 'administrator', expected_version: 2 })
    expect(requests[3]?.body).toEqual({ cost_limit_yuan: '12.50', period_type: 'monthly', expected_version: 5 })
    expect(requests[6]?.body).toEqual({ expected_version: 7 })
    expect(requests[8]?.body).toEqual({ role: 'member', max_uses: 10, expires_at: Date.parse('2026-08-01T00:00:00.000Z') })
    expect(requests[9]?.body).toEqual({ action: 'revoke', expected_version: 8 })
  })

  it('按版本号更新企业模型启用状态', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => apiResponse({ id: 'model-public-1', enabled: false, setting_version: 3 }))
    await updateEnterpriseModel(CONTEXT, 'model/public-1', { enabled: false, expected_version: 2 }, { accessToken: 'token' })

    const [input, init] = fetchMock.mock.calls[0] ?? []
    expect(new URL(String(input), window.location.origin).pathname).toBe('/api/user/enterprise/ent%2F01K0NX/models/model%2Fpublic-1')
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toEqual({ enabled: false, expected_version: 2 })
  })

  it('拒绝空模型编号，避免形成无效更新路径', () => {
    expect(() => updateEnterpriseModel(CONTEXT, ' ', { enabled: true, expected_version: 0 })).toThrowError('企业模型编号不能为空')
  })

  it('支持匿名解析邀请并使用登录态提交加入申请', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => apiResponse({}))
    await getInvitationPreview('token/abc', { accessToken: 'token' })
    await submitInvitationJoin({ token: 'token/abc', request_message: '申请加入研发空间' }, { accessToken: 'token' })

    const firstURL = new URL(String(fetchMock.mock.calls[0]?.[0]), window.location.origin)
    expect(firstURL.pathname).toBe('/api/user/invitations')
    expect(firstURL.searchParams.get('token')).toBe('token/abc')
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBeUndefined()
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('POST')
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ token: 'token/abc', request_message: '申请加入研发空间' })
  })

  it('映射企业控制台错误并保留请求 ID', () => {
    expect(getEnterpriseErrorMessage(new ApiError('permission', 403, 140002, 'req-permission'))).toBe('当前成员没有执行此操作的权限')
    expect(getEnterpriseErrorMessage(new ApiError('conflict', 409, 140004, 'req-conflict'))).toBe('企业资源已被其他操作更新，请刷新后重试')
    expect(getEnterpriseErrorMessage(new ApiError('invalid', 400, 140001, 'req-invalid'))).toBe('企业控制台请求参数无效，请刷新后重试')
    expect(getEnterpriseErrorMessage(new ApiError('down', 503, 140006, 'req-down'))).toBe('企业控制台服务暂时不可用，请稍后重试')
    expect(getEnterpriseErrorMessage(new Error('offline'))).toBe('企业控制台请求失败，请稍后重试')
    expect(getEnterpriseRequestId(new ApiError('bad', 400, 140001, 'req-1'))).toBe('req-1')
    expect(getEnterpriseRequestId(new Error('bad'))).toBeNull()
  })
})
