import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";
import { useResolvedTheme } from "@/theme";
import type { InvitationTrendPoint } from "@/api/invitation";
import "./invitation-trend-chart.css";
import { getChartRenderer } from "@/components/chart-renderer";

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer, SVGRenderer]);

const SERIES = [
  { key: "effective_invites", color: "#5fbf98", labelKey: "effectiveInvites" },
  { key: "visits", color: "#7188e8", labelKey: "dailyVisits" },
  { key: "reward", color: "#d49a52", labelKey: "rewardAmount" },
] as const;

function pointValue(
  point: InvitationTrendPoint,
  key: (typeof SERIES)[number]["key"],
): number {
  if (key === "effective_invites")
    return (
      point.effective_invites ?? point.valid_invites ?? point.invited_count ?? 0
    );
  if (key === "visits") return point.visits ?? point.visit_count ?? 0;
  const value = Number(
    point.reward_yuan ??
      point.reward_amount_yuan ??
      point.earnings_yuan ??
      point.reward_amount ??
      0,
  );
  return Number.isFinite(value) ? value : 0;
}

export function InvitationTrendChart({
  points,
}: {
  points: InvitationTrendPoint[];
}) {
  const { i18n, t } = useTranslation();
  const theme = useResolvedTheme();
  const chartRef = useRef<HTMLDivElement>(null);
  const labels = useMemo(
    () =>
      points.map((point) =>
        new Intl.DateTimeFormat(i18n.language, {
          month: "2-digit",
          day: "2-digit",
          timeZone: "UTC",
        }).format(new Date(point.date)),
      ),
    [i18n.language, points],
  );

  useEffect(() => {
    const node = chartRef.current;
    if (!node || points.length === 0) return undefined;
    const chart = echarts.init(node, undefined, { renderer: getChartRenderer() });
    const dark = theme === "dark";
    const textColor = dark ? "#aeb3bf" : "#68717d";
    const gridColor = dark ? "rgba(255,255,255,.1)" : "rgba(23,24,27,.1)";
    const surface =
      getComputedStyle(node.closest(".invite-trend-card") ?? node)
        .backgroundColor || (dark ? "#202124" : "#fff");
    // 中文：使用 SVG 渲染，确保深浅色切换和高分屏下的折线图保持清晰。
    chart.setOption({
      animationDuration: 260,
      grid: { left: 8, right: 8, top: 18, bottom: 30, containLabel: true },
      tooltip: {
        trigger: "axis",
        confine: true,
        // 中文：关闭默认浮层过渡，避免鼠标快速移动时 tooltip 滞后。
        transitionDuration: 0,
        axisPointer: {
          type: "cross",
          snap: false,
          animation: false,
          lineStyle: {
            type: "dashed",
            width: 1,
            color: dark ? "#aeb3bf" : "#68717d",
          },
          crossStyle: {
            type: "dashed",
            width: 1,
            color: dark ? "#aeb3bf" : "#68717d",
          },
          label: {
            show: true,
            backgroundColor: dark ? "#53699b" : "#7188e8",
            color: "#fff",
          },
        },
        backgroundColor: dark ? "#202124" : "#fff",
        borderColor: dark ? "#777b84" : "#d8dadd",
        borderWidth: 1,
        textStyle: { color: dark ? "#f2f4f8" : "#30343b", fontSize: 12 },
        formatter: (params: unknown) => {
          const index = (Array.isArray(params) ? params[0] : params) as {
            dataIndex?: number;
          };
          const point = points[index?.dataIndex ?? 0];
          return `<div>${labels[index?.dataIndex ?? 0] ?? ""}</div>${SERIES.map((series) => `<div style="display:flex;gap:8px;min-width:150px"><i style="width:8px;height:8px;margin-top:6px;border-radius:50%;background:${series.color}"></i><span style="flex:1">${t(`console.invitations.${series.labelKey}`)}</span><strong>${pointValue(point, series.key)}</strong></div>`).join("")}`;
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
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: textColor, fontSize: 11 },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: SERIES.map((series) => ({
        type: "line",
        name: t(`console.invitations.${series.labelKey}`),
        data: points.map((point) => pointValue(point, series.key)),
        smooth: true,
        symbol: "circle",
        symbolSize: 5,
        lineStyle: { width: 2, color: series.color },
        itemStyle: {
          color: surface,
          borderColor: series.color,
          borderWidth: 2,
        },
        emphasis: { scale: true },
      })),
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
  }, [labels, points, t, theme]);

  return (
    <div className="invite-trend-chart-wrap">
      {points.length === 0 ? (
        <div className="invite-trend-empty">
          {t("console.invitations.noTrend")}
        </div>
      ) : (
        <div
          className="invite-trend-chart"
          ref={chartRef}
          role="img"
          aria-label={t("console.invitations.trend")}
        />
      )}
      <div
        className="invite-trend-legend"
        aria-label={t("console.invitations.trendLegend")}
      >
        {SERIES.map((series) => (
          <span key={series.key}>
            <i style={{ backgroundColor: series.color }} />
            {t(`console.invitations.${series.labelKey}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
