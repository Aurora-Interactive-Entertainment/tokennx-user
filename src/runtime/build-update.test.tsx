import { StrictMode } from 'react'
import { renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useBuildUpdateBlocker } from './use-build-update-blocker'

afterEach(() => { delete window.__TOKEN_NX_UPDATE_GUARD__ })

it('多个组件与 StrictMode 均独立释放操作保护，卸载不遗留保护', () => {
  const leases = new Set<object>()
  window.__TOKEN_NX_UPDATE_GUARD__ = {
    pendingVersion: '', check: vi.fn(), routeChanged: vi.fn(),
    blockReload: () => {
      const lease = {}
      leases.add(lease)
      return () => { leases.delete(lease) }
    },
  }
  const first = renderHook(({ active }) => useBuildUpdateBlocker(active), {
    initialProps: { active: true }, wrapper: StrictMode,
  })
  const second = renderHook(() => useBuildUpdateBlocker(true))
  expect(leases.size).toBe(2)
  first.rerender({ active: false })
  expect(leases.size).toBe(1)
  first.unmount()
  expect(leases.size).toBe(1)
  second.unmount()
  expect(leases.size).toBe(0)
})

it('开发环境没有内联守卫时保持正常运行', () => {
  const view = renderHook(() => useBuildUpdateBlocker(true))
  view.unmount()
})
