import { fetchAuthenticatedJson } from './authenticated'
import { createBillingQuery, type BillingContext } from './billing'
import { ApiError, fetchJson, type FetchJsonOptions } from './http'
import i18n from '@/i18n'
import type { ApiTimestamp } from '@/utils/format'

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

export interface PurchasedProductPlanModel {
  model_id: string
  model_code: string
  model_name: string
  model_type: string
  entitlement_mode: 'token_quota' | 'request_quota' | string
  token_quota_total: string | null
  token_quota_used: string | null
  token_quota_frozen: string | null
  token_quota_remaining: string | null
  request_quota_total: string | null
  request_quota_used: string | null
  request_quota_frozen: string | null
  request_quota_remaining: string | null
}

/** 已购权益快照；额度字段必须保持字符串，避免大数和小数精度损失。 */
export interface PurchasedProductPlan {
  id: string
  plan_id: string
  plan_code: string
  plan_name: string
  display_name: string
  account_type: 'personal' | 'enterprise' | string
  status: 'active' | 'frozen' | 'expired' | 'terminated' | string
  paid_amount_cent: string
  order_no: string
  starts_at: ApiTimestamp
  expires_at: ApiTimestamp
  activated_at: ApiTimestamp | null
  terminated_at: ApiTimestamp | null
  termination_reason: string
  models: PurchasedProductPlanModel[]
}

export interface PurchasedProductPlanListOptions extends ProductPlanListOptions {
  status?: 'active' | 'history' | 'all'
}

const PURCHASED_PRODUCT_PLANS_PATH = '/api/user/product-plans/purchased'
export const RECENT_PRODUCT_PLAN_PURCHASES_PATH = '/api/product-plans/purchases/recent'

/** 公开购买动态记录；手机号由服务端脱敏，价格使用订单快照。 */
export interface RecentProductPlanPurchase {
  purchase_time: ApiTimestamp
  buyer_phone: string
  plan_title: string
  price_cent: string
  price_yuan: string
}

export interface RecentProductPlanPurchasesResponse {
  items: RecentProductPlanPurchase[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseRecentProductPlanPurchase(value: unknown): RecentProductPlanPurchase | null {
  if (!isRecord(value)) return null
  const purchaseTime = value.purchase_time
  const buyerPhone = value.buyer_phone
  const planTitle = value.plan_title
  const priceCent = value.price_cent
  const priceYuan = value.price_yuan
  if (typeof purchaseTime !== 'number' || !Number.isSafeInteger(purchaseTime) || purchaseTime < 0 || typeof buyerPhone !== 'string' || typeof planTitle !== 'string' || !planTitle.trim()
    || typeof priceCent !== 'string' || !priceCent.trim() || typeof priceYuan !== 'string' || !priceYuan.trim()) return null
  return {
    purchase_time: purchaseTime,
    buyer_phone: buyerPhone.trim(),
    plan_title: planTitle.trim(),
    price_cent: priceCent.trim(),
    price_yuan: priceYuan.trim(),
  }
}

function parseRecentProductPlanPurchases(value: unknown): RecentProductPlanPurchasesResponse {
  if (!isRecord(value)) throw new ApiError(i18n.t('api.http.unreadableResponse'), 502, 100003, null)
  return {
    items: Array.isArray(value.items) ? value.items.flatMap((item) => {
      const parsed = parseRecentProductPlanPurchase(item)
      return parsed ? [parsed] : []
    }) : [],
  }
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

/** 查询当前账务主体已购套餐及模型额度余额。 */
export function getPurchasedProductPlans(
  context: BillingContext,
  options: PurchasedProductPlanListOptions = {},
): Promise<ProductPlanListResponse<PurchasedProductPlan>> {
  const query = createBillingQuery(context, {
    status: options.status ?? 'active',
    page: options.page ?? 1,
    page_size: options.page_size ?? 100,
  })
  return fetchAuthenticatedJson<ProductPlanListResponse<PurchasedProductPlan>>(`${PURCHASED_PRODUCT_PLANS_PATH}?${query}`, {
    accessToken: options.accessToken,
    signal: options.signal,
  })
}

/** 查询公开的最近套餐购买动态，不携带登录令牌。 */
export async function getRecentProductPlanPurchases(
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<RecentProductPlanPurchasesResponse> {
  const limit = options.limit ?? 5
  const query = new URLSearchParams({ limit: String(limit) })
  return parseRecentProductPlanPurchases(await fetchJson<unknown>(`${RECENT_PRODUCT_PLAN_PURCHASES_PATH}?${query}`, {
    signal: options.signal,
  }))
}

/** 公开目录不携带令牌或企业 ID，不触发刷新登录态。 */
export function getPublicProductPlans(
  accountType: BillingContext['account_type'] = 'personal',
  options: Omit<ProductPlanListOptions, 'accessToken'> = {},
): Promise<ProductPlanListResponse<PublicProductPlan>> {
  const query = new URLSearchParams({ account_type: accountType, page: String(options.page ?? 1), page_size: String(options.page_size ?? 100) })
  return fetchJson<ProductPlanListResponse<PublicProductPlan>>(`/api/product-plans?${query}`, { signal: options.signal })
}
