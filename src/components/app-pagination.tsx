import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Pagination from "@douyinfe/semi-ui/lib/es/pagination";
import { IconChevronLeft, IconChevronRight } from "@douyinfe/semi-icons";
import { CompatSelect as Select } from "@/components/semi-compat";

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

type AppPaginationProps = {
  ariaLabel: string;
  currentPage: number;
  pageSize: number;
  total: number;
  summary?: ReactNode;
  disabled?: boolean;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
};

export function AppPagination({
  ariaLabel,
  currentPage,
  pageSize,
  total,
  summary,
  disabled = false,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  onPageChange,
  onPageSizeChange,
}: AppPaginationProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);

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
    <div className="app-pagination" ref={rootRef}>
      {summary ? (
        <span className="app-pagination-summary">{summary}</span>
      ) : null}
      <nav aria-label={ariaLabel}>
        <Pagination
          total={total}
          pageSize={pageSize}
          currentPage={currentPage}
          prevText={<IconChevronLeft aria-hidden="true" />}
          nextText={<IconChevronRight aria-hidden="true" />}
          showSizeChanger={false}
          hideOnSinglePage={false}
          disabled={disabled}
          preventPageChangeOnPageSizeChange
          onChange={(nextPage, nextPageSize) => {
            if (nextPageSize !== pageSize && onPageSizeChange) {
              onPageSizeChange(nextPageSize);
              return;
            }
            if (nextPage !== currentPage) onPageChange(nextPage);
          }}
        />
        {onPageSizeChange ? (
          <Select
            className="app-pagination-size"
            value={pageSize}
            aria-label={t("console.common.pageSize")}
            onSelect={(value) => onPageSizeChange(Number(value))}
          >
            {pageSizeOptions.map((size) => (
              <Select.Option value={size} key={size}>
                {t("console.common.rowsPerPage", { size })}
              </Select.Option>
            ))}
          </Select>
        ) : null}
      </nav>
    </div>
  );
}
