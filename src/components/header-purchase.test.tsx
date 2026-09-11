import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppStore } from '@/store'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { invalidateAuth } from '@/store/auth-slice'
import { getProductPlans, getPublicProductPlans } from '@/api/product-plans'
import { getRealNameProfile } from '@/api/real-name'
import { createBillingPaymentOrder, startBillingPayment } from '@/api/billing'
import { publicPlanFixture, userPlanFixture, planListFixture } from '@/test/product-plan-fixtures'
import { HeaderPurchase } from './header-purchase'

const user = { id: 'catalog-user', display_name: '测试用户', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' }
vi.mock('./common', () => ({
  requestSupportWidget: vi.fn(),
  // 模拟登录组件成功回调，目录切换、实名门禁与支付组件仍使用真实实现。
  LoginDialog: ({ open, onSuccess, onClose }: { open: boolean; onSuccess: () => void; onClose: () => void }) => {
    const dispatch = useAppDispatch()
    return open ? <button onClick={async () => {
      dispatch({ type: 'auth/loginWithEmail/pending' })
      await Promise.resolve()
      // 保存令牌先触发本标签页的用户同步，随后登录 thunk 才 fulfilled。
      dispatch({ type: 'auth/synchronizeAuthenticatedUser', payload: user })
      dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: user })
      onSuccess()
      onClose()
    }}>测试登录成功</button> : null
  },
}))
vi.mock('@/api/product-plans', async (original) => ({ ...await original<object>(), getProductPlans: vi.fn(), getPublicProductPlans: vi.fn() }))
vi.mock('@/api/real-name', async (original) => ({ ...await original<object>(), getRealNameProfile: vi.fn() }))
vi.mock('@/auth/token-storage', async (original) => ({ ...await original<object>(), getAccessToken: () => 'fixture-token' }))
vi.mock('@/api/billing', async (original) => ({ ...await original<object>(), createBillingPaymentOrder: vi.fn(), startBillingPayment: vi.fn() }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getPublicProductPlans).mockResolvedValue(planListFixture([publicPlanFixture]))
  vi.mocked(getProductPlans).mockResolvedValue(planListFixture([userPlanFixture]))
  vi.mocked(getRealNameProfile).mockResolvedValue({ status: 'verified' })
  vi.mocked(createBillingPaymentOrder).mockResolvedValue({ id: 'fixture-order', amount_yuan: '2.99', status: 'paid', paid_at: 1 } as never)
})
afterEach(cleanup)

async function openCatalog() {
  fireEvent.click(screen.getByRole('button', { name: '订阅' }))
  return screen.findByRole('dialog')
}

function AuthScopedHeader() {
  const auth = useAppSelector(state => state.auth)
  // 与真实应用一致：登录中、登录成功和退出都会重新挂载页面。
  return <HeaderPurchase key={`${auth.status}:${auth.user?.id ?? ''}`} />
}

describe('订阅入口完整数据流', () => {
  it('页面挂载预加载且打开菜单不重复加载，登录后用新价格和真实 ID 继续购买', async () => {
    const store = createAppStore()
    render(<MemoryRouter><Provider store={store}><AuthScopedHeader /></Provider></MemoryRouter>)
    await waitFor(() => expect(getPublicProductPlans).toHaveBeenCalledOnce())
    const modal = await openCatalog()
    expect(within(modal).queryByText(/限购/)).toBeNull()
    fireEvent.click(within(modal).getByRole('button', { name: 'DeepSeek套餐包 ¥1.99' }))
    expect(getRealNameProfile).not.toHaveBeenCalled()
    expect(createBillingPaymentOrder).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '测试登录成功' }))
    await screen.findByRole('heading', { name: '支付' })
    expect(getProductPlans).toHaveBeenCalledOnce()
    expect(getPublicProductPlans).toHaveBeenCalledTimes(2)
    expect(document.querySelector('.purchase-payment-total')).toHaveTextContent('¥2.99')
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(createBillingPaymentOrder).toHaveBeenCalledWith({ account_type: 'personal' }, { plan_id: publicPlanFixture.id, quantity: 1 }, expect.any(String), expect.any(Object)))
    // 退出登录后目录回到公开接口，旧支付会话立即卸载。
    act(() => { store.dispatch(invalidateAuth()) })
    await waitFor(() => expect(getPublicProductPlans).toHaveBeenCalledTimes(3))
    expect(document.querySelector('.purchase-payment-modal')).toBeNull()
  })

  it.each(['unavailable', 'missing', 'unverified'])('登录后套餐 %s 不启动支付', async (scenario) => {
    if (scenario === 'unavailable') vi.mocked(getProductPlans).mockResolvedValue(planListFixture([{ ...userPlanFixture, can_purchase: false }]))
    if (scenario === 'missing') vi.mocked(getProductPlans).mockResolvedValue(planListFixture([]))
    if (scenario === 'unverified') vi.mocked(getRealNameProfile).mockResolvedValue({ status: 'unverified' })
    render(<MemoryRouter><Provider store={createAppStore()}><AuthScopedHeader /></Provider></MemoryRouter>)
    const modal = await openCatalog()
    fireEvent.click(within(modal).getByRole('button', { name: 'DeepSeek套餐包 ¥1.99' }))
    fireEvent.click(screen.getByRole('button', { name: '测试登录成功' }))
    await waitFor(() => expect(getProductPlans).toHaveBeenCalledOnce())
    if (scenario === 'unverified') await screen.findByRole('heading', { name: '实名认证', level: 2 })
    else await waitFor(() => expect(document.querySelector('.purchase-subscription-modal-content')).not.toHaveAttribute('inert'))
    expect(document.querySelector('.purchase-payment-modal')).toBeNull()
    expect(createBillingPaymentOrder).not.toHaveBeenCalled()
    expect(startBillingPayment).not.toHaveBeenCalled()
  })
})
