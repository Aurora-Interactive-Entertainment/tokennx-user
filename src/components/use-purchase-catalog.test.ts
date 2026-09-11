import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getProductPlans, getPublicProductPlans } from '@/api/product-plans'
import { publicPlanFixture, userPlanFixture, planListFixture } from '@/test/product-plan-fixtures'
import { usePurchaseCatalog } from './use-purchase-catalog'

vi.mock('@/api/product-plans', () => ({ getProductPlans: vi.fn(), getPublicProductPlans: vi.fn() }))
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getPublicProductPlans).mockResolvedValue(planListFixture([publicPlanFixture])); vi.mocked(getProductPlans).mockResolvedValue(planListFixture([userPlanFixture])) })
afterEach(cleanup)

describe('身份隔离的预加载套餐目录', () => {
  it('挂载即取公开目录，登录及退出切换接口且不复用旧价格', async () => {
    const { result, rerender } = renderHook(({ userKey }) => usePurchaseCatalog(userKey), { initialProps: { userKey: null as string | null } })
    await waitFor(() => expect(result.current.plans[0]?.price.price_cent).toBe('199'))
    expect(getProductPlans).not.toHaveBeenCalled()
    rerender({ userKey: 'user-1' })
    expect(result.current.plans).toEqual([])
    await waitFor(() => expect(result.current.plans[0]?.price.price_cent).toBe('299'))
    rerender({ userKey: null })
    expect(result.current.plans).toEqual([])
    await waitFor(() => expect(result.current.plans[0]?.price.price_cent).toBe('199'))
    expect(getPublicProductPlans).toHaveBeenCalledTimes(2)
    expect(getProductPlans).toHaveBeenCalledOnce()
  })

  it('登录切换后忽略迟到的公开响应，终止旧请求', async () => {
    let resolve!: (value: ReturnType<typeof planListFixture<typeof publicPlanFixture>>) => void
    vi.mocked(getPublicProductPlans).mockReturnValueOnce(new Promise(done => { resolve = done }))
    const { result, rerender } = renderHook(({ userKey }) => usePurchaseCatalog(userKey), { initialProps: { userKey: null as string | null } })
    const signal = vi.mocked(getPublicProductPlans).mock.calls[0][1]?.signal
    rerender({ userKey: 'user-1' })
    expect(signal?.aborted).toBe(true)
    await waitFor(() => expect(result.current.plans[0]?.price.price_cent).toBe('299'))
    await act(async () => resolve(planListFixture([publicPlanFixture])))
    expect(result.current.plans[0]?.price.price_cent).toBe('299')
  })

  it('分页取齐并按模型分组排序，切换企业主体重新加载', async () => {
    vi.mocked(getProductPlans).mockResolvedValueOnce({ items: [userPlanFixture], total: 2, page: 1, page_size: 100 })
      .mockResolvedValueOnce({ items: [{ ...userPlanFixture, id: 'plan-first', group_sort_order: 1 }], total: 2, page: 2, page_size: 100 })
    const { result, rerender } = renderHook(({ id }) => usePurchaseCatalog('user-1', { account_type: 'enterprise', enterprise_id: id }), { initialProps: { id: 'ent-1' } })
    await waitFor(() => expect(result.current.plans).toHaveLength(2))
    expect(result.current.plans[0].id).toBe('plan-first')
    expect(getProductPlans).toHaveBeenNthCalledWith(2, { account_type: 'enterprise', enterprise_id: 'ent-1' }, expect.objectContaining({ page: 2, page_size: 100 }))
    rerender({ id: 'ent-2' })
    expect(result.current.plans).toHaveLength(0)
    await waitFor(() => expect(getProductPlans).toHaveBeenCalledTimes(3))
  })

  it('错误可重试，空目录不展示虚构套餐', async () => {
    vi.mocked(getPublicProductPlans).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(planListFixture([]))
    const { result } = renderHook(() => usePurchaseCatalog(null))
    await waitFor(() => expect(result.current.error).not.toBe(''))
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('')
    expect(result.current.plans).toEqual([])
  })

  it('分页元数据无效时停止请求并显示错误', async () => {
    vi.mocked(getPublicProductPlans).mockResolvedValueOnce({ ...planListFixture([publicPlanFixture]), total: NaN })
    const { result } = renderHook(() => usePurchaseCatalog(null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).not.toBe('')
    expect(result.current.plans).toEqual([])
    expect(getPublicProductPlans).toHaveBeenCalledOnce()
  })
})
