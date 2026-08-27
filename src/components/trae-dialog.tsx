import { useEffect, useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IconClose } from "@douyinfe/semi-icons";
import "./trae-dialog.css";

type TraeDialogProps = {
  title: ReactNode;
  children: ReactNode;
  onClose: () => void;
  className?: string;
};

/** 新版企业管理共用弹窗，统一处理背景滚动锁定和无障碍标题关联。 */
export function TraeDialog({
  title,
  children,
  onClose,
  className = "",
}: TraeDialogProps) {
  const { t } = useTranslation();
  const titleID = useId();

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - html.clientWidth;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
    };
  }, []);

  return (
    <div
      className="trae-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`trae-dialog ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleID}
      >
        <header>
          <h2 id={titleID}>{title}</h2>
          <button type="button" aria-label={t("traeEnterprise.common.close")} onClick={onClose}>
            <IconClose aria-hidden="true" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
