import '@/i18n'
import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { EnterpriseContext, EnterpriseMember, EnterpriseOwnershipTransferResult } from '@/api/enterprise-console'
import type { EnterpriseMembership, UserProfile } from '@/api/profile'
import type { AppStoreValue, Workspace } from '@/data/app-state'
import { EnterpriseOwnershipCard } from './enterprise-ownership-card'

const mocks = vi.hoisted(() => ({
  context: vi.fn(), members: vi.fn(), memberships: vi.fn(), profile: vi.fn(), replace: vi.fn(), success: vi.fn(), error: vi.fn(),
  session: 'session-a', store: null as unknown as AppStoreValue,
  onTransferred: null as ((result: EnterpriseOwnershipTransferResult) => void) | null,
  initialProfile: null as UserProfile | null | undefined,
  visible: null as boolean | null,
  handleError: vi.fn((reason: unknown) => ({ message: reason instanceof Error ? reason.message : 'failed', requestId: null })),
}))

vi.mock('@/api/enterprise-console', () => ({ getEnterpriseContext: mocks.context, getAllEnterpriseMembers: mocks.members }))
vi.mock('@/api/profile', () => ({ getProfileEnterprises: mocks.memberships, getUserProfile: mocks.profile }))
vi.mock('@/auth/token-storage', () => ({ getAccessToken: () => 'test-token', getAuthSessionSnapshot: () => ({ sessionId: mocks.session }) }))
vi.mock('@/data/app-state', () => ({ useAppStore: () => mocks.store }))
vi.mock('@/pages/enterprise-console-shared', () => ({ useEnterpriseErrorHandler: () => mocks.handleError }))
vi.mock('./app-toast', () => ({ appToast: { success: mocks.success, error: mocks.error } }))
vi.mock('./common', () => ({ workspacesFromMemberships: (memberships: EnterpriseMembership[]) => memberships.map((item) => ({ id: item.enterprise_id, name: item.enterprise_name, type: 'enterprise', role: item.owner ? 'owner' : item.roles[0] })) }))
vi.mock('./enterprise-ownership-transfer-dialog', () => ({
  EnterpriseOwnershipTransferDialog: ({ visible, context, initialProfile, onClose, onRefresh, onTransferred }: {
    visible: boolean; context: EnterpriseContext; initialProfile?: UserProfile | null
    onClose: () => void; onRefresh: () => Promise<void>; onTransferred: (result: EnterpriseOwnershipTransferResult) => void
  }) => {
    const [value, setValue] = useState('')
    mocks.onTransferred = onTransferred
    mocks.initialProfile = initialProfile
    mocks.visible = visible
    // 真实弹窗关闭后仍保留实例交给 Semi 播放退场动效，这里用外层容器模拟实例保留、内容按 visible 收起。
    return <div data-testid="transfer-dialog-mount">
      {visible ? <div role="dialog">
        <input aria-label="verification" value={value} onChange={(event) => setValue(event.target.value)} />
        <span>{context.enterprise_version}</span>
        <button onClick={() => void onRefresh().catch(() => undefined)}>refresh</button>
        <button onClick={() => onTransferred(TRANSFER)}>finish</button>
        <button onClick={onClose}>close</button>
      </div> : null}
    </div>
  },
}))

const CONTEXT = {
  id: 'ent-a', name: '真实企业', code: 'ENT-A', member_id: 'owner-a', member_status: 'active',
  role: 'owner', roles: ['owner'], enterprise_version: '4', member_version: '6',
  capabilities: { can_transfer_ownership: true },
} as EnterpriseContext
const OWNER: EnterpriseMember = {
  id: 'owner-a', user_id: 'user-a', display_name: '真实所有者', avatar_url: '', masked_contact: '138****8000',
  status: 'active', role: 'owner', roles: ['owner'], join_source: 'owner', joined_at: 0, version: '6', tags: [],
}
const TARGET: EnterpriseMember = { ...OWNER, id: 'member-b', user_id: 'user-b', display_name: '受让成员', role: 'member', roles: ['member'], version: '2' }
const TRANSFER: EnterpriseOwnershipTransferResult = {
  transfer_id: 'transfer-1', enterprise_id: 'ent-a', enterprise_version: '5',
  previous_owner_member_id: 'owner-a', previous_owner_user_id: 'user-a', previous_owner_role: 'administrator', previous_owner_version: '7',
  new_owner_member_id: 'member-b', new_owner_user_id: 'user-b', new_owner_role: 'owner', new_owner_version: '3', transferred_at: 1, replayed: false,
}
const MEMBERSHIP = { enterprise_id: 'ent-a', enterprise_name: '真实企业', owner: false, roles: ['administrator'] } as EnterpriseMembership
const PROFILE: UserProfile = {
  id: 'user-a', display_name: '真实所有者', status: 'active',
  phone: { bound: true, masked_identifier: '138****8000' }, email: { bound: false, masked_identifier: '' },
}
const transferButton = () => screen.getByRole('button', { name: i18n.t('console.enterpriseSettings.transfer') })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.session = 'session-a'
  mocks.onTransferred = null
  mocks.initialProfile = undefined
  mocks.visible = null
  const workspace: Workspace = { id: 'ent-a', name: '真实企业', type: 'enterprise', role: 'owner' }
  mocks.store = { activeWorkspace: workspace, workspaces: [workspace], replaceEnterpriseWorkspaces: mocks.replace } as unknown as AppStoreValue
  mocks.context.mockResolvedValue(CONTEXT)
  mocks.members.mockResolvedValue([OWNER, TARGET])
  mocks.memberships.mockResolvedValue([MEMBERSHIP])
  mocks.profile.mockResolvedValue(PROFILE)
})

describe('企业所有权卡片', () => {
  it('个人空间不读取企业数据', () => {
    mocks.store.activeWorkspace = { id: 'personal', name: '个人空间', type: 'personal', role: 'owner' }
    render(<EnterpriseOwnershipCard />)
    expect(mocks.context).not.toHaveBeenCalled()
    expect(mocks.members).not.toHaveBeenCalled()
    expect(mocks.profile).not.toHaveBeenCalled()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it.each([
    { ...CONTEXT, capabilities: {} },
    { ...CONTEXT, enterprise_version: undefined },
    { ...CONTEXT, role: 'administrator', roles: ['administrator'] },
  ])('缺少能力、版本或所有者身份时禁止转让', async (context) => {
    mocks.context.mockResolvedValue(context)
    render(<EnterpriseOwnershipCard />)
    await screen.findByText('真实所有者')
    expect(transferButton()).toBeDisabled()
  })

  it('进入页面即预取账号资料并交给转让弹窗，弹窗无需自行读取', async () => {
    render(<EnterpriseOwnershipCard />)
    await screen.findByText('真实所有者')
    expect(mocks.profile).toHaveBeenCalledWith('test-token')
    // 弹窗常驻，资料在打开前就已就位，确认按钮首帧即是可用态。
    expect(mocks.initialProfile).toEqual(PROFILE)
    expect(mocks.visible).toBe(false)
  })

  it('资料预取失败不阻断所有者展示和转让入口，弹窗按无预取资料兜底', async () => {
    mocks.profile.mockRejectedValue(new Error('offline'))
    render(<EnterpriseOwnershipCard />)
    await screen.findByText('真实所有者')
    expect(transferButton()).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mocks.initialProfile).toBeNull()
  })

  it('关闭弹窗只切换 visible，实例留在页面上由 Semi 播放退场动效', async () => {
    render(<EnterpriseOwnershipCard />)
    await screen.findByText('真实所有者')
    fireEvent.click(transferButton())
    expect(mocks.visible).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    expect(mocks.visible).toBe(false)
    expect(screen.getByTestId('transfer-dialog-mount')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('加载真实所有者，刷新期间保留已打开弹窗的表单', async () => {
    render(<EnterpriseOwnershipCard />)
    await screen.findByText('真实所有者')
    fireEvent.click(transferButton())
    fireEvent.change(screen.getByLabelText('verification'), { target: { value: '123456' } })
    const pending = deferred<EnterpriseContext>()
    mocks.context.mockReturnValueOnce(pending.promise)
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('verification')).toHaveValue('123456')
    await act(async () => { pending.resolve({ ...CONTEXT, enterprise_version: '9' }) })
    expect(await screen.findByText('9')).toBeInTheDocument()
    expect(screen.getByLabelText('verification')).toHaveValue('123456')
  })

  it('转让成功立即降权，刷新失败仍展示新所有者且不能再次转让', async () => {
    render(<EnterpriseOwnershipCard />)
    await screen.findByText('真实所有者')
    fireEvent.click(transferButton())
    mocks.context.mockRejectedValueOnce(new Error('offline'))
    mocks.members.mockRejectedValueOnce(new Error('offline'))
    mocks.memberships.mockRejectedValueOnce(new Error('offline'))
    fireEvent.click(screen.getByRole('button', { name: 'finish' }))
    expect(mocks.replace).toHaveBeenCalledWith([expect.objectContaining({ id: 'ent-a', role: 'administrator' })])
    expect(await screen.findByText('受让成员')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('console.ownershipTransfer.refreshPending'))
    expect(transferButton()).toBeDisabled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // 延迟的读取结果不能将已经生效的转让回退到旧 owner 状态。
    mocks.memberships.mockResolvedValueOnce([{ ...MEMBERSHIP, owner: true, roles: ['owner'] }])
    fireEvent.click(screen.getByRole('button', { name: i18n.t('console.ownershipTransfer.refresh') }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByText('受让成员')).toBeInTheDocument()
    expect(mocks.replace).toHaveBeenLastCalledWith([expect.objectContaining({ role: 'administrator' })])
    expect(transferButton()).toBeDisabled()
  })

  it('页面因降权卸载后仍刷新工作空间，且忽略旧 owner 读副本结果', async () => {
    const page = render(<EnterpriseOwnershipCard />)
    await screen.findByText('真实所有者')
    fireEvent.click(transferButton())
    const memberships = deferred<EnterpriseMembership[]>()
    mocks.memberships.mockReturnValueOnce(memberships.promise)
    fireEvent.click(screen.getByRole('button', { name: 'finish' }))
    page.unmount()
    const beforeRefresh = mocks.replace.mock.calls.length
    await act(async () => { memberships.resolve([{ ...MEMBERSHIP, owner: true, roles: ['owner'] }]) })
    expect(mocks.replace.mock.calls.length).toBeGreaterThan(beforeRefresh)
    expect(mocks.replace).toHaveBeenLastCalledWith([expect.objectContaining({ role: 'administrator' })])
  })

  it('成功后切换登录会话时，迟到刷新不覆盖新账号的工作空间', async () => {
    const page = render(<EnterpriseOwnershipCard />)
    await screen.findByText('真实所有者')
    fireEvent.click(transferButton())
    const memberships = deferred<EnterpriseMembership[]>()
    mocks.memberships.mockReturnValueOnce(memberships.promise)
    fireEvent.click(screen.getByRole('button', { name: 'finish' }))
    page.unmount()
    const beforeRefresh = mocks.replace.mock.calls.length
    mocks.session = 'session-b'
    await act(async () => { memberships.resolve([MEMBERSHIP]) })
    expect(mocks.replace).toHaveBeenCalledTimes(beforeRefresh)
  })

  it('提交期间离开页面，迟到成功仍降权正确企业并完成后台刷新', async () => {
    const page = render(<EnterpriseOwnershipCard />)
    await screen.findByText('真实所有者')
    fireEvent.click(transferButton())
    const finishPendingTransfer = mocks.onTransferred!
    page.unmount()
    const otherWorkspace: Workspace = { id: 'ent-b', name: '另一个企业', type: 'enterprise', role: 'owner' }
    mocks.store.activeWorkspace = otherWorkspace
    mocks.store.workspaces = [...mocks.store.workspaces, otherWorkspace]
    mocks.memberships.mockResolvedValueOnce([
      { ...MEMBERSHIP, owner: true, roles: ['owner'] },
      { ...MEMBERSHIP, enterprise_id: 'ent-b', enterprise_name: '另一个企业', owner: true, roles: ['owner'] },
    ])
    await act(async () => { finishPendingTransfer(TRANSFER) })
    expect(mocks.context).toHaveBeenLastCalledWith({ enterprise_id: 'ent-a' }, expect.any(Object))
    expect(mocks.members).toHaveBeenLastCalledWith({ enterprise_id: 'ent-a' }, expect.any(Object))
    expect(mocks.memberships).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'ent-a', role: 'administrator' }),
      expect.objectContaining({ id: 'ent-b', role: 'owner' }),
    ])
    expect(mocks.success).toHaveBeenCalledOnce()
  })

  it('提交期间更换登录会话，迟到成功不修改新账号或继续请求', async () => {
    const page = render(<EnterpriseOwnershipCard />)
    await screen.findByText('真实所有者')
    fireEvent.click(transferButton())
    const finishPendingTransfer = mocks.onTransferred!
    page.unmount()
    mocks.session = 'session-b'
    await act(async () => { finishPendingTransfer(TRANSFER) })
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.context).toHaveBeenCalledOnce()
    expect(mocks.members).toHaveBeenCalledOnce()
    expect(mocks.memberships).not.toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalled()
  })
})
