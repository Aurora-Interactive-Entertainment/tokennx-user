import { useTranslation } from "react-i18next";
import AppModal from "./app-modal";
import { MarkdownContent } from "./markdown-content";
import rechargeAgreement from "@/content/legal/top-up-agreement.md?raw";
import "./recharge-agreement-modal.css";

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
      <MarkdownContent
        className="docs-markdown recharge-agreement-document"
        content={rechargeAgreement}
      />
    </AppModal>
  );
}
