import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBillingPaymentOrder,
  type BillingContext,
  type BillingPaymentOrder,
} from "@/api/billing";
import { isAuthenticationFailure } from "@/api/http";
import {
  isPaymentOrderPollable,
  PAYMENT_STATUS_POLL_INTERVAL_MS,
  PAYMENT_STATUS_POLL_TIMEOUT_MS,
  paymentPollRetryDelay,
} from "@/api/payment-flow";

interface PaymentPollingOptions {
  context: BillingContext;
  order: BillingPaymentOrder | null;
  enabled: boolean;
  refreshToken: number;
  expired?: boolean;
  onOrder: (order: BillingPaymentOrder) => void;
  onError: (error: unknown) => void;
  onTimeout: () => void;
  onQuerying?: (querying: boolean) => void;
}

// 两个支付入口共用串行查单、退避、超时及取消逻辑；回调更新不会重启五分钟计时。
export function useBillingPaymentPolling(options: PaymentPollingOptions) {
  const { context, order, enabled, refreshToken, expired } = options;
  const callbacks = useRef(options);
  callbacks.current = options;
  const controller = useRef<AbortController | null>(null);
  const [onlineToken, setOnlineToken] = useState(0);
  const cancel = useCallback(() => controller.current?.abort(), []);
  useEffect(() => {
    const onOnline = () => setOnlineToken((value) => value + 1);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);
  const active = Boolean(order && isPaymentOrderPollable(order));
  useEffect(() => {
    if (!enabled || !order || !active) return;
    const abort = new AbortController();
    controller.current = abort;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const poll = async () => {
      if (abort.signal.aborted) return;
      if (Date.now() - startedAt >= PAYMENT_STATUS_POLL_TIMEOUT_MS) {
        callbacks.current.onTimeout();
        callbacks.current.onQuerying?.(false);
        return;
      }
      callbacks.current.onQuerying?.(true);
      try {
        const latest = await getBillingPaymentOrder(
          order.id,
          { signal: abort.signal },
          context,
        );
        if (abort.signal.aborted) return;
        callbacks.current.onOrder(latest);
        failures = 0;
        if (!isPaymentOrderPollable(latest)) return;
      } catch (error) {
        if (abort.signal.aborted) return;
        callbacks.current.onError(error);
        if (isAuthenticationFailure(error)) return;
        failures++;
      } finally {
        if (!abort.signal.aborted) callbacks.current.onQuerying?.(false);
      }
      timer = setTimeout(
        () => void poll(),
        failures
          ? paymentPollRetryDelay(failures)
          : PAYMENT_STATUS_POLL_INTERVAL_MS,
      );
    };
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [
    context.account_type,
    context.enterprise_id,
    order?.id,
    active,
    enabled,
    refreshToken,
    expired,
    onlineToken,
  ]);
  return cancel;
}
