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
import { getAccessTokenUserId } from "@/auth/token-storage";
import {
  clearPendingPaymentIntent,
  paymentIntentScope,
  readPendingPaymentIntent,
  writePendingPaymentIntent,
} from "@/api/pending-payment-intent";
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
  const [initial] = useState(() => {
    const scope = paymentIntentScope(context, "plan", planID);
    return { scope, userID: getAccessTokenUserId() ?? undefined, intent: readPendingPaymentIntent(scope) };
  });
  const [order, setOrder] = useState<BillingPaymentOrder | null>(null);
  const [qr, setQR] = useState("");
  const [form, setForm] = useState("");
  const [agreed, setAgreedState] = useState(false);
  const [method, setMethod] = useState<PaymentChannel>(initial.intent?.channel ?? "wechat");
  const [busy, setBusy] = useState(false);
  const [exclusiveBusy, setExclusiveBusy] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
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
    id: initial.intent?.id ?? crypto.randomUUID(),
    createKey: initial.intent?.createKey ?? crypto.randomUUID(),
    payKey: initial.intent?.payKey ?? crypto.randomUUID(),
    orderID: initial.intent?.orderID ?? null as string | null,
    amountYuan: initial.intent?.amountYuan,
    creationStarted: Boolean(initial.intent),
    intentClaimed: Boolean(initial.intent),
    order: null as BillingPaymentOrder | null,
    channel: initial.intent?.channel ?? "wechat" as PaymentChannel,
    agreed: false,
    locked: false,
    exclusive: false,
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

  function persistIntent() {
    const state = session.current;
    writePendingPaymentIntent(initial.scope, {
      id: state.id, createKey: state.createKey, payKey: state.payKey,
      channel: state.channel, orderID: state.orderID,
      ...(state.amountYuan !== undefined ? { amountYuan: state.amountYuan } : {}),
    });
    if (initial.scope && readPendingPaymentIntent(initial.scope)?.id === state.id) state.intentClaimed = true;
  }

  function ownsIntent() {
    const state = session.current;
    if (!initial.scope || !state.intentClaimed) return true;
    const current = readPendingPaymentIntent(initial.scope);
    return current?.id === state.id && current.createKey === state.createKey
      && current.payKey === state.payKey && current.channel === state.channel;
  }

  function expectedOrder() {
    return { planID, userID: initial.userID, orderID: session.current.orderID ?? undefined, amountYuan: session.current.amountYuan };
  }

  function recoverIntent() {
    const saved = readPendingPaymentIntent(initial.scope);
    if (!saved || session.current.order) return;
    // 另一个已挂载入口可能刚开始同一笔购买，发送请求前再次采用共享意图。
    Object.assign(session.current, saved);
    session.current.creationStarted = true;
    session.current.intentClaimed = true;
    setMethod(saved.channel);
  }

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
    assertPlanPaymentOrder(latest, context, session.current.order, expectedOrder());
    if (isPaymentOrderPollable(latest) && !ownsIntent()) {
      // 其他入口已结束或替换这笔意图，迟到查单不能复活旧意图与旧二维码。
      setQR("");
      setForm("");
      setTimedOut(true);
      return false;
    }
    session.current.order = latest;
    session.current.orderID = latest.id;
    session.current.amountYuan = latest.amount_yuan;
    if (isPaymentSettled(latest) || latest.status === "closed" || latest.status === "expired") {
      clearPendingPaymentIntent(initial.scope, session.current.id);
    } else {
      persistIntent();
    }
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
    return true;
  }

  const cancelPolling = useBillingPaymentPolling({
    context,
    order,
    enabled: agreed && !busy && !blocked && !realNameRequired && !timedOut,
    refreshToken,
    expired,
    onOrder: (latest) => {
      if (!acceptOrder(latest)) return;
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
      setTimedOut(true);
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
      !abort.signal.aborted &&
      ownsIntent();
    const { signal } = abort;
    setBusy(true);
    setQuerying(false);
    setError("");
    setQR("");
    setForm("");
    try {
      if (!planID)
        throw new ApiError(t("api.billing.errors.170001"), 400, 170001, null);
      recoverIntent();
      // 先保存创建幂等键；即使服务端已创建但响应丢失，重进页面也能找回同一订单。
      persistIntent();
      recoverIntent();
      setTimedOut(false);
      transition("creating");
      if (!state.orderID) state.creationStarted = true;
      const current = state.orderID
        ? await getBillingPaymentOrder(state.orderID, { signal }, context)
        : await createBillingPaymentOrder(
            context,
            { plan_id: planID, quantity: 1 },
            state.createKey,
            { signal },
          );
      if (!valid()) return;
      if (!acceptOrder(current)) return;
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
      assertPlanPaymentOrder(payment.order, context, state.order, expectedOrder());
      assertPlanPaymentAttempt(payment, channel);
      if (!acceptOrder(payment.order)) return;
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
    // 创建/支付请求仍可取消；关单和换渠道必须完成收尾，不能被协议开关提前解锁。
    if (state.agreed === checked || state.blocked || state.exclusive) return;
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
  // 仅已确认关闭/过期的订单允许换单；已支付或状态未知时必须保留原会话。
  async function closeAbandonedOrder(previous: BillingPaymentOrder, signal: AbortSignal) {
    const state = session.current;
    let latest: BillingPaymentOrder;
    try {
      latest = await closeBillingPaymentOrder(previous.id, { signal }, context);
    } catch (reason) {
      if (!isApiError(reason) || ![140004, 170004].includes(reason.code))
        throw reason;
      latest = await getBillingPaymentOrder(previous.id, { signal }, context);
    }
    // 关单期间的轮询可能已经确认到账，迟到的关单响应不能覆盖已支付状态。
    if (!state.alive || signal.aborted || state.order?.status === "paid") return true;
    assertPlanPaymentOrder(latest, context, previous, expectedOrder());
    if (latest.status === "paid") {
      acceptOrder(latest);
      return true;
    }
    if (latest.status === "closed" || latest.status === "expired") {
      clearPendingPaymentIntent(initial.scope, state.id);
      return false;
    }
    throw new ApiError(t("console.billing.paymentStatusUnknown"), 409, 0, null);
  }

  async function selectMethod(channel: PaymentChannel) {
    const state = session.current;
    if (
      state.locked ||
      state.blocked ||
      !state.alive ||
      state.channel === channel ||
      (state.order && !isPaymentActive(state.order.status))
    )
      return;
    // 支付尝试挂在订单上，整个切换过程必须独占会话，否则并发切换会互相覆盖订单。
    state.locked = true;
    state.exclusive = true;
    setExclusiveBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      recoverIntent();
      let previous = state.order;
      if (!previous && state.orderID) {
        previous = await getBillingPaymentOrder(state.orderID, { signal: abort.signal }, context);
        if (!state.alive || abort.signal.aborted || !ownsIntent()) return;
        if (!acceptOrder(previous)) return;
      }
      if (!previous && state.creationStarted) {
        // 创建结果未知不代表没有订单；先用原键找回并关单，再为新渠道换键。
        if (!planID) throw new ApiError(t("api.billing.errors.170001"), 400, 170001, null);
        previous = await createBillingPaymentOrder(context, { plan_id: planID, quantity: 1 }, state.createKey, { signal: abort.signal });
        if (!state.alive || abort.signal.aborted || !ownsIntent()) return;
        if (!acceptOrder(previous)) return;
      }
      // 先收尾旧订单：它可能已经被支付，此时必须结束会话，不能把这次购买切到另一个渠道。
      if (previous?.status === "paid") return;
      if (previous && !["closed", "expired"].includes(previous.status) && (await closeAbandonedOrder(previous, abort.signal))) return;
      // 关单期间查单也可能先确认支付成功，同样不能再为新渠道下单。
      if (state.order?.status === "paid") return;
      state.channel = channel;
      // 同一渠道网络重试保留订单和支付键；切换渠道必须换单，不能把已经带旧渠道支付尝试的订单交给新渠道。
      state.payKey = crypto.randomUUID();
      if (previous) {
        state.id = crypto.randomUUID();
        state.createKey = crypto.randomUUID();
        state.creationStarted = false;
        state.intentClaimed = false;
      }
      state.order = null;
      state.orderID = null;
      state.amountYuan = undefined;
      setMethod(channel);
      setOrder(null);
      setQR("");
      setForm("");
      setAttemptExpiresAt(null);
      transition(state.phase);
    } catch (reason) {
      // 关单失败不能等同于关闭成功，保留订单及幂等键供查单或重试使用。
      if (state.alive) handleError(reason);
      return;
    } finally {
      state.locked = false;
      state.exclusive = false;
      if (state.alive) setExclusiveBusy(false);
    }
    if (state.agreed) await start();
  }

  async function close(onClose: () => void) {
    const state = session.current;
    if (state.locked) return;
    state.locked = true;
    state.exclusive = true;
    setExclusiveBusy(true);
    cancelPolling();
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const version = ++state.version;
    setBusy(true);
    setError("");
    transition("closing");
    try {
      recoverIntent();
      let current = state.order;
      if (!current && state.orderID) {
        current = await getBillingPaymentOrder(state.orderID, { signal: abort.signal }, context);
        if (abort.signal.aborted || version !== state.version) return;
        if (!acceptOrder(current)) return;
      }
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
        if (!acceptOrder(latest)) return;
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
        state.exclusive = false;
        if (state.alive) setExclusiveBusy(false);
        if (state.alive) setBusy(false);
      }
    }
  }

  return {
    order,
    qr: agreed && !expired && !blocked && !timedOut ? qr : "",
    form: agreed && !expired && !blocked && !timedOut ? form : "",
    agreed,
    method,
    busy: busy || exclusiveBusy,
    consentLocked: exclusiveBusy,
    timedOut,
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
      setTimedOut(false);
      setRefreshToken((value) => value + 1);
    },
    active:
      agreed &&
      !blocked &&
      !realNameRequired &&
      Boolean(order && isPaymentOrderPollable(order)),
  };
}
