import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import ConfigProvider from "@douyinfe/semi-ui/lib/es/configProvider";
import Pagination from "@douyinfe/semi-ui/lib/es/pagination";
import semiEnUS from "@douyinfe/semi-ui/lib/es/locale/source/en_US";
import semiZhCN from "@douyinfe/semi-ui/lib/es/locale/source/zh_CN";
import "./trae-pagination.css";

type TraePaginationProps = {
  ariaLabel: string;
  currentPage: number;
  pageSize: number;
  total: number;
  summary?: ReactNode;
  disabled?: boolean;
  pageSizeOpts?: number[];
  onChange: (page: number, pageSize: number) => void;
};

export function TraePagination({
  ariaLabel,
  currentPage,
  pageSize,
  total,
  summary,
  disabled = false,
  pageSizeOpts = [10, 20, 50, 100],
  onChange,
}: TraePaginationProps) {
  const { t, i18n } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const isEnglish = i18n.language.startsWith("en");
  const locale = useMemo(() => {
    const baseLocale = isEnglish ? semiEnUS : semiZhCN;
    return {
      ...baseLocale,
      Pagination: {
        ...baseLocale.Pagination,
        pageSize: isEnglish ? "${pageSize} items/page" : "${pageSize}行/页",
      },
    };
  }, [isEnglish]);

  useEffect(() => {
    rootRef.current
      ?.querySelector(".semi-page-prev")
      ?.setAttribute("aria-label", t("console.common.previous"));
    rootRef.current
      ?.querySelector(".semi-page-next")
      ?.setAttribute("aria-label", t("console.common.next"));
  }, [currentPage, pageSize, t, total]);

  if (total <= 0) return null;

  return (
    <div
      className={`trae-usage-pagination${summary ? " trae-usage-pagination--with-summary" : ""}`}
      ref={rootRef}
    >
      {summary ? (
        <span className="trae-usage-pagination-summary">{summary}</span>
      ) : null}
      <ConfigProvider locale={locale}>
        <nav aria-label={ariaLabel}>
          <Pagination
            total={total}
            currentPage={currentPage}
            pageSize={pageSize}
            pageSizeOpts={pageSizeOpts}
            showSizeChanger
            hideOnSinglePage={false}
            prevText="‹"
            nextText="›"
            disabled={disabled}
            onChange={onChange}
          />
        </nav>
      </ConfigProvider>
    </div>
  );
}
