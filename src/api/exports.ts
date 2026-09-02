import { fetchAuthenticatedJson, fetchAuthenticatedResponse } from "./authenticated";
import { ApiError, isApiError, type FetchJsonOptions } from "./http";
import i18n from "@/i18n";

/** 中文：统一异步导出的数据集编码，必须与后端导出定义保持一致。 */
export type ExportCode =
  | "user.usage.records"
  | "enterprise.members"
  | "enterprise.usage"
  | "enterprise.analytics"
  | "enterprise.audit_logs"
  | "billing.statements";

export type ExportFormat = "csv" | "xlsx";
export type ExportTaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled"
  | "expired";

export type ExportContext = Record<string, string>;
export type ExportFilters = Record<string, string>;

export interface CreateExportTaskInput {
  export_code: ExportCode;
  format: ExportFormat;
  context?: ExportContext;
  filters?: ExportFilters;
  columns?: string[];
  file_name?: string;
}

export interface ExportTask {
  id: string;
  export_no: string;
  export_code: ExportCode;
  format: ExportFormat;
  status: ExportTaskStatus;
  progress: number;
  file_name: string;
  row_count: number;
  size_bytes: number;
  checksum?: string;
  requested_at: number;
  started_at?: number | null;
  completed_at?: number | null;
  expires_at?: number | null;
  downloaded_at?: number | null;
  canceled_at?: number | null;
  downloadable: boolean;
  download_url?: string;
  error_code?: string;
  error_message?: string;
  context?: ExportContext;
  filters?: ExportFilters;
  columns?: string[];
}

export interface ExportListResponse {
  items: ExportTask[];
  page: number;
  page_size: number;
  total: number;
}

export interface ExportRequestOptions
  extends Pick<FetchJsonOptions, "accessToken" | "signal"> {
  idempotencyKey?: string;
}

export interface WaitForExportOptions
  extends Pick<FetchJsonOptions, "accessToken" | "signal"> {
  pollIntervalMs?: number;
  timeoutMs?: number;
  onProgress?: (task: ExportTask) => void;
}

const EXPORT_PATH = "/api/user/exports";
const DEFAULT_POLL_INTERVAL_MS = 1200;
const DEFAULT_TIMEOUT_MS = 180000;

export function createExportIdempotencyKey(prefix = "export"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function taskPath(exportID: string, suffix = ""): string {
  const normalizedID = exportID.trim();
  if (!normalizedID) {
    throw new ApiError(i18n.t("api.exports.taskRequired"), 400, 150001, null);
  }
  return `${EXPORT_PATH}/${encodeURIComponent(normalizedID)}${suffix}`;
}

function requestOptions(options: ExportRequestOptions): FetchJsonOptions {
  const headers = options.idempotencyKey?.trim()
    ? { "Idempotency-Key": options.idempotencyKey.trim() }
    : undefined;
  return {
    accessToken: options.accessToken,
    signal: options.signal,
    headers,
  };
}

export function createExportTask(
  input: CreateExportTaskInput,
  options: ExportRequestOptions = {},
): Promise<ExportTask> {
  return fetchAuthenticatedJson<ExportTask>(EXPORT_PATH, {
    ...requestOptions(options),
    method: "POST",
    body: input,
  });
}

export function listExportTasks(
  query: {
    page?: number;
    page_size?: number;
    status?: ExportTaskStatus;
    export_code?: ExportCode;
    created_from?: string;
    created_to?: string;
  } = {},
  options: ExportRequestOptions = {},
): Promise<ExportListResponse> {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set("page", String(Math.max(1, Math.floor(query.page))));
  if (query.page_size !== undefined) params.set("page_size", String(Math.max(1, Math.floor(query.page_size))));
  if (query.status) params.set("status", query.status);
  if (query.export_code) params.set("export_code", query.export_code);
  if (query.created_from) params.set("created_from", query.created_from);
  if (query.created_to) params.set("created_to", query.created_to);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return fetchAuthenticatedJson<ExportListResponse>(`${EXPORT_PATH}${suffix}`, requestOptions(options));
}

export function getExportTask(
  exportID: string,
  options: ExportRequestOptions = {},
): Promise<ExportTask> {
  return fetchAuthenticatedJson<ExportTask>(taskPath(exportID), requestOptions(options));
}

export function cancelExportTask(
  exportID: string,
  options: ExportRequestOptions = {},
): Promise<ExportTask> {
  // 中文：取消接口按文档要求不携带请求体，避免服务端将空对象误判为非法参数。
  return fetchAuthenticatedJson<ExportTask>(taskPath(exportID, "/cancel"), {
    ...requestOptions(options),
    method: "POST",
  });
}

export function downloadExportTask(
  exportID: string,
  options: ExportRequestOptions = {},
): Promise<Response> {
  return fetchAuthenticatedResponse(taskPath(exportID, "/download"), {
    ...requestOptions(options),
    headers: {
      Accept: "*/*",
      ...requestOptions(options).headers,
    },
  });
}

function abortableDelay(delayMs: number, signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, delayMs);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** 中文：轮询只在任务未结束时继续，避免任务失败后继续请求下载接口。 */
export async function waitForExportTask(
  exportID: string,
  options: WaitForExportOptions = {},
): Promise<ExportTask> {
  const startedAt = Date.now();
  const pollIntervalMs = Math.max(300, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  const timeoutMs = Math.max(pollIntervalMs, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let task = await getExportTask(exportID, options);
  options.onProgress?.(task);
  while (task.status === "queued" || task.status === "running") {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new ApiError(i18n.t("api.exports.timeout"), 408, 150009, null);
    }
    await abortableDelay(pollIntervalMs, options.signal);
    task = await getExportTask(exportID, options);
    options.onProgress?.(task);
  }
  if (task.status !== "succeeded") {
    throw new ExportTaskError(
      task.error_message?.trim() || i18n.t("api.exports.taskFailed"),
      task,
    );
  }
  if (!task.downloadable) {
    throw new ExportTaskError(i18n.t("api.exports.notDownloadable"), task);
  }
  return task;
}

export class ExportTaskError extends Error {
  readonly task: ExportTask;

  constructor(message: string, task: ExportTask) {
    super(message);
    this.name = "ExportTaskError";
    this.task = task;
  }
}

/** 中文：用服务端文件名触发下载，避免前端自行猜测 CSV/XLSX 后缀。 */
export async function saveExportResponse(
  response: Response,
  fileName: string,
  preferredBaseName?: string,
): Promise<void> {
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const extension = fileName.match(/\.[^./\\]+$/)?.[0] ?? "";
  link.download = preferredBaseName?.trim()
    ? `${preferredBaseName.trim()}${extension}`
    : fileName || "export";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function getExportErrorMessage(error: unknown): string {
  if (error instanceof ExportTaskError) return error.message;
  if (!isApiError(error)) {
    return error instanceof Error && error.message
      ? error.message
      : i18n.t("api.exports.requestFailed");
  }
  const keys: Record<number, string> = {
    150001: "api.exports.invalidInput",
    150002: "api.exports.forbidden",
    150003: "api.exports.taskMissing",
    150004: "api.exports.conflict",
    150005: "api.exports.limitReached",
    150006: "api.exports.notReady",
    150007: "api.exports.expired",
    150008: "api.exports.storageUnavailable",
    150009: "api.exports.timeout",
  };
  return keys[error.code] ? i18n.t(keys[error.code]) : error.message || i18n.t("api.exports.requestFailed");
}
