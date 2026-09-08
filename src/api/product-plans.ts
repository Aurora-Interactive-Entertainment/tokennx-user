import { fetchAuthenticatedJson } from './authenticated'
import type { BillingContext } from './billing'
import { ApiError, type FetchJsonOptions } from './http'

const PRODUCT_PLANS_PATH = '/api/user/product-plans'

export interface ProductPlanPrice {
  // 中文：新接口用十进制整数字符串避免金额精度丢失，数字仅兼容灰度旧响应。
  price_cent: string | number
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

/** 单个套餐在当前账务主体下的完整模型权益。额度字段保持字符串，避免精度丢失。 */
export interface ProductPlanModelEntitlement {
  model_id: string
  model_code: string
  model_name: string
  model_type: string
  entitlement_mode: 'token_quota' | 'request_quota' | 'discount' | string
  token_quota: string | null
  request_quota: string | null
  discount_rate: string | null
}

export interface ProductPlanDetail extends ProductPlanSummary {
  models: ProductPlanModelEntitlement[]
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

/** 查询套餐详情；路径参数使用套餐公开 ID，主体类型通过查询参数传递。 */
export function getProductPlanDetail(
  context: BillingContext,
  planID: string,
  options: Pick<FetchJsonOptions, 'accessToken' | 'signal'> = {},
): Promise<ProductPlanDetail> {
  const normalizedID = planID.trim()
  if (!normalizedID) return Promise.reject(new ApiError('套餐 ID 不能为空', 400, 100001, null))
  const params = new URLSearchParams({ account_type: context.account_type })
  return fetchAuthenticatedJson<ProductPlanDetail>(
    `${PRODUCT_PLANS_PATH}/${encodeURIComponent(normalizedID)}?${params.toString()}`,
    { accessToken: options.accessToken, signal: options.signal },
  )
}
