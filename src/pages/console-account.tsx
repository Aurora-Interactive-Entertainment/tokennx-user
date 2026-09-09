import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { getActiveLocale } from "@/i18n";
import { Link, useNavigate, useSearchParams } from "react-router";
import Button from "@douyinfe/semi-ui/lib/es/button";
import SemiFormLabel from "@douyinfe/semi-ui/lib/es/form/label";
import Modal from "@/components/app-modal";
import Switch from "@douyinfe/semi-ui/lib/es/switch";
import Toast from "@douyinfe/semi-ui/lib/es/toast";
import {
  IconArrowRight,
  IconCopy,
  IconDeleteStroked,
  IconEditStroked,
  IconKey,
  IconMinusCircleStroked,
  IconPlus,
  IconPlusCircleStroked,
  IconSearch,
} from "@douyinfe/semi-icons";
import {
  BannerNotice,
  MetricCard,
  ModelLogo,
  PageTitle,
  SectionHeading,
} from "@/components/common";
import { TraeTableEmpty } from "@/components/trae-table-empty";
import { TraePagination } from "@/components/trae-pagination";
import { appToast } from "@/components/app-toast";
import { BackofficeMoneyText as MoneyText } from "@/components/money";
import {
  CompatCard as Card,
  CompatInput as Input,
  CompatSelect as Select,
} from "@/components/semi-compat";
import { useAppStore } from "@/data/app-state";
import { modelAlias } from "@/data/models";
import { NEW_ENTERPRISE_CREATE_PATH } from "@/api/enterprise-certification";
import {
  getUserApiKeyErrorMessage,
  getAllUserApiKeys,
  getAllEnterpriseApiKeys,
  getSubscriptionModels,
  createUserApiKey,
  createEnterpriseApiKey,
  batchManageEnterpriseApiKeys,
  updateUserApiKey,
  enableUserApiKey,
  disableUserApiKey,
  revokeUserApiKey,
  type ApiKeyScope,
  type ApiKeyStatusFilter,
  type CreatedUserApiKey,
  type UserApiKey,
  type UserApiKeyContext,
  type UserApiKeyList,
  type UserApiKeyMutation,
  type ApiKeyModel,
  type EnterpriseApiKeyBatchResponse,
} from "@/api/user-api-keys";
import {
  getAllEnterpriseMembers,
  getEnterpriseDepartments,
  getEnterpriseMembers,
  type EnterpriseDepartment,
  type EnterpriseMember,
} from "@/api/enterprise-console";
import { isAuthenticationFailure } from "@/api/http";
import { invalidateAuth } from "@/store/auth-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { formatApiTime, formatPersonOptionLabel, type ApiTimeValue } from "@/utils/format";
import {
  getInvitationOverview,
  type InvitationOverview,
} from "@/api/invitation";
import { InvitationTrendChart } from "@/components/invitation-trend-chart";
import { workspaceContextFor, workspaceContextKey } from "@/utils/workspace";
import { EnterpriseApiKeyFilters } from "@/components/enterprise-api-key-filters";
import { SettingsAnchorLayout, type SettingsAnchorItem } from "@/components/settings-anchor-layout";
import "./console-profile.css";
import "./enterprise-settings.css";
import "./console-api-key-modal.css";

export { EnterpriseCreatePage } from "./enterprise-create";

type ApiKeyExpiryPreset = "never" | "30days" | "90days" | "365days" | "current";

type ApiKeyFormState = {
  name: string;
  tagsText: string;
  whitelistText: string;
  memberID: string;
  expiresAt: number | null;
  scope: ApiKeyScope;
  modelIds: string[];
  billingSource: "balance" | "subscription";
  limitsEnabled: boolean;
  costLimitYuan: string;
  rpm: string;
  tpm: string;
  concurrency: string;
};

type ApiKeyRequiredField = "name" | "memberID";
type ApiKeyRequiredErrors = Partial<Record<ApiKeyRequiredField, string>>;

type SubscriptionModelsState = {
  loading: boolean;
  error: string;
  hasSubscription: boolean;
  models: ApiKeyModel[];
};

type ApiKeyAction = {
  type: "enable" | "disable" | "delete";
  key: UserApiKey;
};

type ApiKeyBulkAction = {
  type: "enable" | "disable" | "delete";
  keys: UserApiKey[];
};

const API_KEY_DAY_MS = 24 * 60 * 60 * 1000;
const API_KEY_USAGE_PERCENT_MIN = 0;
const API_KEY_USAGE_PERCENT_MAX = 100;
const API_KEY_USAGE_WARNING_THRESHOLD = 80;
const API_KEY_PAGE_SIZE = 10;
const PERSONAL_USAGE_MANAGEMENT_PATH = "/console/usage?tab=management";

// 中文：分页批量选择只增删当前页，保留用户在其他页面已经选中的密钥。
export function updateSelectedKeyIDs(
  selectedIDs: string[],
  pageIDs: string[],
  checked: boolean,
): string[] {
  const pageIDSet = new Set(pageIDs);
  if (checked) {
    return Array.from(new Set([...selectedIDs, ...pageIDs]));
  }
  return selectedIDs.filter((id) => !pageIDSet.has(id));
}

const EMPTY_SUBSCRIPTION_MODELS: SubscriptionModelsState = {
  loading: false,
  error: "",
  hasSubscription: false,
  models: [],
};
function emptyApiKeyForm(): ApiKeyFormState {
  return {
    name: "",
    tagsText: "",
    whitelistText: "",
    memberID: "",
    expiresAt: null,
    scope: "all",
    modelIds: [],
    billingSource: "balance",
    // 中文：默认仅展示基础信息，限制配置由用户主动开启后再展开。
    limitsEnabled: false,
    costLimitYuan: "",
    rpm: "",
    tpm: "",
    concurrency: "",
  };
}

// 中文：白名单暂未接入后端，先按常见的 IPv4/IPv6 地址及 CIDR 格式做前端校验。
function isValidIPv4(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) =>
    /^\d{1,3}$/.test(part) && Number(part) <= 255,
  );
}

function ipv6SegmentCount(value: string): number {
  if (!value) return 0;
  const groups = value.split(":");
  let count = 0;
  for (const group of groups) {
    if (group.includes(".")) {
      if (groups.indexOf(group) !== groups.length - 1 || !isValidIPv4(group)) {
        return -1;
      }
      count += 2;
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return -1;
    count += 1;
  }
  return count;
}

function isValidIPv6(value: string): boolean {
  if (!value || value.includes(":::")) return false;
  const compressionParts = value.split("::");
  if (compressionParts.length > 2) return false;
  if (compressionParts.length === 2) {
    // “::” 至少压缩一个分段，因此未压缩部分必须少于 8 段。
    const leftCount = ipv6SegmentCount(compressionParts[0]);
    const rightCount = ipv6SegmentCount(compressionParts[1]);
    return leftCount >= 0 && rightCount >= 0 && leftCount + rightCount < 8;
  }
  return ipv6SegmentCount(value) === 8;
}

function parseWhitelist(value: string): { entries: string[]; invalid: string | null } {
  const entries = value
    .split(/[,，;；|\n\r\t]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const invalid = entries.find((entry) => {
    const parts = entry.split("/");
    if (parts.length > 2 || !parts[0]) return true;
    const [address, prefix] = parts;
    const ipv6 = address.includes(":");
    const validAddress = ipv6 ? isValidIPv6(address) : isValidIPv4(address);
    if (!validAddress) return true;
    if (prefix === undefined) return false;
    const maxPrefix = ipv6 ? 128 : 32;
    return !/^\d{1,3}$/.test(prefix) || Number(prefix) > maxPrefix;
  }) ?? null;
  return { entries, invalid };
}

function apiDateLabel(value: ApiTimeValue | null): string {
  return formatApiTime(value);
}

function expiryToRFC3339(value: number | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  // 中文：接口要求 RFC3339 UTC 字符串；无效日期按未设置处理，避免提交数字时间戳触发 400。
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function yuanLabel(value: string | null): ReactNode {
  if (!value) return "--";
  return <MoneyText value={value} />;
}

function numberLabel(value: number | null): string {
  return value === null || value === undefined
    ? "--"
    : value.toLocaleString(getActiveLocale());
}

// 中文：用户只通过模型名称、厂商和别名识别模型，内部模型 id 只用于提交权限关联。
function apiKeyModelLabel(
  model: { id: string; name: string; company: string; alias?: string },
  t: TFunction,
): string {
  return t("console.playground.modelWithProvider", {
    name: model.name || t("console.playground.unnamedModel"),
    company: model.company || t("console.common.platformModel"),
    alias: modelAlias(model) || t("console.common.modelAliasUnset"),
  });
}

// 中文：部门接口按父级分页返回，筛选栏需要递归加载并展平完整部门目录。
async function loadEnterpriseApiKeyDepartments(
  enterpriseID: string,
  signal: AbortSignal,
): Promise<EnterpriseDepartment[]> {
  const departments: EnterpriseDepartment[] = [];

  async function loadChildren(parentID?: string): Promise<void> {
    let page = 1;
    let total = 0;
    do {
      const response = await getEnterpriseDepartments(
        { enterprise_id: enterpriseID },
        { parent_id: parentID, page, page_size: 20, signal },
      );
      departments.push(...response.items);
      await Promise.all(
        response.items
          .filter((department) => department.child_count > 0)
          .map((department) => loadChildren(department.id)),
      );
      total = response.total;
      if (response.items.length === 0 || page * 20 >= total) break;
      page += 1;
    } while (page <= Math.ceil(total / 20));
  }

  await loadChildren();
  return departments;
}

export function ApiKeysPage({
  mode = "mine",
}: {
  mode?: "mine" | "enterprise";
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const authFailureHandled = useRef(false);
  // 中文：页面会并行读取多个资源；同一轮 401 只清理一次会话并跳转登录页。
  const handleAuthFailure = useCallback((error: unknown): boolean => {
    if (!isAuthenticationFailure(error)) return false;
    if (!authFailureHandled.current) {
      authFailureHandled.current = true;
      dispatch(invalidateAuth());
      navigate("/", { replace: true });
    }
    return true;
  }, [dispatch, navigate]);
  const [searchParams] = useSearchParams();
  const store = useAppStore();
  const currentUserID = useAppSelector((state) => state.auth.user?.id ?? "");
  const [modalVisible, setModalVisible] = useState(false);
  // 中文：创建成功后仅在结果弹窗生命周期内保留完整密钥，关闭后立即从页面状态清除。
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<UserApiKey | null>(null);
  const [form, setForm] = useState<ApiKeyFormState>(emptyApiKeyForm);
  const [requiredErrors, setRequiredErrors] = useState<ApiKeyRequiredErrors>({});
  const [expiryPreset, setExpiryPreset] = useState<ApiKeyExpiryPreset>("never");
  const [filter, setFilter] = useState<ApiKeyStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(API_KEY_PAGE_SIZE);
  const [result, setResult] = useState<UserApiKeyList | null>(null);
  const [subscriptionModels, setSubscriptionModels] = useState<SubscriptionModelsState>(
    EMPTY_SUBSCRIPTION_MODELS,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [action, setAction] = useState<ApiKeyAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedKeyIDs, setSelectedKeyIDs] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<ApiKeyBulkAction | null>(null);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkEditing, setBulkEditing] = useState(false);
  const [bulkEditSaving, setBulkEditSaving] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [enterpriseMembers, setEnterpriseMembers] = useState<
    EnterpriseMember[]
  >([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [memberFilter, setMemberFilter] = useState("all");
  const [filterMemberSearch, setFilterMemberSearch] = useState("");
  const [filterDepartments, setFilterDepartments] = useState<
    EnterpriseDepartment[]
  >([]);
  const [filterMembers, setFilterMembers] = useState<EnterpriseMember[]>([]);
  const [filterCatalogLoading, setFilterCatalogLoading] = useState(false);
  const [filterCatalogError, setFilterCatalogError] = useState("");
  const workspaceContext = useMemo<UserApiKeyContext>(
    () => workspaceContextFor(store.activeWorkspace),
    [store.activeWorkspace.id, store.activeWorkspace.type],
  );
  const workspaceKey = workspaceContextKey(workspaceContext);
  // 中文：企业批量更新接口只支持模型、费用来源和限制配置；本人密钥仍可走完整 PUT。
  const enterpriseOwnKeyEditing = Boolean(
    mode === "enterprise" &&
      editingKey &&
      currentUserID &&
      editingKey.creator.id === currentUserID,
  );
  const enterpriseBatchEditLimited = Boolean(
    mode === "enterprise" && editingKey && !enterpriseOwnKeyEditing,
  );

  useEffect(() => {
    setResult(null);
    setEditingKey(null);
    setAction(null);
    setModalVisible(false);
    setCreatedSecret(null);
    setActionLoading(false);
    setSelectedKeyIDs([]);
    setBulkAction(null);
    setBulkActionLoading(false);
    setBulkEditing(false);
    setSubscriptionModels(EMPTY_SUBSCRIPTION_MODELS);
    setDepartmentFilter("all");
    setMemberFilter("all");
    setFilterMemberSearch("");
    setPage(1);
  }, [workspaceKey]);

  useEffect(() => {
    setSelectedKeyIDs([]);
    setPage(1);
  }, [departmentFilter, filter, memberFilter]);

  useEffect(() => {
    if (
      mode !== "enterprise" ||
      workspaceContext.account_type !== "enterprise"
    ) {
      setFilterDepartments([]);
      setFilterMembers([]);
      setFilterCatalogError("");
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setFilterCatalogLoading(true);
    setFilterCatalogError("");
    Promise.all([
      loadEnterpriseApiKeyDepartments(
        workspaceContext.enterprise_id,
        controller.signal,
      ),
      getAllEnterpriseMembers(
        { enterprise_id: workspaceContext.enterprise_id },
        { signal: controller.signal },
      ),
    ])
      .then(([departments, members]) => {
        if (!active) return;
        setFilterDepartments(departments);
        setFilterMembers(members);
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        if (handleAuthFailure(error)) return;
        setFilterCatalogError(getUserApiKeyErrorMessage(error));
      })
      .finally(() => {
        if (active) setFilterCatalogLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [dispatch, handleAuthFailure, mode, navigate, workspaceContext]);

  useEffect(() => {
    if (
      !modalVisible ||
      mode !== "enterprise" ||
      editingKey ||
      bulkEditing ||
      workspaceContext.account_type !== "enterprise"
    ) {
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setMembersLoading(true);
    setMembersError("");
    // 中文：企业 API Key 可分配给在职或停用成员；省略状态参数以使用接口默认的两类合集。
    getEnterpriseMembers(
      { enterprise_id: workspaceContext.enterprise_id },
      {
        page: 1,
        page_size: 20,
        keyword: memberSearch.trim() || undefined,
        signal: controller.signal,
      },
    )
      .then((value) => {
        if (active) setEnterpriseMembers(value.items);
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        if (handleAuthFailure(error)) return;
        setMembersError(getUserApiKeyErrorMessage(error));
      })
      .finally(() => {
        if (active) setMembersLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    bulkEditing,
    dispatch,
    editingKey,
    handleAuthFailure,
    memberSearch,
    mode,
    modalVisible,
    navigate,
    workspaceContext,
  ]);

  useEffect(() => {
    if (!modalVisible || form.billingSource !== "subscription") {
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    // 中文：切换订阅计费后必须重新读取当前空间权益，不能复用余额模型目录或旧表单选择。
    setSubscriptionModels({
      loading: true,
      error: "",
      hasSubscription: false,
      models: [],
    });
    getSubscriptionModels(workspaceContext, { signal: controller.signal })
      .then((value) => {
        if (!active) return;
        const models = value.models;
        setSubscriptionModels({
          loading: false,
          error: "",
          hasSubscription: value.has_subscription,
          models,
        });
        // 中文：查询成功后自动全选订阅模型；用户随后可以在下拉框中取消部分模型。
        setForm((previous) =>
          previous.billingSource === "subscription"
            ? {
                ...previous,
                scope: models.length ? "selected" : "all",
                modelIds: models.map((model) => model.id),
              }
            : previous,
        );
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        if (handleAuthFailure(error)) return;
        setSubscriptionModels({
          loading: false,
          error: getUserApiKeyErrorMessage(error),
          hasSubscription: false,
          models: [],
        });
        setForm((previous) =>
          previous.billingSource === "subscription"
            ? { ...previous, scope: "all", modelIds: [] }
            : previous,
        );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [dispatch, form.billingSource, handleAuthFailure, modalVisible, navigate, workspaceContext]);

  useEffect(() => {
    if (subscriptionModels.error) appToast.error(subscriptionModels.error);
  }, [subscriptionModels.error]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setErrorMessage("");
    (mode === "enterprise"
      ? getAllEnterpriseApiKeys(
          workspaceContext,
          filter,
          memberFilter === "all" ? undefined : memberFilter,
          { signal: controller.signal },
        )
      : getAllUserApiKeys(workspaceContext, filter, { signal: controller.signal }))
      .then((value) => {
        if (active) setResult(value);
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        if (handleAuthFailure(error)) return;
        const message = getUserApiKeyErrorMessage(error);
        setErrorMessage(message);
        Toast.error(message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    dispatch,
    filter,
    handleAuthFailure,
    memberFilter,
    mode,
    navigate,
    reloadToken,
    workspaceContext,
  ]);

  function updateForm(patch: Partial<ApiKeyFormState>): void {
    setForm((previous) => ({ ...previous, ...patch }));
    if (!("name" in patch) && !("memberID" in patch)) return;
    setRequiredErrors((previous) => {
      const next = { ...previous };
      if ("name" in patch && String(patch.name ?? "").trim()) delete next.name;
      if ("memberID" in patch && String(patch.memberID ?? "").trim()) delete next.memberID;
      return next;
    });
  }

  function changeBillingSource(source: ApiKeyFormState["billingSource"]): void {
    // 中文：余额与订阅模型目录相互独立，切回余额时清空订阅选择，防止跨来源提交旧模型。
    if (source === "balance") {
      setSubscriptionModels(EMPTY_SUBSCRIPTION_MODELS);
      updateForm({ billingSource: source, scope: "all", modelIds: [] });
      return;
    }
    setSubscriptionModels({ ...EMPTY_SUBSCRIPTION_MODELS });
    updateForm({ billingSource: source, scope: "all", modelIds: [] });
  }

  function openCreate(): void {
    setEditingKey(null);
    setBulkEditing(false);
    setSubscriptionModels(EMPTY_SUBSCRIPTION_MODELS);
    setRequiredErrors({});
    const requestedModelKey = searchParams.get("model")?.trim();
    const requestedModel = requestedModelKey
      ? (result?.available_models ?? []).find(
          (model) =>
            model.id === requestedModelKey || model.alias === requestedModelKey,
        )
      : undefined;
    setForm(
      requestedModel
        ? {
            ...emptyApiKeyForm(),
            scope: "selected",
            modelIds: [requestedModel.id],
          }
        : emptyApiKeyForm(),
    );
    setMemberSearch("");
    setEnterpriseMembers([]);
    setMembersError("");
    setExpiryPreset("never");
    setModalVisible(true);
  }

  function openEdit(key: UserApiKey): void {
    setEditingKey(key);
    setBulkEditing(false);
    setSubscriptionModels(EMPTY_SUBSCRIPTION_MODELS);
    setRequiredErrors({});
    setForm({
      name: key.name,
      tagsText: key.tags.join(", "),
      // 中文：白名单尚未由接口返回，编辑旧密钥时保持为空，后续接入字段后再回填。
      whitelistText: "",
      memberID: "",
      expiresAt: key.expires_at,
      scope: key.scope,
      modelIds: key.model_ids ?? [],
      billingSource: key.billing_source,
      limitsEnabled: key.limits.enabled,
      costLimitYuan: key.limits.cost_limit_yuan ?? "",
      rpm: key.limits.rpm === null ? "" : String(key.limits.rpm),
      tpm: key.limits.tpm === null ? "" : String(key.limits.tpm),
      concurrency:
        key.limits.concurrency === null ? "" : String(key.limits.concurrency),
    });
    setExpiryPreset(key.expires_at !== null ? "current" : "never");
    setModalVisible(true);
  }

  function openBulkEdit(): void {
    const selected = rows.filter((row) => selectedKeyIDs.includes(row.id));
    const first = selected[0];
    if (!first) return;
    setEditingKey(null);
    setBulkEditing(true);
    setSubscriptionModels(EMPTY_SUBSCRIPTION_MODELS);
    setRequiredErrors({});
    setForm({
      name: "",
      tagsText: "",
      whitelistText: "",
      memberID: "",
      expiresAt: first.expires_at,
      scope: first.scope,
      modelIds: first.model_ids ?? [],
      billingSource: first.billing_source,
      limitsEnabled: first.limits.enabled,
      costLimitYuan: first.limits.cost_limit_yuan ?? "",
      rpm: first.limits.rpm === null ? "" : String(first.limits.rpm),
      tpm: first.limits.tpm === null ? "" : String(first.limits.tpm),
      concurrency:
        first.limits.concurrency === null
          ? ""
          : String(first.limits.concurrency),
    });
    setExpiryPreset(first.expires_at !== null ? "current" : "never");
    setModalVisible(true);
  }

  function closeModal(): void {
    if (saving || bulkEditSaving) return;
    setModalVisible(false);
    setEditingKey(null);
    setBulkEditing(false);
    setSubscriptionModels(EMPTY_SUBSCRIPTION_MODELS);
    setRequiredErrors({});
  }

  function selectExpiry(value: string): void {
    if (value === "never") {
      setExpiryPreset("never");
      updateForm({ expiresAt: null });
      return;
    }
    // 中文：编辑时允许恢复到打开表单时的原始到期日。
    if (value === "current") {
      setExpiryPreset("current");
      updateForm({ expiresAt: editingKey?.expires_at ?? null });
      return;
    }
    const days =
      value === "30days"
        ? 30
        : value === "90days"
          ? 90
          : value === "365days"
            ? 365
            : 0;
    if (days > 0) {
      setExpiryPreset(value as ApiKeyExpiryPreset);
      updateForm({ expiresAt: Date.now() + days * API_KEY_DAY_MS });
    }
  }

  function buildMutation(
    options: { bulk?: boolean } = {},
  ): UserApiKeyMutation | null {
    const bulk = options.bulk ?? false;
    const name = form.name.trim();
    const memberID =
      mode === "enterprise" && !editingKey && !bulk ? form.memberID.trim() : "";
    const nextRequiredErrors: ApiKeyRequiredErrors = {};
    if (!bulk && !name) nextRequiredErrors.name = t("console.account.keyNameRequired");
    if (mode === "enterprise" && !editingKey && !bulk && !memberID) {
      nextRequiredErrors.memberID = t("console.account.memberRequired");
    }
    if (nextRequiredErrors.name || nextRequiredErrors.memberID) {
      // 中文：必填项使用字段内错误反馈，和企业人员管理弹窗保持一致。
      setRequiredErrors(nextRequiredErrors);
      return null;
    }
    setRequiredErrors({});
    if (!bulk && Array.from(name).length > 32) {
      Toast.warning(t("console.account.keyNameTooLong"));
      return null;
    }
    const tags = form.tagsText
      .split(/[,，\n]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (
      (!bulk && tags.length > 16) ||
      (!bulk && Array.from(tags.join(",")).length > 120) ||
      (!bulk && tags.some((tag) => Array.from(tag).length > 32))
    ) {
      Toast.warning(t("console.account.tagsInvalid"));
      return null;
    }
    const whitelist = parseWhitelist(form.whitelistText);
    if (whitelist.invalid) {
      Toast.warning(t("console.account.whitelistInvalid", { value: whitelist.invalid }));
      return null;
    }
    let selectedModelIds = Array.from(new Set(form.modelIds));
    if (form.billingSource === "subscription") {
      if (subscriptionModels.loading) {
        Toast.warning(t("console.account.subscriptionModelsLoading"));
        return null;
      }
      if (subscriptionModels.error) {
        Toast.warning(subscriptionModels.error);
        return null;
      }
      if (!subscriptionModels.hasSubscription) {
        Toast.warning(t("console.account.subscriptionModelsUnavailable"));
        return null;
      }
      if (!subscriptionModels.models.length) {
        Toast.warning(t("console.account.subscriptionModelsEmpty"));
        return null;
      }
      if (!selectedModelIds.length) {
        Toast.warning(t("console.account.subscriptionModelRequired"));
        return null;
      }
      if (selectedModelIds.length > 256) {
        Toast.warning(t("console.account.subscriptionModelLimit"));
        return null;
      }
      const allowedModelIDs = new Set(subscriptionModels.models.map((model) => model.id));
      if (selectedModelIds.some((modelID) => !allowedModelIDs.has(modelID))) {
        // 中文：只允许提交本次订阅查询返回的模型，避免旧目录或篡改值绕过服务端校验。
        selectedModelIds = selectedModelIds.filter((modelID) => allowedModelIDs.has(modelID));
      }
      if (!selectedModelIds.length) {
        Toast.warning(t("console.account.subscriptionModelRequired"));
        return null;
      }
    }
    // 中文：余额来源不选任何模型时按全部模型提交；订阅来源始终提交非空模型子集。
    const scope: ApiKeyScope = form.billingSource === "subscription"
      ? "selected"
      : selectedModelIds.length > 0
        ? "selected"
        : "all";
    const parseLimit = (value: string): number | null => {
      if (!value.trim()) return null;
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
    };
    const rpm = form.limitsEnabled ? parseLimit(form.rpm) : null;
    const tpm = form.limitsEnabled ? parseLimit(form.tpm) : null;
    const concurrency = form.limitsEnabled
      ? parseLimit(form.concurrency)
      : null;
    if ([rpm, tpm, concurrency].some((value) => Number.isNaN(value))) {
      Toast.warning(t("console.account.limitInvalid"));
      return null;
    }
    const cost = form.limitsEnabled ? form.costLimitYuan.trim() : "";
    if (
      cost &&
      (!/^[0-9]{1,12}(\.[0-9]{1,9})?$/.test(cost) || Number(cost) <= 0)
    ) {
      Toast.warning(t("console.account.costInvalid"));
      return null;
    }
    return {
      name: bulk ? "" : name,
      tags: bulk ? [] : tags,
      ...(memberID ? { member_id: memberID } : {}),
      expires_at: expiryToRFC3339(form.expiresAt),
      scope,
      model_ids: scope === "all" ? [] : selectedModelIds,
      billing_source: form.billingSource,
      limits_enabled: form.limitsEnabled,
      cost_limit_yuan: cost || null,
      rpm,
      tpm,
      concurrency,
      // 中文：白名单仅完成前端采集和校验，接口字段就绪后再补入请求体。
    };
  }

  async function saveKey(): Promise<void> {
    const input = buildMutation();
    if (!input || saving) return;
    setSaving(true);
    try {
      if (editingKey) {
        const updated = mode === "enterprise" && !enterpriseOwnKeyEditing
          ? (await batchManageEnterpriseApiKeys(workspaceContext, {
              action: "update",
              items: [{ key_id: editingKey.id }],
              scope: input.scope,
              model_ids: input.model_ids,
              billing_source: input.billing_source,
              limits_enabled: input.limits_enabled,
              cost_limit_yuan: input.cost_limit_yuan,
              rpm: input.rpm,
              tpm: input.tpm,
              concurrency: input.concurrency,
            })).items[0]
          : await updateUserApiKey(workspaceContext, editingKey.id, input);
        if (!updated) throw new Error(t("console.account.requestFailed"));
        setResult((previous) =>
          previous
            ? {
                ...previous,
                items: previous.items.map((item) =>
                  item.id === updated.id ? updated : item,
                ),
              }
            : previous,
        );
        // 中文：保存成功后直接关闭，避免 saving 状态拦截 closeModal。
        setModalVisible(false);
        setEditingKey(null);
        Toast.success(t("console.account.updateSuccess"));
      } else {
        const created: CreatedUserApiKey = mode === "enterprise"
          ? await createEnterpriseApiKey(workspaceContext, input)
          : await createUserApiKey(workspaceContext, input);
        setResult((previous) =>
          previous
            ? { ...previous, items: [created.item, ...previous.items] }
            : previous,
        );
        setPage(1);
        setModalVisible(false);
        setEditingKey(null);
        const secret = (created.secret || created.item.secret || "").trim();
        if (secret) {
          // 中文：完整密钥只在创建完成后展示一次，避免用户离开弹窗后再次暴露。
          setCreatedSecret(secret);
        } else {
          Toast.success(t("console.account.createSuccess"));
        }
      }
    } catch (error: unknown) {
      if (!handleAuthFailure(error)) Toast.error(getUserApiKeyErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function saveBulkEdit(): Promise<void> {
    const selected = rows.filter((row) => selectedKeyIDs.includes(row.id));
    const input = buildMutation({ bulk: true });
    if (!input || !selected.length || bulkEditSaving) return;
    setBulkEditSaving(true);
    const outcomes = mode === "enterprise"
      ? await Promise.allSettled([batchManageEnterpriseApiKeys(workspaceContext, {
          action: "update",
          items: selected.map((key) => ({ key_id: key.id })),
          scope: input.scope,
          model_ids: input.model_ids,
          billing_source: input.billing_source,
          limits_enabled: input.limits_enabled,
          cost_limit_yuan: input.cost_limit_yuan,
          rpm: input.rpm,
          tpm: input.tpm,
          concurrency: input.concurrency,
        })])
      : await Promise.allSettled(
      selected.map((key) =>
        updateUserApiKey(workspaceContext, key.id, {
          ...input,
          // 中文：批量编辑只覆盖配置项，保留每条密钥原有的名称和标签。
          name: key.name,
          tags: key.tags,
          expires_at:
            expiryPreset === "current"
              ? expiryToRFC3339(key.expires_at)
              : input.expires_at,
        }),
      ),
      );
    const settledOutcomes = outcomes as Array<PromiseSettledResult<EnterpriseApiKeyBatchResponse | UserApiKey>>;
    const enterpriseBatchResult = settledOutcomes[0]?.status === "fulfilled" && "items" in settledOutcomes[0].value ? settledOutcomes[0].value : undefined;
    const updated: UserApiKey[] = mode === "enterprise"
      ? (enterpriseBatchResult?.items ?? [])
      : settledOutcomes.flatMap((outcome) => outcome.status === "fulfilled" && "id" in outcome.value ? [outcome.value] : []);
    const authenticationFailure = settledOutcomes.find(
      (outcome) =>
        outcome.status === "rejected" &&
        isAuthenticationFailure(outcome.reason),
    );
    const authenticationFailed = Boolean(authenticationFailure);
    const failedCount = mode === "enterprise" ? (updated.length ? 0 : selected.length) : outcomes.length - updated.length;
    if (updated.length) {
      setResult((previous) =>
        previous
          ? {
              ...previous,
              items: previous.items.map(
                (item) => updated.find((value) => value.id === item.id) ?? item,
              ),
            }
          : previous,
      );
    }
    setBulkEditSaving(false);
    if (authenticationFailed) {
      handleAuthFailure(authenticationFailure?.status === "rejected" ? authenticationFailure.reason : undefined);
      setModalVisible(false);
      setBulkEditing(false);
      return;
    }
    if (failedCount) {
      Toast.error(
        t("console.account.bulkPartialSuccess", {
          success: updated.length,
          failed: failedCount,
        }),
      );
    } else {
      Toast.success(
        t("console.account.bulkEditSuccess", { count: updated.length }),
      );
    }
    setModalVisible(false);
    setBulkEditing(false);
    setSelectedKeyIDs([]);
  }

  async function runAction(): Promise<void> {
    if (!action || actionLoading) return;
    setActionLoading(true);
    try {
      if (action.type === "delete") {
        if (mode === "enterprise") {
          await batchManageEnterpriseApiKeys(workspaceContext, { action: "delete", items: [{ key_id: action.key.id }] });
        } else {
          await revokeUserApiKey(workspaceContext, action.key.id);
        }
        setResult((previous) =>
          previous
            ? {
                ...previous,
                items: previous.items.filter(
                  (item) => item.id !== action.key.id,
                ),
              }
            : previous,
        );
        Toast.success(t("console.account.deleteSuccess"));
      } else {
        const updated = mode === "enterprise"
          ? (await batchManageEnterpriseApiKeys(workspaceContext, { action: action.type, items: [{ key_id: action.key.id }] })).items[0]
          : action.type === "enable"
            ? await enableUserApiKey(workspaceContext, action.key.id)
            : await disableUserApiKey(workspaceContext, action.key.id);
        if (!updated) throw new Error(t("console.account.requestFailed"));
        setResult((previous) =>
          previous
            ? {
                ...previous,
                items: previous.items.map((item) =>
                  item.id === updated.id ? updated : item,
                ),
              }
            : previous,
        );
        Toast.success(
          action.type === "enable"
            ? t("console.account.enabledSuccess")
            : t("console.account.disabledSuccess"),
        );
      }
      setAction(null);
    } catch (error: unknown) {
      if (!handleAuthFailure(error)) Toast.error(getUserApiKeyErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  }

  async function runBulkAction(): Promise<void> {
    if (!bulkAction || bulkActionLoading) return;
    const current = bulkAction;
    setBulkActionLoading(true);
    const outcomes = mode === "enterprise"
      ? await Promise.allSettled([batchManageEnterpriseApiKeys(workspaceContext, { action: current.type, items: current.keys.map((key) => ({ key_id: key.id })) })])
      : await Promise.allSettled(
      current.keys.map((key) => {
        if (current.type === "delete") {
          return revokeUserApiKey(workspaceContext, key.id).then(() => key);
        }
        return current.type === "enable"
          ? enableUserApiKey(workspaceContext, key.id)
          : disableUserApiKey(workspaceContext, key.id);
      }),
      );
    const settledOutcomes = outcomes as Array<PromiseSettledResult<EnterpriseApiKeyBatchResponse | UserApiKey>>;
    const enterpriseBatchResult = settledOutcomes[0]?.status === "fulfilled" && "items" in settledOutcomes[0].value ? settledOutcomes[0].value : undefined;
    const updated: UserApiKey[] = mode === "enterprise"
      ? (enterpriseBatchResult?.items ?? [])
      : settledOutcomes.flatMap((outcome) => outcome.status === "fulfilled" && "id" in outcome.value ? [outcome.value] : []);
    const authenticationFailure = settledOutcomes.find(
      (outcome) =>
        outcome.status === "rejected" &&
        isAuthenticationFailure(outcome.reason),
    );
    const authenticationFailed = Boolean(authenticationFailure);
    const enterpriseSuccessCount = enterpriseBatchResult?.updated ?? 0;
    const failedCount = mode === "enterprise" ? Math.max(0, current.keys.length - enterpriseSuccessCount) : outcomes.length - updated.length;
    const succeededIDs = mode === "enterprise" && current.type === "delete" && enterpriseSuccessCount > 0
      ? current.keys.map((key) => key.id)
      : updated.map((item) => item.id);
    if (current.type === "delete") {
      setResult((previous) =>
        previous
          ? {
              ...previous,
              items: previous.items.filter(
                (item) => !succeededIDs.includes(item.id),
              ),
            }
          : previous,
      );
    } else if (updated.length) {
      setResult((previous) =>
        previous
          ? {
              ...previous,
              items: previous.items.map(
                (item) => updated.find((value) => value.id === item.id) ?? item,
              ),
            }
          : previous,
      );
    }
    setBulkActionLoading(false);
    setBulkAction(null);
    setSelectedKeyIDs([]);
    if (authenticationFailed) {
      handleAuthFailure(authenticationFailure?.status === "rejected" ? authenticationFailure.reason : undefined);
      return;
    }
    if (failedCount) {
      Toast.error(
        t("console.account.bulkPartialSuccess", {
          success: updated.length,
          failed: failedCount,
        }),
      );
    } else {
      const messageKey =
        current.type === "delete"
          ? "console.account.bulkDeleteSuccess"
          : current.type === "enable"
            ? "console.account.bulkEnableSuccess"
            : "console.account.bulkDisableSuccess";
      Toast.success(t(messageKey, { count: updated.length }));
    }
  }

  async function copyText(value: string, message: string): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        Toast.success(message);
        return;
      }
    } catch {
      // 中文：部分内嵌浏览器会拒绝 Clipboard API，继续尝试传统复制方式。
    }

    // 中文：使用临时文本域兼容非安全上下文和不支持 Clipboard API 的环境。
    let fallbackSucceeded = false;
    let textarea: HTMLTextAreaElement | null = null;
    try {
      textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-1000px";
      textarea.style.left = "-1000px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      fallbackSucceeded = document.execCommand("copy");
    } catch {
      fallbackSucceeded = false;
    } finally {
      textarea?.remove();
    }
    if (fallbackSucceeded) Toast.success(message);
    else Toast.error(t("console.common.copyFailed"));
  }

  function copyApiKey(key: UserApiKey): void {
    if (!key.secret) {
      Toast.error(t("console.account.alreadyHasCopy"));
      return;
    }
    void copyText(key.secret, t("console.account.copiedKey"));
  }

  function closeCreatedSecretModal(): void {
    setCreatedSecret(null);
  }

  const items = result?.items ?? [];
  // 中文：测试或旧会话没有用户 ID 时保留服务端列表，真实登录会按当前用户收窄企业“我的密钥”。
  const departmentMemberUserIDs = new Set(
    filterMembers
      .filter((member) => member.department?.id === departmentFilter)
      .flatMap((member) => [member.user_id, member.id]),
  );
  const filteredRows = items.filter(
    (item) =>
      (filter === "all" || item.status === filter) &&
      (mode !== "enterprise" ||
        departmentFilter === "all" ||
        departmentMemberUserIDs.has(item.creator.id)) &&
      (mode !== "mine" ||
        store.activeWorkspace.type !== "enterprise" ||
        !currentUserID ||
        item.creator.id === currentUserID),
  );
  const totalRows = filteredRows.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, pageCount);
  // 中文：筛选结果变少时自动回到最后一页，避免表格出现空页。
  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [currentPage, page]);
  const rows = filteredRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const enterpriseSelectionEnabled = mode === "enterprise";
  // 中文：个人和企业密钥页统一只展示核心字段，批量勾选列仍仅在企业页保留。
  const showExtendedColumns = false;
  const selectedRows = filteredRows.filter((row) => selectedKeyIDs.includes(row.id));
  const selectedPageRows = rows.filter((row) => selectedKeyIDs.includes(row.id));
  const allRowsSelected =
    enterpriseSelectionEnabled &&
    rows.length > 0 &&
    selectedPageRows.length === rows.length;
  const someRowsSelected =
    enterpriseSelectionEnabled && selectedPageRows.length > 0;

  function toggleRowSelection(keyID: string, checked: boolean): void {
    setSelectedKeyIDs((previous) =>
      checked
        ? previous.includes(keyID)
          ? previous
          : [...previous, keyID]
        : previous.filter((id) => id !== keyID),
    );
  }

  function toggleAllRows(checked: boolean): void {
    setSelectedKeyIDs((previous) =>
      updateSelectedKeyIDs(
        previous,
        rows.map((row) => row.id),
        checked,
      ),
    );
  }

  function openBulkAction(type: ApiKeyBulkAction["type"]): void {
    const selected = rows.filter((row) => selectedKeyIDs.includes(row.id));
    const eligible =
      type === "enable"
        ? selected.filter((row) => row.status === "disabled")
        : type === "disable"
          ? selected.filter((row) => row.status === "active")
          : selected;
    if (!eligible.length) {
      Toast.warning(t("console.account.bulkNoEligible"));
      return;
    }
    setBulkAction({ type, keys: eligible });
  }

  const availableModels = result?.available_models ?? [];
  const formAvailableModels = form.billingSource === "subscription"
    ? subscriptionModels.models
    : availableModels;
  const subscriptionFormBlocked = form.billingSource === "subscription" && (
    subscriptionModels.loading ||
    Boolean(subscriptionModels.error) ||
    !subscriptionModels.hasSubscription ||
    subscriptionModels.models.length === 0 ||
    form.modelIds.length === 0 ||
    form.modelIds.length > 256
  );
  // 中文：所有限制相关配置统一跟随开关展开，避免默认表单过长。
  const advancedVisible = form.limitsEnabled;
  const availableModelsLoading = loading && result === null;
  // 中文：仅首次无数据时整块加载；切换筛选时保留旧数据在表格内叠加加载态，避免整表闪烁。
  const initialTableLoading = availableModelsLoading;
  const workspaceLabel =
    store.activeWorkspace.type === "enterprise"
      ? store.activeWorkspace.name
      : t("console.common.personalWorkspace");
  const showCreator = store.activeWorkspace.type === "enterprise";
  const pageTitle =
    mode === "enterprise"
      ? t("console.account.enterpriseApiKeysTitle")
      : mode === "mine" || !showCreator
        ? t("console.account.myApiKeysTitle")
        : t("console.account.apiKeysTitle");
  const pageDescription =
    mode === "enterprise"
      ? t("console.account.enterpriseApiKeysDescription")
      : t("console.account.apiKeysDescription");
  // 中文：空状态也沿用完整表头，列数随企业选择列和扩展字段保持一致。
  const apiKeyTableColumnCount =
    6 + (showExtendedColumns ? 6 : 0) + (enterpriseSelectionEnabled ? 1 : 0);
  const normalizedFilterMemberSearch = filterMemberSearch
    .trim()
    .toLocaleLowerCase();
  const visibleFilterMembers = filterMembers.filter((member) => {
    // 中文：部门匹配保留历史成员，但企业密钥接口只允许按在职或暂停成员查询。
    if (!["active", "suspended"].includes(member.status)) return false;
    const inDepartment =
      departmentFilter === "all" ||
      member.department?.id === departmentFilter;
    if (!inDepartment) return false;
    if (!normalizedFilterMemberSearch) return true;
    return [member.display_name, member.masked_contact, member.user_id].some(
      (value) =>
        value
          ?.toLocaleLowerCase()
          .includes(normalizedFilterMemberSearch),
    );
  });

  function changeDepartmentFilter(departmentID: string): void {
    setDepartmentFilter(departmentID);
    setMemberFilter("all");
    setFilterMemberSearch("");
  }

  return (
    <div
      className={`page-stack api-keys-console-page api-keys-console-page--compact${showCreator ? "" : " api-keys-console-page--personal"}`}
    >
      <PageTitle
        title={pageTitle}
        description={pageDescription}
      />
      <div className="api-keys-toolbar">
        {mode === "enterprise" ? (
          <EnterpriseApiKeyFilters
            departmentID={departmentFilter}
            memberID={memberFilter}
            departments={filterDepartments}
            members={visibleFilterMembers}
            loading={filterCatalogLoading}
            errorMessage={filterCatalogError}
            onDepartmentChange={changeDepartmentFilter}
            onMemberChange={setMemberFilter}
            onMemberSearch={setFilterMemberSearch}
          />
        ) : <span className="api-keys-toolbar-spacer" aria-hidden="true" />}
        <div className="api-keys-toolbar-actions">
          <div
            className="status-filters"
            role="group"
            aria-label={t("console.account.modelScopeFilter")}
          >
            {(["all", "active", "disabled"] as const).map((key) => (
              <button
                type="button"
                className={
                  "status-filter-btn" + (filter === key ? " active" : "")
                }
                aria-pressed={filter === key}
                key={key}
                onClick={() => setFilter(key)}
              >
                {key === "all"
                  ? t("console.account.all")
                  : key === "active"
                    ? t("console.account.enable")
                    : t("console.account.disabled")}
              </button>
            ))}
          </div>
          <Button
            className="api-key-create-button"
            theme="solid"
            type="primary"
            icon={<IconPlus />}
            onClick={openCreate}
          >
            {t("console.account.create")}
          </Button>
        </div>
      </div>
      {errorMessage ? (
        <BannerNotice tone="warning" compact>
          <span>{errorMessage}</span>
          <Button
            theme="borderless"
            size="small"
            onClick={() => setReloadToken((value) => value + 1)}
          >
            {t("console.common.reload")}
          </Button>
        </BannerNotice>
      ) : null}
      {initialTableLoading ? (
        <div className="api-keys-loading" role="status">
          <span className="api-keys-loading-spinner" />
          {t("console.account.noKeysLoading")}
        </div>
      ) : (
        <div
          className={`source-table-scroll${loading && rows.length > 0 ? " is-refreshing" : ""}`}
          role="region"
          aria-label={t("console.account.tableRegion")}
          tabIndex={0}
        >
          <table className="api-keys-table">
            <thead>
              <tr>
                {enterpriseSelectionEnabled ? (
                  <th className="api-key-selection-column">
                    <input
                      className="api-key-selection-checkbox"
                      type="checkbox"
                      checked={allRowsSelected}
                      ref={(element) => {
                        if (element)
                          element.indeterminate =
                            someRowsSelected && !allRowsSelected;
                      }}
                      onChange={(event) => toggleAllRows(event.target.checked)}
                      aria-label={t("console.account.selectAllKeys")}
                    />
                  </th>
                ) : null}
                <th>{t("console.account.name")}</th>
                <th>{t("console.account.key")}</th>
                <th>{t("console.account.createdBy")}</th>
                {showExtendedColumns ? <th>{t("console.account.limits")}</th> : null}
                {showExtendedColumns ? <th>{t("console.account.usageLimit")}</th> : null}
                {showExtendedColumns ? <th>{t("console.account.availableModels")}</th> : null}
                <th>{t("console.common.status")}</th>
                {showExtendedColumns ? <th>{t("console.account.tags")}</th> : null}
                <th>{t("console.account.createdTime")}</th>
                {showExtendedColumns ? <th>{t("console.account.lastUsed")}</th> : null}
                {showExtendedColumns ? <th>{t("console.account.activity")}</th> : null}
                <th>{t("console.account.operation")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                loading ? (
                  // 中文：刷新后暂无数据时在表格内展示加载行，避免空态与加载态来回闪烁。
                  <tr>
                    <td colSpan={apiKeyTableColumnCount}>
                      <div className="api-keys-loading api-keys-loading--inline" role="status">
                        <span className="api-keys-loading-spinner" />
                        {t("console.account.noKeysLoading")}
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td
                      className="api-keys-empty-cell"
                      colSpan={apiKeyTableColumnCount}
                    >
                      <TraeTableEmpty />
                    </td>
                  </tr>
                )
              ) : rows.map((row) => {
                const limit = row.limits.cost_limit_yuan
                  ? Number(row.limits.cost_limit_yuan)
                  : 0;
                const used = Number(row.limits.used_amount_yuan || 0);
                const progress =
                  limit > 0 && Number.isFinite(used)
                    ? Math.min(
                        API_KEY_USAGE_PERCENT_MAX,
                        Math.max(
                          API_KEY_USAGE_PERCENT_MIN,
                          (used / limit) * API_KEY_USAGE_PERCENT_MAX,
                        ),
                      )
                    : API_KEY_USAGE_PERCENT_MIN;
                const progressClass =
                  progress >= API_KEY_USAGE_PERCENT_MAX
                    ? "full"
                    : progress >= API_KEY_USAGE_WARNING_THRESHOLD
                      ? "warn"
                      : "";
                const modelLabels =
                  row.scope === "all"
                    ? [t("console.account.allModelsTag")]
                    : row.models.length
                      ? row.models.map((model) => apiKeyModelLabel(model, t))
                      : [t("console.account.notSelected")];
                return (
                  <tr key={row.id}>
                    {enterpriseSelectionEnabled ? (
                      <td className="api-key-selection-column">
                        <input
                          className="api-key-selection-checkbox"
                          type="checkbox"
                          checked={selectedKeyIDs.includes(row.id)}
                          onChange={(event) =>
                            toggleRowSelection(row.id, event.target.checked)
                          }
                          aria-label={t("console.account.selectKey", {
                            name: row.name,
                          })}
                        />
                      </td>
                    ) : null}
                    <td className="api-key-name-cell">
                      <div className="key-name-cell">
                        <strong title={row.name}>{row.name}</strong>
                        <span className="cell-secondary">{workspaceLabel}</span>
                      </div>
                    </td>
                    <td>
                      <span className="key-masked">
                        {row.masked_key}
                        <button
                          type="button"
                          className="copy-btn"
                          title={t(
                            row.secret
                              ? "console.account.copyFullKey"
                              : "console.account.notAvailable",
                          )}
                          aria-label={t(
                            row.secret
                              ? "console.account.copyFullKey"
                              : "console.account.notAvailable",
                          )}
                          disabled={!row.secret}
                          onClick={() => copyApiKey(row)}
                        >
                          <IconCopy />
                        </button>
                      </span>
                    </td>
                    <td>
                      <div className="creator-cell">
                        <span className="creator-avatar" aria-hidden="true">
                          {(row.creator.display_name || "?").slice(0, 1)}
                        </span>
                        <span className="creator-copy">
                          <strong>
                            {row.creator.display_name ||
                              t("console.account.unknownUser")}
                          </strong>
                          <span className="cell-secondary">
                            {row.creator.masked_phone ||
                              t("console.account.phoneUnbound")}
                          </span>
                        </span>
                      </div>
                    </td>
                    {showExtendedColumns ? <td className="limit-cell">
                      {row.limits.enabled === false ? (
                        <span className="table-muted">
                          {t("console.account.limitClosed")}
                        </span>
                      ) : (
                        <div className="metric-stack">
                          <span className="metric-line">
                            <strong>RPM</strong>
                            {numberLabel(row.limits.rpm)}
                          </span>
                          <span className="metric-line">
                            <strong>TPM</strong>
                            {numberLabel(row.limits.tpm)}
                          </span>
                          <span className="metric-line">
                            <strong>{t("console.account.costLimit")}</strong>
                            {yuanLabel(row.limits.cost_limit_yuan)}
                          </span>
                        </div>
                      )}
                    </td> : null}
                    {showExtendedColumns ? <td>
                      <div className="usage-cell">
                        <span>
                          <span className="usage-value">
                            {yuanLabel(row.limits.used_amount_yuan)}
                          </span>{" "}
                          <span className="cell-secondary">
                            / {yuanLabel(row.limits.cost_limit_yuan)}
                          </span>
                        </span>
                        {row.limits.cost_limit_yuan ? (
                          <div
                            className="usage-bar"
                            aria-label={t("console.account.usedPercent", {
                              percent: Math.round(progress),
                            })}
                          >
                            <div
                              className={"usage-bar-fill " + progressClass}
                              style={{ width: String(progress) + "%" }}
                            />
                          </div>
                        ) : null}
                      </div>
                    </td> : null}
                    {showExtendedColumns ? <td className="model-cell">
                      <div className="model-tags">
                        {modelLabels.slice(0, 2).map((label) => (
                          <span className="model-tag" title={label} key={label}>
                            {label}
                          </span>
                        ))}
                        {modelLabels.length > 2 ? (
                          <span className="model-tag">
                            +{modelLabels.length - 2}
                          </span>
                        ) : null}
                      </div>
                    </td> : null}
                    <td>
                      <span className={"api-key-status-badge " + row.status}>
                        {row.status === "active"
                          ? t("console.account.enable")
                          : row.status === "disabled"
                            ? t("console.account.disabled")
                            : t("console.account.expired")}
                      </span>
                    </td>
                    {showExtendedColumns ? <td className="tag-cell">
                      {row.tags.length ? (
                        <div className="tag-list">
                          {row.tags.map((tag) => (
                            <span className="model-tag" title={tag} key={tag}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="table-muted">--</span>
                      )}
                    </td> : null}
                    <td>{apiDateLabel(row.created_at)}</td>
                    {showExtendedColumns ? <td>{apiDateLabel(row.last_used_at)}</td> : null}
                    {showExtendedColumns ? <td>
                      <Link
                        className="activity-link"
                        to={`${PERSONAL_USAGE_MANAGEMENT_PATH}&api_key_id=${encodeURIComponent(row.id)}`}
                        title={t("console.account.viewUsageManagement")}
                      >
                        {t("console.common.details")}
                        <IconArrowRight aria-hidden="true" />
                      </Link>
                    </td> : null}
                    <td>
                      <div className="action-buttons">
                        <button
                          className="table-icon-action"
                          type="button"
                          aria-label={t("console.account.edit")}
                          title={t("console.account.edit")}
                          onClick={() => openEdit(row)}
                        >
                          <IconEditStroked />
                        </button>
                        {row.status === "expired" ? null : row.status ===
                          "active" ? (
                          <button
                            className="table-icon-action"
                            type="button"
                            aria-label={t("console.account.disableTitle")}
                            title={t("console.account.disableTitle")}
                            onClick={() =>
                              setAction({ type: "disable", key: row })
                            }
                          >
                            <IconMinusCircleStroked />
                          </button>
                        ) : (
                          <button
                            className="table-icon-action"
                            type="button"
                            aria-label={t("console.account.enableTitle")}
                            title={t("console.account.enableTitle")}
                            onClick={() =>
                              setAction({ type: "enable", key: row })
                            }
                          >
                            <IconPlusCircleStroked />
                          </button>
                        )}
                        <button
                          className="table-icon-action danger"
                          type="button"
                          aria-label={t("console.account.delete")}
                          title={t("console.account.delete")}
                          onClick={() =>
                            setAction({ type: "delete", key: row })
                          }
                        >
                          <IconDeleteStroked />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!initialTableLoading && totalRows > 0 ? (
        <TraePagination
          ariaLabel={t("console.common.page")}
          currentPage={currentPage}
          pageSize={pageSize}
          total={totalRows}
          pageSizeOpts={[10, 20, 50]}
          summary={t("console.common.showRange", {
            start: (currentPage - 1) * pageSize + 1,
            end: Math.min(currentPage * pageSize, totalRows),
            total: totalRows,
          })}
          disabled={loading}
          onChange={(nextPage, nextPageSize) => {
            setPageSize(nextPageSize);
            setPage(nextPageSize === pageSize ? nextPage : 1);
            setSelectedKeyIDs([]);
          }}
        />
      ) : null}
      {enterpriseSelectionEnabled && selectedRows.length ? (
        <div
          className="api-key-bulk-toolbar"
          role="toolbar"
          aria-label={t("console.account.bulkActions")}
        >
          <span className="api-key-bulk-count">
            {t("console.account.selectedKeys", { count: selectedRows.length })}
          </span>
          <button
            className="api-key-bulk-cancel"
            type="button"
            onClick={() => setSelectedKeyIDs([])}
          >
            {t("console.account.clearSelection")}
          </button>
          <div className="api-key-bulk-buttons">
            <button
              className="api-key-bulk-action-button"
              type="button"
              onClick={openBulkEdit}
            >
              {t("console.account.bulkEdit")}
            </button>
            <button
              className="api-key-bulk-action-button"
              type="button"
              onClick={() => openBulkAction("enable")}
            >
              {t("console.account.bulkEnable")}
            </button>
            <button
              className="api-key-bulk-action-button"
              type="button"
              onClick={() => openBulkAction("disable")}
            >
              {t("console.account.bulkDisable")}
            </button>
            <button
              className="api-key-bulk-action-button"
              type="button"
              onClick={() => openBulkAction("delete")}
            >
              {t("console.account.bulkDelete")}
            </button>
          </div>
        </div>
      ) : null}
      <Modal
        centered
        className="api-key-management-modal"
        title={
          bulkEditing
            ? t("console.account.bulkEdit")
            : editingKey
              ? t("console.account.edit")
              : t("console.account.create")
        }
        visible={modalVisible}
        onCancel={closeModal}
        onOk={() => {
          void (bulkEditing ? saveBulkEdit() : saveKey());
        }}
        okText={
          bulkEditing || editingKey
            ? t("console.account.saveChanges")
            : t("console.account.createKeyAction")
        }
        cancelText={t("console.common.cancel")}
        okButtonProps={{
          loading: saving || bulkEditSaving,
          disabled: saving || bulkEditSaving || subscriptionFormBlocked,
        }}
      >
        <div className="modal-form api-key-modal-form">
          {enterpriseBatchEditLimited ? (
            <BannerNotice tone="info">
              {t("console.account.enterpriseEditLimitedHint")}
            </BannerNotice>
          ) : null}
          {availableModelsLoading ? (
            <BannerNotice tone="info">
              {t("console.account.visibleModelsLoading")}
            </BannerNotice>
          ) : null}
          {!bulkEditing ? (
            <>
              <div className="api-key-form-field api-key-tags-field">
                <label className="field-label" htmlFor="key-tags">
                  {t("console.account.tags")}{" "}
                </label>
                <Input
                  id="key-tags"
                  value={form.tagsText}
                  onChange={(value) => updateForm({ tagsText: value })}
                  disabled={enterpriseBatchEditLimited}
                  placeholder={t("console.account.tagsPlaceholder")}
                  maxLength={120}
                />
                <span className="api-key-field-hint">
                  {t("console.account.tagsHint")}
                </span>
              </div>
              <div className={`api-key-form-field api-key-name-field${requiredErrors.name ? " is-invalid" : ""}`}>
                <SemiFormLabel className="field-label" name="key-name" required>
                  {t("console.account.keyName")}
                </SemiFormLabel>
                <Input
                  id="key-name"
                  required
                  aria-required="true"
                  value={form.name}
                  onChange={(value) => updateForm({ name: value })}
                  disabled={enterpriseBatchEditLimited}
                  validateStatus={requiredErrors.name ? "error" : "default"}
                  placeholder={t("console.account.keyNamePlaceholder")}
                  maxLength={32}
                  showClear
                />
                {requiredErrors.name ? (
                  <span className="api-key-field-error" id="key-name-error" role="alert">
                    {requiredErrors.name}
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
          {advancedVisible ? (
            <>
              <div className="api-key-form-field api-key-validity-field api-key-advanced-inline-field">
                <label className="field-label" htmlFor="key-expiry">
                  {t("console.account.validity")}
                </label>
                <Select
                  id="key-expiry"
                  value={expiryPreset}
                  onChange={(value) => selectExpiry(String(value))}
                  disabled={enterpriseBatchEditLimited}
                  block
                >
                  {editingKey || bulkEditing ? (
                    <Select.Option value="current">
                      {t("console.account.keepExpiry")}
                    </Select.Option>
                  ) : null}
                  <Select.Option value="never">
                    {t("console.account.forever")}
                  </Select.Option>
                  <Select.Option value="30days">
                    {t("console.account.days30")}
                  </Select.Option>
                  <Select.Option value="90days">
                    {t("console.account.days90")}
                  </Select.Option>
                  <Select.Option value="365days">
                    {t("console.account.year1")}
                  </Select.Option>
                </Select>
              </div>
              {/* 中文：费用来源与可用模型位置对调，费用来源在上。 */}
              <fieldset
                className="api-key-form-field api-key-fieldset api-key-billing-field api-key-advanced-inline-field"
              >
            <legend className="field-label">
              {t("console.account.expenseSource")}
            </legend>
            <div className="billing-source-options">
              <label className="billing-source-option">
                <input
                  type="radio"
                  name="api-key-billing-source"
                  value="balance"
                  checked={form.billingSource === "balance"}
                  onChange={() => changeBillingSource("balance")}
                />
                <span>{t("console.account.balanceExpense")}</span>
              </label>
              <label className="billing-source-option">
                <input
                  type="radio"
                  name="api-key-billing-source"
                  value="subscription"
                  checked={form.billingSource === "subscription"}
                  onChange={() => changeBillingSource("subscription")}
                />
                <span>{t("console.account.subscriptionExpense")}</span>
              </label>
            </div>
              </fieldset>
            <div className="api-key-form-field api-key-model-field api-key-advanced-inline-field">
                <label className="field-label" htmlFor="key-models">
                  {t("console.account.availableModels")}
                </label>
                {/* 中文：保留范围单选的无障碍与旧测试入口，视觉交互以 Semi 多选下拉框为准。 */}
                <div className="api-key-scope-options">
                  <label className="api-key-scope-radio">
                    <input
                      type="radio"
                      name="api-key-scope"
                      value="all"
                      checked={form.scope === "all"}
                      onChange={() => updateForm({ scope: "all", modelIds: [] })}
                    />
                    <span>{t("console.account.currentEnabledModels")}</span>
                  </label>
                  <label className="api-key-scope-radio">
                    <input
                      type="radio"
                      name="api-key-scope"
                      value="selected"
                      checked={form.scope === "selected"}
                      onChange={() => updateForm({ scope: "selected" })}
                    />
                    <span>{t("console.account.selectedModel")}</span>
                  </label>
                </div>
                {form.billingSource === "subscription" && !subscriptionModels.error ? (
                  <BannerNotice tone="info">
                    {subscriptionModels.loading
                      ? t("console.account.subscriptionModelsLoading")
                      : !subscriptionModels.hasSubscription
                        ? t("console.account.subscriptionModelsUnavailable")
                        : !subscriptionModels.models.length
                          ? t("console.account.subscriptionModelsEmpty")
                          : form.modelIds.length > 256
                            ? t("console.account.subscriptionModelLimit")
                            : t("console.account.selectedCount", { count: subscriptionModels.models.length })}
                  </BannerNotice>
                ) : null}
                <div className="api-key-model-picker">
                  <Select
                    id="key-models"
                    multiple
                    value={form.modelIds}
                    onChange={(value) => {
                      const pickedModelIds = Array.isArray(value) ? value.map(String) : [];
                      const modelIds = form.billingSource === "subscription"
                        ? pickedModelIds.filter((modelID) => subscriptionModels.models.some((model) => model.id === modelID))
                        : pickedModelIds;
                      updateForm({ modelIds, scope: modelIds.length ? "selected" : "all" });
                    }}
                    filter
                    searchPosition="dropdown"
                    position="top"
                    maxTagCount={2}
                    placeholder={t("console.account.allModelsPlaceholder")}
                    emptyContent={t("console.account.noMatchingModels")}
                    block
                    disabled={form.billingSource === "subscription" && (subscriptionModels.loading || Boolean(subscriptionModels.error) || !subscriptionModels.models.length)}
                    dropdownClassName="trae-select-dropdown api-key-model-dropdown"
                    aria-label={t("console.account.availableModels")}
                  >
                    {formAvailableModels.map((model) => (
                      <Select.Option key={model.id} value={model.id}>
                        {apiKeyModelLabel(model, t)}
                      </Select.Option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="api-key-form-field api-key-whitelist-field api-key-advanced-inline-field">
                <label className="field-label" htmlFor="key-whitelist">
                  {t("console.account.whitelist")}
                </label>
                <Input
                  id="key-whitelist"
                  value={form.whitelistText}
                  onChange={(value) => updateForm({ whitelistText: value })}
                  placeholder={t("console.account.whitelistPlaceholder")}
                  maxLength={2048}
                  aria-describedby="key-whitelist-hint"
                />
                <span className="api-key-field-hint" id="key-whitelist-hint">
                  {t("console.account.whitelistHint")}
                </span>
              </div>
            </>
          ) : null}
          <div className="api-key-form-field api-key-limit-switch-field">
            <label className="api-key-switch-row">
              <span>
                <strong>{t("console.account.enableLimits")}</strong>
                <small>{t("console.account.enableLimitsHint")}</small>
              </span>
              <Switch
                checked={form.limitsEnabled}
                onChange={(checked) => updateForm({ limitsEnabled: checked })}
                aria-label={t("console.account.enableLimits")}
              />
            </label>
          </div>
          {mode === "enterprise" && !editingKey && !bulkEditing ? (
            <div className={`api-key-form-field api-key-member-field${requiredErrors.memberID ? " is-invalid" : ""}`}>
              <SemiFormLabel className="field-label" name="key-member" required>
                {t("console.account.operator")}
              </SemiFormLabel>
              <Select
                id="key-member"
                value={form.memberID}
                onChange={(value) =>
                  updateForm({ memberID: String(value ?? "") })
                }
                onSearch={(value) => setMemberSearch(value)}
                filter
                searchPosition="dropdown"
                searchPlaceholder={t("console.account.operatorSearch")}
                placeholder={t("console.account.operatorPlaceholder")}
                loading={membersLoading}
                emptyContent={
                  membersError || t("console.account.operatorEmpty")
                }
                block
                validateStatus={requiredErrors.memberID ? "error" : "default"}
                aria-required="true"
                inputProps={{ required: true, "aria-required": true }}
                dropdownClassName="trae-select-dropdown trae-members-filter-dropdown api-key-member-dropdown"
              >
                {enterpriseMembers.map((member) => (
                  <Select.Option key={member.id} value={member.id}>
                    {formatPersonOptionLabel(member.display_name || member.user_id, member.masked_contact)}
                  </Select.Option>
                ))}
              </Select>
              {requiredErrors.memberID ? (
                <span className="api-key-field-error" id="key-member-error" role="alert">
                  {requiredErrors.memberID}
                </span>
              ) : (
                <span className="api-key-field-hint">
                  {t("console.account.operatorHint")}
                </span>
              )}
            </div>
          ) : null}
          {advancedVisible ? (
            <div id="api-key-advanced-fields" className="api-key-advanced-fields">
              <div className="api-key-advanced-settings">
                  <div className="api-key-form-field">
                    <div className="api-key-limit-field-head">
                      <label className="field-label" htmlFor="key-cost-limit">
                        {t("console.account.cumulativeLimit")}{" "}
                      </label>
                    </div>
                    <div className="api-key-input-with-prefix">
                      <span>￥</span>
                      <Input
                        id="key-cost-limit"
                        value={form.costLimitYuan}
                        onChange={(value) =>
                          updateForm({ costLimitYuan: value })
                        }
                        placeholder={t("console.account.costLimitPlaceholder")}
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                  <div className="api-key-form-field">
                    <label className="field-label">
                      {t("console.account.rateLimit")}{" "}
                    </label>
                    <div className="api-key-limit-grid">
                      <label>
                        <span>{t("console.account.concurrency")}</span>
                        <Input
                          id="key-concurrency"
                          value={form.concurrency}
                          onChange={(value) =>
                            updateForm({
                              concurrency: value.replace(/\D/g, ""),
                            })
                          }
                          placeholder={t("console.account.unlimited")}
                          inputMode="numeric"
                        />
                      </label>
                      <label>
                        <span>RPM</span>
                        <Input
                          id="key-rpm"
                          value={form.rpm}
                          onChange={(value) =>
                            updateForm({ rpm: value.replace(/\D/g, "") })
                          }
                          placeholder={t("console.account.unlimited")}
                          inputMode="numeric"
                        />
                      </label>
                      <label>
                        <span>TPM</span>
                        <Input
                          id="key-tpm"
                          value={form.tpm}
                          onChange={(value) =>
                            updateForm({ tpm: value.replace(/\D/g, "") })
                          }
                          placeholder={t("console.account.unlimited")}
                          inputMode="numeric"
                        />
                      </label>
                    </div>
                    <span className="api-key-field-hint">
                      {t("console.account.rateLimitHint")}
                    </span>
                  </div>
              </div>
            </div>
          ) : null}
        </div>
      </Modal>
      {createdSecret ? (
        <Modal
          className="api-key-created-modal"
          title={t("console.account.createdKeyTitle")}
          visible
          onCancel={closeCreatedSecretModal}
          footer={
            <div className="api-key-created-modal-footer">
              <Button
                theme="solid"
                type="tertiary"
                onClick={closeCreatedSecretModal}
              >
                {t("console.account.createdKeyDone")}
              </Button>
            </div>
          }
        >
          <div className="api-key-created-modal-body">
            <p className="api-key-created-modal-hint">
              {t("console.account.createdKeyHint")}
            </p>
            <div className="api-key-created-modal-value">
              <code>{createdSecret}</code>
              <Button
                theme="solid"
                type="primary"
                icon={<IconCopy aria-hidden="true" />}
                onClick={() => {
                  void copyText(createdSecret, t("console.account.copiedKey"));
                }}
              >
                {t("console.account.createdKeyCopy")}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
      <Modal
        key={bulkAction?.type ?? "bulk-closed"}
        title={
          bulkAction?.type === "delete"
            ? t("console.account.bulkDelete")
            : bulkAction?.type === "disable"
              ? t("console.account.bulkDisable")
              : t("console.account.bulkEnable")
        }
        visible={bulkAction !== null}
        onCancel={() => {
          if (!bulkActionLoading) setBulkAction(null);
        }}
        onOk={() => {
          void runBulkAction();
        }}
        okText={t("console.account.confirmBulkAction")}
        cancelText={t("console.common.cancel")}
        okButtonProps={{
          loading: bulkActionLoading,
          disabled: bulkActionLoading,
        }}
      >
        <p className="api-key-confirm-copy">
          {bulkAction
            ? t("console.account.bulkActionHint", {
                count: bulkAction.keys.length,
                action:
                  bulkAction.type === "delete"
                    ? t("console.account.bulkDelete")
                    : bulkAction.type === "disable"
                      ? t("console.account.bulkDisable")
                      : t("console.account.bulkEnable"),
              })
            : null}
        </p>
      </Modal>
      <Modal
        key={action?.type ?? "closed"}
        title={
          action?.type === "delete"
            ? t("console.account.deleteTitle")
            : action?.type === "disable"
              ? t("console.account.disableTitle")
              : t("console.account.enableTitle")
        }
        visible={action !== null}
        onCancel={() => {
          if (!actionLoading) setAction(null);
        }}
        onOk={() => {
          void runAction();
        }}
        okText={
          action?.type === "delete"
            ? t("console.account.confirmDelete")
            : action?.type === "disable"
              ? t("console.account.confirmDisable")
              : t("console.account.confirmEnable")
        }
        cancelText={t("console.common.cancel")}
        okButtonProps={{ loading: actionLoading, disabled: actionLoading }}
      >
        <p className="api-key-confirm-copy">
          {action?.type === "delete"
            ? t("console.account.deleteHint", { name: action.key.name })
            : action?.type === "disable"
              ? t("console.account.disableHint", { name: action.key.name })
              : t("console.account.enableHint", { name: action?.key.name })}
        </p>
      </Modal>
    </div>
  );
}

export { BillingPage } from "./billing";

export function SettingsPage() {
  const { t } = useTranslation();
  const store = useAppStore();
  const [nickname, setNickname] = useState(store.nickname);
  const [lowBalance, setLowBalance] = useState(true);
  const [invitations, setInvitations] = useState(true);
  const [productUpdates, setProductUpdates] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  function saveProfile(): void {
    const next = nickname.trim();
    if (!next) {
      Toast.warning(t("profile.personal.emptyName"));
      return;
    }
    store.updateProfile({
      nickname: next,
      phone: store.phone,
      avatar: next.slice(0, 1).toUpperCase(),
    });
    Toast.success(t("profile.personal.saved"));
  }
  return (
    <div className="page-stack settings-console-page">
      <PageTitle
        title={t("profile.title")}
        description={t("profile.description")}
      />
      <div className="settings-page-inner">
        <section className="settings-section">
          <div className="settings-section-head">
            <h2>{t("profile.personal.title")}</h2>
            <p>{t("profile.personal.description")}</p>
            <p className="settings-hint">{t("profile.personal.dataHint")}</p>
          </div>
          <div className="settings-form">
            <div className="settings-row">
              <span className="settings-label">
                {t("profile.personal.avatar")}
              </span>
              <div className="settings-control">
                <div className="settings-avatar">{store.avatar}</div>
                <p className="settings-hint">
                  {t("profile.personal.avatarHint")}
                </p>
              </div>
            </div>
            <div className="settings-row">
              <label className="settings-label" htmlFor="nickname">
                {t("profile.personal.nickname")}
              </label>
              <div className="settings-control">
                <Input
                  className="app-standard-input settings-profile-input"
                  id="nickname"
                  size="large"
                  value={nickname}
                  onChange={setNickname}
                  maxLength={20}
                />
                <p className="settings-hint">
                  {t("profile.personal.nicknameHint", { count: 20 })}
                </p>
              </div>
            </div>
            <div className="settings-row">
              <span className="settings-label">
                {t("profile.contact.phone")}
              </span>
              <div className="settings-control">
                <div className="settings-inline">
                  <span className="settings-readonly">{store.phone}</span>
                  <Button
                    theme="outline"
                    size="small"
                    onClick={() => Toast.info(t("profile.personal.phoneHint"))}
                  >
                    {t("profile.contact.changePhone")}
                  </Button>
                </div>
                <p className="settings-hint">
                  {t("profile.personal.phoneHint")}
                </p>
              </div>
            </div>
            <div className="settings-row">
              <span className="settings-label">
                {t("profile.contact.email")}
              </span>
              <div className="settings-control">
                <div className="settings-inline">
                  <span className="settings-readonly">
                    {t("profile.contact.unboundEmail")}
                  </span>
                  <Button
                    theme="outline"
                    size="small"
                    onClick={() => Toast.info(t("profile.personal.emailHint"))}
                  >
                    {t("profile.contact.bindEmail")}
                  </Button>
                </div>
                <p className="settings-hint">
                  {t("profile.personal.emailHint")}
                </p>
              </div>
            </div>
            <div className="settings-row">
              <span className="settings-label">{t("profile.overview.id")}</span>
              <div className="settings-control">
                <div className="settings-inline">
                  <code className="settings-readonly">usr_han_001</code>
                  <Button
                    theme="outline"
                    size="small"
                    onClick={() => Toast.success(t("profile.overview.copied"))}
                  >
                    {t("profile.overview.copyShort")}
                  </Button>
                </div>
                <p className="settings-hint">
                  {t("profile.personal.userIdHint")}
                </p>
              </div>
            </div>
            <div className="settings-row">
              <span />
              <div className="settings-actions">
                <Button theme="solid" type="primary" onClick={saveProfile}>
                  {t("profile.personal.save")}
                </Button>
              </div>
            </div>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-section-head">
            <h2>{t("profile.notifications.title")}</h2>
            <p>{t("profile.notifications.description")}</p>
          </div>
          <div className="notification-list">
            <label className="notification-row">
              <span>
                <strong>{t("profile.notifications.lowBalance")}</strong>
                <small>
                  {t("profile.notifications.lowBalanceDescription")}
                </small>
              </span>
              <Switch checked={lowBalance} onChange={setLowBalance} />
            </label>
            <label className="notification-row">
              <span>
                <strong>{t("profile.notifications.invitations")}</strong>
                <small>
                  {t("profile.notifications.invitationsDescription")}
                </small>
              </span>
              <Switch checked={invitations} onChange={setInvitations} />
            </label>
            <label className="notification-row">
              <span>
                <strong>{t("profile.notifications.productUpdates")}</strong>
                <small>
                  {t("profile.notifications.productUpdatesDescription")}
                </small>
              </span>
              <Switch checked={productUpdates} onChange={setProductUpdates} />
            </label>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-section-head">
            <h2>{t("profile.workspace.title")}</h2>
            <p>{t("profile.workspace.description")}</p>
          </div>
          <div className="workspace-list">
            {store.workspaces.map((workspace) => (
              <div className="workspace-item" key={workspace.id}>
                <div>
                  <strong>{workspace.name}</strong>
                  <small>
                    {workspace.type === "enterprise"
                      ? t("profile.workspace.enterpriseType")
                      : t("profile.workspace.personalType")}
                  </small>
                </div>
                <span>
                  {workspace.id === store.activeWorkspace.id
                    ? t("profile.workspace.current")
                    : workspace.role === "owner"
                      ? t("profile.workspace.owner")
                      : workspace.role}
                </span>
              </div>
            ))}
          </div>
          <Button
            theme="outline"
            onClick={() => window.location.assign(NEW_ENTERPRISE_CREATE_PATH)}
          >
            {t("profile.workspace.create")}
          </Button>
          <p className="settings-hint">{t("profile.workspace.createHint")}</p>
        </section>
        <section className="settings-section settings-security-section">
          <div className="settings-section-head">
            <h2>{t("profile.security.title")}</h2>
            <p>{t("profile.security.description")}</p>
          </div>
          <div className="settings-actions">
            <Button
              theme="outline"
              type="danger"
              onClick={() => setDeleteVisible(true)}
            >
              {t("profile.security.deactivate")}
            </Button>
            <span className="settings-hint">
              {t("profile.security.deactivateHint")}
            </span>
          </div>
        </section>
      </div>
      <Modal
        title={t("profile.security.dialogTitle")}
        visible={deleteVisible}
        onCancel={() => setDeleteVisible(false)}
        onOk={() => {
          setDeleteVisible(false);
          Toast.warning(t("profile.security.dialogPending"));
        }}
        okText={t("profile.security.dialogContinue")}
        cancelText={t("profile.security.dialogCancel")}
      >
        <p>{t("profile.security.dialogDescription")}</p>
      </Modal>
    </div>
  );
}

export function InvitationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const authFailureHandled = useRef(false);
  // 中文：邀请概览失败时也只触发一次会话失效跳转。
  const handleAuthFailure = useCallback((error: unknown): boolean => {
    if (!isAuthenticationFailure(error)) return false;
    if (!authFailureHandled.current) {
      authFailureHandled.current = true;
      dispatch(invalidateAuth());
      navigate("/", { replace: true });
    }
    return true;
  }, [dispatch, navigate]);
  const [copied, setCopied] = useState(false);
  const [overview, setOverview] = useState<InvitationOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const inviteLink = overview
    ? `${window.location.origin}/invite?invite_code=${encodeURIComponent(overview.invite_code)}`
    : "";

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getInvitationOverview({ signal: controller.signal })
      .then(setOverview)
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        if (handleAuthFailure(reason)) return;
        setError(
          reason instanceof Error
            ? reason.message
            : t("console.invitations.loadFailed"),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [handleAuthFailure, navigate, t]);

  useEffect(() => {
    if (error) appToast.error(error);
  }, [error]);

  function copyLink(): void {
    navigator.clipboard
      .writeText(inviteLink)
      .then(() => {
        setCopied(true);
        Toast.success(t("console.invitations.copied"));
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => Toast.error(t("console.common.copyFailed")));
  }

  if (loading)
    return (
      <div className="page-stack invite-page">
        <PageTitle
          title={t("console.invitations.title")}
          description={t("console.invitations.description")}
        />
        <div className="public-invitation-loading" role="status">
          <span className="console-loading-spinner" />
          {t("console.common.loading")}
        </div>
      </div>
    );
  if (error || !overview)
    return (
      <div className="page-stack invite-page">
        <PageTitle
          title={t("console.invitations.title")}
          description={t("console.invitations.description")}
        />
      </div>
    );

  return (
    <div className="page-stack invite-page">
      {/* 中文：邀请页恢复后台统一标题，不再展示与活动数据无关的用户资料。 */}
      <PageTitle
        title={t("console.invitations.title")}
        description={t("console.invitations.description")}
      />
      <section className="invite-overview-grid">
        <div className="invite-link-card invite-exclusive-card">
          <div className="invite-section-heading">
            <span className="invite-section-icon">
              <IconKey />
            </span>
            <div>
              <h2>{t("console.invitations.exclusive")}</h2>
              <p>{t("console.invitations.linkHint")}</p>
            </div>
          </div>
          <div className="invite-url-control">
            <span>{t("console.invitations.link")}</span>
            <div>
              <Input value={inviteLink} readOnly />
              <Button
                theme="solid"
                type="primary"
                icon={<IconCopy />}
                onClick={copyLink}
              >
                {copied
                  ? t("console.invitations.copied")
                  : t("console.invitations.copy")}
              </Button>
            </div>
          </div>
        </div>
        <article className="invite-wallet-card">
          <span>{t("console.invitations.wallet")}</span>
          <strong>
            <MoneyText value={overview.wallet_balance_yuan ?? "0"} />
          </strong>
        </article>
      </section>
      <section className="invite-metrics-grid">
        <article>
          <span>{t("console.invitations.newInvites")}</span>
          <div className="invite-metric-values">
            <div>
              <small>{t("console.invitations.month")}</small>
              <strong>{overview.month_invited_count ?? 0}</strong>
            </div>
            <div>
              <small>{t("console.invitations.allTime")}</small>
              <strong>{overview.invited_count}</strong>
            </div>
          </div>
        </article>
        <article>
          <span>{t("console.invitations.cashback")}</span>
          <div className="invite-metric-values">
            <div>
              <small>{t("console.invitations.month")}</small>
              <strong>
                <MoneyText value={overview.month_reward_yuan ?? "0"} />
              </strong>
            </div>
            <div>
              <small>{t("console.invitations.today")}</small>
              <strong>
                <MoneyText value={overview.today_reward_yuan ?? "0"} />
              </strong>
            </div>
          </div>
        </article>
      </section>
      <section className="invite-trend-card">
        <div className="invite-section-heading">
          <div>
            <h2>{t("console.invitations.trend")}</h2>
            <p>{t("console.invitations.trendHint")}</p>
          </div>
        </div>
        <InvitationTrendChart
          points={
            overview.trend ??
            overview.trend_points ??
            overview.daily_trend ??
            []
          }
        />
      </section>
      <section className="invite-records">
        <div className="invite-section-heading">
          <div>
            <h2>{t("console.invitations.earnings")}</h2>
            <p>{t("console.invitations.earningsHint")}</p>
          </div>
        </div>
        <div className="source-table-scroll">
          <table className="invite-table">
            <thead>
              <tr>
                <th>{t("console.invitations.member")}</th>
                <th>{t("console.invitations.status")}</th>
                <th>{t("console.invitations.joinedAt")}</th>
                <th>{t("console.invitations.reward")}</th>
              </tr>
            </thead>
            <tbody>
              {overview.records.length === 0 ? (
                <tr>
                  <td colSpan={4} className="invite-empty">
                    {t("console.invitations.noRecords")}
                  </td>
                </tr>
              ) : (
                overview.records.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <strong>{record.display_name}</strong>
                    </td>
                    <td>
                      <span className="invite-status">
                        {record.status === "joined"
                          ? t("console.invitations.joined")
                          : record.status}
                      </span>
                    </td>
                    <td>{formatApiTime(record.joined_at)}</td>
                    <td>
                      <MoneyText value={record.reward_yuan ?? "0"} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function EnterpriseSettingsPage() {
  const { t } = useTranslation();
  const anchorItems: SettingsAnchorItem[] = [
    { id: "enterprise-profile", label: t("console.enterpriseSettings.profileTitle") },
    { id: "enterprise-protection", label: t("console.enterpriseSettings.protectionTitle") },
    { id: "enterprise-ownership", label: t("console.enterpriseSettings.ownershipTitle") },
  ];
  return (
    <div className="page-stack settings-console-page settings-redesign-page enterprise-settings-page">
      <PageTitle
        title={t("console.enterpriseSettings.title")}
        description={t("console.enterpriseSettings.description")}
      />
      <div className="settings-page-inner">
        <SettingsAnchorLayout
          items={anchorItems}
          navigationLabel={t("console.enterpriseSettings.navigationLabel")}
        >
          <section
            id="enterprise-profile"
            className="settings-section settings-anchor-section"
            aria-labelledby="enterprise-profile-title"
          >
            <header className="settings-section-head">
              <h2 id="enterprise-profile-title">
                {t("console.enterpriseSettings.profileTitle")}
              </h2>
              <p>{t("console.enterpriseSettings.profileDescription")}</p>
            </header>
            <div className="settings-card enterprise-settings-card">
              <div className="enterprise-read-grid">
                <div>
                  <span>{t("console.enterpriseSettings.verifiedName")}</span>
                  <strong>NX Labs 智能科技（上海）有限公司</strong>
                </div>
                <div>
                  <span>{t("console.enterpriseSettings.creditCode")}</span>
                  <strong>91310000MA1FL0AB2C</strong>
                </div>
                <div>
                  <span>{t("console.enterpriseSettings.status")}</span>
                  <strong className="source-status-badge active">
                    {t("console.enterpriseSettings.verified")}
                  </strong>
                </div>
                <div>
                  <span>{t("console.enterpriseSettings.nature")}</span>
                  <strong>{t("console.enterpriseSettings.companyNature")}</strong>
                </div>
                <div>
                  <span>{t("console.enterpriseSettings.createdAt")}</span>
                  <strong>2026-05-08</strong>
                </div>
                <div>
                  <span>{t("console.enterpriseSettings.contact")}</span>
                  <strong>han</strong>
                </div>
                <div>
                  <span>{t("console.enterpriseSettings.phone")}</span>
                  <strong>138****8000</strong>
                </div>
              </div>
            </div>
          </section>
          <section
            id="enterprise-protection"
            className="settings-section settings-anchor-section"
            aria-labelledby="enterprise-protection-title"
          >
            <header className="settings-section-head">
              <h2 id="enterprise-protection-title">
                {t("console.enterpriseSettings.protectionTitle")}
              </h2>
              <p>{t("console.enterpriseSettings.protectionIntro")}</p>
            </header>
            <div className="settings-card enterprise-settings-card enterprise-settings-card--protection">
              <p>
                <span className="source-status-badge active">
                  {t("console.enterpriseSettings.protectionEnabled")}
                </span>
              </p>
              <p>{t("console.enterpriseSettings.protectionDetails")}</p>
            </div>
          </section>
          <section
            id="enterprise-ownership"
            className="settings-section settings-anchor-section"
            aria-labelledby="enterprise-ownership-title"
          >
            <header className="settings-section-head">
              <h2 id="enterprise-ownership-title">
                {t("console.enterpriseSettings.ownershipTitle")}
              </h2>
              <p>{t("console.enterpriseSettings.ownershipHint")}</p>
            </header>
            <div className="settings-card enterprise-settings-card enterprise-settings-card--ownership">
              <div className="owner-row">
                <span className="owner-avatar">
                  {t("console.enterpriseSettings.ownerInitial")}
                </span>
                <strong>
                  {t("console.enterpriseSettings.ownerName")}{" "}
                  <small>{t("console.enterpriseSettings.owner")}</small>
                </strong>
              </div>
              <Button
                theme="outline"
                onClick={() =>
                  Toast.info(t("console.enterpriseSettings.transferHint"))
                }
              >
                {t("console.enterpriseSettings.transfer")}
              </Button>
            </div>
          </section>
        </SettingsAnchorLayout>
      </div>
    </div>
  );
}
