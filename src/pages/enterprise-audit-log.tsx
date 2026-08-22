import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@douyinfe/semi-ui/lib/es/button";
import Modal from '@/components/app-modal'
import i18n from "@/i18n";
import {
  AnalyticsTimeRangePicker,
  type TimeRangePreset,
  type TimeRangeValue,
} from "@/components/analytics-time-range-picker";
import { AppPagination } from "@/components/app-pagination";
import { CompatSelect as Select } from "@/components/semi-compat";
import {
  getEnterpriseAuditLog,
  getEnterpriseAuditLogs,
  type EnterpriseAuditLog,
  type EnterpriseAuditLogPage,
  type EnterpriseContext,
} from "@/api/enterprise-console";
import {
  formatApiTimeField,
  formatLocalDateInput,
  localDateToTimestamp,
  shiftLocalDate,
} from "@/utils/format";
import {
  EnterpriseEmpty,
  EnterpriseError,
  EnterpriseExportButton,
  EnterpriseLoading,
  EnterprisePageShell,
  EnterpriseRefreshButton,
  EnterpriseValidationError,
  exportEnterpriseCsv,
  formatEnterpriseTime,
  auditResultLabel,
  useEnterpriseErrorHandler,
  validateEnterpriseDateRange,
} from "./enterprise-console-shared";

type AuditRange = "all" | "7d" | "30d" | "custom";

type AuditFilters = {
  category: string;
  action: string;
  actorID: string;
  result: string;
  range: AuditRange;
  startDate: string;
  endDate: string;
};

const AUDIT_PAGE_SIZE = 20;

const CATEGORY_LABELS: Record<string, string> = {
  "enterprise.member": "console.enterprise.audit.categoryMember",
  "enterprise.invitation": "console.enterprise.audit.categoryMember",
  "enterprise.join_request": "console.enterprise.audit.categoryMember",
  "enterprise.tag": "console.enterprise.audit.categoryTag",
  "enterprise.budget": "console.enterprise.audit.categoryUsage",
  "enterprise.model": "console.enterprise.audit.categoryModel",
  "enterprise.api_key": "console.enterprise.audit.categoryKey",
  "enterprise.export": "console.enterprise.audit.categoryExport",
  "enterprise.settings": "console.enterprise.audit.categorySettings",
};

function defaultFilters(): AuditFilters {
  return {
    category: "all",
    action: "all",
    actorID: "all",
    result: "all",
    range: "all",
    startDate: "",
    endDate: "",
  };
}

function auditCustomRangeDefaults(): Pick<AuditFilters, "startDate" | "endDate"> {
  return {
    startDate: formatLocalDateInput(shiftLocalDate(new Date(), -6)),
    endDate: formatLocalDateInput(new Date()),
  };
}

function auditTimeQuery(filters: AuditFilters): {
  start_at?: number;
  end_at?: number;
} {
  if (filters.range === "custom")
    return {
      start_at: localDateToTimestamp(filters.startDate),
      end_at: localDateToTimestamp(filters.endDate, true),
    };
  if (filters.range === "all") return {};
  const today = new Date();
  const days = filters.range === "7d" ? 6 : 29;
  return {
    start_at: localDateToTimestamp(
      formatLocalDateInput(shiftLocalDate(today, -days)),
    ),
    end_at: localDateToTimestamp(formatLocalDateInput(today), true),
  };
}

function categoryLabel(value: string): string {
  const exact = CATEGORY_LABELS[value];
  if (exact) return i18n.t(exact);
  if (
    value.includes("member") ||
    value.includes("invitation") ||
    value.includes("join")
  )
    return i18n.t("console.enterprise.audit.categoryMember");
  if (value.includes("tag"))
    return i18n.t("console.enterprise.audit.categoryTag");
  if (value.includes("budget") || value.includes("usage"))
    return i18n.t("console.enterprise.audit.categoryUsage");
  if (value.includes("model"))
    return i18n.t("console.enterprise.audit.categoryModel");
  if (value.includes("api_key"))
    return i18n.t("console.enterprise.audit.categoryKey");
  if (value.includes("export"))
    return i18n.t("console.enterprise.audit.categoryExport");
  return value || i18n.t("console.enterprise.audit.other");
}

function actionLabel(value: string): string {
  const action = value.split(".").at(-1) || value;
  const labels: Record<string, string> = {
    create: "console.enterprise.audit.create",
    update: "console.enterprise.audit.update",
    delete: "console.enterprise.audit.delete",
    role: "console.enterprise.audit.role",
    status: "console.enterprise.audit.status",
    approve: "console.enterprise.audit.approve",
    reject: "console.enterprise.audit.reject",
    disable: "console.enterprise.audit.disable",
    enable: "console.enterprise.audit.enable",
    export: "console.enterprise.audit.export",
  };
  return labels[action] ? i18n.t(labels[action]) : action;
}

function ChangeValue({
  fieldName,
  value,
}: {
  fieldName: string;
  value: unknown;
}) {
  if (value === null || value === undefined || value === "")
    return (
      <span className="enterprise-change-empty">
        {i18n.t("console.enterprise.audit.unset")}
      </span>
    );
  const formattedTime = formatApiTimeField(fieldName, value);
  if (formattedTime !== null) return <span>{formattedTime}</span>;
  if (typeof value === "object")
    return <pre>{JSON.stringify(value, null, 2)}</pre>;
  return <span>{String(value)}</span>;
}

function AuditDetailModal({
  event,
  visible,
  loading,
  error,
  onClose,
}: {
  event: EnterpriseAuditLog | null;
  visible: boolean;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      title={
        event
          ? `${t("console.enterprise.audit.detail")} · ${event.id}`
          : t("console.enterprise.audit.detail")
      }
      visible={visible}
      onCancel={onClose}
      footer={null}
      width="780px"
    >
      {loading ? (
        <EnterpriseLoading
          label={t("console.enterprise.audit.readingDetail")}
        />
      ) : error ? (
        <div className="enterprise-inline-error" role="alert">
          {error}
        </div>
      ) : event ? (
        <div className="enterprise-audit-detail">
          <header>
            <div>
              <span className="cat-tag">{categoryLabel(event.category)}</span>
              <h2>{event.summary || actionLabel(event.action)}</h2>
              <p>
                {event.actor_name ||
                  event.actor_id ||
                  t("console.enterprise.audit.system")}{" "}
                · {formatEnterpriseTime(event.occurred_at)} ·{" "}
                {t("console.enterprise.audit.request")}{" "}
                {event.request_id || "--"}
              </p>
            </div>
            <span
              className={`source-status-badge ${event.result === "success" ? "active" : "failed"}`}
            >
              {auditResultLabel(event.result)}
            </span>
          </header>
          <dl className="enterprise-audit-facts">
            <div>
              <dt>{t("console.enterprise.audit.concreteAction")}</dt>
              <dd>{actionLabel(event.action)}</dd>
            </div>
            <div>
              <dt>{t("console.enterprise.audit.resourceType")}</dt>
              <dd>{event.resource_type || "--"}</dd>
            </div>
            <div>
              <dt>{t("console.enterprise.audit.resourceId")}</dt>
              <dd>{event.resource_id || "--"}</dd>
            </div>
            <div>
              <dt>{t("console.enterprise.audit.resultCode")}</dt>
              <dd>{event.result_code || "--"}</dd>
            </div>
          </dl>
          <div className="enterprise-change-grid">
            <section>
              <h3>{t("console.enterprise.audit.before")}</h3>
              <div className="enterprise-change-box">
                {Object.keys(event.before ?? {}).length ? (
                  Object.entries(event.before).map(([key, value]) => (
                    <div key={key}>
                      <strong>{key}</strong>
                      <ChangeValue fieldName={key} value={value} />
                    </div>
                  ))
                ) : (
                  <span className="enterprise-change-empty">
                    {t("console.enterprise.audit.noBefore")}
                  </span>
                )}
              </div>
            </section>
            <section>
              <h3>{t("console.enterprise.audit.after")}</h3>
              <div className="enterprise-change-box">
                {Object.keys(event.after ?? {}).length ? (
                  Object.entries(event.after).map(([key, value]) => (
                    <div key={key}>
                      <strong>{key}</strong>
                      <ChangeValue fieldName={key} value={value} />
                    </div>
                  ))
                ) : (
                  <span className="enterprise-change-empty">
                    {t("console.enterprise.audit.noAfter")}
                  </span>
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function AuditTable({
  data,
  loading,
  error,
  onRetry,
  onOpen,
}: {
  data: EnterpriseAuditLogPage | null;
  loading: boolean;
  error: { message: string; requestId: string | null } | null;
  onRetry: () => void;
  onOpen: (event: EnterpriseAuditLog) => void;
}) {
  const { t } = useTranslation();
  if (loading && !data)
    return <EnterpriseLoading label={t("console.enterprise.audit.loading")} />;
  if (error && !data)
    return (
      <EnterpriseError
        message={error.message}
        requestId={error.requestId}
        onRetry={onRetry}
      />
    );
  if (!data?.items.length)
    return (
      <EnterpriseEmpty
        title={t("console.enterprise.audit.empty")}
        description={t("console.enterprise.audit.emptyHint")}
      />
    );
  return (
    <div
      className="source-table-scroll enterprise-table-region"
      role="region"
      aria-label={t("console.enterprise.audit.auditList")}
      tabIndex={0}
    >
      <table className="enterprise-audit-table">
        <thead>
          <tr>
            <th>{t("console.enterprise.audit.category")}</th>
            <th>{t("console.enterprise.audit.record")}</th>
            <th>{t("console.enterprise.audit.operator")}</th>
            <th>{t("console.enterprise.audit.result")}</th>
            <th>{t("console.enterprise.audit.operationTime")}</th>
            <th>{t("console.enterprise.audit.operation")}</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((event) => (
            <tr key={event.id}>
              <td>
                <span className="cat-tag">{categoryLabel(event.category)}</span>
                <small>{actionLabel(event.action)}</small>
              </td>
              <td className="enterprise-truncate-cell" title={event.summary}>
                {event.summary || t("console.enterprise.audit.missingSummary")}
              </td>
              <td>
                <strong>
                  {event.actor_name ||
                    event.actor_id ||
                    t("console.enterprise.audit.system")}
                </strong>
                <small>
                  {event.actor_contact ||
                    t("console.enterprise.audit.contactMasked")}
                </small>
              </td>
              <td>
                <span
                  className={`source-status-badge ${event.result === "success" ? "active" : "failed"}`}
                >
                  {auditResultLabel(event.result)}
                </span>
              </td>
              <td>{formatEnterpriseTime(event.occurred_at)}</td>
              <td>
                <Button theme="borderless" onClick={() => onOpen(event)}>
                  {t("console.enterprise.audit.viewDetail")}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditContent({ context }: { context: EnterpriseContext }) {
  const { t } = useTranslation();
  const handleError = useEnterpriseErrorHandler();
  const [filters, setFilters] = useState<AuditFilters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(AUDIT_PAGE_SIZE);
  const [data, setData] = useState<EnterpriseAuditLogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{
    message: string;
    requestId: string | null;
  } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [detail, setDetail] = useState<EnterpriseAuditLog | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const timeQuery = useMemo(() => auditTimeQuery(filters), [filters]);
  const dateRangeError =
    filters.range === "custom"
      ? validateEnterpriseDateRange(filters.startDate, filters.endDate)
      : "";

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    if (dateRangeError) {
      setData(null);
      setLoading(false);
      return () => {
        active = false;
        controller.abort();
      };
    }
    getEnterpriseAuditLogs(
      { enterprise_id: context.id },
      {
        page,
        page_size: pageSize,
        category: filters.category,
        action: filters.action,
        actor_id: filters.actorID,
        result: filters.result,
        ...timeQuery,
        signal: controller.signal,
      },
    )
      .then((result) => {
        if (active) setData(result);
      })
      .catch((reason: unknown) => {
        if (!active || controller.signal.aborted) return;
        const result = handleError(reason);
        if (result) setError(result);
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
    filters.action,
    filters.actorID,
    filters.category,
    filters.result,
    handleError,
    page,
    pageSize,
    reloadToken,
    timeQuery,
  ]);

  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (data?.items ?? []).map((event) => event.category).filter(Boolean),
        ),
      ),
    [data],
  );
  const actionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (data?.items ?? []).map((event) => event.action).filter(Boolean),
        ),
      ),
    [data],
  );
  const actorOptions = useMemo(
    () =>
      Array.from(
        new Map(
          (data?.items ?? [])
            .filter((event) => event.actor_id)
            .map((event) => [
              event.actor_id,
              event.actor_name || event.actor_id,
            ]),
        ).entries(),
      ),
    [data],
  );
  const rangePresets: readonly TimeRangePreset<AuditRange>[] = [
    { value: "all", label: t("console.enterprise.audit.allTimeRange") },
    { value: "7d", label: t("console.enterprise.audit.last7Days") },
    { value: "30d", label: t("console.enterprise.audit.last30Days") },
    { value: "custom", label: t("console.enterprise.audit.custom") },
  ];

  function updateFilter<Key extends keyof AuditFilters>(
    key: Key,
    value: AuditFilters[Key],
  ): void {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(1);
  }

  function updateTimeRange(value: TimeRangeValue<AuditRange>): void {
    setFilters((previous) => ({ ...previous, ...value }));
    setPage(1);
  }

  async function openDetail(event: EnterpriseAuditLog): Promise<void> {
    setDetail(event);
    setDetailError("");
    setDetailLoading(true);
    try {
      setDetail(
        await getEnterpriseAuditLog({ enterprise_id: context.id }, event.id),
      );
    } catch (reason: unknown) {
      const result = handleError(reason);
      if (result) setDetailError(result.message);
    } finally {
      setDetailLoading(false);
    }
  }

  function exportLogs(): void {
    const rows = (data?.items ?? []).map((event) => [
      categoryLabel(event.category),
      actionLabel(event.action),
      event.summary,
      event.actor_name ||
        event.actor_id ||
        t("console.enterprise.audit.system"),
      auditResultLabel(event.result),
      formatEnterpriseTime(event.occurred_at),
      event.request_id,
    ]);
    exportEnterpriseCsv(
      `enterprise-audit-logs-${formatLocalDateInput(new Date())}.csv`,
      [
        t("console.enterprise.audit.category"),
        t("console.enterprise.audit.concreteAction"),
        t("console.enterprise.audit.record"),
        t("console.enterprise.audit.operator"),
        t("console.enterprise.audit.result"),
        t("console.enterprise.audit.operationTime"),
        t("console.enterprise.audit.request"),
      ],
      rows,
    );
  }

  const currentPageSize = data?.page_size ?? pageSize;
  const pageCount = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / currentPageSize),
  );
  return (
    <div className="enterprise-audit-content" aria-busy={loading}>
      <div className="enterprise-content-toolbar">
        <span className="enterprise-period-caption">
          {t("console.enterprise.audit.pageSummary", {
            total: data?.total ?? "--",
            page: data?.page ?? page,
            pageCount,
          })}
        </span>
        <div className="enterprise-page-actions">
          <EnterpriseRefreshButton
            onClick={() => setReloadToken((value) => value + 1)}
            label={t("console.enterprise.audit.refresh")}
          />
          <EnterpriseExportButton
            onClick={exportLogs}
            disabled={!data?.items.length}
            label={t("console.enterprise.audit.exportCsv")}
          />
        </div>
      </div>
      <section
        className="enterprise-filter-panel enterprise-audit-filters"
        aria-label={t("console.enterprise.audit.filter")}
      >
        <label className="enterprise-filter-field">
          <span id="enterprise-audit-category-label">{t("console.enterprise.audit.category")}</span>
          <Select
            value={filters.category}
            onChange={(value) => updateFilter("category", String(value))}
            onSelect={(value) => updateFilter("category", String(value))}
            aria-labelledby="enterprise-audit-category-label"
            block
          >
            <Select.Option value="all">
              {t("console.enterprise.audit.allTypes")}
            </Select.Option>
            {categoryOptions.map((value) => (
              <Select.Option value={value} key={value}>
                {categoryLabel(value)}
              </Select.Option>
            ))}
          </Select>
        </label>
        <label className="enterprise-filter-field">
          <span id="enterprise-audit-action-label">{t("console.enterprise.audit.concreteActionFilter")}</span>
          <Select
            value={filters.action}
            onChange={(value) => updateFilter("action", String(value))}
            onSelect={(value) => updateFilter("action", String(value))}
            aria-labelledby="enterprise-audit-action-label"
            block
          >
            <Select.Option value="all">
              {t("console.enterprise.audit.allActions")}
            </Select.Option>
            {actionOptions.map((value) => (
              <Select.Option value={value} key={value}>
                {actionLabel(value)}
              </Select.Option>
            ))}
          </Select>
        </label>
        <label className="enterprise-filter-field">
          <span id="enterprise-audit-operator-label">{t("console.enterprise.audit.operator")}</span>
          <Select
            value={filters.actorID}
            onChange={(value) => updateFilter("actorID", String(value))}
            onSelect={(value) => updateFilter("actorID", String(value))}
            aria-labelledby="enterprise-audit-operator-label"
            block
          >
            <Select.Option value="all">
              {t("console.enterprise.audit.allOperators")}
            </Select.Option>
            {actorOptions.map(([value, label]) => (
              <Select.Option value={value} key={value}>
                {label}
              </Select.Option>
            ))}
          </Select>
        </label>
        <label className="enterprise-filter-field">
          <span id="enterprise-audit-result-label">{t("console.enterprise.audit.result")}</span>
          <Select
            value={filters.result}
            onChange={(value) => updateFilter("result", String(value))}
            onSelect={(value) => updateFilter("result", String(value))}
            aria-labelledby="enterprise-audit-result-label"
            block
          >
            <Select.Option value="all">
              {t("console.enterprise.audit.allResults")}
            </Select.Option>
            <Select.Option value="success">
              {t("console.enterprise.audit.success")}
            </Select.Option>
            <Select.Option value="failed">
              {t("console.enterprise.audit.failed")}
            </Select.Option>
          </Select>
        </label>
        <div className="enterprise-audit-time-filter">
          <span>{t("console.enterprise.audit.dateRange")}</span>
          <AnalyticsTimeRangePicker
            value={{
              range: filters.range,
              startDate: filters.startDate,
              endDate: filters.endDate,
            }}
            presets={rangePresets}
            defaultCustomValue={auditCustomRangeDefaults()}
            dateRestriction="past-only"
            onChange={updateTimeRange}
          />
        </div>
      </section>
      {dateRangeError ? (
        <EnterpriseValidationError message={dateRangeError} />
      ) : error ? (
        <div className="enterprise-filter-error">
          <EnterpriseError
            message={error.message}
            requestId={error.requestId}
            onRetry={() => setReloadToken((value) => value + 1)}
          />
        </div>
      ) : null}
      <AuditTable
        data={data}
        loading={loading}
        error={error}
        onRetry={() => setReloadToken((value) => value + 1)}
        onOpen={(event) => {
          void openDetail(event);
        }}
      />
      {data ? (
        <AppPagination
          ariaLabel={t("console.enterprise.audit.pageSummary", { total: data.total, page, pageCount })}
          currentPage={page}
          pageSize={currentPageSize}
          total={data.total}
          summary={t("console.enterprise.audit.pageSummary", { total: data.total, page, pageCount })}
          disabled={loading}
          onPageChange={setPage}
          onPageSizeChange={(nextPageSize) => {
            setPageSize(nextPageSize);
            setPage(1);
          }}
        />
      ) : null}
      <AuditDetailModal
        event={detail}
        visible={Boolean(detail)}
        loading={detailLoading}
        error={detailError}
        onClose={() => {
          setDetail(null);
          setDetailError("");
        }}
      />
    </div>
  );
}

export function EnterpriseAuditLogPage() {
  const { t } = useTranslation();
  return (
    <EnterprisePageShell
      title={t("console.enterprise.audit.title")}
      description={t("console.enterprise.audit.description")}
      capability="can_view_audit"
    >
      {(context) => <AuditContent context={context} />}
    </EnterprisePageShell>
  );
}
