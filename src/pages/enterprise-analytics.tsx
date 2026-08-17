import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import i18n from "@/i18n";
import { MoneyText } from "@/components/money";
import type {
  EnterpriseAnalyticsResponse,
  EnterpriseContext,
  EnterpriseDimensionUsage,
} from "@/api/enterprise-console";
import { getEnterpriseAnalytics } from "@/api/enterprise-console";
import { AnalyticsTimeRangePicker } from "@/components/analytics-time-range-picker";
import { EnterpriseAnalyticsTrendChart } from "@/components/enterprise-analytics-trend-chart";
import { CompatSelect as Select } from "@/components/semi-compat";
import {
  ANALYTICS_METRIC_OPTIONS,
  analyticsDimensionLabel,
  analyticsDistributionRows,
  analyticsMetricValue,
  analyticsQuery,
  analyticsRecordsPath,
  analyticsSummary,
  defaultAnalyticsFilters,
  formatAnalyticsDelta,
  formatAnalyticsNumber,
  formatAnalyticsRate,
  formatAnalyticsSeconds,
  previousAnalyticsFilters,
  type AnalyticsDistributionKind,
  type AnalyticsFilters,
  type AnalyticsMetric,
} from "./enterprise-analytics-helpers";
import {
  EnterpriseError,
  EnterpriseLoading,
  EnterprisePageShell,
  EnterpriseValidationError,
  exportEnterpriseCsv,
  formatEnterpriseTime,
  useEnterpriseErrorHandler,
  validateEnterpriseDateRange,
} from "./enterprise-console-shared";

const ANALYTICS_METRIC_LABELS: Record<AnalyticsMetric, string> = {
  requests: "console.enterprise.analytics.requests",
  cost: "console.enterprise.analytics.cost",
  tokens: "console.common.output",
  success: "console.enterprise.analytics.successRate",
};

type AnalyticsMetricCardProps = {
  label: string;
  value: ReactNode;
  current: number;
  previous: number | null;
  kind: "count" | "cost" | "rate" | "latency";
};

function AnalyticsMetricDelta({
  current,
  previous,
  kind,
}: Pick<AnalyticsMetricCardProps, "current" | "previous" | "kind">) {
  const delta = formatAnalyticsDelta(current, previous, kind);
  return (
    <div
      className={`analytics-metric-delta${delta.tone === "up" ? " is-up" : delta.tone === "down" ? " is-down" : ""}`}
    >
      {delta.text}
    </div>
  );
}

function AnalyticsMetricCard({
  label,
  value,
  current,
  previous,
  kind,
}: AnalyticsMetricCardProps) {
  return (
    <article className="analytics-metric-card">
      <div className="analytics-metric-label">{label}</div>
      <div className="analytics-metric-value">{value}</div>
      <AnalyticsMetricDelta current={current} previous={previous} kind={kind} />
    </article>
  );
}

function AnalyticsOverview({
  data,
  previousData,
}: {
  data: EnterpriseAnalyticsResponse;
  previousData: EnterpriseAnalyticsResponse | null;
}) {
  const current = analyticsSummary(data.metrics, data.members.length);
  const previous = previousData
    ? analyticsSummary(previousData.metrics, previousData.members.length)
    : null;
  const previousValue = (
    key: Parameters<typeof analyticsMetricValue>[1],
  ): number | null => (previous ? analyticsMetricValue(previous, key) : null);
  return (
    <section
      className="analytics-overview"
      aria-labelledby="analytics-overview-title"
    >
      <h2 className="analytics-section-title" id="analytics-overview-title">
        {i18n.t('console.enterprise.analytics.overview')}
      </h2>
      <div className="analytics-primary-metrics">
        <AnalyticsMetricCard
          label={i18n.t('console.enterprise.analytics.totalCost')}
          value={<MoneyText value={data.metrics.total_cost_yuan} />}
          current={current.cost}
          previous={previousValue("cost")}
          kind="cost"
        />
        <AnalyticsMetricCard
          label={i18n.t('console.enterprise.analytics.requests')}
          value={formatAnalyticsNumber(current.requests)}
          current={current.requests}
          previous={previousValue("requests")}
          kind="count"
        />
      </div>
      <div className="analytics-secondary-metrics">
        <AnalyticsMetricCard
          label={i18n.t('console.enterprise.analytics.memberCoverage')}
          value={i18n.t("console.enterprise.analytics.memberCoverageValue", {
            active: formatAnalyticsNumber(current.activeMembers),
            total: formatAnalyticsNumber(current.totalMembers),
            coverage: current.coverage.toFixed(1),
          })}
          current={current.activeMembers}
          previous={previous ? previous.activeMembers : null}
          kind="count"
        />
        <AnalyticsMetricCard
          label={i18n.t('console.enterprise.analytics.inputTokens')}
          value={formatAnalyticsNumber(current.inputTokens)}
          current={current.inputTokens}
          previous={previousValue("inputTokens")}
          kind="count"
        />
        <AnalyticsMetricCard
          label={i18n.t('console.enterprise.analytics.outputTokens')}
          value={formatAnalyticsNumber(current.outputTokens)}
          current={current.outputTokens}
          previous={previousValue("outputTokens")}
          kind="count"
        />
        <AnalyticsMetricCard
          label={i18n.t('console.enterprise.analytics.cachedTokens')}
          value={formatAnalyticsNumber(current.cacheTokens)}
          current={current.cacheTokens}
          previous={previousValue("cacheTokens")}
          kind="count"
        />
        <AnalyticsMetricCard
          label={i18n.t('console.enterprise.analytics.requestSuccessRate')}
          value={formatAnalyticsRate(current.successRate)}
          current={current.successRate}
          previous={previousValue("successRate")}
          kind="rate"
        />
        <AnalyticsMetricCard
          label={i18n.t('console.enterprise.analytics.averageLatency')}
          value={formatAnalyticsSeconds(current.avgLatency)}
          current={current.avgLatency}
          previous={previousValue("avgLatency")}
          kind="latency"
        />
      </div>
      <p className="analytics-asof-note">
        {i18n.t('console.enterprise.analytics.coverageNote')}
      </p>
    </section>
  );
}

function AnalyticsToolbar({
  data,
  filters,
  onFilterChange,
}: {
  data: EnterpriseAnalyticsResponse | null;
  filters: AnalyticsFilters;
  onFilterChange: (value: AnalyticsFilters) => void;
}) {
  const options = useMemo(() => {
    const values = new Map<string, string>();
    data?.members.forEach((member) => {
      const id = member.id?.trim() || member.code?.trim() || member.name.trim();
      if (id) values.set(id, member.name.trim() || id);
    });
    if (filters.memberID !== "all" && !values.has(filters.memberID))
      values.set(filters.memberID, i18n.t('console.enterprise.analytics.currentMember'));
    return [...values.entries()];
  }, [data, filters.memberID]);

  return (
    <div className="analytics-toolbar">
      <div className="analytics-filter-group">
        <label
          className="analytics-filter-label"
          htmlFor="analytics-member-filter"
        >
          {i18n.t('console.enterprise.analytics.memberScope')}
        </label>
        <Select
          className="analytics-member-filter"
          id="analytics-member-filter"
          value={filters.memberID}
          onChange={(value) =>
            onFilterChange({ ...filters, memberID: String(value) })
          }
          block
        >
          <Select.Option value="all">{i18n.t('console.enterprise.analytics.allMembers')}</Select.Option>
          {options.map(([value, label]) => (
            <Select.Option key={value} value={value}>
              {label}
            </Select.Option>
          ))}
        </Select>
      </div>
      <div className="analytics-filter-group">
        <span className="analytics-filter-label">{i18n.t('console.enterprise.analytics.timeRange')}</span>
        <AnalyticsTimeRangePicker
          value={filters}
          dateRestriction="last-90-days"
          onChange={(value) => onFilterChange({ ...filters, ...value })}
        />
      </div>
    </div>
  );
}

function AnalyticsTrend({
  data,
  metric,
  filters,
  period,
  onMetricChange,
}: {
  data: EnterpriseAnalyticsResponse;
  metric: AnalyticsMetric;
  filters: AnalyticsFilters;
  period: EnterpriseAnalyticsResponse["period"];
  onMetricChange: (value: AnalyticsMetric) => void;
}) {
  return (
    <section
      className="analytics-trend"
      aria-labelledby="analytics-trend-title"
    >
      <div className="analytics-trend-header">
        <h2 className="analytics-section-title" id="analytics-trend-title">
          {i18n.t('console.enterprise.analytics.trend')}
        </h2>
        <div
          className="analytics-trend-tabs"
          role="group"
          aria-label={i18n.t('console.enterprise.analytics.metric')}
        >
          {ANALYTICS_METRIC_OPTIONS.map((value) => (
            <button
              className={metric === value ? "is-active" : ""}
              type="button"
              aria-pressed={metric === value}
              key={value}
              onClick={() => onMetricChange(value)}
            >
              {i18n.t(ANALYTICS_METRIC_LABELS[value])}
            </button>
          ))}
        </div>
      </div>
      <div className="analytics-trend-chart-frame">
        <EnterpriseAnalyticsTrendChart
          data={data.trend}
          metric={metric}
          recordsPath={(date) =>
            analyticsRecordsPath({ filters, period, date })
          }
        />
      </div>
    </section>
  );
}

function AnalyticsDistributionBlock({
  title,
  items,
  kind,
  linkForItem,
}: {
  title: string;
  items: EnterpriseDimensionUsage[];
  kind: AnalyticsDistributionKind;
  linkForItem?: (item: EnterpriseDimensionUsage) => string;
}) {
  const rows = analyticsDistributionRows(items, kind);
  return (
    <section className="analytics-distribution-block">
      <h3 className="analytics-distribution-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="analytics-chart-empty">{i18n.t('console.enterprise.analytics.noDimensionData')}</p>
      ) : (
        <ol className="analytics-bar-chart">
          {rows.map((row, index) => {
            const sourceItem = items[index];
            const name = linkForItem ? (
              <Link to={linkForItem(sourceItem)}>{row.label}</Link>
            ) : (
              row.label
            );
            const costShare =
              row.costShare === null ? "—" : `${row.costShare.toFixed(1)}%`;
            return (
              <li className="analytics-bar-row" key={row.key}>
                <div className="analytics-bar-line">
                  <span className="analytics-bar-name">{name}</span>
                  <span className="analytics-bar-meta">
                    {formatAnalyticsNumber(row.requests)} {i18n.t("console.enterprise.analytics.requestsUnit")} · {i18n.t("console.enterprise.analytics.requestShare")} {row.requestShare}% ·{" "}
                    <MoneyText value={sourceItem.cost_yuan} /> · {i18n.t("console.enterprise.analytics.costShare")} {" "}
                    {row.costShare === null
                      ? i18n.t("console.enterprise.analytics.noValue")
                      : costShare}
                  </span>
                </div>
                <div className="analytics-bar-track">
                  <span
                    className="analytics-bar-fill"
                    style={{ width: `${row.barWidth}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function AnalyticsEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="analytics-empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function hasAnalyticsData(data: EnterpriseAnalyticsResponse): boolean {
  return (
    data.metrics.request_count > 0 ||
    data.trend.length > 0 ||
    data.members.length > 0 ||
    data.models.length > 0 ||
    data.api_keys.length > 0 ||
    data.sources.length > 0 ||
    Boolean(data.protocols?.length)
  );
}

function AnalyticsContent({
  context,
  onActionsChange,
}: {
  context: EnterpriseContext;
  onActionsChange: (actions: ReactNode) => void;
}) {
  const handleError = useEnterpriseErrorHandler();
  const [filters, setFilters] = useState<AnalyticsFilters>(
    defaultAnalyticsFilters,
  );
  const [data, setData] = useState<EnterpriseAnalyticsResponse | null>(null);
  const [previousData, setPreviousData] =
    useState<EnterpriseAnalyticsResponse | null>(null);
  const [metric, setMetric] = useState<AnalyticsMetric>("requests");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{
    message: string;
    requestId: string | null;
  } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const query = useMemo(() => analyticsQuery(filters), [filters]);
  const previousFilters = useMemo(
    () => previousAnalyticsFilters(filters),
    [filters],
  );
  const previousQuery = useMemo(
    () => (previousFilters ? analyticsQuery(previousFilters) : null),
    [previousFilters],
  );
  const dateRangeError =
    filters.range === "custom"
      ? validateEnterpriseDateRange(filters.startDate, filters.endDate)
      : "";

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    setPreviousData(null);
    if (dateRangeError) {
      setLoading(false);
      return () => {
        active = false;
        controller.abort();
      };
    }

    const currentRequest = getEnterpriseAnalytics(
      { enterprise_id: context.id },
      { ...query, signal: controller.signal },
    );
    const previousRequest = previousQuery
      ? getEnterpriseAnalytics(
          { enterprise_id: context.id },
          { ...previousQuery, signal: controller.signal },
        )
      : Promise.resolve<EnterpriseAnalyticsResponse | null>(null);
    Promise.allSettled([currentRequest, previousRequest])
      .then(([currentResult, previousResult]) => {
        if (!active) return;
        if (currentResult.status === "rejected") {
          const result = handleError(currentResult.reason);
          if (result) setError(result);
          return;
        }
        setData(currentResult.value);
        if (previousResult.status === "fulfilled")
          setPreviousData(previousResult.value);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    context.id,
    dateRangeError,
    handleError,
    previousQuery,
    query,
    reloadToken,
  ]);

  const exportAnalytics = useCallback((): void => {
    if (!data) return;
    const rows = data.trend
      .map((point) => [
          i18n.t("console.enterprise.analytics.date"),
        point.date,
        point.request_count,
        point.cost_yuan,
      ])
      .concat(
        data.members.map((item) => [
          i18n.t('console.enterprise.analytics.member'),
          analyticsDimensionLabel(item, "member"),
          item.requests,
          item.cost_yuan,
        ]),
      )
      .concat(
        data.models.map((item) => [
          i18n.t('console.enterprise.analytics.model'),
          analyticsDimensionLabel(item, "model"),
          item.requests,
          item.cost_yuan,
        ]),
      )
      .concat(
        data.api_keys.map((item) => [
          i18n.t('console.enterprise.analytics.apiKey'),
          analyticsDimensionLabel(item, "api-key"),
          item.requests,
          item.cost_yuan,
        ]),
      )
      .concat(
        data.sources.map((item) => [
          i18n.t('console.enterprise.analytics.source'),
          analyticsDimensionLabel(item, "source"),
          item.requests,
          item.cost_yuan,
        ]),
      )
      .concat(
        (data.protocols ?? []).map((item) => [
          i18n.t('console.enterprise.analytics.protocol'),
          analyticsDimensionLabel(item, "protocol"),
          item.requests,
          item.cost_yuan,
        ]),
      );
    exportEnterpriseCsv(
      `analytics-${formatEnterpriseTime(data.period.start_at).slice(0, 10)}.csv`,
      [i18n.t('console.enterprise.analytics.dimension'), i18n.t('console.enterprise.analytics.name'), i18n.t('console.enterprise.analytics.requests'), i18n.t('console.enterprise.analytics.cost')],
      rows,
    );
  }, [data]);

  useEffect(() => {
    onActionsChange(
      data ? (
        <button
          className="btn btn-secondary analytics-export-button"
          type="button"
          onClick={exportAnalytics}
        >
          {i18n.t('console.enterprise.analytics.exportAll')}
        </button>
      ) : null,
    );
    return () => onActionsChange(null);
  }, [data, exportAnalytics, onActionsChange]);

  const periodNote = data
    ? i18n.t('console.enterprise.analytics.asOf', { time: formatEnterpriseTime(data.period.end_at), count: formatAnalyticsNumber(data.metrics.request_count) })
    : i18n.t('console.enterprise.analytics.reading');
  const memberID = filters.memberID === "all" ? undefined : filters.memberID;
  return (
    <div className="analytics-page-content" aria-busy={loading}>
      <AnalyticsToolbar
        data={data}
        filters={filters}
        onFilterChange={setFilters}
      />
      {dateRangeError ? (
        <EnterpriseValidationError message={dateRangeError} />
      ) : error ? (
        <div className="analytics-filter-error">
          <EnterpriseError
            message={error.message}
            requestId={error.requestId}
            onRetry={() => setReloadToken((value) => value + 1)}
          />
        </div>
      ) : null}
      {loading && !data && !dateRangeError ? (
        <EnterpriseLoading label={i18n.t('console.enterprise.analytics.loading')} />
      ) : data && !hasAnalyticsData(data) ? (
        <>
          <p className="analytics-asof-note">{periodNote}</p>
          <AnalyticsEmptyState
            title={i18n.t('console.enterprise.analytics.noUsage')}
            description={i18n.t('console.enterprise.analytics.noUsageHint')}
          />
        </>
      ) : data ? (
        <>
          <p className="analytics-asof-note">{periodNote}</p>
          <AnalyticsOverview data={data} previousData={previousData} />
          <AnalyticsTrend
            data={data}
            metric={metric}
            filters={filters}
            period={data.period}
            onMetricChange={setMetric}
          />
          <section
            className="analytics-distributions"
            aria-labelledby="analytics-distributions-title"
          >
            <h2
              className="analytics-section-title"
              id="analytics-distributions-title"
            >
              {i18n.t('console.enterprise.analytics.distribution')}
            </h2>
            <div className="analytics-distribution-main">
              <AnalyticsDistributionBlock
                title={i18n.t('console.enterprise.analytics.modelDistribution')}
                items={data.models}
                kind="model"
                linkForItem={(item) =>
                  analyticsRecordsPath({
                    filters,
                    period: data.period,
                    memberID,
                    model: item,
                  })
                }
              />
              <AnalyticsDistributionBlock
                title={i18n.t('console.enterprise.analytics.memberRanking')}
                items={data.members}
                kind="member"
                linkForItem={(item) =>
                  analyticsRecordsPath({
                    filters,
                    period: data.period,
                    memberID: item.id ?? item.code,
                  })
                }
              />
            </div>
            <div className="analytics-distribution-sub">
              <AnalyticsDistributionBlock
                title={i18n.t('console.enterprise.analytics.keyDistribution')}
                items={data.api_keys}
                kind="api-key"
                linkForItem={(item) =>
                  analyticsRecordsPath({
                    filters,
                    period: data.period,
                    memberID,
                    apiKeyID: item.id,
                  })
                }
              />
              <AnalyticsDistributionBlock
                title={i18n.t('console.enterprise.analytics.sourceDistribution')}
                items={data.sources}
                kind="source"
                linkForItem={(item) =>
                  analyticsRecordsPath({
                    filters,
                    period: data.period,
                    memberID,
                    source: item,
                  })
                }
              />
              <AnalyticsDistributionBlock
                title={i18n.t('console.enterprise.analytics.protocolDistribution')}
                items={data.protocols ?? []}
                kind="protocol"
              />
            </div>
          </section>
        </>
      ) : (
        <AnalyticsEmptyState
          title={i18n.t('console.enterprise.analytics.noAnalysis')}
          description={i18n.t('console.enterprise.analytics.noAnalysisHint')}
        />
      )}
    </div>
  );
}

export function EnterpriseAnalyticsPage() {
  useTranslation();
  const [actions, setActions] = useState<ReactNode>(null);

  return (
    <EnterprisePageShell
      title={i18n.t('console.enterprise.analytics.title')}
      description={i18n.t('console.enterprise.analytics.description')}
      capability="can_view_analytics"
      actions={actions}
      className="enterprise-analytics-page"
    >
      {(context) => (
        <AnalyticsContent context={context} onActionsChange={setActions} />
      )}
    </EnterprisePageShell>
  );
}
