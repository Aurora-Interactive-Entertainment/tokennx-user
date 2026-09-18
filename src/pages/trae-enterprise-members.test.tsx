import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { getEnterpriseMembers, getEnterpriseDepartments, updateEnterpriseMemberRole, updateEnterpriseMemberDepartment, batchUpdateEnterpriseMembers, removeEnterpriseMember, getEnterpriseDepartment, updateEnterpriseDepartment, type EnterpriseContext, type EnterpriseMember } from '@/api/enterprise-console'
import { TraeEnterpriseMembersPage } from './trae-enterprise'

const fixture = vi.hoisted(() => ({
  context: { id: 'enterprise-test', name: '测试企业', member_id: 'owner', role: 'owner', roles: ['owner'], capabilities: {}, role_options: [] } as unknown as EnterpriseContext,
  navigate: vi.fn(),
  errorHandler: vi.fn(() => null),
}))
vi.mock('react-router', async (original) => ({ ...await original<object>(), useNavigate: () => fixture.navigate }))
vi.mock('@/api/enterprise-console', async (original) => ({ ...await original<object>(), getEnterpriseMembers: vi.fn(), getEnterpriseDepartments: vi.fn(), updateEnterpriseMemberRole: vi.fn(), updateEnterpriseMemberDepartment: vi.fn(), batchUpdateEnterpriseMembers: vi.fn(), removeEnterpriseMember: vi.fn(), getEnterpriseDepartment: vi.fn(), updateEnterpriseDepartment: vi.fn() }))
vi.mock('./enterprise-console-shared', () => ({ EnterprisePageShell: ({ children }: { children: (context: EnterpriseContext) => React.ReactNode }) => children(fixture.context), useEnterpriseErrorHandler: () => fixture.errorHandler, EnterpriseError: () => null, EnterpriseLoading: () => null, useEnterpriseConsoleContext: () => ({ context: fixture.context }) }))

const member = { id: 'member-test', user_id: 'user-1', display_name: '测试成员', masked_contact: 'test@example.com', status: 'active', join_source: 'invitation', joined_at: 1, role: 'finance_auditor', roles: ['finance_auditor'], version: '1' } as EnterpriseMember

async function openAction(name: string) {
  await screen.findByText('测试成员')
  fireEvent.click(screen.getByRole('button', { name: '更多操作 测试成员' }))
  fireEvent.click(screen.getByRole('button', { name }))
  return screen.findByRole('dialog')
}

describe('企业成员角色与部门修改', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fixture.context.role = "owner"
    fixture.context.permissions = undefined
    fixture.context.capabilities = {} as EnterpriseContext["capabilities"]
    fixture.context.role_options = [
      { code: 'finance_auditor', name: '财务审计员', owner_role: false },
      { code: 'administrator', name: '管理员', owner_role: false },
      { code: 'member', name: '成员', owner_role: false },
      { code: 'owner', name: '所有者', owner_role: true },
    ]
    vi.mocked(getEnterpriseMembers).mockResolvedValue({ items: [member], total: 1, page: 1, page_size: 100 } as never)
    vi.mocked(getEnterpriseDepartments).mockResolvedValue({ items: [{ id: 'department-real', name: '真实部门', parent_id: null, depth: 0, child_count: 0, member_count: 1, version: '1' }], total: 1, page: 1, page_size: 10 } as never)
    vi.mocked(updateEnterpriseMemberRole).mockResolvedValue(member)
    vi.mocked(updateEnterpriseMemberDepartment).mockResolvedValue(member)
  })

  it('显示并保留自定义角色，直接确认不会改成 member', async () => {
    render(<TraeEnterpriseMembersPage />)
    await screen.findByRole('gridcell', { name: '财务审计员' })
    const modal = await openAction('修改角色')
    expect(within(modal).getByRole('radio', { name: '财务审计员' })).toBeChecked()
    expect(within(modal).queryByRole('radio', { name: '所有者' })).toBeNull()
    fireEvent.click(within(modal).getByRole('button', { name: '确定' }))
    await waitFor(() => expect(updateEnterpriseMemberRole).toHaveBeenCalledWith({ enterprise_id: 'enterprise-test' }, 'member-test', { role: 'finance_auditor', expected_version: '1' }))
  })

  it('仍可显式选择管理员并提交原始目录代码', async () => {
    render(<TraeEnterpriseMembersPage />)
    const modal = await openAction('修改角色')
    fireEvent.click(within(modal).getByRole('radio', { name: /管理员/ }))
    fireEvent.click(within(modal).getByRole('button', { name: '确定' }))
    await waitFor(() => expect(updateEnterpriseMemberRole).toHaveBeenCalledWith({ enterprise_id: 'enterprise-test' }, 'member-test', { role: 'administrator', expected_version: '1' }))
  })

  it('旧服务未返回目录时保留管理员和成员选项', async () => {
    fixture.context.role_options = undefined
    vi.mocked(getEnterpriseMembers).mockResolvedValue({ items: [{ ...member, role: 'member', roles: ['member'] }], total: 1, page: 1, page_size: 100 } as never)
    render(<TraeEnterpriseMembersPage />)
    const modal = await openAction('修改角色')
    expect(within(modal).getAllByRole('radio')).toHaveLength(2)
    fireEvent.click(within(modal).getByRole('radio', { name: /管理员/ }))
    fireEvent.click(within(modal).getByRole('button', { name: '确定' }))
    await waitFor(() => expect(updateEnterpriseMemberRole).toHaveBeenCalledWith({ enterprise_id: 'enterprise-test' }, 'member-test', { role: 'administrator', expected_version: '1' }))
  })

  it('无真实部门时不允许提交虚拟根，选择真实部门后才发送请求', async () => {
    render(<TraeEnterpriseMembersPage />)
    const modal = await openAction('变更部门')
    const confirm = within(modal).getByRole('button', { name: '确定' })
    expect(confirm).toBeDisabled()
    fireEvent.click(within(modal).getByRole('button', { name: '部门' }))
    expect(within(modal).getByRole('button', { name: '测试企业' })).toBeDisabled()
    fireEvent.click(within(modal).getByRole('button', { name: 'Expand' }))
    fireEvent.click(within(modal).getByRole('button', { name: '真实部门' }))
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    await waitFor(() => expect(updateEnterpriseMemberDepartment).toHaveBeenCalledWith({ enterprise_id: 'enterprise-test' }, 'member-test', { department_id: 'department-real', expected_version: '1' }))
  })

  it('已有真实部门时默认保留当前部门', async () => {
    vi.mocked(getEnterpriseMembers).mockResolvedValue({ items: [{ ...member, department: { id: 'department-real', name: '真实部门' } }], total: 1, page: 1, page_size: 100 } as never)
    render(<TraeEnterpriseMembersPage />)
    const modal = await openAction('变更部门')
    expect(within(modal).getByRole('button', { name: '部门' })).toHaveTextContent('真实部门')
    expect(within(modal).getByRole('button', { name: '确定' })).toBeDisabled()
    expect(updateEnterpriseMemberDepartment).not.toHaveBeenCalled()
  })

  it('虚拟根不可选择但可展开，嵌套真实部门仍可提交', async () => {
    // 部门接口按 parent_id 返回直接子级，避免将平铺目录当作树接口响应。
    vi.mocked(getEnterpriseDepartments).mockImplementation(async (_, options) => ({ items: options?.parent_id
      ? [{ id: 'department-child', name: '嵌套真实部门', parent_id: 'department-real', depth: 1, child_count: 0, member_count: 1, version: '1' }]
      : [{ id: 'department-real', name: '真实部门', parent_id: null, depth: 0, child_count: 1, member_count: 1, version: '1' }],
      total: 1, page: 1, page_size: 100,
    } as never))
    render(<TraeEnterpriseMembersPage />)
    const modal = await openAction('变更部门')
    fireEvent.click(within(modal).getByRole('button', { name: '部门' }))
    expect(within(modal).getByRole('button', { name: '测试企业' })).toBeDisabled()
    const expandRoot = within(modal).getByRole('button', { name: 'Expand' })
    expect(expandRoot).toBeEnabled()
    // aria-disabled 会向后代传播，不能仅检查 HTML disabled 属性。
    expect(expandRoot.closest('[aria-disabled="true"]')).toBeNull()
    fireEvent.click(expandRoot)
    fireEvent.click(within(modal).getByRole('button', { name: 'Expand' }))
    fireEvent.click(within(modal).getByRole('button', { name: '嵌套真实部门' }))
    fireEvent.click(within(modal).getByRole('button', { name: '确定' }))
    await waitFor(() => expect(updateEnterpriseMemberDepartment).toHaveBeenCalledWith({ enterprise_id: 'enterprise-test' }, 'member-test', { department_id: 'department-child', expected_version: '1' }))
  })

  it('席位没有接口数据时展示未知，批量邀请保留选中项并明确未上线', async () => {
    vi.mocked(getEnterpriseMembers).mockResolvedValue({ items: [{ ...member, status: 'pending' }], total: 1, page: 1, page_size: 100 } as never)
    const info = vi.spyOn(Toast, 'info')
    const success = vi.spyOn(Toast, 'success')
    render(<TraeEnterpriseMembersPage />)
    await screen.findByText('测试成员')
    const seats = screen.getByLabelText('总席位数')
    expect(seats).not.toHaveTextContent('10')
    expect(seats).not.toHaveTextContent('4/10')
    expect(seats).toHaveTextContent('—')
    const selected = screen.getByRole('checkbox', { name: 'Select this row' })
    fireEvent.click(selected)
    fireEvent.click(screen.getByRole('button', { name: '发送邀请' }))
    expect(info).toHaveBeenCalledWith('发送邀请即将上线')
    expect(success).not.toHaveBeenCalled()
    expect(selected).toBeChecked()
  })

  it('移交所有者复用企业设置已有流程', async () => {
    vi.mocked(getEnterpriseMembers).mockResolvedValue({ items: [{ ...member, role: 'owner', roles: ['owner'] }], total: 1, page: 1, page_size: 100 } as never)
    const info = vi.spyOn(Toast, 'info')
    const success = vi.spyOn(Toast, 'success')
    render(<TraeEnterpriseMembersPage />)
    await screen.findByText('测试成员')
    fireEvent.click(screen.getByRole('button', { name: '更多操作 测试成员' }))
    fireEvent.click(screen.getByRole('button', { name: '移交超级管理员' }))
    expect(info).not.toHaveBeenCalled()
    expect(fixture.navigate).toHaveBeenCalledWith('/console/enterprise-settings#enterprise-ownership')
    expect(success).not.toHaveBeenCalled()
    expect(updateEnterpriseMemberRole).not.toHaveBeenCalled()
  })

  it('部门排序未接接口时不改变服务端目录展示顺序', async () => {
    vi.mocked(getEnterpriseDepartments).mockResolvedValue({ items: [
      { id: 'department-real', name: '真实部门', parent_id: null, depth: 0, child_count: 0, member_count: 1, version: '1' },
      { id: 'department-next', name: '第二部门', parent_id: null, depth: 0, child_count: 0, member_count: 1, version: '1' },
    ], total: 2, page: 1, page_size: 10 } as never)
    const info = vi.spyOn(Toast, 'info')
    const success = vi.spyOn(Toast, 'success')
    render(<TraeEnterpriseMembersPage />)
    await screen.findByText('测试成员')
    fireEvent.click(screen.getByRole('tab', { name: '部门管理' }))
    const before = screen.getAllByRole('row').map((row) => row.textContent)
    const menus = screen.getAllByRole('button', { name: '更多部门操作 真实部门' })
    fireEvent.click(menus[menus.length - 1])
    fireEvent.click(screen.getByRole('button', { name: '下移' }))
    expect(info).toHaveBeenCalledWith('下移即将上线')
    expect(success).not.toHaveBeenCalled()
    expect(screen.getAllByRole('row').map((row) => row.textContent)).toEqual(before)
  })
  it('成员提交进行中防止重复点击，批量改角色只请求事务接口', async () => {
    vi.mocked(getEnterpriseMembers).mockResolvedValue({ items: [member, { ...member, id: 'member-2', display_name: '第二成员' }], total: 2 } as never)
    let resolve!: (value: never) => void
    vi.mocked(batchUpdateEnterpriseMembers).mockImplementation(() => new Promise((done) => { resolve = done }))
    render(<TraeEnterpriseMembersPage />)
    await screen.findByText('第二成员')
    for (const checkbox of screen.getAllByRole('checkbox', { name: 'Select this row' })) fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: '修改角色' }))
    const modal = await screen.findByRole('dialog')
    const confirm = within(modal).getByRole('button', { name: '确定' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(confirm).toBeDisabled()
    expect(batchUpdateEnterpriseMembers).toHaveBeenCalledOnce()
    expect(updateEnterpriseMemberRole).not.toHaveBeenCalled()
    expect(batchUpdateEnterpriseMembers).toHaveBeenCalledWith({ enterprise_id: 'enterprise-test' }, { action: 'role', role: 'finance_auditor', members: [{ member_id: 'member-test', expected_version: '1' }, { member_id: 'member-2', expected_version: '1' }] })
    resolve({ items: [], updated: 2 } as never)
    await waitFor(() => expect(getEnterpriseMembers).toHaveBeenCalledTimes(2))
  })

  it('批量移除第二人失败时刷新已完成的结果，不显示整批成功', async () => {
    vi.mocked(getEnterpriseMembers).mockResolvedValue({ items: [member, { ...member, id: 'member-2', display_name: '第二成员' }], total: 2 } as never)
    vi.mocked(removeEnterpriseMember).mockResolvedValueOnce(member).mockRejectedValueOnce(new Error('版本冲突'))
    const success = vi.spyOn(Toast, 'success')
    render(<TraeEnterpriseMembersPage />)
    await screen.findByText('第二成员')
    for (const checkbox of screen.getAllByRole('checkbox', { name: 'Select this row' })) fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: '移除人员' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '移除人员' }))
    await waitFor(() => expect(removeEnterpriseMember).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(getEnterpriseMembers).toHaveBeenCalledTimes(2))
    expect(success).not.toHaveBeenCalled()
  })

  it('只读自定义角色禁用邀请、审核和人员写操作', async () => {
    fixture.context.role = 'auditor'
    fixture.context.permissions = ['members.view', 'departments.view']
    render(<TraeEnterpriseMembersPage />)
    await screen.findByText('测试成员')
    expect(screen.getByRole('button', { name: '链接邀请' })).toBeDisabled()
    expect(screen.getByRole('tab', { name: '申请列表' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: '新建部门' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '更多操作 测试成员' }))
    for (const name of ['修改角色', '变更部门', '移除人员']) expect(screen.getByRole('button', { name })).toBeDisabled()
  })

  it('旧部门列表缺少限制时先读取详情，编辑名称不会清空额度和限流配置', async () => {
    const limits = { daily_cost_limit_yuan: '100.00', weekly_cost_limit_yuan: '500.00', monthly_cost_limit_yuan: null, concurrency_limit: 3, rpm_limit: 0, tpm_limit: 1000 }
    vi.mocked(getEnterpriseDepartment).mockResolvedValue({ id: 'department-real', version: '1', limits: { configured: limits, effective: limits } } as never)
    vi.mocked(updateEnterpriseDepartment).mockResolvedValue({ id: 'department-real', version: '2' } as never)
    render(<TraeEnterpriseMembersPage />)
    await screen.findByText('测试成员')
    fireEvent.click(screen.getByRole('button', { name: '更多部门操作' }))
    fireEvent.click(screen.getByRole('button', { name: '编辑部门' }))
    const modal = await screen.findByRole('dialog')
    fireEvent.change(within(modal).getByLabelText('部门名称'), { target: { value: '更新名称' } })
    fireEvent.submit(modal.querySelector('form')!)
    await waitFor(() => expect(updateEnterpriseDepartment).toHaveBeenCalledWith({ enterprise_id: 'enterprise-test' }, 'department-real', { name: '更新名称', parent_id: '', expected_version: '1', ...limits }))
    expect(getEnterpriseDepartment).toHaveBeenCalledWith({ enterprise_id: 'enterprise-test' }, 'department-real')
  })

  it('部门列表显示真实人数而非演示的固定人数', async () => {
    vi.mocked(getEnterpriseDepartments).mockResolvedValue({ items: [{ id: 'department-real', name: '真实部门', depth: 0, child_count: 0, member_count: 17, version: '1' }], total: 1 } as never)
    render(<TraeEnterpriseMembersPage />)
    await screen.findByText('测试成员')
    fireEvent.click(screen.getByRole('tab', { name: '部门管理' }))
    expect(screen.getAllByRole('gridcell', { name: '17' })).toHaveLength(2)
  })

  it('部门搜索可以找到折叠分支内的部门，清空后恢复折叠状态', async () => {
    render(<TraeEnterpriseMembersPage />)
    await screen.findByText('测试成员')
    fireEvent.click(screen.getByRole('tab', { name: '部门管理' }))
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))
    expect(screen.queryByText('真实部门')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: '搜索部门' }), { target: { value: '真实' } })
    expect(screen.getByText('真实部门')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: '搜索部门' }), { target: { value: '' } })
    expect(screen.queryByText('真实部门')).not.toBeInTheDocument()
  })

})
