import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import Tooltip from "@douyinfe/semi-ui/lib/es/tooltip";
import { IconInfoCircle } from "@douyinfe/semi-icons";
import { PersonalTokenHeatmap } from "@/components/personal-token-heatmap";
import {
  addLocalDays,
  PersonalUsageDatePicker,
  startOfLocalToday,
} from "@/components/personal-usage-date-picker";
import { PersonalUsageManagement } from "@/components/personal-usage-management";
import { PersonalUsageTrendChart } from "@/components/personal-usage-trend-chart";
import { useAppStore } from "@/data/app-state";
import type { PersonalUsageContext } from "@/api/personal-usage";
import "@/trae-enterprise.css";
import "./personal-usage.css";

export function PersonalUsagePage() {
  const { t } = useTranslation();
  const store = useAppStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "management" ? "management" : "board";
  const [dateRange, setDateRange] = useState<Date[]>(() => {
    const today = startOfLocalToday();
    return [addLocalDays(today, -29), today];
  });
  const context = useMemo<PersonalUsageContext>(
    () =>
      store.activeWorkspace.type === "enterprise"
        ? {
            account_type: "enterprise",
            enterprise_id: store.activeWorkspace.id,
          }
        : { account_type: "personal" },
    [store.activeWorkspace.id, store.activeWorkspace.type],
  );

  function selectTab(nextTab: "board" | "management") {
    const nextSearchParams = new URLSearchParams(searchParams);
    if (nextTab === "management") nextSearchParams.set("tab", nextTab);
    else nextSearchParams.delete("tab");
    setSearchParams(nextSearchParams, { replace: true });
  }

  return (
    <div className="trae-page personal-usage-page">
      <header className="trae-page-heading">
        <h1>
          {t("console.personalUsage.title")}{" "}
          <small>{t("console.personalUsage.resetHint")}</small>
        </h1>
      </header>
      <div className="trae-tabs personal-usage-tabs" role="tablist">
        {(["board", "management"] as const).map((item) => (
          <button
            key={item}
            className={tab === item ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => selectTab(item)}
          >
            {t(`console.personalUsage.tabs.${item}`)}
          </button>
        ))}
      </div>
      {tab === "board" ? (
        <section
          className="personal-usage-board"
          aria-labelledby="personal-usage-trend-title"
        >
          <div className="personal-usage-board-heading">
            <h2 id="personal-usage-trend-title">
              {t("console.personalUsage.trend")}{" "}
              <Tooltip
                className="app-info-tooltip"
                content={t("console.personalUsage.trendHint")}
              >
                <IconInfoCircle className="app-info-icon" aria-hidden="true" />
              </Tooltip>
            </h2>
            <PersonalUsageDatePicker
              value={dateRange}
              onChange={setDateRange}
            />
          </div>
          <div className="personal-usage-chart-panel">
            <PersonalUsageTrendChart context={context} dateRange={dateRange} />
          </div>
          <PersonalTokenHeatmap context={context} />
        </section>
      ) : (
        <PersonalUsageManagement context={context} />
      )}
    </div>
  );
}
