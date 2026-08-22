import { describe, expect, it } from "vitest";
import type {
  EnterpriseDimensionUsage,
  EnterpriseUsageMetrics,
} from "@/api/enterprise-console";
import {
  analyticsDimensionLabel,
  analyticsDistributionRows,
  analyticsMetricValue,
  analyticsQuery,
  analyticsRecordsPath,
  analyticsSummary,
  customAnalyticsRangeDefaults,
  defaultAnalyticsFilters,
  formatAnalyticsDelta,
  formatAnalyticsMoney,
  previousAnalyticsFilters,
} from "./enterprise-analytics-helpers";

const METRICS: EnterpriseUsageMetrics = {
  request_count: 12,
  success_count: 11,
  error_count: 1,
  cancelled_count: 0,
  active_members: 2,
  input_tokens: 1200,
  output_tokens: 600,
  cached_tokens: 200,
  total_cost_yuan: "12.500000000",
  average_latency_ms: 1250,
  success_rate: 91.7,
};

const DIMENSION: EnterpriseDimensionUsage = {
  id: "key-1",
  code: "console",
  name: "控制台调用",
  requests: 8,
  input_tokens: 100,
  output_tokens: 200,
  cached_tokens: 30,
  cost_yuan: "2.500000000",
  average_latency_ms: 1000,
};

describe("企业数据分析业务规则", () => {
  it("默认查询当前计费周期并忽略全部成员筛选", () => {
    expect(analyticsQuery(defaultAnalyticsFilters())).toEqual({
      range: "month",
      start_at: undefined,
      end_at: undefined,
      member_id: undefined,
    });
  });

  it("自定义范围使用本地日期边界，且可生成上一等长周期", () => {
    const filters = {
      range: "7d" as const,
      startDate: "",
      endDate: "",
      memberID: "member-1",
    };
    const previous = previousAnalyticsFilters(
      filters,
      new Date(2026, 6, 31, 12, 0, 0),
    );
    expect(previous).toEqual({
      range: "custom",
      startDate: "2026-07-18",
      endDate: "2026-07-24",
      memberID: "member-1",
    });

    const custom = {
      range: "custom" as const,
      startDate: "2026-07-18",
      endDate: "2026-07-24",
      memberID: "all",
    };
    const query = analyticsQuery(custom);
    expect(query.range).toBe("custom");
    expect(query.start_at).toBe(new Date(2026, 6, 18, 0, 0, 0, 0).getTime());
    expect(query.end_at).toBe(new Date(2026, 6, 24, 23, 59, 59, 999).getTime());
    expect(query.end_at).toBeGreaterThan(query.start_at ?? 0);
    expect(customAnalyticsRangeDefaults(new Date(2026, 6, 31))).toEqual({
      startDate: "2026-07-25",
      endDate: "2026-07-31",
    });
  });

  it("指标摘要处理缺失成功率、成员覆盖率和延时", () => {
    const summary = analyticsSummary(
      { ...METRICS, success_rate: null, average_latency_ms: null },
      4,
    );
    expect(summary.totalMembers).toBe(4);
    expect(summary.coverage).toBe(50);
    expect(summary.successRate).toBeCloseTo(91.666, 2);
    expect(analyticsMetricValue(summary, "avgLatency")).toBe(0);
  });

  it("费用、环比和分布比例按照目标页的展示精度输出", () => {
    expect(formatAnalyticsMoney("12.500000000")).toBe("¥12.500");
    expect(formatAnalyticsMoney("0.001234567")).toBe("¥0.001");
    expect(formatAnalyticsDelta(12.5, 10, "cost")).toEqual({
      text: "环比 +¥2.500",
      tone: "up",
    });
    expect(formatAnalyticsDelta(10, null, "count")).toEqual({
      text: "—（无可比周期）",
      tone: "neutral",
    });

    const rows = analyticsDistributionRows(
      [
        DIMENSION,
        {
          ...DIMENSION,
          id: "key-2",
          code: "api",
          name: "API 密钥",
          requests: 4,
          cost_yuan: "0.500000000",
        },
      ],
      "api-key",
    );
    expect(rows[0]).toMatchObject({
      requests: 8,
      requestShare: 67,
      costShare: 83.33333333333334,
      barWidth: 100,
    });
    expect(
      analyticsDimensionLabel(
        { ...DIMENSION, name: "", code: "console" },
        "source",
      ),
    ).toBe("控制台测试");
  });

  it("从分析排行跳转调用记录时保留成员、周期和维度筛选", () => {
    const path = analyticsRecordsPath({
      filters: { range: "month", startDate: "", endDate: "", memberID: "all" },
      period: {
        range: "month",
        start_at: Date.parse("2026-07-01T00:00:00Z"),
        end_at: Date.parse("2026-07-31T23:59:59Z"),
        label: "2026 年 7 月",
      },
      memberID: "member-1",
      model: { ...DIMENSION, alias: "gpt-public", code: "gpt-internal" },
    });
    const query = new URL(path, "https://token-nx.invalid").searchParams;
    expect(query.get("member_id")).toBe("member-1");
    expect(query.get("range")).toBe("custom");
    expect(query.get("startDate")).toBe("2026-07-01");
    expect(query.get("endDate")).toBe("2026-07-31");
    expect(query.get("model")).toBe("gpt-public");
    expect(query.get("origin")).toBe("enterprise-analytics");
  });
});
