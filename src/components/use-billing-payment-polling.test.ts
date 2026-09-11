import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBillingPaymentOrder,
  type BillingPaymentOrder,
} from "@/api/billing";
import { ApiError } from "@/api/http";
import { useBillingPaymentPolling } from "./use-billing-payment-polling";
import { usePaymentExpiry } from "./use-payment-expiry";

vi.mock("@/api/billing", () => ({ getBillingPaymentOrder: vi.fn() }));
const order = {
  id: "test-order",
  status: "pending",
  paid_at: null,
} as BillingPaymentOrder;
function options() {
  return {
    context: { account_type: "personal" as const },
    order,
    enabled: true,
    refreshToken: 0,
    onOrder: vi.fn(),
    onError: vi.fn(),
    onTimeout: vi.fn(),
  };
}

describe("充值与套餐共用支付时序", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    vi.mocked(getBillingPaymentOrder).mockResolvedValue(order);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("首次立即查单，之后每两秒查询，五分钟停止并允许手动刷新重新确认", async () => {
    const props = options();
    const { rerender } = renderHook(
      (value) => useBillingPaymentPolling(value),
      { initialProps: props },
    );
    await act(async () => {});
    expect(getBillingPaymentOrder).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(1999));
    expect(getBillingPaymentOrder).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(getBillingPaymentOrder).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(298_000));
    expect(getBillingPaymentOrder).toHaveBeenCalledTimes(150);
    expect(props.onTimeout).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(getBillingPaymentOrder).toHaveBeenCalledTimes(150);
    rerender({ ...props, refreshToken: 1 });
    await act(async () => {});
    expect(getBillingPaymentOrder).toHaveBeenCalledTimes(151);
  });

  it("网络失败依次退避 2/4/8/10 秒，恢复成功后回到两秒", async () => {
    vi.mocked(getBillingPaymentOrder).mockRejectedValue(
      new TypeError("offline"),
    );
    renderHook(() => useBillingPaymentPolling(options()));
    await act(async () => {});
    for (const [index, delay] of [2000, 4000, 8000, 10000].entries()) {
      await act(() => vi.advanceTimersByTimeAsync(delay - 1));
      expect(getBillingPaymentOrder).toHaveBeenCalledTimes(index + 1);
      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(getBillingPaymentOrder).toHaveBeenCalledTimes(index + 2);
    }
    vi.mocked(getBillingPaymentOrder).mockResolvedValue(order);
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(getBillingPaymentOrder).toHaveBeenCalledTimes(6);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(getBillingPaymentOrder).toHaveBeenCalledTimes(7);
  });

  it("弱网未返回时不并发查单，禁用后忽略旧响应", async () => {
    let resolve!: (order: BillingPaymentOrder) => void;
    vi.mocked(getBillingPaymentOrder).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const props = options();
    const { rerender } = renderHook(
      (value) => useBillingPaymentPolling(value),
      { initialProps: props },
    );
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(getBillingPaymentOrder).toHaveBeenCalledOnce();
    rerender({ ...props, enabled: false });
    expect(
      vi.mocked(getBillingPaymentOrder).mock.calls[0][1]?.signal?.aborted,
    ).toBe(true);
    await act(async () =>
      resolve({ ...order, status: "paid", paid_at: Date.now() }),
    );
    expect(props.onOrder).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(getBillingPaymentOrder).toHaveBeenCalledOnce();
  });

  it("认证失败终止轮询，不反复发送无效请求", async () => {
    const props = options();
    vi.mocked(getBillingPaymentOrder).mockRejectedValue(
      new ApiError("Unauthorized", 401, 160001, null),
    );
    renderHook(() => useBillingPaymentPolling(props));
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(getBillingPaymentOrder).toHaveBeenCalledOnce();
    expect(props.onError).toHaveBeenCalledOnce();
  });

  it("回调或 pending → paying 的更新不重置五分钟计时", async () => {
    const props = options();
    const { rerender } = renderHook(
      (value) => useBillingPaymentPolling(value),
      { initialProps: props },
    );
    await act(() => vi.advanceTimersByTimeAsync(290_000));
    rerender({
      ...props,
      order: { ...order, status: "paying" },
      onOrder: vi.fn(),
    });
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(props.onTimeout).toHaveBeenCalledOnce();
  });

  it("使用订单与渠道较早的过期时间；超出定时器上限仍能在真实截止时间失效", async () => {
    const now = Date.now();
    const later = now + 2_147_483_647 + 10_000;
    const { result, rerender } = renderHook(
      ({ a, b }) => usePaymentExpiry(a, b),
      { initialProps: { a: later, b: later + 1000 } },
    );
    await act(() => vi.advanceTimersByTimeAsync(2_147_483_647));
    expect(result.current.expired).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(result.current.expired).toBe(true);
    rerender({ a: Date.now() + 10_000, b: Date.now() + 2000 });
    expect(result.current.expired).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(result.current.expired).toBe(true);
  });
});
