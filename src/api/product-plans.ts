import { fetchAuthenticatedJson } from './authenticated'
import { createBillingQuery, type BillingContext } from './billing'
import { fetchJson, type FetchJsonOptions } from './http'

const PRODUCT_PLANS_PATH = '/api/user/product-plans'

export interface ProductPlanPrice {
  // 金额按接口原始整数字符串保存，避免转成浮点数后产生精度误差。
  price_cent: string | number
  currency: string
  validity_seconds: number
}

interface ProductPlanBase {
  id: string
  code: string
  name: string
  type: 'model_quota_bundle' | string
  description: string
  group_name: string
  group_sort_order: number
  cover_url: string | null
  price: ProductPlanPrice
  rpm_limit: number
  tpm_limit: number
  concurrency_limit: number
  stock_remaining: number | null
  purchase_limit: number
  purchased_count: number
  can_purchase: boolean
  first_purchase_bonus_available: boolean
  first_purchase_bonus_token: string | null
  first_purchase_bonus_request: number
}

export interface ProductPlanSummary extends ProductPlanBase {
  model_id: string
  model_code: string
  model_name: string
  models: ProductPlanModelEntitlement[]
  // 兼容旧列表响应；新接口以 models 中的完整权益为准。
  token_quota?: string | null
  request_quota?: string | null
  // 灰度旧响应兼容字段，迁移完成后可移除。
  account_type?: 'personal' | 'enterprise' | string
  display_name?: string
  model_count?: number
}

/** 列表中的单模型权益；额度字段保持字符串，避免精度丢失。 */
export interface ProductPlanModelEntitlement {
  model_id: string
  model_code: string
  model_name: string
  entitlement_mode: 'token_quota' | 'request_quota' | string
  token_quota: string | null
  request_quota: string | null
  model_type?: string
  discount_rate?: string | null
}

// 公开目录不包含用户购买资格，不能用默认值伪造库存、限购或首购资格。
export type PublicProductPlan = Omit<ProductPlanSummary,
  'stock_remaining' | 'purchase_limit' | 'purchased_count' | 'can_purchase' | 'first_purchase_bonus_available'>
export type CatalogPlan = PublicProductPlan | ProductPlanSummary
export function isUserProductPlan(plan: CatalogPlan): plan is ProductPlanSummary {
  return 'can_purchase' in plan && typeof plan.can_purchase === 'boolean'
}

export interface ProductPlanListResponse<T = ProductPlanSummary> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface ProductPlanListOptions extends Pick<FetchJsonOptions, 'accessToken' | 'signal'> {
  page?: number
  page_size?: number
}

/** 查询当前账务主体可购买的模型用量套餐。 */
export function getProductPlans(context: BillingContext, options: ProductPlanListOptions = {}): Promise<ProductPlanListResponse> {
  const query = createBillingQuery(context, {
    page: options.page ?? 1,
    page_size: options.page_size ?? 100,
  })
  return fetchAuthenticatedJson<ProductPlanListResponse>(`${PRODUCT_PLANS_PATH}?${query}`, {
    accessToken: options.accessToken,
    signal: options.signal,
  })
}

/** 公开目录不携带令牌或企业 ID，不触发刷新登录态。 */
export function getPublicProductPlans(
  accountType: BillingContext['account_type'] = 'personal',
  options: Omit<ProductPlanListOptions, 'accessToken'> = {},
): Promise<ProductPlanListResponse<PublicProductPlan>> {
  const query = new URLSearchParams({ account_type: accountType, page: String(options.page ?? 1), page_size: String(options.page_size ?? 100) })
  return fetchJson<ProductPlanListResponse<PublicProductPlan>>(`/api/product-plans?${query}`, { signal: options.signal })
}
