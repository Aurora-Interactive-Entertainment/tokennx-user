import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import DatePicker from "@douyinfe/semi-ui/lib/es/datePicker";
import Modal from "@douyinfe/semi-ui/lib/es/modal";
import Select from "@douyinfe/semi-ui/lib/es/select";
import Toast from "@douyinfe/semi-ui/lib/es/toast";
import { IconDownload } from "@douyinfe/semi-icons";
import {
  getEnterpriseAuditLogs,
  type EnterpriseAuditLog,
  type EnterpriseContext,
} from "@/api/enterprise-console";
import { TraePagination } from "@/components/trae-pagination";
import { TraeTableEmpty } from "@/components/trae-table-empty";
import {
  EnterpriseError,
  EnterpriseLoading,
  auditResultLabel,
  exportEnterpriseCsv,
  formatEnterpriseTime,
  useEnterpriseErrorHandler,
} from "@/pages/enterprise-console-shared";
import "./trae-enterprise-audit.css";

type AuditSelectOption = { value: string; label: string };

function startOfDay(value: Date): Date {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(value: Date): Date {
  const result = new Date(value);
  result.setHours(23, 59, 59, 999);
  return result;
}

function shiftDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function mergeOptions(current: AuditSelectOption[], incoming: AuditSelectOption[]): AuditSelectOption[] {
  const options = new Map(current.map((option) => [option.value, option]));
  incoming.forEach((option) => options.set(option.value, option));
  return Array.from(options.values());
}

function actionLabel(log: EnterpriseAuditLog): string {
  return log.summary?.trim() || log.action?.trim() || "--";
}

function operatorLabel(log: EnterpriseAuditLog): string {
  const name = log.actor_name?.trim() || log.actor_id?.trim() || "--";
  return log.actor_contact?.trim() ? `${name} (${log.actor_contact})` : name;
}

function resourceLabel(log: EnterpriseAuditLog): string {
  const type = log.resource_type?.trim();
  const id = log.resource_id?.trim();
  if (type && id) return `${type} · ${id}`;
  return type || id || "--";
}

function serializeChange(value: Record<string, unknown> | null | undefined): string {
  if (!value || Object.keys(value).length === 0) return "--";
  return JSON.stringify(value, null, 2);
}

function resultClass(value: string): string {
  if (value === "success" || value === "succeeded") return "is-success";
  if (value === "partial") return "is-partial";
  return "is-failure";
}

function AuditSelect({
  label,
  value,
  options,
  searchable = false,
  onChange,
}: {
  label: string;
  value: string;
  options: AuditSelectOption[];
  searchable?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      aria-label={label}
      className="trae-select"
      dropdownClassName="trae-select-dropdown trae-audit-select-dropdown"
      filter={searchable}
      searchPosition={searchable ? "dropdown" : undefined}
      searchPlaceholder={label}
      value={value}
      onChange={(nextValue) => onChange(String(nextValue ?? "all"))}
    >
      {options.map((option) => (
        <Select.Option key={option.value} value={option.value}>
          {option.label}
        </Select.Option>
      ))}
    </Select>
  );
}

function AuditDateRangePicker({ value, onChange }: { value: Date[]; onChange: (value: Date[]) => void }) {
  const { t } = useTranslation();
  const today = useMemo(() => startOfDay(new Date()), []);
  const presets = useMemo(
    () => [
      { text: t("traeEnterprise.analysis.datePresets.last7"), start: shiftDays(today, -6), end: today },
      { text: t("traeEnterprise.analysis.datePresets.last30"), start: shiftDays(today, -29), end: today },
      { text: t("traeEnterprise.analysis.datePresets.last90"), start: shiftDays(today, -89), end: today },
    ],
    [t, today],
  );

  return (
    <DatePicker
      aria-label={t("traeEnterprise.audit.date")}
      className="trae-date-picker"
      dropdownClassName="trae-date-picker-dropdown"
      type="dateRange"
      value={value}
      format="yyyy-MM-dd"
      rangeSeparator=" ~ "
      presets={presets}
      presetPosition="left"
      showClear={false}
      // 审计日志允许回溯全部历史，仅禁止选择未来日期。
      disabledDate={(date) => !date || startOfDay(date) > today}
      onChange={(nextValue) => {
        if (!Array.isArray(nextValue)) return;
        const dates = nextValue.filter((item): item is Date => item instanceof Date);
        if (dates.length === 2) onChange(dates);
      }}
    />
  );
}

function AuditDetail({ log, onClose }: { log: EnterpriseAuditLog; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal
      className="trae-audit-detail-modal"
      title={t("traeEnterprise.audit.detailTitle")}
      visible
      onCancel={onClose}
      footer={(
        <button className="trae-primary-button" type="button" onClick={onClose}>
          {t("traeEnterprise.audit.close")}
        </button>
      )}
    >
      <dl className="trae-audit-detail-list">
        <div>
          <dt>{t("traeEnterprise.audit.detailOperator")}</dt>
          <dd><strong>{log.actor_name || log.actor_id || "--"}</strong>{log.actor_contact ? <small>{log.actor_contact}</small> : null}</dd>
        </div>
        <div>
          <dt>{t("traeEnterprise.audit.action")}</dt>
          <dd><strong>{actionLabel(log)}</strong><code>{log.action || "--"}</code></dd>
        </div>
        <div>
          <dt>{t("traeEnterprise.audit.detailTarget")}</dt>
          <dd><code>{resourceLabel(log)}</code></dd>
        </div>
        <div>
          <dt>{t("traeEnterprise.audit.result")}</dt>
          <dd><span className={`trae-audit-result ${resultClass(log.result)}`}>{auditResultLabel(log.result)}</span>{log.result_code ? <code>{log.result_code}</code> : null}</dd>
        </div>
        <div>
          <dt>{t("traeEnterprise.audit.time")}</dt>
          <dd>{formatEnterpriseTime(log.occurred_at)}</dd>
        </div>
        <div>
          <dt>{t("traeEnterprise.audit.detailRequest")}</dt>
          <dd><code>{log.request_id || "--"}</code></dd>
        </div>
        <div className="trae-audit-change-row">
          <dt>{t("traeEnterprise.audit.before")}</dt>
          <dd><pre>{serializeChange(log.before)}</pre></dd>
        </div>
        <div className="trae-audit-change-row">
          <dt>{t("traeEnterprise.audit.after")}</dt>
          <dd><pre>{serializeChange(log.after)}</pre></dd>
        </div>
      </dl>
    </Modal>
  );
}

export function TraeEnterpriseAudit({ context }: { context: EnterpriseContext }) {
  const { t } = useTranslation();
  const handleError = useEnterpriseErrorHandler();
  const [action, setAction] = useState("all");
  const [operator, setOperator] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [dateRange, setDateRange] = useState<Date[]>(() => {
    const today = startOfDay(new Date());
    return [shiftDays(today, -29), today];
  });
  const [rows, setRows] = useState<EnterpriseAuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [detail, setDetail] = useState<EnterpriseAuditLog | null>(null);
  const [actionOptions, setActionOptions] = useState<AuditSelectOption[]>([]);
  const [operatorOptions, setOperatorOptions] = useState<AuditSelectOption[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    getEnterpriseAuditLogs(
      { enterprise_id: context.id },
      {
        page,
        page_size: pageSize,
        action: action === "all" ? undefined : action,
        actor_id: operator === "all" ? undefined : operator,
        start_at: startOfDay(dateRange[0]).getTime(),
        end_at: endOfDay(dateRange[1]).getTime(),
        signal: controller.signal,
      },
    )
      .then((response) => {
        if (!active) return;
        const items = response.items ?? [];
        setRows(items);
        setTotal(response.total ?? 0);
        setActionOptions((current) => mergeOptions(current, items.map((log) => ({ value: log.action, label: actionLabel(log) }))));
        setOperatorOptions((current) => mergeOptions(current, items.map((log) => ({ value: log.actor_id, label: operatorLabel(log) }))));
      })
      .catch((reason: unknown) => {
        if (!active || controller.signal.aborted) return;
        const handled = handleError(reason);
        if (handled) setError(handled);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [action, context.id, dateRange, handleError, operator, page, pageSize, reloadToken]);

  function exportData() {
    exportEnterpriseCsv(
      "trae-operation-log.csv",
      [
        t("traeEnterprise.audit.time"),
        t("traeEnterprise.audit.detailOperator"),
        t("traeEnterprise.audit.action"),
        t("traeEnterprise.audit.detailTarget"),
        t("traeEnterprise.audit.result"),
        t("traeEnterprise.audit.detailRequest"),
      ],
      rows.map((log) => [
        formatEnterpriseTime(log.occurred_at),
        operatorLabel(log),
        `${actionLabel(log)} (${log.action})`,
        resourceLabel(log),
        auditResultLabel(log.result),
        log.request_id,
      ]),
    );
    Toast.success(t("traeEnterprise.audit.exportSuccess"));
  }

  return (
    <div className="trae-page trae-audit-page">
      <header className="trae-page-heading">
        <h1>{t("traeEnterprise.audit.title")}</h1>
        <div className="trae-page-heading-action">
          <button className="trae-primary-button" type="button" disabled={loading || rows.length === 0} onClick={exportData}>
            <IconDownload aria-hidden="true" />
            {t("traeEnterprise.audit.export")}
          </button>
        </div>
      </header>
      <div className="trae-toolbar">
        <AuditSelect
          label={t("traeEnterprise.audit.type")}
          value={action}
          onChange={(value) => { setAction(value); setPage(1); }}
          options={[{ value: "all", label: t("traeEnterprise.audit.type") }, ...actionOptions]}
        />
        <AuditSelect
          label={t("traeEnterprise.audit.operator")}
          value={operator}
          searchable
          onChange={(value) => { setOperator(value); setPage(1); }}
          options={[{ value: "all", label: t("traeEnterprise.audit.operator") }, ...operatorOptions]}
        />
        <AuditDateRangePicker value={dateRange} onChange={(value) => { setDateRange(value); setPage(1); }} />
      </div>

      {error ? <EnterpriseError message={error.message} requestId={error.requestId} onRetry={() => setReloadToken((value) => value + 1)} /> : null}
      {!error && loading && rows.length === 0 ? <EnterpriseLoading label={t("traeEnterprise.audit.loading")} /> : null}
      {!error && (!loading || rows.length > 0) ? (
        <>
          <div className="trae-table-scroll" aria-busy={loading}>
            <table className="trae-table trae-audit-table">
              <thead>
                <tr>
                  <th>{t("traeEnterprise.audit.action")}</th>
                  <th>{t("traeEnterprise.audit.record")}</th>
                  <th>{t("traeEnterprise.audit.operator")}</th>
                  <th>{t("traeEnterprise.audit.time")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((log) => (
                  <tr
                    key={log.id}
                    tabIndex={0}
                    onClick={() => setDetail(log)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") setDetail(log);
                    }}
                  >
                    <td><span className="trae-audit-action-cell"><strong>{actionLabel(log)}</strong></span></td>
                    <td><span className="trae-audit-record-cell"><span title={resourceLabel(log)}>{resourceLabel(log)}</span><small className={`trae-audit-result ${resultClass(log.result)}`}>{auditResultLabel(log.result)}</small></span></td>
                    <td><span className="trae-audit-operator-cell"><strong>{log.actor_name || log.actor_id || "--"}</strong><small>{log.actor_contact || log.actor_id || "--"}</small></span></td>
                    <td>{formatEnterpriseTime(log.occurred_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? <TraeTableEmpty title={t("traeEnterprise.audit.empty")} hint={t("traeEnterprise.audit.emptyHint")} /> : null}
          </div>
          <TraePagination
            ariaLabel={t("traeEnterprise.audit.pagination")}
            total={total}
            currentPage={page}
            pageSize={pageSize}
            disabled={loading}
            summary={t("traeEnterprise.audit.paginationSummary", { total })}
            onChange={(nextPage, nextPageSize) => {
              setPageSize(nextPageSize);
              setPage(nextPageSize === pageSize ? nextPage : 1);
            }}
          />
        </>
      ) : null}
      {detail ? <AuditDetail log={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}
