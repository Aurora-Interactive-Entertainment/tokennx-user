import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import AppModal from "@/components/app-modal";
import type { CatalogPlan } from "@/api/product-plans";
import { planGroups, planGroup } from "./purchase-plan-display";
import { SubscriptionPlanCard } from "./subscription-plan-card";
import { PurchaseCatalogState } from "./purchase-catalog-state";
import "./purchase-subscription-modal.css";
import "./purchase-modal-motion.css";

export function PurchaseSubscriptionModal({
  open,
  onClose,
  onPlanSelect,
  covered = false,
  plans,
  loading,
  error,
  onRetry,
}: {
  open: boolean;
  onClose: () => void;
  onPlanSelect: (plan: CatalogPlan) => void;
  plans: CatalogPlan[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  covered?: boolean;
}) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("all");
  const tabsRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => planGroups(plans), [plans]);
  const tabs = ["all", ...groups];
  const cards = useMemo(
    () => activeTab === "all" ? plans : plans.filter(plan => planGroup(plan) === activeTab),
    [activeTab, plans],
  );

  useEffect(() => {
    if (activeTab !== "all" && !groups.includes(activeTab)) setActiveTab("all");
  }, [activeTab, groups]);

  // 切换筛选后把选中项平滑滚到筛选条水平中心，避免选中项在边缘被截断。
  useEffect(() => {
    const container = tabsRef.current;
    const active = container?.querySelector<HTMLButtonElement>(
      "button.is-active",
    );
    if (!container || !active) return;
    container.scrollTo({
      left: active.offsetLeft - (container.clientWidth - active.offsetWidth) / 2,
      behavior: "smooth",
    });
  }, [activeTab]);

  function handleClose(): void {
    if (!covered) onClose();
  }

  return (
    <AppModal
      className="purchase-subscription-modal"
      visible={open}
      motion
      zIndex={999}
      closeOnEsc={!covered}
      maskClosable={!covered}
      afterClose={() => setActiveTab("all")}
      title={null}
      closable={!covered}
      footer={null}
      width={1000}
      aria-label={t("console.purchasePage.subscriptionModal.title")}
      onCancel={handleClose}
    >
      <div className="purchase-subscription-modal-content" inert={covered}>
        <h2>{t("console.purchasePage.subscriptionModal.title")}</h2>
        <p className="purchase-subscription-modal-subtitle">
          {t("console.purchasePage.subscriptionModal.catalogSubtitle")}
        </p>
        {loading || error || !plans.length ? <PurchaseCatalogState loading={loading} error={error} onRetry={onRetry} /> : <>
        <div
          className="purchase-subscription-tabs"
          ref={tabsRef}
          role="tablist"
          aria-label={t("console.purchasePage.tabs.all")}
          style={
            {
              "--purchase-subscription-tab-index": tabs.indexOf(activeTab),
              "--purchase-subscription-tab-count": tabs.length,
            } as CSSProperties
          }
        >
          {tabs.map((tab) => (
            <button
              className={activeTab === tab ? "is-active" : ""}
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "all"
                ? t("console.purchasePage.subscriptionModal.all", {
                    count: plans.length,
                  })
                : tab}
            </button>
          ))}
        </div>
        <div
          className={`purchase-subscription-plans purchase-subscription-plans--${cards.length}`}
          key={activeTab}
        >
          {cards.map((plan) => (
            <SubscriptionPlanCard key={plan.id} plan={plan} index={plans.indexOf(plan)} onSelect={onPlanSelect} />
          ))}
        </div>
        </>}
      </div>
    </AppModal>
  );
}
