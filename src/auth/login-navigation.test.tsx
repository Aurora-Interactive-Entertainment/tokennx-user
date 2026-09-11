import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginRequiredAction } from '@/components/common'
import { AppStoreProvider } from '@/data/app-state'
import { createAppStore } from '@/store'
import { useAppSelector } from '@/store/hooks'
import { LoginPage } from '@/pages/public'
import { DEFAULT_CONSOLE_PATH, resolveLoginDestination } from './login-navigation'

const target = '/console/models?keyword=01MODEL123&model=01MODEL123#details'
const authResult = {
  status: 'succeeded', binding_required: false, access_token: 'test-access', refresh_token: 'test-refresh',
  access_expires_at: Date.UTC(2099, 0, 1), refresh_expires_at: Date.UTC(2099, 1, 1),
  user: { id: 'login-navigation-test', display_name: '测试用户', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' },
}

function Location() {
  const location = useLocation()
  return <output data-testid="destination">{location.pathname}{location.search}{location.hash}</output>
}

function LoginRoutes({ mode, returnPath }: { mode: 'dialog' | 'page'; returnPath?: string }) {
  const auth = useAppSelector((state) => state.auth)
  // 模拟应用登录时重建账号作用域，确保目标不会因登录弹窗卸载而丢失。
  return <AppStoreProvider key={`${auth.status}:${auth.user?.id ?? ''}`}>
    <Routes>
      <Route path="/models" element={mode === 'dialog' ? <LoginRequiredAction returnPath={returnPath}>体验模型</LoginRequiredAction> : <LoginPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/console/*" element={<Location />} />
    </Routes>
  </AppStoreProvider>
}

describe('登录后恢复业务目标', () => {
  beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear() })
  afterEach(() => vi.restoreAllMocks())

  it.each([undefined, null, '', '//example.com', '/\\example.com', 'https://example.com'])('没有合法目标时使用快速接入：%s', (path) => {
    expect(resolveLoginDestination(path)).toBe(DEFAULT_CONSOLE_PATH)
  })

  it.each([
    { mode: 'dialog' as const, returnPath: target, firstLogin: true },
    { mode: 'page' as const, returnPath: target, firstLogin: true },
    { mode: 'dialog' as const, returnPath: target, firstLogin: false },
    { mode: 'page' as const, returnPath: undefined, firstLogin: true },
    { mode: 'dialog' as const, returnPath: undefined, firstLogin: true },
  ])('$mode 登录，首次登录=$firstLogin，返回 $returnPath', async ({ mode, returnPath, firstLogin }) => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input)
      const data = path.endsWith('/api/auth/phone/code')
        ? { destination_masked: '138****8000', expires_at: '2099-01-01T00:05:00Z', retry_after_seconds: 60 }
        : path.endsWith('/api/auth/phone/login') ? { ...authResult, promt_required: firstLogin } : {}
      return new Response(JSON.stringify({ code: 0, msg: 'success', data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    const initialPath = mode === 'dialog' ? '/models' : `/login${returnPath ? `?return=${encodeURIComponent(returnPath)}` : ''}`
    render(<MemoryRouter initialEntries={[initialPath]}><Provider store={createAppStore()}><LoginRoutes mode={mode} returnPath={returnPath} /></Provider></MemoryRouter>)
    if (mode === 'dialog') await user.click(screen.getByRole('link', { name: '体验模型' }))
    await user.type(screen.getByLabelText('手机号'), '13800138000')
    await user.click(screen.getByRole('button', { name: '获取验证码' }))
    await screen.findByText('验证码已发送至 138****8000')
    await user.type(screen.getByLabelText('验证码'), '482915')
    await user.click(screen.getByRole('button', { name: '登录 / 注册' }))
    await waitFor(() => expect(screen.getByTestId('destination').textContent).toBe(returnPath ?? DEFAULT_CONSOLE_PATH))
    expect(screen.queryByRole('dialog', { name: '登录 Token NX' })).not.toBeInTheDocument()
  })
})
