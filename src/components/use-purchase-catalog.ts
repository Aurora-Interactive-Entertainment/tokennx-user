import { useCallback, useEffect, useState } from 'react'
import { getProductPlans, getPublicProductPlans, type CatalogPlan, type ProductPlanListResponse } from '@/api/product-plans'
import { getBillingErrorMessage, type BillingContext } from '@/api/billing'

const PERSONAL_CONTEXT: BillingContext = { account_type: 'personal' }

// 身份与账务主体变化后立即隔离旧列表，避免慢响应覆盖登录后的价格和购买资格。
export function usePurchaseCatalog(userKey: string | null, context: BillingContext = PERSONAL_CONTEXT) {
  const scope = JSON.stringify([userKey, context.account_type, context.enterprise_id])
  const [revision, setRevision] = useState(0)
  const key = `${scope}:${revision}`
  const [state, setState] = useState<{ key: string; plans: CatalogPlan[]; loading: boolean; error: string }>({ key: '', plans: [], loading: true, error: '' })
  const reload = useCallback(() => setRevision(value => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const plans: CatalogPlan[] = []
        let page = 1
        // 接口每页最多 100 条，按实际总数补齐，避免套餐增多后静默遗漏。
        while (!controller.signal.aborted) {
          const response: ProductPlanListResponse<CatalogPlan> = userKey
            ? await getProductPlans(context, { page, page_size: 100, signal: controller.signal })
            : await getPublicProductPlans(context.account_type, { page, page_size: 100, signal: controller.signal })
          if (controller.signal.aborted) return
          // 分页元数据异常时停止请求，避免错误响应导致无限翻页。
          if (!Array.isArray(response?.items) || !Number.isSafeInteger(response.total) || response.total < 0 || response.page !== page) {
            throw new Error('Invalid product plan list')
          }
          plans.push(...response.items)
          if (response.items.length === 0 || plans.length >= response.total) break
          page++
        }
        if (controller.signal.aborted) return
        // 所有环境只展示接口返回的套餐，空目录交由页面显示正式空状态。
        const sorted = Array.from(new Map(plans.map(plan => [plan.id, plan])).values())
          .sort((a, b) => a.group_sort_order - b.group_sort_order || a.name.localeCompare(b.name))
        setState({ key, plans: sorted, loading: false, error: '' })
      } catch (error) {
        if (!controller.signal.aborted) setState({ key, plans: [], loading: false, error: getBillingErrorMessage(error) })
      }
    }
    void load()
    return () => controller.abort()
  }, [key, userKey, context.account_type, context.enterprise_id])

  return {
    plans: state.key === key ? state.plans : [] as CatalogPlan[],
    loading: state.key !== key || state.loading,
    error: state.key === key ? state.error : '',
    scope,
    reload,
  }
}
