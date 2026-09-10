import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  closeBillingPaymentOrder,
  createBillingPaymentOrder,
  getBillingErrorMessage,
  getBillingPaymentOrder,
  startBillingPayment,
  type BillingContext,
  type BillingPaymentOrder,
} from "@/api/billing";
import { isApiError, isAuthenticationFailure } from "@/api/http";
import { isAllowedAlipayPaymentUrl } from "@/api/payment-form";

const pollable = (order: BillingPaymentOrder) =>
  ["pending", "paying"].includes(order.status) ||
  (order.status === "paid" && !order.paid_at);

// 一个弹窗对应一个商品及账务主体；失败重试沿用幂等键，避免重复创建订单。
export function usePlanPayment(
  context: BillingContext,
  planID: string | undefined,
  onPaid?: () => void,
  onAuthFailure?: () => void,
  guestDebug = false,
) {
  const { t } = useTranslation();
  const [order, setOrder] = useState<BillingPaymentOrder | null>(null);
  const [qr, setQR] = useState("");
  const [form, setForm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [realNameRequired, setRealNameRequired] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const session = useRef({
    createKey: crypto.randomUUID(),
    payKey: crypto.randomUUID(),
    orderID: "",
    locked: false,
  });
  const controller = useRef<AbortController | null>(null);
  const callbacks = useRef({ onPaid, onAuthFailure });
  callbacks.current = { onPaid, onAuthFailure };
  const notified = useRef(false);
  useEffect(() => {
    controller.current = new AbortController();
    return () => controller.current?.abort();
  }, []);
  const handleError = useCallback((reason: unknown) => {
    if (isAuthenticationFailure(reason) && callbacks.current.onAuthFailure && !guestDebug) callbacks.current.onAuthFailure();
    else if (isApiError(reason) && [170008, 140008].includes(reason.code))
      setRealNameRequired(true);
    else setError(getBillingErrorMessage(reason));
  }, [guestDebug]);
  const acceptOrder = useCallback((latest: BillingPaymentOrder) => {
    setOrder(latest);
    if (latest.status === "paid" && latest.paid_at && !notified.current) {
      notified.current = true;
      callbacks.current.onPaid?.();
    }
  }, []);

  async function start() {
    if (!planID || realNameRequired || session.current.locked) return;
    session.current.locked = true;
    setBusy(true);
    setError("");
    const signal = controller.current!.signal;
    try {
      const current = session.current.orderID
        ? await getBillingPaymentOrder(
            session.current.orderID,
            { signal, guestDebug },
            context,
          )
        : await createBillingPaymentOrder(
            context,
            { plan_id: planID, quantity: 1 },
            session.current.createKey,
            { signal, guestDebug },
          );
      if (signal.aborted) return;
      session.current.orderID = current.id;
      acceptOrder(current);
      if (!pollable(current)) return;
      const payment = await startBillingPayment(
        current.id,
        session.current.payKey,
        { channel: "alipay", signal, guestDebug },
        context,
      );
      if (signal.aborted) return;
      acceptOrder(payment.order);
      // 沿用支付组件的域名校验与隔离表单，避免直接执行接口返回的 HTML。
      const value =
        [
          payment.transaction?.payment_url,
          payment.payment_url,
          payment.qr_code,
          payment.qr_code_url,
          payment.qr_url,
        ]
          .find(
            (item) =>
              typeof item === "string" && isAllowedAlipayPaymentUrl(item),
          )
          ?.trim() ?? "";
      setQR(value);
      setForm(payment.form_html?.trim() ?? "");
      if (pollable(payment.order) && !value && !payment.form_html?.trim())
        throw new Error(t("api.billing.paymentFormInvalid"));
    } catch (reason) {
      if (!signal.aborted) handleError(reason);
    } finally {
      session.current.locked = false;
      if (!signal.aborted) setBusy(false);
    }
  }

  useEffect(() => {
    if (!order || !pollable(order) || busy || realNameRequired) return;
    const abort = new AbortController();
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      try {
        const latest = await getBillingPaymentOrder(
          order.id,
          { signal: abort.signal, guestDebug },
          context,
        );
        if (abort.signal.aborted) return;
        acceptOrder(latest);
        failures = 0;
        if (!pollable(latest)) return;
      } catch (reason) {
        if (abort.signal.aborted) return;
        handleError(reason);
        if (isAuthenticationFailure(reason)) return;
        failures++;
      }
      if (Date.now() - started >= 10 * 60_000) {
        setError(t("console.billing.paymentStatusUnknown"));
        return;
      }
      timer = setTimeout(
        () => void poll(),
        Math.min(30_000, 3000 * 2 ** Math.min(failures, 3)),
      );
    };
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [
    order?.id,
    order?.status,
    order?.paid_at,
    busy,
    realNameRequired,
    context.account_type,
    context.enterprise_id,
    refresh,
    acceptOrder,
    handleError,
    t,
    guestDebug,
  ]);

  async function close(onClose: () => void) {
    if (session.current.locked) return;
    session.current.locked = true;
    setBusy(true);
    try {
      if (order && pollable(order)) {
        const latest = await closeBillingPaymentOrder(order.id, guestDebug ? { guestDebug } : {}, context);
        if (controller.current?.signal.aborted) return;
        acceptOrder(latest);
      }
      onClose();
    } catch (reason) {
      if (!controller.current?.signal.aborted) handleError(reason);
    } finally {
      session.current.locked = false;
      if (!controller.current?.signal.aborted) setBusy(false);
    }
  }
  return {
    order,
    qr,
    form,
    busy,
    error,
    realNameRequired,
    setRealNameRequired,
    start,
    close,
    handleError,
    refresh: () => {
      setError("");
      setRefresh((value) => value + 1);
    },
    active: Boolean(order && pollable(order)),
  };
}
