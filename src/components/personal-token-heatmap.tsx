import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconRefresh } from "@douyinfe/semi-icons";
import {
  getDailyTokenUsage,
  getDailyTokenUsageErrorMessage,
  type DailyTokenUsageItem,
  type PersonalUsageContext,
} from "@/api/personal-usage";
import "./personal-token-heatmap.css";

type HeatmapDay = DailyTokenUsageItem & {
  level: number;
  column: number;
  row: number;
};

function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function addUtcDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function tokenLevel(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  const ratio = Math.log1p(value) / Math.log1p(max);
  return Math.min(4, Math.max(1, Math.ceil(ratio * 4)));
}

export function PersonalTokenHeatmap({
  context,
}: {
  context: PersonalUsageContext;
}) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<DailyTokenUsageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void getDailyTokenUsage(context, controller.signal)
      .then((response) => setItems(response.items))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(getDailyTokenUsageErrorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [context, reloadKey]);

  const formatTokens = useCallback(
    (value: number) => new Intl.NumberFormat(i18n.language).format(value),
    [i18n.language],
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }),
    [i18n.language],
  );
  const monthFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: "short",
        timeZone: "UTC",
      }),
    [i18n.language],
  );
  const dayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        weekday: "short",
        timeZone: "UTC",
      }),
    [i18n.language],
  );

  const heatmap = useMemo(() => {
    if (items.length === 0)
      return {
        days: [] as HeatmapDay[],
        months: [] as Array<{ label: string; column: number }>,
        columns: 53,
      };
    const sorted = [...items].sort((left, right) =>
      left.date.localeCompare(right.date),
    );
    const values = new Map(sorted.map((item) => [item.date, item]));
    const firstDate = utcDate(sorted[0].date);
    const lastDate = utcDate(sorted[sorted.length - 1].date);
    const gridStart = addUtcDays(firstDate, -firstDate.getUTCDay());
    const max = Math.max(...sorted.map((item) => item.total_tokens), 0);
    const days: HeatmapDay[] = [];
    const months: Array<{ label: string; column: number }> = [
      { label: monthFormatter.format(firstDate), column: 0 },
    ];
    let previousMonth = firstDate.getUTCMonth();
    for (let date = gridStart; date <= lastDate; date = addUtcDays(date, 1)) {
      const column = Math.floor(
        (date.getTime() - gridStart.getTime()) / 604800000,
      );
      const item = values.get(dateKey(date));
      if (item)
        days.push({
          ...item,
          level: tokenLevel(item.total_tokens, max),
          column,
          row: date.getUTCDay(),
        });
      if (
        date >= firstDate &&
        date.getUTCDate() <= 7 &&
        date.getUTCMonth() !== previousMonth
      ) {
        months.push({ label: monthFormatter.format(date), column });
        previousMonth = date.getUTCMonth();
      }
    }
    return {
      days,
      months,
      columns: Math.max(
        53,
        Math.ceil(
          (lastDate.getTime() - gridStart.getTime() + 86400000) / 604800000,
        ),
      ),
    };
  }, [items, monthFormatter]);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.total_tokens, 0),
    [items],
  );
  const weekdays = useMemo(
    () =>
      [1, 3, 5].map((day) => ({
        day,
        label: dayFormatter.format(new Date(Date.UTC(2026, 7, 23 + day))),
      })),
    [dayFormatter],
  );

  return (
    <section
      className="personal-token-heatmap-section"
      aria-labelledby="personal-token-heatmap-title"
    >
      <div className="personal-token-heatmap-heading">
        <div>
          <h2 id="personal-token-heatmap-title">
            {t("console.personalUsage.tokenHeatmap.title")}
          </h2>
          {!loading && !error ? (
            <span>
              {t("console.personalUsage.tokenHeatmap.total", {
                total: formatTokens(total),
              })}
            </span>
          ) : null}
        </div>
        <span>{t("console.personalUsage.tokenHeatmap.utcHint")}</span>
      </div>
      <div className="personal-token-heatmap-panel">
        {loading ? (
          <div className="personal-token-heatmap-status" role="status">
            <span className="console-loading-spinner" />
            {t("console.personalUsage.tokenHeatmap.loading")}
          </div>
        ) : error ? (
          <div className="personal-token-heatmap-status" role="alert">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              <IconRefresh aria-hidden="true" />
              {t("console.personalUsage.tokenHeatmap.retry")}
            </button>
          </div>
        ) : (
          <div className="personal-token-heatmap-scroll">
            <div
              className="personal-token-heatmap-chart"
              style={
                { "--heatmap-columns": heatmap.columns } as React.CSSProperties
              }
              role="grid"
              aria-label={t("console.personalUsage.tokenHeatmap.ariaLabel")}
            >
              <div className="personal-token-heatmap-months" aria-hidden="true">
                {heatmap.months.map((month) => (
                  <span
                    key={`${month.label}-${month.column}`}
                    style={{ gridColumn: month.column + 1 }}
                  >
                    {month.label}
                  </span>
                ))}
              </div>
              <div
                className="personal-token-heatmap-weekdays"
                aria-hidden="true"
              >
                {weekdays.map((weekday) => (
                  <span key={weekday.day} style={{ gridRow: weekday.day + 1 }}>
                    {weekday.label}
                  </span>
                ))}
              </div>
              <div className="personal-token-heatmap-cells">
                {heatmap.days.map((day) => {
                  const label = t(
                    "console.personalUsage.tokenHeatmap.dayLabel",
                    {
                      date: dateFormatter.format(utcDate(day.date)),
                      total: formatTokens(day.total_tokens),
                      input: formatTokens(day.input_tokens),
                      output: formatTokens(day.output_tokens),
                    },
                  );
                  return (
                    <span
                      key={day.date}
                      className={`personal-token-heatmap-cell level-${day.level}`}
                      style={{
                        gridColumn: day.column + 1,
                        gridRow: day.row + 1,
                      }}
                      role="gridcell"
                      aria-label={label}
                      title={label}
                    />
                  );
                })}
              </div>
              <div
                className="personal-token-heatmap-legend"
                aria-label={t("console.personalUsage.tokenHeatmap.legend")}
              >
                <span>{t("console.personalUsage.tokenHeatmap.less")}</span>
                {[0, 1, 2, 3, 4].map((level) => (
                  <i key={level} className={`level-${level}`} />
                ))}
                <span>{t("console.personalUsage.tokenHeatmap.more")}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
