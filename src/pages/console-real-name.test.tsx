import '@/i18n'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import type { AuthResult } from '@/api/auth'
import type { RealNameProfile } from '@/api/real-name'
import { createAppStore } from '@/store'
import { confirmRealName, getRealNameProfile, submitRealName } from '@/api/real-name'
import { RealNamePage, validateRealNameForm } from './console-real-name'

vi.mock('@/api/real-name', async () => {
  const actual = await vi.importActual<typeof import('@/api/real-name')>('@/api/real-name')
  return { ...actual, confirmRealName: vi.fn(), getRealNameProfile: vi.fn(), submitRealName: vi.fn() }
})

const getRealNameProfileMock = vi.mocked(getRealNameProfile)
const submitRealNameMock = vi.mocked(submitRealName)
const confirmRealNameMock = vi.mocked(confirmRealName)

const AUTH_RESULT: AuthResult = {
  status: 'succeeded', binding_required: false, access_token: 'real-name-token', refresh_token: 'real-name-refresh', refresh_expires_at: Date.UTC(2099, 0, 1),
  user: { id: '01K0USERPUBLICIDEXAMPLE01', display_name: '测试用户', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' },
}

const UNVERIFIED_PROFILE: RealNameProfile = { status: 'unverified' }

function renderPage(profile: RealNameProfile = UNVERIFIED_PROFILE) {
  const appStore = createAppStore()
  appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: AUTH_RESULT.user })
  getRealNameProfileMock.mockResolvedValue(profile)
  return { appStore, ...render(<MemoryRouter initialEntries={['/console/real-name']}><Provider store={appStore}><RealNamePage /></Provider></MemoryRouter>) }
}

describe('实名认证页面', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		clearAuthTokens()
		window.localStorage.clear()
		saveAuthTokens(AUTH_RESULT)
		getRealNameProfileMock.mockResolvedValue(UNVERIFIED_PROFILE)
		confirmRealNameMock.mockResolvedValue(UNVERIFIED_PROFILE)
	})

  it('校验姓名、证件号和信息处理同意状态', () => {
    expect(validateRealNameForm({ name: '', idType: 'id-card', idNumber: '', consent: false })).toEqual({
      name: '请输入真实姓名',
      idNumber: '请输入证件号码',
      consent: '请先同意实名认证信息处理声明',
    })
    expect(validateRealNameForm({ name: '测试用户', idType: 'id-card', idNumber: '12!@', consent: true })).toEqual({
      idNumber: '请输入有效的证件号码',
    })
    expect(validateRealNameForm({ name: '测试用户', idType: 'id-card', idNumber: '110101199001011234', consent: true })).toEqual({})
  })

	it('加载未认证状态并提交后展示服务端返回的认证成功状态', async () => {
		const user = userEvent.setup()
		const verified: RealNameProfile = { status: 'verified', id_type: 'id-card', verification_level: 'test', masked_id_number: '1101**********1234', verified_at: '2026-07-24T08:00:00Z' }
		submitRealNameMock.mockResolvedValue(verified)
		renderPage()

		await user.type(await screen.findByRole('textbox', { name: '真实姓名' }), '测试用户')
		await user.type(await screen.findByRole('textbox', { name: '证件号码' }), '110101199001011234')
		await user.click(screen.getByRole('checkbox', { name: /我理解并同意/ }))
		await user.click(screen.getByRole('button', { name: '提交认证' }))

		await waitFor(() => expect(submitRealNameMock).toHaveBeenCalledWith('real-name-token', { name: '测试用户', id_type: 'id-card', id_number: '110101199001011234', consent: true, return_url: window.location.href }))
		expect(await screen.findByText('认证已完成')).toBeInTheDocument()
		expect(screen.getByText('1101**********1234')).toBeInTheDocument()
	})

	it('已认证用户显示持久化状态并允许继续提交测试资料', async () => {
		renderPage({ status: 'verified', id_type: 'id-card', verification_level: 'test', masked_id_number: '1101**********1234', verified_at: '2026-07-24T08:00:00Z' })

		expect(await screen.findByText('认证已完成')).toBeInTheDocument()
		expect(screen.getByText('当前认证方式：测试认证')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: '更新认证资料' })).toBeInTheDocument()
	})

	it('手动确认只立即查询一次 GET 状态并直接使用查询结果', async () => {
		const user = userEvent.setup()
		const waiting: RealNameProfile = { status: 'waiting', id: 'certify-1', certify_url: 'https://example.com/certify', expires_at: '2099-01-01T00:00:00Z' }
		const verified: RealNameProfile = { status: 'verified', id_type: 'id-card', verification_level: 'identity', masked_id_number: '1101**********1234' }
		getRealNameProfileMock.mockReset().mockResolvedValue(UNVERIFIED_PROFILE)
		submitRealNameMock.mockResolvedValue(waiting)
		confirmRealNameMock.mockReset().mockResolvedValueOnce(waiting).mockResolvedValueOnce(verified)
		renderPage()

		await user.type(await screen.findByRole('textbox', { name: '真实姓名' }), '测试用户')
		await user.type(screen.getByRole('textbox', { name: '证件号码' }), '110101199001011234')
		await user.click(screen.getByRole('checkbox', { name: /我理解并同意/ }))
		await user.click(screen.getByRole('button', { name: '提交认证' }))
		const confirmButton = await screen.findByRole('button', { name: '确认实名认证' })
		await waitFor(() => expect(confirmRealNameMock).toHaveBeenCalledWith('real-name-token', 'certify-1'))

		await user.click(confirmButton)

		expect(await screen.findByText('认证已完成')).toBeInTheDocument()
		expect(confirmRealNameMock).toHaveBeenCalledTimes(2)
	})

	it('字段校验失败时不调用提交接口', async () => {
		const user = userEvent.setup()
		renderPage()

		await user.type(await screen.findByRole('textbox', { name: '真实姓名' }), '测试用户')
		await user.click(screen.getByRole('checkbox', { name: /我理解并同意/ }))
		await user.click(screen.getByRole('button', { name: '提交认证' }))

		expect(await screen.findByText('请输入证件号码')).toBeInTheDocument()
		expect(submitRealNameMock).not.toHaveBeenCalled()
	})
})
