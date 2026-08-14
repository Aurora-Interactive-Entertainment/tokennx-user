import '@/i18n'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import type { AuthResult } from '@/api/auth'
import { ApiError } from '@/api/http'
import type { EnterpriseCertification } from '@/api/enterprise-certification'
import { getEnterpriseCertification, NEW_ENTERPRISE_CREATE_PATH, submitEnterpriseCertification, validateEnterpriseCertificationForm } from '@/api/enterprise-certification'
import { getProfileEnterprises, type EnterpriseMembership } from '@/api/profile'
import { AppStoreProvider, useAppStore } from '@/data/app-state'
import { createAppStore } from '@/store'
import { EnterpriseCreatePage } from './console-account'

vi.mock('@/api/enterprise-certification', async () => {
  const actual = await vi.importActual<typeof import('@/api/enterprise-certification')>('@/api/enterprise-certification')
  return { ...actual, getEnterpriseCertification: vi.fn(), submitEnterpriseCertification: vi.fn() }
})

vi.mock('@/api/profile', async () => {
  const actual = await vi.importActual<typeof import('@/api/profile')>('@/api/profile')
  return { ...actual, getProfileEnterprises: vi.fn() }
})

const getEnterpriseCertificationMock = vi.mocked(getEnterpriseCertification)
const submitEnterpriseCertificationMock = vi.mocked(submitEnterpriseCertification)
const getProfileEnterprisesMock = vi.mocked(getProfileEnterprises)

const AUTH_RESULT: AuthResult = {
  status: 'succeeded', binding_required: false, access_token: 'enterprise-token', refresh_token: 'enterprise-refresh', refresh_expires_at: Date.UTC(2099, 0, 1),
  user: { id: '01K0USERPUBLICIDEXAMPLE01', display_name: '测试用户', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' },
}

const UNSUBMITTED: EnterpriseCertification = { status: 'unsubmitted', current_stage: 'not_started' }
const APPROVED: EnterpriseCertification = {
  status: 'approved', current_stage: 'done', applicant_type: 'legal_representative', enterprise_id: 'ent_test', enterprise_name: '测试企业',
  credit_code_masked: '9133**********AB2C', legal_representative_masked: '张*', enterprise_certification_status: 'verified',
}
const MEMBERSHIP: EnterpriseMembership = {
  id: 'mem_test', enterprise_id: 'ent_test', enterprise_name: '测试企业', enterprise_code: 'ent_test', member_status: 'active',
  join_source: 'certification', roles: ['owner'], owner: true, joined_at: Date.parse('2026-07-29T00:00:00Z'), exited_at: null, version: 1,
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function WorkspaceProbe() {
  const store = useAppStore()
  return <output data-testid="workspace-names">{store.workspaces.map((workspace) => workspace.name).join('|')}</output>
}

function renderPage(initialEntry = '/console/enterprise-create') {
  const appStore = createAppStore()
  appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: AUTH_RESULT.user })
  return render(<MemoryRouter initialEntries={[initialEntry]}><Provider store={appStore}><AppStoreProvider><EnterpriseCreatePage /><LocationProbe /><WorkspaceProbe /></AppStoreProvider></Provider></MemoryRouter>)
}

describe('企业入驻页面', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAuthTokens()
    window.localStorage.clear()
    saveAuthTokens(AUTH_RESULT)
    getEnterpriseCertificationMock.mockResolvedValue(UNSUBMITTED)
    getProfileEnterprisesMock.mockResolvedValue([])
  })

  it('校验企业名称、统一社会信用代码、申请人身份和同意声明', () => {
    expect(validateEnterpriseCertificationForm({ enterpriseName: '', creditCode: '', legalRepresentative: '', applicantType: 'legal_representative', consent: false })).toMatchObject({
      enterpriseName: '请输入企业名称', creditCode: '请输入统一社会信用代码', legalRepresentative: '请输入法定代表人', consent: '请先同意企业认证信息处理声明',
    })
  })

  it('加载未提交状态并在字段校验失败时不提交接口', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByRole('heading', { name: '提交企业认证申请' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '提交认证申请' }))

    expect(await screen.findByText('请输入企业名称')).toBeInTheDocument()
    expect(screen.getByText('请输入统一社会信用代码')).toBeInTheDocument()
    expect(submitEnterpriseCertificationMock).not.toHaveBeenCalled()
  })

  it('新建模式忽略已有认证记录并展示空白企业申请表单', async () => {
    getEnterpriseCertificationMock.mockResolvedValue(APPROVED)
    renderPage(NEW_ENTERPRISE_CREATE_PATH)

    expect(await screen.findByRole('heading', { name: '提交企业认证申请' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '企业认证已完成' })).toBeNull()
    expect(screen.getByRole('textbox', { name: '企业名称' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: '统一社会信用代码' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: '法定代表人' })).toHaveValue('')
    expect(getEnterpriseCertificationMock).not.toHaveBeenCalled()
  })

  it('提交资料后展示认证成功并刷新企业工作空间', async () => {
    const user = userEvent.setup()
    submitEnterpriseCertificationMock.mockResolvedValue(APPROVED)
    getProfileEnterprisesMock.mockResolvedValue([MEMBERSHIP])
    renderPage()

    await user.type(await screen.findByRole('textbox', { name: '企业名称' }), '测试企业')
    await user.type(screen.getByRole('textbox', { name: '统一社会信用代码' }), '91330100ma1fl0ab2c')
    await user.type(screen.getByRole('textbox', { name: '法定代表人' }), '张三')
    await user.selectOptions(screen.getByRole('combobox', { name: '申请人身份' }), 'legal_representative')
    await user.click(screen.getByRole('checkbox', { name: /我理解并同意/ }))
    await user.click(screen.getByRole('button', { name: '提交认证申请' }))

    await waitFor(() => expect(submitEnterpriseCertificationMock).toHaveBeenCalledWith('enterprise-token', {
      enterprise_name: '测试企业', credit_code: '91330100MA1FL0AB2C', legal_representative: '张三', applicant_type: 'legal_representative', consent: true,
    }))
    expect(await screen.findByRole('heading', { name: '企业认证已完成' })).toBeInTheDocument()
    expect(screen.getByText('9133**********AB2C')).toBeInTheDocument()
    expect(screen.getByText('张*')).toBeInTheDocument()
    await waitFor(() => expect(getProfileEnterprisesMock).toHaveBeenCalledWith('enterprise-token'))
    expect(screen.getByTestId('workspace-names')).toHaveTextContent('个人空间|测试企业')
  })

  it('认证状态请求失败时展示错误并支持重试', async () => {
    const user = userEvent.setup()
    getEnterpriseCertificationMock.mockRejectedValueOnce(new ApiError('认证服务错误', 503, 100002, 'request-1')).mockResolvedValueOnce(UNSUBMITTED)
    renderPage()

    expect(await screen.findByText('企业认证服务暂时不可用，请稍后重试')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    expect(await screen.findByRole('heading', { name: '提交企业认证申请' })).toBeInTheDocument()
    expect(getEnterpriseCertificationMock).toHaveBeenCalledTimes(2)
  })

  it('认证失败时清理会话并返回首页', async () => {
    getEnterpriseCertificationMock.mockRejectedValue(new ApiError('登录失效', 401, 110001, 'request-2'))
    renderPage()

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/'))
    expect(window.sessionStorage.getItem('token-nx:user-front:refresh')).toBeNull()
  })
})
