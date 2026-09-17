import { ApiError } from "./http";
import type {
  BillingContext,
  BillingPaymentOrder,
  BillingPaymentStartResult,
} from "./billing";
import type { PaymentChannel } from "./payment-flow";
import i18n from "@/i18n";

export class PaymentOrderMismatchError extends ApiError {
  constructor() {
    super(i18n.t("api.billing.paymentOrderMismatch"), 502, 0, null);
  }
}

export interface PaymentOrderExpectation {
  orderID?: string;
  userID?: string;
  amountYuan?: string;
  planID?: string;
}

function cents(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))).toString();
}

function integerCents(value: unknown): string | null {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  return /^\d+$/.test(String(value)) ? BigInt(value).toString() : null;
}

function provided(value: unknown): boolean {
  // 旧接口可能省略主体和币种；只阻止显式矛盾，不能用占位值伪造服务端确认。
  return value !== undefined && value !== null && value !== "";
}

/** 支付回跳可查询充值或套餐订单，因此公共校验不限定订单类型。 */
export function assertBillingPaymentOrderIdentity(
  latest: BillingPaymentOrder,
  context: BillingContext,
  expected: PaymentOrderExpectation = {},
) {
  const amount = cents(latest?.amount_yuan);
  const amountCent = integerCents(latest?.amount_cent);
  const expectedAmount = expected.amountYuan === undefined ? null : cents(expected.amountYuan);
  if (
    typeof latest?.id !== "string" || !latest.id.trim() ||
    !["pending", "paying", "paid", "closed", "expired", "exception"].includes(latest.status) ||
    (expected.orderID !== undefined && latest.id !== expected.orderID) ||
    (provided(latest.currency) && latest.currency !== "CNY") ||
    (provided(latest.account_type) && latest.account_type !== context.account_type) ||
    (provided(latest.enterprise_id) && latest.enterprise_id !== context.enterprise_id) ||
    // 企业订单可能由其他经办人创建；个人订单才与当前用户绑定，企业后续响应仍校验创建人不跳变。
    (context.account_type === "personal" && provided(latest.user_id) && expected.userID !== undefined && latest.user_id !== expected.userID) ||
    (provided(latest.amount_yuan) && amount === null) ||
    (provided(latest.amount_cent) && amountCent === null) ||
    (amount !== null && amountCent !== null && amount !== amountCent) ||
    (expected.amountYuan !== undefined && expectedAmount === null) ||
    (expectedAmount !== null && ((amount !== null && amount !== expectedAmount) || (amountCent !== null && amountCent !== expectedAmount)))
  ) throw new PaymentOrderMismatchError();
}

function assertPreviousOrder(latest: BillingPaymentOrder, previous: BillingPaymentOrder | null) {
  if (!previous) return;
  const currentAmount = cents(latest.amount_yuan) ?? integerCents(latest.amount_cent);
  const previousAmount = cents(previous.amount_yuan) ?? integerCents(previous.amount_cent);
  if (latest.id !== previous.id ||
    (currentAmount !== null && previousAmount !== null && currentAmount !== previousAmount) ||
    (["billing_account_id", "user_id"] as const).some((field) =>
      provided(previous[field]) && provided(latest[field]) && previous[field] !== latest[field])) {
    throw new PaymentOrderMismatchError();
  }
}

export function assertPlanPaymentOrder(
  latest: BillingPaymentOrder,
  context: BillingContext,
  previous: BillingPaymentOrder | null,
  expected: PaymentOrderExpectation = {},
) {
  assertBillingPaymentOrderIdentity(latest, context, expected);
  assertPreviousOrder(latest, previous);
  const planID = (latest as BillingPaymentOrder & { plan_id?: unknown }).plan_id;
  const previousPlanID = (previous as (BillingPaymentOrder & { plan_id?: unknown }) | null)?.plan_id;
  if (cents(latest.amount_yuan) === null ||
    (provided(latest.order_type) && latest.order_type !== "plan_purchase") ||
    (provided(planID) && expected.planID !== undefined && planID !== expected.planID) ||
    (provided(planID) && provided(previousPlanID) && planID !== previousPlanID)) {
    throw new PaymentOrderMismatchError();
  }
}

export function assertRechargePaymentOrder(
  latest: BillingPaymentOrder,
  context: BillingContext,
  previous: BillingPaymentOrder | null,
  expected: PaymentOrderExpectation = {},
) {
  // 旧充值接口可能只返回 id/status，金额缺失时仍允许后续查单恢复。
  assertBillingPaymentOrderIdentity(latest, context, expected);
  assertPreviousOrder(latest, previous);
  if (provided(latest.order_type) && latest.order_type !== "recharge") throw new PaymentOrderMismatchError();
}

export function assertBillingPaymentAttempt(payment: BillingPaymentStartResult, channel: PaymentChannel) {
  const attempt = payment.transaction;
  const amount = cents(payment.order?.amount_yuan) ?? integerCents(payment.order?.amount_cent);
  const attemptAmount = integerCents(attempt?.amount_cent);
  // 支付尝试缺字段沿用旧协议；已给出的金额、渠道必须与订单一致。
  if ((provided(attempt?.amount_cent) && attemptAmount === null) ||
    (amount !== null && attemptAmount !== null && amount !== attemptAmount) ||
    (provided(attempt?.payment_product) && (typeof attempt.payment_product !== "string" ||
      (channel === "wechat" ? attempt.payment_product !== "wechat_native" : !attempt.payment_product.startsWith("alipay"))))) {
    throw new PaymentOrderMismatchError();
  }
}

export const assertPlanPaymentAttempt = assertBillingPaymentAttempt;
