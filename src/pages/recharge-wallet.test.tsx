import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getBillingWallet, type BillingWalletResponse } from '@/api/billing'
import { RechargePage } from './recharge'

const fixture = vi.hoisted(() => ({ workspace: { id: 'enterprise-a', type: 'enterprise', role: 'owner' }, dispatch: vi.fn() }))
vi.mock('@/data/app-state', () => ({ useAppStore: () => ({ activeWorkspace: fixture.workspace }) }))
vi.mock('@/store/hooks', () => ({ useAppDispatch: () => fixture.dispatch }))
vi.mock('@/components/common', () => ({ PageTitle: ({ title }: { title: string }) => <h1>{title}</h1> }))
vi.mock('./billing', () => ({ billingContextForWorkspace: (workspace: typeof fixture.workspace) => ({ account_type: workspace.type, enterprise_id: workspace.id }), billingContextKey: (context: { enterprise_id: string }) => context.enterprise_id, PaymentReturnNotice: () => null, RechargeTab: () => null }))
vi.mock('@/components/recharge-history', () => ({ RechargeHistory: () => null }))
vi.mock('@/components/balance-alert-dialog', () => ({ BalanceAlertDialog: () => null }))
vi.mock('@/api/billing', async (original) => ({ ...await original<object>(), getBillingWallet: vi.fn() }))

function wallet(amount: string): BillingWalletResponse {
  return { wallet: { total_available_yuan: amount, paid_available_yuan: amount, debt_yuan: '0' } } as BillingWalletResponse
}

describe('充值钱包状态隔离', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    fixture.workspace = { id: 'enterprise-a', type: 'enterprise', role: 'owner' }
  })

  it('切换企业后请求失败不会沿用旧余额，重试显示新企业真实余额', async () => {
    vi.mocked(getBillingWallet).mockResolvedValueOnce(wallet('123.45')).mockRejectedValueOnce(new Error('network failed')).mockResolvedValue(wallet('67.89'))
    const { rerender } = render(<MemoryRouter><RechargePage /></MemoryRouter>)
    await screen.findAllByText('¥123.4500')
    fixture.workspace = { ...fixture.workspace, id: 'enterprise-b' }
    rerender(<MemoryRouter><RechargePage /></MemoryRouter>)
    expect(screen.queryAllByText('¥123.4500')).toHaveLength(0)
    await screen.findByRole('alert')
    expect(screen.getAllByText('¥—')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await screen.findAllByText('¥67.8900')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(vi.mocked(getBillingWallet).mock.calls.slice(1).every(([context]) => context.enterprise_id === 'enterprise-b')).toBe(true)
  })

  it('切换后旧主体迟到响应不能覆盖新余额', async () => {
    let resolveOld!: (value: BillingWalletResponse) => void
    vi.mocked(getBillingWallet).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve })).mockResolvedValue(wallet('67.89'))
    const { rerender } = render(<MemoryRouter><RechargePage /></MemoryRouter>)
    fixture.workspace = { ...fixture.workspace, id: 'enterprise-b' }
    rerender(<MemoryRouter><RechargePage /></MemoryRouter>)
    await screen.findAllByText('¥67.8900')
    await act(async () => resolveOld(wallet('123.45')))
    expect(screen.queryAllByText('¥123.4500')).toHaveLength(0)
    expect(screen.getAllByText('¥67.8900')).toHaveLength(2)
  })

  it('成功返回的零余额正常显示，加载结束', async () => {
    vi.mocked(getBillingWallet).mockResolvedValue(wallet('0'))
    render(<MemoryRouter><RechargePage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('region', { name: '可用余额' })).toHaveAttribute('aria-busy', 'false'))
    expect(screen.getAllByText('¥0.0000')).toHaveLength(3)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
