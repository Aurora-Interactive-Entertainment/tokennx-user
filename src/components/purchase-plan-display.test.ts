import { describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { userPlanFixture } from '@/test/product-plan-fixtures'
import { canSelectPlan, planFeatures } from './purchase-plan-display'

describe('套餐公开信息', () => {
  it.each(['zh-CN', 'en-US'])('不展示库存或用户已购次数，并保留限购规则与购买资格：%s', locale => {
    const t = i18n.getFixedT(locale)
    const plan = { ...userPlanFixture, description: '', stock_remaining: 100, purchase_limit: 2, purchased_count: 1, can_purchase: false }
    expect(planFeatures(plan, locale, t).join(' ')).not.toMatch(/库存|剩余.*购买|stock|purchases? remaining/i)
    expect(t('console.purchasePage.api.purchaseLimit', { count: plan.purchase_limit })).toContain('2')
    expect(canSelectPlan(plan)).toBe(false)
  })
})
