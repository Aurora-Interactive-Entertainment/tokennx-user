import { useRef, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router";
import { IconDeleteStroked, IconFile, IconUpload } from "@douyinfe/semi-icons";
import Button from "@douyinfe/semi-ui/lib/es/button";
import { useTranslation } from "react-i18next";
import {
  ENTERPRISE_AUTHORIZED_AGENT_NAME_MAX_LENGTH,
  ENTERPRISE_CONTACT_NAME_MAX_LENGTH,
  ENTERPRISE_CONTACT_PHONE_MAX_LENGTH,
  ENTERPRISE_CREDIT_CODE_LENGTH,
  ENTERPRISE_LEGAL_REPRESENTATIVE_MAX_LENGTH,
  ENTERPRISE_NAME_MAX_LENGTH,
  normalizeEnterpriseCreditCode,
  type EnterpriseApplicantType,
  type EnterpriseCertificationValidationErrors,
} from "@/api/enterprise-certification";
import { CompatInput as Input } from "@/components/semi-compat";
import "./enterprise-certification-form.css";

export interface EnterpriseCertificationFormState {
  enterpriseName: string;
  creditCode: string;
  legalRepresentative: string;
  legalRepresentativeId: string;
  contactName: string;
  contactPhone: string;
  applicantType: EnterpriseApplicantType;
  authorizedAgentName: string;
  authorizedAgentId: string;
}

interface MaterialControlProps {
  id: string;
  label: string;
  accept: string;
  file: File | null;
  previewUrl: string;
  uploading: boolean;
  error?: string;
  uploadText: string;
  rules: string[];
  onChoose: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}

function MaterialControl(props: MaterialControlProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const isImage = Boolean(
    props.file?.type.startsWith("image/") && props.previewUrl,
  );
  const errorId = `${props.id}-error`;

  return (
    <div className="enterprise-form-row enterprise-material-row">
      <label className="enterprise-form-label" htmlFor={props.id}>
        {props.label}
        <span aria-hidden="true">*</span>
      </label>
      <div className="enterprise-form-control">
        <input
          ref={inputRef}
          id={props.id}
          className="enterprise-file-input"
          type="file"
          accept={props.accept}
          aria-invalid={Boolean(props.error)}
          aria-describedby={props.error ? errorId : undefined}
          onChange={props.onChoose}
        />
        <div className="enterprise-material-layout">
          <button
            className={`enterprise-material-tile${props.error ? " is-error" : ""}${props.uploading ? " is-uploading" : ""}`}
            type="button"
            disabled={props.uploading}
            onClick={() => inputRef.current?.click()}
          >
            {isImage ? (
              <img src={props.previewUrl} alt={props.label} />
            ) : props.file ? (
              <IconFile aria-hidden="true" />
            ) : (
              <IconUpload aria-hidden="true" />
            )}
            <span>
              {props.uploading
                ? t("console.enterpriseCreate.uploading")
                : props.file
                  ? t("console.enterpriseCreate.replaceFile")
                  : props.uploadText}
            </span>
          </button>
          <div className="enterprise-material-copy">
            {props.file ? (
              <div className="enterprise-material-file-name">
                <span title={props.file.name}>{props.file.name}</span>
                <Button
                  htmlType="button"
                  theme="borderless"
                  size="small"
                  type="danger"
                  icon={<IconDeleteStroked />}
                  aria-label={t("console.enterpriseCreate.removeFile")}
                  title={t("console.enterpriseCreate.removeFile")}
                  disabled={props.uploading}
                  onClick={props.onRemove}
                />
              </div>
            ) : null}
            {props.rules.map((rule) => (
              <small key={rule}>{rule}</small>
            ))}
          </div>
        </div>
        {props.error ? (
          <span id={errorId} className="enterprise-field-error" role="alert">
            {props.error}
          </span>
        ) : null}
      </div>
    </div>
  );
}

interface EnterpriseFieldProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  hint?: string;
  maxLength: number;
  placeholder: string;
  onChange: (value: string) => void;
}

function EnterpriseField({
  id,
  label,
  value,
  error,
  hint,
  maxLength,
  placeholder,
  onChange,
}: EnterpriseFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className="enterprise-form-row">
      <label className="enterprise-form-label" htmlFor={id}>
        {label}
        <span aria-hidden="true">*</span>
      </label>
      <div className="enterprise-form-control">
        <Input
          id={id}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          validateStatus={error ? "error" : "default"}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          onChange={onChange}
        />
        {hint ? (
          <small id={hintId} className="enterprise-field-hint">
            {hint}
          </small>
        ) : null}
        {error ? (
          <span id={errorId} className="enterprise-field-error" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}

interface EnterpriseCertificationFormProps {
  form: EnterpriseCertificationFormState;
  errors: EnterpriseCertificationValidationErrors;
  consent: boolean;
  submitting: boolean;
  licenseFile: File | null;
  licensePreviewUrl: string;
  licenseUploading: boolean;
  licenseError: string;
  authorizationFile: File | null;
  authorizationPreviewUrl: string;
  authorizationUploading: boolean;
  authorizationError: string;
  onChange: (
    field: keyof EnterpriseCertificationFormState,
    value: string,
  ) => void;
  onApplicantTypeChange: (value: EnterpriseApplicantType) => void;
  onChooseLicense: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveLicense: () => void;
  onChooseAuthorization: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveAuthorization: () => void;
  onConsentChange: (checked: boolean) => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function EnterpriseCertificationForm(
  props: EnterpriseCertificationFormProps,
) {
  const { t } = useTranslation();
  const isAgent = props.form.applicantType === "authorized_agent";

  return (
    <form
      className="enterprise-certification-form"
      onSubmit={props.onSubmit}
      noValidate
    >
      <section
        className="enterprise-form-section"
        aria-labelledby="enterprise-basic-information"
      >
        <h2
          id="enterprise-basic-information"
          className="enterprise-form-section-title"
        >
          {t("console.enterpriseCreate.basicInformation")}
        </h2>
        <div className="enterprise-form-row">
          <span className="enterprise-form-label">
            {t("console.enterpriseCreate.organizationType")}
            <span aria-hidden="true">*</span>
          </span>
          <div className="enterprise-form-control enterprise-radio-control">
            <label>
              <input type="radio" checked readOnly />
              {t("console.enterpriseCreate.enterpriseOrganization")}
            </label>
            <small className="enterprise-field-hint">
              {t("console.enterpriseCreate.organizationHint")}
            </small>
          </div>
        </div>
        <MaterialControl
          id="enterprise-license"
          label={t("console.enterpriseCreate.license")}
          accept="image/png,image/jpeg"
          file={props.licenseFile}
          previewUrl={props.licensePreviewUrl}
          uploading={props.licenseUploading}
          error={props.licenseError || props.errors.licenseUrl}
          uploadText={t("console.enterpriseCreate.addLicense")}
          rules={[
            t("console.enterpriseCreate.licenseRuleLatest"),
            t("console.enterpriseCreate.licenseRules"),
          ]}
          onChoose={props.onChooseLicense}
          onRemove={props.onRemoveLicense}
        />
        {props.licenseUploading ? (
          <div className="enterprise-recognition-status" role="status">
            <span className="console-loading-spinner" aria-hidden="true" />
            <span>
              <strong>
                {t("console.enterpriseCreate.recognitionLoading")}
              </strong>
              <small>
                {t("console.enterpriseCreate.recognitionLoadingHint")}
              </small>
            </span>
          </div>
        ) : null}
        <EnterpriseField
          id="enterprise-name"
          label={t("console.enterpriseCreate.enterpriseName")}
          value={props.form.enterpriseName}
          error={props.errors.enterpriseName}
          maxLength={ENTERPRISE_NAME_MAX_LENGTH}
          placeholder={t("console.enterpriseCreate.namePlaceholder")}
          onChange={(value) => props.onChange("enterpriseName", value)}
        />
        <EnterpriseField
          id="enterprise-credit-code"
          label={t("console.enterpriseCreate.creditCode")}
          value={props.form.creditCode}
          error={props.errors.creditCode}
          hint={t("console.enterpriseCreate.creditCodeHint")}
          maxLength={ENTERPRISE_CREDIT_CODE_LENGTH}
          placeholder={t("console.enterpriseCreate.creditCodePlaceholder")}
          onChange={(value) =>
            props.onChange("creditCode", normalizeEnterpriseCreditCode(value))
          }
        />
        <EnterpriseField
          id="enterprise-legal-representative"
          label={t("console.enterpriseCreate.legalRepresentative")}
          value={props.form.legalRepresentative}
          error={props.errors.legalRepresentative}
          maxLength={ENTERPRISE_LEGAL_REPRESENTATIVE_MAX_LENGTH}
          placeholder={t(
            "console.enterpriseCreate.legalRepresentativePlaceholder",
          )}
          onChange={(value) => props.onChange("legalRepresentative", value)}
        />
        <div className="enterprise-form-row">
          <label
            className="enterprise-form-label"
            htmlFor="enterprise-document-type"
          >
            {t("console.enterpriseCreate.documentType")}
            <span aria-hidden="true">*</span>
          </label>
          <div className="enterprise-form-control">
            <Input
              id="enterprise-document-type"
              value={t("console.enterpriseCreate.residentIdentityCard")}
              readOnly
            />
          </div>
        </div>
        <EnterpriseField
          id="enterprise-legal-representative-id"
          label={t("console.enterpriseCreate.legalRepresentativeId")}
          value={props.form.legalRepresentativeId}
          error={props.errors.legalRepresentativeId}
          maxLength={18}
          placeholder={t(
            "console.enterpriseCreate.legalRepresentativeIdPlaceholder",
          )}
          onChange={(value) =>
            props.onChange("legalRepresentativeId", value.toUpperCase())
          }
        />
        <EnterpriseField
          id="enterprise-contact-name"
          label={t("console.enterpriseCreate.contactName")}
          value={props.form.contactName}
          error={props.errors.contactName}
          maxLength={ENTERPRISE_CONTACT_NAME_MAX_LENGTH}
          placeholder={t("console.enterpriseCreate.contactNamePlaceholder")}
          onChange={(value) => props.onChange("contactName", value)}
        />
        <EnterpriseField
          id="enterprise-contact-phone"
          label={t("console.enterpriseCreate.contactPhone")}
          value={props.form.contactPhone}
          error={props.errors.contactPhone}
          maxLength={ENTERPRISE_CONTACT_PHONE_MAX_LENGTH}
          placeholder={t("console.enterpriseCreate.contactPhonePlaceholder")}
          onChange={(value) => props.onChange("contactPhone", value)}
        />
      </section>

      <section
        className="enterprise-form-section"
        aria-labelledby="enterprise-identity-information"
      >
        <h2
          id="enterprise-identity-information"
          className="enterprise-form-section-title"
        >
          {t("console.enterpriseCreate.verifyIdentity")}
        </h2>
        <div className="enterprise-form-row">
          <span className="enterprise-form-label">
            {t("console.enterpriseCreate.yourIdentity")}
            <span aria-hidden="true">*</span>
          </span>
          <div className="enterprise-form-control enterprise-radio-control enterprise-applicant-radios">
            <label>
              <input
                name="enterprise-applicant-type"
                type="radio"
                value="legal_representative"
                checked={!isAgent}
                onChange={() =>
                  props.onApplicantTypeChange("legal_representative")
                }
              />
              {t("console.enterpriseCreate.legalRepresentativeApplicant")}
            </label>
            <label>
              <input
                name="enterprise-applicant-type"
                type="radio"
                value="authorized_agent"
                checked={isAgent}
                onChange={() => props.onApplicantTypeChange("authorized_agent")}
              />
              {t("console.enterpriseCreate.authorizedAgent")}
            </label>
          </div>
        </div>
      </section>

      {isAgent ? (
        <section
          className="enterprise-form-section enterprise-agent-section"
          aria-labelledby="enterprise-agent-information"
        >
          <h2
            id="enterprise-agent-information"
            className="enterprise-form-section-title"
          >
            {t("console.enterpriseCreate.agentInformation")}
          </h2>
          <MaterialControl
            id="enterprise-authorization"
            label={t("console.enterpriseCreate.authorizationLetter")}
            accept="image/png,image/jpeg,application/pdf"
            file={props.authorizationFile}
            previewUrl={props.authorizationPreviewUrl}
            uploading={props.authorizationUploading}
            error={props.authorizationError || props.errors.authorizationUrl}
            uploadText={t("console.enterpriseCreate.addAuthorization")}
            rules={[t("console.enterpriseCreate.authorizationRules")]}
            onChoose={props.onChooseAuthorization}
            onRemove={props.onRemoveAuthorization}
          />
          <EnterpriseField
            id="enterprise-authorized-agent-name"
            label={t("console.enterpriseCreate.authorizedAgentName")}
            value={props.form.authorizedAgentName}
            error={props.errors.authorizedAgentName}
            maxLength={ENTERPRISE_AUTHORIZED_AGENT_NAME_MAX_LENGTH}
            placeholder={t(
              "console.enterpriseCreate.authorizedAgentNamePlaceholder",
            )}
            onChange={(value) => props.onChange("authorizedAgentName", value)}
          />
          <EnterpriseField
            id="enterprise-authorized-agent-id"
            label={t("console.enterpriseCreate.authorizedAgentId")}
            value={props.form.authorizedAgentId}
            error={props.errors.authorizedAgentId}
            maxLength={18}
            placeholder={t(
              "console.enterpriseCreate.authorizedAgentIdPlaceholder",
            )}
            onChange={(value) =>
              props.onChange("authorizedAgentId", value.toUpperCase())
            }
          />
        </section>
      ) : null}

      <div className="enterprise-certification-consent">
        <input
          id="enterprise-certification-consent"
          type="checkbox"
          checked={props.consent}
          aria-invalid={Boolean(props.errors.consent)}
          onChange={(event) => props.onConsentChange(event.target.checked)}
        />
        <label htmlFor="enterprise-certification-consent">
          {t("console.enterpriseCreate.consentPrefix")}{" "}
          <Link to="/terms" target="_blank" rel="noreferrer">
            {t("console.enterpriseCreate.serviceAgreement")}
          </Link>
          、
          <Link to="/privacy" target="_blank" rel="noreferrer">
            {t("console.enterpriseCreate.privacyPolicy")}
          </Link>
        </label>
      </div>
      {props.errors.consent ? (
        <span
          className="enterprise-field-error enterprise-consent-error"
          role="alert"
        >
          {props.errors.consent}
        </span>
      ) : null}
      <div className="enterprise-certification-actions">
        <Button
          htmlType="button"
          theme="outline"
          type="tertiary"
          onClick={props.onBack}
        >
          {t("console.enterpriseCreate.returnList")}
        </Button>
        <Button
          htmlType="submit"
          theme="solid"
          type="primary"
          loading={props.submitting}
          disabled={
            props.submitting ||
            props.licenseUploading ||
            props.authorizationUploading
          }
        >
          {t("console.enterpriseCreate.submitCertification")}
        </Button>
      </div>
    </form>
  );
}
