import { act, render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BuildVersionSync } from './build-version-sync'

beforeEach(() => {
  window.__TOKEN_NX_UPDATE_GUARD__ = {
    pendingVersion: 'new-build',
    check: vi.fn().mockResolvedValue(undefined),
    routeChanged: vi.fn().mockResolvedValue(undefined),
    blockReload: vi.fn(() => vi.fn()),
  }
})

afterEach(() => { delete window.__TOKEN_NX_UPDATE_GUARD__ })

function mountSync() {
  const router = createMemoryRouter([{ path: '*', element: <BuildVersionSync /> }], {
    initialEntries: ['/console/quickstart?model=first'],
  })
  return { router, ...render(<RouterProvider router={router} />) }
}

it('有新版本时也不渲染任何提示或弹窗', () => {
  const { container } = mountSync()
  expect(container).toBeEmptyDOMElement()
  expect(window.__TOKEN_NX_UPDATE_GUARD__?.routeChanged).toHaveBeenCalledOnce()
})

it('切换到不同页面路径时通知版本守卫', async () => {
  const { router } = mountSync()
  await act(() => router.navigate('/console/profile'))
  expect(window.__TOKEN_NX_UPDATE_GUARD__?.routeChanged).toHaveBeenCalledTimes(2)
})

it('只修改查询参数或锚点时不触发版本更新', async () => {
  const { router } = mountSync()
  await act(() => router.navigate('/console/quickstart?model=second'))
  await act(() => router.navigate('/console/quickstart?model=second#example'))
  expect(window.__TOKEN_NX_UPDATE_GUARD__?.routeChanged).toHaveBeenCalledOnce()
})

it('没有内联版本守卫的开发环境正常渲染', () => {
  delete window.__TOKEN_NX_UPDATE_GUARD__
  expect(mountSync().container).toBeEmptyDOMElement()
})
