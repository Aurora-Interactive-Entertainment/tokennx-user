import { useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import AppModal from "@/components/app-modal";
import miniMaxBackground from "@/assets/figma-combo/minimax.png";
import deepSeekBackground from "@/assets/figma-combo/ds.png";
import seedanceBackground from "@/assets/figma-combo/seedance.png";
import kimiBackground from "@/assets/figma-combo/kimi.png";
import glmBackground from "@/assets/figma-combo/GLM.png";
import "./purchase-subscription-modal.css";

type PlanKey = "miniMax" | "deepSeek" | "seedance" | "kimi" | "glm";
type TabKey = "all" | PlanKey;

// 弹窗卡片顺序与 Figma 画板一致，智谱卡片位于 Kimi 卡片之前。
const PLAN_KEYS: PlanKey[] = ["miniMax", "deepSeek", "seedance", "glm", "kimi"];
const TAB_PLAN_KEYS: PlanKey[] = [
  "miniMax",
  "deepSeek",
  "seedance",
  "kimi",
  "glm",
];
const BACKGROUNDS: Record<PlanKey, string> = {
  miniMax: miniMaxBackground,
  deepSeek: deepSeekBackground,
  seedance: seedanceBackground,
  kimi: kimiBackground,
  glm: glmBackground,
};

function listTranslation(
  t: (key: string, options?: Record<string, unknown>) => unknown,
  key: string,
): string[] {
  const value = t(key, { returnObjects: true });
  return Array.isArray(value) ? value.map(String) : [];
}

function SubscriptionPlanCard({ planKey, onSelect }: { planKey: PlanKey; onSelect: (planKey: PlanKey) => void }) {
  const { t } = useTranslation();
  const prefix = `console.purchasePage.plans.${planKey}`;
  const features = listTranslation(t, `${prefix}.features`);
  const name = String(t(`${prefix}.name`));

  return (
    <article
      className={`purchase-subscription-plan purchase-subscription-plan--${planKey}`}
      style={{ backgroundImage: `url(${BACKGROUNDS[planKey]})` }}
    >
      <span className="purchase-subscription-plan-badge">
        {t("console.purchasePage.firstPurchase")}
      </span>
      <div className="purchase-subscription-plan-content">
        <h3>{name}</h3>
        <strong>{t(`${prefix}.model`)}</strong>
        <div className="purchase-subscription-plan-info">
          <span>{t(`${prefix}.quota`)}</span>
          <ul>
            {features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </div>
      </div>
      <button
        className="purchase-subscription-plan-price"
        type="button"
        aria-label={`${name} ${t(`${prefix}.price`)}`}
        onClick={() => onSelect(planKey)}
      >
        {t(`${prefix}.price`)}
      </button>
    </article>
  );
}

export function PurchaseSubscriptionModal({
  open,
  onClose,
  onPlanSelect,
}: {
  open: boolean;
  onClose: () => void;
  onPlanSelect?: (planKey: PlanKey) => void;
}) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const tabs: TabKey[] = ["all", ...TAB_PLAN_KEYS];
  const cards = useMemo(
    () => (activeTab === "all" ? PLAN_KEYS : [activeTab]),
    [activeTab],
  );

  function handleClose(): void {
    setActiveTab("all");
    onClose();
  }

  return (
    <AppModal
      className="purchase-subscription-modal"
      visible={open}
      title={null}
      closable
      footer={null}
      width={1000}
      aria-label={t("console.purchasePage.subscriptionModal.title")}
      onCancel={handleClose}
    >
      <div className="purchase-subscription-modal-content">
        <h2>{t("console.purchasePage.subscriptionModal.title")}</h2>
        <p className="purchase-subscription-modal-subtitle">
          {t("console.purchasePage.subscriptionModal.subtitle")}
        </p>
        <div
          className="purchase-subscription-tabs"
          role="tablist"
          aria-label={t("console.purchasePage.tabs.all")}
          style={
            {
              "--purchase-subscription-tab-index": tabs.indexOf(activeTab),
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
                    count: PLAN_KEYS.length,
                  })
                : t(`console.purchasePage.tabs.${tab}`)}
            </button>
          ))}
        </div>
        <div
          className={`purchase-subscription-plans purchase-subscription-plans--${cards.length}`}
          key={activeTab}
        >
          {cards.map((planKey) => (
            <SubscriptionPlanCard key={planKey} planKey={planKey} onSelect={onPlanSelect ?? (() => undefined)} />
          ))}
        </div>
      </div>
    </AppModal>
  );
}
