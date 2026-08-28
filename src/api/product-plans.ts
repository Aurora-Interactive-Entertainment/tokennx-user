import { fetchAuthenticatedJson } from './authenticated'
import type { BillingContext } from './billing'
import type { FetchJsonOptions } from './http'

const PRODUCT_PLANS_PATH = '/api/user/product-plans'

export interface ProductPlanPrice {
  price_cent: number
  currency: string
  validity_seconds: number
}

export interface ProductPlanSummary {
  id: string
  code: string
  name: string
  type: 'quota_bundle' | 'discount_bundle' | string
  description: string
  account_type: 'personal' | 'enterprise' | string
  display_name: string
  price: ProductPlanPrice
  model_count: number
}

export interface ProductPlanListResponse {
  items: ProductPlanSummary[]
  total: number
  page: number
  page_size: number
}

export interface ProductPlanListOptions extends Pick<FetchJsonOptions, 'accessToken' | 'signal'> {
  type?: 'quota_bundle' | 'discount_bundle'
  page?: number
  page_size?: number
}

/** 中文：查询当前账务主体可用的套餐摘要，完整模型权益由套餐详情接口提供。 */
export function getProductPlans(context: BillingContext, options: ProductPlanListOptions = {}): Promise<ProductPlanListResponse> {
  const params = new URLSearchParams({
    account_type: context.account_type,
    page: String(options.page ?? 1),
    page_size: String(options.page_size ?? 100),
  })
  if (options.type) params.set('type', options.type)
  return fetchAuthenticatedJson<ProductPlanListResponse>(`${PRODUCT_PLANS_PATH}?${params.toString()}`, {
    accessToken: options.accessToken,
    signal: options.signal,
  })
}
