import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginRequiredAction } from '@/components/common'
import App, { AuthScopedStoreProvider } from '@/App'
import { createAppStore } from '@/store'
import { invalidateAuth } from '@/store/auth-slice'
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
  // 复用应用实际的账号作用域，覆盖登录等待、失败和成功时的组件生命周期。
  return <AuthScopedStoreProvider>
    <Location />
    <Routes>
      <Route path="/models" element={mode === 'dialog' ? <LoginRequiredAction returnPath={returnPath}>体验模型</LoginRequiredAction> : <LoginPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/console/*" element={<div>登录成功</div>} />
    </Routes>
  </AuthScopedStoreProvider>
}

describe('登录后恢复业务目标', () => {
  beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear() })
  afterEach(() => { Toast.destroyAll(); vi.restoreAllMocks() })

  it('完整应用登录页在验证码返回 400 后显示错误并保留输入', async () => {
    const user = userEvent.setup()
    const appStore = createAppStore()
    appStore.dispatch(invalidateAuth())
    const originalPath = window.location.pathname
    window.history.replaceState({}, '', '/login')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 160001, msg: '验证码错误，请重新输入', data: null }), { status: 400 }))
    try {
      render(<Provider store={appStore}><App onBootReady={vi.fn()} /></Provider>)
      const phoneInput = await screen.findByLabelText('手机号')
      await user.type(phoneInput, '13800138000')
      await user.type(screen.getByLabelText('验证码'), '000000')
      await user.click(screen.getByRole('button', { name: '登录 / 注册' }))
      expect(await screen.findByText('验证码错误，请重新输入')).toBeInTheDocument()
      expect(screen.getByLabelText('手机号')).toBe(phoneInput)
      expect(phoneInput).toHaveValue('13800138000')
      expect(window.location.pathname).toBe('/login')
    } finally {
      window.history.replaceState({}, '', originalPath)
    }
  })

  it.each([undefined, null, '', '//example.com', '/\\example.com', 'https://example.com'])('没有合法目标时使用快速接入：%s', (path) => {
    expect(resolveLoginDestination(path)).toBe(DEFAULT_CONSOLE_PATH)
  })

  it.each(['dialog', 'page'] as const)('%s 验证码返回 400 后保留表单、错误提示和返回目标，允许更正后登录', async (mode) => {
    const user = userEvent.setup()
    const appStore = createAppStore()
    appStore.dispatch(invalidateAuth())
    let resolveLogin!: (response: Response) => void
    let loginAttempts = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = String(input)
      if (path.endsWith('/api/auth/phone/login') && ++loginAttempts === 1) {
        return new Promise<Response>((resolve) => { resolveLogin = resolve })
      }
      const data = path.endsWith('/api/auth/phone/login') ? authResult : {}
      return new Response(JSON.stringify({ code: 0, msg: 'success', data }), { status: 200 })
    })
    const initialPath = mode === 'dialog' ? '/models' : `/login?return=${encodeURIComponent(target)}`
    render(<MemoryRouter initialEntries={[initialPath]}><Provider store={appStore}><LoginRoutes mode={mode} returnPath={target} /></Provider></MemoryRouter>)
    if (mode === 'dialog') await user.click(screen.getByRole('link', { name: '体验模型' }))
    const phoneInput = screen.getByLabelText('手机号')
    const codeInput = screen.getByLabelText('验证码')
    await user.type(phoneInput, '13800138000')
    await user.click(screen.getByRole('button', { name: '获取验证码' }))
    await screen.findByText('验证码已发送至 138****8000')
    await user.type(codeInput, '000000')
    await user.click(screen.getByRole('button', { name: '登录 / 注册' }))

    expect(await screen.findByRole('button', { name: '登录中...' })).toBeDisabled()
    expect(screen.getByLabelText('手机号')).toBe(phoneInput)
    resolveLogin(new Response(JSON.stringify({ code: 160001, msg: '验证码错误，请重新输入', data: null }), { status: 400 }))

    expect((await screen.findByText('验证码错误，请重新输入')).closest('.semi-toast.app-toast.semi-toast-error')).not.toBeNull()
    expect(document.querySelector('.login-feedback')).toBeNull()
    expect(screen.getByLabelText('手机号')).toBe(phoneInput)
    expect(phoneInput).toHaveValue('13800138000')
    expect(screen.getByLabelText('验证码')).toBe(codeInput)
    expect(codeInput).toHaveValue('000000')
    expect(screen.getByRole('button', { name: /s 后重试/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: '登录 / 注册' })).toBeEnabled()
    expect(screen.getByTestId('destination').textContent).toBe(initialPath)
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/auth/refresh'))).toBe(false)

    await user.clear(codeInput)
    await user.type(codeInput, '482915')
    await user.click(screen.getByRole('button', { name: '登录 / 注册' }))
    await waitFor(() => expect(screen.getByTestId('destination').textContent).toBe(target))
    expect(loginAttempts).toBe(2)
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
