import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'
import { AppStoreProvider } from '@/data/app-state'
import { createAppStore } from '@/store'
import { invalidateAuth } from '@/store/auth-slice'
import { AUTH_SYNC_STORAGE_KEY } from '@/auth/token-storage'
import App, { ConsoleHomeRedirect, ConsoleOutlet } from './App'

describe('控制台认证路由', () => {
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

      expect(await screen.findByText('页面不存在')).toBeInTheDocument()
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
})
