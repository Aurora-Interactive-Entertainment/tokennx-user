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

export function EnterpriseFaceStep({
  certification,
  loading,
  onStart,
}: {
  certification: EnterpriseCertification;
  loading: boolean;
  onStart: () => void;
}) {
  const { t } = useTranslation();
  const noData = t("console.enterpriseCreate.noData");
  return (
    <section
      className="enterprise-status-content"
      aria-labelledby="enterprise-face-title"
    >
      <h2
        id="enterprise-face-title"
        className="enterprise-status-section-title"
      >
        {t("console.enterpriseCreate.faceTitle")}
      </h2>
      <p className="enterprise-status-lead">
        {t("console.enterpriseCreate.faceHint")}
      </p>
      <dl className="enterprise-status-summary">
        <div>
          <dt>{t("console.enterpriseCreate.enterpriseName")}</dt>
          <dd>{certification.enterprise_name || noData}</dd>
        </div>
        <div>
          <dt>{t("console.enterpriseCreate.creditCode")}</dt>
          <dd>{certification.credit_code_masked || noData}</dd>
        </div>
        <div>
          <dt>{t("console.enterpriseCreate.applicantType")}</dt>
          <dd>{t("console.enterpriseCreate.legalRepresentativeApplicant")}</dd>
        </div>
      </dl>
      <div className="enterprise-face-guidance">
        <h3>{t("console.enterpriseCreate.faceCardTitle")}</h3>
        <p>{t("console.enterpriseCreate.faceCardHint")}</p>
        <Button
          theme="solid"
          type="primary"
          loading={loading}
          disabled={loading}
          onClick={onStart}
        >
          {certification.current_stage === "face_retry_required"
            ? t("console.enterpriseCreate.restartFace")
            : t("console.enterpriseCreate.getFaceQr")}
        </Button>
      </div>
    </section>
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
  confirming: boolean;
  notice: FaceConfirmationNotice | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function EnterpriseFaceModal({
  visible,
  faceUrl,
  confirming,
  notice,
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
      <div className="enterprise-face-dialog" aria-busy={confirming}>
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
        ) : null}
        <h2>{t("console.enterpriseCreate.scanQr")}</h2>
        <p>{t("console.enterpriseCreate.scanQrHint")}</p>
        <div className="enterprise-face-waiting">
          <span className="console-loading-spinner" aria-hidden="true" />
          {t("console.enterpriseCreate.awaitingFace")}
        </div>
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
          <Button
            theme="solid"
            type="primary"
            loading={confirming}
            disabled={confirming}
            onClick={onConfirm}
          >
            {t("console.enterpriseCreate.faceCompleted")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
