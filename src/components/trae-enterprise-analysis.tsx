import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import DatePicker from "@douyinfe/semi-ui/lib/es/datePicker";
import Select from "@douyinfe/semi-ui/lib/es/select";
import Toast from "@douyinfe/semi-ui/lib/es/toast";
import Tooltip from "@douyinfe/semi-ui/lib/es/tooltip";
import { IconFile, IconInfoCircle } from "@douyinfe/semi-icons";
import * as echarts from "echarts/core";
import { LineChart, PieChart } from "echarts/charts";
import { AxisPointerComponent, GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";
import {
  getAllEnterpriseMembers,
  getEnterpriseAnalytics,
  type EnterpriseAnalyticsRequest,
  type EnterpriseAnalyticsDailyUsageTrendPoint,
  type EnterpriseAnalyticsResponse,
  type EnterpriseContext,
  type EnterpriseMember,
} from "@/api/enterprise-console";
import {
  getEnterpriseUsageDepartments,
  type EnterpriseUsageDepartment,
  type EnterpriseUsageDepartmentsRequest,
} from "@/api/enterprise-usage";
import {
  EnterpriseError,
  EnterpriseLoading,
  exportEnterpriseCsv,
  useEnterpriseErrorHandler,
  type EnterpriseRequestError,
} from "@/pages/enterprise-console-shared";
import { useResolvedTheme } from "@/theme";
import { formatCount } from "@/utils/format";
import { getChartRenderer } from "@/components/chart-renderer";
import { addLocalDays as addDays, startOfLocalToday as startOfToday } from "@/utils/date-range";
import "./trae-enterprise-analysis.css";

echarts.use([LineChart, PieChart, GridComponent, TooltipComponent, AxisPointerComponent, CanvasRenderer, SVGRenderer]);

const CHART_COLORS = [
  "#55c7ad",
  "#7b74ff",
  "#f2b74a",
  "#e884b7",
  "#57a8e5",
  "#9f80cf",
  "#707582",
];

export type AnalysisExportState = {
  disabled: boolean;
  run: () => void;
};

type AnalysisProps = {
  context: EnterpriseContext;
  onExportChange?: (state: AnalysisExportState) => void;
};

function dateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function formatAxisDate(value: string): string {
  const [, month = "", day = ""] = value.split("-");
  return `${month}/${day}`;
}

function dailyTrendDate(point: EnterpriseAnalyticsDailyUsageTrendPoint): string | null {
  const value = point.date ?? point.bucket;
  if (!value) return null;
  return String(value).slice(0, 10);
}

function dailyTrendValue(point: EnterpriseAnalyticsDailyUsageTrendPoint): number {
  const directValue = point.active_members
    ?? point.active_member_count
    ?? point.value
    ?? point.total_members
    ?? point.members
    ?? point.count;
  if (directValue != null) return Number(directValue) || 0;
  if (point.total_tokens != null) return Number(point.total_tokens) || 0;
  if (point.request_count != null) return Number(point.request_count) || 0;
  return Number(point.input_tokens ?? 0) + Number(point.output_tokens ?? 0);
}

function getDateKeys(dateRange: Date[]): string[] {
  const start = dateRange[0] ?? addDays(startOfToday(), -30);
  const end = dateRange[1] ?? startOfToday();
  const dates: string[] = [];
  for (let date = new Date(start); date <= end; date = addDays(date, 1)) {
    dates.push(dateKey(date));
  }
  return dates;
}

function getRequestOptions(
  dateRange: Date[],
  memberID: string,
): EnterpriseAnalyticsRequest {
  const start = dateRange[0];
  const end = dateRange[1];
  const options: EnterpriseAnalyticsRequest = {};
  if (memberID && memberID !== "all") options.member_id = memberID;
  if (!start || !end) return { ...options, range: "30d" };

  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (days === 7) return { ...options, range: "7d" };
  if (days === 30) return { ...options, range: "30d" };

  const rangeEnd = new Date(end);
  rangeEnd.setHours(23, 59, 59, 999);
  return {
    ...options,
    range: "custom",
    start_at: start.getTime(),
    end_at: Math.min(Date.now(), rangeEnd.getTime()),
  };
}

function getDepartmentUsageOptions(dateRange: Date[]): Omit<EnterpriseUsageDepartmentsRequest, "page" | "page_size" | "signal"> {
  const start = dateRange[0];
  const end = dateRange[1];
  if (!start || !end) return { range: "30d" };
  const rangeEnd = new Date(end);
  rangeEnd.setHours(23, 59, 59, 999);
  return {
    range: "custom",
    start_at: start.getTime(),
    end_at: Math.min(Date.now(), rangeEnd.getTime()),
  };
}

async function loadAllDepartmentUsage(
  enterpriseID: string,
  dateRange: Date[],
  signal: AbortSignal,
): Promise<EnterpriseUsageDepartment[]> {
  const items: EnterpriseUsageDepartment[] = [];
  const period = getDepartmentUsageOptions(dateRange);
  let page = 1;
  let total = 0;
  do {
    const response = await getEnterpriseUsageDepartments(
      { enterprise_id: enterpriseID },
      { ...period, page, page_size: 100, signal },
    );
    items.push(...(response.items ?? []));
    total = response.total ?? items.length;
    if (response.items.length === 0 || items.length >= total) break;
    page += 1;
  } while (page <= Math.ceil(total / 100));
  return items;
}

function TraeDateRangePicker({
  value,
  onChange,
}: {
  value: Date[];
  onChange: (value: Date[]) => void;
}) {
  const { t } = useTranslation();
  const today = useMemo(startOfToday, []);
  const minDate = useMemo(() => addDays(today, -90), [today]);
  const presets = useMemo(
    () => [
      {
        text: t("traeEnterprise.analysis.datePresets.last7"),
        start: addDays(today, -7),
        end: today,
      },
      {
        text: t("traeEnterprise.analysis.datePresets.last30"),
        start: addDays(today, -30),
        end: today,
      },
      {
        text: t("traeEnterprise.analysis.datePresets.last90"),
        start: minDate,
        end: today,
      },
    ],
    [minDate, t, today],
  );

  function handleChange(nextValue: Date | Date[] | string | string[] | undefined) {
    if (!Array.isArray(nextValue)) return;
    const dates = nextValue.filter((item): item is Date => item instanceof Date);
    if (dates.length === 2) onChange(dates);
  }

  return (
    <DatePicker
      className="trae-date-picker"
      dropdownClassName="trae-date-picker-dropdown"
      type="dateRange"
      value={value}
      format="yyyy-MM-dd"
      rangeSeparator=" ~ "
      presets={presets}
      presetPosition="left"
      showClear={false}
      disabledDate={(date) => !date || date < minDate || date > today}
      onChange={handleChange}
    />
  );
}

function TraeMetricCard({
  label,
  value,
  unit,
  tone = "",
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: string;
}) {
  return (
    <article className={`trae-metric-card${tone ? ` ${tone}` : ""}`}>
      <div className="trae-metric-label is-info-inline">
        <span>{label}</span>
        <Tooltip
          autoAdjustOverflow
          className="app-info-tooltip"
          content={label}
          position="top"
          showArrow={false}
        >
          <span className="trae-metric-info" role="img" tabIndex={0} aria-label={label}>
            <IconInfoCircle className="app-info-icon" aria-hidden="true" />
          </span>
        </Tooltip>
      </div>
      <div className="trae-metric-value-row">
        <strong>{value}</strong>
        {unit ? <span>{unit}</span> : null}
      </div>
    </article>
  );
}

function TraeSection({
  title,
  children,
  className = "",
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`trae-section ${className}`.trim()}>
      <div className="trae-section-heading">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function TraeEmpty({ hint }: { hint?: string }) {
  const { t } = useTranslation();
  return (
    <div className="trae-empty">
      <IconFile aria-hidden="true" />
      <strong>{t("traeEnterprise.common.noData")}</strong>
      <span>{hint ?? t("traeEnterprise.common.noDataHint")}</span>
    </div>
  );
}

function getChartSurfaceColor(node: HTMLElement, theme: string): string {
  const surface = node.closest(".trae-chart-panel");
  const background = surface
    ? getComputedStyle(surface).backgroundColor
    : getComputedStyle(node).backgroundColor;
  return background && background !== "rgba(0, 0, 0, 0)"
    ? background
    : theme === "dark"
      ? "#202124"
      : "#ffffff";
}

function PeopleTrendChart({
  dateRange,
  data,
}: {
  dateRange: Date[];
  data: EnterpriseAnalyticsResponse;
}) {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const chartRef = useRef<HTMLDivElement>(null);
  const trendPoints = useMemo(
    () => data.daily_usage_trend
      .map((point) => ({ point, date: dailyTrendDate(point) }))
      .filter((item): item is { point: EnterpriseAnalyticsDailyUsageTrendPoint; date: string } => Boolean(item.date)),
    [data.daily_usage_trend],
  );
  const dates = useMemo(
    () => trendPoints.length > 0 ? trendPoints.map((item) => item.date) : getDateKeys(dateRange),
    [dateRange, trendPoints],
  );
  const activeValues = useMemo(
    () => trendPoints.length > 0
      ? trendPoints.map((item) => dailyTrendValue(item.point))
      : dates.map(() => 0),
    [dates, trendPoints],
  );
  const seriesName = t("traeEnterprise.analysis.activeMembersCount");

  useEffect(() => {
    const node = chartRef.current;
    if (!node || dates.length === 0) return undefined;
    const chart = echarts.init(node, undefined, { renderer: getChartRenderer() });
    const dark = theme === "dark";
    const gridColor = dark ? "rgba(255,255,255,.1)" : "rgba(23,24,27,.1)";
    const textColor = dark ? "#aeb3bf" : "#5d6470";
    const surfaceColor = getChartSurfaceColor(node, theme);
    const axisStep = Math.max(1, Math.ceil(dates.length / 7));
    chart.setOption({
      animationDuration: 320,
      grid: { left: 0, right: 0, top: 20, bottom: 42, containLabel: true },
      tooltip: {
        trigger: "axis",
        confine: true,
        // 中文：关闭 tooltip 的默认过渡，避免快速移动时浮层出现拖尾。
        transitionDuration: 0,
        axisPointer: {
          type: "cross",
          snap: false,
          animation: false,
          lineStyle: { color: dark ? "#8d93a0" : "#7b838f", width: 1, type: "dashed" },
          crossStyle: { color: dark ? "#8d93a0" : "#7b838f", width: 1, type: "dashed" },
          label: {
            show: true,
            color: dark ? "#f2f4f8" : "#30343b",
            backgroundColor: dark ? "#4b5260" : "#dfe3e8",
          },
        },
        backgroundColor: dark ? "#202124" : "#ffffff",
        borderColor: dark ? "#777b84" : "#d8dadd",
        textStyle: { color: dark ? "#f2f4f8" : "#30343b", fontSize: 12 },
        formatter: (params: unknown) => {
          const item = (Array.isArray(params) ? params[0] : params) as {
            axisValue?: string;
            value?: number;
          };
          return `<div style="font-size:12px;line-height:22px"><div>${item.axisValue ?? ""}</div><div style="display:flex;gap:8px;min-width:190px"><i style="width:8px;height:8px;margin-top:7px;border-radius:50%;background:#24c98b"></i><span style="flex:1">${seriesName}</span><strong>${formatCount(Number(item.value ?? 0))}</strong></div></div>`;
        },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: dates,
        axisLine: { lineStyle: { color: gridColor } },
        axisTick: { show: false },
        axisLabel: {
          color: textColor,
          fontSize: 11,
          interval: 0,
          hideOverlap: true,
          formatter: (value: string, index: number) =>
            index === 0 || index === dates.length - 1 || index % axisStep === 0
              ? formatAxisDate(value)
              : "",
        },
      },
      yAxis: {
        type: "value",
        min: 0,
        minInterval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: textColor, fontSize: 11 },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        {
          type: "line",
          name: seriesName,
          data: activeValues,
          symbol: "circle",
          symbolSize: 8,
          showSymbol: true,
          lineStyle: { width: 1.1, color: "#24c98b" },
          itemStyle: {
            color: surfaceColor,
            borderColor: "#24c98b",
            borderWidth: 1.2,
          },
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
  }, [activeValues, dates, seriesName, t, theme]);

  return (
    <div className="trae-line-chart-wrap">
      <div
        className="trae-line-chart"
        ref={chartRef}
        role="img"
        aria-label={t("traeEnterprise.analysis.trend")}
      />
      <div className="trae-chart-legend" aria-label={t("traeEnterprise.analysis.chartLegend")}>
        <span>
          <i style={{ backgroundColor: "#24c98b" }} />
          {seriesName}
        </span>
      </div>
    </div>
  );
}

function TraeAnalysisRanking({
  title,
  rows,
}: {
  title: string;
  rows: readonly { name: string; count: number }[];
}) {
  const { t } = useTranslation();
  return (
    <TraeSection title={title} className="trae-analysis-ranking-section">
      <div className="trae-analysis-ranking-card">
        {rows.length === 0 ? (
          <TraeEmpty />
        ) : (
          <div className="trae-analysis-ranking-list" role="list" aria-label={title}>
            {rows.map((row, index) => (
              <div className="trae-analysis-ranking-row" key={`${row.name}-${index}`} role="listitem">
                <span className="trae-analysis-ranking-rank" aria-label={`${index + 1}`}>
                  {index + 1}
                </span>
                <span className="trae-analysis-ranking-name" title={row.name}>
                  {row.name}
                </span>
                <span className="trae-analysis-ranking-count">
                  {formatCount(row.count)} {t("traeEnterprise.analysis.countSuffix")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </TraeSection>
  );
}

function ModelPieChart({
  data,
  title,
}: {
  data: EnterpriseAnalyticsResponse["models"];
  title: string;
}) {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const chartRef = useRef<HTMLDivElement>(null);
  const distribution = useMemo(() => {
    const sorted = [...data]
      .filter((item) => item.total_tokens > 0)
      .sort((a, b) => b.total_tokens - a.total_tokens);
    return sorted.map((item) => ({
      name: item.alias || item.name || item.code,
      value: item.total_tokens,
    }));
  }, [data]);
  const total = distribution.reduce((sum, item) => sum + item.value, 0);

  useEffect(() => {
    const node = chartRef.current;
    if (!node || distribution.length === 0) return undefined;
    const chart = echarts.init(node, undefined, { renderer: "svg" });
    const dark = theme === "dark";
    chart.setOption({
      animationDuration: 360,
      tooltip: {
        trigger: "item",
        backgroundColor: "#202124",
        borderColor: "transparent",
        borderWidth: 0,
        textStyle: { color: "#ffffff", fontSize: 13 },
        formatter: (params: unknown) => {
          const item = params as { name?: string; percent?: number };
          return `${item.name ?? ""}: ${Number(item.percent ?? 0).toFixed(2)}%`;
        },
      },
      series: [
        {
          type: "pie",
          radius: ["0%", "74%"],
          center: ["58%", "50%"],
          // Small slices keep their values in the hover tooltip without crowding the chart.
          minShowLabelAngle: 18,
          avoidLabelOverlap: true,
          itemStyle: { borderColor: dark ? "#24262b" : "#ffffff", borderWidth: 2 },
          label: {
            position: "inside",
            color: dark ? "#ffffff" : "#30343b",
            fontSize: 11,
            fontWeight: 600,
            formatter: (params: unknown) => {
              const item = params as { percent?: number };
              const percent = Number(item.percent ?? 0);
              return percent >= 5 ? `${percent.toFixed(2)}%` : "";
            },
          },
          labelLine: {
            show: false,
          },
          data: distribution.map((item, index) => ({
            ...item,
            itemStyle: { color: CHART_COLORS[index % CHART_COLORS.length] },
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
  }, [distribution, theme]);

  if (distribution.length === 0) return <TraeEmpty hint={t("traeEnterprise.analysis.noModels")} />;
  return (
    <div className="trae-analysis-pie-content">
      <div className="trae-analysis-pie-legend" aria-label={title}>
        {distribution.map((item, index) => (
          <div className="trae-analysis-pie-legend-item" key={item.name}>
            <i style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
            <span title={item.name}>{item.name}</span>
            <b>{total > 0 ? `${((item.value / total) * 100).toFixed(2)}%` : "0%"}</b>
          </div>
        ))}
      </div>
      <div
        className="trae-analysis-pie-chart"
        ref={chartRef}
        role="img"
        aria-label={title}
      />
    </div>
  );
}

function analysisCsvRows(
  data: EnterpriseAnalyticsResponse,
  t: (key: string) => string,
): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [
    [t("traeEnterprise.analysis.people"), t("traeEnterprise.analysis.total"), "", data.metrics.active_members],
  ];
  data.tools.forEach((tool) =>
    rows.push([
      t("traeEnterprise.analysis.mcp"),
      tool.name,
      t("traeEnterprise.analysis.requestCount"),
      tool.request_count,
    ]),
  );
  data.models.forEach((model) =>
    rows.push([
      t("traeEnterprise.analysis.models"),
      model.alias || model.name || model.code,
      t("traeEnterprise.analysis.totalTokens"),
      model.total_tokens,
    ]),
  );
  return rows;
}

export function TraeEnterpriseAnalysis({ context, onExportChange }: AnalysisProps) {
  const { t } = useTranslation();
  const handleError = useEnterpriseErrorHandler();
  const [scope, setScope] = useState("");
  const [dateRange, setDateRange] = useState<Date[]>(() => {
    const today = startOfToday();
    return [addDays(today, -30), today];
  });
  const [members, setMembers] = useState<EnterpriseMember[]>([]);
  const [data, setData] = useState<EnterpriseAnalyticsResponse | null>(null);
  const [departmentUsage, setDepartmentUsage] = useState<EnterpriseUsageDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<EnterpriseRequestError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getAllEnterpriseMembers(
      { enterprise_id: context.id },
      { signal: controller.signal },
    )
      .then(setMembers)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) handleError(reason);
      });
    return () => controller.abort();
  }, [context.id, handleError]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    getEnterpriseAnalytics(
      { enterprise_id: context.id },
      { ...getRequestOptions(dateRange, scope), signal: controller.signal },
    )
      .then((response) => {
        if (active) setData(response);
      })
      .catch((reason: unknown) => {
        if (active && !controller.signal.aborted) setError(handleError(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [context.id, dateRange, handleError, reloadToken, scope]);

  useEffect(() => {
    const controller = new AbortController();
    loadAllDepartmentUsage(context.id, dateRange, controller.signal)
      .then(setDepartmentUsage)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setDepartmentUsage([]);
      });
    return () => controller.abort();
  }, [context.id, dateRange]);

  const exportData = useCallback(() => {
    if (!data) return;
    exportEnterpriseCsv(
      "trae-data-analysis.csv",
      [
        t("traeEnterprise.analysis.csvSection"),
        t("traeEnterprise.analysis.csvName"),
        t("traeEnterprise.analysis.csvDimension"),
        t("traeEnterprise.analysis.csvValue"),
      ],
      analysisCsvRows(data, t),
    );
    Toast.success(t("traeEnterprise.analysis.exportSuccess"));
  }, [data, t]);

  useEffect(() => {
    onExportChange?.({ disabled: !data || loading, run: exportData });
  }, [data, exportData, loading, onExportChange]);

  const metrics = data?.metrics;
  const cumulativeTokens = (metrics?.cumulative_input_tokens ?? 0) + (metrics?.cumulative_output_tokens ?? 0);
  const latestDayTokens = (metrics?.latest_day_input_tokens ?? 0) + (metrics?.latest_day_output_tokens ?? 0);
  const personMetrics = [
    [t("traeEnterprise.analysis.activeMembersCount"), metrics ? formatCount(metrics.active_members) : "--", t("traeEnterprise.analysis.memberUnit")],
    [t("traeEnterprise.analysis.totalMembersCount"), metrics ? formatCount(metrics.total_members) : "--", t("traeEnterprise.analysis.memberUnit")],
    [t("traeEnterprise.analysis.cumulativeTokens"), metrics ? formatCount(cumulativeTokens) : "--", t("traeEnterprise.analysis.tokenUnit")],
    [t("traeEnterprise.analysis.latestDayTokens"), metrics ? formatCount(latestDayTokens) : "--", t("traeEnterprise.analysis.tokenUnit")],
  ];
  const toolRows = (data?.tools ?? [])
    .filter((tool) => !/agent|智能体/i.test(`${tool.id} ${tool.name}`))
    .sort((a, b) => b.request_count - a.request_count)
    .slice(0, 5)
    .map((tool) => ({ name: tool.name, count: tool.request_count }));
  const memberRows = (data?.members ?? [])
    .sort((a, b) => b.request_count - a.request_count)
    .slice(0, 5)
    .map((member) => ({ name: member.name || member.id, count: member.request_count }));

  if (error && !data) {
    return (
      <EnterpriseError
        message={error.message}
        requestId={error.requestId}
        onRetry={() => setReloadToken((value) => value + 1)}
      />
    );
  }
  if (loading && !data) {
    return <EnterpriseLoading label={t("traeEnterprise.analysis.loading")} />;
  }

  return (
    <div className="trae-analysis-content" aria-busy={loading}>
      <div className="trae-toolbar">
        <Select
          aria-label={t("traeEnterprise.analysis.scope")}
          className="trae-select trae-member-select"
          dropdownClassName="trae-select-dropdown trae-member-select-dropdown trae-analysis-member-select-dropdown"
          filter
          searchPosition="dropdown"
          placeholder={t("traeEnterprise.analysis.scope")}
          showClear={Boolean(scope)}
          value={scope || undefined}
          onClear={() => setScope("")}
          onChange={(value) => setScope(String(value ?? ""))}
        >
          <Select.Option value="all">{t("traeEnterprise.analysis.picker.allPeople")}</Select.Option>
          {members.map((member) => (
            <Select.Option key={member.id} value={member.id}>
              {member.display_name || member.masked_contact || member.id}
            </Select.Option>
          ))}
        </Select>
        <TraeDateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {error ? (
        <EnterpriseError
          message={error.message}
          requestId={error.requestId}
          onRetry={() => setReloadToken((value) => value + 1)}
        />
      ) : null}

      <TraeSection title={t("traeEnterprise.analysis.people")}>
        <div className="trae-metric-grid trae-analysis-metric-grid">
          {personMetrics.map(([label, value, unit]) => (
            <TraeMetricCard key={label} label={label} value={value} unit={unit} />
          ))}
        </div>
      </TraeSection>

      <TraeSection title={t("traeEnterprise.analysis.trend")}>
        <div className="trae-chart-panel">
          {data ? <PeopleTrendChart dateRange={dateRange} data={data} /> : <TraeEmpty />}
        </div>
      </TraeSection>

      <TraeSection title={t("traeEnterprise.analysis.core")}>
        <div className="trae-metric-grid trae-metric-grid--three trae-analysis-metric-grid trae-core-metric-grid">
          <TraeMetricCard label={t("traeEnterprise.analysis.peakRpm")} value={metrics ? formatCount(metrics.peak_rpm) : "--"} unit={t("traeEnterprise.analysis.rpmUnit")} />
          <TraeMetricCard label={t("traeEnterprise.analysis.peakTpm")} value={metrics ? formatCount(metrics.peak_tpm) : "--"} unit={t("traeEnterprise.analysis.tpmUnit")} />
          <TraeMetricCard label={t("traeEnterprise.analysis.requestCount")} value={metrics ? formatCount(metrics.request_count) : "--"} unit={t("traeEnterprise.analysis.countSuffix")} />
        </div>
      </TraeSection>

      <div className="trae-analysis-ranking-grid">
        <TraeAnalysisRanking title={t("traeEnterprise.analysis.mcp")} rows={toolRows} />
        <TraeAnalysisRanking title={t("traeEnterprise.analysis.agent")} rows={memberRows} />
      </div>

      <div className="trae-analysis-pie-grid">
        <TraeSection title={t("traeEnterprise.analysis.models")} className="trae-analysis-pie-section">
          {data ? <ModelPieChart data={data.models} title={t("traeEnterprise.analysis.models")} /> : <TraeEmpty />}
        </TraeSection>
        <TraeSection title={t("traeEnterprise.analysis.departments")} className="trae-analysis-pie-section">
          {departmentUsage.length > 0 ? (
            <ModelPieChart
              title={t("traeEnterprise.analysis.departments")}
              data={departmentUsage.map((item) => ({
                alias: item.department_name,
                name: item.department_name,
                code: item.department_id,
                request_count: 0,
                input_tokens: 0,
                output_tokens: 0,
                total_tokens: item.total_tokens,
                cost_yuan: item.cost_yuan,
              }))}
            />
          ) : (
            <div className="trae-analysis-pie-content trae-analysis-pie-empty">
              <TraeEmpty hint={t("traeEnterprise.analysis.noDepartments")} />
            </div>
          )}
        </TraeSection>
      </div>
    </div>
  );
}
