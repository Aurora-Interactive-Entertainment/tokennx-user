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
import { ApiError, isApiError, isAuthenticationFailure } from "@/api/http";
import {
  isPaymentActive,
  isPaymentOrderPollable,
  isPaymentSettled,
  paymentCarrier,
  type PaymentChannel,
} from "@/api/payment-flow";
import {
  assertPlanPaymentAttempt,
  assertPlanPaymentOrder,
  PaymentOrderMismatchError,
} from "@/api/plan-payment-validation";
import {
  recordPaymentTransition,
  type PaymentPhase,
} from "@/observability/payment-log";
import { useBillingPaymentPolling } from "./use-billing-payment-polling";
import { usePaymentExpiry } from "./use-payment-expiry";

// 协议、渠道和幂等信息属于同一支付会话，所有异步结果都必须通过版本校验。
export function usePlanPayment(
  context: BillingContext,
  planID: string | undefined,
  onPaid?: () => void,
  onAuthFailure?: () => void,
) {
  const { t } = useTranslation();
  const [order, setOrder] = useState<BillingPaymentOrder | null>(null);
  const [qr, setQR] = useState("");
  const [form, setForm] = useState("");
  const [agreed, setAgreedState] = useState(false);
  const [method, setMethod] = useState<PaymentChannel>("wechat");
  const [busy, setBusy] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [realNameRequired, setRealNameRequired] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [attemptExpiresAt, setAttemptExpiresAt] = useState<number | null>(null);
  const { expired, deadline } = usePaymentExpiry(
    order?.expires_at,
    attemptExpiresAt,
  );
  const callbacks = useRef({ onPaid, onAuthFailure });
  callbacks.current = { onPaid, onAuthFailure };
  const session = useRef({
    id: crypto.randomUUID(),
    createKey: crypto.randomUUID(),
    payKey: crypto.randomUUID(),
    order: null as BillingPaymentOrder | null,
    channel: "wechat" as PaymentChannel,
    agreed: false,
    locked: false,
    alive: true,
    blocked: false,
    version: 0,
    notified: false,
    phase: "idle" as PaymentPhase,
    loggedStatus: "",
    loggedChannel: "wechat" as PaymentChannel,
  });
  const controller = useRef<AbortController | null>(null);
  const pollFailed = useRef(false);

  const transition = useCallback((to: PaymentPhase, reason?: unknown) => {
    const state = session.current;
    const orderStatus = state.order?.status ?? "";
    if (
      state.phase === to &&
      state.loggedStatus === orderStatus &&
      state.loggedChannel === state.channel &&
      !reason
    )
      return;
    recordPaymentTransition({
      session: state.id,
      from: state.phase,
      to,
      channel: state.channel,
      orderStatus,
      ...(isApiError(reason)
        ? { code: reason.code, requestId: reason.requestId }
        : {}),
    });
    state.phase = to;
    state.loggedStatus = orderStatus;
    state.loggedChannel = state.channel;
  }, []);

  useEffect(() => {
    session.current.alive = true;
    return () => {
      session.current.alive = false;
      session.current.version++;
      controller.current?.abort();
      transition("disposed");
    };
  }, [transition]);

  const handleError = useCallback(
    (reason: unknown) => {
      transition("error", reason);
      if (isAuthenticationFailure(reason)) {
        session.current.blocked = true;
        setBlocked(true);
        callbacks.current.onAuthFailure?.();
      } else if (isApiError(reason) && [170008, 140008].includes(reason.code)) {
        session.current.blocked = true;
        setRealNameRequired(true);
      } else {
        setError(getBillingErrorMessage(reason));
        if (reason instanceof PaymentOrderMismatchError) {
          session.current.blocked = true;
          setBlocked(true);
          setQR("");
          setForm("");
        }
      }
    },
    [transition],
  );

  function acceptOrder(latest: BillingPaymentOrder) {
    assertPlanPaymentOrder(latest, context, session.current.order);
    session.current.order = latest;
    setOrder(latest);
    if (!isPaymentActive(latest.status)) {
      setQR("");
      setForm("");
    }
    if (isPaymentSettled(latest)) {
      transition("paid");
      if (!session.current.notified) {
        session.current.notified = true;
        callbacks.current.onPaid?.();
      }
    } else if (!isPaymentOrderPollable(latest))
      transition(latest.status as PaymentPhase);
  }

  const cancelPolling = useBillingPaymentPolling({
    context,
    order,
    enabled: agreed && !busy && !blocked && !realNameRequired,
    refreshToken,
    expired,
    onOrder: (latest) => {
      acceptOrder(latest);
      // 查单恢复只清除查单错误，不能吞掉下单失败或支付载体异常。
      if (pollFailed.current || !isPaymentOrderPollable(latest)) setError("");
      if (isPaymentOrderPollable(latest))
        transition(
          expired
            ? "expired"
            : pollFailed.current
              ? "ready"
              : session.current.phase,
        );
      pollFailed.current = false;
    },
    onError: (reason) => {
      pollFailed.current = true;
      handleError(reason);
    },
    onTimeout: () => {
      const current = session.current.order;
      // 单轮自动查单有 5 分钟上限，但支付本身的有效期是订单的 expires_at：
      // 还在有效期内就续一轮，避免"二维码还能扫、钱也付了、前端却永远不确认"。
      // 超过订单有效期才停下并提示状态未知。
      if (current?.expires_at && Date.now() < current.expires_at) {
        setRefreshToken((value) => value + 1);
        return;
      }
      transition("timeout");
      setError(t("console.billing.paymentStatusUnknown"));
    },
    onQuerying: setQuerying,
  });

  async function start() {
    const state = session.current;
    if (!state.agreed || state.locked || state.blocked || !state.alive) return;
    state.locked = true;
    cancelPolling();
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const version = ++state.version;
    const valid = () =>
      state.alive &&
      state.agreed &&
      version === state.version &&
      !abort.signal.aborted;
    const { signal } = abort;
    setBusy(true);
    setQuerying(false);
    setError("");
    setQR("");
    setForm("");
    try {
      if (!planID)
        throw new ApiError(t("api.billing.errors.170001"), 400, 170001, null);
      transition("creating");
      const current = state.order
        ? await getBillingPaymentOrder(state.order.id, { signal }, context)
        : await createBillingPaymentOrder(
            context,
            { plan_id: planID, quantity: 1 },
            state.createKey,
            { signal },
          );
      if (!valid()) return;
      acceptOrder(current);
      // 已付但尚未入账时只查单，不能重复发起支付；终态也不能自动创建新订单。
      if (!isPaymentActive(current.status)) return;
      transition("starting");
      const channel = state.channel;
      const payment = await startBillingPayment(
        current.id,
        state.payKey,
        { scene: "pc", channel, signal },
        context,
      );
      if (!valid()) return;
      assertPlanPaymentOrder(payment.order, context, state.order);
      assertPlanPaymentAttempt(payment, channel);
      acceptOrder(payment.order);
      if (!isPaymentActive(payment.order.status)) return;
      const carrier = paymentCarrier(payment, channel);
      if (!carrier.qr && !carrier.form)
        throw new ApiError(
          t(
            channel === "wechat"
              ? "api.billing.wechatQRCodeInvalid"
              : "api.billing.paymentFormInvalid",
          ),
          502,
          0,
          null,
        );
      setAttemptExpiresAt(payment.transaction?.expires_at ?? null);
      setQR(carrier.qr);
      setForm(carrier.form);
      transition("ready");
    } catch (reason) {
      if (valid()) handleError(reason);
    } finally {
      // 被取消的旧请求不能解除新请求的锁或覆盖新会话状态。
      if (version === state.version) {
        state.locked = false;
        if (state.alive) setBusy(false);
      }
    }
  }

  async function setAgreed(checked: boolean) {
    const state = session.current;
    if (state.agreed === checked || state.blocked) return;
    state.agreed = checked;
    setAgreedState(checked);
    if (checked) {
      await start();
      return;
    }
    // 取消协议立即废弃显示和在途结果，但保留幂等键，重新同意后找回同一订单。
    state.version++;
    controller.current?.abort();
    cancelPolling();
    state.locked = false;
    setBusy(false);
    setQuerying(false);
    setQR("");
    setForm("");
    setError("");
    transition("paused");
  }

  // 换渠道后旧订单不再使用：先关单，避免遗留一个还能被扫走的旧渠道二维码。
  // 关单被拒通常说明订单已经被支付，必须以查单结果为准，返回 true 让调用方结束本次会话。
  async function closeAbandonedOrder(previous: BillingPaymentOrder) {
    const state = session.current;
    // 已支付但尚未入账的订单同样要收尾：继续查单确认，不能再发起第二笔支付。
    const wasPaid = (latest: BillingPaymentOrder) => {
      if (latest.status !== "paid") return false;
      acceptOrder(latest);
      return true;
    };
    try {
      return wasPaid(await closeBillingPaymentOrder(previous.id, {}, context));
    } catch (reason) {
      if (!state.alive) return false;
      if (isAuthenticationFailure(reason)) {
        state.blocked = true;
        setBlocked(true);
        callbacks.current.onAuthFailure?.();
        return false;
      }
      if (!isApiError(reason) || ![140004, 170004].includes(reason.code))
        return false;
      try {
        return wasPaid(await getBillingPaymentOrder(previous.id, {}, context));
      } catch {
        return false;
      }
    }
  }

  async function selectMethod(channel: PaymentChannel) {
    const state = session.current;
    if (
      state.locked ||
      state.blocked ||
      state.channel === channel ||
      (state.order && !isPaymentActive(state.order.status))
    )
      return;
    const previous = state.order;
    // 支付尝试挂在订单上，整个切换过程必须独占会话，否则并发切换会互相覆盖订单。
    state.locked = true;
    try {
      // 先收尾旧订单：它可能已经被支付，此时必须结束会话，不能把这次购买切到另一个渠道。
      if (previous && (await closeAbandonedOrder(previous))) return;
      // 关单期间查单也可能先确认支付成功，同样不能再为新渠道下单。
      if (state.order?.status === "paid") return;
      state.channel = channel;
      // 同一渠道网络重试保留订单和支付键；切换渠道必须换单，不能把已经带旧渠道支付尝试的订单交给新渠道。
      state.payKey = crypto.randomUUID();
      state.createKey = crypto.randomUUID();
      state.order = null;
      setMethod(channel);
      setOrder(null);
      setQR("");
      setForm("");
      setAttemptExpiresAt(null);
      transition(state.phase);
    } finally {
      state.locked = false;
    }
    if (state.agreed) await start();
  }

  async function close(onClose: () => void) {
    const state = session.current;
    if (state.locked) return;
    state.locked = true;
    cancelPolling();
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const version = ++state.version;
    setBusy(true);
    setError("");
    transition("closing");
    try {
      const current = state.order;
      if (current && isPaymentOrderPollable(current)) {
        let latest: BillingPaymentOrder;
        try {
          latest =
            current.status === "paid"
              ? await getBillingPaymentOrder(
                  current.id,
                  { signal: abort.signal },
                  context,
                )
              : await closeBillingPaymentOrder(
                  current.id,
                  { signal: abort.signal },
                  context,
                );
        } catch (reason) {
          if (!isApiError(reason) || ![170004, 140004].includes(reason.code))
            throw reason;
          latest = await getBillingPaymentOrder(
            current.id,
            { signal: abort.signal },
            context,
          );
        }
        if (abort.signal.aborted || version !== state.version) return;
        acceptOrder(latest);
        if (isPaymentOrderPollable(latest))
          throw new ApiError(
            t("console.billing.paymentStatusUnknown"),
            409,
            0,
            null,
          );
      }
      state.agreed = false;
      setAgreedState(false);
      setQR("");
      setForm("");
      transition("closed");
      onClose();
    } catch (reason) {
      if (!abort.signal.aborted) handleError(reason);
    } finally {
      if (version === state.version) {
        state.locked = false;
        if (state.alive) setBusy(false);
      }
    }
  }

  return {
    order,
    qr: agreed && !expired && !blocked ? qr : "",
    form: agreed && !expired && !blocked ? form : "",
    agreed,
    method,
    busy,
    querying,
    error,
    realNameRequired,
    expired,
    deadline,
    blocked,
    start,
    close,
    setAgreed,
    selectMethod,
    handleError,
    refresh: () => {
      if (
        !session.current.agreed ||
        session.current.locked ||
        session.current.blocked
      )
        return;
      cancelPolling();
      setError("");
      setRefreshToken((value) => value + 1);
    },
    active:
      agreed &&
      !blocked &&
      !realNameRequired &&
      Boolean(order && isPaymentOrderPollable(order)),
  };
}
