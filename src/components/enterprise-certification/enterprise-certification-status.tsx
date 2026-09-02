import { useEffect, useRef } from "react";
import {
  IconAlertTriangle,
  IconCheckCircleStroked,
  IconHourglassStroked,
  IconRefresh,
} from "@douyinfe/semi-icons";
import Button from "@douyinfe/semi-ui/lib/es/button";
import Toast from "@douyinfe/semi-ui/lib/es/toast";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import type { EnterpriseCertification } from "@/api/enterprise-certification";
import Modal from "@/components/app-modal";
import "./enterprise-certification-status.css";

export interface FaceConfirmationNotice {
  title: string;
  message: string;
}

function isMobileDevice(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(max-width: 700px)").matches)
  );
}

interface EnterpriseResultStepProps {
  certification: EnterpriseCertification;
  loading: boolean;
  onRefresh: () => void;
}

export function EnterpriseResultStep({
  certification,
  loading,
  onRefresh,
}: EnterpriseResultStepProps) {
  const { t } = useTranslation();
  const completed = certification.current_stage === "completed";
  const manualReview = certification.current_stage === "manual_review";
  const noData = t("console.enterpriseCreate.noData");
  let title = manualReview
    ? t("console.enterpriseCreate.manualReviewTitle")
    : t("console.enterpriseCreate.pendingResultTitle");
  let hint = manualReview
    ? t("console.enterpriseCreate.manualReviewHint")
    : t("console.enterpriseCreate.pendingResultHint");
  if (completed) {
    title = t("console.enterpriseCreate.approvedTitle");
    hint = t("console.enterpriseCreate.approvedHint");
  } else if (certification.current_stage === "supplement_required") {
    title = t("console.enterpriseCreate.supplementTitle");
    hint = t("console.enterpriseCreate.supplementHint");
  } else if (certification.current_stage === "revoked") {
    title = t("console.enterpriseCreate.revokedTitle");
    hint = t("console.enterpriseCreate.revokedHint");
  } else if (
    certification.status === "rejected" ||
    certification.status === "cancelled"
  ) {
    title = t("console.enterpriseCreate.failedTitle");
    hint = t("console.enterpriseCreate.failedHint");
  }

  const statusClass = completed
    ? " is-success"
    : manualReview
      ? " is-review"
      : "";
  return (
    <section
      className={`enterprise-result-content${statusClass}`}
      aria-live="polite"
    >
      <span className="enterprise-result-icon" aria-hidden="true">
        {completed ? (
          <IconCheckCircleStroked />
        ) : manualReview ? (
          <IconHourglassStroked />
        ) : (
          <IconAlertTriangle />
        )}
      </span>
      <h2>{title}</h2>
      <p>{hint}</p>
      <dl
        className="enterprise-result-details"
        aria-label={t("console.enterpriseCreate.resultLabel")}
      >
        <div>
          <dt>{t("console.enterpriseCreate.submittedEnterprise")}</dt>
          <dd>{certification.enterprise_name || noData}</dd>
        </div>
        {manualReview ? (
          <>
            <div>
              <dt>{t("console.enterpriseCreate.submittedApplicant")}</dt>
              <dd>{t("console.enterpriseCreate.authorizedAgent")}</dd>
            </div>
            <div>
              <dt>{t("console.enterpriseCreate.manualReviewStatus")}</dt>
              <dd className="enterprise-review-status">
                {t("console.enterpriseCreate.manualReviewStatusValue")}
              </dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt>{t("console.enterpriseCreate.creditCode")}</dt>
              <dd>{certification.credit_code_masked || noData}</dd>
            </div>
            <div>
              <dt>{t("console.enterpriseCreate.legalRepresentative")}</dt>
              <dd>{certification.legal_representative_masked || noData}</dd>
            </div>
          </>
        )}
      </dl>
      {!completed ? (
        <Button
          theme="outline"
          icon={<IconRefresh />}
          loading={loading}
          disabled={loading}
          onClick={onRefresh}
        >
          {t("console.enterpriseCreate.refreshStatus")}
        </Button>
      ) : null}
    </section>
  );
}

interface EnterpriseFaceModalProps {
  visible: boolean;
  faceUrl: string;
  preparing: boolean;
  confirming: boolean;
  notice: FaceConfirmationNotice | null;
  onRetry: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function EnterpriseFaceModal({
  visible,
  faceUrl,
  preparing,
  confirming,
  notice,
  onRetry,
  onConfirm,
  onCancel,
}: EnterpriseFaceModalProps) {
  const { t } = useTranslation();
  const qrCanvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!visible || !faceUrl || !qrCanvas.current || isMobileDevice()) return;
    void QRCode.toCanvas(qrCanvas.current, faceUrl, {
      width: 210,
      margin: 2,
    }).catch(() => Toast.error(t("console.enterpriseCreate.qrFailed")));
  }, [faceUrl, t, visible]);

  return (
    <Modal
      className="enterprise-face-modal"
      title={t("console.enterpriseCreate.faceModalTitle")}
      visible={visible}
      onCancel={onCancel}
      footer={null}
      width="560px"
    >
      <div
        className="enterprise-face-dialog"
        aria-busy={preparing || confirming}
      >
        {faceUrl && !isMobileDevice() ? (
          <div className="enterprise-face-qr">
            <canvas
              ref={qrCanvas}
              aria-label={t("console.enterpriseCreate.scanQr")}
            />
          </div>
        ) : faceUrl ? (
          <Button
            className="enterprise-face-mobile-open"
            theme="solid"
            type="primary"
            onClick={() => {
              try {
                window.location.assign(faceUrl);
              } catch {
                Toast.error(t("console.enterpriseCreate.openFailed"));
              }
            }}
          >
            {t("console.enterpriseCreate.openAlipay")}
          </Button>
        ) : (
          <div className="enterprise-face-qr enterprise-face-qr-loading">
            <span className="console-loading-spinner" aria-hidden="true" />
          </div>
        )}
        <h2>
          {faceUrl
            ? t("console.enterpriseCreate.scanQr")
            : preparing
              ? t("console.enterpriseCreate.faceQrLoading")
              : t("console.enterpriseCreate.faceQrFailedTitle")}
        </h2>
        <p>
          {faceUrl
            ? t("console.enterpriseCreate.scanQrHint")
            : preparing
              ? t("console.enterpriseCreate.faceQrLoadingHint")
              : t("console.enterpriseCreate.faceQrFailedHint")}
        </p>
        {faceUrl ? (
          <div className="enterprise-face-waiting">
            <span className="console-loading-spinner" aria-hidden="true" />
            {t("console.enterpriseCreate.awaitingFace")}
          </div>
        ) : null}
        {notice ? (
          <div className="enterprise-face-confirm-error" role="alert">
            <strong>{notice.title}</strong>
            <span>{notice.message}</span>
          </div>
        ) : null}
        <div className="enterprise-face-dialog-actions">
          <Button theme="outline" disabled={confirming} onClick={onCancel}>
            {t("console.enterpriseCreate.closeFace")}
          </Button>
          {faceUrl ? (
            <Button
              theme="solid"
              type="primary"
              loading={confirming}
              disabled={preparing || confirming}
              onClick={onConfirm}
            >
              {t("console.enterpriseCreate.faceCompleted")}
            </Button>
          ) : (
            <Button
              theme="solid"
              type="primary"
              loading={preparing}
              disabled={preparing}
              onClick={onRetry}
            >
              {t("console.enterpriseCreate.retryFaceQr")}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
