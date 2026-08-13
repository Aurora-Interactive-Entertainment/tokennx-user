import '@/i18n'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import type { AuthResult } from '@/api/auth'
import { ApiError } from '@/api/http'
import type { RealNameProfile } from '@/api/real-name'
import { createAppStore } from '@/store'
import { confirmRealName, getRealNameProfile, submitRealName } from '@/api/real-name'
import i18n from '@/i18n'
import { RealNamePage, validateRealNameForm } from './console-real-name'

vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('@/api/real-name', async () => {
  const actual = await vi.importActual<typeof import('@/api/real-name')>('@/api/real-name')
  return { ...actual, confirmRealName: vi.fn(), getRealNameProfile: vi.fn(), submitRealName: vi.fn() }
})

const getRealNameProfileMock = vi.mocked(getRealNameProfile)
const submitRealNameMock = vi.mocked(submitRealName)
const confirmRealNameMock = vi.mocked(confirmRealName)

const AUTH_RESULT: AuthResult = {
  status: 'succeeded', binding_required: false, access_token: 'real-name-token', refresh_token: 'real-name-refresh', refresh_expires_at: Date.UTC(2099, 0, 1),
  user: { id: '01K0USERPUBLICIDEXAMPLE01', display_name: 'Test User', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' },
}

const UNVERIFIED_PROFILE: RealNameProfile = { status: 'unverified' }
const WAITING_RECEIPT: RealNameProfile = { status: 'unverified', id: 'certify-1', certify_url: 'https://example.com/certify', expires_at: Date.UTC(2099, 0, 1) }
const VERIFIED_PROFILE: RealNameProfile = { status: 'verified', id_type: 'id-card', verification_level: 'alipay_face', masked_id_number: '1101**********1234', verified_at: Date.UTC(2026, 6, 24) }

function renderPage(profile: RealNameProfile = UNVERIFIED_PROFILE) {
  const appStore = createAppStore()
  appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: AUTH_RESULT.user })
  getRealNameProfileMock.mockResolvedValue(profile)
  return render(<MemoryRouter initialEntries={['/console/real-name']}><Provider store={appStore}><RealNamePage /></Provider></MemoryRouter>)
}

async function submitForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByRole('textbox', { name: i18n.t('console.realName.realName') }), 'Zhang San')
  await user.type(screen.getByRole('textbox', { name: i18n.t('console.realName.idNumber') }), '110101199001011234')
  await user.click(screen.getByRole('checkbox', { name: new RegExp(i18n.t('console.realName.consent').slice(0, 8)) }))
  await user.click(screen.getByRole('button', { name: i18n.t('console.realName.submit') }))
}

describe('real-name verification page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAuthTokens()
    window.localStorage.clear()
    window.sessionStorage.clear()
    saveAuthTokens(AUTH_RESULT)
    getRealNameProfileMock.mockResolvedValue(UNVERIFIED_PROFILE)
    submitRealNameMock.mockResolvedValue(WAITING_RECEIPT)
    confirmRealNameMock.mockResolvedValue(UNVERIFIED_PROFILE)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('validates the supported mainland ID form', () => {
    expect(validateRealNameForm({ name: '', idType: 'id-card', idNumber: '', consent: false })).toEqual({
      name: i18n.t('console.realName.nameRequired'),
      idNumber: i18n.t('console.realName.numberRequired'),
      consent: i18n.t('console.realName.consentRequired'),
    })
    expect(validateRealNameForm({ name: 'Zhang San', idType: 'id-card', idNumber: '12!@', consent: true })).toEqual({ idNumber: i18n.t('console.realName.numberInvalid') })
    expect(validateRealNameForm({ name: 'Zhang San', idType: 'id-card', idNumber: '11010119900101123X', consent: true })).toEqual({})
  })

  it('starts verification and does not query the result automatically', async () => {
    const user = userEvent.setup()
    renderPage()
    await submitForm(user)

    await waitFor(() => expect(submitRealNameMock).toHaveBeenCalledWith('real-name-token', {
      name: 'Zhang San', id_type: 'id-card', id_number: '110101199001011234', consent: true, return_url: `${window.location.origin}/console/real-name`,
    }))
    expect(await screen.findByRole('button', { name: i18n.t('console.realName.confirm') })).toBeInTheDocument()
    expect(confirmRealNameMock).not.toHaveBeenCalled()
  })

  it('keeps the QR dialog open when manual confirmation is still unverified', async () => {
    const user = userEvent.setup()
    renderPage()
    await submitForm(user)
    const confirmButton = await screen.findByRole('button', { name: i18n.t('console.realName.confirm') })

    await user.click(confirmButton)

    await waitFor(() => expect(confirmRealNameMock).toHaveBeenCalledWith('real-name-token', 'certify-1'))
    expect(screen.getByRole('button', { name: i18n.t('console.realName.confirm') })).toBeInTheDocument()
  })

  it('silently confirms once before closing the verification dialog', async () => {
    const user = userEvent.setup()
    renderPage()
    await submitForm(user)

    await user.click(await screen.findByRole('button', { name: i18n.t('console.realName.cancel') }))

    await waitFor(() => expect(confirmRealNameMock).toHaveBeenCalledWith('real-name-token', 'certify-1'))
    expect(confirmRealNameMock).toHaveBeenCalledTimes(1)
    expect(window.sessionStorage.getItem('token-nx:user-front:real-name-session')).toBeNull()
  })

  it('silently confirms a restored session after a page refresh', async () => {
    window.sessionStorage.setItem('token-nx:user-front:real-name-session', JSON.stringify({
      user_id: AUTH_RESULT.user?.id,
      id: 'restored-certify-1',
      certify_url: 'https://example.com/restored-certify',
      expires_at: Date.UTC(2099, 0, 1),
      qr_expires_at: Date.UTC(2099, 0, 1),
    }))
    confirmRealNameMock.mockResolvedValue(VERIFIED_PROFILE)
    renderPage()

    await waitFor(() => expect(confirmRealNameMock).toHaveBeenCalledWith('real-name-token', 'restored-certify-1'))
    expect(await screen.findByText(i18n.t('console.realName.completed'))).toBeInTheDocument()
    expect(window.sessionStorage.getItem('token-nx:user-front:real-name-session')).toBeNull()
    expect(screen.queryByRole('textbox', { name: i18n.t('console.realName.realName') })).not.toBeInTheDocument()
  })

  it('closes the dialog and refreshes verified information after confirmation', async () => {
    const user = userEvent.setup()
    confirmRealNameMock.mockResolvedValue(VERIFIED_PROFILE)
    renderPage()
    await submitForm(user)

    await user.click(await screen.findByRole('button', { name: i18n.t('console.realName.confirm') }))

    expect(await screen.findByText(i18n.t('console.realName.completed'))).toBeInTheDocument()
    expect(screen.getByText('1101**********1234')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: i18n.t('console.realName.realName') })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: i18n.t('console.realName.idNumber') })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: i18n.t('console.realName.submit') })).not.toBeInTheDocument()
    expect(window.sessionStorage.getItem('token-nx:user-front:real-name-session')).toBeNull()
    expect(getRealNameProfileMock).toHaveBeenCalledTimes(2)
  })

  it('shows only verified information for an already verified account', async () => {
    renderPage(VERIFIED_PROFILE)

    expect(await screen.findByText(i18n.t('console.realName.completed'))).toBeInTheDocument()
    expect(screen.getByText('1101**********1234')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: i18n.t('console.realName.submit') })).not.toBeInTheDocument()
  })

  it('shows an expired overlay after five minutes and refreshes the QR through POST', async () => {
    const startedAt = Date.now()
    const nowMock = vi.spyOn(Date, 'now').mockReturnValue(startedAt)
    const user = userEvent.setup()
    submitRealNameMock
      .mockResolvedValueOnce({ ...WAITING_RECEIPT, expires_at: startedAt + 60 * 60_000 })
      .mockResolvedValueOnce({ ...WAITING_RECEIPT, id: 'certify-2', certify_url: 'https://example.com/certify-2', expires_at: startedAt + 60 * 60_000 })
    renderPage()
    await submitForm(user)
    const confirmButton = await screen.findByRole('button', { name: i18n.t('console.realName.confirm') })
    expect(confirmButton).toBeEnabled()

    nowMock.mockReturnValue(startedAt + 5 * 60_000 + 1)
    fireEvent.click(confirmButton)

    const refreshButton = await screen.findByRole('button', { name: i18n.t('console.realName.refreshQr') })
    expect(await screen.findByText(i18n.t('console.realName.qrExpired'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: i18n.t('console.realName.confirm') })).toBeDisabled()
    fireEvent.click(refreshButton)

    await waitFor(() => expect(submitRealNameMock).toHaveBeenCalledTimes(2))
    expect(confirmRealNameMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: i18n.t('console.realName.confirm') })).toBeEnabled()
  })

  it('clears an invalid or expired session returned by confirm', async () => {
    const user = userEvent.setup()
    confirmRealNameMock.mockRejectedValue(new ApiError('expired', 409, 110022, 'request-1'))
    renderPage()
    await submitForm(user)

    await user.click(await screen.findByRole('button', { name: i18n.t('console.realName.confirm') }))

    await waitFor(() => expect(window.sessionStorage.getItem('token-nx:user-front:real-name-session')).toBeNull())
    expect(screen.getByText(i18n.t('console.realName.expired'))).toBeInTheDocument()
  })

  it('does not call POST when form validation fails', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByRole('textbox', { name: i18n.t('console.realName.realName') }), 'Zhang San')
    await user.click(screen.getByRole('checkbox', { name: new RegExp(i18n.t('console.realName.consent').slice(0, 8)) }))
    await user.click(screen.getByRole('button', { name: i18n.t('console.realName.submit') }))

    expect(await screen.findByText(i18n.t('console.realName.numberRequired'))).toBeInTheDocument()
    expect(submitRealNameMock).not.toHaveBeenCalled()
  })
})
