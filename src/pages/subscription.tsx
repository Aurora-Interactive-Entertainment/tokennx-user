import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@douyinfe/semi-ui/lib/es/button";
import Toast from "@douyinfe/semi-ui/lib/es/toast";
import { IconTick, IconTickCircle } from "@douyinfe/semi-icons";
import Modal from "@/components/app-modal";
import {
  getBillingErrorMessage,
  getBillingRequestId,
  getBillingSummary,
  type BillingSummaryResponse,
} from "@/api/billing";
import { getProductPlans, type ProductPlanSummary } from "@/api/product-plans";
import { isAuthenticationFailure } from "@/api/http";
import { PageTitle, SectionHeading } from "@/components/common";
import { useAppStore } from "@/data/app-state";
import { invalidateAuth } from "@/store/auth-slice";
import { useAppDispatch } from "@/store/hooks";
import { useNavigate } from "react-router";
import { billingContextForWorkspace } from "./billing";
import i18n from "@/i18n";
import "@/subscription.css";

type SubscriptionPlan = {
  id?: string;
  code?: string;
  name: string;
  quota: string;
  price: string;
  value?: string;
  description: string;
  features: string[];
  tone: "free" | "starter" | "max" | "ultra";
  current?: boolean;
};

type SubscriptionModel = {
  name: string;
};

type SubscriptionModelSource = {
  name?: string;
  model_name?: string;
  model?: { name?: string };
};

type SubscriptionSummaryWithModels = BillingSummaryResponse & {
  subscription_models?: SubscriptionModelSource[];
  subscriptions?: SubscriptionModelSource[];
};

// 中文：当前接口尚未统一返回订阅模型字段，保留演示模型作为接口为空时的展示兜底。
const DEFAULT_SUBSCRIPTION_MODELS: SubscriptionModel[] = [{ name: "DeepSeek-V4 Flash" }];

function fallbackPlanData(t: (key: string) => string): SubscriptionPlan[] {
  const base = "console.subscriptionPage.fallback";
  return [
    {
      name: t(`${base}.free.name`),
      quota: t(`${base}.free.quota`),
      price: "$0",
      description: t(`${base}.free.description`),
      features: ["models", "studio", "chats", "api"].map((key) => t(`${base}.free.features.${key}`)),
      tone: "free",
      current: true,
    },
    {
      name: t(`${base}.starter.name`),
      quota: t(`${base}.starter.quota`),
      price: t(`${base}.starter.price`),
      value: t(`${base}.starter.value`),
      description: t(`${base}.starter.description`),
      features: ["models", "reset", "api", "support"].map((key) => t(`${base}.starter.features.${key}`)),
      tone: "starter",
    },
    {
      name: t(`${base}.max.name`),
      quota: t(`${base}.max.quota`),
      price: t(`${base}.max.price`),
      value: t(`${base}.max.value`),
      description: t(`${base}.max.description`),
      features: ["included", "limits", "reset", "support"].map((key) => t(`${base}.max.features.${key}`)),
      tone: "max",
    },
    {
      name: t(`${base}.ultra.name`),
      quota: t(`${base}.ultra.quota`),
      price: t(`${base}.ultra.price`),
      value: t(`${base}.ultra.value`),
      description: t(`${base}.ultra.description`),
      features: ["included", "limits", "reset", "support"].map((key) => t(`${base}.ultra.features.${key}`)),
      tone: "ultra",
    },
  ];
}

const PLAN_TONES: SubscriptionPlan["tone"][] = ["starter", "max", "ultra"];

function formatPlanValidity(seconds: number | undefined, language: string): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "";
  const days = Math.round(seconds / 86400);
  if (language.startsWith("zh")) return `${days} 天有效期`;
  return `${days} days validity`;
}

function planTone(plan: ProductPlanSummary, index: number): SubscriptionPlan["tone"] {
  const identity = `${plan.code} ${plan.name} ${plan.display_name}`.toLowerCase();
  if (identity.includes("ultra") || identity.includes("旗舰")) return "ultra";
  if (identity.includes("max") || identity.includes("高级")) return "max";
  if (identity.includes("starter") || identity.includes("入门")) return "starter";
  return PLAN_TONES[index % PLAN_TONES.length] ?? "starter";
}

function mapProductPlan(plan: ProductPlanSummary, index: number, language: string): SubscriptionPlan {
  const priceCent = Number(plan.price?.price_cent);
  const isFree = Number.isFinite(priceCent) && priceCent === 0;
  const priceYuan = Number.isFinite(priceCent) ? priceCent / 100 : 0;
  const validity = formatPlanValidity(plan.price?.validity_seconds, language);
  const parsedModelCount = Number(plan.model_count);
  const modelCount = Number.isFinite(parsedModelCount) ? parsedModelCount : 0;
  const featurePrefix = language.startsWith("zh") ? "活动模型" : "Active models";
  const typeFeature = plan.type === "discount_bundle"
    ? (language.startsWith("zh") ? "折扣套餐" : "Discount bundle")
    : (language.startsWith("zh") ? "额度套餐" : "Quota bundle");
  return {
    id: plan.id,
    code: plan.code,
    name: plan.display_name?.trim() || plan.name?.trim() || plan.code,
    quota: modelCount > 0 ? `${featurePrefix}: ${modelCount}` : typeFeature,
    price: isFree ? "$0" : `¥${priceYuan.toFixed(2)}`,
    description: plan.description?.trim() || typeFeature,
    features: [
      modelCount > 0 ? `${featurePrefix}: ${modelCount}` : typeFeature,
      ...(validity ? [validity] : []),
    ],
    tone: isFree ? "free" : planTone(plan, index),
    current: isFree,
  };
}

function mergeProductPlans(items: ProductPlanSummary[], language: string, fallback: SubscriptionPlan[]): SubscriptionPlan[] {
  const mapped = items.map((plan, index) => mapProductPlan(plan, index, language));
  if (mapped.some((plan) => plan.current)) return mapped;
  return [fallback[0], ...mapped];
}

function SubscriptionModelCard({ model, hint }: { model: SubscriptionModel; hint: string }) {
  const { t } = useTranslation();
  return (
    <article className="subscription-model-card">
      <h3>{model.name}</h3>
      <p>{hint}</p>
      <div className="subscription-progress" aria-hidden="true"><span /></div>
      <small>{t("console.subscriptionPage.usagePercent", { percent: "0.00" })}</small>
    </article>
  );
}

function PlanCard({ plan, onSelect }: { plan: SubscriptionPlan; onSelect: (plan: SubscriptionPlan) => void }) {
  const { t } = useTranslation();
  return (
    <article className={`subscription-plan-card subscription-plan-card--${plan.tone}`}>
      <div className="subscription-plan-heading">
        <div>
          <h3>{plan.name}</h3>
          <span>{plan.quota}</span>
        </div>
        {plan.current ? <span className="subscription-current-badge">{t("console.subscriptionPage.current")}</span> : null}
      </div>
      <div className="subscription-plan-price">
        <strong>{plan.price}</strong><span>{t("console.subscriptionPage.perMonth")}</span>
        {plan.value ? <small>{t("console.subscriptionPage.value", { value: plan.value })}</small> : null}
      </div>
      <p className="subscription-plan-description">{plan.description}</p>
      <Button
        className="subscription-plan-action"
        theme={plan.current ? "light" : "solid"}
        type={plan.current ? "tertiary" : "primary"}
        disabled={plan.current}
        onClick={() => onSelect(plan)}
      >
        {plan.current ? t("console.subscriptionPage.currentPlan") : t("console.subscriptionPage.getPlan", { name: plan.name })}
      </Button>
      <div className="subscription-plan-features">
        <span>{t("console.subscriptionPage.includes")}</span>
        <ul>
          {plan.features.map((feature) => <li key={feature}><IconTickCircle aria-hidden="true" />{feature}</li>)}
        </ul>
      </div>
    </article>
  );
}

function UpgradePlanModal({
  open,
  plans,
  selectedPlan,
  onSelect,
  onClose,
  onConfirm,
}: {
  open: boolean;
  plans: SubscriptionPlan[];
  selectedPlan: SubscriptionPlan;
  onSelect: (plan: SubscriptionPlan) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  // 中文：当前免费计划不属于升级目标，只展示三个可购买套餐。
  const upgradePlans = plans.filter((plan) => !plan.current);
  return (
    <Modal
      visible={open}
      title={t("console.subscriptionPage.upgradePlan")}
      onCancel={onClose}
      onOk={onConfirm}
      okText={t("console.subscriptionPage.upgrade")}
      cancelText={t("console.common.cancel")}
      width="520px"
      className="subscription-upgrade-modal"
    >
      <div className="subscription-upgrade-options" role="radiogroup" aria-label={t("console.subscriptionPage.planOptions")}>
        {upgradePlans.map((plan) => {
          const selected = selectedPlan.name === plan.name;
          return (
            <button
              key={plan.name}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`subscription-upgrade-option${selected ? " is-selected" : ""}`}
              onClick={() => onSelect(plan)}
            >
              <span className="subscription-upgrade-option__top">
                <span>
                  <strong>{plan.name}</strong>
                  <small>{plan.quota}</small>
                </span>
                <span className="subscription-upgrade-check" aria-hidden="true">
                  {selected ? <IconTick /> : null}
                </span>
              </span>
              <span className="subscription-upgrade-option__divider" />
              <span className="subscription-upgrade-option__price">{plan.price} <small>{t("console.subscriptionPage.perMonth")}</small></span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

export function SubscriptionPage() {
  const { t } = useTranslation();
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const activeWorkspace = store.activeWorkspace;
  const context = useMemo(() => activeWorkspace ? billingContextForWorkspace(activeWorkspace) : null, [activeWorkspace?.id, activeWorkspace?.type]);
  const fallbackPlans = useMemo(() => fallbackPlanData(t), [t]);
  const [summary, setSummary] = useState<BillingSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>(() => fallbackPlanData((key) => i18n.t(key)));
  const [usingFallbackPlans, setUsingFallbackPlans] = useState(true);
  const [plansLoading, setPlansLoading] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [selectedUpgradePlan, setSelectedUpgradePlan] = useState<SubscriptionPlan>(() => fallbackPlanData((key) => i18n.t(key))[1]);
  const subscribedModels = useMemo<SubscriptionModel[]>(() => {
    const payload = summary as SubscriptionSummaryWithModels | null;
    const source = payload?.subscription_models ?? payload?.subscriptions;
    if (!Array.isArray(source)) return DEFAULT_SUBSCRIPTION_MODELS;
    const models = source.map((item) => ({
      name: item.model_name?.trim() || item.name?.trim() || item.model?.name?.trim() || "",
    })).filter((item) => item.name);
    return models.length > 0 ? models : DEFAULT_SUBSCRIPTION_MODELS;
  }, [summary]);

  // 中文：订阅页沿用账务 summary，保证个人空间和企业空间展示同一套余额上下文。
  const loadSummary = useCallback(() => {
    if (!context) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setRequestId(null);
    void getBillingSummary(context, { signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return;
      setSummary(data);
      setLoading(false);
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      if (isAuthenticationFailure(reason)) {
        dispatch(invalidateAuth());
        navigate("/", { replace: true });
        return;
      }
      setError(getBillingErrorMessage(reason));
      setRequestId(getBillingRequestId(reason));
      setLoading(false);
    });
    return () => controller.abort();
  }, [context, dispatch, navigate]);

  useEffect(() => loadSummary(), [loadSummary]);

  const loadPlans = useCallback(() => {
    if (!context) return;
    const controller = new AbortController();
    setPlansLoading(true);
    void getProductPlans(context, { page: 1, page_size: 100, signal: controller.signal }).then((response) => {
      if (controller.signal.aborted) return;
      const items = Array.isArray(response?.items) ? response.items : [];
      if (items.length > 0) {
        setUsingFallbackPlans(false);
        setPlans(mergeProductPlans(items, i18n.language, fallbackPlans));
      } else {
        setUsingFallbackPlans(true);
        setPlans(fallbackPlans);
      }
      setPlansLoading(false);
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      // 中文：套餐列表失败时保留本地兜底卡片，避免订阅页因辅助接口异常无法使用。
      setUsingFallbackPlans(true);
      setPlans(fallbackPlans);
      setPlansLoading(false);
      if (isAuthenticationFailure(reason)) {
        dispatch(invalidateAuth());
        navigate("/", { replace: true });
      }
    });
    return () => controller.abort();
  }, [context, dispatch, fallbackPlans, navigate]);

  useEffect(() => loadPlans(), [loadPlans]);

  useEffect(() => {
    if (!usingFallbackPlans) return;
    setPlans(fallbackPlans);
    setSelectedUpgradePlan(fallbackPlans[1]);
  }, [fallbackPlans, usingFallbackPlans]);

  function selectPlan(plan: SubscriptionPlan) {
    Toast.info(t("console.subscriptionPage.demoAction", { name: plan.name }));
  }

  function openUpgradeModal() {
    setSelectedUpgradePlan(plans.find((plan) => !plan.current) ?? fallbackPlans[1]);
    setUpgradeOpen(true);
  }

  function confirmUpgrade() {
    selectPlan(selectedUpgradePlan);
    setUpgradeOpen(false);
  }

  return (
    <div className="page-stack subscription-page">
      <PageTitle
        title={t("console.subscriptionPage.title")}
      />
      {error ? <div className="subscription-error" role="alert"><span>{error}</span>{requestId ? <small>{t("console.common.requestIdValue", { requestId })}</small> : null}</div> : null}
      <section className="subscription-overview" aria-label={t("console.subscriptionPage.currentSection")}>
        <SectionHeading title={t("console.subscriptionPage.currentSection")} />
        <div className="subscription-overview-grid">
          <article className="subscription-current-card">
            <div className="subscription-current-card__title">
              <span>{t("console.subscriptionPage.currentPlan")}</span>
              <Button className="subscription-current-upgrade" size="small" theme="solid" type="primary" onClick={openUpgradeModal}>
                {t("console.subscriptionPage.upgrade")}
              </Button>
            </div>
            <h3>{t("console.subscriptionPage.fallback.free.name")} <small>{t("console.subscriptionPage.fallback.free.badge")}</small></h3>
            <p>{t("console.subscriptionPage.fallback.free.quota")}</p>
            <div className="subscription-card-divider" />
            <p className="subscription-current-hint">{t("console.subscriptionPage.freeHint")}</p>
          </article>
          {subscribedModels.map((model) => <SubscriptionModelCard key={model.name} model={model} hint={t("console.subscriptionPage.windowHint")} />)}
        </div>
      </section>
      <section className="subscription-plans-section" aria-label={t("console.subscriptionPage.plansHeading")}>
        <SectionHeading title={t("console.subscriptionPage.plansHeading")} />
        <div className="subscription-plan-grid" data-plan-count={Math.min(plans.length, 4)} aria-busy={plansLoading}>{plans.map((plan) => <PlanCard key={plan.id ?? plan.code ?? plan.name} plan={plan} onSelect={selectPlan} />)}</div>
      </section>
      <UpgradePlanModal plans={plans} open={upgradeOpen} selectedPlan={selectedUpgradePlan} onSelect={setSelectedUpgradePlan} onClose={() => setUpgradeOpen(false)} onConfirm={confirmUpgrade} />
    </div>
  );
}

export default SubscriptionPage;
