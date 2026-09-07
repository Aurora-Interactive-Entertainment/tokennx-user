import type { ReactNode } from "react";
import AppModal from "@/components/app-modal";
import "./trae-dialog.css";

type TraeDialogProps = {
  title: ReactNode;
  children: ReactNode;
  onClose: () => void;
  className?: string;
};

/** 中文：保留内部调用方的延迟卸载约定，让 AppModal 自己负责退出动画。 */
export function deferTraeDialogClose(onClose: () => void): void {
  window.setTimeout(onClose, 180);
}

/** 中文：人员管理页统一复用 AppModal，业务类仅补充宽度和正文布局。 */
export function TraeDialog({
  title,
  children,
  onClose,
  className = "",
}: TraeDialogProps) {
  return (
    <AppModal
      className={`trae-dialog ${className}`.trim()}
      visible
      title={title}
      footer={null}
      maskClosable
      onCancel={onClose}
    >
      {children}
    </AppModal>
  );
}
