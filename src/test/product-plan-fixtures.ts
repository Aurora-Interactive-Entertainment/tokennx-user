import type { ProductPlanSummary, PublicProductPlan } from '@/api/product-plans'

export const publicPlanFixture: PublicProductPlan = {
  id: 'plan-deepseek-real', code: 'deepseek-v4', name: 'DeepSeek套餐包', display_name: 'DeepSeek套餐包', type: 'model_quota_bundle', description: '模型调用',
  group_name: 'DeepSeek', group_sort_order: 10, cover_url: '', model_id: 'model-deepseek', model_code: 'deepseek-v4', model_name: 'Deepseek V4 Pro', model_count: 1,
  models: [{ model_id: 'model-deepseek', model_code: 'deepseek-v4', model_name: 'Deepseek V4 Pro', model_type: 'text', entitlement_mode: 'token_quota', token_quota: '10000000', request_quota: null }],
  price: { price_cent: '199', currency: 'CNY', validity_seconds: 2592000 }, rpm_limit: 60, tpm_limit: 100000, concurrency_limit: 5,
  first_purchase_bonus_token: '100000', first_purchase_bonus_request: 0,
}
export const userPlanFixture: ProductPlanSummary = { ...publicPlanFixture, price: { ...publicPlanFixture.price, price_cent: '299' }, can_purchase: true, stock_remaining: 20, purchase_limit: 2, purchased_count: 0, first_purchase_bonus_available: true }
export const planListFixture = <T,>(items: T[]) => ({ items, total: items.length, page: 1, page_size: 100 })
