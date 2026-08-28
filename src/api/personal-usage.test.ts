import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthTokens, saveAuthTokens } from "@/auth/token-storage";
import {
  getDailyTokenUsage,
  getUsageOverview,
  getUsageRecords,
  getUsageTrend,
} from "./personal-usage";

const payload = {
  account: { id: "personal", type: "personal" as const, name: "User" },
  start_at: Date.UTC(2025, 7, 27),
  end_at: Date.UTC(2026, 7, 26),
  items: [
    {
      date: "2026-08-26",
      input_tokens: 1200,
      output_tokens: 300,
      total_tokens: 1500,
    },
  ],
};

const overviewPayload = {
  total_cost_yuan: "12.500000000",
  account_balance_yuan: "87.500000000",
  models: [
    {
      name: "gpt-public",
      vendor: "Vendor",
      total_cost_yuan: "10.000000000",
      request_count: 8,
      input_tokens: 1200,
      output_tokens: 600,
      cached_tokens: 100,
    },
  ],
};

const trendPayload = {
  period: {
    range: "custom",
    start_at: Date.UTC(2026, 7, 1),
    end_at: Date.UTC(2026, 7, 3),
    label: "Custom",
  },
  granularity: "day",
  xAxis: {
    type: "category" as const,
    boundaryGap: false,
    data: [Date.UTC(2026, 7, 1), Date.UTC(2026, 7, 2)],
  },
  yAxis: { type: "value" as const },
  series: [
    { name: "requests", type: "line", stack: "Total", data: [2, 3] },
    { name: "tokens", type: "line", stack: "Total", data: [200, 300] },
    { name: "cost", type: "line", stack: "Total", data: [0.2, 0.3] },
  ],
};

const recordsPayload = {
  account: { id: "personal", type: "personal" as const, name: "User" },
  can_filter_members: false,
  can_view_billing: true,
  filters: { api_keys: [], models: [], members: [] },
  items: [
    {
      id: "usage-1",
      request_id: "request-1",
      event_type: "request.completed",
      occurred_at: Date.UTC(2026, 7, 1),
      model_code: "gpt-public",
      model_alias: "GPT",
      model_name: "GPT Public",
      client_tool_id: "tool-1",
      client_tool_name: "Web",
      status: "success" as const,
      api_key_id: "key-1",
      api_key_name: "Production",
      member_id: "member-1",
      member_name: "User",
      input_tokens: 20,
      output_tokens: 40,
      cached_tokens: 0,
      cache_hit_rate: null,
      latency_ms: 820,
      first_token_ms: 180,
      stream: true,
      cost_yuan: "0.001000000",
      channel: "default",
    },
  ],
  page: 2,
  page_size: 20,
  total: 25,
};

function mockApiResponse(data: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ code: 0, msg: "success", data }), {
      status: 200,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("personal usage API", () => {
  beforeEach(() => {
    saveAuthTokens({
      status: "succeeded",
      binding_required: false,
      access_token: "usage-token",
      refresh_token: "refresh-token",
      refresh_expires_at: Date.UTC(2099, 0, 1),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearAuthTokens();
  });

  it("queries the personal workspace with authentication", async () => {
    const fetchMock = mockApiResponse(payload);

    await expect(
      getDailyTokenUsage({ account_type: "personal" }),
    ).resolves.toEqual(payload);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/user/usage/token-daily?account_type=personal",
    );
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer usage-token");
  });

  it("includes the enterprise public id for enterprise workspaces", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          message: "success",
          data: {
            ...payload,
            account: {
              id: "enterprise-1",
              type: "enterprise",
              name: "Enterprise",
            },
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getDailyTokenUsage({
      account_type: "enterprise",
      enterprise_id: " enterprise-1 ",
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/user/usage/token-daily?account_type=enterprise&enterprise_id=enterprise-1",
    );
  });

  it("rejects malformed daily usage data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          message: "success",
          data: { ...payload, items: [{ date: "invalid" }] },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getDailyTokenUsage({ account_type: "personal" }),
    ).rejects.toMatchObject({ name: "ApiError", code: 100002 });
  });

  it("loads the personal usage overview without workspace query parameters", async () => {
    const fetchMock = mockApiResponse(overviewPayload);

    await expect(getUsageOverview()).resolves.toEqual(overviewPayload);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/user/usage/overview",
    );
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer usage-token");
  });
  it("passes a selected API key to overview and records queries", async () => {
    const overviewFetch = mockApiResponse(overviewPayload);
    await getUsageOverview(undefined, " key-1 ");
    expect(String(overviewFetch.mock.calls[0]?.[0])).toBe("/api/user/usage/overview?api_key_id=key-1");
    const recordsFetch = mockApiResponse(recordsPayload);
    await getUsageRecords({ account_type: "personal" }, { page: 1, page_size: 10, api_key_id: " key-1 " });
    expect(new URL(String(recordsFetch.mock.calls[0]?.[0]), "http://local").searchParams.get("api_key_id")).toBe("key-1");
  });

  it("queries personal trend data with the exact custom UTC bounds", async () => {
    const fetchMock = mockApiResponse(trendPayload);
    const startAt = Date.UTC(2026, 7, 1);
    const endAt = Date.UTC(2026, 7, 3);

    await expect(
      getUsageTrend(
        { account_type: "personal" },
        { range: "custom", start_at: startAt, end_at: endAt },
      ),
    ).resolves.toEqual(trendPayload);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "http://local");
    expect(url.pathname).toBe("/api/user/usage/trend");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      account_type: "personal",
      range: "custom",
      granularity: "day",
      start_at: String(startAt),
      end_at: String(endAt),
    });
  });

  it("queries preset trend ranges without custom bounds", async () => {
    const fetchMock = mockApiResponse({
      ...trendPayload,
      period: { ...trendPayload.period, range: "30d" },
    });

    await getUsageTrend({ account_type: "personal" }, { range: "30d" });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "http://local");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      account_type: "personal",
      range: "30d",
      granularity: "day",
    });
  });

  it("includes enterprise context in trend requests", async () => {
    const fetchMock = mockApiResponse(trendPayload);

    await getUsageTrend(
      { account_type: "enterprise", enterprise_id: " enterprise-1 " },
      {
        range: "custom",
        start_at: trendPayload.period.start_at,
        end_at: trendPayload.period.end_at,
      },
    );
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "http://local");
    expect(url.searchParams.get("account_type")).toBe("enterprise");
    expect(url.searchParams.get("enterprise_id")).toBe("enterprise-1");
  });

  it("passes server pagination and millisecond date bounds to calling records", async () => {
    const fetchMock = mockApiResponse(recordsPayload);
    const startAt = Date.UTC(2026, 7, 1);
    const endAt = Date.UTC(2026, 7, 2);

    await expect(
      getUsageRecords(
        { account_type: "personal" },
        { page: 2, page_size: 20, start_at: startAt, end_at: endAt },
      ),
    ).resolves.toEqual(recordsPayload);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "http://local");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      account_type: "personal",
      page: "2",
      page_size: "20",
      start_at: String(startAt),
      end_at: String(endAt),
    });
  });

  it("rejects trend series that do not match the fixed API contract", async () => {
    mockApiResponse({
      ...trendPayload,
      series: [
        trendPayload.series[0],
        trendPayload.series[0],
        trendPayload.series[2],
      ],
    });

    await expect(
      getUsageTrend(
        { account_type: "personal" },
        {
          range: "custom",
          start_at: trendPayload.period.start_at,
          end_at: trendPayload.period.end_at,
        },
      ),
    ).rejects.toMatchObject({ name: "ApiError", code: 100002 });
  });
});
