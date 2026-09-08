import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthTokens, saveAuthTokens } from "@/auth/token-storage";
import {
  getDailyTokenUsage,
  getUsageAnalysis,
  getUsageFilters,
  getUsageModels,
  getUsageOverview,
  getUsageRecords,
  getUsageSummary,
  getUsageTrend,
} from "./personal-usage";

const account = { id: "personal", type: "personal" as const, name: "User" };

const dailyPayload = {
  account,
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

const summaryPayload = {
  can_view_billing: true,
  metrics: {
    request_count: 12,
    input_tokens: 1200,
    output_tokens: 900,
    total_cost_yuan: "0.012000000",
    average_latency_ms: 820.5,
    success_rate: 91.67,
  },
};

const filtersPayload = {
  can_filter_members: true,
  models: [
    { code: "gpt-4.1-mini", alias: "gpt-mini", name: "GPT Mini", requests: 12 },
  ],
  api_keys: [{ id: "key-1", name: "Production", requests: 12 }],
  statuses: [{ value: "success" as const, requests: 12 }],
  members: [{ id: "member-1", name: "User" }],
};

const modelsPayload = {
  can_view_billing: true,
  items: [
    {
      model_code: "gpt-4.1-mini",
      model_alias: "gpt-mini",
      model_name: "GPT Mini",
      vendor: "OpenAI",
      requests: 12,
      input_tokens: 1200,
      output_tokens: 900,
      cached_tokens: 100,
      cost_yuan: "0.012000000",
      average_latency_ms: 820.5,
    },
  ],
  page: 1,
  page_size: 20,
  total: 1,
};

const trendPayload = {
  period: {
    range: "custom",
    start_at: Date.UTC(2026, 7, 1),
    end_at: Date.UTC(2026, 7, 3),
    label: "Custom",
  },
  granularity: "day" as const,
  metric: "requests" as const,
  can_view_billing: true,
  buckets: [
    {
      bucket_start: Date.UTC(2026, 7, 1),
      request_count: 2,
      models: [
        {
          code: "gpt-public",
          alias: "GPT",
          name: "GPT Public",
          request_count: 2,
        },
      ],
    },
    { bucket_start: Date.UTC(2026, 7, 2), request_count: 0, models: [] },
  ],
  x_axis: {
    type: "category" as const,
    boundary_gap: false as const,
    data: [Date.UTC(2026, 7, 1), Date.UTC(2026, 7, 2)],
  },
  y_axis: { type: "value" as const },
  model_distribution: [
    {
      code: "gpt-public",
      alias: "GPT",
      name: "GPT Public",
      request_count: 2,
    },
  ],
  tool_distribution: [
    {
      id: "tool-1",
      name: "Claude Code",
      request_count: 2,
    },
  ],
  api_key_distribution: [
    {
      id: "key-1",
      name: "Production",
      request_count: 2,
    },
  ],
  series: [
    {
      name: "requests" as const,
      type: "line" as const,
      stack: "Total" as const,
      data: [2, 0],
    },
    {
      name: "tokens" as const,
      type: "line" as const,
      stack: "Total" as const,
      data: [200, 0],
    },
    {
      name: "cost" as const,
      type: "line" as const,
      stack: "Total" as const,
      data: [0.2, 0],
    },
  ],
};

const record = {
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
};

const recordsPayload = {
  account,
  can_filter_members: false,
  can_view_billing: true,
  filters: { api_keys: [], models: [], members: [] },
  items: [record],
  page: 2,
  page_size: 20,
  total: 25,
};

const aggregatePayload = {
  account,
  can_filter_members: false,
  can_view_billing: true,
  filters: { api_keys: [], models: [], members: [] },
  items: [
    {
      id: "bucket:gpt-public",
      bucket_start: Date.UTC(2026, 7, 1),
      bucket_end: Date.UTC(2026, 7, 2),
      granularity: "day" as const,
      model_code: "gpt-public",
      model_alias: "GPT",
      model_name: "GPT Public",
      vendor: "Vendor",
      requests: 12,
      success_count: 10,
      error_count: 2,
      cancelled_count: 0,
      input_tokens: 2000,
      output_tokens: 1200,
      cached_tokens: 300,
      cost_yuan: "0.120000000",
      average_latency_ms: 820,
    },
  ],
  granularity: "day" as const,
  page: 1,
  page_size: 20,
  total: 1,
};

const analysisPayload = {
  account,
  subject: { id: "user-1", name: "User" },
  period: {
    range: "30d",
    start_at: Date.UTC(2026, 7, 1),
    end_at: Date.UTC(2026, 7, 31),
    label: "Last 30 days",
  },
  can_view_billing: true,
  activity: {},
  reliability: {},
  efficiency: {},
  usage_patterns: {},
  models: [],
  tools: [],
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
    const fetchMock = mockApiResponse(dailyPayload);

    await expect(
      getDailyTokenUsage({ account_type: "personal" }),
    ).resolves.toEqual(dailyPayload);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/user/usage/token-daily?account_type=personal",
    );
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer usage-token");
  });

  it("includes the enterprise public id for enterprise workspaces", async () => {
    const fetchMock = mockApiResponse({
      ...dailyPayload,
      account: { id: "enterprise-1", type: "enterprise", name: "Enterprise" },
    });

    await getDailyTokenUsage({
      account_type: "enterprise",
      enterprise_id: " enterprise-1 ",
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/user/usage/token-daily?account_type=enterprise&enterprise_id=enterprise-1",
    );
  });

  it("rejects malformed daily usage data", async () => {
    mockApiResponse({ ...dailyPayload, items: [{ date: "invalid" }] });
    await expect(
      getDailyTokenUsage({ account_type: "personal" }),
    ).rejects.toMatchObject({ name: "ApiError", code: 100002 });
  });

  it("keeps the legacy overview endpoint free of unsupported filters", async () => {
    const fetchMock = mockApiResponse(overviewPayload);
    await expect(getUsageOverview(undefined, "key-1")).resolves.toEqual(
      overviewPayload,
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/user/usage/overview",
    );
  });

  it("queries summary with workspace context and filters", async () => {
    const fetchMock = mockApiResponse(summaryPayload);
    await expect(
      getUsageSummary(
        { account_type: "enterprise", enterprise_id: " ent-1 " },
        {
          range: "custom",
          api_key_id: " key-1 ",
          model: " gpt-mini ",
          status: "all",
          member_id: " member-1 ",
          start_at: 100,
          end_at: 200,
        },
      ),
    ).resolves.toEqual(summaryPayload);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "http://local");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      account_type: "enterprise",
      enterprise_id: "ent-1",
      range: "custom",
      api_key_id: "key-1",
      model: "gpt-mini",
      member_id: "member-1",
      start_at: "100",
      end_at: "200",
    });
  });

  it("loads filters and validates all capability arrays", async () => {
    const fetchMock = mockApiResponse(filtersPayload);
    await expect(
      getUsageFilters({ account_type: "personal" }),
    ).resolves.toEqual(filtersPayload);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/user/usage/filters?account_type=personal",
    );

    mockApiResponse({ ...filtersPayload, can_filter_members: undefined });
    await expect(
      getUsageFilters({ account_type: "personal" }),
    ).rejects.toMatchObject({ name: "ApiError", code: 100002 });
  });

  it("queries paged model statistics with documented defaults", async () => {
    const fetchMock = mockApiResponse(modelsPayload);
    await expect(
      getUsageModels(
        { account_type: "personal" },
        { range: "30d", page: 2, page_size: 50, status: "success" },
      ),
    ).resolves.toEqual(modelsPayload);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "http://local");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      account_type: "personal",
      range: "30d",
      status: "success",
      page: "2",
      page_size: "50",
    });

    const defaultsFetch = mockApiResponse(modelsPayload);
    await getUsageModels({ account_type: "personal" });
    expect(String(defaultsFetch.mock.calls[0]?.[0])).toBe(
      "/api/user/usage/models?account_type=personal&page=1&page_size=20",
    );
  });

  it("uses the canonical snake_case trend axes and required capabilities", async () => {
    const fetchMock = mockApiResponse(trendPayload);
    const startAt = trendPayload.period.start_at;
    const endAt = trendPayload.period.end_at;
    await expect(
      getUsageTrend(
        { account_type: "personal" },
        {
          range: "custom",
          granularity: "day",
          metric: "requests",
          start_at: startAt,
          end_at: endAt,
        },
      ),
    ).resolves.toEqual(trendPayload);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "http://local");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      account_type: "personal",
      range: "custom",
      granularity: "day",
      metric: "requests",
      start_at: String(startAt),
      end_at: String(endAt),
    });

    mockApiResponse({ ...trendPayload, can_view_billing: undefined });
    await expect(
      getUsageTrend({ account_type: "personal" }, { range: "30d" }),
    ).rejects.toMatchObject({ name: "ApiError", code: 100002 });
  });

  it("rejects the obsolete camelCase trend response", async () => {
    const { x_axis, y_axis, ...rest } = trendPayload;
    mockApiResponse({ ...rest, xAxis: x_axis, yAxis: y_axis });
    await expect(
      getUsageTrend({ account_type: "personal" }, { range: "30d" }),
    ).rejects.toMatchObject({ name: "ApiError", code: 100002 });
  });

  it("passes every documented calling-record filter and parses detail rows", async () => {
    const fetchMock = mockApiResponse(recordsPayload);
    await expect(
      getUsageRecords(
        { account_type: "personal" },
        {
          page: 2,
          page_size: 20,
          api_key_id: "key-1",
          model: "gpt-public",
          status: "success",
          member_id: "member-1",
          request_id: "request-1",
          start_at: "2026-08-01T00:00:00Z",
          end_at: "2026-08-02T00:00:00Z",
        },
      ),
    ).resolves.toEqual(recordsPayload);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "http://local");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      account_type: "personal",
      page: "2",
      page_size: "20",
      api_key_id: "key-1",
      model: "gpt-public",
      status: "success",
      member_id: "member-1",
      request_id: "request-1",
      start_at: "2026-08-01T00:00:00Z",
      end_at: "2026-08-02T00:00:00Z",
    });
  });

  it("parses aggregate calling-record rows separately from detail rows", async () => {
    const fetchMock = mockApiResponse(aggregatePayload);
    const response = await getUsageRecords(
      { account_type: "personal" },
      { aggregate: true, granularity: "day" },
    );
    expect(response.items[0]).toMatchObject({
      requests: 12,
      bucket_start: expect.any(Number),
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/user/usage/records?account_type=personal&page=1&page_size=20&aggregate=true&granularity=day",
    );

    mockApiResponse(aggregatePayload);
    await expect(
      getUsageRecords({ account_type: "personal" }, {}),
    ).rejects.toMatchObject({ name: "ApiError", code: 100002 });
  });

  it("queries the documented single-user analysis endpoint", async () => {
    const fetchMock = mockApiResponse(analysisPayload);
    await expect(
      getUsageAnalysis(
        { account_type: "personal" },
        { range: "30d", member_id: "user-1", start_at: 100, end_at: 200 },
      ),
    ).resolves.toEqual(analysisPayload);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "http://local");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      account_type: "personal",
      range: "30d",
      member_id: "user-1",
      start_at: "100",
      end_at: "200",
    });
  });
});
