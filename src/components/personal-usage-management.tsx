import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Tooltip from "@douyinfe/semi-ui/lib/es/tooltip";
import {
  IconDownload,
  IconInfoCircle,
  IconRefresh,
} from "@douyinfe/semi-icons";
import {
  getPersonalUsageErrorMessage,
  getUsageOverview,
  getUsageRecords,
  type PersonalUsageContext,
  type UsageOverviewResponse,
  type UsageRecordsResponse,
} from "@/api/personal-usage";
import { TraePagination } from "./trae-pagination";
import {
  addLocalDays,
  dateRangeToUtcBounds,
  PersonalUsageDatePicker,
  startOfLocalToday,
} from "./personal-usage-date-picker";
import { exportEnterpriseCsv } from "@/pages/enterprise-console-shared";

type CueRange = "today" | "7d" | "30d" | "custom";

function formatYuan(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `￥${amount.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
    : "--";
}

function ResourceStatus({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  if (loading)
    return (
      <div className="personal-usage-resource-status" role="status">
        <span className="console-loading-spinner" />
        {t("console.personalUsage.loading")}
      </div>
    );
  if (error)
    return (
      <div className="personal-usage-resource-status" role="alert">
        <span>{error}</span>
        <button type="button" onClick={onRetry}>
          <IconRefresh aria-hidden="true" />
          {t("console.personalUsage.retry")}
        </button>
      </div>
    );
  return null;
}

function PersonalUsageOverview() {
  const { t } = useTranslation();
  const [data, setData] = useState<UsageOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void getUsageOverview(controller.signal)
      .then(setData)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(getPersonalUsageErrorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  return (
    <>
      <h2 id="personal-usage-model-title">
        {t("console.personalUsage.models")}
      </h2>
      <div className="personal-usage-model-card">
        <div className="personal-usage-model-total">
          <span>{t("console.personalUsage.total")}</span>
          <strong>
            {data ? formatYuan(data.total_cost_yuan) : "--"}{" "}
            <small>
              | {data ? formatYuan(data.account_balance_yuan) : "--"}{" "}
              <Tooltip
                className="app-info-tooltip"
                content={t("console.personalUsage.balanceHint")}
              >
                <IconInfoCircle className="app-info-icon" aria-hidden="true" />
              </Tooltip>
            </small>
          </strong>
        </div>
        {loading || error ? (
          <ResourceStatus
            loading={loading}
            error={error}
            onRetry={() => setReloadKey((value) => value + 1)}
          />
        ) : data?.models.length ? (
          <div className="personal-usage-model-list">
            {data.models.map((row) => (
              <div
                className="personal-usage-model-row"
                key={`${row.name}-${row.vendor}`}
                title={row.vendor}
              >
                <span>{row.name}</span>
                <strong>{formatYuan(row.total_cost_yuan)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="personal-usage-resource-status">
            {t("console.personalUsage.noModels")}
          </div>
        )}
      </div>
    </>
  );
}

function rangeDates(range: CueRange, customRange: Date[]): Date[] {
  const today = startOfLocalToday();
  if (range === "today") return [today, today];
  if (range === "7d") return [addLocalDays(today, -6), today];
  if (range === "30d") return [addLocalDays(today, -29), today];
  return customRange;
}

function PersonalUsageRecords({ context }: { context: PersonalUsageContext }) {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => startOfLocalToday(), []);
  const [range, setRange] = useState<CueRange>("today");
  const [customRange, setCustomRange] = useState<Date[]>(() => [
    addLocalDays(today, -6),
    today,
  ]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<UsageRecordsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const selectedRange = useMemo(
    () => rangeDates(range, customRange),
    [customRange, range],
  );
  const bounds = useMemo(
    () => dateRangeToUtcBounds(selectedRange),
    [selectedRange],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void getUsageRecords(
      context,
      {
        page,
        page_size: pageSize,
        start_at: bounds.startAt,
        end_at: bounds.endAt,
      },
      controller.signal,
    )
      .then((response) => {
        setData(response);
        if (response.page !== page) setPage(response.page);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(getPersonalUsageErrorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [bounds.endAt, bounds.startAt, context, page, pageSize, reloadKey]);

  function selectRange(nextRange: CueRange) {
    setRange(nextRange);
    setPage(1);
  }

  function handleCustomRange(nextRange: Date[]) {
    setCustomRange(nextRange);
    setRange("custom");
    setPage(1);
  }

  const formatDateTime = (timestamp: number) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(timestamp);
  const formatCount = (value: number) =>
    new Intl.NumberFormat(i18n.language).format(value);
  const rows = data?.items ?? [];

  function exportRows() {
    exportEnterpriseCsv(
      "personal-usage-records.csv",
      [
        t("console.personalUsage.cue.table.date"),
        t("console.personalUsage.cue.table.client"),
        t("console.personalUsage.cue.table.model"),
        t("console.personalUsage.cue.table.session"),
        t("console.personalUsage.cue.table.source"),
        t("console.personalUsage.cue.table.tokens"),
        t("console.personalUsage.cue.table.calls"),
      ],
      rows.map((row) => [
        formatDateTime(row.occurred_at),
        row.client_tool_name || "-",
        row.model_alias || row.model_name || row.model_code,
        row.request_id,
        row.api_key_name || row.channel || row.event_type,
        row.input_tokens + row.output_tokens + row.cached_tokens,
        1,
      ]),
    );
  }

  return (
    <section
      className="personal-usage-cue"
      aria-label={t("console.personalUsage.cue.rangeLabel")}
    >
      <div className="personal-usage-cue-toolbar">
        <div
          className="personal-usage-cue-range-buttons"
          role="group"
          aria-label={t("console.personalUsage.cue.rangeLabel")}
        >
          {(
            [
              ["today", "today"],
              ["7d", "last7"],
              ["30d", "last30"],
              ["custom", "custom"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={range === value ? "is-active" : ""}
              type="button"
              onClick={() => selectRange(value)}
            >
              {t(`console.personalUsage.cue.${label}`)}
            </button>
          ))}
        </div>
        {range === "custom" ? (
          <PersonalUsageDatePicker
            compact
            value={customRange}
            onChange={handleCustomRange}
          />
        ) : null}
        <button
          className="personal-usage-cue-download"
          type="button"
          disabled={loading || rows.length === 0}
          aria-label={t("console.personalUsage.cue.download")}
          title={t("console.personalUsage.cue.download")}
          onClick={exportRows}
        >
          <IconDownload aria-hidden="true" />
        </button>
      </div>
      <div className="personal-usage-cue-table-wrap">
        <table className="personal-usage-cue-table">
          <thead>
            <tr>
              <th>{t("console.personalUsage.cue.table.date")}</th>
              <th>{t("console.personalUsage.cue.table.client")}</th>
              <th>{t("console.personalUsage.cue.table.model")}</th>
              <th>{t("console.personalUsage.cue.table.session")}</th>
              <th>{t("console.personalUsage.cue.table.source")}</th>
              <th>{t("console.personalUsage.cue.table.tokens")}</th>
              <th>{t("console.personalUsage.cue.table.calls")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{formatDateTime(row.occurred_at)}</td>
                <td>{row.client_tool_name || "-"}</td>
                <td>{row.model_alias || row.model_name || row.model_code}</td>
                <td title={row.request_id}>{row.request_id}</td>
                <td>{row.api_key_name || row.channel || row.event_type}</td>
                <td>
                  {formatCount(
                    row.input_tokens + row.output_tokens + row.cached_tokens,
                  )}
                </td>
                <td>1</td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading || error ? (
          <ResourceStatus
            loading={loading}
            error={error}
            onRetry={() => setReloadKey((value) => value + 1)}
          />
        ) : rows.length === 0 ? (
          <div className="personal-usage-cue-empty">
            {t("console.personalUsage.cue.empty")}
          </div>
        ) : null}
      </div>
      <TraePagination
        ariaLabel={t("console.personalUsage.cue.pagination")}
        total={data?.total ?? 0}
        currentPage={page}
        pageSize={pageSize}
        disabled={loading}
        summary={
          data
            ? t("console.personalUsage.cue.summary", {
                total: formatCount(data.total),
              })
            : undefined
        }
        onChange={(nextPage, nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(nextPageSize === pageSize ? nextPage : 1);
        }}
      />
    </section>
  );
}

export function PersonalUsageManagement({
  context,
}: {
  context: PersonalUsageContext;
}) {
  return (
    <section
      className="personal-usage-management"
      aria-labelledby="personal-usage-model-title"
    >
      <PersonalUsageOverview />
      <PersonalUsageRecords context={context} />
    </section>
  );
}
