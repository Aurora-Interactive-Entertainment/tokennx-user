import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconRefresh } from "@douyinfe/semi-icons";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import {
  getPersonalUsageErrorMessage,
  getUsageTrend,
  type PersonalUsageContext,
  type UsageTrendResponse,
  type UsageTrendSeriesName,
} from "@/api/personal-usage";
import { dateRangeToTrendQuery } from "./personal-usage-date-picker";
import { useResolvedTheme } from "@/theme";

echarts.use([LineChart, GridComponent, TooltipComponent, SVGRenderer]);

const SERIES_COLORS: Record<UsageTrendSeriesName, string> = {
  requests: "#4f79e8",
  tokens: "#24c98b",
  cost: "#a998ff",
};

export function PersonalUsageTrendChart({
  context,
  dateRange,
}: {
  context: PersonalUsageContext;
  dateRange: Date[];
}) {
  const { t, i18n } = useTranslation();
  const theme = useResolvedTheme();
  const chartRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<UsageTrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const query = useMemo(() => dateRangeToTrendQuery(dateRange), [dateRange]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
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

  const seriesMeta = useMemo(
    () =>
      (["requests", "tokens", "cost"] as const).map((name) => ({
        name,
        label: t(`console.personalUsage.trendSeries.${name}`),
        color: SERIES_COLORS[name],
      })),
    [t],
  );

  useEffect(() => {
    const node = chartRef.current;
    if (!node || !data || data.xAxis.data.length === 0) return undefined;
    const chart = echarts.init(node, undefined, { renderer: "svg" });
    const isDark = theme === "dark";
    const labels = data.xAxis.data.map((timestamp) =>
      new Intl.DateTimeFormat(i18n.language, {
        month: "2-digit",
        day: "2-digit",
        timeZone: "UTC",
      }).format(timestamp),
    );
    const textColor = isDark ? "#aeb3bf" : "#5d6470";
    const gridColor = isDark ? "rgba(255,255,255,.1)" : "rgba(23,24,27,.1)";
    const surface =
      getComputedStyle(node.closest(".personal-usage-chart-panel") ?? node)
        .backgroundColor || (isDark ? "#202124" : "#ffffff");
    const values = new Map(
      data.series.map((series) => [series.name, series.data]),
    );
    chart.setOption({
      animationDuration: 320,
      // The chart panel owns horizontal padding; containLabel reserves only the
      // space required by the left and right value-axis labels.
      grid: { left: 0, right: 0, top: 22, bottom: 42, containLabel: true },
      tooltip: {
        trigger: "axis",
        confine: true,
        backgroundColor: isDark ? "#202124" : "#ffffff",
        borderColor: isDark ? "#777b84" : "#d8dadd",
        borderWidth: 1,
        padding: [10, 12],
        textStyle: { color: isDark ? "#f2f4f8" : "#30343b", fontSize: 12 },
        formatter: (params: unknown) => {
          const items = (Array.isArray(params) ? params : [params]) as Array<{
            dataIndex?: number;
          }>;
          const index = items[0]?.dataIndex ?? 0;
          const date = new Intl.DateTimeFormat(i18n.language, {
            dateStyle: "medium",
            timeZone: "UTC",
          }).format(data.xAxis.data[index]);
          return `<div style="font-size:12px;line-height:24px"><div>${date}</div>${seriesMeta.map((series) => `<div style="display:flex;gap:8px;min-width:190px"><i style="width:8px;height:8px;margin-top:8px;border-radius:50%;background:${series.color}"></i><span style="flex:1">${series.label}</span><strong>${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: series.name === "cost" ? 6 : 0 }).format(values.get(series.name)?.[index] ?? 0)}</strong></div>`).join("")}</div>`;
        },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: labels,
        axisLine: { lineStyle: { color: gridColor } },
        axisTick: { show: false },
        axisLabel: { color: textColor, fontSize: 11, hideOverlap: true },
      },
      yAxis: [
        {
          type: "value",
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: textColor, fontSize: 11 },
          splitLine: { lineStyle: { color: gridColor } },
        },
        {
          type: "value",
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: textColor, fontSize: 11 },
          splitLine: { show: false },
        },
      ],
      series: seriesMeta.map((series) => ({
        type: "line",
        name: series.label,
        data: values.get(series.name) ?? [],
        yAxisIndex: series.name === "cost" ? 1 : 0,
        symbol: "circle",
        symbolSize: 6,
        showSymbol: true,
        lineStyle: { width: 1.2, color: series.color },
        itemStyle: {
          color: surface,
          borderColor: series.color,
          borderWidth: 1.2,
        },
        emphasis: { scale: true },
      })),
    });
    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => chart.resize())
        : null;
    resizeObserver?.observe(node);
    return () => {
      resizeObserver?.disconnect();
      chart.dispose();
    };
  }, [data, i18n.language, seriesMeta, theme]);

  return (
    <div className="personal-usage-line-wrap">
      <div className="personal-usage-line-chart-shell">
        {loading ? (
          <div className="personal-usage-chart-status" role="status">
            <span className="console-loading-spinner" />
            {t("console.personalUsage.trendLoading")}
          </div>
        ) : error ? (
          <div className="personal-usage-chart-status" role="alert">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              <IconRefresh aria-hidden="true" />
              {t("console.personalUsage.retry")}
            </button>
          </div>
        ) : null}
        <div
          className="personal-usage-line-chart"
          ref={chartRef}
          role="img"
          aria-label={t("console.personalUsage.trend")}
        />
      </div>
      <div
        className="personal-usage-chart-legend"
        aria-label={t("console.personalUsage.legend")}
      >
        {seriesMeta.map((series) => (
          <span key={series.name}>
            <i style={{ backgroundColor: series.color }} />
            {series.label}
          </span>
        ))}
      </div>
    </div>
  );
}
