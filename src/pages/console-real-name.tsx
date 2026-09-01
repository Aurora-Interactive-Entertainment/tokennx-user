import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import Button from "@douyinfe/semi-ui/lib/es/button";
import { IconTick } from "@douyinfe/semi-icons";
import Modal from "@/components/app-modal";
import Toast from "@douyinfe/semi-ui/lib/es/toast";
import QRCode from "qrcode";
import {
  CompatInput as Input,
  CompatSelect as Select,
} from "@/components/semi-compat";
import { getAccessToken } from "@/auth/token-storage";
import { isApiError, isAuthenticationFailure } from "@/api/http";
import {
  confirmRealName,
  getRealNameErrorMessage,
  getRealNameProfile,
  isRealNameConflict,
  submitRealName,
  type RealNameProfile,
  type SubmitRealNameRequest,
} from "@/api/real-name";
import { invalidateAuth } from "@/store/auth-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import i18n from "@/i18n";
import { apiTimeToMilliseconds } from "@/utils/format";
import { appToast } from "@/components/app-toast";
import "./console-real-name.css";

const REAL_NAME_NAME_MAX_LENGTH = 30;
const REAL_NAME_ID_NUMBER_LENGTH = 18;
const REAL_NAME_QR_SIZE = 220;
const QR_VALIDITY_MS = 5 * 60_000;
const REAL_NAME_CONFIRM_POLL_INTERVAL_MS = 3_000;
const REAL_NAME_SESSION_KEY = "token-nx:user-front:real-name-session";

export const REAL_NAME_ID_TYPES = [
  { value: "id-card", labelKey: "console.realName.mainlandId" },
] as const;

export interface RealNameFormInput {
  name: string;
  idType: string;
  idNumber: string;
  consent: boolean;
}
export type RealNameField = "name" | "idNumber" | "consent";
export type RealNameValidationErrors = Partial<Record<RealNameField, string>>;
type RealNameStep = 1 | 2 | 3;

interface StoredRealNameSession {
  user_id: string;
  id: string;
  certify_url: string;
  expires_at: number;
  qr_expires_at: number;
}

function mainlandIdBirthDate(idNumber: string): Date | null {
  const year = Number(idNumber.slice(6, 10));
  const month = Number(idNumber.slice(10, 12));
  const day = Number(idNumber.slice(12, 14));
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  )
    return null;
  return date;
}

function isAdult(birthDate: Date, now = new Date()): boolean {
  const adultDate = new Date(birthDate);
  adultDate.setFullYear(adultDate.getFullYear() + 18);
  return adultDate <= now;
}

// 中文：大陆居民身份证需要同时校验出生日期与末位校验码，避免仅凭长度放行无效证件号。
export function isValidMainlandIdNumber(value: string): boolean {
  const idNumber = value.trim().toUpperCase();
  if (!/^\d{17}[\dX]$/.test(idNumber) || !mainlandIdBirthDate(idNumber))
    return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checks = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];
  const sum = weights.reduce(
    (total, weight, index) => total + Number(idNumber[index]) * weight,
    0,
  );
  return checks[sum % 11] === idNumber.at(-1);
}

function maskRealNameIdNumber(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized.length <= 8) return normalized;
  return `${normalized.slice(0, 4)}${"*".repeat(Math.max(4, normalized.length - 8))}${normalized.slice(-4)}`;
}

function RealNameStepper({ step }: { step: RealNameStep }) {
  const { t } = useTranslation();
  const labels = [
    t("console.realName.stepInformation"),
    t("console.realName.stepFace"),
    t("console.realName.stepComplete"),
  ];

  return (
    <ol
      className="real-name-stepper"
      aria-label={t("console.realName.stepsLabel")}
    >
      {labels.map((label, index) => {
        const number = (index + 1) as RealNameStep;
        const complete = number < step;
        const current = number === step;
        return (
          <li
            className={`${complete ? "is-complete" : ""}${current ? " is-current" : ""}`.trim()}
            aria-current={current ? "step" : undefined}
            key={label}
          >
            <span className="real-name-step-marker" aria-hidden="true">
              {complete ? <IconTick /> : number}
            </span>
            <strong>{label}</strong>
            {number < 3 ? (
              <span className="real-name-step-line" aria-hidden="true" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function RequiredFieldLabel({ children }: { children: string }) {
  return (
    <span className="real-name-field-label">
      {children}
      <span aria-hidden="true">*</span>
    </span>
  );
}

export function validateRealNameForm(
  input: RealNameFormInput,
): RealNameValidationErrors {
  const errors: RealNameValidationErrors = {};
  const name = input.name.trim();
  const idNumber = input.idNumber.trim().toUpperCase();
  if (!name) errors.name = i18n.t("console.realName.nameRequired");
  else if (Array.from(name).length > REAL_NAME_NAME_MAX_LENGTH)
    errors.name = i18n.t("console.realName.nameTooLong", {
      count: REAL_NAME_NAME_MAX_LENGTH,
    });
  if (!idNumber) errors.idNumber = i18n.t("console.realName.numberRequired");
  else if (!isValidMainlandIdNumber(idNumber))
    errors.idNumber = i18n.t("console.realName.numberInvalid");
  else {
    const birthDate = mainlandIdBirthDate(idNumber);
    if (birthDate && !isAdult(birthDate))
      errors.idNumber = i18n.t("console.realName.adultRequired");
  }
  if (!input.consent)
    errors.consent = i18n.t("console.realName.consentRequired");
  return errors;
}

function isVerified(profile: RealNameProfile | null): boolean {
  return profile?.status === "verified";
}
function realNameVerificationLabel(profile: RealNameProfile): string {
  return profile.verification_level === "test"
    ? i18n.t("console.realName.testVerification")
    : i18n.t("console.realName.identityVerification");
}
function isMobileDevice(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(max-width: 700px)").matches
  );
}
function isRealNameLoginExpired(error: unknown): boolean {
  return isApiError(error)
    ? error.status === 401
    : isAuthenticationFailure(error);
}
function readStoredSession(userId: string): StoredRealNameSession | null {
  try {
    const raw = window.sessionStorage.getItem(REAL_NAME_SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredRealNameSession>;
    if (
      value.user_id !== userId ||
      typeof value.id !== "string" ||
      !value.id.trim() ||
      typeof value.certify_url !== "string" ||
      !value.certify_url.trim()
    ) {
      clearStoredSession();
      return null;
    }
    if (
      typeof value.expires_at !== "number" ||
      !Number.isFinite(value.expires_at) ||
      typeof value.qr_expires_at !== "number" ||
      !Number.isFinite(value.qr_expires_at)
    )
      return null;
    return value as StoredRealNameSession;
  } catch {
    return null;
  }
}

function clearStoredSession(): void {
  try {
    window.sessionStorage.removeItem(REAL_NAME_SESSION_KEY);
  } catch {
    /* Storage may be unavailable. */
  }
}

function saveStoredSession(
  userId: string,
  receipt: RealNameProfile,
  qrExpiresAt: number,
): void {
  const id = receipt.id?.trim();
  const certifyUrl = receipt.certify_url?.trim();
  if (!id || !certifyUrl) return;
  const serverExpiresAt =
    apiTimeToMilliseconds(receipt.expires_at) ?? qrExpiresAt;
  try {
    window.sessionStorage.setItem(
      REAL_NAME_SESSION_KEY,
      JSON.stringify({
        user_id: userId,
        id,
        certify_url: certifyUrl,
        expires_at: serverExpiresAt,
        qr_expires_at: qrExpiresAt,
      } satisfies StoredRealNameSession),
    );
  } catch {
    /* The active in-memory session remains usable. */
  }
}

export function RealNamePage() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const userId = useAppSelector((state) => state.auth.user?.id ?? "");
  const navigate = useNavigate();
  const [profile, setProfile] = useState<RealNameProfile | null>(null);
  const [name, setName] = useState("");
  const [idType, setIDType] = useState<string>(REAL_NAME_ID_TYPES[0].value);
  const [idNumber, setIDNumber] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<RealNameValidationErrors>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [refreshingQr, setRefreshingQr] = useState(false);
  const [receipt, setReceipt] = useState<RealNameProfile | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const qrCanvas = useRef<HTMLCanvasElement>(null);
  const submitLocked = useRef(false);
  const refreshLocked = useRef(false);
  const confirmRequest = useRef<{
    sessionId: string;
    promise: Promise<RealNameProfile>;
  } | null>(null);
  const submittedRequest = useRef<SubmitRealNameRequest | null>(null);

  const invalidateSession = useCallback(() => {
    clearStoredSession();
    dispatch(invalidateAuth());
    navigate("/", { replace: true });
  }, [dispatch, navigate]);

  const closeVerification = useCallback(() => {
    clearStoredSession();
    setReceipt(null);
    setQrExpiresAt(null);
    submittedRequest.current = null;
  }, []);

  const applyReceipt = useCallback(
    (next: RealNameProfile) => {
      const serverExpiresAt = apiTimeToMilliseconds(next.expires_at);
      const fiveMinutesFromNow = Date.now() + QR_VALIDITY_MS;
      const nextQrExpiresAt =
        serverExpiresAt === null
          ? fiveMinutesFromNow
          : Math.min(serverExpiresAt, fiveMinutesFromNow);
      setReceipt(next);
      setQrExpiresAt(nextQrExpiresAt);
      setClock(Date.now());
      if (userId) saveStoredSession(userId, next, nextQrExpiresAt);
    },
    [userId],
  );

  const loadProfile = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      invalidateSession();
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await getRealNameProfile(token);
      setProfile(next);
      if (next.status === "verified") {
        closeVerification();
      } else {
        const stored = userId ? readStoredSession(userId) : null;
        if (stored) {
          const sessionExpiresAt = Math.min(
            stored.expires_at,
            stored.qr_expires_at,
          );
          setReceipt({
            id: stored.id,
            certify_url: stored.certify_url,
            expires_at: stored.expires_at,
            status: "unverified",
          });
          setQrExpiresAt(sessionExpiresAt);
          setClock(Date.now());
        }
      }
    } catch (requestError) {
      if (isRealNameLoginExpired(requestError)) invalidateSession();
      else appToast.error(getRealNameErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [closeVerification, invalidateSession, userId]);

  const finishVerified = useCallback(
    async (verifiedProfile: RealNameProfile, showFeedback = true) => {
      closeVerification();
      setProfile(verifiedProfile);
      if (showFeedback) Toast.success(t("console.realName.verifiedSuccess"));
      const token = getAccessToken();
      if (!token) return;
      try {
        const refreshed = await getRealNameProfile(token);
        if (refreshed.status === "verified") setProfile(refreshed);
      } catch (requestError) {
        if (isRealNameLoginExpired(requestError)) invalidateSession();
      }
    },
    [closeVerification, invalidateSession, t],
  );

  const requestConfirmation = useCallback(
    (token: string, sessionId: string): Promise<RealNameProfile> => {
      const active = confirmRequest.current;
      if (active?.sessionId === sessionId) return active.promise;
      const promise = confirmRealName(token, sessionId).finally(() => {
        if (confirmRequest.current?.promise === promise)
          confirmRequest.current = null;
      });
      confirmRequest.current = { sessionId, promise };
      return promise;
    },
    [],
  );

  const confirmSilently = useCallback(
    async (sessionId: string) => {
      const token = getAccessToken();
      if (!token) {
        invalidateSession();
        return;
      }
      try {
        const next = await requestConfirmation(token, sessionId);
        if (next.status === "verified") await finishVerified(next, false);
      } catch (requestError) {
        if (isRealNameLoginExpired(requestError)) invalidateSession();
        else if (
          isApiError(requestError) &&
          (requestError.code === 110021 || requestError.code === 110022)
        )
          clearStoredSession();
        else if (isRealNameConflict(requestError)) {
          try {
            const current = await getRealNameProfile(token);
            if (current.status === "verified")
              await finishVerified(current, false);
          } catch (queryError) {
            if (isRealNameLoginExpired(queryError)) invalidateSession();
          }
        }
      }
    },
    [finishVerified, invalidateSession, requestConfirmation],
  );

  const cancelVerification = useCallback(() => {
    closeVerification();
  }, [closeVerification]);

  const queryFinalStatus = useCallback(
    async (token: string) => {
      const current = await getRealNameProfile(token);
      if (current.status === "verified") {
        await finishVerified(current);
        return true;
      }
      Toast.warning(t("console.realName.resultPending"));
      return false;
    },
    [finishVerified, t],
  );

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);
  useEffect(() => {
    const sessionId = receipt?.id?.trim();
    if (!sessionId || qrExpiresAt === null) return;

    let cancelled = false;
    let timer: number | undefined;
    const pollConfirmation = async (): Promise<void> => {
      if (Date.now() >= qrExpiresAt) return;
      await confirmSilently(sessionId);
      if (cancelled) return;
      timer = window.setTimeout(() => {
        void pollConfirmation();
      }, REAL_NAME_CONFIRM_POLL_INTERVAL_MS);
    };

    // 中文：二维码展示期间直接轮询确认接口；后台失败由 confirmSilently 静默处理。
    timer = window.setTimeout(() => {
      void pollConfirmation();
    }, REAL_NAME_CONFIRM_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [confirmSilently, qrExpiresAt, receipt?.id]);
  useEffect(() => {
    if (!receipt || qrExpiresAt === null || clock >= qrExpiresAt) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [clock, qrExpiresAt, receipt]);
  useEffect(() => {
    if (!receipt?.certify_url || !qrCanvas.current || isMobileDevice()) return;
    void QRCode.toCanvas(qrCanvas.current, receipt.certify_url, {
      width: REAL_NAME_QR_SIZE,
      margin: 1,
    }).catch(() => Toast.error(t("console.realName.qrFailed")));
  }, [receipt, t]);

  function validateField(field: RealNameField): void {
    const nextError = validateRealNameForm({ name, idType, idNumber, consent })[
      field
    ];
    setErrors((previous) => ({ ...previous, [field]: nextError }));
  }

  async function startVerification(
    request: SubmitRealNameRequest,
    retryConflict = true,
  ): Promise<void> {
    const token = getAccessToken();
    if (!token) {
      invalidateSession();
      return;
    }
    try {
      const next = await submitRealName(token, request);
      if (next.status === "verified") {
        await finishVerified(next);
        return;
      }
      if (!next.id?.trim() || !next.certify_url?.trim())
        throw new Error(t("console.realName.sessionMissing"));
      submittedRequest.current = request;
      applyReceipt(next);
      if (isMobileDevice()) {
        try {
          window.location.assign(next.certify_url);
        } catch {
          Toast.error(t("console.realName.openFailed"));
        }
      }
    } catch (requestError) {
      if (isRealNameLoginExpired(requestError)) invalidateSession();
      else if (retryConflict && isRealNameConflict(requestError))
        await startVerification(request, false);
      else Toast.error(getRealNameErrorMessage(requestError));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || submitLocked.current) return;
    const nextErrors = validateRealNameForm({
      name,
      idType,
      idNumber,
      consent,
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    submitLocked.current = true;
    setSubmitting(true);
    const request: SubmitRealNameRequest = {
      name: name.trim(),
      id_type: "id-card",
      id_number: idNumber.trim().toUpperCase(),
      consent: true,
      return_url: `${window.location.origin}/console/real-name`,
    };
    try {
      await startVerification(request);
    } finally {
      submitLocked.current = false;
      setSubmitting(false);
    }
  }

  async function confirmVerification() {
    if (confirming) return;
    const token = getAccessToken();
    if (!token) {
      invalidateSession();
      return;
    }
    const sessionId = receipt?.id?.trim();
    if (!sessionId) {
      closeVerification();
      Toast.error(t("console.realName.sessionMissing"));
      return;
    }
    if (qrExpiresAt !== null && Date.now() >= qrExpiresAt) {
      setClock(Date.now());
      Toast.warning(t("console.realName.qrExpiredHint"));
      return;
    }
    setConfirming(true);
    try {
      const next = await requestConfirmation(token, sessionId);
      if (next.status === "verified") await finishVerified(next);
      else Toast.warning(t("console.realName.resultPending"));
    } catch (requestError) {
      if (isRealNameLoginExpired(requestError)) invalidateSession();
      else if (
        isApiError(requestError) &&
        (requestError.code === 110021 || requestError.code === 110022)
      ) {
        closeVerification();
        Toast.error(
          t(
            requestError.code === 110022
              ? "console.realName.expired"
              : "console.realName.sessionMissing",
          ),
        );
      } else if (isRealNameConflict(requestError)) {
        try {
          await queryFinalStatus(token);
        } catch (queryError) {
          Toast.error(getRealNameErrorMessage(queryError));
        }
      } else Toast.error(getRealNameErrorMessage(requestError));
    } finally {
      setConfirming(false);
    }
  }

  async function refreshQrCode() {
    if (refreshingQr || refreshLocked.current) return;
    const request = submittedRequest.current;
    if (!request) {
      closeVerification();
      Toast.warning(t("console.realName.refillToRefresh"));
      return;
    }
    refreshLocked.current = true;
    setRefreshingQr(true);
    try {
      await startVerification(request);
    } finally {
      refreshLocked.current = false;
      setRefreshingQr(false);
    }
  }

  if (loading && !profile) {
    return (
      <div className="page-stack real-name-console-page">
        <section
          className="real-name-workspace"
          aria-labelledby="real-name-page-title"
        >
          <header className="real-name-workspace-heading">
            <span aria-hidden="true" />
            <h1 id="real-name-page-title">
              {t("console.realName.personalFaceTitle")}
            </h1>
          </header>
          <RealNameStepper step={1} />
          <div className="profile-state-panel" role="status">
            {t("console.realName.loading")}
          </div>
        </section>
      </div>
    );
  }
  const verified = isVerified(profile);
  const qrExpired = Boolean(
    receipt && qrExpiresAt !== null && clock >= qrExpiresAt,
  );
  const step: RealNameStep = verified ? 3 : receipt ? 2 : 1;
  const submittedName = submittedRequest.current?.name ?? "";
  const submittedIdNumber = submittedRequest.current?.id_number ?? "";
  const scanInstruction =
    submittedName && submittedIdNumber
      ? t("console.realName.scanInstruction", {
          name: submittedName,
          idNumber: maskRealNameIdNumber(submittedIdNumber),
        })
      : t("console.realName.scanInstructionGeneric");

  return (
    <div className="page-stack real-name-console-page">
      <section
        className="real-name-workspace"
        aria-labelledby="real-name-page-title"
      >
        <header className="real-name-workspace-heading">
          <span aria-hidden="true" />
          <h1 id="real-name-page-title">
            {t("console.realName.personalFaceTitle")}
          </h1>
        </header>
        <RealNameStepper step={step} />

        {!verified ? (
          <form className="real-name-form" onSubmit={submit} noValidate>
            <div className="real-name-field">
              <label htmlFor="real-name">
                <RequiredFieldLabel>
                  {t("console.realName.realName")}
                </RequiredFieldLabel>
              </label>
              <div className="real-name-control">
                <Input
                  id="real-name"
                  value={name}
                  onChange={(value) => {
                    setName(value);
                    if (errors.name)
                      setErrors((previous) => ({
                        ...previous,
                        name: undefined,
                      }));
                  }}
                  onBlur={() => validateField("name")}
                  maxLength={REAL_NAME_NAME_MAX_LENGTH}
                  placeholder={t("console.realName.realNamePlaceholder")}
                  validateStatus={errors.name ? "error" : "default"}
                  aria-invalid={Boolean(errors.name)}
                  aria-required="true"
                  aria-describedby={errors.name ? "real-name-error" : undefined}
                  autoComplete="name"
                />
                {errors.name ? (
                  <span
                    className="field-error"
                    id="real-name-error"
                    role="alert"
                  >
                    {errors.name}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="real-name-field">
              <label htmlFor="real-name-type">
                <RequiredFieldLabel>
                  {t("console.realName.idType")}
                </RequiredFieldLabel>
              </label>
              <div className="real-name-control">
                <Select
                  id="real-name-type"
                  value={idType}
                  onChange={(value) => setIDType(String(value))}
                  block
                  aria-label={t("console.realName.idType")}
                  aria-required="true"
                >
                  {REAL_NAME_ID_TYPES.map((item) => (
                    <Select.Option value={item.value} key={item.value}>
                      {t(item.labelKey)}
                    </Select.Option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="real-name-field">
              <label htmlFor="real-name-number">
                <RequiredFieldLabel>
                  {t("console.realName.idNumber")}
                </RequiredFieldLabel>
              </label>
              <div className="real-name-control">
                <Input
                  id="real-name-number"
                  value={idNumber}
                  onChange={(value) => {
                    setIDNumber(value.toUpperCase().replace(/\s/g, ""));
                    if (errors.idNumber)
                      setErrors((previous) => ({
                        ...previous,
                        idNumber: undefined,
                      }));
                  }}
                  onBlur={() => validateField("idNumber")}
                  maxLength={REAL_NAME_ID_NUMBER_LENGTH}
                  placeholder={t("console.realName.idNumberPlaceholder")}
                  validateStatus={errors.idNumber ? "error" : "default"}
                  aria-invalid={Boolean(errors.idNumber)}
                  aria-required="true"
                  aria-describedby={
                    errors.idNumber ? "real-name-number-error" : undefined
                  }
                  autoComplete="off"
                />
                {errors.idNumber ? (
                  <span
                    className="field-error"
                    id="real-name-number-error"
                    role="alert"
                  >
                    {errors.idNumber}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="real-name-consent-field">
              <div className="real-name-consent">
                <input
                  id="real-name-consent"
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => {
                    setConsent(event.target.checked);
                    if (event.target.checked)
                      setErrors((previous) => ({
                        ...previous,
                        consent: undefined,
                      }));
                  }}
                  onBlur={() => validateField("consent")}
                  aria-invalid={Boolean(errors.consent)}
                  aria-describedby={
                    errors.consent ? "real-name-consent-error" : undefined
                  }
                />
                <label htmlFor="real-name-consent">
                  {t("console.realName.consentPrefix")}
                  <a href="/terms" target="_blank" rel="noopener noreferrer">
                    {t("console.realName.serviceAgreement")}
                  </a>
                  {t("console.realName.agreementSeparator")}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer">
                    {t("console.realName.privacyPolicy")}
                  </a>
                </label>
              </div>
              {errors.consent ? (
                <span
                  className="field-error"
                  id="real-name-consent-error"
                  role="alert"
                >
                  {errors.consent}
                </span>
              ) : null}
            </div>

            <div className="real-name-form-actions">
              <Button
                theme="outline"
                type="tertiary"
                onClick={() => navigate(-1)}
              >
                {t("console.realName.backToList")}
              </Button>
              <Button
                className="real-name-submit"
                htmlType="submit"
                theme="solid"
                type="primary"
                loading={submitting}
                disabled={submitting}
              >
                {t("console.realName.submit")}
              </Button>
            </div>
          </form>
        ) : profile ? (
          <div
            className="real-name-complete"
            aria-label={t("console.realName.title")}
          >
            <span className="real-name-complete-icon" aria-hidden="true">
              <IconTick />
            </span>
            <h2>{t("console.realName.completed")}</h2>
            <p>{t("console.realName.completedHint")}</p>
            <dl className="real-name-status">
              <div className="real-name-status-row">
                <dt>{t("console.realName.verificationMethod")}</dt>
                <dd>{realNameVerificationLabel(profile)}</dd>
              </div>
              <div className="real-name-status-row">
                <dt>{t("console.realName.idNumber")}</dt>
                <dd>
                  {profile.masked_id_number || t("console.realName.protected")}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </section>

      <Modal
        className="personal-real-name-verification-modal"
        title={
          <span className="public-sr-only">
            {t("console.realName.stepFace")}
          </span>
        }
        visible={Boolean(receipt)}
        onCancel={cancelVerification}
        footer={null}
        width={720}
        maskClosable={false}
      >
        <div
          className="personal-real-name-verification-dialog"
          aria-busy={confirming || refreshingQr}
        >
          {receipt?.certify_url && !isMobileDevice() ? (
            <div
              className={`personal-real-name-qr-frame${qrExpired ? " is-expired" : ""}`}
            >
              <canvas
                ref={qrCanvas}
                aria-label={t("console.realName.scanWithPhone")}
              />
              {qrExpired ? (
                <div className="personal-real-name-qr-expired-overlay">
                  <span>{t("console.realName.qrExpired")}</span>
                  <Button
                    className="personal-real-name-refresh-qr-action"
                    theme="borderless"
                    loading={refreshingQr}
                    disabled={refreshingQr}
                    onClick={() => {
                      void refreshQrCode();
                    }}
                  >
                    {t("console.realName.refreshQr")}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : receipt?.certify_url ? (
            <Button
              className="personal-real-name-open-mobile-action"
              theme="solid"
              type="primary"
              disabled={qrExpired}
              onClick={() => {
                try {
                  window.location.assign(receipt.certify_url as string);
                } catch {
                  Toast.error(t("console.realName.openFailed"));
                }
              }}
            >
              {t("console.realName.openAlipay")}
            </Button>
          ) : null}

          <h2>
            {qrExpired
              ? t("console.realName.qrExpiredHint")
              : t("console.realName.scanWithPhone")}
          </h2>
          {!qrExpired ? <p>{scanInstruction}</p> : null}

          <div className="personal-real-name-dialog-actions">
            <Button
              theme="outline"
              type="tertiary"
              disabled={confirming || refreshingQr}
              onClick={cancelVerification}
            >
              {t("console.realName.modifyInformation")}
            </Button>
            <Button
              className="personal-real-name-dialog-primary-action"
              theme="solid"
              type="primary"
              loading={confirming}
              disabled={confirming || refreshingQr || qrExpired}
              onClick={() => {
                void confirmVerification();
              }}
            >
              {t("console.realName.confirm")}
            </Button>
          </div>
          {qrExpired && isMobileDevice() ? (
            <Button
              className="personal-real-name-refresh-qr-action"
              theme="borderless"
              loading={refreshingQr}
              disabled={refreshingQr}
              onClick={() => {
                void refreshQrCode();
              }}
            >
              {t("console.realName.refreshQr")}
            </Button>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
