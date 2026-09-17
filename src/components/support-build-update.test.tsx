import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { ManuscriptSupportWidget } from './common'

afterEach(() => { delete window.__TOKEN_NX_UPDATE_GUARD__ })

it('客服草稿收起后继续保护更新，清空或卸载时只释放自己的保护', async () => {
  await i18n.changeLanguage('zh-CN')
  const user = userEvent.setup()
  const leases = new Set<symbol>()
  const blockReload = vi.fn(() => {
    const lease = Symbol('操作保护')
    leases.add(lease)
    return () => { leases.delete(lease) }
  })
  window.__TOKEN_NX_UPDATE_GUARD__ = {
    pendingVersion: 'next-build', check: vi.fn().mockResolvedValue(undefined),
    routeChanged: vi.fn().mockResolvedValue(undefined),
    blockReload,
  }
  const view = render(<MemoryRouter><ManuscriptSupportWidget /></MemoryRouter>)

  await user.click(screen.getByRole('button', { name: i18n.t('support.open') }))
  const dialog = await screen.findByRole('dialog', { name: i18n.t('support.dialogLabel') })
  const input = within(dialog).getByRole('textbox', { name: i18n.t('support.inputLabel') })
  await user.type(input, '还没有发送的客服问题')
  expect(leases.size).toBe(1)

  await user.click(within(dialog).getByRole('button', { name: i18n.t('support.closePanel') }))
  // 等到关闭动画结束且输入框真正卸载，排除可见 dialog 自身仍在阻止更新的情况。
  await waitFor(() => expect(dialog).not.toBeInTheDocument())
  expect(input).not.toBeInTheDocument()
  expect(leases.size).toBe(1)

  await user.click(screen.getByRole('button', { name: i18n.t('support.open') }))
  const restoredInput = await screen.findByRole('textbox', { name: i18n.t('support.inputLabel') })
  expect(restoredInput).toHaveValue('还没有发送的客服问题')
  expect(leases.size).toBe(1)
  await user.clear(restoredInput)
  expect(leases.size).toBe(0)

  // 模拟另一个操作同时持有保护，客服卸载不能误释放其他操作，也不能泄漏自己的 lease。
  const releaseOtherOperation = blockReload()
  await user.type(restoredInput, '新的未发送问题')
  expect(leases.size).toBe(2)
  view.unmount()
  expect(leases.size).toBe(1)
  releaseOtherOperation()
  expect(leases.size).toBe(0)
})
