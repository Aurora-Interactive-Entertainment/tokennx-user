import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { createAppStore } from '@/store'
import { HeaderPurchase } from '@/components/header-purchase'
import { SubscriptionPage } from '@/pages/subscription'
import { getProductPlans, getPurchasedProductPlans, getPublicProductPlans } from '@/api/product-plans'
import { createBillingPaymentOrder, getBillingPaymentOrder, startBillingPayment } from '@/api/billing'
import { notifyPurchasedPlansChanged } from '@/api/purchased-plan-updates'
import { userPlanFixture, planListFixture } from '@/test/product-plan-fixtures'

vi.mock('@/api/product-plans', async original => ({ ...await original<object>(), getProductPlans: vi.fn(), getPurchasedProductPlans: vi.fn(), getPublicProductPlans: vi.fn() }))
vi.mock('@/api/billing', async original => ({ ...await original<object>(), createBillingPaymentOrder: vi.fn(), getBillingPaymentOrder: vi.fn(), startBillingPayment: vi.fn(), closeBillingPaymentOrder: vi.fn() }))
vi.mock('@/auth/token-storage', async original => ({ ...await original<object>(), getAccessToken: () => 'synthetic-audit-token' }))
vi.mock('@/data/app-state', async original => ({ ...await original<object>(), useAppStore: () => ({ activeWorkspace: { id: 'synthetic-enterprise', type: 'enterprise', name: 'Synthetic enterprise', role: 'owner' } }) }))
vi.mock('@/components/common', () => ({ PageTitle: ({ title, actions }: { title: string; actions: ReactNode }) => <header><h1>{title}</h1>{actions}</header>, LoginDialog: () => null, requestSupportWidget: vi.fn() }))
vi.mock('@/components/app-modal', () => ({ default: ({ visible, children, className }: { visible: boolean; children: ReactNode; className: string }) => visible ? <div role="dialog" className={className}>{children}</div> : null }))
vi.mock('@/components/payment-qr-code', () => ({ PaymentQRCode: () => <span>synthetic qr</span> }))
vi.mock('@/components/recharge-agreement-modal', () => ({ default: () => null }))
vi.mock('@/components/app-toast', () => ({ appToast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/observability/payment-log', () => ({ recordPaymentTransition: vi.fn() }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('AUDIT: real network prohibited'))
  vi.mocked(getProductPlans).mockResolvedValue(planListFixture([userPlanFixture]))
  vi.mocked(getPublicProductPlans).mockResolvedValue(planListFixture([]))
  vi.mocked(getPurchasedProductPlans).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 })
  const order = { id: 'synthetic-order', order_type: 'plan_purchase', amount_yuan: '2.99', amount_cent: '299', status: 'paid', paid_at: Date.now(), account_type: 'enterprise', enterprise_id: 'synthetic-enterprise' }
  vi.mocked(createBillingPaymentOrder).mockResolvedValue(order as never)
  vi.mocked(getBillingPaymentOrder).mockResolvedValue(order as never)
})

describe('套餐到账后的已购权益同步', () => {
  it('权益查询失败展示重试入口而非空订阅，恢复后显示真实套餐', async () => {
    vi.mocked(getPurchasedProductPlans)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ items: [{ id: 'existing-entitlement', models: [{ model_name: '已有套餐模型', entitlement_mode: 'token_quota', token_quota_total: '1000', token_quota_remaining: '1000' }] }], total: 1, page: 1, page_size: 100 } as never)
    render(<MemoryRouter><Provider store={createAppStore()}><SubscriptionPage /></Provider></MemoryRouter>)
    const error = await screen.findByRole('alert')
    expect(document.querySelector('.subscription-empty-state')).toBeNull()
    fireEvent.click(within(error).getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('heading', { name: '已有套餐模型' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('其他账号或主体的通知不刷新，当前主体通知刷新，卸载后停止监听', async () => {
    const store = createAppStore()
    store.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: { id: 'synthetic-user', display_name: 'Synthetic user', status: 'active' } })
    const page = render(<MemoryRouter><Provider store={store}><SubscriptionPage /></Provider></MemoryRouter>)
    await waitFor(() => expect(getPurchasedProductPlans).toHaveBeenCalledOnce())
    await act(async () => {
      notifyPurchasedPlansChanged('other-user', { account_type: 'enterprise', enterprise_id: 'synthetic-enterprise' })
      notifyPurchasedPlansChanged('synthetic-user', { account_type: 'personal' })
      notifyPurchasedPlansChanged('synthetic-user', { account_type: 'enterprise', enterprise_id: 'other-enterprise' })
    })
    expect(getPurchasedProductPlans).toHaveBeenCalledOnce()
    await act(async () => notifyPurchasedPlansChanged('synthetic-user', { account_type: 'enterprise', enterprise_id: 'synthetic-enterprise' }))
    expect(getPurchasedProductPlans).toHaveBeenCalledTimes(2)
    page.unmount()
    notifyPurchasedPlansChanged('synthetic-user', { account_type: 'enterprise', enterprise_id: 'synthetic-enterprise' })
    expect(getPurchasedProductPlans).toHaveBeenCalledTimes(2)
  })

  it('顶部购买确认到账后重新查询当前主体的已购权益', async () => {
    vi.mocked(getPurchasedProductPlans)
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 100 })
      .mockResolvedValue({ items: [{ id: 'new-entitlement', models: [{ model_name: '新到账模型', entitlement_mode: 'token_quota', token_quota_total: '1000', token_quota_remaining: '1000' }] }], total: 1, page: 1, page_size: 100 } as never)
    const store = createAppStore()
    store.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: { id: 'synthetic-user', display_name: 'Synthetic user', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' } })
    render(<MemoryRouter><Provider store={store}><HeaderPurchase context={{ account_type: 'enterprise', enterprise_id: 'synthetic-enterprise' }} /><SubscriptionPage /></Provider></MemoryRouter>)
    await waitFor(() => expect(getPurchasedProductPlans).toHaveBeenCalledOnce())
    await waitFor(() => expect(getProductPlans).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '立即订购' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'DeepSeek套餐包 ¥2.99' }))
    await screen.findByRole('heading', { name: '支付' })
    await act(async () => fireEvent.click(screen.getByRole('checkbox')))
    await waitFor(() => expect(getProductPlans).toHaveBeenCalledTimes(2))
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce()
    expect(startBillingPayment).not.toHaveBeenCalled()
    // 套餐目录和已购权益都必须刷新；到账后不再调用支付接口。
    await screen.findByRole('heading', { name: '新到账模型' })
    expect(document.querySelector('.subscription-empty-state')).toBeNull()
    expect(getPurchasedProductPlans).toHaveBeenCalledTimes(2)
  })
})
