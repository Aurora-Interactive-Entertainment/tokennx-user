import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import type { AuthResult } from '@/api/auth'
import { ApiError } from '@/api/http'
import {
  createEnterpriseTag,
  createEnterpriseRole,
  createEnterpriseInvitation,
  getEnterpriseAnalytics,
  getEnterpriseAuditLog,
  getEnterpriseAuditLogs,
  getEnterpriseContext,
  getEnterpriseGovernance,
  getEnterpriseInvitationUsages,
  getEnterpriseInvitations,
  getEnterpriseJoinRequests,
  getEnterpriseMember,
  getEnterpriseMembers,
  getEnterpriseTags,
  getEnterpriseUsage,
  reviewEnterpriseJoinRequest,
  updateEnterpriseRole,
  updateEnterpriseTag,
  updateEnterpriseInvitation,
  updateEnterpriseMemberRole,
  deleteEnterpriseRole,
  getAllEnterpriseMembers,
  updateEnterpriseMemberTag,
  type EnterpriseAnalyticsResponse,
  type EnterpriseAuditLog,
  type EnterpriseAuditLogPage as EnterpriseAuditLogResponsePage,
  type EnterpriseContext,
  type EnterpriseGovernanceResponse,
  type EnterpriseInvitation,
  type EnterpriseInvitationPage,
  type EnterpriseJoinRequest,
  type EnterpriseJoinRequestPage,
  type EnterpriseMember,
  type EnterpriseMemberPage,
  type EnterpriseMemberUsage,
  type EnterprisePermissionDefinition,
  type EnterpriseRole,
  type EnterpriseTag,
  type EnterpriseUsageResponse,
} from '@/api/enterprise-console'
import { AppStoreProvider } from '@/data/app-state'
import { createAppStore } from '@/store'
import {
  EnterpriseValidationError,
  exportEnterpriseCsv,
  validateEnterpriseDateRange,
} from './enterprise-console-shared'
import { EnterpriseAnalyticsPage } from './enterprise-analytics'
import { EnterpriseAuditLogPage } from './enterprise-audit-log'
import { EnterpriseGovernancePage, updatePermissionSelection } from './enterprise-governance'
import { MembersPage } from './enterprise-members'
import { EnterpriseUsagePage } from './enterprise-usage'

vi.mock('@/api/enterprise-console', async () => {
  const actual = await vi.importActual<typeof import('@/api/enterprise-console')>('@/api/enterprise-console')
  return {
    ...actual,
    createEnterpriseTag: vi.fn(),
    createEnterpriseRole: vi.fn(),
    createEnterpriseInvitation: vi.fn(),
    getEnterpriseAnalytics: vi.fn(),
    getEnterpriseAuditLog: vi.fn(),
    getEnterpriseAuditLogs: vi.fn(),
    getEnterpriseContext: vi.fn(),
    getEnterpriseGovernance: vi.fn(),
    getAllEnterpriseMembers: vi.fn(),
    getEnterpriseInvitationUsages: vi.fn(),
    getEnterpriseInvitations: vi.fn(),
    getEnterpriseJoinRequests: vi.fn(),
    getEnterpriseMember: vi.fn(),
    getEnterpriseMembers: vi.fn(),
    getEnterpriseTags: vi.fn(),
    getEnterpriseUsage: vi.fn(),
    reviewEnterpriseJoinRequest: vi.fn(),
    updateEnterpriseRole: vi.fn(),
    updateEnterpriseTag: vi.fn(),
    updateEnterpriseInvitation: vi.fn(),
    updateEnterpriseMemberRole: vi.fn(),
    deleteEnterpriseRole: vi.fn(),
    updateEnterpriseMemberTag: vi.fn(),
  }
})

vi.mock('@/components/usage-charts', () => ({
  UsageTrendChart: ({ metric }: { metric: string }) => <div data-testid="usage-trend-chart">{metric}</div>,
}))

const getEnterpriseAnalyticsMock = vi.mocked(getEnterpriseAnalytics)
const getEnterpriseAuditLogMock = vi.mocked(getEnterpriseAuditLog)
const getEnterpriseAuditLogsMock = vi.mocked(getEnterpriseAuditLogs)
const getEnterpriseContextMock = vi.mocked(getEnterpriseContext)
const getEnterpriseGovernanceMock = vi.mocked(getEnterpriseGovernance)
const getAllEnterpriseMembersMock = vi.mocked(getAllEnterpriseMembers)
const getEnterpriseInvitationUsagesMock = vi.mocked(getEnterpriseInvitationUsages)
const getEnterpriseInvitationsMock = vi.mocked(getEnterpriseInvitations)
const getEnterpriseJoinRequestsMock = vi.mocked(getEnterpriseJoinRequests)
const getEnterpriseMemberMock = vi.mocked(getEnterpriseMember)
const getEnterpriseMembersMock = vi.mocked(getEnterpriseMembers)
const getEnterpriseTagsMock = vi.mocked(getEnterpriseTags)
const getEnterpriseUsageMock = vi.mocked(getEnterpriseUsage)
const reviewEnterpriseJoinRequestMock = vi.mocked(reviewEnterpriseJoinRequest)
const createEnterpriseRoleMock = vi.mocked(createEnterpriseRole)
const createEnterpriseTagMock = vi.mocked(createEnterpriseTag)
const updateEnterpriseRoleMock = vi.mocked(updateEnterpriseRole)
const updateEnterpriseTagMock = vi.mocked(updateEnterpriseTag)
const createEnterpriseInvitationMock = vi.mocked(createEnterpriseInvitation)
const updateEnterpriseInvitationMock = vi.mocked(updateEnterpriseInvitation)
const updateEnterpriseMemberRoleMock = vi.mocked(updateEnterpriseMemberRole)
const deleteEnterpriseRoleMock = vi.mocked(deleteEnterpriseRole)
const updateEnterpriseMemberTagMock = vi.mocked(updateEnterpriseMemberTag)

const ENTERPRISE_ID = 'ent_test'
const AUTH_RESULT: AuthResult = {
  status: 'succeeded',
  binding_required: false,
  access_token: 'enterprise-token',
  refresh_token: 'enterprise-refresh',
  refresh_expires_at: Date.UTC(2099, 0, 1),
  user: {
    id: 'user_test',
    display_name: '测试用户',
    avatar_url: '',
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    status: 'active',
  },
}

const CONTEXT: EnterpriseContext = {
  id: ENTERPRISE_ID,
  name: '测试企业',
  code: 'ENT-TEST',
  member_id: 'membership_test',
  role: 'owner',
  roles: ['owner'],
  capabilities: {
    can_manage_members: true,
    can_manage_roles: true,
    can_manage_tags: true,
    can_manage_models: true,
    can_manage_usage: true,
    can_view_models: true,
    can_view_usage: true,
    can_view_audit: true,
    can_view_analytics: true,
  },
  role_options: [
    { code: 'owner', name: '企业所有者', owner_role: true },
    { code: 'engineering', name: '工程成员', owner_role: false },
    { code: 'data_analyst', name: '数据分析员', owner_role: false },
  ],
}

const MEMBER: EnterpriseMember = {
  id: 'member_test',
  user_id: 'user_member',
  display_name: '张三',
  avatar_url: '',
  masked_contact: '138****0001',
  status: 'active',
  join_source: '企业邀请',
  joined_at: Date.parse('2026-07-01T08:00:00Z'),
  role: 'engineering',
  roles: ['engineering'],
  tags: [{ id: 'tag_dev', name: '研发' }],
  budget: { cost_limit_yuan: '100.000000000', period_type: 'monthly', used_cost_yuan: '12.500000000', usage_percent: 12.5, version: 2 },
  version: 3,
}

const TAG: EnterpriseTag = {
  id: 'tag_dev',
  name: '研发',
  description: '研发团队',
  daily_cost_limit_yuan: null,
  weekly_cost_limit_yuan: null,
  monthly_cost_limit_yuan: '100.000000000',
  concurrency_limit: 8,
  rpm_limit: 60,
  tpm_limit: null,
  allowed_models: ['gpt-4o'],
  member_count: 1,
  version: 1,
  created_at: Date.parse('2026-07-01T08:00:00Z'),
  updated_at: Date.parse('2026-07-01T08:00:00Z'),
}

const JOIN_REQUEST: EnterpriseJoinRequest = {
  id: 'join_test',
  applicant_user_id: 'user_applicant',
  applicant_name: '李四',
  applicant_contact: '139****0002',
  requested_role: 'data_analyst',
  request_message: '申请加入研发团队',
  status: 'pending',
  created_at: Date.parse('2026-07-02T08:00:00Z'),
  updated_at: Date.parse('2026-07-02T08:00:00Z'),
  version: 1,
}

const INVITATION: EnterpriseInvitation = {
  id: 'invite_test',
  role: 'data_analyst',
  role_name: '数据分析员',
  max_uses: 10,
  used_count: 2,
  expires_at: null,
  status: 'active',
  inviter_name: '测试用户',
  created_at: Date.parse('2026-07-03T08:00:00Z'),
  updated_at: Date.parse('2026-07-03T08:00:00Z'),
  invite_url: 'https://example.invalid/invite/test',
  version: 1,
}

const GOVERNANCE_PERMISSIONS: EnterprisePermissionDefinition[] = [
  { id: 'permission-members-view', code: 'members.view', name: '查看成员', description: '查看企业成员', resource: 'members', action: 'view', depends_on: [] },
  { id: 'permission-members-invite', code: 'members.invite', name: '邀请成员', description: '邀请成员加入企业', resource: 'members', action: 'invite', depends_on: ['members.view'] },
  { id: 'permission-usage-view', code: 'usage.view', name: '查看用量', description: '查看企业用量', resource: 'usage', action: 'view', depends_on: [] },
]

const GOVERNANCE_ROLES: EnterpriseRole[] = [
  { id: 'role-owner', code: 'owner', name: '企业所有者', description: '系统所有者', built_in: true, owner_role: true, status: 'active', version: 1, member_count: 1, invitation_count: 0, permission_codes: [] },
  { id: 'role-engineering', code: 'engineering', name: '工程成员', description: '研发团队成员', built_in: false, owner_role: false, status: 'active', version: 2, member_count: 1, invitation_count: 0, permission_codes: ['members.view'] },
  { id: 'role-data-analyst', code: 'data_analyst', name: '数据分析员', description: '查看企业分析结果', built_in: false, owner_role: false, status: 'active', version: 1, member_count: 0, invitation_count: 1, permission_codes: ['members.view', 'usage.view'] },
]

const GOVERNANCE: EnterpriseGovernanceResponse = {
  context: CONTEXT,
  permissions: GOVERNANCE_PERMISSIONS,
  roles: GOVERNANCE_ROLES,
}

const METRICS = {
  request_count: 12,
  success_count: 11,
  error_count: 1,
  cancelled_count: 0,
  active_members: 1,
  input_tokens: 1200,
  output_tokens: 600,
  cached_tokens: 200,
  total_cost_yuan: '12.500000000',
  average_latency_ms: 1250,
  success_rate: 91.7,
}

const PERIOD = {
  range: '30d',
  start_at: Date.parse('2026-07-01T00:00:00Z'),
  end_at: Date.parse('2026-07-30T23:59:59Z'),
  label: '近 30 天',
}

function memberPage(overrides: Partial<EnterpriseMemberPage> = {}): EnterpriseMemberPage {
  return { context: CONTEXT, items: [MEMBER], total: 1, page: 1, page_size: 20, ...overrides }
}

function joinRequestPage(overrides: Partial<EnterpriseJoinRequestPage> = {}): EnterpriseJoinRequestPage {
  return { context: CONTEXT, items: [JOIN_REQUEST], total: 1, page: 1, page_size: 20, ...overrides }
}

function invitationPage(overrides: Partial<EnterpriseInvitationPage> = {}): EnterpriseInvitationPage {
  return { context: CONTEXT, items: [INVITATION], total: 1, page: 1, page_size: 20, ...overrides }
}

function usageResponse(overrides: Partial<EnterpriseUsageResponse> = {}): EnterpriseUsageResponse {
  return {
    context: CONTEXT,
    period: PERIOD,
    metrics: METRICS,
    trend: TREND,
    members: [{ member_id: MEMBER.id, member_name: MEMBER.display_name, role: MEMBER.role, tags: MEMBER.tags, request_count: 12, input_tokens: 1200, output_tokens: 600, cached_tokens: 200, cost_yuan: '12.500000000', budget: MEMBER.budget }],
    member_detail: null,
    page: 1,
    page_size: 20,
    total_members: 1,
    ...overrides,
  }
}

const TREND = [{ date: '2026-07-29', request_count: 12, success_count: 11, error_count: 1, cancelled_count: 0, input_tokens: 1200, output_tokens: 600, cached_tokens: 200, cost_yuan: '12.500000000', average_latency_ms: 1250 }]

function analyticsResponse(overrides: Partial<EnterpriseAnalyticsResponse> = {}): EnterpriseAnalyticsResponse {
  const dimension = { id: 'dimension_test', code: 'dimension_test', name: 'GPT-4o', requests: 12, input_tokens: 1200, output_tokens: 600, cached_tokens: 200, cost_yuan: '12.500000000', average_latency_ms: 1250 }
  return { context: CONTEXT, period: PERIOD, metrics: METRICS, trend: TREND, members: [dimension], models: [dimension], api_keys: [dimension], sources: [dimension], ...overrides }
}

const AUDIT_EVENT: EnterpriseAuditLog = {
  id: 'audit_test',
  category: 'enterprise.member',
  action: 'enterprise.member.role',
  summary: '将张三的角色调整为数据分析员',
  actor_id: 'user_test',
  actor_name: '测试用户',
  actor_contact: '138****0000',
  result: 'success',
  result_code: '0',
  resource_type: 'enterprise_member',
  resource_id: MEMBER.id,
  before: { role: 'engineering' },
  after: { role: 'data_analyst' },
  request_id: 'request_audit_test',
  occurred_at: Date.parse('2026-07-29T08:00:00Z'),
}

function auditPage(overrides: Partial<EnterpriseAuditLogResponsePage> = {}): EnterpriseAuditLogResponsePage {
  return { context: CONTEXT, items: [AUDIT_EVENT], total: 1, page: 1, page_size: 20, ...overrides }
}

function setWorkspace(isEnterprise: boolean): void {
  window.localStorage.setItem('token-nx:user-front:v1', JSON.stringify({
    activeWorkspaceId: isEnterprise ? ENTERPRISE_ID : 'personal',
    workspaces: isEnterprise ? [{ id: ENTERPRISE_ID, name: CONTEXT.name, type: 'enterprise', role: 'owner' }] : [],
  }))
}

function renderPage(element: React.ReactNode, isEnterprise = true) {
  setWorkspace(isEnterprise)
  const appStore = createAppStore()
  appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: AUTH_RESULT.user })
  return render(<MemoryRouter initialEntries={['/console/enterprise']}><Provider store={appStore}><AppStoreProvider>{element}</AppStoreProvider></Provider></MemoryRouter>)
}

async function selectSemiOption(user: ReturnType<typeof userEvent.setup>, combobox: HTMLElement, optionName: string | RegExp): Promise<void> {
  await user.click(combobox)
  let option: HTMLElement | undefined
  await waitFor(() => {
    option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((candidate) => {
      const label = candidate.textContent?.trim() ?? ''
      return typeof optionName === 'string' ? label === optionName : optionName.test(label)
    })
    expect(option).toBeTruthy()
  })
  fireEvent.click(option!)
}

function mockDownload() {
  if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:enterprise' })
  if (!URL.revokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined })
  return {
    createObjectURL: vi.spyOn(URL, 'createObjectURL'),
    revokeObjectURL: vi.spyOn(URL, 'revokeObjectURL'),
    click: vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  clearAuthTokens()
  window.localStorage.clear()
  saveAuthTokens(AUTH_RESULT)
  getEnterpriseContextMock.mockResolvedValue(CONTEXT)
  getEnterpriseGovernanceMock.mockResolvedValue(GOVERNANCE)
  getAllEnterpriseMembersMock.mockResolvedValue([MEMBER])
  getEnterpriseMembersMock.mockResolvedValue(memberPage())
  getEnterpriseMemberMock.mockResolvedValue(MEMBER)
  getEnterpriseTagsMock.mockResolvedValue([TAG])
  getEnterpriseJoinRequestsMock.mockResolvedValue(joinRequestPage())
  getEnterpriseInvitationsMock.mockResolvedValue(invitationPage())
  getEnterpriseInvitationUsagesMock.mockResolvedValue([])
  getEnterpriseUsageMock.mockResolvedValue(usageResponse())
  getEnterpriseAnalyticsMock.mockResolvedValue(analyticsResponse())
  getEnterpriseAuditLogsMock.mockResolvedValue(auditPage())
  getEnterpriseAuditLogMock.mockResolvedValue(AUDIT_EVENT)
  reviewEnterpriseJoinRequestMock.mockResolvedValue({ ...JOIN_REQUEST, status: 'approved' })
  createEnterpriseInvitationMock.mockResolvedValue(INVITATION)
  updateEnterpriseInvitationMock.mockResolvedValue({ ...INVITATION, status: 'revoked', role: '', role_name: '', inviter_name: '' })
  createEnterpriseRoleMock.mockResolvedValue({ ...GOVERNANCE_ROLES[2], id: 'role-content-reviewer', code: 'content_reviewer', name: '内容审核员', description: '负责内容审核', permission_codes: [] })
  createEnterpriseTagMock.mockResolvedValue({ ...TAG, id: 'tag-new', name: '新标签', description: '', allowed_models: [] })
  updateEnterpriseRoleMock.mockResolvedValue({ ...GOVERNANCE_ROLES[1], name: '工程角色', version: 3 })
  updateEnterpriseTagMock.mockResolvedValue({ ...TAG, version: 2 })
  deleteEnterpriseRoleMock.mockResolvedValue(undefined)
  updateEnterpriseMemberRoleMock.mockResolvedValue({ ...MEMBER, role: 'data_analyst', roles: ['data_analyst'], version: 4 })
  updateEnterpriseMemberTagMock.mockResolvedValue({ ...MEMBER, tags: [] })
})

describe('企业控制台共享业务逻辑', () => {
  it('校验自定义日期范围并导出带 BOM 的 CSV', () => {
    expect(validateEnterpriseDateRange('', '2026-07-29')).toBe('请选择开始日期和结束日期')
    expect(validateEnterpriseDateRange('2026-07-30', '2026-07-29')).toBe('开始日期不能晚于结束日期')
    expect(validateEnterpriseDateRange('2026-07-29', '2026-07-29')).toBe('')

    const download = mockDownload()
    exportEnterpriseCsv('enterprise.csv', ['名称', '说明'], [['成员', '含"引号"']])
    expect(download.createObjectURL).toHaveBeenCalledOnce()
    expect(download.click).toHaveBeenCalledOnce()
    expect(download.revokeObjectURL).toHaveBeenCalledOnce()
  })

  it('共享校验错误组件使用可访问的错误提示', () => {
    render(<EnterpriseValidationError message="日期范围无效" />)
    expect(screen.getByRole('alert')).toHaveTextContent('日期范围无效')
  })
})

describe('企业权限与标签治理页面', () => {
  it('按权限依赖自动补齐并级联移除权限', () => {
    expect(updatePermissionSelection('members.invite', true, [], GOVERNANCE_PERMISSIONS)).toEqual(['members.view', 'members.invite'])
    expect(updatePermissionSelection('members.view', false, ['members.view', 'members.invite'], GOVERNANCE_PERMISSIONS)).toEqual([])
  })

  it('企业角色权限列表过滤基础 API 密钥权限并清理角色遗留授权', async () => {
    const user = userEvent.setup()
    getEnterpriseGovernanceMock.mockResolvedValueOnce({
      ...GOVERNANCE,
      permissions: [...GOVERNANCE_PERMISSIONS, { id: 'permission-keys-view', code: 'keys.view', name: '查看 API 密钥', description: '基础菜单权限', resource: 'keys', action: 'view', depends_on: [] }],
      roles: GOVERNANCE_ROLES.map((role) => role.id === 'role-engineering' ? { ...role, permission_codes: ['members.view', 'keys.view'] } : role),
    })

    renderPage(<EnterpriseGovernancePage />)

    await user.click(await screen.findByRole('button', { name: /工程成员/ }))
    expect(screen.queryByText('API 密钥')).toBeNull()
    await user.click(screen.getByRole('button', { name: '保存权限' }))

    await waitFor(() => expect(updateEnterpriseRoleMock).toHaveBeenCalledWith(
      { enterprise_id: ENTERPRISE_ID },
      'role-engineering',
      { name: '工程成员', description: '研发团队成员', permission_codes: ['members.view'], expected_version: 2 },
    ))
  })

  it('角色管理初次加载不请求成员目录，进入标签页后再按需读取', async () => {
    const user = userEvent.setup()
    renderPage(<EnterpriseGovernancePage />)

    expect(await screen.findByRole('tab', { name: '角色' })).toBeInTheDocument()
    expect(getAllEnterpriseMembersMock).not.toHaveBeenCalled()
    await user.click(screen.getByRole('tab', { name: '标签' }))
    await waitFor(() => expect(getAllEnterpriseMembersMock).toHaveBeenCalledOnce())
  })

  it('使用动态角色目录创建角色并提交依赖权限', async () => {
    const user = userEvent.setup()
    renderPage(<EnterpriseGovernancePage />)

    expect(await screen.findByRole('button', { name: /工程成员/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /数据分析员/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '创建自定义角色' }))

    await user.type(screen.getByLabelText('角色名称'), '内容审核员')
    await user.type(screen.getByLabelText('角色说明'), '负责内容审核')
    await user.click(within(screen.getByRole('dialog', { name: '创建自定义角色' })).getByRole('button', { name: 'confirm' }))

    await waitFor(() => expect(createEnterpriseRoleMock).toHaveBeenCalledWith(
      { enterprise_id: ENTERPRISE_ID },
      { name: '内容审核员', description: '负责内容审核', permission_codes: [] },
    ))
    await user.click(screen.getByRole('checkbox', { name: /邀请成员/ }))
    expect(screen.getByRole('checkbox', { name: /查看成员/ })).toBeChecked()
    await user.click(screen.getByRole('button', { name: '保存权限' }))

    await waitFor(() => expect(updateEnterpriseRoleMock).toHaveBeenCalledWith(
      { enterprise_id: ENTERPRISE_ID },
      'role-content-reviewer',
      { name: '内容审核员', description: '负责内容审核', permission_codes: ['members.view', 'members.invite'], expected_version: 1 },
    ))
  })

  it('创建角色接口返回空权限字段时仍可进入编辑器', async () => {
    const user = userEvent.setup()
    createEnterpriseRoleMock.mockResolvedValueOnce({
      ...GOVERNANCE_ROLES[2],
      id: 'role-empty-permissions',
      code: 'empty_permissions',
      name: '空权限角色',
      description: '等待配置权限',
      permission_codes: null,
    } as unknown as EnterpriseRole)
    renderPage(<EnterpriseGovernancePage />)

    await user.click(await screen.findByRole('button', { name: '创建自定义角色' }))
    await user.type(screen.getByLabelText('角色名称'), '空权限角色')
    await user.type(screen.getByLabelText('角色说明'), '等待配置权限')
    await user.click(within(screen.getByRole('dialog', { name: '创建自定义角色' })).getByRole('button', { name: 'confirm' }))

    expect(await screen.findByRole('button', { name: /空权限角色/ })).toBeInTheDocument()
    const memberViewPermission = screen.getByRole('checkbox', { name: '查看成员' })
    expect(memberViewPermission).not.toBeChecked()
    await user.click(memberViewPermission)
    await user.click(screen.getByRole('button', { name: '保存权限' }))

    await waitFor(() => expect(updateEnterpriseRoleMock).toHaveBeenCalledWith(
      { enterprise_id: ENTERPRISE_ID },
      'role-empty-permissions',
      { name: '空权限角色', description: '等待配置权限', permission_codes: ['members.view'], expected_version: 1 },
    ))
  })

  it('创建标签接口返回空模型字段时仍可进入编辑器', async () => {
    const user = userEvent.setup()
    createEnterpriseTagMock.mockResolvedValueOnce({
      ...TAG,
      id: 'tag-empty-models',
      name: '空模型标签',
      description: '',
      daily_cost_limit_yuan: null,
      weekly_cost_limit_yuan: null,
      monthly_cost_limit_yuan: null,
      concurrency_limit: null,
      rpm_limit: null,
      tpm_limit: null,
      allowed_models: null,
      member_count: 0,
    } as unknown as EnterpriseTag)
    renderPage(<EnterpriseGovernancePage />)

    await user.click(await screen.findByRole('tab', { name: '标签' }))
    await user.click(screen.getByRole('button', { name: '创建员工标签' }))
    await user.type(screen.getByLabelText('标签名称'), '空模型标签')
    await user.click(within(screen.getByRole('dialog', { name: '创建员工标签' })).getByRole('button', { name: 'confirm' }))

    expect(await screen.findByRole('button', { name: /空模型标签/ })).toBeInTheDocument()
    const models = screen.getByLabelText('允许使用的模型')
    expect(models).toHaveValue('')
    await user.type(models, 'gpt-4o')
    await user.click(screen.getByRole('button', { name: '保存策略' }))

    await waitFor(() => expect(updateEnterpriseTagMock).toHaveBeenCalledWith(
      { enterprise_id: ENTERPRISE_ID },
      'tag-empty-models',
      {
        name: '空模型标签', description: '', daily_cost_limit_yuan: null, weekly_cost_limit_yuan: null, monthly_cost_limit_yuan: null,
        concurrency_limit: null, rpm_limit: null, tpm_limit: null, allowed_models: ['gpt-4o'], expected_version: 1,
      },
    ))
  })

  it('标签页显示动态成员绑定计数', async () => {
    const user = userEvent.setup()
    renderPage(<EnterpriseGovernancePage />)

    await user.click(await screen.findByRole('tab', { name: '标签' }))
    const tagList = await screen.findByRole('complementary', { name: '员工标签' })
    expect(tagList).toHaveTextContent('1 名成员')
    await user.click(screen.getByRole('button', { name: /研发/ }))
    expect(screen.getByText('张三')).toBeInTheDocument()
  })

  it('按设计稿解除成员标签绑定并同步标签成员数', async () => {
    const user = userEvent.setup()
    renderPage(<EnterpriseGovernancePage />)

    await user.click(await screen.findByRole('tab', { name: '标签' }))
    await user.click(await screen.findByRole('button', { name: /研发/ }))
    await user.click(screen.getByRole('button', { name: '解除绑定' }))

    await waitFor(() => expect(updateEnterpriseMemberTagMock).toHaveBeenCalledWith(
      { enterprise_id: ENTERPRISE_ID },
      MEMBER.id,
      { tag_id: '', expected_version: MEMBER.version },
    ))
    expect(screen.getByRole('complementary', { name: '员工标签' })).toHaveTextContent('0 名成员')
    expect(screen.getByText('当前暂无绑定成员。')).toBeInTheDocument()
  })
})

describe('企业人员管理页面', () => {
  it('个人空间访问时显示门禁且不请求企业上下文', async () => {
    renderPage(<MembersPage />, false)
    expect(await screen.findByText('请先切换到企业空间，再查看企业控制台数据。')).toBeInTheDocument()
    expect(getEnterpriseContextMock).not.toHaveBeenCalled()
  })

  it('加载成员、按角色筛选并在详情请求期间显示加载态', async () => {
    const user = userEvent.setup()
    let resolveDetail: (member: EnterpriseMember) => void = () => undefined
    getEnterpriseMemberMock.mockReturnValue(new Promise((resolve) => { resolveDetail = resolve }))
    renderPage(<MembersPage />)

    expect(await screen.findByText('张三')).toBeInTheDocument()
    await selectSemiOption(user, screen.getByRole('combobox', { name: '角色' }), '数据分析员')
    await waitFor(() => expect(getEnterpriseMembersMock).toHaveBeenCalledWith(expect.objectContaining({ enterprise_id: ENTERPRISE_ID }), expect.objectContaining({ role: 'data_analyst' })))

    await user.click(screen.getByRole('button', { name: '查看详情' }))
    expect(await screen.findByText('正在读取成员详情...')).toBeInTheDocument()
	resolveDetail(MEMBER)
	expect(await screen.findByText('138****0001')).toBeInTheDocument()
  })

  it('成员未绑定标签时按空数组展示，不因 null 标签崩溃', async () => {
    getEnterpriseMembersMock.mockResolvedValue(memberPage({ items: [{ ...MEMBER, tags: null as unknown as EnterpriseMember['tags'] }] }))
    renderPage(<MembersPage />)

    expect(await screen.findByText('未分组')).toBeInTheDocument()
  })

  it('审核加入申请、创建邀请链接并反馈版本冲突', async () => {
    const user = userEvent.setup()
    const defaultAssignableRole = CONTEXT.role_options?.find((option) => !option.owner_role)?.code ?? ''
    renderPage(<MembersPage />)

    await user.click(await screen.findByRole('tab', { name: /加入申请/ }))
    await user.click(await screen.findByRole('button', { name: '审核' }))
    await user.click(screen.getByRole('button', { name: '批准加入' }))
    await waitFor(() => expect(reviewEnterpriseJoinRequestMock).toHaveBeenCalledWith(expect.objectContaining({ enterprise_id: ENTERPRISE_ID }), JOIN_REQUEST.id, { action: 'approve', role: 'data_analyst' }))

    await user.click(screen.getByRole('tab', { name: '邀请' }))
    createEnterpriseInvitationMock.mockResolvedValueOnce({ ...INVITATION, invite_url: '/join?token=token%2Fabc' })
    await user.click(await screen.findByRole('button', { name: '创建邀请链接' }))
    const expiryInput = document.querySelector<HTMLInputElement>('.enterprise-invitation-date-picker input')
    expect(expiryInput).not.toBeNull()
    fireEvent.change(expiryInput!, { target: { value: '2026-07-30' } })
    await user.click(screen.getByRole('button', { name: 'confirm' }))
    const expectedInvitationExpiry = new Date(2026, 6, 30, 23, 59, 59, 999).getTime()
    await waitFor(() => expect(createEnterpriseInvitationMock).toHaveBeenCalledWith(expect.objectContaining({ enterprise_id: ENTERPRISE_ID }), { role: defaultAssignableRole, max_uses: 10, expires_at: expectedInvitationExpiry }))
    const expectedInvitationURL = `${window.location.origin}/join?token=token%2Fabc`
    expect(await screen.findByRole('textbox', { name: '邀请链接' })).toHaveValue(expectedInvitationURL)
    await user.click(screen.getByRole('button', { name: '完成' }))
    expect(screen.getByText(expectedInvitationURL, { selector: 'code' })).toBeInTheDocument()

    updateEnterpriseMemberRoleMock.mockRejectedValueOnce(new ApiError('版本冲突', 409, 140004, 'request_conflict'))
    await user.click(screen.getByRole('tab', { name: '成员' }))
    await user.click(await screen.findByRole('button', { name: '查看详情' }))
    const roleSelect = screen.getByRole('combobox', { name: '企业角色' })
    await selectSemiOption(user, roleSelect, '数据分析员')
    expect(roleSelect).toHaveTextContent('数据分析员')
    await user.click(screen.getByRole('button', { name: '保存角色' }))
    await waitFor(() => expect(updateEnterpriseMemberRoleMock).toHaveBeenCalledWith(expect.objectContaining({ enterprise_id: ENTERPRISE_ID }), MEMBER.id, { role: 'data_analyst', expected_version: MEMBER.version }))
    expect(await screen.findByText('企业资源已被其他操作更新，请刷新后重试')).toHaveClass('enterprise-inline-error')
  })

  it('邀请列表永久展示完整链接，并支持打开预览、重新生成和撤销', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const regenerated = { ...INVITATION, id: 'invite_regenerated', invite_url: '/join?token=new-token', version: 1 }
    updateEnterpriseInvitationMock.mockResolvedValueOnce(regenerated).mockResolvedValueOnce({ ...regenerated, status: 'revoked', invite_url: undefined, role: '', role_name: '', inviter_name: '' })
    renderPage(<MembersPage />)

    await user.click(await screen.findByRole('tab', { name: '邀请' }))
    const fullURL = 'https://example.invalid/invite/test'
    expect(await screen.findByText(fullURL, { selector: 'code' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '打开预览' })).toHaveAttribute('href', fullURL)

    await user.click(screen.getByRole('button', { name: '重新生成' }))
    expect(confirm).toHaveBeenCalledWith('确定重新生成“数据分析员”邀请链接吗？原链接会立即撤销。')
    expect(await screen.findByRole('textbox', { name: '邀请链接' })).toHaveValue(`${window.location.origin}/join?token=new-token`)
    await user.click(screen.getByRole('button', { name: '完成' }))
    expect(screen.getByText('已撤销')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '撤销' }))
    expect(confirm).toHaveBeenCalledWith('确定撤销“数据分析员”邀请链接吗？撤销后不能继续加入企业。')
    await waitFor(() => expect(updateEnterpriseInvitationMock).toHaveBeenLastCalledWith({ enterprise_id: ENTERPRISE_ID }, regenerated.id, { action: 'revoke', expected_version: regenerated.version }))
    confirm.mockRestore()
  })

  it('接口失败时展示可重试错误态', async () => {
    getEnterpriseMembersMock.mockRejectedValueOnce(new ApiError('服务不可用', 503, 140006, 'request_members'))
    renderPage(<MembersPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('企业控制台服务暂时不可用，请稍后重试')
    expect(screen.getByText('请求 ID：request_members')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新加载' })).toBeInTheDocument()
  })
})

describe('企业用量和数据分析页面', () => {
  it('企业用量权限不足时不请求业务数据', async () => {
    getEnterpriseContextMock.mockResolvedValue({ ...CONTEXT, capabilities: { ...CONTEXT.capabilities, can_view_usage: false } })
    renderPage(<EnterpriseUsagePage />)
    expect(await screen.findByText('当前成员没有查看此企业页面的权限，请联系企业所有者或管理员。')).toBeInTheDocument()
    expect(getEnterpriseUsageMock).not.toHaveBeenCalled()
  })

  it('加载用量并在明细按成员筛选，支持统一的自定义日期选择', async () => {
    const user = userEvent.setup()
    renderPage(<EnterpriseUsagePage />)
    expect((await screen.findAllByText('请求数')).length).toBeGreaterThan(0)
    expect(await screen.findByText('2026-07')).toBeInTheDocument()
    expect(screen.getAllByText('¥12.500').length).toBeGreaterThan(0)
    expect(screen.getAllByTitle('¥12.500000000').length).toBeGreaterThan(0)
    expect(screen.queryByText('¥12.50000000')).not.toBeInTheDocument()
    expect(screen.getByText(/并发 8/)).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '用量明细' }))
    await selectSemiOption(user, screen.getByRole('combobox', { name: '选择成员...' }), /张三/)
    await waitFor(() => expect(getEnterpriseUsageMock).toHaveBeenCalledWith(expect.objectContaining({ enterprise_id: ENTERPRISE_ID }), expect.objectContaining({ member_id: MEMBER.id })))

    await user.click(screen.getByRole('button', { name: /选择时间范围/ }))
    await user.click(screen.getByRole('button', { name: '自定义' }))
    await user.click(screen.getByRole('button', { name: '应用' }))
    await waitFor(() => expect(getEnterpriseUsageMock).toHaveBeenCalledWith(expect.objectContaining({ enterprise_id: ENTERPRISE_ID }), expect.objectContaining({ member_id: MEMBER.id, range: 'custom', start_at: expect.any(Number), end_at: expect.any(Number) })))
  })

  it('空成员用量使用业务空态而不是伪造数据', async () => {
    getEnterpriseUsageMock.mockResolvedValueOnce(usageResponse({ members: [], total_members: 0 }))
    renderPage(<EnterpriseUsagePage />)
    expect(await screen.findByText('暂无企业用量')).toBeInTheDocument()
  })

  it('按设计稿切换用量明细并展示 API 密钥维度', async () => {
    const user = userEvent.setup()
    const detail = {
      member_id: MEMBER.id,
      member_name: MEMBER.display_name,
      metrics: METRICS,
      trend: TREND,
      models: [{ id: 'model-test', code: 'gpt-test', name: '测试模型', alias: 'gpt-public', requests: 12, input_tokens: 1200, output_tokens: 600, cached_tokens: 200, cost_yuan: '12.500000000', average_latency_ms: 1250 }],
      api_keys: [{ id: 'key-enterprise', name: '企业 API', requests: 12, input_tokens: 1200, output_tokens: 600, cached_tokens: 200, cost_yuan: '12.500000000', average_latency_ms: 1250 }],
      sources: [{ code: 'api', name: 'API 调用', requests: 12, input_tokens: 1200, output_tokens: 600, cached_tokens: 200, cost_yuan: '12.500000000', average_latency_ms: 1250 }],
    }
    getEnterpriseUsageMock.mockResolvedValueOnce(usageResponse()).mockResolvedValueOnce(usageResponse()).mockResolvedValueOnce(usageResponse({ member_detail: detail }))
    renderPage(<EnterpriseUsagePage />)

    await screen.findByRole('tab', { name: '用量看板' })
    await user.click(screen.getByRole('tab', { name: '用量明细' }))
    await selectSemiOption(user, screen.getByRole('combobox', { name: '选择成员...' }), /张三/)
    await waitFor(() => expect(getEnterpriseUsageMock).toHaveBeenCalledWith(expect.objectContaining({ enterprise_id: ENTERPRISE_ID }), expect.objectContaining({ member_id: MEMBER.id })))
    expect((await screen.findAllByText('张三', { exact: true })).length).toBeGreaterThan(0)
    expect(screen.getByText('按 API 密钥')).toBeInTheDocument()
    expect(screen.getByText('企业 API')).toBeInTheDocument()
    expect(screen.getByText(/趋势与维度为所选范围的聚合视图/)).toBeInTheDocument()
  })

  it('成员看板支持搜索、额度状态和标签策略展示', async () => {
    const user = userEvent.setup()
    const nearMember: EnterpriseMemberUsage = { ...usageResponse().members[0], member_id: 'member_near', member_name: '李四', cost_yuan: '90.000000000', budget: { ...MEMBER.budget!, used_cost_yuan: '90.000000000', usage_percent: 90 } }
    getEnterpriseUsageMock.mockResolvedValueOnce(usageResponse({ members: [usageResponse().members[0], nearMember], total_members: 2 }))
    renderPage(<EnterpriseUsagePage />)

    expect((await screen.findAllByText('研发')).length).toBeGreaterThan(0)
    await selectSemiOption(user, screen.getByRole('combobox', { name: '按额度状态筛选' }), '接近额度')
    await waitFor(() => expect(screen.getAllByRole('row').some((row) => row.textContent?.includes('李四'))).toBe(true))
    expect(screen.getAllByRole('row').some((row) => row.textContent?.includes('张三'))).toBe(false)
    await user.clear(screen.getByLabelText('搜索成员昵称或手机号'))
    await user.type(screen.getByLabelText('搜索成员昵称或手机号'), '李四')
    expect(screen.getAllByRole('row').some((row) => row.textContent?.includes('李四'))).toBe(true)
  })

  it('分析页切换趋势指标并支持导出当前结果', async () => {
    const user = userEvent.setup()
    const download = mockDownload()
    renderPage(<EnterpriseAnalyticsPage />)
    expect(await screen.findByTestId('usage-trend-chart')).toHaveAttribute('data-metric', 'requests')
    await user.click(screen.getByRole('button', { name: '费用' }))
    expect(screen.getByTestId('usage-trend-chart')).toHaveAttribute('data-metric', 'cost')
    const exportButton = screen.getByRole('button', { name: '导出全部数据' })
    expect(exportButton.parentElement).toHaveClass('page-actions')
    await user.click(exportButton)
    expect(download.click).toHaveBeenCalledOnce()
  })
})

describe('企业操作日志页面', () => {
  it('筛选日志、打开详情并导出当前日志', async () => {
    const user = userEvent.setup()
    let resolveDetail: (event: EnterpriseAuditLog) => void = () => undefined
    getEnterpriseAuditLogMock.mockReturnValue(new Promise((resolve) => { resolveDetail = resolve }))
    const download = mockDownload()
    renderPage(<EnterpriseAuditLogPage />)

    expect(await screen.findByText(AUDIT_EVENT.summary)).toBeInTheDocument()
    await selectSemiOption(user, screen.getByRole('combobox', { name: '结果' }), '失败')
    await waitFor(() => expect(getEnterpriseAuditLogsMock).toHaveBeenCalledWith(expect.objectContaining({ enterprise_id: ENTERPRISE_ID }), expect.objectContaining({ result: 'failed' })))
    await user.click(screen.getByRole('button', { name: '查看详情' }))
    expect(await screen.findByText('正在读取操作详情...')).toBeInTheDocument()
    resolveDetail(AUDIT_EVENT)
    expect(await screen.findByText('data_analyst')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '导出当前日志' }))
    expect(download.click).toHaveBeenCalledOnce()
  })

  it('操作日志使用统一的自定义日期选择并提交时间参数', async () => {
    const user = userEvent.setup()
    renderPage(<EnterpriseAuditLogPage />)
    await screen.findByText(AUDIT_EVENT.summary)
    await user.click(screen.getByRole('button', { name: /选择时间范围/ }))
    await user.click(screen.getByRole('button', { name: '自定义' }))
    await user.click(screen.getByRole('button', { name: '应用' }))
    await waitFor(() => expect(getEnterpriseAuditLogsMock).toHaveBeenCalledWith(expect.objectContaining({ enterprise_id: ENTERPRISE_ID }), expect.objectContaining({ start_at: expect.any(Number), end_at: expect.any(Number) })))
  })
})
