import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import AppModal from "@/components/app-modal";
import "./trae-dialog.css";

type TraeDialogProps = {
  title: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  onClose: () => void;
  className?: string;
  closable?: boolean;
};

/** 人员管理页统一复用 AppModal，业务类仅补充宽度和正文布局。 */
export function TraeDialog({
  title,
  children,
  onClose,
  className = "",
  closable = true,
}: TraeDialogProps) {
  const [visible, setVisible] = useState(true);
  const closingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  // 先切换 visible 触发 Semi 的退出动画，动画结束后再卸载业务节点。
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setVisible(false);
    closeTimerRef.current = window.setTimeout(onClose, 180);
  }, [onClose]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  const content = typeof children === "function" ? children(close) : children;
  return (
    <AppModal
      className={`trae-dialog ${className}`.trim()}
      visible={visible}
      title={title}
      footer={null}
      closable={closable}
      maskClosable={closable}
      onCancel={close}
    >
      {content}
    </AppModal>
  );
}
