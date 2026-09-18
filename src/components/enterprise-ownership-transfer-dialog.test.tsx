import i18n from '@/i18n'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/http'
import { getUserProfile, type UserProfile } from '@/api/profile'
import { sendEnterpriseOwnershipTransferCode, transferEnterpriseOwnership, type EnterpriseContext, type EnterpriseMember, type EnterpriseOwnershipTransferResult } from '@/api/enterprise-console'
import { EnterpriseOwnershipTransferDialog } from './enterprise-ownership-transfer-dialog'
import type { EnterpriseOwnershipTransferProps } from './use-enterprise-ownership-transfer'
import { appToast } from './app-toast'

const { handleError } = vi.hoisted(() => ({ handleError: vi.fn() }))
vi.mock('@/pages/enterprise-console-shared', () => ({ useEnterpriseErrorHandler: () => handleError }))
vi.mock('@/api/profile', async (original) => ({ ...await original<object>(), getUserProfile: vi.fn() }))
vi.mock('@/api/enterprise-console', async (original) => ({ ...await original<object>(), sendEnterpriseOwnershipTransferCode: vi.fn(), transferEnterpriseOwnership: vi.fn() }))
vi.mock('./app-toast', () => ({ appToast: { success: vi.fn(), error: vi.fn() } }))

const CONTEXT: EnterpriseContext = {
  id: 'enterprise-1', code: 'ENT-1', name: '测试企业', member_id: 'owner-1', member_status: 'active',
  role: 'owner', roles: ['owner'], enterprise_version: '9007199254740993', member_version: '6',
  capabilities: {
    can_manage_members: true, can_manage_roles: true, can_manage_tags: true, can_manage_models: true,
    can_manage_usage: true, can_view_models: true, can_view_usage: true, can_view_audit: true,
    can_view_analytics: true, can_transfer_ownership: true,
  },
}
const PROFILE: UserProfile = {
  id: 'user-owner', display_name: '原所有者', status: 'active',
  phone: { bound: true, masked_identifier: '138****8000' }, email: { bound: false, masked_identifier: '' },
}
function member(id: string, displayName: string, overrides: Partial<EnterpriseMember> = {}): EnterpriseMember {
  return { id, user_id: `user-${id}`, display_name: displayName, avatar_url: '', masked_contact: '139****8000',
    status: 'active', join_source: 'invitation', joined_at: 1, role: 'member', roles: ['member'], tags: [], version: '2', ...overrides }
}
const MEMBERS = [
  member('owner-1', '原所有者', { role: 'owner', roles: ['owner'] }),
  member('member-2', '可接收成员'),
  member('member-3', '冻结成员', { status: 'suspended' }),
  member('member-4', '已移除成员', { status: 'removed' }),
  member('member-5', '其他所有者', { role: 'member', roles: ['member', 'owner'] }),
]
const RESULT: EnterpriseOwnershipTransferResult = {
  transfer_id: 'transfer-1', enterprise_id: 'enterprise-1', enterprise_version: '9007199254740994',
  previous_owner_member_id: 'owner-1', previous_owner_user_id: 'user-owner', previous_owner_role: 'administrator', previous_owner_version: '7',
  new_owner_member_id: 'member-2', new_owner_user_id: 'user-member-2', new_owner_role: 'owner', new_owner_version: '3',
  transferred_at: 1789639200000, replayed: false,
}

function renderDialog(overrides: Partial<EnterpriseOwnershipTransferProps> = {}) {
  const props: EnterpriseOwnershipTransferProps = {
    visible: true, context: CONTEXT, members: MEMBERS, onClose: vi.fn(), onTransferred: vi.fn(), onRefresh: vi.fn().mockResolvedValue(undefined), ...overrides,
  }
  const view = render(<EnterpriseOwnershipTransferDialog {...props} />)
  return { ...view, props }
}

async function selectTarget() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '新所有者' }))
  await user.click(await screen.findByRole('option', { name: /可接收成员 · 139\*\*\*\*8000/ }))
  finishSelectAnimation()
  await waitFor(() => expect(screen.getByRole('combobox', { name: '新所有者' })).toHaveTextContent('可接收成员'))
}

function finishSelectAnimation() {
  // Semi 在弹出层退场结束后触发选值回调；jsdom 需显式完成 CSS 动画。
  document.querySelectorAll('[class*="animation-hide"]').forEach((element) => {
    fireEvent(element, new Event('webkitAnimationEnd', { bubbles: true }))
  })
}

async function fillVerification() {
  fireEvent.change(await screen.findByLabelText('当前绑定的手机'), { target: { value: '13800138000' } })
  fireEvent.click(screen.getByRole('button', { name: '发送验证码' }))
  await waitFor(() => expect(appToast.success).toHaveBeenCalledWith('验证码已发送至 138****8000'))
  fireEvent.change(screen.getByLabelText('验证码'), { target: { value: '123456' } })
}

async function fillTransferForm() {
  await selectTarget()
  await fillVerification()
}

function advanceSubmitWindow() {
  vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 1000)
}

describe('企业所有权转让弹窗', () => {
  afterEach(() => vi.restoreAllMocks())
  beforeEach(async () => {
    vi.resetAllMocks()
    await i18n.changeLanguage('zh-CN')
    handleError.mockImplementation((reason: unknown) => ({ message: reason instanceof Error ? reason.message : '请求失败', requestId: reason instanceof ApiError ? reason.requestId : null }))
    vi.mocked(getUserProfile).mockResolvedValue(PROFILE)
    vi.mocked(sendEnterpriseOwnershipTransferCode).mockResolvedValue({ destination_masked: '138****8000', expires_at: '2099-01-01T00:00:00Z', retry_after_seconds: 0 })
    vi.mocked(transferEnterpriseOwnership).mockResolvedValue(RESULT)
  })

  it('只展示正常非所有者成员，表单内点击确认转让直接提交，没有中间确认页', async () => {
    const { props } = renderDialog()
    await screen.findByLabelText('当前绑定的手机')
    fireEvent.click(screen.getByRole('combobox', { name: '新所有者' }))
    expect(await screen.findByRole('option', { name: /可接收成员 · 139\*\*\*\*8000/ })).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await userEvent.setup().click(screen.getByRole('option', { name: /可接收成员 · 139\*\*\*\*8000/ }))
    finishSelectAnimation()
    await fillVerification()
    expect(sendEnterpriseOwnershipTransferCode).toHaveBeenCalledWith({ enterprise_id: 'enterprise-1' }, { provider_code: 'phone', destination: '13800138000', country_code: '+86' })
    expect(transferEnterpriseOwnership).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '下一步' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '返回修改' })).not.toBeInTheDocument()
    expect(screen.getByText(/你将变为企业管理员并失去所有者专属权限/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认转让' }))
    await waitFor(() => expect(props.onTransferred).toHaveBeenCalledWith(RESULT))
    expect(transferEnterpriseOwnership).toHaveBeenCalledOnce()
    expect(screen.queryByRole('heading', { name: '确认转让企业所有权' })).not.toBeInTheDocument()
    expect(transferEnterpriseOwnership).toHaveBeenCalledWith({ enterprise_id: 'enterprise-1' }, {
      provider_code: 'phone', destination: '13800138000', code: '123456', target_member_id: 'member-2',
      enterprise_expected_version: '9007199254740993', current_owner_expected_version: '6', target_expected_version: '2', confirm: true,
    }, expect.stringMatching(/^ownership-/))
  })

  it('发码失败不会放行确认，邮箱使用当前绑定完整值且不发送国家码', async () => {
    vi.mocked(getUserProfile).mockResolvedValue({ ...PROFILE, phone: { bound: false, masked_identifier: '' }, email: { bound: true, masked_identifier: 'o***@example.com' } })
    vi.mocked(sendEnterpriseOwnershipTransferCode).mockRejectedValue(new ApiError('联系方式与当前绑定不一致', 400, 161002, 'request-contact'))
    renderDialog()
    await selectTarget()
    fireEvent.change(await screen.findByLabelText('当前绑定的邮箱'), { target: { value: 'Owner@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }))
    await waitFor(() => expect(appToast.error).toHaveBeenCalledWith(expect.stringContaining('联系方式与当前绑定不一致')))
    expect(sendEnterpriseOwnershipTransferCode).toHaveBeenCalledWith({ enterprise_id: 'enterprise-1' }, { provider_code: 'email', destination: 'Owner@example.com' })
    fireEvent.change(screen.getByLabelText('验证码'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: '确认转让' }))
    expect(screen.getByText('请先获取当前绑定联系方式的验证码')).toHaveAttribute('role', 'alert')
    expect(transferEnterpriseOwnership).not.toHaveBeenCalled()
  })

  it('网络失败允许原确认重试，并复用同一幂等键和请求体', async () => {
    vi.mocked(transferEnterpriseOwnership).mockRejectedValueOnce(new Error('网络暂时不可用')).mockResolvedValueOnce({ ...RESULT, replayed: true })
    const { props } = renderDialog()
    await fillTransferForm()
    fireEvent.click(screen.getByRole('button', { name: '确认转让' }))
    await waitFor(() => expect(appToast.error).toHaveBeenCalledWith('网络暂时不可用'))
    advanceSubmitWindow()
    fireEvent.click(screen.getByRole('button', { name: '确认转让' }))
    await waitFor(() => expect(props.onTransferred).toHaveBeenCalledOnce())
    const calls = vi.mocked(transferEnterpriseOwnership).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(calls[0])
  })

  it('提交过程中禁止重复提交和关闭，成功只通知一次', async () => {
    let resolveTransfer!: (result: EnterpriseOwnershipTransferResult) => void
    vi.mocked(transferEnterpriseOwnership).mockReturnValue(new Promise((resolve) => { resolveTransfer = resolve }))
    const { props } = renderDialog()
    await fillTransferForm()
    const submit = screen.getByRole('button', { name: '确认转让' })
    fireEvent.click(submit)
    // 超过防抖窗口后，请求仍在进行也不能再次提交。
    advanceSubmitWindow()
    fireEvent.click(submit)
    expect(submit).toBeDisabled()
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
    expect(screen.getByLabelText('验证码')).toBeDisabled()
    expect(screen.getByLabelText('当前绑定的手机')).toBeDisabled()
    expect(screen.getByRole('combobox', { name: '新所有者' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByRole('button', { name: 'close' })).not.toBeInTheDocument()
    expect(transferEnterpriseOwnership).toHaveBeenCalledOnce()
    await act(async () => resolveTransfer(RESULT))
    expect(props.onTransferred).toHaveBeenCalledOnce()
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('快速失败后 800ms 内连点不再请求，窗口结束后可手动重试', async () => {
    vi.mocked(transferEnterpriseOwnership).mockRejectedValueOnce(new Error('网络暂时不可用')).mockResolvedValueOnce(RESULT)
    const { props } = renderDialog()
    await fillTransferForm()
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000)
    const submit = screen.getByRole('button', { name: '确认转让' })
    fireEvent.click(submit)
    await waitFor(() => expect(appToast.error).toHaveBeenCalledWith('网络暂时不可用'))
    expect(submit).toBeEnabled()
    clock.mockReturnValue(1799)
    fireEvent.click(submit)
    fireEvent.click(submit)
    expect(transferEnterpriseOwnership).toHaveBeenCalledOnce()
    clock.mockReturnValue(1800)
    fireEvent.click(submit)
    await waitFor(() => expect(props.onTransferred).toHaveBeenCalledOnce())
    expect(transferEnterpriseOwnership).toHaveBeenCalledTimes(2)
  })

  it('失败后在原表单修改验证码再提交，会为新的请求内容生成新幂等键', async () => {
    vi.mocked(transferEnterpriseOwnership).mockRejectedValueOnce(new Error('网络暂时不可用')).mockResolvedValueOnce(RESULT)
    const { props } = renderDialog()
    await fillTransferForm()
    fireEvent.click(screen.getByRole('button', { name: '确认转让' }))
    await waitFor(() => expect(appToast.error).toHaveBeenCalledWith('网络暂时不可用'))
    fireEvent.change(screen.getByLabelText('验证码'), { target: { value: '654321' } })
    advanceSubmitWindow()
    fireEvent.click(screen.getByRole('button', { name: '确认转让' }))
    await waitFor(() => expect(props.onTransferred).toHaveBeenCalledOnce())
    const calls = vi.mocked(transferEnterpriseOwnership).mock.calls
    expect(calls[1]?.[1].code).toBe('654321')
    expect(calls[1]?.[2]).not.toBe(calls[0]?.[2])
  })

  it.each(['2000-01-01T00:00:00Z', '1789639200000', 'invalid', ''])('不按客户端解析的过期时间 %s 拦截，保留倒计时并交给提交接口校验', async (expiresAt) => {
    vi.mocked(sendEnterpriseOwnershipTransferCode).mockResolvedValue({ destination_masked: '138****8000', expires_at: expiresAt, retry_after_seconds: 90 })
    const { props } = renderDialog()
    await selectTarget()
    await fillVerification()
    expect(screen.getByRole('button', { name: '90 秒后重发' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '确认转让' }))
    expect(appToast.error).not.toHaveBeenCalled()
    await waitFor(() => expect(props.onTransferred).toHaveBeenCalledWith(RESULT))
  })

  it('发送成功仍用顶部提示，验证码缺失或格式错误显示字段提示并阻止提交', async () => {
    renderDialog()
    await selectTarget()
    await fillVerification()
    const dialog = within(screen.getByRole('dialog', { name: '转让企业所有权' }))
    expect(dialog.queryByText('验证码已发送至 138****8000')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('验证码'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '确认转让' }))
    fireEvent.click(screen.getByRole('button', { name: '确认转让' }))
    expect(appToast.error).not.toHaveBeenCalled()
    expect(dialog.getByRole('alert')).toHaveTextContent('请输入验证码')
    const code = screen.getByLabelText('验证码')
    expect(code).toBeRequired()
    expect(code).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(code, { target: { value: '12abc' } })
    fireEvent.click(screen.getByRole('button', { name: '确认转让' }))
    expect(dialog.getByRole('alert')).toHaveTextContent('请输入 6 位数字验证码')
    expect(transferEnterpriseOwnership).not.toHaveBeenCalled()
    fireEvent.change(code, { target: { value: '654321' } })
    expect(code).toHaveAttribute('aria-invalid', 'false')
    expect(dialog.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认转让' }))
    await waitFor(() => expect(transferEnterpriseOwnership).toHaveBeenCalledOnce())
  })

  it('移除冗余说明，确认转让同时校验三个必填字段并展示就地错误', async () => {
    renderDialog()
    const contact = await screen.findByLabelText('当前绑定的手机')
    const target = screen.getByRole('combobox', { name: '新所有者' })
    expect(contact).toBeRequired()
    expect(target).toHaveAttribute('aria-required', 'true')
    expect(document.querySelectorAll('.semi-form-field-label-required')).toHaveLength(3)
    expect(screen.queryByText(/选择一位企业成员作为新所有者/)).not.toBeInTheDocument()
    expect(screen.queryByText(/请输入你当前绑定的完整联系方式/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认转让' }))
    expect(target).toHaveAttribute('aria-invalid', 'true')
    expect(contact).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('请选择有效的新所有者。')).toHaveAttribute('role', 'alert')
    expect(screen.getByText('请输入当前绑定的手机')).toHaveAttribute('role', 'alert')
    expect(screen.getByText('请输入验证码')).toHaveAttribute('role', 'alert')
    expect(appToast.error).not.toHaveBeenCalled()
    expect(transferEnterpriseOwnership).not.toHaveBeenCalled()
    await selectTarget()
    expect(target).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByText('请选择有效的新所有者。')).not.toBeInTheDocument()
  })

  it.each([
    ['phone', '手机', '13800138000'],
    ['email', '邮箱', 'owner@example.com'],
  ] as const)('%s 的必填和格式错误阻止发码，修正后清除红框', async (provider, label, destination) => {
    vi.mocked(getUserProfile).mockResolvedValue({ ...PROFILE,
      phone: { bound: provider === 'phone', masked_identifier: '138****8000' },
      email: { bound: provider === 'email', masked_identifier: 'o***@example.com' },
    })
    renderDialog()
    const contact = await screen.findByLabelText(`当前绑定的${label}`)
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }))
    expect(screen.getByText(`请输入当前绑定的${label}`)).toBeInTheDocument()
    expect(sendEnterpriseOwnershipTransferCode).not.toHaveBeenCalled()
    fireEvent.change(contact, { target: { value: 'invalid' } })
    fireEvent.blur(contact)
    expect(screen.getByText(`请输入正确的已绑定${label}。`)).toBeInTheDocument()
    expect(contact).toHaveAttribute('aria-invalid', 'true')
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }))
    expect(sendEnterpriseOwnershipTransferCode).not.toHaveBeenCalled()
    fireEvent.change(contact, { target: { value: destination } })
    expect(contact).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByText(`请输入正确的已绑定${label}。`)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }))
    await waitFor(() => expect(sendEnterpriseOwnershipTransferCode).toHaveBeenCalledOnce())
  })

  it('版本冲突后刷新企业与成员，必须再次确认并用更新版本和新幂等键提交', async () => {
    vi.mocked(transferEnterpriseOwnership).mockRejectedValueOnce(new ApiError('资源已更新', 409, 140004, 'request-conflict')).mockResolvedValueOnce(RESULT)
    const view = renderDialog()
    vi.mocked(view.props.onRefresh).mockImplementation(async () => {
      view.rerender(<EnterpriseOwnershipTransferDialog {...view.props} context={{ ...CONTEXT, enterprise_version: '9007199254740994' }} members={MEMBERS.map((item) => item.id === 'member-2' ? { ...item, version: '3' } : item)} />)
    })
    await fillTransferForm()
    fireEvent.click(screen.getByRole('button', { name: '确认转让' }))
    await waitFor(() => expect(view.props.onRefresh).toHaveBeenCalledOnce())
    expect(await screen.findByRole('heading', { name: '转让企业所有权' })).toBeInTheDocument()
    expect(transferEnterpriseOwnership).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.getByRole('button', { name: '确认转让' })).toBeEnabled())
    advanceSubmitWindow()
    fireEvent.click(screen.getByRole('button', { name: '确认转让' }))
    await waitFor(() => expect(view.props.onTransferred).toHaveBeenCalledOnce())
    const calls = vi.mocked(transferEnterpriseOwnership).mock.calls
    expect(calls[1]?.[1]).toMatchObject({ enterprise_expected_version: '9007199254740994', target_expected_version: '3' })
    expect(calls[1]?.[2]).not.toBe(calls[0]?.[2])
  })

  it('接口拒绝验证码后保留表单并清空旧验证码，重新发码前不可提交', async () => {
    vi.mocked(transferEnterpriseOwnership).mockRejectedValueOnce(new ApiError('验证码已失效', 400, 160005, 'request-code'))
    renderDialog()
    await fillTransferForm()
    fireEvent.click(screen.getByRole('button', { name: '确认转让' }))
    await waitFor(() => expect(appToast.error).toHaveBeenCalledWith(expect.stringContaining('验证码已失效')))
    expect(screen.getByLabelText('验证码')).toHaveValue('')
    expect(appToast.error).toHaveBeenCalledWith(expect.stringContaining('验证码已失效'))
    expect(screen.queryByText('验证码已发送至 138****8000')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认转让' }))
    expect(screen.getByText('请输入验证码')).toHaveAttribute('role', 'alert')
    expect(transferEnterpriseOwnership).toHaveBeenCalledOnce()
  })

  it('卡片已预取资料时首帧即可确认并展示表单，不再自行读取资料', () => {
    renderDialog({ initialProfile: PROFILE })
    // 首帧就必须是可用态，否则弹窗打开动画中按钮会从禁用态跳变成可用态。
    expect(screen.getByRole('button', { name: '确认转让' })).toBeEnabled()
    expect(screen.getByLabelText('当前绑定的手机')).toBeInTheDocument()
    expect(getUserProfile).not.toHaveBeenCalled()
  })

  it('预取资料显示手机未绑定时直接使用邮箱', () => {
    renderDialog({ initialProfile: { ...PROFILE, phone: { bound: false, masked_identifier: '' }, email: { bound: true, masked_identifier: 'o***@example.com' } } })
    expect(screen.getByLabelText('当前绑定的邮箱')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认转让' })).toBeEnabled()
    expect(getUserProfile).not.toHaveBeenCalled()
  })

  it('关闭时保留实例播出退场动效，重新打开重置上一轮表单', async () => {
    const view = renderDialog()
    await fillTransferForm()
    expect(screen.getByLabelText('验证码')).toHaveValue('123456')
    view.rerender(<EnterpriseOwnershipTransferDialog {...view.props} visible={false} />)
    // Semi 在实例挂载期间播放 semi-modal-content-keyframe-hide，关闭时把组件摘掉动效就没了。
    expect(document.querySelector('.semi-modal-content-animate-hide')).not.toBeNull()
    view.rerender(<EnterpriseOwnershipTransferDialog {...view.props} visible />)
    expect(screen.getByLabelText('验证码')).toHaveValue('')
    expect(screen.getByLabelText('当前绑定的手机')).toHaveValue('')
    expect(screen.getByRole('combobox', { name: '新所有者' })).not.toHaveTextContent('可接收成员')
  })

  it('未绑定联系方式时阻止转让并提示先完成绑定', async () => {
    vi.mocked(getUserProfile).mockResolvedValue({ ...PROFILE, phone: { bound: false, masked_identifier: '' } })
    renderDialog()
    expect(await screen.findByText(/你尚未绑定手机或邮箱/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认转让' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '发送验证码' })).not.toBeInTheDocument()
    expect(transferEnterpriseOwnership).not.toHaveBeenCalled()
  })

  it('缺少版本时阻止确认，要求刷新以取得并发保护信息', async () => {
    renderDialog({ context: { ...CONTEXT, enterprise_version: undefined } })
    await selectTarget()
    await fillVerification()
    fireEvent.click(screen.getByRole('button', { name: '确认转让' }))
    expect(appToast.error).toHaveBeenLastCalledWith(expect.stringContaining('企业或成员信息不完整'))
    expect(screen.getByRole('button', { name: '确认转让' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '重新加载' })).toBeEnabled()
    expect(transferEnterpriseOwnership).not.toHaveBeenCalled()
  })

  it('服务端未授予转让能力时禁止发码和继续', async () => {
    renderDialog({ context: { ...CONTEXT, capabilities: { ...CONTEXT.capabilities, can_transfer_ownership: false } } })
    await screen.findByLabelText('当前绑定的手机')
    expect(screen.getByRole('button', { name: '发送验证码' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '确认转让' })).toBeDisabled()
    expect(sendEnterpriseOwnershipTransferCode).not.toHaveBeenCalled()
    expect(transferEnterpriseOwnership).not.toHaveBeenCalled()
  })
})

