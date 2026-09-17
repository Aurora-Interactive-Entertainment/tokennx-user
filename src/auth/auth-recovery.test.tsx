import type { ReactNode } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthBootstrap, ConsoleOutlet } from '@/App'
import { createAppStore } from '@/store'
import { REFRESH_SESSION_KEY, clearAuthTokens } from './token-storage'
import i18n from '@/i18n'
import { AuthRecoveryNotice } from './auth-recovery-notice'

// 使用真实认证守卫验证路由边界，省略布局内与本用例无关的通知及业务请求。
vi.mock('@/components/common', () => ({
  AppLoadingScreen: ({ label }: { label: string }) => <div role="status">{label}</div>,
  ConsoleLayout: ({ children }: { children: ReactNode }) => <><AuthRecoveryNotice />{children}</>,
  PublicLayout: ({ children }: { children: ReactNode }) => children,
  prefetchUnreadNotificationCount: vi.fn().mockResolvedValue(undefined),
  DEFAULT_CONSOLE_PATH: '/console/quickstart',
}))

const user = { id: 'restore-user', display_name: '恢复用户', avatar_url: '' }
function apiResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ code: status === 200 ? 0 : 120001, msg: status === 200 ? 'success' : '恢复服务暂不可用', data }), { status, headers: { 'Content-Type': 'application/json' } })
}
function Page({ protectedPage = false }: { protectedPage?: boolean }) {
  const location = useLocation()
  return <>{!protectedPage ? <AuthRecoveryNotice /> : null}<h1>{protectedPage ? '受保护内容' : '公开内容'}</h1><span>{location.pathname}</span><Link to="/console/playground">进入控制台</Link></>
}
function renderRecovery(pathname: string) {
  const store = createAppStore()
  render(<Provider store={store}><MemoryRouter initialEntries={[pathname]}><AuthBootstrap><Routes>
    <Route path="/console" element={<ConsoleOutlet />}><Route path="playground" element={<Page protectedPage />} /></Route>
    <Route path="*" element={<Page />} />
  </Routes></AuthBootstrap></MemoryRouter></Provider>)
  return store
}
beforeEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('zh-CN')
  clearAuthTokens({ force: true, broadcast: false })
  window.localStorage.setItem(REFRESH_SESSION_KEY, JSON.stringify({ refreshToken: 'old-refresh', refreshExpiresAt: Date.UTC(2099, 0, 1) }))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); clearAuthTokens({ force: true, broadcast: false }) })

it.each(['/', '/docs', '/news', '/en/docs', '/console/playground'])('%s 恢复失败仅拦截控制台，重试成功保留原路由', async pathname => {
  const protectedPage = pathname.startsWith('/console/')
  let refreshAttempts = 0
  let finishRetry!: (response: Response) => void
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const path = String(input)
    if (path.includes('/api/auth/refresh')) {
      refreshAttempts += 1
      return refreshAttempts === 1 ? apiResponse(null, 503) : new Promise<Response>(resolve => { finishRetry = resolve })
    }
    if (path.includes('/api/auth/me')) return apiResponse(user)
    return apiResponse({ items: [], unread_count: 0 })
  })
  const store = renderRecovery(pathname)
  expect(await screen.findByRole('alert')).toHaveTextContent('恢复服务暂不可用')
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(screen.queryByRole('heading', { name: '受保护内容' })).not.toBeInTheDocument()
  if (protectedPage) expect(screen.queryByRole('heading', { name: '公开内容' })).not.toBeInTheDocument()
  else expect(screen.getByRole('heading', { name: '公开内容' })).toBeInTheDocument()
  expect(window.localStorage.getItem(REFRESH_SESSION_KEY)).toContain('old-refresh')
  await userEvent.click(screen.getByRole('button', { name: '重试' }))
  await waitFor(() => expect(refreshAttempts).toBe(2))
  expect(screen.getByRole('button', { name: '重试' })).toBeDisabled()
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  if (!protectedPage) expect(screen.getByRole('heading', { name: '公开内容' })).toBeInTheDocument()
  finishRetry(apiResponse({ status: 'succeeded', binding_required: false, access_token: 'new-access', refresh_token: 'new-refresh', refresh_expires_at: Date.UTC(2099, 0, 1), user }))
  await waitFor(() => expect(store.getState().auth.status).toBe('authenticated'))
  expect(screen.getByRole('heading', { name: protectedPage ? '受保护内容' : '公开内容' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByText(pathname)).toBeInTheDocument()
  expect(refreshAttempts).toBe(2)
})

it('公开页恢复失败后进入控制台仍由守卫拦截，不重复恢复请求或错误面板', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse(null, 503))
  const store = renderRecovery('/docs')
  await screen.findByRole('alert')
  await userEvent.click(screen.getByRole('link', { name: '进入控制台' }))
  expect(store.getState().auth.status).toBe('restore-failed')
  expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
