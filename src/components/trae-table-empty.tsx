import { useTranslation } from "react-i18next";
import { IconFile } from "@douyinfe/semi-icons";
import "./trae-table-empty.css";

type TraeTableEmptyProps = {
  title?: string;
  hint?: string;
};

/** 新版企业管理表格共用的无数据状态，不额外创建卡片背景层。 */
export function TraeTableEmpty({ title, hint }: TraeTableEmptyProps) {
  const { t } = useTranslation();
  return (
    <div className="trae-table-empty" role="status">
      <IconFile aria-hidden="true" />
      <strong>{title ?? t("traeEnterprise.common.noData")}</strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  );
}
