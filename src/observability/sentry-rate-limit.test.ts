import { beforeEach, describe, expect, it } from "vitest";
import {
  canSendSentryEvent,
  clearSentryRateLimitStateForTests,
  normalizeSampleRate,
  passesSampleRate,
} from "./sentry-rate-limit";

describe("Sentry 浏览器端配额保护", () => {
  beforeEach(() => clearSentryRateLimitStateForTests());

  it("同一关键错误在 24 小时内只放行一次", () => {
    const now = Date.UTC(2026, 8, 8);

    expect(canSendSentryEvent("critical", "same-error", now)).toBe(true);
    expect(canSendSentryEvent("critical", "same-error", now + 1_000)).toBe(
      false,
    );
    expect(
      canSendSentryEvent("critical", "same-error", now + 24 * 60 * 60 * 1_000),
    ).toBe(true);
  });

  it("每个浏览器会话最多放行五个不同的关键错误", () => {
    const now = Date.UTC(2026, 8, 8);
    const results = Array.from({ length: 6 }, (_, index) =>
      canSendSentryEvent("critical", `error-${index}`, now + index),
    );

    expect(results).toEqual([true, true, true, true, true, false]);
  });

  it("会修正采样率并支持边界值", () => {
    expect(normalizeSampleRate("2", 0.1)).toBe(1);
    expect(normalizeSampleRate("-1", 0.1)).toBe(0);
    expect(normalizeSampleRate("invalid", 0.1)).toBe(0.1);
    expect(passesSampleRate(0)).toBe(false);
    expect(passesSampleRate(1)).toBe(true);
    expect(passesSampleRate(0.1, () => 0.05)).toBe(true);
    expect(passesSampleRate(0.1, () => 0.5)).toBe(false);
  });
});
