import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/http";
import {
  createBillingPaymentOrder,
  startBillingPayment,
  getBillingPaymentOrder,
  closeBillingPaymentOrder,
  type BillingPaymentOrder,
} from "@/api/billing";
import { usePlanPayment } from "./use-plan-payment";

vi.mock("@/api/billing", async (original) => ({
  ...(await original<object>()),
  createBillingPaymentOrder: vi.fn(),
  startBillingPayment: vi.fn(),
  getBillingPaymentOrder: vi.fn(),
  closeBillingPaymentOrder: vi.fn(),
}));
const context = {
  account_type: "enterprise" as const,
  enterprise_id: "enterprise-1",
};
const pending = {
  id: "order-1",
  status: "pending",
  paid_at: null,
  amount_yuan: "12.50",
} as BillingPaymentOrder;

describe("套餐订单支付会话", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createBillingPaymentOrder).mockResolvedValue(pending);
    vi.mocked(getBillingPaymentOrder).mockResolvedValue(pending);
    vi.mocked(startBillingPayment).mockResolvedValue({
      order: pending,
      transaction: {} as never,
      payment_url: "https://qr.alipay.com/test-order",
    });
  });
  afterEach(cleanup);

  it("缺少套餐 ID 时显示正式参数错误，不创建订单或启动支付和轮询", async () => {
    const { result } = renderHook(() => usePlanPayment(context, undefined));
    await act(() => result.current.setAgreed(true));
    expect(result.current.error).toBe("支付请求参数无效，请刷新后重试");
    expect(result.current.qr).toBe("");
    expect(createBillingPaymentOrder).not.toHaveBeenCalled();
    expect(startBillingPayment).not.toHaveBeenCalled();
    expect(getBillingPaymentOrder).not.toHaveBeenCalled();
  });

  it("缺少服务端支付时间时继续查单，卸载后终止请求", async () => {
    const onPaid = vi.fn();
    vi.mocked(getBillingPaymentOrder).mockResolvedValue({ ...pending, status: "paid", paid_at: null });
    const { result, unmount } = renderHook(() => usePlanPayment(context, "plan-1", onPaid));
    await act(() => startPayment(result.current));
    await waitFor(() => expect(result.current.order?.status).toBe("paid"));
    expect(onPaid).not.toHaveBeenCalled();
    expect(result.current.active).toBe(true);
    const calls = vi.mocked(getBillingPaymentOrder).mock.calls;
    const signal = calls[calls.length - 1][1]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("只提交商品和数量，支付和查单沿用企业主体，金额取服务端", async () => {
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(() => startPayment(result.current));
    expect(createBillingPaymentOrder).toHaveBeenCalledWith(
      context,
      { plan_id: "plan-1", quantity: 1 },
      expect.any(String),
      expect.any(Object),
    );
    expect(startBillingPayment).toHaveBeenCalledWith(
      "order-1",
      expect.any(String),
      expect.objectContaining({ channel: "alipay" }),
      context,
    );
    await waitFor(() => expect(getBillingPaymentOrder).toHaveBeenCalled());
    expect(result.current.order?.amount_yuan).toBe("12.50");
  });

  it("创建结果不确定时重试沿用幂等键，连点不重复下单", async () => {
    vi.mocked(createBillingPaymentOrder).mockRejectedValueOnce(
      new Error("network"),
    );
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(async () => {
      await Promise.all([startPayment(result.current), startPayment(result.current)]);
    });
    expect(createBillingPaymentOrder).toHaveBeenCalledTimes(1);
    await act(() => startPayment(result.current));
    expect(vi.mocked(createBillingPaymentOrder).mock.calls[0][2]).toBe(
      vi.mocked(createBillingPaymentOrder).mock.calls[1][2],
    );
  });

  it("支付请求失败后重试复用原订单和支付幂等键", async () => {
    vi.mocked(startBillingPayment).mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(() => startPayment(result.current));
    await act(() => startPayment(result.current));
    expect(createBillingPaymentOrder).toHaveBeenCalledTimes(1);
    expect(vi.mocked(startBillingPayment).mock.calls[0][1]).toBe(
      vi.mocked(startBillingPayment).mock.calls[1][1],
    );
  });

  it("只在查单确认 paid_at 后回调一次", async () => {
    const onPaid = vi.fn();
    vi.mocked(getBillingPaymentOrder).mockResolvedValue({
      ...pending,
      status: "paid",
      paid_at: Date.now(),
    });
    const { result } = renderHook(() =>
      usePlanPayment(context, "plan-1", onPaid),
    );
    await act(() => startPayment(result.current));
    await waitFor(() => expect(onPaid).toHaveBeenCalledTimes(1));
    expect(result.current.active).toBe(false);
  });

  it("实名认证失败后阻止重试支付", async () => {
    vi.mocked(createBillingPaymentOrder).mockRejectedValueOnce(
      new ApiError("实名认证", 403, 170008, null),
    );
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(() => startPayment(result.current));
    expect(result.current.realNameRequired).toBe(true);
    await act(() => startPayment(result.current));
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce();
    expect(startBillingPayment).not.toHaveBeenCalled();
    expect(getBillingPaymentOrder).not.toHaveBeenCalled();
  });

  it("关闭时按原主体关单", async () => {
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(() => startPayment(result.current));
    vi.mocked(closeBillingPaymentOrder).mockResolvedValue({
      ...pending,
      status: "closed",
    });
    const onClose = vi.fn();
    await act(() => result.current.close(onClose));
    expect(closeBillingPaymentOrder).toHaveBeenCalledWith(
      "order-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
      context,
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("重试查到 paid 但缺少支付时间时不再调用支付接口", async () => {
    vi.mocked(createBillingPaymentOrder).mockResolvedValue({ ...pending, status: "paid", paid_at: null });
    vi.mocked(getBillingPaymentOrder).mockResolvedValue({ ...pending, status: "paid", paid_at: null });
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(() => startPayment(result.current));
    await act(() => startPayment(result.current));
    expect(startBillingPayment).not.toHaveBeenCalled();
    expect(result.current.active).toBe(true);
  });

  it("关单遇到付款竞争时查单收敛，按真实已支付状态回调", async () => {
    const onPaid = vi.fn();
    const { result } = renderHook(() => usePlanPayment(context, "plan-1", onPaid));
    await act(() => startPayment(result.current));
    vi.mocked(closeBillingPaymentOrder).mockRejectedValue(new ApiError("订单状态变化", 409, 170004, null));
    vi.mocked(getBillingPaymentOrder).mockResolvedValue({ ...pending, status: "paid", paid_at: Date.now() });
    const onClose = vi.fn();
    await act(() => result.current.close(onClose));
    expect(onPaid).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(result.current.qr).toBe("");
  });

  it("无法确认关单结果时保留订单，不伪造关闭成功", async () => {
    vi.mocked(closeBillingPaymentOrder).mockResolvedValue(pending);
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(() => startPayment(result.current));
    const onClose = vi.fn();
    await act(() => result.current.close(onClose));
    expect(onClose).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
  });

  it("重试时取消之前的查单，迟到响应不能把成功订单改回待付", async () => {
    let resolvePoll!: (value: BillingPaymentOrder) => void;
    vi.mocked(getBillingPaymentOrder).mockImplementationOnce(() => new Promise(resolve => { resolvePoll = resolve; }));
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(() => startPayment(result.current));
    const signal = vi.mocked(getBillingPaymentOrder).mock.calls[0][1]?.signal;
    vi.mocked(getBillingPaymentOrder).mockResolvedValue({ ...pending, status: "paid", paid_at: Date.now() });
    await act(() => startPayment(result.current));
    expect(signal?.aborted).toBe(true);
    await act(async () => resolvePoll(pending));
    expect(result.current.order?.status).toBe("paid");
  });

  it.each([
    { ...pending, id: "other-order" },
    { ...pending, account_type: "personal" },
    { ...pending, enterprise_id: "other-enterprise" },
    { ...pending, order_type: "recharge" },
  ])("拒绝不属于本次套餐购买的支付响应 %j", async (latest) => {
    vi.mocked(startBillingPayment).mockResolvedValue({ order: latest, transaction: {} } as never);
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(() => startPayment(result.current));
    expect(result.current.error).toContain("支付订单信息与当前购买不一致");
    expect(result.current.qr).toBe("");
    expect(result.current.form).toBe("");
  });

  it.each([
    { ...pending, status: undefined },
    { ...pending, amount_yuan: undefined },
    { ...pending, amount_yuan: "NaN" },
    { ...pending, currency: "USD" },
  ])("订单响应不完整或币种异常时停止支付 %j", async (latest) => {
    vi.mocked(createBillingPaymentOrder).mockResolvedValue(latest as BillingPaymentOrder);
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(() => startPayment(result.current));
    expect(result.current.error).toContain("支付订单信息与当前购买不一致");
    expect(result.current.order).toBeNull();
    expect(startBillingPayment).not.toHaveBeenCalled();
  });
});

// 旧支付宝回归显式选择渠道并同意协议，重试仍走同一会话。
async function startPayment(payment: ReturnType<typeof usePlanPayment>) {
  if (!payment.agreed) { await payment.selectMethod('alipay'); await payment.setAgreed(true) }
  else await payment.start()
}
