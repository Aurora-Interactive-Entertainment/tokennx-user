import '@/i18n'
import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { ApiError } from '@/api/http'
import type { UserProfile } from '@/api/profile'
import { AccountDeletionFlow } from './account-deletion-flow'
import { ProfileContactDialog } from './profile-contact-dialog'
import { BalanceAlertDialog } from './balance-alert-dialog'

const mocks = vi.hoisted(() => ({ precheck: vi.fn(), enterprises: vi.fn(), saveContact: vi.fn(), sendCode: vi.fn(), error: vi.fn(), success: vi.fn(), preferences: vi.fn(), profile: vi.fn(), updatePreferences: vi.fn() }))
vi.mock('@/api/profile', async (original) => ({ ...await original<typeof import('@/api/profile')>(), getAccountDeletionPrecheck: mocks.precheck, getProfileEnterprises: mocks.enterprises, updateProfileContact: mocks.saveContact, sendProfileContactCode: mocks.sendCode, getNotificationPreferences: mocks.preferences, getUserProfile: mocks.profile, updateNotificationPreferences: mocks.updatePreferences }))
vi.mock('@/auth/token-storage', async (original) => ({ ...await original<typeof import('@/auth/token-storage')>(), getAccessToken: () => 'test-token' }))
vi.mock('./app-toast', () => ({ appToast: { error: mocks.error, success: mocks.success } }))

const profile = { id: 'test-user', display_name: '测试用户', status: 'active', version: 1, phone: { bound: false, masked_identifier: '' }, email: { bound: false, masked_identifier: '' } } as UserProfile
const memberships: [] = []
const noop = () => {}
const preferenceResult = { items: [{ code: 'low_balance', enabled: false, threshold_amount_nano: '25000000000' }] }
const precheckResult = { can_request: true, owner_enterprises: [], member_count: 0, balance_policy: 'paid_balance_non_refundable' }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.enterprises.mockResolvedValue([])
  mocks.profile.mockResolvedValue(profile)
  mocks.preferences.mockResolvedValue(preferenceResult)
  mocks.updatePreferences.mockResolvedValue(preferenceResult)
})

describe('余额提醒的加载与保存边界', () => {
  it.each([
    ['zh-CN', '余额提醒设置暂不可用，请稍后重试'],
    ['en-US', 'Balance alert settings are currently unavailable. Try again later.'],
  ])('低余额配置缺项时显示%s明确文案并保持禁用，重试后可恢复', async (locale, message) => {
    await act(async () => { await i18n.changeLanguage(locale) })
    try {
      // 部分偏好列表不能证明 low_balance 的实际值，更不能据此提交默认配置。
      mocks.preferences.mockResolvedValueOnce({ items: [{ code: 'security_alerts', enabled: true }] })
      render(<BalanceAlertDialog visible onClose={noop} onAuthFailure={noop} />)
      const dialog = await screen.findByRole('dialog')
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
      expect(mocks.error).toHaveBeenCalledExactlyOnceWith(message)
      const save = within(dialog).getByRole('button', { name: 'confirm' })
      expect(save).toBeDisabled()
      fireEvent.click(save)
      expect(mocks.updatePreferences).not.toHaveBeenCalled()
      fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('console.common.retry') }))
      await waitFor(() => expect(save).toBeEnabled())
      expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    } finally {
      await act(async () => { await i18n.changeLanguage('zh-CN') })
    }
  })

  it('读取失败时禁止保存，重试成功后使用服务端偏好提交', async () => {
    mocks.preferences.mockRejectedValueOnce(new Error('offline'))
    render(<BalanceAlertDialog visible onClose={noop} onAuthFailure={noop} />)
    const dialog = await screen.findByRole('dialog')
    const save = within(dialog).getByRole('button', { name: 'confirm' })
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
    expect(save).toBeDisabled()
    fireEvent.click(save)
    expect(mocks.updatePreferences).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('console.common.retry') }))
    await waitFor(() => expect(save).toBeEnabled())
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(save)
    await waitFor(() => expect(mocks.updatePreferences).toHaveBeenCalledWith('test-token', { low_balance: false }, { low_balance: 25 }))
  })

  it('读取尚未完成时禁止保存，关闭后迟到结果不覆盖重开的弹窗', async () => {
    const first = deferred<typeof preferenceResult>()
    mocks.preferences.mockReturnValueOnce(first.promise)
    const page = render(<BalanceAlertDialog visible onClose={noop} onAuthFailure={noop} />)
    expect(within(await screen.findByRole('dialog')).getByRole('button', { name: 'confirm' })).toBeDisabled()
    page.rerender(<BalanceAlertDialog visible={false} onClose={noop} onAuthFailure={noop} />)
    page.rerender(<BalanceAlertDialog visible onClose={noop} onAuthFailure={noop} />)
    await waitFor(() => expect(screen.getByLabelText(i18n.t('console.billing.balanceAlertThresholdTitle'))).toHaveValue('25.00'))
    await act(async () => first.resolve({ items: [{ code: 'low_balance', enabled: true, threshold_amount_nano: '1000000000' }] }))
    expect(screen.getByLabelText(i18n.t('console.billing.balanceAlertThresholdTitle'))).toHaveValue('25.00')
  })

  it('读取联系方式的401仍交给认证流程处理', async () => {
    const onAuthFailure = vi.fn()
    mocks.profile.mockRejectedValue(new ApiError('expired', 401, 110001, null))
    render(<BalanceAlertDialog visible onClose={noop} onAuthFailure={onAuthFailure} />)
    await waitFor(() => expect(onAuthFailure).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'confirm' })).toBeDisabled()
    expect(mocks.error).not.toHaveBeenCalled()
  })

  it('保存期间不能通过Esc关闭，卸载后迟到成功不再关闭其他界面', async () => {
    const request = deferred<typeof preferenceResult>()
    mocks.updatePreferences.mockReturnValue(request.promise)
    const onClose = vi.fn()
    const page = render(<BalanceAlertDialog visible onClose={onClose} onAuthFailure={noop} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'confirm' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }))
    fireEvent.keyDown(document, { key: 'Escape', keyCode: 27 })
    expect(onClose).not.toHaveBeenCalled()
    page.unmount()
    await act(async () => request.resolve(preferenceResult))
    expect(onClose).not.toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalled()
  })
})

describe('联系方式弹窗的在途请求', () => {
  function fillContact() {
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(i18n.t('profile.contact.emailAddress')), { target: { value: 'test@example.com' } })
    fireEvent.change(within(dialog).getByLabelText(i18n.t('profile.contact.newCode')), { target: { value: '123456' } })
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('profile.contact.save') }))
  }

  it('保存期间Esc与取消不能关闭，成功后仅通知一次', async () => {
    const request = deferred<UserProfile>()
    mocks.saveContact.mockReturnValue(request.promise)
    const onCancel = vi.fn()
    const onSaved = vi.fn()
    render(<ProfileContactDialog visible provider="email" currentContact={profile.email} accessToken="test-token" onAuthFailure={noop} onCancel={onCancel} onSaved={onSaved} />)
    fillContact()
    await waitFor(() => expect(mocks.saveContact).toHaveBeenCalledOnce())
    fireEvent.keyDown(document, { key: 'Escape', keyCode: 27 })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('profile.contact.cancel') }))
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await act(async () => request.resolve(profile))
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(profile)
    expect(mocks.success).toHaveBeenCalledOnce()
  })

  it.each(['success', 'unauthorized'] as const)('外部卸载后忽略迟到的%s，不能回调父组件或误报登录失效', async (result) => {
    const request = deferred<UserProfile>()
    mocks.saveContact.mockReturnValue(request.promise)
    const onSaved = vi.fn()
    const onAuthFailure = vi.fn()
    const page = render(<ProfileContactDialog visible provider="email" currentContact={profile.email} accessToken="test-token" onAuthFailure={onAuthFailure} onCancel={noop} onSaved={onSaved} />)
    fillContact()
    page.unmount()
    await act(async () => {
      if (result === 'success') request.resolve(profile)
      else request.reject(new ApiError('expired', 401, 110001, null))
    })
    expect(onSaved).not.toHaveBeenCalled()
    expect(onAuthFailure).not.toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
  })

  it('验证码发送期间可取消，但关闭后的请求不再弹成功提示', async () => {
    const request = deferred<object>()
    mocks.sendCode.mockReturnValue(request.promise)
    const page = render(<ProfileContactDialog visible provider="email" currentContact={profile.email} accessToken="test-token" onAuthFailure={noop} onCancel={noop} onSaved={noop} />)
    fireEvent.change(screen.getByLabelText(i18n.t('profile.contact.emailAddress')), { target: { value: 'test@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('profile.contact.sendNew') }))
    page.unmount()
    await act(async () => request.resolve({}))
    expect(mocks.success).not.toHaveBeenCalled()
  })
})

describe('注销预检失败的恢复', () => {
  it.each(['network', 'conflict'] as const)('%s失败后从原入口可以重试', async (reason) => {
    if (reason === 'network') mocks.precheck.mockRejectedValueOnce(new Error('offline'))
    else mocks.precheck.mockResolvedValueOnce({ ...precheckResult, can_request: false })
    mocks.precheck.mockResolvedValue(precheckResult)
    function Harness() {
      const [visible, setVisible] = useState(false)
      return <><button onClick={() => setVisible(true)}>Start deletion</button><AccountDeletionFlow visible={visible} profile={profile} enterprises={memberships} onClose={() => setVisible(false)} onAuthFailure={noop} onHandleEnterprise={noop} onSuccess={noop} t={i18n.t} /></>
    }
    render(<Harness />)
    fireEvent.click(screen.getByText('Start deletion'))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Start deletion'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(mocks.precheck).toHaveBeenCalledTimes(2)
  })

  it('前置检查完成前离开页面，不再显示错误或关闭新界面', async () => {
    const request = deferred<typeof precheckResult>()
    mocks.precheck.mockReturnValue(request.promise)
    const onClose = vi.fn()
    const page = render(<AccountDeletionFlow visible profile={profile} enterprises={memberships} onClose={onClose} onAuthFailure={noop} onHandleEnterprise={noop} onSuccess={noop} t={i18n.t} />)
    page.unmount()
    await act(async () => request.reject(new Error('offline')))
    expect(onClose).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
  })
})
