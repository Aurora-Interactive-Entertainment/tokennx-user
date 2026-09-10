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

  it("缺少服务端支付时间时继续查单，卸载后终止请求", async () => {
    const onPaid = vi.fn();
    vi.mocked(getBillingPaymentOrder).mockResolvedValue({ ...pending, status: "paid", paid_at: null });
    const { result, unmount } = renderHook(() => usePlanPayment(context, "plan-1", onPaid));
    await act(() => result.current.start());
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
    await act(() => result.current.start());
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
      await Promise.all([result.current.start(), result.current.start()]);
    });
    expect(createBillingPaymentOrder).toHaveBeenCalledTimes(1);
    await act(() => result.current.start());
    expect(vi.mocked(createBillingPaymentOrder).mock.calls[0][2]).toBe(
      vi.mocked(createBillingPaymentOrder).mock.calls[1][2],
    );
  });

  it("支付请求失败后重试复用原订单和支付幂等键", async () => {
    vi.mocked(startBillingPayment).mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(() => result.current.start());
    await act(() => result.current.start());
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
    await act(() => result.current.start());
    await waitFor(() => expect(onPaid).toHaveBeenCalledTimes(1));
    expect(result.current.active).toBe(false);
  });

  it("实名认证失败后阻止重试支付", async () => {
    vi.mocked(createBillingPaymentOrder).mockRejectedValueOnce(
      new ApiError("实名认证", 403, 170008, null),
    );
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(() => result.current.start());
    expect(result.current.realNameRequired).toBe(true);
    await act(() => result.current.start());
    expect(createBillingPaymentOrder).toHaveBeenCalledOnce();
    expect(startBillingPayment).not.toHaveBeenCalled();
    expect(getBillingPaymentOrder).not.toHaveBeenCalled();
  });

  it("关闭时按原主体关单", async () => {
    const { result } = renderHook(() => usePlanPayment(context, "plan-1"));
    await act(() => result.current.start());
    vi.mocked(closeBillingPaymentOrder).mockResolvedValue({
      ...pending,
      status: "closed",
    });
    const onClose = vi.fn();
    await act(() => result.current.close(onClose));
    expect(closeBillingPaymentOrder).toHaveBeenCalledWith(
      "order-1",
      {},
      context,
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});
