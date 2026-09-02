import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResult } from '@/api/auth'
import type { EnterpriseInvitationPreview } from '@/api/enterprise-console'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import { AppStoreProvider } from '@/data/app-state'
import { createAppStore } from '@/store'
import { JoinPage } from './join'

vi.mock('@/api/enterprise-console', async () => {
  const actual = await vi.importActual<typeof import('@/api/enterprise-console')>('@/api/enterprise-console')
  return {
    ...actual,
    getInvitationPreview: vi.fn(),
    submitInvitationJoin: vi.fn(),
  }
})

import { getInvitationPreview, submitInvitationJoin } from '@/api/enterprise-console'

const getInvitationPreviewMock = vi.mocked(getInvitationPreview)
const submitInvitationJoinMock = vi.mocked(submitInvitationJoin)

const AUTH_RESULT: AuthResult = {
  status: 'succeeded',
  binding_required: false,
  access_token: 'join-access-token',
  refresh_token: 'join-refresh-token',
  refresh_expires_at: Date.UTC(2099, 0, 1),
  user: { id: 'user_join', display_name: '申请用户', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' },
}

const PREVIEW: EnterpriseInvitationPreview = {
  id: 'invitation_join',
  enterprise_id: 'enterprise_join',
  enterprise_name: '研发空间',
  enterprise_code: 'RD-SPACE',
  role: 'member',
  role_name: '普通成员',
  inviter_name: '空间管理员',
  max_uses: 10,
  used_count: 2,
  expires_at: null,
  status: 'active',
  already_member: false,
  pending_request: false,
}

function renderJoin(authenticated = false, token = 'join-token/abc') {
  const appStore = createAppStore()
  if (authenticated) {
    saveAuthTokens(AUTH_RESULT)
    appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: AUTH_RESULT.user })
  } else {
    appStore.dispatch({ type: 'auth/hydrate/fulfilled', payload: null })
  }
  return { appStore, ...render(<MemoryRouter initialEntries={[`/join?token=${encodeURIComponent(token)}`]}><Provider store={appStore}><AppStoreProvider><JoinPage /></AppStoreProvider></Provider></MemoryRouter>) }
}

beforeEach(() => {
  vi.clearAllMocks()
  clearAuthTokens()
  getInvitationPreviewMock.mockResolvedValue(PREVIEW)
  submitInvitationJoinMock.mockResolvedValue({ id: 'request_join', invitation_link_id: PREVIEW.id, requested_role: PREVIEW.role, request_message: '', status: 'pending' })
})

describe('企业邀请页面', () => {
  it('未登录时点击申请加入会打开登录弹窗', async () => {
    const user = userEvent.setup()
    renderJoin()

    expect(await screen.findByRole('heading', { name: '加入 研发空间' })).toBeInTheDocument()
    expect(screen.getByText('邀请人：空间管理员')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '申请加入' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '申请加入' }))
    expect(await screen.findByRole('dialog', { name: '登录 Token NX' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '手机号登录' })).toBeInTheDocument()
    expect(getInvitationPreviewMock).toHaveBeenCalledWith('join-token/abc', expect.objectContaining({ accessToken: undefined, signal: expect.any(AbortSignal) }))
    expect(submitInvitationJoinMock).not.toHaveBeenCalled()
  })

  it('未登录点击申请后登录成功会自动提交加入申请', async () => {
    const user = userEvent.setup()
    const { appStore } = renderJoin()

    await screen.findByRole('heading', { name: '加入 研发空间' })
    await user.click(screen.getByRole('button', { name: '申请加入' }))
    expect(await screen.findByRole('dialog', { name: '登录 Token NX' })).toBeInTheDocument()

    saveAuthTokens(AUTH_RESULT)
    appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: AUTH_RESULT.user })

    await waitFor(() => expect(submitInvitationJoinMock).toHaveBeenCalledWith({ token: 'join-token/abc', request_message: '' }, { accessToken: 'join-access-token' }))
    expect(await screen.findByRole('heading', { name: '已申请' })).toBeInTheDocument()
  })

  it('登录后点击申请加入会直接提交当前邀请 Token', async () => {
    const user = userEvent.setup()
    renderJoin(true)

    await screen.findByRole('heading', { name: '加入 研发空间' })
    await user.click(screen.getByRole('button', { name: '申请加入' }))

    await waitFor(() => expect(submitInvitationJoinMock).toHaveBeenCalledWith({ token: 'join-token/abc', request_message: '' }, { accessToken: 'join-access-token' }))
    expect(await screen.findByRole('heading', { name: '已申请' })).toBeInTheDocument()
    expect(screen.getByText('已提交加入研发空间的申请，请等待企业管理员审核。审批结果将以邮件形式通知，请注意查收。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '申请加入' })).not.toBeInTheDocument()
  })

  it('已过期邀请显示失效原因且不提供申请按钮', async () => {
    getInvitationPreviewMock.mockResolvedValueOnce({ ...PREVIEW, status: 'expired', expires_at: Date.parse('2026-07-01T00:00:00Z') })
    renderJoin(true)

    expect(await screen.findByText('已过期')).toBeInTheDocument()
    expect(screen.getByText('这条邀请链接已超过有效期，无法继续提交加入申请。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '申请加入' })).not.toBeInTheDocument()
  })
})
