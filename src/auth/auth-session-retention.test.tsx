import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AuthResult } from '@/api/auth'
import { AppStoreProvider } from '@/data/app-state'
import i18n from '@/i18n'
import { SettingsPage } from '@/pages/console-profile'
import { createAppStore } from '@/store'
import { clearAuthTokens, getAccessToken, readRefreshToken, saveAuthTokens } from './token-storage'

const profile = {
  id: 'retained-user', display_name: '持续登录用户', avatar_url: '',
  locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active', version: 1,
  phone: { bound: true, masked_identifier: '138****5678' },
  email: { bound: false, masked_identifier: '' },
}

const session: AuthResult = {
  status: 'succeeded', binding_required: false,
  access_token: 'old-access', refresh_token: 'old-refresh',
  refresh_expires_at: Date.UTC(2099, 0, 1), user: profile,
}

function apiResponse(data: unknown, status = 200, msg = 'success'): Response {
  return new Response(JSON.stringify({ code: status === 200 ? 0 : 160001, msg, data }), {
    status, headers: { 'Content-Type': 'application/json' },
  })
}

function LocationProbe() {
  return <output data-testid="current-route">{useLocation().pathname}</output>
}

function renderSettings() {
  const store = createAppStore()
  store.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: profile })
  const dispatch = vi.spyOn(store, 'dispatch')
  render(<Provider store={store}><MemoryRouter initialEntries={['/console/settings']}><AppStoreProvider>
    <LocationProbe />
    <Routes>
      <Route path="/console/settings" element={<SettingsPage />} />
      <Route path="/" element={<h1>首页</h1>} />
    </Routes>
  </AppStoreProvider></MemoryRouter></Provider>)
  return { store, dispatch }
}

function mockProfileFailure(refreshStatus: number) {
  let profileUnavailable = true
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = String(input)
    if (url.endsWith('/api/auth/refresh')) {
      return refreshStatus === 200
        ? apiResponse({ ...session, access_token: 'new-access', refresh_token: 'new-refresh' })
        : apiResponse(null, refreshStatus, refreshStatus === 401 ? '长期登录已过期' : '认证服务暂时不可用')
    }
    if (url.endsWith('/api/user/profile')) {
      return profileUnavailable ? apiResponse(null, 401, '资料接口暂时拒绝访问') : apiResponse(profile)
    }
    if (url.includes('/api/user/profile/enterprises?')) return apiResponse([])
    if (url.endsWith('/api/user/profile/notification-preferences')) return apiResponse({ items: [] })
    throw new Error(`unexpected request: ${url}`)
  })
  return { fetchMock, recoverProfile: () => { profileUnavailable = false } }
}

beforeEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('zh-CN')
  clearAuthTokens({ force: true, broadcast: false })
  window.localStorage.clear()
  window.sessionStorage.clear()
  saveAuthTokens(session)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  clearAuthTokens({ force: true, broadcast: false })
})

// 使用真实设置页、统一请求管道和 Redux，防止页面再次把业务 401 判成退出登录。
it('续期成功但资料接口仍返回 401 时保留登录和路由，用户可以原地重试', async () => {
  const { fetchMock, recoverProfile } = mockProfileFailure(200)
  const { store, dispatch } = renderSettings()

  expect(await screen.findByRole('alert')).toHaveTextContent('资料接口暂时拒绝访问')
  expect(screen.getByTestId('current-route')).toHaveTextContent('/console/settings')
  expect(store.getState().auth.status).toBe('authenticated')
  expect(store.getState().auth.user?.id).toBe(profile.id)
  expect(getAccessToken()).toBe('new-access')
  expect(readRefreshToken()).toBe('new-refresh')
  expect(dispatch.mock.calls.some(([action]) => typeof action !== 'function' && action.type === 'auth/invalidateAuth')).toBe(false)
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/auth/refresh'))).toHaveLength(1)

  recoverProfile()
  await userEvent.click(screen.getByRole('button', { name: '重试' }))
  expect(await screen.findByRole('heading', { name: '账户' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument()
  expect(screen.getByTestId('current-route')).toHaveTextContent('/console/settings')
  expect(store.getState().auth.status).toBe('authenticated')
})

it('资料 401 后续期服务临时 503 只显示错误，仍保留长期登录凭据', async () => {
  mockProfileFailure(503)
  const { store, dispatch } = renderSettings()

  expect(await screen.findByRole('alert')).toHaveTextContent('认证服务暂时不可用')
  expect(screen.getByTestId('current-route')).toHaveTextContent('/console/settings')
  expect(store.getState().auth.status).toBe('authenticated')
  expect(getAccessToken()).toBe('old-access')
  expect(readRefreshToken()).toBe('old-refresh')
  expect(dispatch.mock.calls.some(([action]) => typeof action !== 'function' && action.type === 'auth/invalidateAuth')).toBe(false)
})

it('续期接口明确返回 401 时仍正常清理失效登录，并离开受保护页面', async () => {
  mockProfileFailure(401)
  const { store } = renderSettings()

  await waitFor(() => expect(store.getState().auth.status).toBe('unauthenticated'))
  expect(await screen.findByRole('heading', { name: '首页' })).toBeInTheDocument()
  expect(screen.getByTestId('current-route')).toHaveTextContent(/^\/$/)
  expect(store.getState().auth.user).toBeNull()
  expect(getAccessToken()).toBeNull()
  expect(readRefreshToken()).toBeNull()
})
