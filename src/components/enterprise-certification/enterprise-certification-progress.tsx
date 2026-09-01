import { IconTick } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import type { EnterpriseApplicantType } from "@/api/enterprise-certification";
import "./enterprise-certification-progress.css";

interface EnterpriseCertificationProgressProps {
  applicantType: EnterpriseApplicantType;
  step: number;
}

export function EnterpriseCertificationProgress({
  applicantType,
  step,
}: EnterpriseCertificationProgressProps) {
  const { t } = useTranslation();
  const labels =
    applicantType === "authorized_agent"
      ? [
          t("console.enterpriseCreate.stepInformation"),
          t("console.enterpriseCreate.stepComplete"),
        ]
      : [
          t("console.enterpriseCreate.stepInformation"),
          t("console.enterpriseCreate.stepFace"),
          t("console.enterpriseCreate.stepComplete"),
        ];

  return (
    <ol
      className={`enterprise-certification-progress${applicantType === "authorized_agent" ? " is-agent" : ""}`}
      aria-label={t("console.enterpriseCreate.stepsLabel")}
    >
      {labels.map((label, index) => {
        const number = index + 1;
        const completed = number < step;
        return (
          <li
            className={
              number === step ? "is-current" : completed ? "is-completed" : ""
            }
            aria-current={number === step ? "step" : undefined}
            key={label}
          >
            <span className="enterprise-progress-marker" aria-hidden="true">
              {completed ? <IconTick /> : number}
            </span>
            <strong>{label}</strong>
          </li>
        );
      })}
    </ol>
  );
}
