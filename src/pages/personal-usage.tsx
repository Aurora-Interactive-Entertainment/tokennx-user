import { useEffect, useMemo, useState } from "react";
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
import { PersonalUsageDistributionPies } from "@/components/personal-usage-distribution-pies";
import { ConsoleTabs } from "@/components/console-tabs";
import { useAppStore } from "@/data/app-state";
import type { PersonalUsageContext } from "@/api/personal-usage";
import { getUserApiKeys, type UserApiKey } from "@/api/user-api-keys";
import "@/trae-enterprise.css";
import "./personal-usage.css";

export function PersonalUsagePage() {
  const { t } = useTranslation();
  const store = useAppStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "management" ? "management" : "board";
  const requestedApiKeyID = searchParams.get("api_key_id")?.trim() || "";
  const [apiKeys, setApiKeys] = useState<UserApiKey[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
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
  useEffect(() => {
    if (tab !== "management") return;
    let active = true;
    setApiKeysLoading(true);
    void getUserApiKeys(context, "all").then((response) => { if (active) setApiKeys(response.items); }).catch(() => { if (active) setApiKeys([]); }).finally(() => { if (active) setApiKeysLoading(false); });
    return () => { active = false; };
  }, [context, tab]);

  function selectTab(nextTab: "board" | "management") {
    const nextSearchParams = new URLSearchParams(searchParams);
    if (nextTab === "management") nextSearchParams.set("tab", nextTab);
    else nextSearchParams.delete("tab");
    setSearchParams(nextSearchParams, { replace: true });
  }
  function selectApiKey(value: string) {
    const nextSearchParams = new URLSearchParams(searchParams);
    if (!value || value === "all") nextSearchParams.delete("api_key_id");
    else nextSearchParams.set("api_key_id", value);
    setSearchParams(nextSearchParams, { replace: true });
  }

  return (
    <div className="trae-page personal-usage-page">
      <header className="trae-page-heading">
        <h1>{t("console.personalUsage.title")}</h1>
      </header>
      <ConsoleTabs
        className="personal-usage-tabs"
        activeKey={tab}
        onChange={(value) => selectTab(value as "board" | "management")}
        items={(["board", "management"] as const).map((item) => ({
          itemKey: item,
          tab: t(`console.personalUsage.tabs.${item}`),
        }))}
        ariaLabel={t("console.personalUsage.title")}
      />
      {tab === "board" ? (
        <section
          className="personal-usage-board"
          aria-labelledby="personal-usage-trend-title"
        >
          <PersonalTokenHeatmap context={context} />
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
          <PersonalUsageDistributionPies
            context={context}
            dateRange={dateRange}
          />
        </section>
      ) : (
        <PersonalUsageManagement context={context} apiKeyID={requestedApiKeyID || undefined} apiKeys={apiKeys} apiKeysLoading={apiKeysLoading} onApiKeyChange={selectApiKey} />
      )}
    </div>
  );
}
