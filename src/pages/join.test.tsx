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
  return render(<MemoryRouter initialEntries={[`/join?token=${encodeURIComponent(token)}`]}><Provider store={appStore}><AppStoreProvider><JoinPage /></AppStoreProvider></Provider></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  clearAuthTokens()
  getInvitationPreviewMock.mockResolvedValue(PREVIEW)
  submitInvitationJoinMock.mockResolvedValue({ id: 'request_join', invitation_link_id: PREVIEW.id, requested_role: PREVIEW.role, request_message: '', status: 'pending' })
})

describe('企业邀请页面', () => {
  it('未登录时展示邀请信息和登录面板，并保留当前邀请地址', async () => {
    renderJoin()

    expect(await screen.findByRole('heading', { name: '加入企业' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '研发空间' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '手机号登录' })).toBeInTheDocument()
    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument()
    expect(screen.getByText('登录后会保留当前邀请 Token，无需重新打开邀请链接。')).toBeInTheDocument()
    expect(getInvitationPreviewMock).toHaveBeenCalledWith('join-token/abc', expect.objectContaining({ accessToken: undefined, signal: expect.any(AbortSignal) }))
    expect(submitInvitationJoinMock).not.toHaveBeenCalled()
  })

  it('登录后展示申请表单并提交当前邀请 Token', async () => {
    const user = userEvent.setup()
    renderJoin(true)

    await screen.findByRole('heading', { name: '申请加入企业' })
    await user.type(screen.getByLabelText('申请说明（可选）'), '申请加入研发空间')
    await user.click(screen.getByRole('button', { name: '提交加入申请' }))

    await waitFor(() => expect(submitInvitationJoinMock).toHaveBeenCalledWith({ token: 'join-token/abc', request_message: '申请加入研发空间' }, { accessToken: 'join-access-token' }))
    expect(await screen.findByText('加入申请已提交')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '提交加入申请' })).not.toBeInTheDocument()
  })

  it('已过期邀请显示失效原因且不提供申请按钮', async () => {
    getInvitationPreviewMock.mockResolvedValueOnce({ ...PREVIEW, status: 'expired', expires_at: '2026-07-01T00:00:00Z' })
    renderJoin(true)

    expect(await screen.findByText('已过期')).toBeInTheDocument()
    expect(screen.getByText('这条邀请链接已超过有效期，无法继续提交加入申请。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '提交加入申请' })).not.toBeInTheDocument()
  })
})
