import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AnalyticsFilters,
  AnalyticsRange,
} from "@/pages/enterprise-analytics-helpers";

export type AnalyticsTimeRangeValue = Pick<
  AnalyticsFilters,
  "range" | "startDate" | "endDate"
>;

export type TimeRangeValue<Range extends string> = {
  range: Range;
  startDate: string;
  endDate: string;
};

export type TimeRangePreset<Range extends string> = {
  value: Range;
  label: string;
};

type AnalyticsTimeRangePickerProps<Range extends string> = {
  value: TimeRangeValue<Range>;
  onChange: (value: TimeRangeValue<Range>) => void;
  presets?: readonly TimeRangePreset<Range>[];
  defaultCustomValue?: Pick<TimeRangeValue<Range>, "startDate" | "endDate">;
};

type CalendarDay = {
  value: string;
  day: number;
  inMonth: boolean;
};

const RANGE_LABEL_KEYS: Record<AnalyticsRange, string> = {
  "7d": "console.enterprise.analytics.range7d",
  "30d": "console.enterprise.analytics.range30d",
  month: "console.enterprise.analytics.rangeMonth",
  custom: "console.enterprise.analytics.rangeCustom",
};

const WEEKDAY_LABEL_KEYS = [
  "console.enterprise.analytics.weekdaySun",
  "console.enterprise.analytics.weekdayMon",
  "console.enterprise.analytics.weekdayTue",
  "console.enterprise.analytics.weekdayWed",
  "console.enterprise.analytics.weekdayThu",
  "console.enterprise.analytics.weekdayFri",
  "console.enterprise.analytics.weekdaySat",
] as const;

function dateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateValue(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return date.getFullYear() === Number(match[1]) &&
    date.getMonth() === Number(match[2]) - 1 &&
    date.getDate() === Number(match[3])
    ? date
    : null;
}

function monthValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthDate(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  return match
    ? new Date(Number(match[1]), Number(match[2]) - 1, 1)
    : new Date();
}

function shiftMonth(value: string, amount: number): string {
  const date = monthDate(value);
  date.setMonth(date.getMonth() + amount);
  return monthValue(date);
}

function calendarDays(value: string): CalendarDay[] {
  const first = monthDate(value);
  const days = new Array<CalendarDay>();
  const firstOffset = first.getDay();
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(
      first.getFullYear(),
      first.getMonth(),
      1 - firstOffset + index,
    );
    days.push({
      value: dateValue(date),
      day: date.getDate(),
      inMonth: date.getMonth() === first.getMonth(),
    });
  }
  return days;
}

function valueLabel<Range extends string>(
  value: TimeRangeValue<Range>,
  presets: readonly TimeRangePreset<Range>[],
): string {
  if (value.range === "custom" && value.startDate && value.endDate)
    return `${value.startDate.replaceAll("-", "/")} - ${value.endDate.replaceAll("-", "/")}`;
  return presets.find((preset) => preset.value === value.range)?.label ?? value.range;
}

function monthLabel(value: string, locale: string): string {
  const date = monthDate(value);
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
  }).format(date);
}

function initialMonth<Range extends string>(value: TimeRangeValue<Range>): string {
  return value.startDate?.slice(0, 7) || monthValue(new Date());
}

export function AnalyticsTimeRangePicker<Range extends string = AnalyticsRange>({
  value,
  onChange,
  presets,
  defaultCustomValue,
}: AnalyticsTimeRangePickerProps<Range>) {
  const { i18n, t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelID = `analytics-time-range-${useId().replaceAll(":", "")}`;
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(value);
  const [draft, setDraft] = useState(value);
  const [visibleMonth, setVisibleMonth] = useState(() => initialMonth(value));
  const availablePresets: readonly TimeRangePreset<Range>[] =
    presets ??
    (Object.keys(RANGE_LABEL_KEYS) as AnalyticsRange[]).map((range) => ({
      value: range as Range,
      label: t(RANGE_LABEL_KEYS[range]),
    }));

  useEffect(() => {
    if (open) return;
    setDraft(value);
    setSnapshot(value);
    setVisibleMonth(initialMonth(value));
  }, [open, value]);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event: PointerEvent): void {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      )
        setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        setDraft(snapshot);
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, snapshot]);

  const months = useMemo(
    () => [visibleMonth, shiftMonth(visibleMonth, 1)],
    [visibleMonth],
  );
  const currentLabel = valueLabel(value, availablePresets);

  function openPicker(): void {
    setSnapshot(value);
    setDraft(value);
    setVisibleMonth(initialMonth(value));
    setOpen(true);
  }

  function closeWithoutApply(): void {
    setDraft(snapshot);
    setOpen(false);
  }

  function choosePreset(range: Range): void {
    if (range === "custom") {
      const fallbackValue = defaultCustomValue ?? { startDate: "", endDate: "" };
      setDraft({
        range,
        startDate: value.range === "custom" ? value.startDate : fallbackValue.startDate,
        endDate: value.range === "custom" ? value.endDate : fallbackValue.endDate,
      });
      return;
    }
    onChange({ range, startDate: "", endDate: "" });
    setOpen(false);
  }

  function chooseDate(nextDate: string): void {
    const startDate = draft.startDate;
    if (!startDate || draft.endDate || nextDate < startDate) {
      setDraft({ range: "custom" as Range, startDate: nextDate, endDate: "" });
      return;
    }
    setDraft({ range: "custom" as Range, startDate, endDate: nextDate });
  }

  function applyDraft(): void {
    if (
      draft.range === "custom" &&
      (!parseDateValue(draft.startDate) || !parseDateValue(draft.endDate))
    )
      return;
    onChange(draft);
    setOpen(false);
  }

  function renderMonth(month: string) {
    const days = calendarDays(month);
    return (
      <section
        className="analytics-time-range-month"
        aria-label={monthLabel(month, i18n.language)}
        key={month}
      >
        <h3>{monthLabel(month, i18n.language)}</h3>
        <div className="analytics-time-range-weekdays">
          {WEEKDAY_LABEL_KEYS.map((key) => (
            <span aria-hidden="true" key={key}>
              {t(key)}
            </span>
          ))}
        </div>
        <div className="analytics-time-range-days" role="grid">
          {days.map((day) => {
            const selectedStart = draft.startDate === day.value;
            const selectedEnd = draft.endDate === day.value;
            const inRange = Boolean(
              draft.startDate &&
              draft.endDate &&
              day.value >= draft.startDate &&
              day.value <= draft.endDate,
            );
            return (
              <button
                className="analytics-time-range-day"
                data-in-month={day.inMonth}
                data-in-range={inRange}
                data-start={selectedStart}
                data-end={selectedEnd}
                aria-label={day.value}
                aria-pressed={selectedStart || selectedEnd}
                key={day.value}
                type="button"
                onClick={() => chooseDate(day.value)}
              >
                {day.day}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <div className="analytics-time-range-picker" ref={rootRef}>
      <button
        className="analytics-time-range-trigger"
        type="button"
        aria-controls={panelID}
        aria-expanded={open}
        aria-label={t("console.enterprise.analytics.currentRange", {
          range: currentLabel,
        })}
        onClick={() => {
          if (open) closeWithoutApply();
          else openPicker();
        }}
      >
        <span className="analytics-time-range-icon" aria-hidden="true" />
        <span className="analytics-time-range-trigger-label">
          {currentLabel}
        </span>
      </button>
      {open ? (
        <div
          className="analytics-time-range-panel"
          id={panelID}
          role="dialog"
          aria-label={t("console.enterprise.analytics.selectTimeRange")}
        >
          <div
            className="analytics-time-range-presets"
            role="group"
            aria-label={t("console.enterprise.analytics.quickTimeRange")}
          >
            {availablePresets.map((preset) => (
              <button
                className="analytics-time-range-preset"
                type="button"
                aria-pressed={draft.range === preset.value}
                key={preset.value}
                onClick={() => choosePreset(preset.value)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="analytics-time-range-calendar-wrap">
            <div className="analytics-time-range-calendar-head">
              <button
                className="analytics-time-range-calendar-nav"
                type="button"
                aria-label={t("console.enterprise.analytics.previousMonth")}
                onClick={() =>
                  setVisibleMonth((month) => shiftMonth(month, -1))
                }
              >
                ‹
              </button>
              <span aria-hidden="true" />
              <button
                className="analytics-time-range-calendar-nav"
                type="button"
                aria-label={t("console.enterprise.analytics.nextMonth")}
                onClick={() => setVisibleMonth((month) => shiftMonth(month, 1))}
              >
                ›
              </button>
            </div>
            <div className="analytics-time-range-calendar">
              {months.map(renderMonth)}
            </div>
            <p className="analytics-time-range-summary">
              {draft.startDate && draft.endDate
                ? t("console.enterprise.analytics.selectedRange", {
                    range: valueLabel(draft, availablePresets),
                  })
                : draft.startDate
                  ? t("console.enterprise.analytics.selectedStartDate", {
                      date: draft.startDate.replaceAll("-", "/"),
                    })
                  : t("console.enterprise.analytics.selectStartEndDate")}
            </p>
            <div className="analytics-time-range-actions">
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                onClick={closeWithoutApply}
              >
                {t("console.enterprise.analytics.cancel")}
              </button>
              <button
                className="btn btn-primary btn-sm"
                type="button"
                disabled={
                  draft.range === "custom" &&
                  (!draft.startDate || !draft.endDate)
                }
                onClick={applyDraft}
              >
                {t("console.enterprise.analytics.apply")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
