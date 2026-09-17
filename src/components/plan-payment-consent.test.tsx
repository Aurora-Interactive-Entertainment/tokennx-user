import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeBillingPaymentOrder,
  createBillingPaymentOrder,
  getBillingPaymentOrder,
  startBillingPayment,
  type BillingPaymentOrder,
  type BillingPaymentStartResult,
} from "@/api/billing";
import { recordPaymentTransition } from "@/observability/payment-log";
import { ApiError } from "@/api/http";
import { usePlanPayment } from "./use-plan-payment";

vi.mock("@/api/billing", async (original) => ({
  ...(await original<object>()),
  closeBillingPaymentOrder: vi.fn(),
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
    vi.mocked(closeBillingPaymentOrder).mockResolvedValue({
      ...pending,
      status: "closed",
    });
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

  it("二维码返回前锁定切换和重复提交，返回后切换先关旧单再为新渠道下单", async () => {
    const delayed = deferred<BillingPaymentStartResult>();
    const switched = { ...pending, id: "order-2" };
    vi.mocked(startBillingPayment).mockReturnValueOnce(delayed.promise);
    vi.mocked(createBillingPaymentOrder)
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(switched);
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
    // 查单以新订单为准，避免测试用旧订单响应伪造出跨订单串号。
    vi.mocked(getBillingPaymentOrder).mockResolvedValue(switched);
    vi.mocked(startBillingPayment).mockResolvedValue({
      order: switched,
      transaction: { payment_product: "alipay_page" },
      payment_url: "https://qr.alipay.com/test",
    } as BillingPaymentStartResult);
    await act(() => result.current.selectMethod("alipay"));
    expect(result.current.method).toBe("alipay");
    expect(result.current.qr).toBe("https://qr.alipay.com/test");
    // 换渠道必须换单：旧渠道订单先关单，再为新渠道创建订单并更换下单幂等键。
    expect(closeBillingPaymentOrder).toHaveBeenCalledWith(
      "order-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
      context,
    );
    expect(createBillingPaymentOrder).toHaveBeenCalledTimes(2);
    const created = vi.mocked(createBillingPaymentOrder).mock.calls;
    expect(created[0][2]).not.toBe(created[1][2]);
    const calls = vi.mocked(startBillingPayment).mock.calls;
    expect(calls[0][0]).toBe("order-1");
    expect(calls[1][0]).toBe("order-2");
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

  it("切换渠道时查到旧订单已支付则结束会话，不再为新渠道下单", async () => {
    const onPaid = vi.fn();
    const { result } = renderHook(() =>
      usePlanPayment(context, "plan-1", onPaid),
    );
    await act(() => result.current.setAgreed(true));
    vi.mocked(closeBillingPaymentOrder).mockResolvedValue({
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

  it("关单失败保留旧渠道和订单，不创建第二个支付订单", async () => {
    const switched = { ...pending, id: "order-2" };
    vi.mocked(createBillingPaymentOrder)
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(switched);
    vi.mocked(closeBillingPaymentOrder).mockRejectedValue(
      new ApiError("渠道暂不可用", 503, 170007, null),
    );
    vi.mocked(getBillingPaymentOrder).mockImplementation(async (id) =>
      id === "order-2" ? switched : pending,
    );
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(() => result.current.setAgreed(true));
    vi.mocked(startBillingPayment).mockResolvedValue({
      order: switched,
      transaction: { payment_product: "alipay_page" },
      payment_url: "https://qr.alipay.com/test",
    } as BillingPaymentStartResult);
    await act(() => result.current.selectMethod("alipay"));
    expect(result.current.method).toBe("wechat");
    expect(result.current.qr).toBe(wechatQR);
    expect(result.current.order?.id).toBe("order-1");
    expect(result.current.error).toBeTruthy();
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce();
    expect(startBillingPayment).toHaveBeenCalledOnce();
  });

  it("关单被拒时以查单结果确认旧订单状态，不凭关单失败直接重复下单", async () => {
    const switched = { ...pending, id: "order-2" };
    vi.mocked(createBillingPaymentOrder)
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(switched);
    vi.mocked(closeBillingPaymentOrder).mockRejectedValue(
      new ApiError("订单状态已变化", 409, 170004, "req-170004"),
    );
    vi.mocked(getBillingPaymentOrder).mockImplementation(async (id) =>
      id === "order-2" ? switched : pending,
    );
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(() => result.current.setAgreed(true));
    vi.mocked(startBillingPayment).mockResolvedValue({
      order: switched,
      transaction: { payment_product: "alipay_page" },
      payment_url: "https://qr.alipay.com/test",
    } as BillingPaymentStartResult);
    // 查单仍返回待支付订单，不能把“查到了”误认为“已关闭”。
    await act(() => result.current.selectMethod("alipay"));
    expect(getBillingPaymentOrder).toHaveBeenCalledWith("order-1", expect.objectContaining({ signal: expect.any(AbortSignal) }), context);
    expect(result.current.method).toBe("wechat");
    expect(result.current.error).toBeTruthy();
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce();
  });

  it("关单网络结果未知后重试，确认关闭才使用新幂等键创建新单", async () => {
    const switched = { ...pending, id: "order-2" };
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(() => result.current.setAgreed(true));
    const firstKey = vi.mocked(createBillingPaymentOrder).mock.calls[0][2];
    vi.mocked(closeBillingPaymentOrder).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await act(() => result.current.selectMethod("alipay"));
    expect(result.current.method).toBe("wechat");
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce();
    vi.mocked(createBillingPaymentOrder).mockResolvedValue(switched);
    vi.mocked(getBillingPaymentOrder).mockResolvedValue(switched);
    vi.mocked(startBillingPayment).mockResolvedValue({ order: switched, transaction: { payment_product: "alipay_page" }, payment_url: "https://qr.alipay.com/test" } as BillingPaymentStartResult);
    await act(() => result.current.selectMethod("alipay"));
    expect(result.current.method).toBe("alipay");
    expect(result.current.order?.id).toBe("order-2");
    expect(createBillingPaymentOrder).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createBillingPaymentOrder).mock.calls[1][2]).not.toBe(firstKey);
  });

  it.each(["pending", "paying", "exception"])("关单返回 %s 时不能放弃旧订单", async (status) => {
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(() => result.current.setAgreed(true));
    vi.mocked(closeBillingPaymentOrder).mockResolvedValue({ ...pending, status });
    await act(() => result.current.selectMethod("alipay"));
    expect(result.current.method).toBe("wechat");
    expect(result.current.order?.id).toBe("order-1");
    expect(result.current.error).toBeTruthy();
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce();
  });

  it("关单冲突后的查单失败不会清除旧订单", async () => {
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(() => result.current.setAgreed(true));
    vi.mocked(closeBillingPaymentOrder).mockRejectedValue(new ApiError("状态变化", 409, 170004, null));
    vi.mocked(getBillingPaymentOrder).mockRejectedValue(new TypeError("Failed to fetch"));
    await act(() => result.current.selectMethod("alipay"));
    expect(result.current.method).toBe("wechat");
    expect(result.current.order?.id).toBe("order-1");
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce();
  });

  it("关单期间查单确认旧订单已支付时，不再为新渠道下单", async () => {
    const closing = deferred<BillingPaymentOrder>();
    vi.mocked(closeBillingPaymentOrder).mockReturnValue(closing.promise);
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
    const switching = result.current.selectMethod("alipay");
    // 关单还没返回时查单先确认支付成功，切换必须就此结束。
    await act(() => vi.advanceTimersByTimeAsync(2000));
    await act(async () => closing.resolve({ ...pending, status: "closed" }));
    await act(() => switching);
    expect(onPaid).toHaveBeenCalledOnce();
    expect(result.current.method).toBe("wechat");
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce();
    expect(startBillingPayment).toHaveBeenCalledOnce();
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
