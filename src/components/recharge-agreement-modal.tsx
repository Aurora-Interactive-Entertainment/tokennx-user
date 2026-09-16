import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import AppModal from "./app-modal";
import rechargeAgreement from "@/content/legal/top-up-agreement.md?raw";
import "./recharge-agreement-modal.css";

// 仅阅读协议时加载 Markdown，避免支付入口把渲染器带入首页首屏依赖。
const LazyMarkdownContent = lazy(() =>
  import("./markdown-content").then((module) => ({
    default: module.MarkdownContent,
  })),
);

export default function RechargeAgreementModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // 与页脚协议页共用静态正文；原地阅读不重新启动认证，也不改变支付同意状态。
  return (
    <AppModal
      visible={open}
      title={t("footer.rechargeAgreement")}
      aria-label={t("footer.rechargeAgreement")}
      width={760}
      zIndex={1001}
      footer={null}
      onCancel={onClose}
    >
      <Suspense fallback={<div role="status">{t("console.common.loading")}</div>}>
        <LazyMarkdownContent
          className="docs-markdown recharge-agreement-document"
          content={rechargeAgreement}
        />
      </Suspense>
    </AppModal>
  );
}
