import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@douyinfe/semi-ui/lib/es/button";
import {
  getPurchasedProductPlans,
  type PurchasedProductPlan,
} from "@/api/product-plans";
import { getBillingErrorMessage, getBillingRequestId } from "@/api/billing";
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


export function SubscriptionPage() {
  const { t } = useTranslation();
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const activeWorkspace = store.activeWorkspace;
  const context = useMemo(() => activeWorkspace ? billingContextForWorkspace(activeWorkspace) : null, [activeWorkspace?.id, activeWorkspace?.type]);
  const [entitlements, setEntitlements] = useState<PurchasedProductPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const subscribedModels = useMemo<SubscriptionModel[]>(() => entitlements.flatMap((entitlement) =>
    entitlement.models.map((model) => {
      const name = model.model_name?.trim() || entitlement.display_name?.trim() || entitlement.plan_name?.trim() || entitlement.plan_code;
      const isRequestQuota = model.entitlement_mode === "request_quota";
      return {
        name,
        quota_mode: isRequestQuota ? "request_quota" as const : "token_quota" as const,
        total_tokens: model.token_quota_total,
        used_tokens: model.token_quota_used,
        remaining_tokens: model.token_quota_remaining,
        total_requests: model.request_quota_total,
        used_requests: model.request_quota_used,
        remaining_requests: model.request_quota_remaining,
        expires_at: entitlement.expires_at,
      };
    }),
  ).filter((model) => model.name), [entitlements]);

  // 已购权益接口按当前账务主体查询，个人空间和企业空间共用同一套展示逻辑。
  const loadPurchasedPlans = useCallback(() => {
    if (!context) return;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    setError("");
    setRequestId(null);
    void (async () => {
      const items: PurchasedProductPlan[] = [];
      let page = 1;
      while (!controller.signal.aborted) {
        const response = await getPurchasedProductPlans(context, { status: "active", page, page_size: 100, signal: controller.signal });
        if (!Array.isArray(response.items) || !Number.isSafeInteger(response.total) || response.total < 0 || response.page !== page) {
          throw new Error("Invalid purchased product plan list");
        }
        items.push(...response.items);
        if (response.items.length === 0 || items.length >= response.total) break;
        page += 1;
      }
      if (!controller.signal.aborted) {
        setEntitlements(Array.from(new Map(items.map((item) => [item.id, item])).values()));
        setLoading(false);
      }
    })().catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      if (isAuthenticationFailure(reason)) {
        dispatch(invalidateAuth());
        navigate("/", { replace: true });
        return;
      }
      setEntitlements([]);
      setError(getBillingErrorMessage(reason));
      setRequestId(getBillingRequestId(reason));
      setLoading(false);
    });
    return () => {
      controller.abort();
      if (requestController.current === controller) requestController.current = null;
    };
  }, [context, dispatch, navigate]);

  useEffect(() => loadPurchasedPlans(), [loadPurchasedPlans]);

  useEffect(() => {
    if (!error) return;
    appToast.error(error);
  }, [error]);

  return (
    <div className="page-stack subscription-page">
      <PageTitle
        title={t("console.subscriptionPage.title")}
        actions={<Button theme="borderless" onClick={loadPurchasedPlans} loading={loading} aria-label={t("console.subscriptionPage.refresh")}>↻</Button>}
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
