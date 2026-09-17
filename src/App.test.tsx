import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@/i18n'
import { MemoryRouter, Route, Routes } from 'react-router'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'
import { AppStoreProvider } from '@/data/app-state'
import { createAppStore } from '@/store'
import { invalidateAuth } from '@/store/auth-slice'
import { AUTH_SYNC_STORAGE_KEY, clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import { PublicHeader } from '@/components/common'
import App, { AuthBootstrap, ConsoleHomeRedirect, ConsoleOutlet } from './App'

describe('控制台认证路由', () => {
  it('英文路由切回中文时，旧路由守卫不会重新覆盖语言', async () => {
    clearAuthTokens({ force: true, broadcast: false })
    await i18n.changeLanguage('zh-CN')
    const appStore = createAppStore()
    appStore.dispatch(invalidateAuth())
    const originalPath = window.location.pathname
    window.history.pushState({}, '', '/en/about')
    try {
      render(<Provider store={appStore}><App onBootReady={vi.fn()} /></Provider>)
      const toggle = await screen.findByRole('button', { name: 'Switch language' }, { timeout: 5000 })
      await userEvent.click(toggle)
      await waitFor(() => {
        expect(window.location.pathname).toBe('/about')
        expect(i18n.language).toBe('zh-CN')
        expect(screen.getByRole('button', { name: '切换语言' })).toHaveAttribute('aria-pressed', 'false')
      })
    } finally {
      window.history.replaceState({}, '', originalPath)
      await i18n.changeLanguage('zh-CN')
    }
  }, 10000)
  it('登录失效访问控制台时直接回到首页', () => {
    const appStore = createAppStore()
    appStore.dispatch(invalidateAuth())

    render(
      <Provider store={appStore}>
        <AppStoreProvider>
          <MemoryRouter initialEntries={['/console/api-keys']}>
            <Routes>
              <Route path="/console" element={<ConsoleOutlet />}>
                <Route path="api-keys" element={<div>受保护页面</div>} />
              </Route>
              <Route path="/" element={<div>首页内容</div>} />
            </Routes>
          </MemoryRouter>
        </AppStoreProvider>
      </Provider>,
    )

    expect(screen.getByText('首页内容')).toBeInTheDocument()
    expect(screen.queryByText('受保护页面')).toBeNull()
  })

  it('访问控制台根路径时跳转到快速接入', async () => {
    render(
      <MemoryRouter initialEntries={['/console']}>
        <Routes>
          <Route path="/console" element={<ConsoleHomeRedirect />} />
          <Route path="/console/quickstart" element={<div>快速接入页面</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('快速接入页面')).toBeInTheDocument())
  })

  it('应用根组件中的认证同步可以使用路由导航', async () => {
    const appStore = createAppStore()
    appStore.dispatch(invalidateAuth())
    const originalPath = window.location.pathname
    window.history.pushState({}, '', '/not-found')

    try {
      render(
        <Provider store={appStore}>
          <App onBootReady={vi.fn()} />
        </Provider>,
      )

      await waitFor(() => expect(window.location.pathname).toBe('/'))
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: AUTH_SYNC_STORAGE_KEY,
          newValue: JSON.stringify({
            type: 'signed-out',
            eventId: `app-root-test:${Date.now()}`,
            revision: { timestamp: Date.now() + 1, writerId: 'app-root-test' },
          }),
        }),
      )

      await waitFor(() => expect(window.location.pathname).toBe('/'))
    } finally {
      window.history.pushState({}, '', originalPath)
    }
  })

  it('登录后自动取未读通知数，铃铛红点无需点击即可显示', async () => {
    const appStore = createAppStore()
    appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: { id: 'user-1', display_name: '测试用户', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' } })
    saveAuthTokens({ status: 'succeeded', binding_required: false, access_token: 'notification-access-token', refresh_token: 'notification-refresh-token', refresh_expires_at: Date.UTC(2099, 0, 1) })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      const payload = url.includes('/api/user/notifications')
        ? { items: [{ id: 'notice-1', type: 'account', category: 'security', severity: 'info', title: '新消息', content: '内容', read: false, created_at: '2026-08-26T11:54:26Z' }], unread_count: 1 }
        : {}
      return new Response(JSON.stringify({ code: 0, msg: 'success', data: payload }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    try {
      render(
        <Provider store={appStore}>
          <AppStoreProvider>
            <MemoryRouter initialEntries={['/']}>
              <AuthBootstrap><PublicHeader /></AuthBootstrap>
            </MemoryRouter>
          </AppStoreProvider>
        </Provider>,
      )

      // 未读接口由登录态触发，红点不依赖用户先点开铃铛。
      await waitFor(() => expect(document.querySelector('.header-notification-dot')).not.toBeNull())
      const notificationCalls = fetchMock.mock.calls.map(([input]) => String(input)).filter((url) => url.includes('/api/user/notifications'))
      expect(notificationCalls).toHaveLength(1)
      // 与通知面板保持同一条请求，避免后端不认识的参数导致取数静默失败。
      expect(notificationCalls[0]).toContain('/api/user/notifications?limit=100')
    } finally {
      clearAuthTokens({ force: true, broadcast: false })
      fetchMock.mockRestore()
    }
  })

  it('未登录时不请求未读通知数', () => {
    const appStore = createAppStore()
    appStore.dispatch(invalidateAuth())
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 0, msg: 'success', data: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    try {
      render(
        <Provider store={appStore}>
          <AppStoreProvider>
            <MemoryRouter initialEntries={['/']}>
              <AuthBootstrap><PublicHeader /></AuthBootstrap>
            </MemoryRouter>
          </AppStoreProvider>
        </Provider>,
      )

      expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/user/notifications'))).toHaveLength(0)
      expect(document.querySelector('.header-notification-dot')).toBeNull()
    } finally {
      fetchMock.mockRestore()
    }
  })
})
