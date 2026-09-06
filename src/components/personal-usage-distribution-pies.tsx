import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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

// 中文：后端不同版本可能将计数序列化为数字或数字字符串，统一转换后再交给图表。
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

// 中文：兼容接口返回的数组和键值对象，并统一为 ECharts 所需的数据项格式。
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
  // 中文：兼容接口返回 { items/data/distribution: [...] } 的包装结构。
  for (const key of DISTRIBUTION_WRAPPER_KEYS) {
    if (objectValue[key] !== undefined)
      return distributionEntries(objectValue[key]);
  }
  const directEntry = distributionEntry(objectValue, 0);
  if (directEntry) return [directEntry];
  // 中文：兼容以工具 ID 为键、值为计数或明细对象的映射结构。
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

// 中文：从单条明细中提取名称和计数，统一供数组和对象映射复用。
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
  const count = DISTRIBUTION_VALUE_KEYS.map((key) =>
    distributionNumber(item[key]),
  ).find((candidate): candidate is number => candidate !== null);
  if (count === undefined || count <= 0) return null;
  const requestCount = distributionMetric(item, DISTRIBUTION_REQUEST_KEYS);
  const totalTokens = distributionMetric(item, DISTRIBUTION_TOKEN_KEYS);
  return {
    name,
    value: count,
    ...(requestCount !== undefined ? { requestCount } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  };
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
    // 中文：每次主题或数据变化都重建图表，清理旧实例避免 SVG 节点和监听器泄漏。
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
          // 中文：环形图在独立网格列内居中并限制半径，避免右侧超出卡片被裁切。
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
        ) : error ? (
          <div className="personal-usage-pie-status" role="alert">
            {error}
          </div>
        ) : data.length === 0 ? (
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
  const [data, setData] = useState<UsageTrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const query = useMemo(() => dateRangeToTrendQuery(dateRange), [dateRange]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    // 中文：模型与调用来源分布由趋势接口返回，必须与趋势图使用同一工作空间和时间范围。
    void getUsageTrend(context, query, controller.signal)
      .then(setData)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(getPersonalUsageErrorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [context, query, reloadKey]);

  const modelDistribution = useMemo(
    () => distributionEntries(data?.model_distribution),
    [data?.model_distribution],
  );
  const toolDistribution = useMemo(
    () => distributionEntries(data?.tool_distribution),
    [data?.tool_distribution],
  );
  const retry = () => setReloadKey((value) => value + 1);

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
      {error ? (
        <button
          className="personal-usage-pie-retry"
          type="button"
          onClick={retry}
        >
          {t("console.personalUsage.retry")}
        </button>
      ) : null}
    </div>
  );
}
