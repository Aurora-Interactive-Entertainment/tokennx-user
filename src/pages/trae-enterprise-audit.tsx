import { useTranslation } from "react-i18next";
import { TraeEnterpriseAudit } from "@/components/trae-enterprise-audit";
import "@/trae-enterprise.css";
import { EnterprisePageShell } from "./enterprise-console-shared";

export function TraeEnterpriseAuditPage() {
  const { t } = useTranslation();
  return (
    <EnterprisePageShell
      title={t("traeEnterprise.audit.title")}
      description={t("traeEnterprise.audit.description")}
      capability="can_view_audit"
      className="trae-enterprise-audit-shell"
      showHeader={false}
    >
      {(context) => <TraeEnterpriseAudit context={context} />}
    </EnterprisePageShell>
  );
}
