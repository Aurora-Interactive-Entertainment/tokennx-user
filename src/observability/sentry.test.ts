import { describe, expect, it } from "vitest";
import { shouldReportCriticalApiFailure } from "./sentry";

describe("关键 API 错误分类", () => {
  it("只上报白名单写接口的服务端错误", () => {
    expect(
      shouldReportCriticalApiFailure("POST", 500, "/api/auth/logout"),
    ).toBe(true);
    expect(
      shouldReportCriticalApiFailure("PATCH", 503, "/api/user/profile"),
    ).toBe(true);
    expect(
      shouldReportCriticalApiFailure("GET", 500, "/api/user/billing"),
    ).toBe(false);
    expect(
      shouldReportCriticalApiFailure("POST", 400, "/api/user/billing"),
    ).toBe(false);
    expect(
      shouldReportCriticalApiFailure("POST", 500, "/api/homepage/content"),
    ).toBe(false);
  });

  it("分类时忽略查询参数", () => {
    expect(
      shouldReportCriticalApiFailure(
        "DELETE",
        500,
        "https://api.example.com/api/user/api-keys/key-1?token=secret",
      ),
    ).toBe(true);
  });
});
