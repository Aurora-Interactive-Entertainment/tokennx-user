import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { appToast } from "@/components/app-toast";
import * as echarts from "echarts/core";
import { PieChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";
import {
  getPersonalUsageErrorMessage,
  getUsageTrend,
  type PersonalUsageContext,
  type UsageTrendResponse,
} from "@/api/personal-usage";
import { MODEL_CHART_COLORS } from "@/components/chart-colors";
import { useResolvedTheme } from "@/theme";
import i18n from "@/i18n";
import { dateRangeToTrendQuery } from "./personal-usage-date-picker";
import "./personal-usage-distribution-pies.css";

echarts.use([PieChart, TooltipComponent, CanvasRenderer, SVGRenderer]);

export type DistributionEntry = {
  name: string;
  value: number;
  requestCount?: number;
  totalTokens?: number;
};
const DISTRIBUTION_NAME_KEYS = [
  "name",
  "label",
  "model",
  "model_name",
  "tool",
  "tool_name",
  "client",
  "client_tool",
  "client_tool_name",
  "source",
  "source_name",
  "code",
] as const;
const DISTRIBUTION_VALUE_KEYS = [
  "value",
  "count",
  "total_tokens",
  "tokens",
  "request_count",
  "total_count",
  "requests",
  "total",
  "usage",
  "amount",
] as const;
const DISTRIBUTION_REQUEST_KEYS = [
  "request_count",
  "requests",
  "total_count",
  "count",
  "value",
] as const;
const DISTRIBUTION_TOKEN_KEYS = [
  "total_tokens",
  "tokens",
  "token_count",
] as const;
const DISTRIBUTION_WRAPPER_KEYS = [
  "items",
  "data",
  "distribution",
  "values",
  "tool_distribution",
  "model_distribution",
] as const;

// 后端不同版本可能将计数序列化为数字或数字字符串，统一转换后再交给图表。
function distributionNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function distributionMetric(
  item: Record<string, unknown>,
  keys: readonly string[],
): number | undefined {
  const value = keys.map((key) => distributionNumber(item[key])).find(
    (candidate): candidate is number => candidate !== null,
  );
  return value === undefined ? undefined : value;
}

// 新版趋势接口按 metric 只返回一组指标；Token 明细由三类 Token 字段相加得到。
function distributionTokenTotal(item: Record<string, unknown>): number | undefined {
  const values = [item.input_tokens, item.output_tokens, item.cached_tokens]
    .map(distributionNumber);
  if (values.some((value) => value !== null)) {
    const numericValues = values.filter((value): value is number => value !== null);
    return numericValues.reduce((sum, value) => sum + value, 0);
  }
  return distributionMetric(item, DISTRIBUTION_TOKEN_KEYS);
}

function distributionValue(item: Record<string, unknown>): number | undefined {
  // 保留旧接口中 total_tokens/value 优先的行为，再兼容新版 tokens/cost 字段。
  const direct = distributionMetric(item, DISTRIBUTION_VALUE_KEYS);
  if (direct !== undefined) return direct;
  const tokenTotal = distributionTokenTotal(item);
  if (tokenTotal !== undefined) return tokenTotal;
  const cost = distributionNumber(item.cost_yuan);
  return cost === null ? undefined : cost;
}

// 兼容接口返回的数组和键值对象，并统一为 ECharts 所需的数据项格式。
export function distributionEntries(value: unknown): DistributionEntry[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item, index) => distributionEntry(item, index))
      .filter((item): item is DistributionEntry => item !== null)
      .sort((left, right) => right.value - left.value);
  }
  if (typeof value !== "object") return [];
  const objectValue = value as Record<string, unknown>;
  // 兼容接口返回 { items/data/distribution: [...] } 的包装结构。
  for (const key of DISTRIBUTION_WRAPPER_KEYS) {
    if (objectValue[key] !== undefined)
      return distributionEntries(objectValue[key]);
  }
  const directEntry = distributionEntry(objectValue, 0);
  if (directEntry) return [directEntry];
  // 兼容以工具 ID 为键、值为计数或明细对象的映射结构。
  return Object.entries(objectValue)
    .flatMap(([name, item], index) => {
      const nestedObject =
        item && typeof item === "object" && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : null;
      const hasOwnName = nestedObject
        ? DISTRIBUTION_NAME_KEYS.some(
            (key) =>
              typeof nestedObject[key] === "string" &&
              String(nestedObject[key]).trim().length > 0,
          )
        : false;
      const nestedEntry = distributionEntry(
        nestedObject
          ? { ...nestedObject, ...(hasOwnName ? {} : { name }) }
          : { name, value: item },
        index,
      );
      return nestedEntry ? [nestedEntry] : [];
    })
    .sort((left, right) => right.value - left.value);
}

// 从单条明细中提取名称和计数，统一供数组和对象映射复用。
function distributionEntry(
  value: unknown,
  index: number,
): DistributionEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const name =
    DISTRIBUTION_NAME_KEYS.map((key) => item[key])
      .find(
        (candidate): candidate is string =>
          typeof candidate === "string" && candidate.trim().length > 0,
      )
      ?.trim() || "item-" + (index + 1);
  const count = distributionValue(item);
  if (count === undefined || count <= 0) return null;
  const requestCount = distributionMetric(item, DISTRIBUTION_REQUEST_KEYS);
  const totalTokens = distributionTokenTotal(item);
  return {
    name,
    value: count,
    ...(requestCount !== undefined ? { requestCount } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  };
}

/**
 * 将 requests 与 tokens 两次趋势响应按名称合并，保证图表值和明细列使用各自准确口径。
 * 服务端可能只在某一口径中返回某个维度，因此这里取两个响应的并集。
 */
export function mergeDistributionEntries(
  requestValue: unknown,
  tokenValue: unknown,
): DistributionEntry[] {
  const requests = distributionEntries(requestValue);
  const tokens = distributionEntries(tokenValue);
  const requestMap = new Map(requests.map((item) => [item.name, item]));
  const tokenMap = new Map(tokens.map((item) => [item.name, item]));
  const names = new Set([...requestMap.keys(), ...tokenMap.keys()]);
  return [...names]
    .map((name) => {
      const request = requestMap.get(name);
      const token = tokenMap.get(name);
      const value = request?.value ?? token?.value ?? 0;
      const requestCount = request?.requestCount ?? request?.value;
      const totalTokens = token?.totalTokens ?? token?.value;
      return {
        name,
        value,
        ...(requestCount !== undefined ? { requestCount } : {}),
        ...(totalTokens !== undefined ? { totalTokens } : {}),
      };
    })
    .filter((item) => item.value > 0 || (item.totalTokens ?? 0) > 0)
    .sort((left, right) => right.value - left.value);
}

function formatDistributionMetric(value: number | undefined, suffix = ""): string {
  if (value === undefined || !Number.isFinite(value)) return "--";
  if (suffix === "token") {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  }
  return new Intl.NumberFormat(i18n.language).format(value);
}

function DistributionPie({
  title,
  id,
  data,
  loading,
  error,
  nameLabel,
  requestLabel,
  tokenLabel,
}: {
  title: string;
  id: string;
  data: DistributionEntry[];
  loading: boolean;
  error: string;
  nameLabel: string;
  requestLabel: string;
  tokenLabel: string;
}) {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = chartRef.current;
    if (!node || data.length === 0) return undefined;
    // 每次主题或数据变化都重建图表，清理旧实例避免 SVG 节点和监听器泄漏。
    const chart = echarts.init(node, undefined, { renderer: "svg" });
    const dark = theme === "dark";
    chart.setOption({
      animationDuration: 360,
      tooltip: {
        trigger: "item",
        backgroundColor: dark ? "#202124" : "#ffffff",
        borderColor: dark ? "#777b84" : "#d8dadd",
        textStyle: { color: dark ? "#ffffff" : "#30343b", fontSize: 12 },
        formatter: (params: unknown) => {
          const item = params as { name?: string; percent?: number };
          return (
            (item.name ?? "") +
            ": " +
            Number(item.percent ?? 0).toFixed(2) +
            "%"
          );
        },
      },
      series: [
        {
          type: "pie",
          // 环形图在独立网格列内居中并限制半径，避免右侧超出卡片被裁切。
          radius: ["40%", "65%"],
          center: ["50%", "50%"],
          avoidLabelOverlap: true,
          itemStyle: {
            borderColor: dark ? "#24262b" : "#ffffff",
            borderWidth: 2,
          },
          label: { show: false },
          labelLine: { show: false },
          data: data.map((item, index) => ({
            ...item,
            itemStyle: {
              color: MODEL_CHART_COLORS[index % MODEL_CHART_COLORS.length],
            },
          })),
        },
      ],
    });
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => chart.resize())
        : null;
    observer?.observe(node);
    return () => {
      observer?.disconnect();
      chart.dispose();
    };
  }, [data, theme]);

  return (
    <section className="personal-usage-pie-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <div className="personal-usage-pie-content">
        {loading ? (
          <div className="personal-usage-pie-status" role="status">
            {t("console.personalUsage.loading")}
          </div>
        ) : error ? null : data.length === 0 ? (
          <div className="personal-usage-pie-status">
            {t("console.personalUsage.noDistribution")}
          </div>
        ) : (
          <>
            <div className="personal-usage-pie-legend" aria-label={title}>
              <div className="personal-usage-pie-legend-header" aria-hidden="true">
                <span>{nameLabel}</span>
                <span>{requestLabel}</span>
                <span>{tokenLabel}</span>
              </div>
              {data.map((item, index) => (
                <div
                  className="personal-usage-pie-legend-item"
                  key={item.name + "-" + index}
                >
                  <span className="personal-usage-pie-legend-name">
                    <i
                      style={{
                        backgroundColor:
                          MODEL_CHART_COLORS[index % MODEL_CHART_COLORS.length],
                      }}
                    />
                    <span title={item.name}>{item.name}</span>
                  </span>
                  <b>{formatDistributionMetric(item.requestCount)}</b>
                  <b>{formatDistributionMetric(item.totalTokens, "token")}</b>
                </div>
              ))}
            </div>
            <div
              className="personal-usage-pie-chart"
              ref={chartRef}
              role="img"
              aria-label={title}
            />
          </>
        )}
      </div>
    </section>
  );
}

export function PersonalUsageDistributionPies({
  context,
  dateRange,
}: {
  context: PersonalUsageContext;
  dateRange: Date[];
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<{
    requests: UsageTrendResponse;
    tokens: UsageTrendResponse;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const query = useMemo(() => dateRangeToTrendQuery(dateRange), [dateRange]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    // 新版接口按 metric 返回单一分布口径，同时请求 requests/tokens 以完整填充列表。
    void Promise.all([
      getUsageTrend(context, { ...query, metric: "requests" }, controller.signal),
      getUsageTrend(context, { ...query, metric: "tokens" }, controller.signal),
    ])
      .then(([requests, tokens]) => setData({ requests, tokens }))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(getPersonalUsageErrorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [context, query]);

  useEffect(() => {
    if (!loading && error) appToast.error(error);
  }, [error, loading]);

  const modelDistribution = useMemo(
    () => mergeDistributionEntries(
      data?.requests.model_distribution,
      data?.tokens.model_distribution,
    ),
    [data?.requests.model_distribution, data?.tokens.model_distribution],
  );
  const toolDistribution = useMemo(
    () => mergeDistributionEntries(
      data?.requests.tool_distribution,
      data?.tokens.tool_distribution,
    ),
    [data?.requests.tool_distribution, data?.tokens.tool_distribution],
  );
  return (
    <div className="personal-usage-pie-grid">
      <DistributionPie
        title={t("console.personalUsage.pie.models")}
        id="personal-usage-model-pie"
        data={modelDistribution}
        loading={loading}
        error={error}
        nameLabel={t("console.personalUsage.pie.model")}
        requestLabel={t("console.personalUsage.pie.requests")}
        tokenLabel={t("console.personalUsage.pie.tokens")}
      />
      <DistributionPie
        title={t("console.personalUsage.pie.sources")}
        id="personal-usage-source-pie"
        data={toolDistribution}
        loading={loading}
        error={error}
        nameLabel={t("console.personalUsage.pie.source")}
        requestLabel={t("console.personalUsage.pie.requests")}
        tokenLabel={t("console.personalUsage.pie.tokens")}
      />
    </div>
  );
}
