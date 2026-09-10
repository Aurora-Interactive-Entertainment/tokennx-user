import { fetchAuthenticatedJson } from "./authenticated";
import { ApiError, isApiError, type FetchJsonOptions } from "./http";
import type { ApiTimestamp } from "@/utils/format";
import i18n from "@/i18n";

const API_KEY_PATH = "/api/user/api-keys";
const ENTERPRISE_API_KEY_PATH = "/api/user/enterprise";

export const API_KEY_NAME_MAX_LENGTH = 32;
export const API_KEY_TAG_MAX_LENGTH = 32;
export const API_KEY_TAG_TEXT_MAX_LENGTH = 120;
export const API_KEY_MAX_TAG_COUNT = 16;

export type ApiKeyStatus = "active" | "disabled" | "expired";
export type ApiKeyScope = "all" | "selected";
export type ApiKeyBillingSource = "balance" | "subscription";
export type ApiKeyStatusFilter = "all" | "active" | "disabled";

export type UserApiKeyContext =
  | { account_type: "personal" }
  | { account_type: "enterprise"; enterprise_id: string };

export interface ApiKeyModel {
  id: string;
  alias: string;
  name: string;
  company: string;
}

export interface ApiKeyLimits {
  enabled: boolean;
  cost_limit_yuan: string | null;
  used_amount_yuan: string;
  rpm: number | null;
  tpm: number | null;
  concurrency: number | null;
}

export interface ApiKeyCreator {
  id: string;
  display_name: string;
  masked_phone: string;
}

export interface UserApiKey {
  id: string;
  name: string;
  masked_key: string;
  secret: string;
  status: ApiKeyStatus;
  scope: ApiKeyScope;
  // 接口契约规定 model_ids 始终为数组；全量授权时使用空数组。
  model_ids: string[];
  models: ApiKeyModel[];
  tags: string[];
  billing_source: ApiKeyBillingSource;
  limits: ApiKeyLimits;
  creator: ApiKeyCreator;
  created_at: ApiTimestamp;
  expires_at: ApiTimestamp | null;
  last_used_at: ApiTimestamp | null;
}

export interface UserApiKeyList {
  items: UserApiKey[];
  available_models: ApiKeyModel[];
  page: number;
  page_size: number;
  total: number;
}

export interface UserApiKeyRequestOptions extends Pick<FetchJsonOptions, "signal"> {
  /** 请求服务端分页时使用；省略则沿用服务端默认值。 */
  page?: number;
  page_size?: number;
}

export interface UserApiKeySubscriptionModels {
  has_subscription: boolean;
  models: ApiKeyModel[];
}

export interface UserApiKeyMutation {
  name: string;
  tags: string[];
  member_id?: string;
  // 创建/更新请求按文档使用 UTC RFC3339 字符串；列表响应仍是 Unix 毫秒时间戳。
  expires_at: string | null;
  scope: ApiKeyScope;
  model_ids: string[];
  billing_source: ApiKeyBillingSource;
  limits_enabled: boolean;
  cost_limit_yuan: string | null;
  rpm: number | null;
  tpm: number | null;
  concurrency: number | null;
}

export interface CreatedUserApiKey {
  item: UserApiKey;
  secret: string;
}

export interface UserApiKeyActivity {
  id: string;
  event_type: string;
  actor_type: string;
  occurred_at: ApiTimestamp;
  snapshot: Record<string, unknown>;
}

export interface UserApiKeyActivityList {
  items: UserApiKeyActivity[];
}

export type EnterpriseApiKeyAction = "delete" | "disable" | "enable" | "update";

export interface EnterpriseApiKeyBatchInput {
  action: EnterpriseApiKeyAction;
  items: Array<{ key_id: string }>;
  scope?: ApiKeyScope;
  model_ids?: string[];
  billing_source?: ApiKeyBillingSource;
  limits_enabled?: boolean;
  cost_limit_yuan?: string | null;
  rpm?: number | null;
  tpm?: number | null;
  concurrency?: number | null;
}

export interface EnterpriseApiKeyBatchResponse {
  items: UserApiKey[];
  updated: number;
}

function contextQuery(
  context: UserApiKeyContext,
  values: Record<string, string | number | undefined> = {},
): string {
  const params = new URLSearchParams({ account_type: context.account_type });
  if (context.account_type === "enterprise") {
    const enterpriseID = context.enterprise_id.trim();
    if (!enterpriseID) throw new Error(i18n.t("api.apiKeys.contextMissing"));
    params.set("enterprise_id", enterpriseID);
  }
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, String(value));
  });
  return params.toString();
}

function fetchOptions(options: UserApiKeyRequestOptions): Pick<FetchJsonOptions, "signal"> {
  // 分页字段只用于拼接查询参数，不能透传给原生 fetch，避免产生无效 RequestInit 字段。
  return options.signal ? { signal: options.signal } : {};
}

function normalizeModelList(value: unknown): ApiKeyModel[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item): ApiKeyModel[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<ApiKeyModel>;
    if (typeof candidate.id !== "string" || seen.has(candidate.id)) return [];
    seen.add(candidate.id);
    return [{
      id: candidate.id,
      alias: typeof candidate.alias === "string" ? candidate.alias : candidate.id,
      name: typeof candidate.name === "string" ? candidate.name : candidate.id,
      company: typeof candidate.company === "string" ? candidate.company : "",
    }];
  });
}

function normalizeApiKeyItem(value: unknown): UserApiKey {
  const item = (value && typeof value === "object" ? value : {}) as UserApiKey;
  return {
    ...item,
    secret: typeof item.secret === "string" ? item.secret : "",
    // 兼容灰度旧响应中的 null/缺失值，同时向页面暴露稳定的非空数组。
    model_ids: Array.isArray(item.model_ids)
      ? item.model_ids.filter((modelID): modelID is string => typeof modelID === "string")
      : [],
    models: normalizeModelList(item.models),
    tags: Array.isArray(item.tags)
      ? item.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
  };
}

function normalizeUserApiKeyList(
  value: unknown,
  fallback: { page?: number; page_size?: number } = {},
): UserApiKeyList {
  const source = (value && typeof value === "object" ? value : {}) as Partial<UserApiKeyList>;
  const items = Array.isArray(source.items)
    ? source.items.map(normalizeApiKeyItem)
    : [];
  const availableModels = normalizeModelList(source.available_models);
  const page = typeof source.page === "number" && Number.isInteger(source.page) && source.page > 0
    ? source.page
    : fallback.page && Number.isInteger(fallback.page) && fallback.page > 0
      ? fallback.page
      : 1;
  const pageSize = typeof source.page_size === "number" && Number.isInteger(source.page_size) && source.page_size > 0
    ? source.page_size
    : fallback.page_size && Number.isInteger(fallback.page_size) && fallback.page_size > 0
      ? fallback.page_size
      : Math.max(items.length, 20);
  const total = typeof source.total === "number" && Number.isInteger(source.total) && source.total >= 0
    ? source.total
    : items.length;
  return {
    ...source,
    items,
    available_models: availableModels,
    page,
    page_size: pageSize,
    total,
  };
}

function normalizeCreatedUserApiKey(value: unknown): CreatedUserApiKey {
  const source = (value && typeof value === "object" ? value : {}) as Partial<CreatedUserApiKey>;
  return {
    ...source,
    item: normalizeApiKeyItem(source.item),
    secret: typeof source.secret === "string" ? source.secret : "",
  } as CreatedUserApiKey;
}

function normalizeSubscriptionModels(value: unknown): UserApiKeySubscriptionModels {
  const source = (value && typeof value === "object" ? value : {}) as Partial<UserApiKeySubscriptionModels>;
  return {
    has_subscription: source.has_subscription === true,
    models: normalizeModelList(source.models),
  };
}

export function getUserApiKeys(
  context: UserApiKeyContext,
  filter: ApiKeyStatusFilter = "all",
  options: UserApiKeyRequestOptions = {},
): Promise<UserApiKeyList> {
  return fetchAuthenticatedJson<unknown>(
    `${API_KEY_PATH}?${contextQuery(context, {
      status: filter,
      page: options.page,
      page_size: options.page_size,
    })}`,
    fetchOptions(options),
  ).then((value) => normalizeUserApiKeyList(value, options));
}

/**
 * 读取当前账户可见的全部密钥，供仍使用前端筛选和分页的页面聚合数据。
 * 新服务按分页返回；旧灰度响应缺少分页字段时只读取首包，避免重复请求。
 */
export async function getAllUserApiKeys(
  context: UserApiKeyContext,
  filter: ApiKeyStatusFilter = "all",
  options: UserApiKeyRequestOptions = {},
): Promise<UserApiKeyList> {
  const items: UserApiKey[] = [];
  const itemIDs = new Set<string>();
  let availableModels: ApiKeyModel[] = [];
  let first: UserApiKeyList | null = null;
  let page = 1;
  const pageSize = 100;
  while (page <= 100) {
    const result = await getUserApiKeys(context, filter, {
      signal: options.signal,
      page,
      page_size: pageSize,
    });
    first ??= result;
    if (!availableModels.length) availableModels = result.available_models;
    const previousItemCount = items.length;
    for (const item of result.items) {
      if (itemIDs.has(item.id)) continue;
      itemIDs.add(item.id);
      items.push(item);
    }
    const lastPage = Math.max(1, Math.ceil(result.total / Math.max(1, result.page_size)));
    if (result.items.length === 0 || page >= lastPage || items.length >= result.total) break;
    // 服务端若忽略分页参数并重复返回同一页，检测到没有新增密钥后停止，避免死循环。
    if (items.length === previousItemCount) break;
    page += 1;
  }
  const base = first ?? normalizeUserApiKeyList({});
  return {
    ...base,
    items,
    available_models: availableModels,
    page: 1,
    page_size: items.length || base.page_size,
    total: Math.max(base.total, items.length),
  };
}

function enterpriseApiKeyPath(context: UserApiKeyContext): string {
  if (context.account_type !== "enterprise") {
    throw new Error(i18n.t("api.apiKeys.contextMissing"));
  }
  const enterpriseID = context.enterprise_id.trim();
  if (!enterpriseID) throw new Error(i18n.t("api.apiKeys.contextMissing"));
  return `${ENTERPRISE_API_KEY_PATH}/${encodeURIComponent(enterpriseID)}/api-keys`;
}

export function getEnterpriseApiKeys(
  context: UserApiKeyContext,
  filter: ApiKeyStatusFilter = "all",
  memberID?: string,
  options: UserApiKeyRequestOptions = {},
): Promise<UserApiKeyList> {
  const params = new URLSearchParams({ status: filter });
  if (memberID?.trim()) params.set("member_id", memberID.trim());
  if (options.page !== undefined) params.set("page", String(options.page));
  if (options.page_size !== undefined) params.set("page_size", String(options.page_size));
  return fetchAuthenticatedJson<unknown>(
    `${enterpriseApiKeyPath(context)}?${params.toString()}`,
    fetchOptions(options),
  ).then((value) => normalizeUserApiKeyList(value, options));
}

/** 企业管理员页同样聚合服务端分页，供部门筛选继续复用。 */
export async function getAllEnterpriseApiKeys(
  context: UserApiKeyContext,
  filter: ApiKeyStatusFilter = "all",
  memberID?: string,
  options: UserApiKeyRequestOptions = {},
): Promise<UserApiKeyList> {
  const items: UserApiKey[] = [];
  const itemIDs = new Set<string>();
  let availableModels: ApiKeyModel[] = [];
  let first: UserApiKeyList | null = null;
  let page = 1;
  const pageSize = 100;
  while (page <= 100) {
    const result = await getEnterpriseApiKeys(context, filter, memberID, {
      signal: options.signal,
      page,
      page_size: pageSize,
    });
    first ??= result;
    if (!availableModels.length) availableModels = result.available_models;
    const previousItemCount = items.length;
    for (const item of result.items) {
      if (itemIDs.has(item.id)) continue;
      itemIDs.add(item.id);
      items.push(item);
    }
    const lastPage = Math.max(1, Math.ceil(result.total / Math.max(1, result.page_size)));
    if (result.items.length === 0 || page >= lastPage || items.length >= result.total) break;
    // 兼容服务端暂未启用分页的灰度实例，重复页不再继续请求。
    if (items.length === previousItemCount) break;
    page += 1;
  }
  const base = first ?? normalizeUserApiKeyList({});
  return {
    ...base,
    items,
    available_models: availableModels,
    page: 1,
    page_size: items.length || base.page_size,
    total: Math.max(base.total, items.length),
  };
}

export function getSubscriptionModels(
  context: UserApiKeyContext,
  options: UserApiKeyRequestOptions = {},
): Promise<UserApiKeySubscriptionModels> {
  return fetchAuthenticatedJson<unknown>(
    `${API_KEY_PATH}/subscription-models?${contextQuery(context)}`,
    fetchOptions(options),
  ).then(normalizeSubscriptionModels);
}

// 保留语义化别名，便于页面和外部调用方按接口资源名称引用。
export const getUserApiKeySubscriptionModels = getSubscriptionModels;

export function createEnterpriseApiKey(
  context: UserApiKeyContext,
  input: UserApiKeyMutation,
): Promise<CreatedUserApiKey> {
  return fetchAuthenticatedJson<unknown>(enterpriseApiKeyPath(context), { method: "POST", body: input }).then(normalizeCreatedUserApiKey);
}

export function batchManageEnterpriseApiKeys(
  context: UserApiKeyContext,
  input: EnterpriseApiKeyBatchInput,
): Promise<EnterpriseApiKeyBatchResponse> {
  return fetchAuthenticatedJson<unknown>(`${enterpriseApiKeyPath(context)}/batch`, { method: "POST", body: input }).then((value) => {
    const source = (value && typeof value === "object" ? value : {}) as Partial<EnterpriseApiKeyBatchResponse>;
    return {
      ...source,
      items: Array.isArray(source.items) ? source.items.map(normalizeApiKeyItem) : [],
      updated: typeof source.updated === "number" ? source.updated : 0,
    } as EnterpriseApiKeyBatchResponse;
  });
}

export function createUserApiKey(
  context: UserApiKeyContext,
  input: UserApiKeyMutation,
): Promise<CreatedUserApiKey> {
  return fetchAuthenticatedJson<unknown>(
    `${API_KEY_PATH}?${contextQuery(context)}`,
    { method: "POST", body: input },
  ).then(normalizeCreatedUserApiKey);
}

export function updateUserApiKey(
  context: UserApiKeyContext,
  keyId: string,
  input: UserApiKeyMutation,
): Promise<UserApiKey> {
  return fetchAuthenticatedJson<unknown>(
    `${API_KEY_PATH}/${encodeURIComponent(keyId)}?${contextQuery(context)}`,
    { method: "PUT", body: input },
  ).then(normalizeApiKeyItem);
}

export function enableUserApiKey(
  context: UserApiKeyContext,
  keyId: string,
): Promise<UserApiKey> {
  return fetchAuthenticatedJson<unknown>(
    `${API_KEY_PATH}/${encodeURIComponent(keyId)}/enable?${contextQuery(context)}`,
    { method: "POST", body: {} },
  ).then(normalizeApiKeyItem);
}

export function disableUserApiKey(
  context: UserApiKeyContext,
  keyId: string,
): Promise<UserApiKey> {
  return fetchAuthenticatedJson<unknown>(
    `${API_KEY_PATH}/${encodeURIComponent(keyId)}/disable?${contextQuery(context)}`,
    { method: "POST", body: {} },
  ).then(normalizeApiKeyItem);
}

export function revokeUserApiKey(
  context: UserApiKeyContext,
  keyId: string,
): Promise<Record<string, never>> {
  return fetchAuthenticatedJson<Record<string, never>>(
    `${API_KEY_PATH}/${encodeURIComponent(keyId)}?${contextQuery(context)}`,
    { method: "DELETE" },
  );
}

export function getUserApiKeyActivity(
  context: UserApiKeyContext,
  keyId: string,
  limit = 20,
): Promise<UserApiKeyActivityList> {
  // 活动接口限制为 1～100 条，兼容旧调用方的越界值并避免无效请求。
  const normalizedLimit = Number.isFinite(limit)
    ? Math.min(100, Math.max(1, Math.trunc(limit)))
    : 20;
  return fetchAuthenticatedJson<UserApiKeyActivityList>(
    `${API_KEY_PATH}/${encodeURIComponent(keyId)}/activity?${contextQuery(context, { limit: normalizedLimit })}`,
  );
}

export function getUserApiKeyErrorMessage(error: unknown): string {
  if (!isApiError(error)) return i18n.t("api.apiKeys.requestFailed");
  if (error.apiMessage) return error.apiMessage;
  const messageKeys: Record<number, string> = {
    100001: "api.apiKeys.invalidInput",
    100004: "api.apiKeys.missing",
    100006: "api.apiKeys.stateChanged",
    100007: "api.apiKeys.unavailable",
    100009: "api.apiKeys.expired",
    160001: "api.apiKeys.sessionExpired",
    // 兼容旧网关仍返回的认证错误码，正式接口以 160001 为准。
    110001: "api.apiKeys.sessionExpired",
  };
  return messageKeys[error.code]
    ? i18n.t(messageKeys[error.code])
    : error.message || i18n.t("api.apiKeys.requestFailed");
}

export function isUserApiKeyValidationError(error: unknown): boolean {
  return isApiError(error) && error.code === 100001;
}

export function createUserApiKeyInputError(message: string): ApiError {
  return new ApiError(message, 400, 100001, null);
}
