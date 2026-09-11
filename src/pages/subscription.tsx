import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@douyinfe/semi-ui/lib/es/button";
import {
  getBillingErrorMessage,
  getBillingRequestId,
  getBillingSummary,
  type BillingSummaryResponse,
} from "@/api/billing";
import { isAuthenticationFailure } from "@/api/http";
import { PageTitle } from "@/components/common";
import { appToast } from "@/components/app-toast";
import { useAppStore } from "@/data/app-state";
import { invalidateAuth } from "@/store/auth-slice";
import { useAppDispatch } from "@/store/hooks";
import { useNavigate } from "react-router";
import { billingContextForWorkspace } from "./billing";
import "@/subscription.css";
import { SubscriptionUsageCard, type SubscriptionUsage } from '@/components/subscription-usage-card';

type SubscriptionModel = SubscriptionUsage;

type SubscriptionModelSource = Partial<SubscriptionUsage> & {
  name?: string;
  model_name?: string;
  model?: { name?: string };
};

type SubscriptionSummaryWithModels = BillingSummaryResponse & {
  subscription_models?: SubscriptionModelSource[];
  subscriptions?: SubscriptionModelSource[];
};


export function SubscriptionPage() {
  const { t } = useTranslation();
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const activeWorkspace = store.activeWorkspace;
  const context = useMemo(() => activeWorkspace ? billingContextForWorkspace(activeWorkspace) : null, [activeWorkspace?.id, activeWorkspace?.type]);
  const [summary, setSummary] = useState<BillingSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const subscribedModels = useMemo<SubscriptionModel[]>(() => {
    const payload = summary as SubscriptionSummaryWithModels | null;
    const source = payload?.subscription_models ?? payload?.subscriptions;
    if (!Array.isArray(source)) return [];
    const models = source.map((item) => ({
      ...item,
      name: item.model_name?.trim() || item.name?.trim() || item.model?.name?.trim() || "",
    })).filter((item) => item.name);
    return models;
  }, [summary]);

  // 订阅页沿用账务 summary，保证个人空间和企业空间展示同一套余额上下文。
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

  useEffect(() => {
    if (!error) return;
    appToast.error(error);
  }, [error]);

  return (
    <div className="page-stack subscription-page">
      <PageTitle
        title={t("console.subscriptionPage.title")}
      />
      {loading ? null : subscribedModels.length > 0 ? (
        <div className="subscription-overview-grid subscription-models-only" aria-label={t("console.subscriptionPage.currentSection")}>
          {subscribedModels.map((model, index) => <SubscriptionUsageCard key={`${model.name}-${index}`} model={model} />)}
        </div>
      ) : (
        <div className="subscription-empty-state">
          <p>{t("console.subscriptionPage.empty")}</p>
          <Button theme="solid" type="primary" onClick={() => navigate("/console/purchase")}>
            {t("console.subscriptionPage.purchasePlan")}
          </Button>
        </div>
      )}
    </div>
  );
}

export default SubscriptionPage;
