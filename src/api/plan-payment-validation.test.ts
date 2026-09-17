import { describe, expect, it } from 'vitest'
import type { BillingPaymentOrder, BillingPaymentStartResult } from './billing'
import {
  assertBillingPaymentAttempt, assertBillingPaymentOrderIdentity, assertPlanPaymentOrder,
  assertRechargePaymentOrder, PaymentOrderMismatchError,
} from './plan-payment-validation'

const context = { account_type: 'personal' as const }
const order = {
  id: 'order-a', status: 'pending', order_type: 'plan_purchase', amount_yuan: '23.99', amount_cent: '2399',
  currency: 'CNY', account_type: 'personal', user_id: 'user-a', billing_account_id: 'account-a', plan_id: 'plan-a',
} as BillingPaymentOrder & { plan_id: string }

describe('兼容的订单响应校验', () => {
  it('套餐旧响应可缺主体、币种和plan_id，但金额仍为必填', () => {
    const legacy = { id: 'order-a', status: 'pending', amount_yuan: '23.99' } as BillingPaymentOrder
    expect(() => assertPlanPaymentOrder(legacy, context, null, { planID: 'plan-a', userID: 'user-a' })).not.toThrow()
    expect(() => assertPlanPaymentOrder({ id: 'order-a', status: 'pending' } as BillingPaymentOrder, context, null)).toThrow(PaymentOrderMismatchError)
  })

  it('充值旧id/status响应不因缺金额被拒，已有金额仍要与输入快照一致', () => {
    const legacy = { id: 'order-a', status: 'pending' } as BillingPaymentOrder
    expect(() => assertRechargePaymentOrder(legacy, context, null, { amountYuan: '100', orderID: 'order-a' })).not.toThrow()
    expect(() => assertRechargePaymentOrder({ ...legacy, amount_cent: '10000' }, context, legacy, { amountYuan: '100' })).not.toThrow()
    expect(() => assertRechargePaymentOrder({ ...legacy, amount_yuan: '1.00' }, context, legacy, { amountYuan: '100' })).toThrow(PaymentOrderMismatchError)
  })

  it('明确返回的套餐、用户和历史账务账户矛盾会被阻断', () => {
    expect(() => assertPlanPaymentOrder({ ...order, plan_id: 'plan-b' } as typeof order, context, null, { planID: 'plan-a' })).toThrow(PaymentOrderMismatchError)
    expect(() => assertPlanPaymentOrder({ ...order, user_id: 'user-b' }, context, null, { userID: 'user-a' })).toThrow(PaymentOrderMismatchError)
    expect(() => assertPlanPaymentOrder({ ...order, billing_account_id: 'account-b' }, context, order)).toThrow(PaymentOrderMismatchError)
    expect(() => assertPlanPaymentOrder({ ...order, plan_id: 'plan-b' } as typeof order, context, order)).toThrow(PaymentOrderMismatchError)
  })

  it('企业订单允许其他经办人创建，查询及支付仍阻止主体和已有创建人跳变', () => {
    const enterpriseContext = { account_type: 'enterprise' as const, enterprise_id: 'enterprise-a' }
    const enterpriseOrder = { ...order, account_type: 'enterprise' as const, enterprise_id: 'enterprise-a', user_id: 'other-creator' }
    const expected = { orderID: order.id, userID: 'current-member' }
    expect(() => assertBillingPaymentOrderIdentity(enterpriseOrder, enterpriseContext, expected)).not.toThrow()
    expect(() => assertPlanPaymentOrder(enterpriseOrder, enterpriseContext, null, expected)).not.toThrow()
    expect(() => assertRechargePaymentOrder({ ...enterpriseOrder, order_type: 'recharge' }, enterpriseContext, null, expected)).not.toThrow()
    expect(() => assertPlanPaymentOrder({ ...enterpriseOrder, user_id: 'changed-creator' }, enterpriseContext, enterpriseOrder, expected)).toThrow(PaymentOrderMismatchError)
    expect(() => assertPlanPaymentOrder({ ...enterpriseOrder, billing_account_id: 'other-account' }, enterpriseContext, enterpriseOrder, expected)).toThrow(PaymentOrderMismatchError)
    expect(() => assertBillingPaymentOrderIdentity({ ...enterpriseOrder, enterprise_id: 'enterprise-b' }, enterpriseContext, expected)).toThrow(PaymentOrderMismatchError)
  })

  it.each([
    { id: 'other-order' }, { amount_yuan: '24.00', amount_cent: '2400' }, { currency: 'USD' },
    { account_type: 'enterprise' }, { enterprise_id: 'enterprise-b' }, { status: 'unexpected' },
  ])('原有订单、金额、币种、主体和状态保护仍有效：%j', (changes) => {
    expect(() => assertPlanPaymentOrder({ ...order, ...changes } as BillingPaymentOrder, context, order)).toThrow(PaymentOrderMismatchError)
  })

  it('恢复后无完整previous也按orderID及金额快照校验', () => {
    expect(() => assertPlanPaymentOrder(order, context, null, { orderID: 'other-order' })).toThrow(PaymentOrderMismatchError)
    expect(() => assertPlanPaymentOrder(order, context, null, { orderID: order.id, amountYuan: '24.00' })).toThrow(PaymentOrderMismatchError)
    expect(() => assertPlanPaymentOrder(order, context, null, { orderID: order.id, amountYuan: '23.99' })).not.toThrow()
  })

  it('公共回跳校验允许充值与套餐类型，但依然绑定请求订单ID', () => {
    for (const order_type of ['recharge', 'plan_purchase']) {
      expect(() => assertBillingPaymentOrderIdentity({ ...order, order_type }, context, { orderID: order.id })).not.toThrow()
    }
    expect(() => assertBillingPaymentOrderIdentity(order, context, { orderID: 'other-order' })).toThrow(PaymentOrderMismatchError)
    expect(() => assertRechargePaymentOrder(order, context, null)).toThrow(PaymentOrderMismatchError)
  })

  it('金额比较使用整数分，大金额字符串保持精度，拒绝已经不安全的数值分', () => {
    expect(() => assertPlanPaymentOrder({ ...order, amount_yuan: '90071992547409.93', amount_cent: '9007199254740993' }, context, null)).not.toThrow()
    expect(() => assertPlanPaymentOrder({ ...order, amount_yuan: '90071992547409.92', amount_cent: 9007199254740992 }, context, null)).toThrow(PaymentOrderMismatchError)
    expect(() => assertPlanPaymentOrder({ ...order, amount_yuan: '023.99', amount_cent: '02399' }, context, order)).not.toThrow()
  })

  it('支付尝试缺字段兼容，显式错误金额及渠道被拒绝', () => {
    // 模拟旧服务未返回 transaction 的实际响应，接口静态类型仍沿用完整协议。
    const payment = { order } as unknown as BillingPaymentStartResult
    expect(() => assertBillingPaymentAttempt(payment, 'wechat')).not.toThrow()
    expect(() => assertBillingPaymentAttempt({ ...payment, transaction: { amount_cent: '2400', payment_product: 'wechat_native' } } as BillingPaymentStartResult, 'wechat')).toThrow(PaymentOrderMismatchError)
    expect(() => assertBillingPaymentAttempt({ ...payment, transaction: { amount_cent: '2399', payment_product: 'alipay_page' } } as BillingPaymentStartResult, 'wechat')).toThrow(PaymentOrderMismatchError)
    expect(() => assertBillingPaymentAttempt({ ...payment, transaction: { amount_cent: 2399, payment_product: 'wechat_native' } } as BillingPaymentStartResult, 'wechat')).not.toThrow()
  })
})
