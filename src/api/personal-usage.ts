import { fetchAuthenticatedJson } from "./authenticated";
import { ApiError, isApiError } from "./http";
import i18n from "@/i18n";

export const USER_USAGE_OVERVIEW_PATH = "/api/user/usage/overview";
export const USER_USAGE_TREND_PATH = "/api/user/usage/trend";
export const USER_USAGE_RECORDS_PATH = "/api/user/usage/records";
export const USER_TOKEN_DAILY_PATH = "/api/user/usage/token-daily";

export type PersonalUsageContext =
  | { account_type: "personal" }
  | { account_type: "enterprise"; enterprise_id: string };

export interface UsageOverviewModel {
  name: string;
  vendor: string;
  total_cost_yuan: string;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
}

export type UsageDistribution =
  Array<Record<string, unknown>> | Record<string, number | string> | null;

export interface UsageOverviewResponse {
  total_cost_yuan: string;
  account_balance_yuan: string;
  models: UsageOverviewModel[];
  model_distribution?: UsageDistribution;
  tool_distribution?: UsageDistribution;
}

export type UsageTrendSeriesName = "requests" | "tokens" | "cost";
export type UsageTrendRange = "today" | "7d" | "30d" | "60d" | "90d" | "custom";

export type UsageTrendQuery =
  | { range: Exclude<UsageTrendRange, "custom">; granularity?: "day" }
  | {
      range: "custom";
      granularity?: "day";
      start_at: number;
      end_at: number;
    };

export interface UsageTrendResponse {
  period: { range: string; start_at: number; end_at: number; label: string };
  granularity: string;
  model_distribution?: UsageDistribution;
  tool_distribution?: UsageDistribution;
  xAxis: { type: "category"; boundaryGap: boolean; data: number[] };
  yAxis: { type: "value" };
  series: Array<{
    name: UsageTrendSeriesName;
    type: "line";
    stack: string;
    data: number[];
  }>;
}

export interface UsageRecord {
  id: string;
  request_id: string;
  event_type: string;
  occurred_at: number;
  model_code: string;
  model_alias: string;
  model_name: string;
  client_tool_id: string;
  client_tool_name: string;
  status: "success" | "error" | "cancelled";
  api_key_id: string;
  api_key_name: string;
  member_id: string;
  member_name: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cache_hit_rate: number | null;
  latency_ms: number | null;
  first_token_ms: number | null;
  stream: boolean | null;
  relay_format?: string;
  cost_yuan: string;
  status_code?: number;
  error_code?: string;
  error_message?: string;
  channel: string;
  task_id?: string;
  task_status?: string;
  task_reason?: string;
}

export interface UsageRecordsResponse {
  account: { id: string; type: "personal" | "enterprise"; name: string };
  can_filter_members: boolean;
  can_view_billing: boolean;
  filters: { api_keys: unknown[]; models: unknown[]; members: unknown[] };
  items: UsageRecord[];
  page: number;
  page_size: number;
  total: number;
}

export interface UsageRecordsQuery {
  page: number;
  page_size: number;
  start_at?: number;
  end_at?: number;
  /** 中文：按 API 密钥筛选明细，后端字段稳定后只需在此处对齐。 */
  api_key_id?: string;
}

export interface DailyTokenUsageItem {
  date: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface DailyTokenUsageResponse {
  account: { id: string; type: "personal" | "enterprise"; name: string };
  start_at: number;
  end_at: number;
  items: DailyTokenUsageItem[];
}

function contextParams(context: PersonalUsageContext): URLSearchParams {
  const params = new URLSearchParams({ account_type: context.account_type });
  if (context.account_type === "enterprise") {
    const enterpriseID = context.enterprise_id.trim();
    if (!enterpriseID)
      throw new Error(i18n.t("api.personalUsage.enterpriseMissing"));
    params.set("enterprise_id", enterpriseID);
  }
  return params;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isMoney(value: unknown): value is string {
  return typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value);
}

function invalidResponse(): ApiError {
  return new ApiError(
    i18n.t("api.personalUsage.invalidResponse"),
    502,
    100002,
    null,
  );
}

function isUsageOverviewModel(value: unknown): value is UsageOverviewModel {
  if (!value || typeof value !== "object") return false;
  const model = value as Partial<UsageOverviewModel>;
  return (
    typeof model.name === "string" &&
    typeof model.vendor === "string" &&
    isMoney(model.total_cost_yuan) &&
    isFiniteNumber(model.request_count) &&
    isFiniteNumber(model.input_tokens) &&
    isFiniteNumber(model.output_tokens) &&
    isFiniteNumber(model.cached_tokens)
  );
}

function isUsageDistribution(value: unknown): value is UsageDistribution {
  if (value === null) return true;
  if (Array.isArray(value)) {
    return value.every(
      (item) =>
        item !== null && typeof item === "object" && !Array.isArray(item),
    );
  }
  if (!value || typeof value !== "object") return false;
  // 中文：兼容聚合接口把对象映射中的计数返回为数字字符串。
  return Object.values(value).every(
    (item) =>
      isFiniteNumber(item) ||
      (typeof item === "string" &&
        item.trim() !== "" &&
        Number.isFinite(Number(item))),
  );
}

function isUsageOverviewResponse(
  value: unknown,
): value is UsageOverviewResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<UsageOverviewResponse>;
  return (
    isMoney(response.total_cost_yuan) &&
    isMoney(response.account_balance_yuan) &&
    Array.isArray(response.models) &&
    response.models.every(isUsageOverviewModel) &&
    (response.model_distribution === undefined ||
      isUsageDistribution(response.model_distribution)) &&
    (response.tool_distribution === undefined ||
      isUsageDistribution(response.tool_distribution))
  );
}

export function getUsageOverview(
  signal?: AbortSignal,
  apiKeyID?: string,
): Promise<UsageOverviewResponse> {
  const params = new URLSearchParams();
  if (apiKeyID?.trim()) params.set("api_key_id", apiKeyID.trim());
  const path = params.toString()
    ? `${USER_USAGE_OVERVIEW_PATH}?${params.toString()}`
    : USER_USAGE_OVERVIEW_PATH;
  return fetchAuthenticatedJson<unknown>(path, { signal }).then((value) => {
    if (!isUsageOverviewResponse(value)) throw invalidResponse();
    return value;
  });
}

function isUsageTrendResponse(value: unknown): value is UsageTrendResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<UsageTrendResponse>;
  if (
    !response.period ||
    !response.xAxis ||
    !response.yAxis ||
    !Array.isArray(response.series)
  )
    return false;
  if (
    !Array.isArray(response.xAxis.data) ||
    !response.xAxis.data.every(isFiniteNumber)
  )
    return false;
  const expectedNames = new Set<UsageTrendSeriesName>([
    "requests",
    "tokens",
    "cost",
  ]);
  const receivedNames = new Set(response.series.map((series) => series?.name));
  return (
    response.xAxis.type === "category" &&
    typeof response.xAxis.boundaryGap === "boolean" &&
    response.yAxis.type === "value" &&
    response.series.length === 3 &&
    (response.model_distribution === undefined ||
      isUsageDistribution(response.model_distribution)) &&
    (response.tool_distribution === undefined ||
      isUsageDistribution(response.tool_distribution)) &&
    receivedNames.size === expectedNames.size &&
    [...expectedNames].every((name) => receivedNames.has(name)) &&
    response.series.every(
      (series) =>
        expectedNames.has(series.name) &&
        series.type === "line" &&
        Array.isArray(series.data) &&
        series.data.length === response.xAxis?.data.length &&
        series.data.every(isFiniteNumber),
    )
  );
}

export function getUsageTrend(
  context: PersonalUsageContext,
  query: UsageTrendQuery,
  signal?: AbortSignal,
): Promise<UsageTrendResponse> {
  const params = contextParams(context);
  params.set("range", query.range);
  params.set("granularity", query.granularity ?? "day");
  if (query.range === "custom") {
    params.set("start_at", String(query.start_at));
    params.set("end_at", String(query.end_at));
  }
  return fetchAuthenticatedJson<unknown>(
    `${USER_USAGE_TREND_PATH}?${params.toString()}`,
    { signal },
  ).then((value) => {
    if (!isUsageTrendResponse(value)) throw invalidResponse();
    return value;
  });
}

function isUsageRecord(value: unknown): value is UsageRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<UsageRecord>;
  return (
    typeof record.id === "string" &&
    typeof record.request_id === "string" &&
    isFiniteNumber(record.occurred_at) &&
    typeof record.model_code === "string" &&
    typeof record.model_alias === "string" &&
    typeof record.model_name === "string" &&
    typeof record.client_tool_name === "string" &&
    (record.status === "success" ||
      record.status === "error" ||
      record.status === "cancelled") &&
    isFiniteNumber(record.input_tokens) &&
    isFiniteNumber(record.output_tokens) &&
    isFiniteNumber(record.cached_tokens) &&
    isMoney(record.cost_yuan)
  );
}

function isUsageRecordsResponse(value: unknown): value is UsageRecordsResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<UsageRecordsResponse>;
  return (
    Boolean(response.account) &&
    Array.isArray(response.items) &&
    response.items.every(isUsageRecord) &&
    isFiniteNumber(response.page) &&
    isFiniteNumber(response.page_size) &&
    isFiniteNumber(response.total)
  );
}

export function getUsageRecords(
  context: PersonalUsageContext,
  query: UsageRecordsQuery,
  signal?: AbortSignal,
): Promise<UsageRecordsResponse> {
  const params = contextParams(context);
  params.set("page", String(Math.max(1, Math.floor(query.page))));
  params.set(
    "page_size",
    String(Math.min(100, Math.max(1, Math.floor(query.page_size)))),
  );
  if (query.start_at !== undefined)
    params.set("start_at", String(query.start_at));
  if (query.end_at !== undefined) params.set("end_at", String(query.end_at));
  if (query.api_key_id?.trim())
    params.set("api_key_id", query.api_key_id.trim());
  return fetchAuthenticatedJson<unknown>(
    `${USER_USAGE_RECORDS_PATH}?${params.toString()}`,
    { signal },
  ).then((value) => {
    if (!isUsageRecordsResponse(value)) throw invalidResponse();
    return value;
  });
}

function isDailyTokenUsageItem(value: unknown): value is DailyTokenUsageItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DailyTokenUsageItem>;
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(item.date ?? "") &&
    isFiniteNumber(item.input_tokens) &&
    isFiniteNumber(item.output_tokens) &&
    isFiniteNumber(item.total_tokens)
  );
}

function isDailyTokenUsageResponse(
  value: unknown,
): value is DailyTokenUsageResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<DailyTokenUsageResponse>;
  return (
    Boolean(response.account) &&
    isFiniteNumber(response.start_at) &&
    isFiniteNumber(response.end_at) &&
    Array.isArray(response.items) &&
    response.items.every(isDailyTokenUsageItem)
  );
}

export function getDailyTokenUsage(
  context: PersonalUsageContext,
  signal?: AbortSignal,
): Promise<DailyTokenUsageResponse> {
  const params = contextParams(context);
  return fetchAuthenticatedJson<unknown>(
    `${USER_TOKEN_DAILY_PATH}?${params.toString()}`,
    { signal },
  ).then((value) => {
    if (!isDailyTokenUsageResponse(value)) throw invalidResponse();
    return value;
  });
}

export function getPersonalUsageErrorMessage(error: unknown): string {
  if (!isApiError(error))
    return error instanceof Error && error.message
      ? error.message
      : i18n.t("api.personalUsage.loadFailed");
  if (error.status === 403) return i18n.t("api.personalUsage.forbidden");
  return error.message || i18n.t("api.personalUsage.loadFailed");
}

export const getDailyTokenUsageErrorMessage = getPersonalUsageErrorMessage;
