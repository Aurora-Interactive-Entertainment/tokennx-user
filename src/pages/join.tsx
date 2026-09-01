import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import {
  IconApartment,
  IconCheckCircleStroked,
  IconShieldStroked,
} from "@douyinfe/semi-icons";
import {
  getEnterpriseErrorMessage,
  getEnterpriseRequestId,
  getInvitationPreview,
  submitInvitationJoin,
  type EnterpriseInvitationPreview,
} from "@/api/enterprise-console";
import { isApiError } from "@/api/http";
import { getAccessToken } from "@/auth/token-storage";
import { LoginDialog, PublicLayout } from "@/components/common";
import { useAppSelector } from "@/store/hooks";
import i18n from "@/i18n";
import { invitationStatusLabel } from "./enterprise-console-shared";
import "./join.css";

type InvitationPageError = {
  message: string;
  requestId: string | null;
};

const INVITATION_INVALID_ERROR_CODE = 140007;

function invitationStatusClass(status: string): string {
  if (status === "expired" || status === "exhausted") return "is-expired";
  if (status === "revoked" || status === "disabled") return "is-revoked";
  return "is-unknown";
}

function invitationStatusDescription(status: string): string {
  if (status === "expired") return i18n.t("console.join.expiredHint");
  if (status === "exhausted") return i18n.t("console.join.exhaustedHint");
  if (status === "revoked" || status === "disabled")
    return i18n.t("console.join.revokedHint");
  return i18n.t("console.join.statusUnavailable");
}

function invitationError(reason: unknown): InvitationPageError {
  if (isApiError(reason) && reason.code === INVITATION_INVALID_ERROR_CODE) {
    return {
      message: i18n.t("console.join.invalid"),
      requestId: reason.requestId,
    };
  }
  return {
    message: getEnterpriseErrorMessage(reason),
    requestId: getEnterpriseRequestId(reason),
  };
}

function InvitationStatus({
  preview,
}: {
  preview: EnterpriseInvitationPreview;
}) {
  const { t } = useTranslation();
  const enterpriseName =
    preview.enterprise_name || t("console.join.unnamedEnterprise");
  const successful = preview.already_member || preview.pending_request;
  const title = preview.already_member
    ? t("console.join.alreadyMember")
    : preview.pending_request
      ? t("console.join.requestSubmitted")
      : invitationStatusLabel(preview.status);
  const description = preview.already_member
    ? t("console.join.alreadyMemberHint", { enterpriseName })
    : preview.pending_request
      ? t("console.join.requestSubmittedHint", { enterpriseName })
      : invitationStatusDescription(preview.status);

  return (
    <section
      className={`enterprise-join-state enterprise-join-result ${successful ? "is-success" : invitationStatusClass(preview.status)}`}
      role="status"
      aria-labelledby="enterpriseJoinStatusTitle"
    >
      <span className="enterprise-join-result-icon" aria-hidden="true">
        {successful ? <IconCheckCircleStroked /> : <IconShieldStroked />}
      </span>
      <h1 id="enterpriseJoinStatusTitle">{title}</h1>
      <p>{description}</p>
    </section>
  );
}

function InvitationPrompt({
  authenticated,
  onLoginRequired,
  onSubmitted,
  preview,
  token,
}: {
  authenticated: boolean;
  onLoginRequired: () => void;
  onSubmitted: () => void;
  preview: EnterpriseInvitationPreview;
  token: string;
}) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<InvitationPageError | null>(null);
  const enterpriseName =
    preview.enterprise_name || t("console.join.unnamedEnterprise");

  async function applyToJoin(): Promise<void> {
    if (!authenticated) {
      onLoginRequired();
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      // 中文：新版邀请页不再收集申请说明，登录用户点击后直接提交加入申请。
      await submitInvitationJoin(
        { token, request_message: "" },
        { accessToken: getAccessToken() ?? undefined },
      );
      onSubmitted();
    } catch (reason: unknown) {
      setError(invitationError(reason));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="enterprise-join-state enterprise-join-prompt"
      aria-labelledby="enterpriseJoinTitle"
    >
      <span className="enterprise-join-enterprise-icon" aria-hidden="true">
        <IconApartment />
      </span>
      <h1 id="enterpriseJoinTitle">
        {t("console.join.joinEnterprise", { enterpriseName })}
      </h1>
      <p>{t("console.join.approvalRequired")}</p>
      <span className="enterprise-join-inviter">
        {t("console.join.invitedBy", {
          name: preview.inviter_name || t("console.join.enterpriseMember"),
        })}
      </span>
      <button
        className="enterprise-join-submit"
        type="button"
        disabled={submitting}
        aria-haspopup={authenticated ? undefined : "dialog"}
        aria-controls={authenticated ? undefined : "enterprise-join-login"}
        onClick={() => {
          void applyToJoin();
        }}
      >
        {submitting ? t("console.join.submitting") : t("console.join.submit")}
      </button>
      {error ? (
        <div className="enterprise-join-error" role="alert">
          <span>{error.message}</span>
          {error.requestId ? (
            <small>
              {t("console.common.requestIdValue", {
                requestId: error.requestId,
              })}
            </small>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function JoinPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const authStatus = useAppSelector((state) => state.auth.status);
  const token = useMemo(
    () => searchParams.get("token")?.trim() ?? "",
    [searchParams],
  );
  const [preview, setPreview] = useState<EnterpriseInvitationPreview | null>(
    null,
  );
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState<InvitationPageError | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    if (!token) {
      setPreview(null);
      setLoading(false);
      setError(null);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    getInvitationPreview(token, {
      accessToken: getAccessToken() ?? undefined,
      signal: controller.signal,
    })
      .then((result) => {
        if (active) setPreview(result);
      })
      .catch((reason: unknown) => {
        if (!active || controller.signal.aborted) return;
        setPreview(null);
        setError(invitationError(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [authStatus, token]);

  function markSubmitted(): void {
    setPreview((current) =>
      current ? { ...current, pending_request: true } : current,
    );
  }

  const canApply =
    preview?.status === "active" &&
    !preview.already_member &&
    !preview.pending_request;

  return (
    <PublicLayout mainClassName="enterprise-join-page">
      <div className="enterprise-join-shell">
        {!token ? (
          <section
            className="enterprise-join-state enterprise-join-result is-unknown"
            role="alert"
          >
            <span className="enterprise-join-result-icon" aria-hidden="true">
              <IconShieldStroked />
            </span>
            <h1>{t("console.join.missingToken")}</h1>
            <p>{t("console.join.missingTokenHint")}</p>
          </section>
        ) : loading ? (
          <div className="enterprise-join-loading" role="status">
            <span className="console-loading-spinner" />
            {t("console.join.loading")}
          </div>
        ) : error ? (
          <section
            className="enterprise-join-state enterprise-join-result is-unknown"
            role="alert"
          >
            <span className="enterprise-join-result-icon" aria-hidden="true">
              <IconShieldStroked />
            </span>
            <h1>{t("console.join.openFailed")}</h1>
            <p>{error.message}</p>
            {error.requestId ? (
              <small>
                {t("console.common.requestIdValue", {
                  requestId: error.requestId,
                })}
              </small>
            ) : null}
          </section>
        ) : preview ? (
          canApply ? (
            <InvitationPrompt
              authenticated={authStatus === "authenticated"}
              onLoginRequired={() => setLoginOpen(true)}
              onSubmitted={markSubmitted}
              preview={preview}
              token={token}
            />
          ) : (
            <InvitationStatus preview={preview} />
          )
        ) : null}
      </div>
      <LoginDialog
        dialogId="enterprise-join-login"
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => setLoginOpen(false)}
      />
    </PublicLayout>
  );
}
