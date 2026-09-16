import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { BuildUpdateNotice } from './build-update-notice'

beforeEach(async () => {
  await i18n.changeLanguage('zh-CN')
  window.__TOKEN_NX_UPDATE_GUARD__ = {
    pendingVersion: 'new', check: vi.fn().mockResolvedValue(undefined),
    routeChanged: vi.fn().mockResolvedValue(undefined), reload: vi.fn().mockReturnValue(true),
  }
})
afterEach(() => { delete window.__TOKEN_NX_UPDATE_GUARD__ })

it('新版本提示由用户主动刷新，稍后关闭不会刷新', () => {
  render(<MemoryRouter><BuildUpdateNotice /></MemoryRouter>)
  expect(screen.getByText('有新版本可用')).toBeInTheDocument()
  expect(window.__TOKEN_NX_UPDATE_GUARD__?.routeChanged).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '稍后再说' }))
  expect(screen.queryByText('有新版本可用')).not.toBeInTheDocument()
  expect(window.__TOKEN_NX_UPDATE_GUARD__?.reload).not.toHaveBeenCalled()
})

it('英文提示正确显示并调用手动刷新', async () => {
  await i18n.changeLanguage('en-US')
  render(<MemoryRouter><BuildUpdateNotice /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh to update' }))
  expect(window.__TOKEN_NX_UPDATE_GUARD__?.reload).toHaveBeenCalledTimes(1)
})

it('当前版本恢复一致后撤下提示', () => {
  render(<MemoryRouter><BuildUpdateNotice /></MemoryRouter>)
  act(() => {
    window.__TOKEN_NX_UPDATE_GUARD__ = { ...window.__TOKEN_NX_UPDATE_GUARD__!, pendingVersion: '' }
    window.dispatchEvent(new Event('token-nx:update-available'))
  })
  expect(screen.queryByText('有新版本可用')).not.toBeInTheDocument()
})
