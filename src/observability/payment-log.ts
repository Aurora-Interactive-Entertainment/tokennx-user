import { Sentry } from "./sentry";

export type PaymentPhase =
  | "idle"
  | "creating"
  | "starting"
  | "ready"
  | "paused"
  | "closing"
  | "closed"
  | "paid"
  | "expired"
  | "exception"
  | "error"
  | "timeout"
  | "disposed";

export interface PaymentTransition {
  session: string;
  from: PaymentPhase;
  to: PaymentPhase;
  channel: "wechat" | "alipay";
  orderStatus?: string;
  code?: number;
  requestId?: string | null;
}

// 只记录会话标识、阶段和错误码；不写令牌、二维码、签名、个人资料或接口原始响应。
export function recordPaymentTransition(transition: PaymentTransition) {
  const { session, from, to, channel, orderStatus, code, requestId } =
    transition;
  const data = {
    session,
    from,
    to,
    channel,
    orderStatus,
    code,
    requestId,
    time: new Date().toISOString(),
  };
  console.info("[payment]", data);
  Sentry.addBreadcrumb({
    category: "payment",
    message: `${transition.from} -> ${transition.to}`,
    level: transition.to === "error" ? "warning" : "info",
    data,
  });
}
