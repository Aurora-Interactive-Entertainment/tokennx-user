import { useTranslation } from "react-i18next";
import Tooltip from "@douyinfe/semi-ui/lib/es/tooltip";
import { IconInfoCircle } from "@douyinfe/semi-icons";
import type { ApiKeyBillingSource } from "@/api/user-api-keys";
import "./api-key-billing-source.css";

// 表头说明两种扣费方式，帮助用户发现除默认的按余额消耗之外还有订阅扣费。
export function ApiKeyBillingSourceHeader() {
  const { t } = useTranslation();
  const hint = t("console.account.billingSourceHint");
  return (
    <span className="api-key-billing-header">
      {t("console.account.billingSource")}
      <Tooltip
        className="app-info-tooltip api-key-billing-tooltip"
        content={hint}
        position="top"
      >
        <span
          className="app-info-icon-trigger"
          role="img"
          tabIndex={0}
          aria-label={hint}
        >
          <IconInfoCircle className="app-info-icon" aria-hidden="true" />
        </span>
      </Tooltip>
    </span>
  );
}

export function ApiKeyBillingSourceBadge({
  source,
}: {
  source?: ApiKeyBillingSource;
}) {
  const { t } = useTranslation();
  const subscription = source === "subscription";
  // 灰度旧响应可能缺少该字段，缺失或未知时保持中性占位，不猜测成余额扣费。
  const label =
    source === "balance" || subscription
      ? t(
          subscription
            ? "console.account.subscriptionExpense"
            : "console.account.balanceExpense",
        )
      : "";
  if (!label) return <span className="table-muted">--</span>;
  return (
    <span
      className={`api-key-billing-badge${subscription ? " subscription" : ""}`}
    >
      {label}
    </span>
  );
}
