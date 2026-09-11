import type { BillingPaymentOrder, BillingPaymentStartResult } from "./billing";
import { isAllowedAlipayPaymentUrl } from "./payment-form";
import { apiTimeToMilliseconds } from "@/utils/format";

export type PaymentChannel = "wechat" | "alipay";
// 充值与套餐购买使用同一组查单参数，避免两个入口的支付状态收敛规则分叉。
export const PAYMENT_STATUS_POLL_INTERVAL_MS = 2000;
export const PAYMENT_STATUS_POLL_TIMEOUT_MS = 5 * 60 * 1000;
export const paymentPollRetryDelay = (failures: number) =>
  Math.min(10_000, 2000 * 2 ** Math.min(Math.max(0, failures - 1), 3));
export const isPaymentActive = (status: string) =>
  ["pending", "paying"].includes(status);
export const isPaymentSettled = (
  order: Pick<BillingPaymentOrder, "status" | "paid_at">,
) => order.status === "paid" && Boolean(order.paid_at);
export const isPaymentOrderPollable = (
  order: Pick<BillingPaymentOrder, "status" | "paid_at">,
) =>
  isPaymentActive(order.status) || (order.status === "paid" && !order.paid_at);

export function paymentCarrier(
  payment: BillingPaymentStartResult,
  channel: PaymentChannel,
) {
  // 微信返回的是不可改写的二维码原文，不能回退到支付宝表单或 H5 跳转地址。
  if (channel === "wechat")
    return {
      qr:
        typeof payment.qrcode_url === "string" && payment.qrcode_url.trim()
          ? payment.qrcode_url
          : "",
      form: "",
    };
  const candidates = [
    payment.transaction?.payment_url,
    payment.payment_url,
    payment.qr_code,
    payment.qr_code_url,
    payment.qr_url,
  ];
  return {
    qr:
      candidates
        .find(
          (value): value is string =>
            typeof value === "string" && isAllowedAlipayPaymentUrl(value),
        )
        ?.trim() ?? "",
    form: typeof payment.form_html === "string" ? payment.form_html.trim() : "",
  };
}

export function paymentDeadline(...values: unknown[]): number | null {
  const deadlines = values
    .map(apiTimeToMilliseconds)
    .filter((value): value is number => value !== null);
  return deadlines.length ? Math.min(...deadlines) : null;
}
