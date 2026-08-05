import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { EnterpriseUsageTrendPoint } from "@/api/enterprise-console";
import {
  analyticsTrendValue,
  formatAnalyticsNumber,
  formatAnalyticsMoney,
  type AnalyticsMetric,
} from "@/pages/enterprise-analytics-helpers";
import { formatYuanExact } from "@/utils/format";

const TREND_CHART_WIDTH = 760;
const TREND_CHART_HEIGHT = 200;
const TREND_PADDING_LEFT = 52;
const TREND_PADDING_RIGHT = 16;
const TREND_PADDING_TOP = 14;
const TREND_PADDING_BOTTOM = 30;
const TREND_MAX_X_LABELS = 7;

const TREND_COLORS: Record<AnalyticsMetric, string> = {
  requests: "#60a5fa",
  cost: "#34d399",
  tokens: "#fb923c",
  success: "#a78bfa",
};

const TREND_LABEL_KEYS: Record<AnalyticsMetric, string> = {
  requests: "console.enterprise.analytics.requests",
  cost: "console.enterprise.analytics.cost",
  tokens: "console.common.output",
  success: "console.enterprise.analytics.successRate",
};

type EnterpriseAnalyticsTrendChartProps = {
  data: EnterpriseUsageTrendPoint[];
  metric: AnalyticsMetric;
  recordsPath: (date: string) => string;
};

function axisValue(value: number, metric: AnalyticsMetric): string {
  if (metric === "cost") return formatAnalyticsMoney(String(value));
  if (metric === "success") return `${Math.round(value)}%`;
  return value >= 1000
    ? `${(value / 1000).toFixed(1)}k`
    : formatAnalyticsNumber(value);
}

export function EnterpriseAnalyticsTrendChart({
  data,
  metric,
  recordsPath,
}: EnterpriseAnalyticsTrendChartProps) {
  const { t } = useTranslation();
  if (!data.length)
    return <p className="analytics-chart-empty">{t("console.enterprise.analytics.noTrend")}</p>;

  const chartWidth =
    TREND_CHART_WIDTH - TREND_PADDING_LEFT - TREND_PADDING_RIGHT;
  const chartHeight =
    TREND_CHART_HEIGHT - TREND_PADDING_TOP - TREND_PADDING_BOTTOM;
  const values = data.map((point) => analyticsTrendValue(point, metric));
  const maximum = metric === "success" ? 100 : Math.max(...values, 1);
  const xPosition = (index: number): number =>
    TREND_PADDING_LEFT +
    (data.length < 2
      ? chartWidth / 2
      : (index / (data.length - 1)) * chartWidth);
  const yPosition = (value: number): number =>
    TREND_PADDING_TOP +
    chartHeight -
    Math.max(0, Math.min(1, value / maximum)) * chartHeight;
  const points = data.map((point, index) => ({
    x: xPosition(index),
    y: yPosition(analyticsTrendValue(point, metric)),
    point,
  }));
  const pointString = points
    .map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" L ");
  const areaPath = `M ${xPosition(0).toFixed(1)},${(TREND_PADDING_TOP + chartHeight).toFixed(1)} L ${pointString} L ${xPosition(data.length - 1).toFixed(1)},${(TREND_PADDING_TOP + chartHeight).toFixed(1)} Z`;
  const linePath = `M ${pointString}`;
  const color = TREND_COLORS[metric];
  const gradientID = `enterprise-analytics-trend-${metric}`;
  const labelStep = Math.max(1, Math.ceil(data.length / TREND_MAX_X_LABELS));

  return (
    <div
      className="analytics-trend-chart"
      data-testid="usage-trend-chart"
      data-metric={metric}
    >
      <svg
        viewBox={`0 0 ${TREND_CHART_WIDTH} ${TREND_CHART_HEIGHT}`}
        role="img"
        aria-label={t("console.enterprise.analytics.trendChart", {
          metric: t(TREND_LABEL_KEYS[metric]),
        })}
      >
        <defs>
          <linearGradient id={gradientID} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = TREND_PADDING_TOP + chartHeight * (1 - ratio);
          return (
            <line
              key={ratio}
              x1={TREND_PADDING_LEFT}
              y1={y}
              x2={TREND_CHART_WIDTH - TREND_PADDING_RIGHT}
              y2={y}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="1"
            />
          );
        })}
        <path d={areaPath} fill={`url(#${gradientID})`} />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map(({ point, x }, index) => {
          const left =
            index === 0 ? TREND_PADDING_LEFT : (points[index - 1].x + x) / 2;
          const right =
            index === points.length - 1
              ? TREND_PADDING_LEFT + chartWidth
              : (x + points[index + 1].x) / 2;
          const label = metric === "cost"
            ? t("console.enterprise.analytics.viewDateCostRecords", {
                date: point.date,
                cost: formatYuanExact(point.cost_yuan),
              })
            : t("console.enterprise.analytics.viewDateRecords", { date: point.date });
          return (
            <Link
              className="analytics-trend-hit-area"
              aria-label={label}
              key={point.date}
              to={recordsPath(point.date)}
            >
              <title>{label}</title>
              <rect
                x={left}
                y={TREND_PADDING_TOP}
                width={right - left}
                height={chartHeight}
                fill="transparent"
              />
            </Link>
          );
        })}
        {data.length <= 14
          ? points.map(({ x, y, point }) => (
              <circle
                cx={x}
                cy={y}
                fill={color}
                key={point.date}
                r="3.5"
                stroke="rgba(0,0,0,0.4)"
                strokeWidth="1.5"
              />
            ))
          : null}
        {data.map((point, index) => {
          if (index % labelStep !== 0 && index !== data.length - 1) return null;
          return (
            <text
              fill="rgba(255,255,255,0.35)"
              fontSize="10"
              key={point.date}
              textAnchor="middle"
              x={xPosition(index)}
              y={TREND_CHART_HEIGHT - 5}
            >
              {point.date.slice(5)}
            </text>
          );
        })}
        {[0, 0.5, 1].map((ratio) => {
          const value = maximum * ratio;
          const y = TREND_PADDING_TOP + chartHeight * (1 - ratio) + 4;
          return (
            <text
              fill="rgba(255,255,255,0.35)"
              fontSize="10"
              key={ratio}
              textAnchor="end"
              x={TREND_PADDING_LEFT - 6}
              y={y}
            >
              {axisValue(value, metric)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
