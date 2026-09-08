import i18n from "@/i18n";
import { fetchAuthenticatedJson } from "./authenticated";
import { ApiError, isApiError } from "./http";

export const USER_USAGE_OVERVIEW_PATH = "/api/user/usage/overview";
export const USER_USAGE_SUMMARY_PATH = "/api/user/usage/summary";
export const USER_USAGE_FILTERS_PATH = "/api/user/usage/filters";
export const USER_USAGE_MODELS_PATH = "/api/user/usage/models";
export const USER_USAGE_TREND_PATH = "/api/user/usage/trend";
export const USER_USAGE_ANALYSIS_PATH = "/api/user/usage/analysis";
export const USER_USAGE_RECORDS_PATH = "/api/user/usage/records";
export const USER_TOKEN_DAILY_PATH = "/api/user/usage/token-daily";

export type UsageAccountType = "personal" | "enterprise";
export type UsageStatus = "success" | "error" | "cancelled";
export type UsageStatusFilter = UsageStatus | "all";
export type UsageRange = "today" | "7d" | "30d" | "60d" | "90d" | "custom";
export type UsageModelRange = "today" | "7d" | "30d" | "custom";
export type UsageGranularity = "hour" | "day" | "week" | "month";
export type UsageMetric = "requests" | "tokens" | "cost";
export type UsageQueryTimestamp = number | string;

export type PersonalUsageContext =
  | { account_type: "personal" }
  | { account_type: "enterprise"; enterprise_id: string };

export interface UsageAccount {
  id: string;
  type: UsageAccountType;
  name: string;
}

export interface UsagePeriod {
  range: string;
  start_at: number;
  end_at: number;
  label: string;
}

export interface UsageDistributionItem {
  name: string;
  code?: string;
  alias?: string;
  id?: string;
  request_count?: number;
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  cost_yuan?: string;
}

export type UsageDistribution = UsageDistributionItem[];

/** 顶部摘要接口（/summary）返回的指标。 */
export interface UsageSummaryMetrics {
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  total_cost_yuan: string;
  average_latency_ms: number | null;
  success_rate: number | null;
}

export interface UsageSummaryResponse {
  can_view_billing: boolean;
  metrics: UsageSummaryMetrics;
}

export interface UsageSummaryQuery {
  range?: UsageModelRange;
  api_key_id?: string;
  model?: string;
  status?: UsageStatusFilter;
  member_id?: string;
  start_at?: UsageQueryTimestamp;
  end_at?: UsageQueryTimestamp;
}

export interface UsageFilterModel {
  code: string;
  alias: string;
  name: string;
  requests: number;
}

export interface UsageFilterApiKey {
  id: string;
  name: string;
  requests: number;
}

export interface UsageFilterStatus {
  value: UsageStatus;
  requests: number;
}

export interface UsageFilterMember {
  id: string;
  name: string;
}

export interface UsageFiltersResponse {
  can_filter_members: boolean;
  models: UsageFilterModel[];
  api_keys: UsageFilterApiKey[];
  statuses: UsageFilterStatus[];
  members: UsageFilterMember[];
}

export interface UsageModelStat {
  model_code: string;
  model_alias: string;
  model_name: string;
  vendor: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost_yuan: string;
  average_latency_ms: number | null;
}

export interface UsageModelsResponse {
  can_view_billing: boolean;
  items: UsageModelStat[];
  page: number;
  page_size: number;
  total: number;
}

export interface UsageModelsQuery extends UsageSummaryQuery {
  page?: number;
  page_size?: number;
}

export interface UsageOverviewModel {
  name: string;
  vendor: string;
  total_cost_yuan: string;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
}

/**
 * 旧版总览接口仍由部分外部页面保留调用，但 /console/usage 已迁移到
 * summary/filters/models。该类型仅描述总览接口自身的历史合同。
 */
export interface UsageOverviewResponse {
  total_cost_yuan: string;
  account_balance_yuan: string;
  models: UsageOverviewModel[];
  model_distribution?: UsageDistribution;
  tool_distribution?: UsageDistribution;
}

export type UsageTrendSeriesName = "requests" | "tokens" | "cost";

export type UsageTrendQuery = {
  range?: UsageRange;
  granularity?: UsageGranularity;
  metric?: UsageMetric;
  api_key_id?: string;
  model?: string;
  status?: UsageStatusFilter;
  member_id?: string;
  start_at?: UsageQueryTimestamp;
  end_at?: UsageQueryTimestamp;
};

export interface UsageTrendAxisX {
  type: "category";
  boundary_gap: false;
  data: number[];
}

export interface UsageTrendAxisY {
  type: "value";
}

export interface UsageTrendSeries {
  name: UsageTrendSeriesName;
  type: "line";
  stack: "Total";
  data: number[];
}

export interface UsageTrendBucketModel {
  code: string;
  alias: string;
  name: string;
  request_count?: number;
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  cost_yuan?: string;
}

export interface UsageTrendBucket {
  bucket_start: number;
  request_count?: number;
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  cost_yuan?: string;
  models: UsageTrendBucketModel[];
}

export interface UsageTrendResponse {
  period: UsagePeriod;
  granularity: UsageGranularity;
  x_axis: UsageTrendAxisX;
  y_axis: UsageTrendAxisY;
  series: UsageTrendSeries[];
  can_view_billing: boolean;
  metric: UsageMetric;
  buckets: UsageTrendBucket[];
  model_distribution: UsageDistribution;
  tool_distribution: UsageDistribution;
  api_key_distribution: UsageDistribution;
}

export interface UsageAnalysisSubject {
  id: string;
  name: string;
}

export interface UsageAnalysisResponse {
  account: UsageAccount;
  subject: UsageAnalysisSubject;
  period: UsagePeriod;
  can_view_billing: boolean;
  activity: Record<string, unknown>;
  reliability: Record<string, unknown>;
  efficiency: Record<string, unknown>;
  usage_patterns: Record<string, unknown>;
  models: Array<Record<string, unknown>>;
  tools: Array<Record<string, unknown>>;
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
  status: UsageStatus;
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

export interface UsageRecordAggregate {
  id: string;
  bucket_start: number;
  bucket_end: number;
  granularity: UsageGranularity;
  model_code: string;
  model_alias: string;
  model_name: string;
  vendor: string;
  requests: number;
  success_count: number;
  error_count: number;
  cancelled_count: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost_yuan: string;
  average_latency_ms: number | null;
}

export type UsageRecordItem = UsageRecord | UsageRecordAggregate;

export interface UsageRecordsFilters {
  api_keys: Array<Record<string, unknown>>;
  models: Array<Record<string, unknown>>;
  members: Array<Record<string, unknown>>;
}

export interface UsageRecordsResponse<
  TItem extends UsageRecordItem = UsageRecord,
> {
  account: UsageAccount;
  can_filter_members: boolean;
  can_view_billing: boolean;
  filters: UsageRecordsFilters;
  items: TItem[];
  granularity?: UsageGranularity;
  page: number;
  page_size: number;
  total: number;
}

export interface UsageRecordsQuery {
  page?: number;
  page_size?: number;
  api_key_id?: string;
  model?: string;
  status?: UsageStatusFilter;
  member_id?: string;
  request_id?: string;
  start_at?: UsageQueryTimestamp;
  end_at?: UsageQueryTimestamp;
  aggregate?: boolean;
  granularity?: UsageGranularity;
}

export interface DailyTokenUsageItem {
  date: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface DailyTokenUsageResponse {
  account: UsageAccount;
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

// 中文：空字符串和 status=all 表示不筛选，其余值（包括 0）原样交给后端校验。
function appendQuery(
  params: URLSearchParams,
  values: Record<
    string,
    UsageQueryTimestamp | UsageStatusFilter | boolean | undefined
  >,
): void {
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined || value === "all") return;
    if (typeof value === "string") {
      const normalized = value.trim();
      if (!normalized) return;
      params.set(key, normalized);
      return;
    }
    params.set(key, String(value));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0;
}

function isMoney(value: unknown): value is string {
  return typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isAccount(value: unknown): value is UsageAccount {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    (value.type === "personal" || value.type === "enterprise") &&
    typeof value.name === "string"
  );
}

function isPeriod(value: unknown): value is UsagePeriod {
  if (!isRecord(value)) return false;
  return (
    isUsageRange(value.range) &&
    isNonNegativeInteger(value.start_at) &&
    isNonNegativeInteger(value.end_at) &&
    typeof value.label === "string"
  );
}

function invalidResponse(): ApiError {
  return new ApiError(
    i18n.t("api.personalUsage.invalidResponse"),
    502,
    100002,
    null,
  );
}

async function fetchValidated<T>(
  path: string,
  signal: AbortSignal | undefined,
  guard: (value: unknown) => value is T,
): Promise<T> {
  const value = await fetchAuthenticatedJson<unknown>(path, { signal });
  if (!guard(value)) throw invalidResponse();
  return value;
}

function isUsageOverviewModel(value: unknown): value is UsageOverviewModel {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === "string" &&
    typeof value.vendor === "string" &&
    isMoney(value.total_cost_yuan) &&
    isNonNegativeInteger(value.request_count) &&
    isNonNegativeInteger(value.input_tokens) &&
    isNonNegativeInteger(value.output_tokens) &&
    isNonNegativeInteger(value.cached_tokens)
  );
}

function isDistributionItem(
  value: unknown,
  kind: "model" | "tool" | "api_key",
  metric: UsageMetric,
): value is UsageDistributionItem {
  if (!isRecord(value) || typeof value.name !== "string") return false;
  if (
    kind === "model" &&
    (typeof value.code !== "string" || typeof value.alias !== "string")
  )
    return false;
  if (kind !== "model" && typeof value.id !== "string") return false;
  if (metric === "requests") return isNonNegativeInteger(value.request_count);
  if (metric === "tokens") {
    return (
      isNonNegativeInteger(value.input_tokens) &&
      isNonNegativeInteger(value.output_tokens) &&
      isNonNegativeInteger(value.cached_tokens)
    );
  }
  return isMoney(value.cost_yuan);
}

function isUsageDistribution(value: unknown): value is UsageDistribution {
  return Array.isArray(value) && value.every((item) => isRecord(item));
}

function isUsageOverviewResponse(
  value: unknown,
): value is UsageOverviewResponse {
  if (!isRecord(value)) return false;
  return (
    isMoney(value.total_cost_yuan) &&
    isMoney(value.account_balance_yuan) &&
    Array.isArray(value.models) &&
    value.models.every(isUsageOverviewModel) &&
    (value.model_distribution === undefined ||
      isUsageDistribution(value.model_distribution)) &&
    (value.tool_distribution === undefined ||
      isUsageDistribution(value.tool_distribution))
  );
}

function isUsageSummaryMetrics(value: unknown): value is UsageSummaryMetrics {
  if (!isRecord(value)) return false;
  return (
    isNonNegativeInteger(value.request_count) &&
    isNonNegativeInteger(value.input_tokens) &&
    isNonNegativeInteger(value.output_tokens) &&
    isMoney(value.total_cost_yuan) &&
    isNullableNumber(value.average_latency_ms) &&
    isNullableNumber(value.success_rate)
  );
}

function isUsageSummaryResponse(value: unknown): value is UsageSummaryResponse {
  return (
    isRecord(value) &&
    typeof value.can_view_billing === "boolean" &&
    isUsageSummaryMetrics(value.metrics)
  );
}

function isUsageFilterModel(value: unknown): value is UsageFilterModel {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.alias === "string" &&
    typeof value.name === "string" &&
    isNonNegativeInteger(value.requests)
  );
}

function isUsageFilterApiKey(value: unknown): value is UsageFilterApiKey {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isNonNegativeInteger(value.requests)
  );
}

function isUsageFiltersResponse(value: unknown): value is UsageFiltersResponse {
  if (!isRecord(value)) return false;
  return (
    typeof value.can_filter_members === "boolean" &&
    Array.isArray(value.models) &&
    value.models.every(isUsageFilterModel) &&
    Array.isArray(value.api_keys) &&
    value.api_keys.every(isUsageFilterApiKey) &&
    Array.isArray(value.statuses) &&
    value.statuses.every(
      (item) =>
        isRecord(item) &&
        (item.value === "success" ||
          item.value === "error" ||
          item.value === "cancelled") &&
        isNonNegativeInteger(item.requests),
    ) &&
    Array.isArray(value.members) &&
    value.members.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === "string" &&
        typeof item.name === "string",
    )
  );
}

function isUsageModelStat(value: unknown): value is UsageModelStat {
  if (!isRecord(value)) return false;
  return (
    typeof value.model_code === "string" &&
    typeof value.model_alias === "string" &&
    typeof value.model_name === "string" &&
    typeof value.vendor === "string" &&
    isNonNegativeInteger(value.requests) &&
    isNonNegativeInteger(value.input_tokens) &&
    isNonNegativeInteger(value.output_tokens) &&
    isNonNegativeInteger(value.cached_tokens) &&
    isMoney(value.cost_yuan) &&
    isNullableNumber(value.average_latency_ms)
  );
}

function isUsageModelsResponse(value: unknown): value is UsageModelsResponse {
  if (!isRecord(value)) return false;
  return (
    typeof value.can_view_billing === "boolean" &&
    Array.isArray(value.items) &&
    value.items.every(isUsageModelStat) &&
    isPositiveInteger(value.page) &&
    isPositiveInteger(value.page_size) &&
    isNonNegativeInteger(value.total)
  );
}

function isUsageMetric(value: unknown): value is UsageMetric {
  return value === "requests" || value === "tokens" || value === "cost";
}

function isUsageGranularity(value: unknown): value is UsageGranularity {
  return (
    value === "hour" || value === "day" || value === "week" || value === "month"
  );
}

function isUsageTrendBucketModel(
  value: unknown,
  metric: UsageMetric,
): value is UsageTrendBucketModel {
  if (
    !isRecord(value) ||
    typeof value.code !== "string" ||
    typeof value.alias !== "string" ||
    typeof value.name !== "string"
  )
    return false;
  return metric === "requests"
    ? isNonNegativeInteger(value.request_count)
    : metric === "tokens"
      ? isNonNegativeInteger(value.input_tokens) &&
        isNonNegativeInteger(value.output_tokens) &&
        isNonNegativeInteger(value.cached_tokens)
      : isMoney(value.cost_yuan);
}

function isUsageTrendBucket(
  value: unknown,
  metric: UsageMetric,
): value is UsageTrendBucket {
  if (!isRecord(value) || !isNonNegativeInteger(value.bucket_start))
    return false;
  const metricValid =
    metric === "requests"
      ? isNonNegativeInteger(value.request_count)
      : metric === "tokens"
        ? isNonNegativeInteger(value.input_tokens) &&
          isNonNegativeInteger(value.output_tokens) &&
          isNonNegativeInteger(value.cached_tokens)
        : isMoney(value.cost_yuan);
  return (
    metricValid &&
    Array.isArray(value.models) &&
    value.models.every((item) => isUsageTrendBucketModel(item, metric))
  );
}

function isUsageRange(value: unknown): value is UsageRange {
  return (
    value === "today" ||
    value === "7d" ||
    value === "30d" ||
    value === "60d" ||
    value === "90d" ||
    value === "custom"
  );
}

function isUsageTrendResponse(value: unknown): value is UsageTrendResponse {
  if (!isRecord(value)) return false;
  const metric = value.metric;
  if (
    !isPeriod(value.period) ||
    !isUsageGranularity(value.granularity) ||
    typeof value.can_view_billing !== "boolean" ||
    !isUsageMetric(metric) ||
    !isRecord(value.x_axis) ||
    value.x_axis.type !== "category" ||
    value.x_axis.boundary_gap !== false ||
    !Array.isArray(value.x_axis.data) ||
    !value.x_axis.data.every(isNonNegativeInteger) ||
    !isRecord(value.y_axis) ||
    value.y_axis.type !== "value" ||
    !Array.isArray(value.series) ||
    value.series.length !== 3 ||
    !Array.isArray(value.buckets) ||
    !value.buckets.every((item) => isUsageTrendBucket(item, metric)) ||
    !Array.isArray(value.model_distribution) ||
    !value.model_distribution.every((item) =>
      isDistributionItem(item, "model", metric),
    ) ||
    !Array.isArray(value.tool_distribution) ||
    !value.tool_distribution.every((item) =>
      isDistributionItem(item, "tool", metric),
    ) ||
    !Array.isArray(value.api_key_distribution) ||
    !value.api_key_distribution.every((item) =>
      isDistributionItem(item, "api_key", metric),
    )
  )
    return false;

  const expectedNames = new Set<UsageTrendSeriesName>([
    "requests",
    "tokens",
    "cost",
  ]);
  const receivedNames = new Set<unknown>();
  for (const series of value.series) {
    if (!isRecord(series)) return false;
    receivedNames.add(series.name);
    if (
      !expectedNames.has(series.name as UsageTrendSeriesName) ||
      series.type !== "line" ||
      series.stack !== "Total" ||
      !Array.isArray(series.data) ||
      series.data.length !== value.x_axis.data.length ||
      !series.data.every(isFiniteNumber)
    )
      return false;
  }
  return (
    receivedNames.size === expectedNames.size &&
    [...expectedNames].every((name) => receivedNames.has(name))
  );
}

function isUsageAnalysisResponse(
  value: unknown,
): value is UsageAnalysisResponse {
  if (!isRecord(value)) return false;
  return (
    isAccount(value.account) &&
    isRecord(value.subject) &&
    typeof value.subject.id === "string" &&
    typeof value.subject.name === "string" &&
    isPeriod(value.period) &&
    typeof value.can_view_billing === "boolean" &&
    isRecord(value.activity) &&
    isRecord(value.reliability) &&
    isRecord(value.efficiency) &&
    isRecord(value.usage_patterns) &&
    Array.isArray(value.models) &&
    Array.isArray(value.tools)
  );
}

function isUsageRecord(value: unknown): value is UsageRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.request_id === "string" &&
    typeof value.event_type === "string" &&
    isFiniteNumber(value.occurred_at) &&
    typeof value.model_code === "string" &&
    typeof value.model_alias === "string" &&
    typeof value.model_name === "string" &&
    typeof value.client_tool_id === "string" &&
    typeof value.client_tool_name === "string" &&
    (value.status === "success" ||
      value.status === "error" ||
      value.status === "cancelled") &&
    typeof value.api_key_id === "string" &&
    typeof value.api_key_name === "string" &&
    typeof value.member_id === "string" &&
    typeof value.member_name === "string" &&
    isNonNegativeInteger(value.input_tokens) &&
    isNonNegativeInteger(value.output_tokens) &&
    isNonNegativeInteger(value.cached_tokens) &&
    isNullableNumber(value.cache_hit_rate) &&
    isNullableNumber(value.latency_ms) &&
    isNullableNumber(value.first_token_ms) &&
    (value.stream === null || typeof value.stream === "boolean") &&
    (value.relay_format === undefined ||
      typeof value.relay_format === "string") &&
    isMoney(value.cost_yuan) &&
    (value.status_code === undefined ||
      isNonNegativeInteger(value.status_code)) &&
    (value.error_code === undefined || typeof value.error_code === "string") &&
    (value.error_message === undefined ||
      typeof value.error_message === "string") &&
    typeof value.channel === "string" &&
    (value.task_id === undefined || typeof value.task_id === "string") &&
    (value.task_status === undefined ||
      typeof value.task_status === "string") &&
    (value.task_reason === undefined || typeof value.task_reason === "string")
  );
}

function isUsageRecordAggregate(value: unknown): value is UsageRecordAggregate {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    isNonNegativeInteger(value.bucket_start) &&
    isNonNegativeInteger(value.bucket_end) &&
    isUsageGranularity(value.granularity) &&
    typeof value.model_code === "string" &&
    typeof value.model_alias === "string" &&
    typeof value.model_name === "string" &&
    typeof value.vendor === "string" &&
    isNonNegativeInteger(value.requests) &&
    isNonNegativeInteger(value.success_count) &&
    isNonNegativeInteger(value.error_count) &&
    isNonNegativeInteger(value.cancelled_count) &&
    isNonNegativeInteger(value.input_tokens) &&
    isNonNegativeInteger(value.output_tokens) &&
    isNonNegativeInteger(value.cached_tokens) &&
    isMoney(value.cost_yuan) &&
    isNullableNumber(value.average_latency_ms)
  );
}

function isUsageRecordsResponse<TItem extends UsageRecordItem>(
  value: unknown,
  aggregate: boolean,
): value is UsageRecordsResponse<TItem> {
  if (!isRecord(value)) return false;
  if (
    !isAccount(value.account) ||
    typeof value.can_filter_members !== "boolean" ||
    typeof value.can_view_billing !== "boolean" ||
    !isRecord(value.filters) ||
    !Array.isArray(value.filters.api_keys) ||
    !Array.isArray(value.filters.models) ||
    !Array.isArray(value.filters.members) ||
    !Array.isArray(value.items) ||
    !isPositiveInteger(value.page) ||
    !isPositiveInteger(value.page_size) ||
    !isNonNegativeInteger(value.total)
  )
    return false;
  if (value.granularity !== undefined && !isUsageGranularity(value.granularity))
    return false;
  return aggregate
    ? value.items.every(isUsageRecordAggregate)
    : value.items.every(isUsageRecord);
}

function isDailyTokenUsageItem(value: unknown): value is DailyTokenUsageItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.date) &&
    isNonNegativeInteger(value.input_tokens) &&
    isNonNegativeInteger(value.output_tokens) &&
    isNonNegativeInteger(value.total_tokens)
  );
}

function isDailyTokenUsageResponse(
  value: unknown,
): value is DailyTokenUsageResponse {
  return (
    isRecord(value) &&
    isAccount(value.account) &&
    isNonNegativeInteger(value.start_at) &&
    isNonNegativeInteger(value.end_at) &&
    Array.isArray(value.items) &&
    value.items.every(isDailyTokenUsageItem)
  );
}

/** 旧版全量总览接口；新用量页不再把 API Key 过滤条件拼到此路径。 */
export function getUsageOverview(
  signal?: AbortSignal,
  _legacyApiKeyID?: string,
): Promise<UsageOverviewResponse> {
  return fetchValidated(
    USER_USAGE_OVERVIEW_PATH,
    signal,
    isUsageOverviewResponse,
  );
}

export function getUsageSummary(
  context: PersonalUsageContext,
  query: UsageSummaryQuery = {},
  signal?: AbortSignal,
): Promise<UsageSummaryResponse> {
  const params = contextParams(context);
  appendQuery(params, {
    range: query.range,
    api_key_id: query.api_key_id,
    model: query.model,
    status: query.status,
    member_id: query.member_id,
    start_at: query.start_at,
    end_at: query.end_at,
  });
  return fetchValidated(
    `${USER_USAGE_SUMMARY_PATH}?${params.toString()}`,
    signal,
    isUsageSummaryResponse,
  );
}

export function getUsageFilters(
  context: PersonalUsageContext,
  signal?: AbortSignal,
): Promise<UsageFiltersResponse> {
  const params = contextParams(context);
  return fetchValidated(
    `${USER_USAGE_FILTERS_PATH}?${params.toString()}`,
    signal,
    isUsageFiltersResponse,
  );
}

export function getUsageModels(
  context: PersonalUsageContext,
  query: UsageModelsQuery = {},
  signal?: AbortSignal,
): Promise<UsageModelsResponse> {
  const params = contextParams(context);
  appendQuery(params, {
    range: query.range,
    api_key_id: query.api_key_id,
    model: query.model,
    status: query.status,
    member_id: query.member_id,
    start_at: query.start_at,
    end_at: query.end_at,
    page: query.page ?? 1,
    page_size: query.page_size ?? 20,
  });
  return fetchValidated(
    `${USER_USAGE_MODELS_PATH}?${params.toString()}`,
    signal,
    isUsageModelsResponse,
  );
}

export function getUsageTrend(
  context: PersonalUsageContext,
  query: UsageTrendQuery = {},
  signal?: AbortSignal,
): Promise<UsageTrendResponse> {
  const params = contextParams(context);
  appendQuery(params, {
    range: query.range,
    granularity: query.granularity,
    metric: query.metric,
    api_key_id: query.api_key_id,
    model: query.model,
    status: query.status,
    member_id: query.member_id,
    start_at: query.start_at,
    end_at: query.end_at,
  });
  return fetchValidated(
    `${USER_USAGE_TREND_PATH}?${params.toString()}`,
    signal,
    isUsageTrendResponse,
  );
}

export interface UsageAnalysisQuery {
  range?: UsageRange;
  member_id?: string;
  start_at?: UsageQueryTimestamp;
  end_at?: UsageQueryTimestamp;
}

export function getUsageAnalysis(
  context: PersonalUsageContext,
  query: UsageAnalysisQuery = {},
  signal?: AbortSignal,
): Promise<UsageAnalysisResponse> {
  const params = contextParams(context);
  appendQuery(params, {
    range: query.range,
    member_id: query.member_id,
    start_at: query.start_at,
    end_at: query.end_at,
  });
  return fetchValidated(
    `${USER_USAGE_ANALYSIS_PATH}?${params.toString()}`,
    signal,
    isUsageAnalysisResponse,
  );
}

export function getUsageRecords(
  context: PersonalUsageContext,
  query: UsageRecordsQuery & { aggregate: true },
  signal?: AbortSignal,
): Promise<UsageRecordsResponse<UsageRecordAggregate>>;
export function getUsageRecords(
  context: PersonalUsageContext,
  query?: UsageRecordsQuery & { aggregate?: false },
  signal?: AbortSignal,
): Promise<UsageRecordsResponse<UsageRecord>>;
export function getUsageRecords(
  context: PersonalUsageContext,
  query: UsageRecordsQuery = {},
  signal?: AbortSignal,
): Promise<UsageRecordsResponse<UsageRecordItem>> {
  const params = contextParams(context);
  appendQuery(params, {
    page: query.page ?? 1,
    page_size: query.page_size ?? 20,
    api_key_id: query.api_key_id,
    model: query.model,
    status: query.status,
    member_id: query.member_id,
    request_id: query.request_id,
    start_at: query.start_at,
    end_at: query.end_at,
    aggregate: query.aggregate,
    granularity: query.granularity,
  });
  return fetchAuthenticatedJson<unknown>(
    `${USER_USAGE_RECORDS_PATH}?${params.toString()}`,
    { signal },
  ).then((value) => {
    if (!isUsageRecordsResponse(value, query.aggregate === true))
      throw invalidResponse();
    return value;
  });
}

export function getDailyTokenUsage(
  context: PersonalUsageContext,
  signal?: AbortSignal,
): Promise<DailyTokenUsageResponse> {
  const params = contextParams(context);
  return fetchValidated(
    `${USER_TOKEN_DAILY_PATH}?${params.toString()}`,
    signal,
    isDailyTokenUsageResponse,
  );
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
