import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Toast from "@douyinfe/semi-ui/lib/es/toast";
import { Form } from "@douyinfe/semi-ui/lib/es/form";
import Select from "@douyinfe/semi-ui/lib/es/select";
import { IconCopy, IconLink, IconRefresh } from "@douyinfe/semi-icons";
import {
  createEnterpriseInvitation,
  getEnterpriseInvitationUsages,
  getEnterpriseInvitations,
  type EnterpriseContext,
  type EnterpriseInvitation,
  type EnterpriseInvitationUsage,
} from "@/api/enterprise-console";
import { getAccessToken } from "@/auth/token-storage";
import {
  EnterpriseError,
  useEnterpriseErrorHandler,
  type EnterpriseRequestError,
} from "@/pages/enterprise-console-shared";
import { formatApiTime } from "@/utils/format";
import { startOfLocalDay } from "@/utils/date-range";
import { TraeDialog } from "./trae-dialog";
import { TraePagination } from "./trae-pagination";
import { TraeTableEmpty } from "./trae-table-empty";
import "./trae-date-picker.css";
import "./trae-enterprise-invitations.css";

const INVITATION_PAGE_SIZE = 10;

type CreateInvitationValues = {
  maxUses: string | number;
  expiresAt?: Date | string;
  role: string;
  departmentId: string;
};

/** 将邀请有效期自然日转换为接口要求的 UTC 毫秒时间戳。 */
export function invitationExpiryTimestamp(value: Date) {
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

/** 兼容 Semi 输入框手动录入产生的日期字符串，并始终按本地自然日解析。 */
function normalizeDateValue(value: Date | string | undefined) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return date;
}

type TraeEnterpriseInvitationsProps = {
  context: EnterpriseContext;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  departments?: Array<{ id: string; name: string }>;
};

function inviteStatusClass(status: string) {
  if (status === "active") return "is-success";
  if (status === "revoked") return "is-failed";
  return "is-pending";
}

function invitationRoleOptions(context: EnterpriseContext) {
  return (context.role_options ?? []).filter((role) => !role.owner_role);
}

/** 新版人员管理的邀请链接列表、创建弹窗及使用情况详情。 */
export function TraeEnterpriseInvitations({
  context,
  createOpen,
  onCreateOpenChange,
  departments = [],
}: TraeEnterpriseInvitationsProps) {
  const { t } = useTranslation();
  const handleError = useEnterpriseErrorHandler();
  const roles = useMemo(() => invitationRoleOptions(context), [context.role_options]);
  const defaultRole = roles.find((role) => role.code === "member")?.code ?? roles[0]?.code ?? "member";
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(INVITATION_PAGE_SIZE);
  const [items, setItems] = useState<EnterpriseInvitation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<EnterpriseRequestError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<EnterpriseRequestError | null>(null);
  const [detailInvitation, setDetailInvitation] = useState<EnterpriseInvitation | null>(null);
  const [usages, setUsages] = useState<EnterpriseInvitationUsage[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<EnterpriseRequestError | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    getEnterpriseInvitations(
      { enterprise_id: context.id },
      {
        page,
        page_size: pageSize,
        status: status === "all" ? undefined : status,
        accessToken: getAccessToken() ?? undefined,
        signal: controller.signal,
      },
    )
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setTotal(result.total);
        const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
        if (page > lastPage) setPage(lastPage);
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
  }, [context.id, handleError, page, pageSize, reloadToken, status]);

  useEffect(() => {
    if (!detailInvitation) return undefined;
    const controller = new AbortController();
    let active = true;
    setUsageLoading(true);
    setUsageError(null);
    setUsages([]);
    getEnterpriseInvitationUsages(
      { enterprise_id: context.id },
      detailInvitation.id,
      { accessToken: getAccessToken() ?? undefined, signal: controller.signal },
    )
      .then((result) => {
        if (active) setUsages(result);
      })
      .catch((reason: unknown) => {
        if (!active || controller.signal.aborted) return;
        const handled = handleError(reason);
        if (handled) setUsageError(handled);
      })
      .finally(() => {
        if (active) setUsageLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [context.id, detailInvitation, handleError]);

  function roleName(invitation: EnterpriseInvitation) {
    return invitation.role_name || roles.find((role) => role.code === invitation.role)?.name || invitation.role || "--";
  }

  async function submitCreate(values: CreateInvitationValues) {
    const maxUses = Number(values.maxUses);
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 999) return;
    const expiresAtValue = normalizeDateValue(values.expiresAt);
    const hasExpiryInput = values.expiresAt instanceof Date || (typeof values.expiresAt === "string" && values.expiresAt.trim() !== "");
    if (hasExpiryInput && !expiresAtValue) return;
    // 选择器之外仍可能通过表单 API 写入日期，因此提交时再次限制不能早于今天。
    if (expiresAtValue && startOfLocalDay(expiresAtValue) < startOfLocalDay(new Date())) return;
    setCreating(true);
    setCreateError(null);
    try {
      const expiresAt = expiresAtValue ? invitationExpiryTimestamp(expiresAtValue) : null;
      await createEnterpriseInvitation(
        { enterprise_id: context.id },
        { role: values.role || defaultRole, max_uses: maxUses, expires_at: expiresAt, department_id: values.departmentId },
        { accessToken: getAccessToken() ?? undefined },
      );
      onCreateOpenChange(false);
      setPage(1);
      setStatus("all");
      setReloadToken((value) => value + 1);
      Toast.success(t("traeEnterprise.inviteList.createSuccess"));
    } catch (reason: unknown) {
      const handled = handleError(reason);
      if (handled) setCreateError(handled);
    } finally {
      setCreating(false);
    }
  }

  async function copyInvitationURL(url: string) {
    const absoluteURL = url.startsWith("http") ? url : `${window.location.origin}${url}`;
    try {
      await navigator.clipboard.writeText(absoluteURL);
      Toast.success(t("traeEnterprise.inviteList.copySuccess"));
    } catch {
      Toast.error(t("console.common.copyFailed"));
    }
  }

  function invitationURL(invitation: EnterpriseInvitation) {
    const value = invitation.invite_url || (invitation.invite_token ? `/join?token=${encodeURIComponent(invitation.invite_token)}` : "");
    return value ? (value.startsWith("http") ? value : `${window.location.origin}${value}`) : "";
  }

  const roleItems = roles.length > 0 ? roles : [{ code: "member", name: t("traeEnterprise.members.member"), owner_role: false }];
  const statusOptions = [
    { value: "all", label: t("traeEnterprise.inviteList.allStatuses") },
    { value: "active", label: t("traeEnterprise.inviteList.active") },
    { value: "revoked", label: t("traeEnterprise.inviteList.revoked") },
    { value: "expired", label: t("traeEnterprise.inviteList.expired") },
    { value: "exhausted", label: t("traeEnterprise.inviteList.exhausted") },
  ];

  return (
    <section className="trae-invitation-panel">
      <div className="trae-invitation-toolbar">
        <Select
          aria-label={t("traeEnterprise.inviteList.allStatuses")}
          className="trae-select trae-invitation-status-select"
          dropdownClassName="trae-select-dropdown trae-members-filter-dropdown"
          value={status}
          onChange={(value) => {
            setPage(1);
            setStatus(String(value ?? "all"));
          }}
        >
          {statusOptions.map((option) => (
            <Select.Option key={option.value} value={option.value}>{option.label}</Select.Option>
          ))}
        </Select>
        <button type="button" className="trae-secondary-button" onClick={() => setReloadToken((value) => value + 1)}>
          <IconRefresh aria-hidden="true" />
          {t("traeEnterprise.common.refresh")}
        </button>
      </div>

      <div className="trae-table-scroll">
        <table className="trae-table trae-invitation-table" aria-busy={loading}>
          <thead>
            <tr>
              <th>{t("traeEnterprise.inviteList.method")}</th>
              <th>{t("traeEnterprise.inviteList.target")}</th>
              <th>{t("traeEnterprise.inviteList.role")}</th>
              <th>{t("traeEnterprise.inviteList.usage")}</th>
              <th>{t("traeEnterprise.inviteList.statusLabel")}</th>
              <th>{t("traeEnterprise.inviteList.action")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr><td colSpan={6}><div className="trae-request-state" role="status"><span className="console-loading-spinner" />{t("traeEnterprise.inviteList.loading")}</div></td></tr>
            ) : error ? (
              <tr><td colSpan={6}><EnterpriseError message={error.message} requestId={error.requestId} onRetry={() => setReloadToken((value) => value + 1)} /></td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6}><TraeTableEmpty hint={t("traeEnterprise.inviteList.empty")} /></td></tr>
            ) : items.map((invitation) => (
              <tr key={invitation.id}>
                <td><span className="trae-invitation-method"><IconLink aria-hidden="true" />{t("traeEnterprise.inviteList.linkMethod")}</span></td>
                <td><code className="trae-invitation-url">{invitationURL(invitation) || "--"}</code></td>
                <td><span className="trae-invitation-role">{roleName(invitation)}</span></td>
                <td>{invitation.used_count}/{invitation.max_uses} · {invitation.expires_at ? formatApiTime(invitation.expires_at) : t("traeEnterprise.inviteList.noExpiry")}</td>
                <td><span className={`trae-status-badge ${inviteStatusClass(invitation.status)}`}><i aria-hidden="true" />{t(`traeEnterprise.inviteList.status.${invitation.status}`, { defaultValue: invitation.status })}</span></td>
                <td><div className="trae-invitation-actions">
                  {invitationURL(invitation) ? <button type="button" onClick={() => void copyInvitationURL(invitationURL(invitation))}><IconCopy aria-hidden="true" />{t("traeEnterprise.inviteList.copy")}</button> : null}
                  <button type="button" onClick={() => setDetailInvitation(invitation)}>{t("traeEnterprise.inviteList.usageDetails")}</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TraePagination
        ariaLabel={t("traeEnterprise.inviteList.pagination")}
        currentPage={page}
        pageSize={pageSize}
        total={total}
        disabled={loading}
        pageSizeOpts={[10, 20, 50]}
        summary={t("traeEnterprise.inviteList.paginationSummary", { total })}
        onChange={(nextPage, nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(nextPageSize === pageSize ? nextPage : 1);
        }}
      />

      {createOpen ? (
        <TraeDialog
          className="trae-invitation-create-dialog"
          title={t("traeEnterprise.inviteList.createTitle")}
          onClose={() => { if (!creating) onCreateOpenChange(false); }}
        >
          <Form<CreateInvitationValues>
            className="trae-dialog-form trae-invitation-create-form"
            labelPosition="top"
            initValues={{ role: defaultRole, maxUses: 10, expiresAt: undefined, departmentId: "" }}
            autoScrollToError
            showValidateIcon={false}
            onSubmit={(values) => void submitCreate(values)}
          >
            <div className="trae-invitation-intro">
              <strong>{t("traeEnterprise.inviteList.createHeading")}</strong>
              <span>{t("traeEnterprise.inviteList.createHint")}</span>
            </div>
            <Form.Input field="maxUses" label={t("traeEnterprise.inviteList.maxUses")} type="number" min={1} max={999} rules={[{ required: true, message: t("traeEnterprise.inviteList.maxUsesRequired") }]} />
            <Form.DatePicker
              field="expiresAt"
              label={t("traeEnterprise.inviteList.expiresAt")}
              className="trae-date-picker trae-invitation-expiry-picker"
              dropdownClassName="trae-date-picker-dropdown trae-invitation-expiry-dropdown"
              type="date"
              format="yyyy-MM-dd"
              placeholder={t("traeEnterprise.inviteList.expiresAt")}
              defaultPickerValue={startOfLocalDay(new Date())}
              disabledDate={(date) => !date || startOfLocalDay(date) < startOfLocalDay(new Date())}
              showClear
            />
            <Form.Select
              field="role"
              label={t("traeEnterprise.inviteList.targetRole")}
              rules={[{ required: true, message: t("traeEnterprise.inviteList.targetRoleRequired") }]}
            >
              {roleItems.map((role) => <Form.Select.Option key={role.code} value={role.code}>{role.name}</Form.Select.Option>)}
            </Form.Select>
            <Form.Select
              field="departmentId"
              label={t("traeEnterprise.inviteList.department")}
              rules={[{ required: true, message: t("traeEnterprise.inviteList.departmentRequired") }]}
              placeholder={t("traeEnterprise.inviteList.departmentPlaceholder")}
            >
              {departments.map((department) => <Form.Select.Option key={department.id} value={department.id}>{department.name}</Form.Select.Option>)}
            </Form.Select>
            <p className="trae-invitation-form-hint">{t("traeEnterprise.inviteList.roleHint")}</p>
            {createError ? <p className="trae-request-review-error">{createError.message}</p> : null}
            <div className="trae-dialog-actions">
              <button className="trae-secondary-button" type="button" disabled={creating} onClick={() => onCreateOpenChange(false)}>{t("traeEnterprise.common.cancel")}</button>
              <button className="trae-primary-button" type="submit" disabled={creating}>{creating ? t("traeEnterprise.inviteList.creating") : t("traeEnterprise.inviteList.createButton")}</button>
            </div>
          </Form>
        </TraeDialog>
      ) : null}

      {detailInvitation ? (
        <TraeDialog
          className="trae-invitation-usage-dialog"
          title={t("traeEnterprise.inviteList.usageTitle")}
          onClose={() => setDetailInvitation(null)}
        >
          <div className="trae-invitation-usage-content">
            <div className="trae-invitation-usage-summary">
              <div><span>{t("traeEnterprise.inviteList.used")}</span><strong>{invitationUsed(detailInvitation)}</strong></div>
              <div><span>{t("traeEnterprise.inviteList.available")}</span><strong>{Math.max(0, detailInvitation.max_uses - detailInvitation.used_count)}</strong></div>
            </div>
            {usageLoading ? <div className="trae-request-state"><span className="console-loading-spinner" />{t("traeEnterprise.inviteList.loading")}</div> : usageError ? <EnterpriseError message={usageError.message} requestId={usageError.requestId} onRetry={() => setDetailInvitation({ ...detailInvitation })} /> : usages.length === 0 ? <div className="trae-invitation-no-usage"><strong>{t("traeEnterprise.inviteList.noUsage")}</strong><span>{t("traeEnterprise.inviteList.noUsageHint")}</span></div> : <div className="trae-invitation-usage-list">{usages.map((usage) => <div key={usage.member_id ?? usage.user_id}><span><strong>{usage.user_name || usage.user_id}</strong><small>{usage.user_id}</small></span><time>{formatApiTime(usage.joined_at)}</time></div>)}</div>}
            <div className="trae-dialog-actions"><button className="trae-primary-button" type="button" onClick={() => setDetailInvitation(null)}>{t("traeEnterprise.common.confirm")}</button></div>
          </div>
        </TraeDialog>
      ) : null}
    </section>
  );
}

function invitationUsed(invitation: EnterpriseInvitation) {
  return invitation.used_count;
}
