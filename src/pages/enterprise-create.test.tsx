import '@/i18n'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import type { AuthResult } from '@/api/auth'
import { ApiError } from '@/api/http'
import {
  confirmEnterpriseFaceVerification,
  getEnterpriseCertification,
  NEW_ENTERPRISE_CREATE_PATH,
  startEnterpriseFaceVerification,
  submitEnterpriseCertification,
  uploadEnterpriseCertificationMaterial,
  type EnterpriseCertification,
} from '@/api/enterprise-certification'
import { getProfileEnterprises, type EnterpriseMembership } from '@/api/profile'
import { AppStoreProvider, useAppStore } from '@/data/app-state'
import { createAppStore } from '@/store'
import i18n from '@/i18n'
import { EnterpriseCreatePage } from './console-account'

vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('@/api/enterprise-certification', async () => {
  const actual = await vi.importActual<typeof import('@/api/enterprise-certification')>('@/api/enterprise-certification')
  return { ...actual, getEnterpriseCertification: vi.fn(), uploadEnterpriseCertificationMaterial: vi.fn(), submitEnterpriseCertification: vi.fn(), startEnterpriseFaceVerification: vi.fn(), confirmEnterpriseFaceVerification: vi.fn() }
})
vi.mock('@/api/profile', async () => {
  const actual = await vi.importActual<typeof import('@/api/profile')>('@/api/profile')
  return { ...actual, getProfileEnterprises: vi.fn() }
})

const getCertificationMock = vi.mocked(getEnterpriseCertification)
const uploadMaterialMock = vi.mocked(uploadEnterpriseCertificationMaterial)
const submitCertificationMock = vi.mocked(submitEnterpriseCertification)
const startFaceMock = vi.mocked(startEnterpriseFaceVerification)
const confirmFaceMock = vi.mocked(confirmEnterpriseFaceVerification)
const getProfileEnterprisesMock = vi.mocked(getProfileEnterprises)

const AUTH_RESULT: AuthResult = {
  status: 'succeeded', binding_required: false, access_token: 'enterprise-token', refresh_token: 'enterprise-refresh', refresh_expires_at: Date.UTC(2099, 0, 1),
  user: { id: '01K0USERPUBLICIDEXAMPLE01', display_name: '测试用户', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' },
}
const UNSUBMITTED: EnterpriseCertification = { status: 'unsubmitted', current_stage: 'not_started' }
const COMPLETED: EnterpriseCertification = { status: 'approved', current_stage: 'completed', enterprise_id: 'ent_test', enterprise_name: '测试企业', credit_code_masked: '9133**********AB2C', legal_representative_masked: '张*' }
const FACE_REQUIRED: EnterpriseCertification = { status: 'checking', current_stage: 'face_verification_required', enterprise_name: '测试企业', credit_code_masked: '9133**********AB2C', applicant_type: 'legal_representative' }
const MEMBERSHIP: EnterpriseMembership = { id: 'mem_test', enterprise_id: 'ent_test', enterprise_name: '测试企业', enterprise_code: 'ent_test', member_status: 'active', join_source: 'certification', roles: ['owner'], owner: true, joined_at: Date.parse('2026-07-29T00:00:00Z'), exited_at: null, version: 1 }

function LocationProbe() { return <output data-testid="location">{useLocation().pathname}</output> }
function WorkspaceProbe() { const store = useAppStore(); return <output data-testid="workspace-names">{store.workspaces.map((workspace) => workspace.name).join('|')}</output> }
function renderPage(initialEntry = '/console/enterprise-create') {
  const appStore = createAppStore()
  appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: AUTH_RESULT.user })
  return render(<MemoryRouter initialEntries={[initialEntry]}><Provider store={appStore}><AppStoreProvider><EnterpriseCreatePage /><LocationProbe /><WorkspaceProbe /></AppStoreProvider></Provider></MemoryRouter>)
}

describe('enterprise verification page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAuthTokens()
    window.localStorage.clear()
    saveAuthTokens(AUTH_RESULT)
    getCertificationMock.mockResolvedValue(UNSUBMITTED)
    getProfileEnterprisesMock.mockResolvedValue([])
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:license'), revokeObjectURL: vi.fn() })
  })

  it('always queries status and shows the identity choices for a new application', async () => {
    renderPage(NEW_ENTERPRISE_CREATE_PATH)
    expect(await screen.findByRole('heading', { name: '你将以什么身份办理？' })).toBeInTheDocument()
    expect(getCertificationMock).toHaveBeenCalledWith('enterprise-token')
    expect(screen.getByRole('button', { name: /我是企业经办人/ })).toBeDisabled()
  })

  it('shows the completed result immediately and refreshes enterprise workspaces', async () => {
    getCertificationMock.mockResolvedValue(COMPLETED)
    getProfileEnterprisesMock.mockResolvedValue([MEMBERSHIP])
    renderPage()
    expect(await screen.findByRole('heading', { name: '企业认证已完成' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '你将以什么身份办理？' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '企业认证步骤' })).not.toBeInTheDocument()
    await waitFor(() => expect(getProfileEnterprisesMock).toHaveBeenCalledWith('enterprise-token'))
    expect(screen.getByTestId('workspace-names')).toHaveTextContent('测试企业')
  })

  it('uploads a license, fills OCR fields, and submits the complete request', async () => {
    const user = userEvent.setup()
    let resolveUpload: ((result: Awaited<ReturnType<typeof uploadEnterpriseCertificationMaterial>>) => void) | undefined
    uploadMaterialMock.mockImplementation(() => new Promise((resolve) => { resolveUpload = resolve }))
    submitCertificationMock.mockResolvedValue(FACE_REQUIRED)
    const view = renderPage()
    await user.click(await screen.findByRole('button', { name: /我是法定代表人/ }))
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).not.toBeNull()
    await user.upload(input as HTMLInputElement, new File(['png'], 'license.png', { type: 'image/png' }))
    expect(await screen.findByText('正在识别营业执照')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /企业名称/ })).not.toBeInTheDocument()
    await act(async () => { resolveUpload?.({ resource_url: '/material/license', file_name: 'license.png', mime_type: 'image/png', size_bytes: 3, recognition: { enterprise_name: '测试企业', credit_code: '91330100MA1FL0AB2C', legal_representative: '张三' } }) })
    expect(await screen.findByRole('textbox', { name: /企业名称/ })).toHaveValue('测试企业')
    await user.type(screen.getByRole('textbox', { name: /法定代表人身份证号/ }), '110101199001011234')
    await user.type(screen.getByRole('textbox', { name: /企业联系人/ }), '李四')
    await user.type(screen.getByRole('textbox', { name: /联系电话/ }), '0571-12345678')
    await user.click(screen.getByRole('checkbox', { name: /我确认以上企业信息/ }))
    await user.click(screen.getByRole('button', { name: '确认并继续' }))
    await waitFor(() => expect(submitCertificationMock).toHaveBeenCalledWith('enterprise-token', {
      enterprise_name: '测试企业', credit_code: '91330100MA1FL0AB2C', legal_representative: '张三', legal_representative_id: '110101199001011234', contact_name: '李四', contact_phone: '0571-12345678', applicant_type: 'legal_representative', license_url: '/material/license', consent: true,
    }))
    expect(await screen.findByRole('heading', { name: '完成身份核验' })).toBeInTheDocument()
  })

  it('requires face consent, then starts and confirms the Alipay verification', async () => {
    const user = userEvent.setup()
    getCertificationMock.mockResolvedValue(FACE_REQUIRED)
    startFaceMock.mockResolvedValue({ ...FACE_REQUIRED, current_stage: 'face_verification', face_url: 'https://example.com/face' })
    confirmFaceMock.mockResolvedValue(COMPLETED)
    renderPage()
    await user.click(await screen.findByRole('button', { name: '获取人脸识别二维码' }))
    expect(await screen.findByText('需要确认授权')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /我确认由法定代表人本人完成核验/ }))
    await user.click(screen.getByRole('button', { name: '获取人脸识别二维码' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '我已认证完成' }))
    expect(await screen.findByRole('heading', { name: '企业认证已完成' })).toBeInTheDocument()
    expect(confirmFaceMock).toHaveBeenCalledWith('enterprise-token')
  })

  it('keeps the face dialog open and shows the API message when confirmation fails', async () => {
    const user = userEvent.setup()
    getCertificationMock.mockResolvedValue(FACE_REQUIRED)
    startFaceMock.mockResolvedValue({ ...FACE_REQUIRED, current_stage: 'face_verification', face_url: 'https://example.com/face' })
    confirmFaceMock.mockRejectedValue(new ApiError('请求参数无效', 400, 100001, 'request-face-confirm'))
    renderPage()

    await user.click(await screen.findByRole('checkbox', { name: new RegExp(i18n.t('console.enterpriseCreate.faceConsent').slice(0, 8)) }))
    await user.click(screen.getByRole('button', { name: i18n.t('console.enterpriseCreate.getFaceQr') }))
    const dialog = await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: i18n.t('console.enterpriseCreate.faceCompleted') }))

    expect(await screen.findByText(i18n.t('console.enterpriseCreate.faceConfirmFailedTitle'))).toBeInTheDocument()
    expect(screen.getByText('请求参数无效')).toBeInTheDocument()
    expect(dialog).toBeInTheDocument()
  })

  it('invalidates an expired session and returns to the home page', async () => {
    getCertificationMock.mockRejectedValue(new ApiError('expired', 401, 110001, 'request-2'))
    renderPage()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/'))
    expect(window.sessionStorage.getItem('token-nx:user-front:refresh')).toBeNull()
  })
})
