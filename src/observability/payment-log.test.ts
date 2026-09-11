import { afterEach, expect, it, vi } from "vitest";
import { Sentry } from "./sentry";
import { recordPaymentTransition, type PaymentTransition } from "./payment-log";

vi.mock("./sentry", () => ({ Sentry: { addBreadcrumb: vi.fn() } }));
afterEach(() => vi.restoreAllMocks());

it("支付日志按白名单记录阶段及追踪信息，禁止原始响应、二维码和令牌混入", () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  recordPaymentTransition({
    session: "session-1",
    from: "starting",
    to: "error",
    channel: "wechat",
    orderStatus: "paying",
    code: 170007,
    requestId: "request-1",
    token: "secret-token",
    qrcode_url: "secret-qr",
    form_html: "secret-signature",
    response: { secret: true },
  } as PaymentTransition);
  expect(log).toHaveBeenCalledWith(
    "[payment]",
    expect.objectContaining({
      from: "starting",
      to: "error",
      requestId: "request-1",
      time: expect.any(String),
    }),
  );
  expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
    expect.objectContaining({ category: "payment", level: "warning" }),
  );
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  expect(
    JSON.stringify(vi.mocked(Sentry.addBreadcrumb).mock.calls),
  ).not.toContain("secret");
});
