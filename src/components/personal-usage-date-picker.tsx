import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import DatePicker from "@douyinfe/semi-ui/lib/es/datePicker";
import type { UsageTrendQuery } from "@/api/personal-usage";
import { addLocalDays, startOfLocalToday } from "@/utils/date-range";

// 保留原导出路径，避免个人用量相关调用方发生无意义的导入变更。
export { addLocalDays, startOfLocalToday } from "@/utils/date-range";

function utcStartOfLocalDate(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

// 日期选择器按自然日展示，接口则使用 UTC 左闭右开区间。
export function dateRangeToUtcBounds(range: Date[]): {
  startAt: number;
  endAt: number;
} {
  const start = range[0] ?? startOfLocalToday();
  const end = range[1] ?? start;
  const startAt = utcStartOfLocalDate(start);
  const nextDay = utcStartOfLocalDate(addLocalDays(end, 1));
  return { startAt, endAt: Math.min(Date.now(), nextDay) };
}

// 与今天对齐的完整自然日范围直接使用后端预设，其他选择才发送自定义边界。
export function dateRangeToTrendQuery(range: Date[]): UsageTrendQuery {
  const bounds = dateRangeToUtcBounds(range);
  const today = startOfLocalToday();
  const start = range[0] ?? today;
  const end = range[1] ?? start;
  const daySpan = Math.round(
    (utcStartOfLocalDate(end) - utcStartOfLocalDate(start)) / 86_400_000,
  );
  const endsToday = utcStartOfLocalDate(end) === utcStartOfLocalDate(today);
  if (endsToday) {
    if (daySpan === 0) return { range: "today" };
    if (daySpan === 6) return { range: "7d" };
    if (daySpan === 29) return { range: "30d" };
    if (daySpan === 89) return { range: "90d" };
  }
  return { range: "custom", start_at: bounds.startAt, end_at: bounds.endAt };
}

export function PersonalUsageDatePicker({
  value,
  onChange,
  compact = false,
}: {
  value: Date[];
  onChange: (value: Date[]) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const today = useMemo(() => startOfLocalToday(), []);
  const minDate = useMemo(() => addLocalDays(today, -89), [today]);
  const presets = useMemo(
    () => [
      {
        text: t("traeEnterprise.analysis.datePresets.last7"),
        start: addLocalDays(today, -6),
        end: today,
      },
      {
        text: t("traeEnterprise.analysis.datePresets.last30"),
        start: addLocalDays(today, -29),
        end: today,
      },
      {
        text: t("traeEnterprise.analysis.datePresets.last90"),
        start: addLocalDays(today, -89),
        end: today,
      },
    ],
    [minDate, t, today],
  );

  // 沿用 Semi DatePicker，仅在个人用量页覆盖布局和最近 90 天限制。
  return (
    <DatePicker
      className={`trae-date-picker personal-usage-date-picker${compact ? " personal-usage-cue-date-picker" : ""}`}
      dropdownClassName={`trae-date-picker-dropdown personal-usage-date-dropdown${compact ? " personal-usage-cue-date-dropdown" : ""}`}
      type="dateRange"
      value={value}
      format="yyyy-MM-dd"
      rangeSeparator=" ~ "
      presets={compact ? undefined : presets}
      presetPosition={compact ? undefined : "left"}
      needConfirm={false}
      showClear={false}
      disabledDate={(date) => !date || date < minDate || date > today}
      onChange={(nextValue) => {
        if (!Array.isArray(nextValue)) return;
        const dates = nextValue.filter(
          (item): item is Date => item instanceof Date,
        );
        if (
          dates.length === 2 &&
          dates.every((date) => date >= minDate && date <= today)
        )
          onChange(dates);
      }}
    />
  );
}
