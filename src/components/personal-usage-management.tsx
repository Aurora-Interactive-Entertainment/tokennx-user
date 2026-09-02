import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Tooltip from "@douyinfe/semi-ui/lib/es/tooltip";
import Select from "@douyinfe/semi-ui/lib/es/select";
import Toast from "@douyinfe/semi-ui/lib/es/toast";
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
import type { UserApiKey } from "@/api/user-api-keys";
import { TraePagination } from "./trae-pagination";
import {
  addLocalDays,
  dateRangeToUtcBounds,
  PersonalUsageDatePicker,
  startOfLocalToday,
} from "./personal-usage-date-picker";
import {
  createExportIdempotencyKey,
  createExportTask,
  downloadExportTask,
  type ExportContext,
  getExportErrorMessage,
  saveExportResponse,
  waitForExportTask,
} from "@/api/exports";
import { BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES, formatYuan as formatMoneyYuan } from "@/utils/format";

type CueRange = "today" | "7d" | "30d" | "custom";

function formatPersonalUsageYuan(value: string): string {
  // 中文：保留个人用量页原有的全角人民币符号，只统一金额精度和舍入规则。
  return formatMoneyYuan(value, BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES).replace("¥", "￥");
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

function PersonalUsageOverview({ apiKeyID }: { apiKeyID?: string }) {
  const { t } = useTranslation();
  const [data, setData] = useState<UsageOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void getUsageOverview(controller.signal, apiKeyID)
      .then(setData)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(getPersonalUsageErrorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [apiKeyID, reloadKey]);

  return (
    <>
      {/* <h2 id="personal-usage-model-title">
        {t("console.personalUsage.models")}
      </h2> */}
      <div className="personal-usage-model-card">
        <div className="personal-usage-model-total">
          <span>{t("console.personalUsage.total")}</span>
          <strong>
            {data ? formatPersonalUsageYuan(data.total_cost_yuan) : "--"}{" "}
            <small>
              | {data ? formatPersonalUsageYuan(data.account_balance_yuan) : "--"}{" "}
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
                <strong>{formatPersonalUsageYuan(row.total_cost_yuan)}</strong>
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

function PersonalUsageRecords({ context, apiKeyID }: { context: PersonalUsageContext; apiKeyID?: string }) {
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
  const [exporting, setExporting] = useState(false);
  const exportLockRef = useRef(false);
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
        api_key_id: apiKeyID,
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
  }, [apiKeyID, bounds.endAt, bounds.startAt, context, page, pageSize, reloadKey]);

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

  async function exportRows(): Promise<void> {
    // 中文：使用 ref 立即锁定导出，避免连续点击在 React 重渲染前创建多个任务。
    if (exportLockRef.current || exporting) return;
    exportLockRef.current = true;
    setExporting(true);
    try {
      // 中文：个人调用记录导出使用当前账务主体、API Key 和完整时间边界，服务端生成全部匹配记录。
      const contextPayload: ExportContext = context.account_type === "enterprise"
        ? { account_type: "enterprise", enterprise_id: context.enterprise_id }
        : { account_type: "personal" };
      const task = await createExportTask(
        {
          export_code: "user.usage.records",
          format: "csv",
          context: contextPayload,
          filters: {
            ...(apiKeyID ? { api_key_id: apiKeyID } : {}),
            start_at: new Date(bounds.startAt).toISOString(),
            end_at: new Date(bounds.endAt).toISOString(),
          },
          file_name: "用量明细",
        },
        { idempotencyKey: createExportIdempotencyKey("personal-usage") },
      );
      const completed = await waitForExportTask(task.id);
      const response = await downloadExportTask(completed.id);
      await saveExportResponse(response, completed.file_name, "用量明细");
      Toast.success(t("console.personalUsage.cue.downloadSuccess"));
    } catch (error) {
      Toast.error(getExportErrorMessage(error));
    } finally {
      exportLockRef.current = false;
      setExporting(false);
    }
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
          disabled={loading || rows.length === 0 || exporting}
          aria-label={t("console.personalUsage.cue.download")}
          title={t("console.personalUsage.cue.download")}
          onClick={() => void exportRows()}
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
  apiKeyID,
  apiKeys,
  apiKeysLoading,
  onApiKeyChange,
}: {
  context: PersonalUsageContext;
  apiKeyID?: string;
  apiKeys: UserApiKey[];
  apiKeysLoading?: boolean;
  onApiKeyChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const keyOptions = [{ value: "all", label: t("console.personalUsage.cue.allKeys") }, ...apiKeys.map((key) => ({ value: key.id, label: key.name || key.masked_key || key.id }))];
  return (
    <section
      className="personal-usage-management"
      aria-labelledby="personal-usage-model-title"
    >
      <div className="personal-usage-management-heading">
        <h2 id="personal-usage-model-title">{t("console.personalUsage.models")}</h2>
        <Select className="trae-select personal-usage-key-select" dropdownClassName="trae-select-dropdown trae-members-filter-dropdown personal-usage-key-dropdown" value={apiKeyID || "all"} loading={apiKeysLoading} onChange={(value) => onApiKeyChange(String(value))} aria-label={t("console.personalUsage.cue.keyFilter")}>
          {keyOptions.map((option) => <Select.Option key={option.value} value={option.value}>{option.label}</Select.Option>)}
        </Select>
      </div>
      <PersonalUsageOverview apiKeyID={apiKeyID} />
      <PersonalUsageRecords context={context} apiKeyID={apiKeyID} />
    </section>
  );
}
