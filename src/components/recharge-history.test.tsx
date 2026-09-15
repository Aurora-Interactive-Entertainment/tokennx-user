import '@/i18n'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getBillingStatements,
  type BillingPageResult,
  type BillingStatementLine,
} from '@/api/billing'
import { RechargeHistory } from './recharge-history'

vi.mock('@/api/billing', async () => ({
  ...(await vi.importActual<typeof import('@/api/billing')>('@/api/billing')),
  getBillingStatements: vi.fn(),
}))

const request = vi.mocked(getBillingStatements)
const onAuthFailure = vi.fn()
const context = {
  account_type: 'enterprise',
  enterprise_id: 'ent_feedback',
} as const
const item: BillingStatementLine = {
  id: 'recharge_1',
  line_type: 'recharge',
  source_type: 'paid',
  title: '余额充值',
  description: '支付宝充值到账',
  direction: 'income',
  amount_yuan: '100.00',
  balance_after_yuan: '120.00',
  occurred_at: 1789459200000,
  request_id: null,
}
const result: BillingPageResult<BillingStatementLine> = {
  items: [item],
  page: 1,
  page_size: 10,
  total: 21,
}

beforeEach(() => {
  vi.clearAllMocks()
  request.mockResolvedValue(result)
})

describe('充值记录', () => {
  it('按当前企业筛选充值流水，并从服务端加载后续分页', async () => {
    const user = userEvent.setup()
    render(
      <RechargeHistory
        context={context}
        refreshToken={0}
        onAuthFailure={onAuthFailure}
      />,
    )
    expect(await screen.findByText('支付宝充值到账')).toBeInTheDocument()
    expect(request).toHaveBeenLastCalledWith(
      context,
      expect.objectContaining({
        line_type: 'recharge',
        page: 1,
        page_size: 10,
      }),
    )
    await user.click(screen.getByText('2', { selector: '.semi-page-item' }))
    await waitFor(() =>
      expect(request).toHaveBeenLastCalledWith(
        context,
        expect.objectContaining({ page: 2 }),
      ),
    )
  })

  it('没有到账流水时展示空态', async () => {
    request.mockResolvedValue({ ...result, items: [], total: 0 })
    render(
      <RechargeHistory
        context={context}
        refreshToken={0}
        onAuthFailure={onAuthFailure}
      />,
    )
    expect(await screen.findByText('暂无充值记录')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('查询失败时可重试，失败不会伪装成暂无记录', async () => {
    request.mockRejectedValueOnce(new Error('records failed'))
    const user = userEvent.setup()
    render(
      <RechargeHistory
        context={context}
        refreshToken={0}
        onAuthFailure={onAuthFailure}
      />,
    )
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('暂无充值记录')).toBeNull()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('支付宝充值到账')).toBeInTheDocument()
  })

  it('支付状态变化后刷新记录，卸载后忽略未完成的请求', async () => {
    const view = render(
      <RechargeHistory
        context={context}
        refreshToken={0}
        onAuthFailure={onAuthFailure}
      />,
    )
    await screen.findByText('支付宝充值到账')
    let complete!: (value: BillingPageResult<BillingStatementLine>) => void
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    view.rerender(
      <RechargeHistory
        context={context}
        refreshToken={1}
        onAuthFailure={onAuthFailure}
      />,
    )
    expect(request).toHaveBeenCalledTimes(2)
    const signal = request.mock.calls[1][1]?.signal
    view.unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => complete(result))
  })
})
