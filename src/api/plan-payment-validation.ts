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

function cents(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))).toString();
}

export function assertPlanPaymentOrder(
  latest: BillingPaymentOrder,
  context: BillingContext,
  previous: BillingPaymentOrder | null,
) {
  if (
    typeof latest?.id !== "string" ||
    !latest.id.trim() ||
    !["pending", "paying", "paid", "closed", "expired", "exception"].includes(
      latest.status,
    ) ||
    typeof latest.amount_yuan !== "string" ||
    !/^\d+(?:\.\d{1,2})?$/.test(latest.amount_yuan) ||
    (latest.currency && latest.currency !== "CNY") ||
    (previous &&
      (latest.id !== previous.id ||
        cents(latest.amount_yuan) !== cents(previous.amount_yuan))) ||
    (latest.order_type && latest.order_type !== "plan_purchase") ||
    (latest.account_type && latest.account_type !== context.account_type) ||
    (latest.enterprise_id && latest.enterprise_id !== context.enterprise_id) ||
    (latest.amount_cent !== undefined &&
      String(latest.amount_cent) !== cents(latest.amount_yuan))
  ) {
    throw new PaymentOrderMismatchError();
  }
}

export function assertPlanPaymentAttempt(
  payment: BillingPaymentStartResult,
  channel: PaymentChannel,
) {
  const attempt = payment.transaction;
  // 支付尝试的金额和渠道必须与已验证订单一致，不能展示串单的二维码。
  if (
    (attempt?.amount_cent !== undefined &&
      String(attempt.amount_cent) !== cents(payment.order.amount_yuan)) ||
    (attempt?.payment_product &&
      (channel === "wechat"
        ? attempt.payment_product !== "wechat_native"
        : !attempt.payment_product.startsWith("alipay")))
  ) {
    throw new PaymentOrderMismatchError();
  }
}
