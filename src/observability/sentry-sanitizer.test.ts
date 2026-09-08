import type { ErrorEvent } from "@sentry/react";
import { describe, expect, it } from "vitest";
import {
  isChunkLoadError,
  isDiscardedBrowserNoise,
  sanitizeRequestUrl,
  sanitizeSentryEvent,
} from "./sentry-sanitizer";

describe("Sentry 隐私清洗", () => {
  it("只保留请求路径和内部用户 ID", () => {
    const event = {
      type: undefined,
      user: {
        id: "internal-user-1",
        email: "user@example.com",
        ip_address: "127.0.0.1",
      },
      request: {
        url: "https://tokennx.com/invite?token=secret&email=user@example.com",
        method: "GET",
        headers: { Authorization: "Bearer secret" },
        cookies: { session: "secret" },
        data: { prompt: "private prompt" },
      },
      tags: { locale: "zh-CN", password: "secret", unknown: "value" },
      contexts: { browser: { name: "Chrome" }, private: { token: "secret" } },
      extra: { apiKey: "sk-secret" },
      breadcrumbs: [
        { category: "console", message: "secret log" },
        {
          category: "fetch",
          data: {
            method: "POST",
            status_code: 500,
            url: "https://api.example.com/api/user/billing?token=secret",
            request_body_size: 100,
          },
        },
      ],
    } satisfies ErrorEvent;

    const sanitized = sanitizeSentryEvent(event);

    expect(sanitized.user).toEqual({ id: "internal-user-1" });
    expect(sanitized.request).toEqual({ method: "GET", url: "/invite" });
    expect(sanitized.tags).toEqual({ locale: "zh-CN" });
    expect(sanitized.contexts).toEqual({ browser: { name: "Chrome" } });
    expect(sanitized.extra).toBeUndefined();
    expect(sanitized.breadcrumbs).toEqual([
      {
        category: "fetch",
        data: { method: "POST", status_code: 500, url: "/api/user/billing" },
      },
    ]);
  });

  it("移除 URL 查询参数并识别需要降噪的错误", () => {
    expect(sanitizeRequestUrl("/join?invitation=secret#form")).toBe("/join");
    expect(sanitizeRequestUrl("/models/customer-model-1?token=secret")).toBe(
      "/models/:id",
    );
    expect(sanitizeRequestUrl("/api/user/api-keys/key-1")).toBe(
      "/api/user/api-keys/:id",
    );
    expect(
      isDiscardedBrowserNoise(
        { type: undefined, message: "ResizeObserver loop limit exceeded" },
        {},
      ),
    ).toBe(true);
    expect(
      isDiscardedBrowserNoise(
        {
          type: undefined,
          exception: {
            values: [
              {
                stacktrace: {
                  frames: [
                    { filename: "chrome-extension://secret/content.js" },
                  ],
                },
              },
            ],
          },
        },
        {},
      ),
    ).toBe(true);
    expect(
      isDiscardedBrowserNoise(
        {
          type: undefined,
          exception: {
            values: [
              {
                stacktrace: {
                  frames: [
                    {
                      filename:
                        "https://hm.baidu.com/hm.js?9943442444aca71a570988ecd05365e8",
                    },
                  ],
                },
              },
            ],
          },
        },
        {},
      ),
    ).toBe(true);
    expect(
      isDiscardedBrowserNoise(
        { type: undefined },
        {
          originalException: Object.assign(new Error("Bad request"), {
            name: "ApiError",
          }),
        },
      ),
    ).toBe(true);
    expect(
      isDiscardedBrowserNoise(
        { type: undefined },
        { originalException: new TypeError("Failed to fetch") },
      ),
    ).toBe(true);
  });

  it("识别懒加载资源错误", () => {
    expect(
      isChunkLoadError(
        { type: undefined },
        {
          originalException: new Error(
            "Failed to fetch dynamically imported module",
          ),
        },
      ),
    ).toBe(true);
  });
});
