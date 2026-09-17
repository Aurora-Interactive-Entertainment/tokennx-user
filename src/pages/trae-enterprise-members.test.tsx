import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { getEnterpriseMembers, getEnterpriseDepartments, updateEnterpriseMemberRole, updateEnterpriseMemberDepartment, type EnterpriseContext, type EnterpriseMember } from '@/api/enterprise-console'
import { TraeEnterpriseMembersPage } from './trae-enterprise'

const fixture = vi.hoisted(() => ({
  context: { id: 'enterprise-test', name: '测试企业', member_id: 'owner', role: 'owner', roles: ['owner'], capabilities: {}, role_options: [] } as unknown as EnterpriseContext,
  errorHandler: vi.fn(() => null),
}))
vi.mock('@/api/enterprise-console', async (original) => ({ ...await original<object>(), getEnterpriseMembers: vi.fn(), getEnterpriseDepartments: vi.fn(), updateEnterpriseMemberRole: vi.fn(), updateEnterpriseMemberDepartment: vi.fn() }))
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
    fireEvent.click(within(modal).getByRole('button', { name: '确定' }))
    await waitFor(() => expect(updateEnterpriseMemberDepartment).toHaveBeenCalledWith({ enterprise_id: 'enterprise-test' }, 'member-test', { department_id: 'department-real', expected_version: '1' }))
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

  it('移交所有者未接接口时不会提示成功', async () => {
    vi.mocked(getEnterpriseMembers).mockResolvedValue({ items: [{ ...member, role: 'owner', roles: ['owner'] }], total: 1, page: 1, page_size: 100 } as never)
    const info = vi.spyOn(Toast, 'info')
    const success = vi.spyOn(Toast, 'success')
    render(<TraeEnterpriseMembersPage />)
    await screen.findByText('测试成员')
    fireEvent.click(screen.getByRole('button', { name: '更多操作 测试成员' }))
    fireEvent.click(screen.getByRole('button', { name: '移交超级管理员' }))
    expect(info).toHaveBeenCalledWith('移交超级管理员即将上线')
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
})
