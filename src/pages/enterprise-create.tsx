import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { getAccessToken } from "@/auth/token-storage";
import {
  ENTERPRISE_AUTHORIZATION_MAX_BYTES,
  ENTERPRISE_LICENSE_MAX_BYTES,
  confirmEnterpriseFaceVerification,
  getEnterpriseCertification,
  getEnterpriseCertificationErrorMessage,
  normalizeEnterpriseCreditCode,
  startEnterpriseFaceVerification,
  submitEnterpriseCertification,
  uploadEnterpriseCertificationMaterial,
  validateEnterpriseCertificationForm,
  type EnterpriseApplicantType,
  type EnterpriseCertification,
  type EnterpriseCertificationField,
  type EnterpriseCertificationValidationErrors,
  type EnterpriseMaterialUploadResult,
  type SubmitEnterpriseCertificationRequest,
} from "@/api/enterprise-certification";
import {
  EnterpriseCertificationForm,
  type EnterpriseCertificationFormState,
} from "@/components/enterprise-certification/enterprise-certification-form";
import { EnterpriseCertificationProgress } from "@/components/enterprise-certification/enterprise-certification-progress";
import {
  EnterpriseFaceModal,
  EnterpriseResultStep,
  type FaceConfirmationNotice,
} from "@/components/enterprise-certification/enterprise-certification-status";
import { PageTitle, workspacesFromMemberships } from "@/components/common";
import { appToast } from "@/components/app-toast";
import { getProfileEnterprises } from "@/api/profile";
import { isApiError, isAuthenticationFailure } from "@/api/http";
import { useAppStore } from "@/data/app-state";
import { invalidateAuth } from "@/store/auth-slice";
import { useAppDispatch } from "@/store/hooks";
import "./enterprise-create.css";

const FACE_CONFIRM_POLL_INTERVAL_MS = 3_000;
const BUSINESS_LICENSE_TYPES = ["image/png", "image/jpeg"];
const AUTHORIZATION_TYPES = [...BUSINESS_LICENSE_TYPES, "application/pdf"];

interface MaterialState {
  file: File | null;
  previewUrl: string;
  result: EnterpriseMaterialUploadResult | null;
  uploading: boolean;
  error: string;
}

const EMPTY_FORM: EnterpriseCertificationFormState = {
  enterpriseName: "",
  creditCode: "",
  legalRepresentative: "",
  legalRepresentativeId: "",
  contactName: "",
  contactPhone: "",
  applicantType: "legal_representative",
  authorizedAgentName: "",
  authorizedAgentId: "",
};

const EMPTY_MATERIAL: MaterialState = {
  file: null,
  previewUrl: "",
  result: null,
  uploading: false,
  error: "",
};

function applicantTypeFromCertification(
  certification: EnterpriseCertification | null,
  fallback: EnterpriseApplicantType,
): EnterpriseApplicantType {
  return certification?.applicant_type === "authorized_agent"
    ? "authorized_agent"
    : certification?.applicant_type === "legal_representative"
      ? "legal_representative"
      : fallback;
}

function stepFromCertification(
  certification: EnterpriseCertification | null,
  applicantType: EnterpriseApplicantType,
): number {
  if (!certification || certification.current_stage === "not_started") return 1;
  if (applicantType === "authorized_agent") return 2;
  if (isFaceVerificationStage(certification)) return 2;
  return 3;
}

function isFaceVerificationStage(
  certification: EnterpriseCertification | null,
): boolean {
  return (
    certification?.current_stage === "face_verification_required" ||
    certification?.current_stage === "face_verification" ||
    certification?.current_stage === "face_retry_required"
  );
}

export function EnterpriseCreatePage() {
  const { t } = useTranslation();
  const { search } = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { replaceEnterpriseWorkspaces } = useAppStore();
  const [certification, setCertification] =
    useState<EnterpriseCertification | null>(null);
  const [form, setForm] =
    useState<EnterpriseCertificationFormState>(EMPTY_FORM);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<EnterpriseCertificationValidationErrors>(
    {},
  );
  const [license, setLicense] = useState<MaterialState>(EMPTY_MATERIAL);
  const [authorization, setAuthorization] =
    useState<MaterialState>(EMPTY_MATERIAL);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [startingFace, setStartingFace] = useState(false);
  const [confirmingFace, setConfirmingFace] = useState(false);
  const [faceModalVisible, setFaceModalVisible] = useState(false);
  // 中文：关闭法人刷脸弹窗后允许回到资料页修改，直到再次提交前都不自动弹窗。
  const [editingInformation, setEditingInformation] = useState(false);
  // 中文：新建模式首次进入时忽略服务端历史认证，成功提交后再接管本次流程。
  const [newApplicationStarted, setNewApplicationStarted] = useState(false);
  const [faceUrl, setFaceUrl] = useState("");
  const [faceConfirmNotice, setFaceConfirmNotice] =
    useState<FaceConfirmationNotice | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [workspaceRefreshError, setWorkspaceRefreshError] = useState("");
  const refreshedEnterpriseId = useRef<string | null>(null);
  const faceConfirmRequest = useRef<Promise<EnterpriseCertification> | null>(
    null,
  );
  const autoPresentedFaceStage = useRef("");
  const newModeSubmitted = useRef(false);
  const isNewMode = new URLSearchParams(search).get("mode") === "new";
  const isFreshNewMode = isNewMode && !newApplicationStarted;

  const invalidateSession = useCallback(() => {
    dispatch(invalidateAuth());
    navigate("/", { replace: true });
  }, [dispatch, navigate]);

  const loadCertification = useCallback(async () => {
    const accessToken = getAccessToken();
    if (!accessToken) {
      invalidateSession();
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await getEnterpriseCertification(accessToken);
      // 中文：新建模式只用于创建新的认证申请，不能把旧记录恢复到当前页面。
      if (isNewMode && !newModeSubmitted.current) {
        setCertification(null);
        setFaceUrl("");
        return;
      }
      setCertification(result);
      if (
        result.applicant_type === "authorized_agent" ||
        result.applicant_type === "legal_representative"
      ) {
        setForm((previous) => ({
          ...previous,
          applicantType: result.applicant_type as EnterpriseApplicantType,
        }));
      }
      if (result.face_url) setFaceUrl(result.face_url);
    } catch (error: unknown) {
      if (isAuthenticationFailure(error)) invalidateSession();
      else setErrorMessage(getEnterpriseCertificationErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [invalidateSession, isNewMode]);

  const refreshEnterpriseWorkspaces = useCallback(
    async (accessToken: string) => {
      setWorkspaceRefreshError("");
      try {
        const memberships = await getProfileEnterprises(accessToken);
        replaceEnterpriseWorkspaces(workspacesFromMemberships(memberships));
      } catch (error: unknown) {
        if (isAuthenticationFailure(error)) invalidateSession();
        else
          setWorkspaceRefreshError(
            t("console.enterpriseCreate.workspaceRefreshError"),
          );
      }
    },
    [invalidateSession, replaceEnterpriseWorkspaces, t],
  );

  useEffect(() => {
    void loadCertification();
  }, [loadCertification]);

  useEffect(() => {
    if (errorMessage) appToast.error(errorMessage);
  }, [errorMessage]);

  useEffect(() => {
    if (workspaceRefreshError) appToast.error(workspaceRefreshError);
  }, [workspaceRefreshError]);
  useEffect(() => {
    // 中文：切换到新建地址时清空上一次页面状态，避免旧弹窗或已填资料残留。
    newModeSubmitted.current = false;
    setNewApplicationStarted(false);
    if (!isNewMode) return;
    setCertification(null);
    setForm(EMPTY_FORM);
    setConsent(false);
    setErrors({});
    setLicense(EMPTY_MATERIAL);
    setAuthorization(EMPTY_MATERIAL);
    setFaceUrl("");
    setFaceModalVisible(false);
    setFaceConfirmNotice(null);
    setEditingInformation(false);
    autoPresentedFaceStage.current = "";
  }, [isNewMode]);
  useEffect(
    () => () => {
      if (license.previewUrl) URL.revokeObjectURL(license.previewUrl);
    },
    [license.previewUrl],
  );
  useEffect(
    () => () => {
      if (authorization.previewUrl)
        URL.revokeObjectURL(authorization.previewUrl);
    },
    [authorization.previewUrl],
  );
  useEffect(() => {
    if (
      certification?.current_stage !== "completed" ||
      !certification.enterprise_id ||
      refreshedEnterpriseId.current === certification.enterprise_id
    )
      return;
    const accessToken = getAccessToken();
    if (!accessToken) {
      invalidateSession();
      return;
    }
    refreshedEnterpriseId.current = certification.enterprise_id;
    void refreshEnterpriseWorkspaces(accessToken);
  }, [certification, invalidateSession, refreshEnterpriseWorkspaces]);

  function clearError(field: EnterpriseCertificationField): void {
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  }

  function changeForm(
    field: keyof EnterpriseCertificationFormState,
    value: string,
  ): void {
    setForm((previous) => ({ ...previous, [field]: value }));
    if (field !== "applicantType") clearError(field);
  }

  function changeApplicantType(applicantType: EnterpriseApplicantType): void {
    setForm((previous) => ({ ...previous, applicantType }));
    if (applicantType === "legal_representative") {
      // 中文：切回法人时清理代办字段错误，但保留已上传资料，方便用户再次切换。
      setErrors((previous) => ({
        ...previous,
        authorizedAgentName: undefined,
        authorizedAgentId: undefined,
        authorizationUrl: undefined,
      }));
    }
  }

  function removeMaterial(kind: "license" | "authorization"): void {
    const setter = kind === "license" ? setLicense : setAuthorization;
    setter(EMPTY_MATERIAL);
    clearError(kind === "license" ? "licenseUrl" : "authorizationUrl");
  }

  async function chooseMaterial(
    kind: "license" | "authorization",
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const nextFile = event.target.files?.[0];
    event.target.value = "";
    if (!nextFile) return;
    const isLicense = kind === "license";
    const allowedTypes = isLicense
      ? BUSINESS_LICENSE_TYPES
      : AUTHORIZATION_TYPES;
    const maxBytes = isLicense
      ? ENTERPRISE_LICENSE_MAX_BYTES
      : ENTERPRISE_AUTHORIZATION_MAX_BYTES;
    const setter = isLicense ? setLicense : setAuthorization;
    if (!allowedTypes.includes(nextFile.type)) {
      setter((previous) => ({
        ...previous,
        error: t(
          isLicense
            ? "console.enterpriseCreate.licenseTypeInvalid"
            : "console.enterpriseCreate.authorizationTypeInvalid",
        ),
      }));
      return;
    }
    if (nextFile.size > maxBytes) {
      setter((previous) => ({
        ...previous,
        error: t(
          isLicense
            ? "console.enterpriseCreate.licenseTooLarge"
            : "console.enterpriseCreate.authorizationTooLarge",
        ),
      }));
      return;
    }
    const accessToken = getAccessToken();
    if (!accessToken) {
      invalidateSession();
      return;
    }
    const previewUrl = nextFile.type.startsWith("image/")
      ? URL.createObjectURL(nextFile)
      : "";
    setter({
      file: nextFile,
      previewUrl,
      result: null,
      uploading: true,
      error: "",
    });
    try {
      const result = await uploadEnterpriseCertificationMaterial(
        accessToken,
        nextFile,
        isLicense ? "business_license" : "authorization_letter",
      );
      setter({
        file: nextFile,
        previewUrl,
        result,
        uploading: false,
        error: "",
      });
      if (isLicense) {
        setForm((previous) => ({
          ...previous,
          enterpriseName:
            result.recognition?.enterprise_name ?? previous.enterpriseName,
          creditCode: normalizeEnterpriseCreditCode(
            result.recognition?.credit_code ?? previous.creditCode,
          ),
          legalRepresentative:
            result.recognition?.legal_representative ??
            previous.legalRepresentative,
        }));
        clearError("licenseUrl");
      } else clearError("authorizationUrl");
    } catch (error: unknown) {
      if (isAuthenticationFailure(error)) invalidateSession();
      else
        setter((previous) => ({
          ...previous,
          uploading: false,
          error: getEnterpriseCertificationErrorMessage(error),
        }));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextErrors = validateEnterpriseCertificationForm({
      ...form,
      licenseUrl: license.result?.resource_url ?? "",
      authorizationUrl: authorization.result?.resource_url ?? "",
      consent,
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const accessToken = getAccessToken();
    if (!accessToken) {
      invalidateSession();
      return;
    }
    setSubmitting(true);
    setErrorMessage("");
    const baseRequest = {
      enterprise_name: form.enterpriseName.trim(),
      credit_code: normalizeEnterpriseCreditCode(form.creditCode),
      legal_representative: form.legalRepresentative.trim(),
      legal_representative_id: form.legalRepresentativeId.trim().toUpperCase(),
      contact_name: form.contactName.trim(),
      contact_phone: form.contactPhone.trim(),
      license_url: license.result?.resource_url ?? "",
      consent: true as const,
    };
    const request: SubmitEnterpriseCertificationRequest =
      form.applicantType === "authorized_agent"
        ? {
            ...baseRequest,
            applicant_type: "authorized_agent",
            authorized_agent_name: form.authorizedAgentName.trim(),
            authorized_agent_id: form.authorizedAgentId.trim().toUpperCase(),
            authorization_url: authorization.result?.resource_url ?? "",
          }
        : { ...baseRequest, applicant_type: "legal_representative" };
    try {
      const result = await submitEnterpriseCertification(accessToken, request);
      newModeSubmitted.current = true;
      setNewApplicationStarted(true);
      setCertification(result);
      // 中文：法人提交成功后立即打开弹窗，避免二维码接口返回前闪现旧步骤页面。
      setEditingInformation(false);
      autoPresentedFaceStage.current = "";
      setFaceUrl(result.face_url ?? "");
      if (
        applicantTypeFromCertification(result, form.applicantType) ===
          "legal_representative" &&
        isFaceVerificationStage(result)
      )
        setFaceModalVisible(true);
    } catch (error: unknown) {
      if (isAuthenticationFailure(error)) invalidateSession();
      else setErrorMessage(getEnterpriseCertificationErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  const startFace = useCallback(
    async (currentCertification: EnterpriseCertification): Promise<void> => {
      if (
        applicantTypeFromCertification(
          currentCertification,
          form.applicantType,
        ) !== "legal_representative"
      )
        return;
      const currentFaceUrl = currentCertification.face_url || faceUrl;
      if (
        currentCertification.current_stage === "face_verification" &&
        currentFaceUrl
      ) {
        setFaceUrl(currentFaceUrl);
        setFaceConfirmNotice(null);
        setFaceModalVisible(true);
        return;
      }
      const accessToken = getAccessToken();
      if (!accessToken) {
        invalidateSession();
        return;
      }
      setStartingFace(true);
      setFaceConfirmNotice(null);
      setErrorMessage("");
      try {
        const result = await startEnterpriseFaceVerification(
          accessToken,
          `${window.location.origin}/console/enterprise-create`,
        );
        setCertification(result);
        setFaceUrl(result.face_url ?? "");
        if (result.face_url) setFaceModalVisible(true);
        else {
          const message = t("console.enterpriseCreate.faceUrlMissing");
          // 中文：旧步骤页删除后，二维码异常和重试都由当前弹窗承载。
          setFaceConfirmNotice({
            title: t("console.enterpriseCreate.faceQrFailedTitle"),
            message,
          });
          setErrorMessage(message);
        }
      } catch (error: unknown) {
        if (isAuthenticationFailure(error)) invalidateSession();
        else {
          const message = getEnterpriseCertificationErrorMessage(error);
          setFaceConfirmNotice({
            title: t("console.enterpriseCreate.faceQrFailedTitle"),
            message,
          });
          setErrorMessage(message);
        }
      } finally {
        setStartingFace(false);
      }
    },
    [faceUrl, form.applicantType, invalidateSession, t],
  );

  useEffect(() => {
    if (editingInformation || isFreshNewMode) return;
    if (
      !certification ||
      applicantTypeFromCertification(certification, form.applicantType) !==
        "legal_representative"
    )
      return;
    if (!isFaceVerificationStage(certification)) return;
    const presentationKey = `${certification.id ?? "current"}:${certification.current_stage}:${certification.face_url ?? faceUrl}:${certification.version ?? ""}`;
    if (autoPresentedFaceStage.current === presentationKey) return;
    autoPresentedFaceStage.current = presentationKey;
    // 中文：法人进入核验阶段后只展示扫码弹窗，资料表单继续作为底层页面。
    setFaceModalVisible(true);
    void startFace(certification);
  }, [
    certification,
    editingInformation,
    faceUrl,
    form.applicantType,
    isFreshNewMode,
    startFace,
  ]);

  const requestFaceConfirmation = useCallback(
    (accessToken: string): Promise<EnterpriseCertification> => {
      if (faceConfirmRequest.current) return faceConfirmRequest.current;
      const request = confirmEnterpriseFaceVerification(accessToken).finally(
        () => {
          if (faceConfirmRequest.current === request)
            faceConfirmRequest.current = null;
        },
      );
      faceConfirmRequest.current = request;
      return request;
    },
    [],
  );

  const applyFaceConfirmation = useCallback(
    (result: EnterpriseCertification): boolean => {
      setCertification(result);
      if (result.status !== "approved" && result.current_stage !== "completed")
        return false;
      setFaceConfirmNotice(null);
      setFaceModalVisible(false);
      setEditingInformation(false);
      return true;
    },
    [],
  );

  const confirmFace = useCallback(async (): Promise<void> => {
    const accessToken = getAccessToken();
    if (!accessToken) {
      invalidateSession();
      return;
    }
    setConfirmingFace(true);
    setFaceConfirmNotice(null);
    setErrorMessage("");
    try {
      const result = await requestFaceConfirmation(accessToken);
      if (!applyFaceConfirmation(result)) {
        setFaceConfirmNotice({
          title: t("console.enterpriseCreate.faceConfirmPendingTitle"),
          message: t("console.enterpriseCreate.faceConfirmPendingMessage"),
        });
      }
    } catch (error: unknown) {
      if (isAuthenticationFailure(error)) invalidateSession();
      else
        setFaceConfirmNotice({
          title: t("console.enterpriseCreate.faceConfirmFailedTitle"),
          message:
            isApiError(error) && error.message.trim()
              ? error.message
              : getEnterpriseCertificationErrorMessage(error),
        });
    } finally {
      setConfirmingFace(false);
    }
  }, [applyFaceConfirmation, invalidateSession, requestFaceConfirmation, t]);

  useEffect(() => {
    if (!faceModalVisible || !faceUrl || isFreshNewMode) return;
    let cancelled = false;
    let timer: number | undefined;
    const pollFaceConfirmation = async (): Promise<void> => {
      const accessToken = getAccessToken();
      if (!accessToken) {
        if (!cancelled) invalidateSession();
        return;
      }
      try {
        const result = await requestFaceConfirmation(accessToken);
        if (cancelled || applyFaceConfirmation(result)) return;
      } catch (error: unknown) {
        if (cancelled) return;
        if (isAuthenticationFailure(error)) {
          invalidateSession();
          return;
        }
        // 中文：轮询失败通常表示核验尚未完成，保持弹窗并静默等待下一轮。
      }
      timer = window.setTimeout(() => {
        void pollFaceConfirmation();
      }, FACE_CONFIRM_POLL_INTERVAL_MS);
    };
    timer = window.setTimeout(() => {
      void pollFaceConfirmation();
    }, FACE_CONFIRM_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [
    applyFaceConfirmation,
    faceUrl,
    faceModalVisible,
    isFreshNewMode,
    invalidateSession,
    requestFaceConfirmation,
  ]);

  if (loading && !certification)
    return (
      <div className="page-stack enterprise-create-page">
        <PageTitle
          title={t("console.enterpriseCreate.title")}
          description={t("console.enterpriseCreate.description")}
        />
        <div className="profile-state-panel" role="status">
          {t("console.enterpriseCreate.loading")}
        </div>
      </div>
    );

  // 中文：修改资料时以表单当前选择为准，避免服务端旧身份把页面推回刷脸步骤。
  const applicantType =
    isFreshNewMode || editingInformation
      ? form.applicantType
      : applicantTypeFromCertification(certification, form.applicantType);
  const step =
    isFreshNewMode || editingInformation
      ? 1
      : stepFromCertification(certification, applicantType);
  const isLegalFaceStage =
    applicantType === "legal_representative" &&
    isFaceVerificationStage(certification);
  // 中文：法人核验阶段只用弹窗承载，底层始终保留资料表单，不再切换旧第二步页面。
  const showInformationForm = step === 1 || isLegalFaceStage;
  return (
    <div className="page-stack enterprise-create-page">
      <PageTitle
        title={t("console.enterpriseCreate.title")}
        description={t("console.enterpriseCreate.description")}
      />
      <div className="enterprise-certification-shell">
        <EnterpriseCertificationProgress
          applicantType={applicantType}
          step={step}
        />
        {showInformationForm ? (
          <EnterpriseCertificationForm
            form={form}
            errors={errors}
            consent={consent}
            submitting={submitting}
            licenseFile={license.file}
            licensePreviewUrl={license.previewUrl}
            licenseUploading={license.uploading}
            licenseError={license.error}
            authorizationFile={authorization.file}
            authorizationPreviewUrl={authorization.previewUrl}
            authorizationUploading={authorization.uploading}
            authorizationError={authorization.error}
            onChange={changeForm}
            onApplicantTypeChange={changeApplicantType}
            onChooseLicense={(event) => {
              void chooseMaterial("license", event);
            }}
            onRemoveLicense={() => removeMaterial("license")}
            onChooseAuthorization={(event) => {
              void chooseMaterial("authorization", event);
            }}
            onRemoveAuthorization={() => removeMaterial("authorization")}
            onConsentChange={(checked) => {
              setConsent(checked);
              if (checked) clearError("consent");
            }}
            onSubmit={(event) => {
              void submit(event);
            }}
          />
        ) : null}
        {((step === 2 && applicantType === "authorized_agent") || step === 3) &&
        certification ? (
          <EnterpriseResultStep
            certification={certification}
            loading={loading}
            onRefresh={() => {
              void loadCertification();
            }}
          />
        ) : null}
      </div>
      <EnterpriseFaceModal
        visible={faceModalVisible && !isFreshNewMode}
        faceUrl={faceUrl}
        preparing={startingFace || (!faceUrl && !faceConfirmNotice)}
        confirming={confirmingFace}
        notice={faceConfirmNotice}
        onRetry={() => {
          if (certification) void startFace(certification);
        }}
        onConfirm={() => {
          void confirmFace();
        }}
        onCancel={() => {
          setFaceModalVisible(false);
          setFaceConfirmNotice(null);
          setEditingInformation(true);
          // 中文：允许用户再次提交时重新触发同一阶段的刷脸流程。
          autoPresentedFaceStage.current = "";
        }}
      />
    </div>
  );
}
