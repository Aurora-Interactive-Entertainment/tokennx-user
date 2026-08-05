import type {
  EnterpriseDimensionUsage,
  EnterpriseUsageMetrics,
  EnterpriseUsagePeriod,
  EnterpriseUsageTrendPoint,
} from "@/api/enterprise-console";
import i18n from "@/i18n";
import {
  formatCount,
  formatLocalDateInput,
  formatYuan,
  localDateToISOString,
  shiftLocalDate,
} from "@/utils/format";

export const ANALYTICS_RANGE_OPTIONS = [
  "7d",
  "30d",
  "month",
  "custom",
] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGE_OPTIONS)[number];

export const ANALYTICS_METRIC_OPTIONS = [
  "requests",
  "cost",
  "tokens",
  "success",
] as const;
export type AnalyticsMetric = (typeof ANALYTICS_METRIC_OPTIONS)[number];

export type AnalyticsFilters = {
  range: AnalyticsRange;
  startDate: string;
  endDate: string;
  memberID: string;
};

export type AnalyticsQuery = {
  range: AnalyticsRange;
  start_at?: string;
  end_at?: string;
  member_id?: string;
};

export type AnalyticsMetricKey =
  | "coverage"
  | "cost"
  | "requests"
  | "inputTokens"
  | "outputTokens"
  | "cacheTokens"
  | "successRate"
  | "avgLatency";

export type AnalyticsSummary = {
  activeMembers: number;
  totalMembers: number;
  coverage: number;
  cost: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  successRate: number;
  avgLatency: number;
};

export type AnalyticsDelta = {
  text: string;
  tone: "up" | "down" | "neutral";
};

export type AnalyticsDistributionKind =
  "model" | "member" | "api-key" | "source" | "protocol";

export type AnalyticsDistributionRow = {
  key: string;
  label: string;
  requests: number;
  cost: number;
  requestShare: number;
  costShare: number | null;
  barWidth: number;
};

const ANALYTICS_CUSTOM_RANGE_DAYS = 6;
export const ANALYTICS_SOURCE_LABELS: Record<string, string> = {
  api: "API 调用",
  console: "控制台测试",
  "console-test": "控制台测试",
};

const ANALYTICS_SOURCE_LABEL_KEYS: Record<string, string> = {
  api: "console.enterprise.analytics.sourceApi",
  console: "console.enterprise.analytics.sourceConsole",
  "console-test": "console.enterprise.analytics.sourceConsole",
};

export const ANALYTICS_PROTOCOL_LABELS: Record<string, string> = {
  openai: "OpenAI 兼容",
  anthropic: "Anthropic Messages",
  claude: "Anthropic Messages",
};

const ANALYTICS_PROTOCOL_LABEL_KEYS: Record<string, string> = {
  openai: "console.enterprise.analytics.protocolOpenai",
  anthropic: "console.enterprise.analytics.protocolAnthropic",
  claude: "console.enterprise.analytics.protocolAnthropic",
};

export function defaultAnalyticsFilters(): AnalyticsFilters {
  return { range: "month", startDate: "", endDate: "", memberID: "all" };
}

export function customAnalyticsRangeDefaults(
  now = new Date(),
): Pick<AnalyticsFilters, "startDate" | "endDate"> {
  return {
    startDate: formatLocalDateInput(
      shiftLocalDate(now, -ANALYTICS_CUSTOM_RANGE_DAYS),
    ),
    endDate: formatLocalDateInput(now),
  };
}

export function analyticsQuery(filters: AnalyticsFilters): AnalyticsQuery {
  return {
    range: filters.range,
    start_at:
      filters.range === "custom"
        ? localDateToISOString(filters.startDate)
        : undefined,
    end_at:
      filters.range === "custom"
        ? localDateToISOString(filters.endDate, true)
        : undefined,
    member_id: filters.memberID === "all" ? undefined : filters.memberID,
  };
}

export function previousAnalyticsFilters(
  filters: AnalyticsFilters,
  now = new Date(),
): AnalyticsFilters | null {
  const rangeDays: Record<
    Exclude<AnalyticsRange, "month" | "custom">,
    number
  > = { "7d": 7, "30d": 30 };
  const days = rangeDays[filters.range as keyof typeof rangeDays];
  if (!days) return null;

  // 将可比周期转成后端支持的自定义日期，避免把两个窗口错误地压缩成一个预设范围。
  const currentStart = shiftLocalDate(now, -(days - 1));
  const previousEnd = shiftLocalDate(currentStart, -1);
  const previousStart = shiftLocalDate(previousEnd, -(days - 1));
  return {
    range: "custom",
    startDate: formatLocalDateInput(previousStart),
    endDate: formatLocalDateInput(previousEnd),
    memberID: filters.memberID,
  };
}

function nonNegativeNumber(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function validNumber(value: number | null | undefined): number {
  return value !== null && value !== undefined && Number.isFinite(value)
    ? value
    : 0;
}

function safeCost(value: string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function formatAnalyticsMoney(value: string | null | undefined): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) return "--";
  return formatYuan(value);
}

export function formatAnalyticsNumber(
  value: number | null | undefined,
): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "--"
    : formatCount(Math.max(0, value));
}

export function formatAnalyticsRate(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "--"
    : `${value.toFixed(1)}%`;
}

export function formatAnalyticsSeconds(
  value: number | null | undefined,
): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "--"
    : i18n.t("console.enterprise.analytics.durationSeconds", {
        value: value.toFixed(2),
        defaultValue: `${value.toFixed(2)} 秒`,
      });
}

export function analyticsSummary(
  metrics: EnterpriseUsageMetrics,
  totalMembers = metrics.active_members,
): AnalyticsSummary {
  const activeMembers = nonNegativeNumber(metrics.active_members);
  const normalizedTotalMembers = Math.max(
    activeMembers,
    nonNegativeNumber(totalMembers),
  );
  const requests = nonNegativeNumber(metrics.request_count);
  const successRate =
    metrics.success_rate !== null &&
    metrics.success_rate !== undefined &&
    Number.isFinite(metrics.success_rate)
      ? metrics.success_rate
      : requests > 0
        ? (nonNegativeNumber(metrics.success_count) / requests) * 100
        : 0;
  return {
    activeMembers,
    totalMembers: normalizedTotalMembers,
    coverage:
      normalizedTotalMembers > 0
        ? (activeMembers / normalizedTotalMembers) * 100
        : 0,
    cost: safeCost(metrics.total_cost_yuan),
    requests,
    inputTokens: nonNegativeNumber(metrics.input_tokens),
    outputTokens: nonNegativeNumber(metrics.output_tokens),
    cacheTokens: nonNegativeNumber(metrics.cached_tokens),
    successRate,
    avgLatency: validNumber(metrics.average_latency_ms) / 1000,
  };
}

export function analyticsMetricValue(
  summary: AnalyticsSummary,
  key: AnalyticsMetricKey,
): number {
  return summary[key];
}

export function analyticsTrendValue(
  point: EnterpriseUsageTrendPoint,
  metric: AnalyticsMetric,
): number {
  if (metric === "cost") return safeCost(point.cost_yuan);
  if (metric === "tokens")
    return (
      nonNegativeNumber(point.input_tokens) +
      nonNegativeNumber(point.output_tokens)
    );
  if (metric === "success") {
    const requests = nonNegativeNumber(point.request_count);
    return requests > 0
      ? (nonNegativeNumber(point.success_count) / requests) * 100
      : 0;
  }
  return nonNegativeNumber(point.request_count);
}

export function formatAnalyticsDelta(
  current: number,
  previous: number | null,
  kind: "count" | "cost" | "rate" | "latency",
): AnalyticsDelta {
  if (previous === null)
    return {
      text: i18n.t("console.enterprise.analytics.noComparablePeriod", {
        defaultValue: "—（无可比周期）",
      }),
      tone: "neutral",
    };
  const difference = current - previous;
  const tone = difference > 0 ? "up" : difference < 0 ? "down" : "neutral";
  const sign = difference > 0 ? "+" : difference < 0 ? "-" : "";
  const absoluteDifference = Math.abs(difference);
  let value: string;
  if (kind === "cost")
    value = formatYuan(String(absoluteDifference));
  else if (kind === "rate")
    value = i18n.t("console.enterprise.analytics.percentagePoints", {
      value: absoluteDifference.toFixed(1),
      defaultValue: `${absoluteDifference.toFixed(1)} 个百分点`,
    });
  else if (kind === "latency")
    value = i18n.t("console.enterprise.analytics.durationSeconds", {
      value: absoluteDifference.toFixed(2),
      defaultValue: `${absoluteDifference.toFixed(2)} 秒`,
    });
  else value = formatAnalyticsNumber(absoluteDifference);
  return {
    text: i18n.t("console.enterprise.analytics.periodChange", {
      value: `${sign}${value}`,
      defaultValue: `环比 ${sign}${value}`,
    }),
    tone,
  };
}

export function analyticsDimensionLabel(
  item: EnterpriseDimensionUsage,
  kind: AnalyticsDistributionKind,
): string {
  const rawName = item.name?.trim() || "";
  if (kind === "model") {
    const modelName =
      rawName && rawName !== item.code?.trim()
        ? rawName
        : i18n.t("console.enterprise.analytics.unnamedModel", {
            defaultValue: "未登记模型",
          });
    const alias = item.alias?.trim();
    return alias
      ? i18n.t("console.enterprise.analytics.modelWithAlias", {
          name: modelName,
          alias,
          defaultValue: `${modelName}（${alias}）`,
        })
      : modelName;
  }
  if (kind === "api-key")
    return (
      rawName ||
      i18n.t("console.enterprise.analytics.unnamedKey", {
        defaultValue: "未命名密钥",
      })
    );
  if (kind === "source") {
    const sourceKey = item.code?.trim() || rawName;
    const translationKey = ANALYTICS_SOURCE_LABEL_KEYS[sourceKey];
    return translationKey
      ? i18n.t(translationKey, {
          defaultValue: ANALYTICS_SOURCE_LABELS[sourceKey] || rawName,
        })
      : rawName ||
          i18n.t("console.enterprise.analytics.unknownSource", {
            defaultValue: "未知来源",
          });
  }
  if (kind === "protocol") {
    const protocolKey = item.code?.trim() || rawName;
    const translationKey = ANALYTICS_PROTOCOL_LABEL_KEYS[protocolKey];
    return translationKey
      ? i18n.t(translationKey, {
          defaultValue: ANALYTICS_PROTOCOL_LABELS[protocolKey] || rawName,
        })
      : rawName ||
          i18n.t("console.enterprise.analytics.unknownProtocol", {
            defaultValue: "未知协议",
          });
  }
  return (
    rawName ||
    item.id?.trim() ||
    i18n.t("console.enterprise.analytics.unknownMember", { defaultValue: "未知成员" })
  );
}

export function analyticsDistributionRows(
  items: EnterpriseDimensionUsage[],
  kind: AnalyticsDistributionKind,
): AnalyticsDistributionRow[] {
  const totalRequests = items.reduce(
    (total, item) => total + nonNegativeNumber(item.requests),
    0,
  );
  const totalCost = items.reduce(
    (total, item) => total + safeCost(item.cost_yuan),
    0,
  );
  const maxRequests = Math.max(
    ...items.map((item) => nonNegativeNumber(item.requests)),
    0,
  );
  return items.map((item, index) => {
    const requests = nonNegativeNumber(item.requests);
    const cost = safeCost(item.cost_yuan);
    const key = item.id?.trim() || item.code?.trim() || `${kind}-${index}`;
    return {
      key,
      label: analyticsDimensionLabel(item, kind),
      requests,
      cost,
      requestShare:
        totalRequests > 0 ? Math.round((requests / totalRequests) * 100) : 0,
      costShare: totalCost > 0 ? (cost / totalCost) * 100 : null,
      barWidth:
        maxRequests > 0
          ? Math.max(2, Math.round((requests / maxRequests) * 100))
          : 2,
    };
  });
}

function apiDateOnly(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function appendRangeParams(
  params: URLSearchParams,
  filters: AnalyticsFilters,
  period?: EnterpriseUsagePeriod,
  date?: string,
): void {
  if (date) {
    params.set("range", "custom");
    params.set("startDate", date);
    params.set("endDate", date);
    return;
  }
  if (filters.range === "month") {
    const startDate = apiDateOnly(period?.start_at);
    const endDate = apiDateOnly(period?.end_at);
    if (startDate && endDate) {
      params.set("range", "custom");
      params.set("startDate", startDate);
      params.set("endDate", endDate);
      return;
    }
    params.set("range", "30d");
    return;
  }
  params.set("range", filters.range);
  if (filters.range === "custom") {
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);
  }
}

export function analyticsRecordsPath({
  filters,
  period,
  memberID,
  model,
  apiKeyID,
  source,
  date,
}: {
  filters: AnalyticsFilters;
  period?: EnterpriseUsagePeriod;
  memberID?: string;
  model?: EnterpriseDimensionUsage;
  apiKeyID?: string;
  source?: EnterpriseDimensionUsage;
  date?: string;
}): string {
  const params = new URLSearchParams();
  const selectedMember =
    memberID || (filters.memberID !== "all" ? filters.memberID : "");
  if (selectedMember) params.set("member_id", selectedMember);
  appendRangeParams(params, filters, period, date);
  if (model)
    params.set(
      "model",
      model.alias?.trim() || model.code?.trim() || model.name.trim(),
    );
  if (apiKeyID) params.set("keyId", apiKeyID);
  if (source)
    params.set(
      "source",
      source.code === "console" ? "console-test" : source.code?.trim() || "api",
    );
  params.set("origin", "enterprise-analytics");
  return `/console/records?${params.toString()}`;
}
