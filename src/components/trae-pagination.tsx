import { useEffect, useMemo, useRef } from "react";
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
  pageSizeOpts?: number[];
  onChange: (page: number, pageSize: number) => void;
};

export function TraePagination({
  ariaLabel,
  currentPage,
  pageSize,
  total,
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
    <div className="trae-usage-pagination" ref={rootRef}>
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
            onChange={onChange}
          />
        </nav>
      </ConfigProvider>
    </div>
  );
}
