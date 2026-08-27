import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form } from "@douyinfe/semi-ui/lib/es/form";
import Select from "@douyinfe/semi-ui/lib/es/select";
import Toast from "@douyinfe/semi-ui/lib/es/toast";
import { IconSearch } from "@douyinfe/semi-icons";
import {
  getEnterpriseJoinRequests,
  reviewEnterpriseJoinRequest,
  type EnterpriseContext,
  type EnterpriseJoinRequest,
} from "@/api/enterprise-console";
import { isApiError } from "@/api/http";
import { getAccessToken } from "@/auth/token-storage";
import {
  EnterpriseError,
  useEnterpriseErrorHandler,
  type EnterpriseRequestError,
} from "@/pages/enterprise-console-shared";
import { formatApiTime } from "@/utils/format";
import { TraeDialog } from "./trae-dialog";
import { TraePagination } from "./trae-pagination";
import { TraeTableEmpty } from "./trae-table-empty";
import "./trae-enterprise-join-requests.css";

const REQUEST_PAGE_SIZE = 10;
const REQUEST_SEARCH_DELAY = 300;

type ReviewDialogState = {
  mode: "approve" | "reject";
  request: EnterpriseJoinRequest;
};

type TraeEnterpriseJoinRequestsProps = {
  context: EnterpriseContext;
  onReviewed: () => void;
};

function requestStatusClass(status: string) {
  if (status === "approved") return "is-success";
  if (status === "pending") return "is-pending";
  if (status === "rejected") return "is-failed";
  return "is-suspended";
}

function approvalRole(context: EnterpriseContext, request: EnterpriseJoinRequest) {
  const enabledRoles = (context.role_options ?? []).filter((role) => !role.owner_role);
  const requestedRole = enabledRoles.find((role) => role.code === request.requested_role);
  if (requestedRole) return requestedRole.code;
  return enabledRoles.find((role) => role.code === "member")?.code ?? enabledRoles[0]?.code ?? "member";
}

/** 新版人员管理的加入申请列表，查询、分页和审核状态都限定在当前 Tab 内。 */
export function TraeEnterpriseJoinRequests({
  context,
  onReviewed,
}: TraeEnterpriseJoinRequestsProps) {
  const { t } = useTranslation();
  const handleError = useEnterpriseErrorHandler();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(REQUEST_PAGE_SIZE);
  const [requests, setRequests] = useState<EnterpriseJoinRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<EnterpriseRequestError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [reviewDialog, setReviewDialog] = useState<ReviewDialogState | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<EnterpriseRequestError | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setDebouncedQuery(query.trim());
    }, REQUEST_SEARCH_DELAY);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    getEnterpriseJoinRequests(
      { enterprise_id: context.id },
      {
        page,
        page_size: pageSize,
        keyword: debouncedQuery || undefined,
        status: status === "all" ? undefined : status,
        accessToken: getAccessToken() ?? undefined,
        signal: controller.signal,
      },
    )
      .then((result) => {
        if (!active) return;
        setRequests(result.items);
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
  }, [context.id, debouncedQuery, handleError, page, pageSize, reloadToken, status]);

  const roleNames = useMemo(
    () => new Map((context.role_options ?? []).map((role) => [role.code, role.name])),
    [context.role_options],
  );

  function getRoleName(role: string) {
    if (roleNames.has(role)) return roleNames.get(role);
    if (role === "administrator" || role === "admin") return t("traeEnterprise.members.owner");
    if (role === "member") return t("traeEnterprise.members.member");
    return role || "--";
  }

  function openReviewDialog(mode: ReviewDialogState["mode"], request: EnterpriseJoinRequest) {
    setReviewError(null);
    setReviewDialog({ mode, request });
  }

  async function submitReview(input: { action: "approve" | "reject"; rejection_reason?: string }) {
    if (!reviewDialog) return;
    setReviewing(true);
    setReviewError(null);
    try {
      await reviewEnterpriseJoinRequest(
        { enterprise_id: context.id },
        reviewDialog.request.id,
        input.action === "approve"
          ? {
              action: "approve",
              role: approvalRole(context, reviewDialog.request),
            }
          : input,
        { accessToken: getAccessToken() ?? undefined },
      );
      setReviewDialog(null);
      setReloadToken((value) => value + 1);
      onReviewed();
      Toast.success(t(`traeEnterprise.joinRequests.${input.action}Success`));
    } catch (reason: unknown) {
      const handled = handleError(reason);
      if (handled) setReviewError(handled);
      // 审核冲突通常表示申请已变化，同时刷新列表以展示服务端最新状态。
      setReloadToken((value) => value + 1);
      if (isApiError(reason) && reason.status === 409) onReviewed();
    } finally {
      setReviewing(false);
    }
  }

  const statusOptions = [
    { value: "all", label: t("traeEnterprise.joinRequests.allStatuses") },
    { value: "pending", label: t("traeEnterprise.joinRequests.pending") },
    { value: "approved", label: t("traeEnterprise.joinRequests.approved") },
    { value: "rejected", label: t("traeEnterprise.joinRequests.rejected") },
    { value: "withdrawn", label: t("traeEnterprise.joinRequests.withdrawn") },
  ];

  return (
    <section className="trae-request-panel">
      <div className="trae-toolbar">
        <label className="trae-inline-search trae-request-search">
          <IconSearch aria-hidden="true" />
          <input
            aria-label={t("traeEnterprise.joinRequests.search")}
            placeholder={t("traeEnterprise.joinRequests.search")}
            value={query}
            maxLength={128}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <Select
          aria-label={t("traeEnterprise.joinRequests.allStatuses")}
          className="trae-select trae-request-status-select"
          dropdownClassName="trae-select-dropdown trae-members-filter-dropdown"
          value={status}
          onChange={(value) => {
            setPage(1);
            setStatus(String(value ?? "all"));
          }}
        >
          {statusOptions.map((option) => (
            <Select.Option key={option.value} value={option.value}>
              {option.label}
            </Select.Option>
          ))}
        </Select>
      </div>

      <div className="trae-table-scroll">
        <table className={`trae-table trae-request-table${loading ? " is-loading" : ""}`} aria-busy={loading}>
          <thead>
            <tr>
              <th>{t("traeEnterprise.joinRequests.applicant")}</th>
              <th>{t("traeEnterprise.joinRequests.application")}</th>
              <th>{t("traeEnterprise.joinRequests.appliedAt")}</th>
              <th>{t("traeEnterprise.members.state")}</th>
              <th>{t("traeEnterprise.joinRequests.action")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && requests.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="trae-request-state" role="status">
                    <span className="console-loading-spinner" />
                    {t("traeEnterprise.joinRequests.loading")}
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5}>
                  <EnterpriseError
                    message={error.message}
                    requestId={error.requestId}
                    onRetry={() => setReloadToken((value) => value + 1)}
                  />
                </td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <TraeTableEmpty hint={t("traeEnterprise.joinRequests.empty")} />
                </td>
              </tr>
            ) : (
              requests.map((request) => (
                <tr key={request.id}>
                  <td>
                    <span className="trae-request-applicant">
                      <strong>{request.applicant_name || request.applicant_user_id}</strong>
                      <small>{request.applicant_contact || request.applicant_user_id}</small>
                    </span>
                  </td>
                  <td>
                    <span className="trae-request-info">
                      <strong>{getRoleName(request.requested_role)}</strong>
                      <small title={request.request_message}>{request.request_message || "--"}</small>
                    </span>
                  </td>
                  <td>{formatApiTime(request.created_at)}</td>
                  <td>
                    <span className={`trae-status-badge ${requestStatusClass(request.status)}`}>
                      <i aria-hidden="true" />
                      {t(`traeEnterprise.joinRequests.status.${request.status}`, {
                        defaultValue: request.status,
                      })}
                    </span>
                  </td>
                  <td>
                    {request.status === "pending" ? (
                      <div className="trae-request-actions">
                        <button
                          type="button"
                          className="trae-request-approve"
                          onClick={() => openReviewDialog("approve", request)}
                        >
                          {t("traeEnterprise.joinRequests.approve")}
                        </button>
                        <button
                          type="button"
                          className="trae-request-reject"
                          onClick={() => openReviewDialog("reject", request)}
                        >
                          {t("traeEnterprise.joinRequests.reject")}
                        </button>
                      </div>
                    ) : (
                      "--"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <TraePagination
        ariaLabel={t("traeEnterprise.joinRequests.pagination")}
        currentPage={page}
        pageSize={pageSize}
        total={total}
        disabled={loading}
        pageSizeOpts={[10, 20, 50]}
        summary={t("traeEnterprise.joinRequests.paginationSummary", { total })}
        onChange={(nextPage, nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(nextPageSize === pageSize ? nextPage : 1);
        }}
      />

      {reviewDialog?.mode === "approve" ? (
        <TraeDialog
          className="trae-confirm-dialog trae-request-review-dialog"
          title={t("traeEnterprise.joinRequests.approveTitle")}
          onClose={() => {
            if (!reviewing) setReviewDialog(null);
          }}
        >
          <div className="trae-confirm-dialog-content">
            <p>
              {t("traeEnterprise.joinRequests.approveHint", {
                name: reviewDialog.request.applicant_name || reviewDialog.request.applicant_user_id,
                role: getRoleName(approvalRole(context, reviewDialog.request)),
              })}
            </p>
            {reviewError ? <p className="trae-request-review-error">{reviewError.message}</p> : null}
            <div className="trae-dialog-actions">
              <button className="trae-secondary-button" type="button" disabled={reviewing} onClick={() => setReviewDialog(null)}>
                {t("traeEnterprise.common.cancel")}
              </button>
              <button className="trae-primary-button" type="button" disabled={reviewing} onClick={() => void submitReview({ action: "approve" })}>
                {reviewing ? t("traeEnterprise.joinRequests.reviewing") : t("traeEnterprise.common.confirm")}
              </button>
            </div>
          </div>
        </TraeDialog>
      ) : null}

      {reviewDialog?.mode === "reject" ? (
        <TraeDialog
          className="trae-request-review-dialog"
          title={t("traeEnterprise.joinRequests.rejectTitle")}
          onClose={() => {
            if (!reviewing) setReviewDialog(null);
          }}
        >
          <Form<{ rejectionReason: string }>
            className="trae-dialog-form trae-request-reject-form"
            labelPosition="top"
            initValues={{ rejectionReason: "" }}
            autoScrollToError
            showValidateIcon={false}
            onSubmit={(values) => void submitReview({ action: "reject", rejection_reason: values.rejectionReason.trim() })}
          >
            <p>
              {t("traeEnterprise.joinRequests.rejectHint", {
                name: reviewDialog.request.applicant_name || reviewDialog.request.applicant_user_id,
              })}
            </p>
            <Form.TextArea
              field="rejectionReason"
              label={t("traeEnterprise.joinRequests.rejectionReason")}
              placeholder={t("traeEnterprise.joinRequests.rejectionReasonPlaceholder")}
              maxCount={200}
              autosize={{ minRows: 3, maxRows: 5 }}
              rules={[{ required: true, message: t("traeEnterprise.joinRequests.rejectionReasonRequired") }]}
            />
            {reviewError ? <p className="trae-request-review-error">{reviewError.message}</p> : null}
            <div className="trae-dialog-actions">
              <button className="trae-secondary-button" type="button" disabled={reviewing} onClick={() => setReviewDialog(null)}>
                {t("traeEnterprise.common.cancel")}
              </button>
              <button className="trae-danger-button" type="submit" disabled={reviewing}>
                {reviewing ? t("traeEnterprise.joinRequests.reviewing") : t("traeEnterprise.common.confirm")}
              </button>
            </div>
          </Form>
        </TraeDialog>
      ) : null}
    </section>
  );
}
