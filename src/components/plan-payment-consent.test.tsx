import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBillingPaymentOrder,
  getBillingPaymentOrder,
  startBillingPayment,
  type BillingPaymentOrder,
  type BillingPaymentStartResult,
} from "@/api/billing";
import { recordPaymentTransition } from "@/observability/payment-log";
import { usePlanPayment } from "./use-plan-payment";

vi.mock("@/api/billing", async (original) => ({
  ...(await original<object>()),
  createBillingPaymentOrder: vi.fn(),
  getBillingPaymentOrder: vi.fn(),
  startBillingPayment: vi.fn(),
}));
vi.mock("@/observability/payment-log", () => ({
  recordPaymentTransition: vi.fn(),
}));

const context = { account_type: "personal" as const };
const pending = {
  id: "order-1",
  order_no: "TG-1",
  order_type: "plan_purchase",
  account_type: "personal",
  status: "pending",
  amount_cent: "1250",
  amount_yuan: "12.50",
  currency: "CNY",
  paid_at: null,
} as BillingPaymentOrder;
const wechatQR = "weixin://wxpay/bizpayurl?pr=opaque%2Bsignature";
const wechat = {
  order: pending,
  transaction: { payment_product: "wechat_native", amount_cent: "1250" },
  qrcode_url: wechatQR,
} as BillingPaymentStartResult;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("套餐协议与渠道并发边界", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.mocked(createBillingPaymentOrder).mockResolvedValue(pending);
    vi.mocked(getBillingPaymentOrder).mockResolvedValue(pending);
    vi.mocked(startBillingPayment).mockResolvedValue(wechat);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("初始默认微信，未同意时点击渠道、重试、刷新及网络恢复均不请求支付", async () => {
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    expect(result.current.method).toBe("wechat");
    await act(async () => {
      await result.current.selectMethod("alipay");
      await result.current.start();
      result.current.refresh();
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.qr).toBe("");
    expect(result.current.form).toBe("");
    expect(createBillingPaymentOrder).not.toHaveBeenCalled();
    expect(startBillingPayment).not.toHaveBeenCalled();
    expect(getBillingPaymentOrder).not.toHaveBeenCalled();
  });

  it("同意立即发起微信订单，响应后原样提供二维码并立即查单", async () => {
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(() => result.current.setAgreed(true));
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce();
    expect(startBillingPayment).toHaveBeenCalledWith(
      "order-1",
      expect.any(String),
      expect.objectContaining({ scene: "pc", channel: "wechat" }),
      context,
    );
    expect(result.current.qr).toBe(wechatQR);
    expect(getBillingPaymentOrder).toHaveBeenCalledOnce();
    expect(
      vi.mocked(recordPaymentTransition).mock.calls.map(([event]) => event.to),
    ).toEqual(["creating", "starting", "ready"]);
  });

  it("创建和获取二维码各等待一秒时两秒内完成，不增加前端延迟", async () => {
    vi.mocked(createBillingPaymentOrder).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(pending), 1000)),
    );
    vi.mocked(startBillingPayment).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(wechat), 1000)),
    );
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    act(() => {
      void result.current.setAgreed(true);
    });
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce();
    expect(result.current.busy).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(1999));
    expect(result.current.qr).toBe("");
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(result.current.qr).toBe(wechatQR);
    expect(result.current.busy).toBe(false);
  });

  it("二维码返回前锁定切换和重复提交，返回后切换沿用订单但更换支付幂等键", async () => {
    const delayed = deferred<BillingPaymentStartResult>();
    vi.mocked(startBillingPayment).mockReturnValueOnce(delayed.promise);
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(async () => {
      void result.current.setAgreed(true);
    });
    await act(async () => {
      await result.current.selectMethod("alipay");
      await result.current.start();
    });
    expect(result.current.method).toBe("wechat");
    expect(result.current.busy).toBe(true);
    expect(startBillingPayment).toHaveBeenCalledOnce();
    expect(getBillingPaymentOrder).not.toHaveBeenCalled();
    await act(async () => delayed.resolve(wechat));
    vi.mocked(startBillingPayment).mockResolvedValue({
      order: pending,
      transaction: { payment_product: "alipay_page" },
      payment_url: "https://qr.alipay.com/test",
    } as BillingPaymentStartResult);
    await act(() => result.current.selectMethod("alipay"));
    expect(result.current.method).toBe("alipay");
    expect(result.current.qr).toBe("https://qr.alipay.com/test");
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce();
    const calls = vi.mocked(startBillingPayment).mock.calls;
    expect(calls[0][0]).toBe(calls[1][0]);
    expect(calls[0][1]).not.toBe(calls[1][1]);
  });

  it("创建中快速取消并重勾沿用幂等键，旧响应不能解除新请求锁或发起支付", async () => {
    const first = deferred<BillingPaymentOrder>();
    const second = deferred<BillingPaymentOrder>();
    vi.mocked(createBillingPaymentOrder)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    act(() => {
      void result.current.setAgreed(true);
    });
    await act(() => result.current.setAgreed(false));
    expect(
      vi.mocked(createBillingPaymentOrder).mock.calls[0][3]?.signal?.aborted,
    ).toBe(true);
    act(() => {
      void result.current.setAgreed(true);
    });
    await act(async () => first.resolve(pending));
    expect(result.current.busy).toBe(true);
    expect(startBillingPayment).not.toHaveBeenCalled();
    expect(vi.mocked(createBillingPaymentOrder).mock.calls[0][2]).toBe(
      vi.mocked(createBillingPaymentOrder).mock.calls[1][2],
    );
    await act(async () => second.resolve(pending));
    expect(startBillingPayment).toHaveBeenCalledOnce();
    expect(result.current.qr).toBe(wechatQR);
  });

  it("支付请求中取消协议后迟到二维码无效，重新同意先查原订单并复用支付键", async () => {
    const delayed = deferred<BillingPaymentStartResult>();
    vi.mocked(startBillingPayment).mockReturnValueOnce(delayed.promise);
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(async () => {
      void result.current.setAgreed(true);
    });
    await act(() => result.current.setAgreed(false));
    await act(async () => delayed.resolve(wechat));
    expect(result.current.qr).toBe("");
    expect(result.current.active).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(getBillingPaymentOrder).not.toHaveBeenCalled();
    await act(() => result.current.setAgreed(true));
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce();
    expect(vi.mocked(startBillingPayment).mock.calls[0][1]).toBe(
      vi.mocked(startBillingPayment).mock.calls[1][1],
    );
    expect(result.current.qr).toBe(wechatQR);
  });

  it("取消协议立即终止在途轮询，迟到的已支付结果不更新页面；重勾后查单确认一次", async () => {
    const delayed = deferred<BillingPaymentOrder>();
    vi.mocked(getBillingPaymentOrder).mockReturnValueOnce(delayed.promise);
    const onPaid = vi.fn();
    const { result } = renderHook(() =>
      usePlanPayment(context, "plan-1", onPaid),
    );
    await act(() => result.current.setAgreed(true));
    await act(() => result.current.setAgreed(false));
    expect(result.current.qr).toBe("");
    expect(
      vi.mocked(getBillingPaymentOrder).mock.calls[0][1]?.signal?.aborted,
    ).toBe(true);
    const paid = { ...pending, status: "paid", paid_at: Date.now() };
    await act(async () => delayed.resolve(paid));
    expect(onPaid).not.toHaveBeenCalled();
    vi.mocked(getBillingPaymentOrder).mockResolvedValue(paid);
    await act(() => result.current.setAgreed(true));
    expect(onPaid).toHaveBeenCalledOnce();
    expect(result.current.order?.status).toBe("paid");
    expect(startBillingPayment).toHaveBeenCalledOnce();
    expect(result.current.qr).toBe("");
  });

  it("轮询断网后保留当前订单和二维码，重连立即查单并同步成功一次", async () => {
    vi.mocked(getBillingPaymentOrder).mockRejectedValueOnce(
      new TypeError("offline"),
    );
    const onPaid = vi.fn();
    const { result } = renderHook(() =>
      usePlanPayment(context, "plan-1", onPaid),
    );
    await act(() => result.current.setAgreed(true));
    expect(result.current.error).toBeTruthy();
    expect(result.current.qr).toBe(wechatQR);
    vi.mocked(getBillingPaymentOrder).mockResolvedValue({
      ...pending,
      status: "paid",
      paid_at: Date.now(),
    });
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(result.current.error).toBe("");
    expect(result.current.qr).toBe("");
    expect(onPaid).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(getBillingPaymentOrder).toHaveBeenCalledTimes(2);
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce();
  });

  it("切换前查到已支付不再调用另一渠道，且不能重新创建订单", async () => {
    const onPaid = vi.fn();
    const { result } = renderHook(() =>
      usePlanPayment(context, "plan-1", onPaid),
    );
    await act(() => result.current.setAgreed(true));
    vi.mocked(getBillingPaymentOrder).mockResolvedValue({
      ...pending,
      status: "paid",
      paid_at: Date.now(),
    });
    await act(() => result.current.selectMethod("alipay"));
    expect(onPaid).toHaveBeenCalledOnce();
    expect(startBillingPayment).toHaveBeenCalledOnce();
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce();
    expect(result.current.active).toBe(false);
  });

  it("渠道二维码先过期则立即隐藏，继续以服务端查单确认最终结果", async () => {
    const order = { ...pending, expires_at: Date.now() + 10_000 };
    vi.mocked(createBillingPaymentOrder).mockResolvedValue(order);
    vi.mocked(getBillingPaymentOrder).mockResolvedValue(order);
    vi.mocked(startBillingPayment).mockResolvedValue({
      ...wechat,
      order,
      transaction: { ...wechat.transaction, expires_at: Date.now() + 1000 },
    });
    const onPaid = vi.fn();
    const { result } = renderHook(() =>
      usePlanPayment(context, "plan-1", onPaid),
    );
    await act(() => result.current.setAgreed(true));
    await act(() => vi.advanceTimersByTimeAsync(999));
    expect(result.current.qr).toBe(wechatQR);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(result.current.expired).toBe(true);
    expect(result.current.qr).toBe("");
    expect(result.current.order?.status).toBe("pending");
    vi.mocked(getBillingPaymentOrder).mockResolvedValue({
      ...order,
      status: "paid",
      paid_at: Date.now(),
    });
    await act(async () => result.current.refresh());
    expect(onPaid).toHaveBeenCalledOnce();
    expect(result.current.order?.status).toBe("paid");
  });

  it.each(["closed", "expired", "exception"])(
    "服务端终态 %s 隐藏二维码并停止查单",
    async (status) => {
      vi.mocked(getBillingPaymentOrder).mockResolvedValue({
        ...pending,
        status,
      });
      const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
      await act(() => result.current.setAgreed(true));
      expect(result.current.order?.status).toBe(status);
      expect(result.current.qr).toBe("");
      expect(result.current.active).toBe(false);
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      expect(getBillingPaymentOrder).toHaveBeenCalledOnce();
      expect(
        vi
          .mocked(recordPaymentTransition)
          .mock.calls.some(([event]) => event.to === status),
      ).toBe(true);
    },
  );

  it.each([
    { ...wechat, order: { ...pending, amount_yuan: "13.50" } },
    {
      ...wechat,
      transaction: { payment_product: "alipay_page", amount_cent: "1250" },
    },
    {
      ...wechat,
      transaction: { payment_product: "wechat_native", amount_cent: "1350" },
    },
  ])("金额或支付渠道不一致时阻断付款和后续轮询 %#", async (payment) => {
    vi.mocked(startBillingPayment).mockResolvedValue(
      payment as BillingPaymentStartResult,
    );
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(() => result.current.setAgreed(true));
    expect(result.current.blocked).toBe(true);
    expect(result.current.qr).toBe("");
    expect(getBillingPaymentOrder).not.toHaveBeenCalled();
    await act(() => result.current.start());
    expect(startBillingPayment).toHaveBeenCalledOnce();
  });

  it("微信缺少二维码时不能回退到支付宝载体，支付错误不会被待付查单吞掉", async () => {
    vi.mocked(startBillingPayment).mockResolvedValue({
      ...wechat,
      qrcode_url: "",
      payment_url: "https://qr.alipay.com/test",
    });
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(() => result.current.setAgreed(true));
    expect(result.current.qr).toBe("");
    expect(result.current.error).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(result.current.error).toBeTruthy();
  });
});
