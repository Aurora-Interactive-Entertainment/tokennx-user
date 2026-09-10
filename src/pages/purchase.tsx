import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { getBillingErrorMessage } from "@/api/billing";
import { isAuthenticationFailure } from "@/api/http";
import { getProductPlanDetail, getProductPlans, type ProductPlanDetail, type ProductPlanSummary } from "@/api/product-plans";
import ActivityTicker from "@/components/activity-ticker";
import { appToast } from "@/components/app-toast";
import PurchasePlanSection from "@/components/purchase-plan-section";
import { PurchasePaymentModal } from "@/components/purchase-payment-modal";
import { useAppStore } from "@/data/app-state";
import { invalidateAuth } from "@/store/auth-slice";
import { useAppDispatch } from "@/store/hooks";
import { billingContextForWorkspace } from "./billing";
import "./purchase.css";

function listTranslation(
  t: (key: string, options?: Record<string, unknown>) => unknown,
  key: string,
) {
  const value = t(key, { returnObjects: true });
  return Array.isArray(value) ? value.map(String) : [];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 购买须知的强调词由翻译资源提供，保证中英文文案保持相同的视觉层级。
function renderEmphasizedLine(
  line: string,
  emphasis: string[],
  linkBilling: boolean,
  billingLabel?: string,
) {
  const terms = Array.from(
    new Set(
      [
        ...emphasis,
        ...(linkBilling && billingLabel ? [billingLabel] : []),
      ].filter(Boolean),
    ),
  ).sort((left, right) => right.length - left.length);
  if (terms.length === 0) return line;

  const matcher = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "g");
  return line.split(matcher).map((segment, index) => {
    if (!terms.includes(segment)) return segment;
    if (linkBilling && billingLabel === segment) {
      return (
        <Link
          className="purchase-emphasis"
          key={`${segment}-${index}`}
          to="/console/billing"
        >
          {segment}
        </Link>
      );
    }
    return (
      <strong className="purchase-emphasis" key={`${segment}-${index}`}>
        {segment}
      </strong>
    );
  });
}

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="purchase-section-heading">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

export type PurchaseActivityMessage = { user: string; plan: string; highlight?: string; time: string };

function PurchaseActivityTicker({ messages }: { messages?: PurchaseActivityMessage[] }) {
  const { t } = useTranslation();
  // 保留现有演示内容；传入空数组时直接隐藏，后续可由接口消息列表驱动。
  const items = messages ?? Array.from({ length: 2 }, () => ({
    user: t("console.purchasePage.activity.user"),
    plan: t("console.purchasePage.activity.plan"),
    highlight: t("console.purchasePage.activity.highlight"),
    time: t("console.purchasePage.activity.time"),
  }));
  return (
    <ActivityTicker label={t("console.purchasePage.activity.plan")} messages={items.map((item, index) => (
          <span className="purchase-activity-message" key={index}>
            <span className="purchase-activity-dot" aria-hidden="true" />
            <strong>{item.user}</strong>
            <span className="purchase-activity-plan">
              {renderEmphasizedLine(
                item.plan,
                [item.highlight ?? ""],
                false,
              )}
            </span>
            <span className="purchase-activity-separator" aria-hidden="true" />
            <em>{item.time}</em>
          </span>
        ))} />
  );
}

function NoticeRow({
  title,
  lines,
  linkBilling,
  billingLabel,
  lineEmphasis,
}: {
  title: string;
  lines: string[];
  linkBilling?: boolean;
  billingLabel?: string;
  lineEmphasis?: string[][];
}) {
  return (
    <div className="purchase-notice-row">
      <h3>
        <span aria-hidden="true" />
        {title}
      </h3>
      <div className="purchase-notice-copy">
        {lines.map((line, index) => (
          <p key={line}>
            {renderEmphasizedLine(
              line,
              lineEmphasis?.[index] ?? [],
              Boolean(linkBilling && index === 0),
              billingLabel,
            )}
          </p>
        ))}
      </div>
    </div>
  );
}

function PurchaseNotice() {
  const { t } = useTranslation();
  return (
    <section className="purchase-notice">
      <SectionHeading
        title={t("console.purchasePage.notice.title")}
        subtitle={t("console.purchasePage.notice.subtitle")}
      />
      <div className="purchase-notice-panel">
        <NoticeRow
          title={t("console.purchasePage.notice.billingTitle")}
          lines={listTranslation(t, "console.purchasePage.notice.billing")}
          linkBilling
          billingLabel={t("console.purchasePage.notice.billingLink")}
          lineEmphasis={[
            [t("console.purchasePage.notice.emphasis.billingUsage")],
            [],
            [],
          ]}
        />
        <NoticeRow
          title={t("console.purchasePage.notice.activityTitle")}
          lines={listTranslation(t, "console.purchasePage.notice.activity")}
          lineEmphasis={[
            [
              t("console.purchasePage.notice.emphasis.activityLaunch"),
              t("console.purchasePage.notice.emphasis.activityBonus"),
            ],
            [],
          ]}
        />
        <NoticeRow
          title={t("console.purchasePage.notice.agreementTitle")}
          lines={listTranslation(t, "console.purchasePage.notice.agreement")}
          lineEmphasis={[
            [
              t("console.purchasePage.notice.emphasis.agreementService"),
              t("console.purchasePage.notice.emphasis.agreementPrivacy"),
            ],
            [t("console.purchasePage.notice.emphasis.supportEmail")],
          ]}
        />
      </div>
    </section>
  );
}

function SupportedTools() {
  const { t } = useTranslation();
  return (
    <section className="purchase-tools">
      <SectionHeading
        title={t("console.purchasePage.tools.title")}
        subtitle={t("console.purchasePage.tools.subtitle")}
      />
      <div className="purchase-tool-grid">
        {Array.from({ length: 12 }, (_, index) => (
          <div className="purchase-tool-card" key={index}>
            <span aria-hidden="true">OC</span>
            {t("console.purchasePage.tools.name")}
          </div>
        ))}
      </div>
    </section>
  );
}

function FrequentlyAskedQuestions() {
  const { t } = useTranslation();
  const questions = listTranslation(t, "console.purchasePage.faq.questions");
  const answers = listTranslation(t, "console.purchasePage.faq.answers");
  const [openIndex, setOpenIndex] = useState(0);
  return (
    <section className="purchase-faq">
      <SectionHeading
        title={t("console.purchasePage.faq.title")}
        subtitle={t("console.purchasePage.faq.subtitle")}
      />
      <div className="purchase-faq-panel">
        {questions.map((question, index) => {
          const isOpen = openIndex === index;
          return (
            <div
              className={`purchase-faq-item${isOpen ? " is-open" : ""}`}
              key={question}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenIndex(isOpen ? -1 : index)}
              >
                <span>{question}</span>
                <i aria-hidden="true" />
              </button>
              <div className="purchase-faq-answer" aria-hidden={!isOpen}>
                <div className="purchase-faq-answer-inner">
                  <p>{answers[index]}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function PurchasePage({ activityMessages }: { activityMessages?: PurchaseActivityMessage[] } = {}) {
  const { t } = useTranslation();
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const context = useMemo(
    () => billingContextForWorkspace(store.activeWorkspace),
    [store.activeWorkspace.id, store.activeWorkspace.type],
  );
  const [plans, setPlans] = useState<ProductPlanSummary[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState("");
  const [retryToken, setRetryToken] = useState(0);
  const [selectingPlanID, setSelectingPlanID] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<ProductPlanDetail | null>(null);
  const selectionRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    setSelectedPlan(null);
    setSelectingPlanID(null);
    return () => selectionRequest.current?.abort();
  }, [context]);

  useEffect(() => {
    const controller = new AbortController();
    setPlansLoading(true);
    setPlansError("");
    void getProductPlans(context, { page: 1, page_size: 100, signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        const items = Array.isArray(response?.items) ? response.items : [];
        setPlans([...items].sort((left, right) =>
          left.group_sort_order - right.group_sort_order || left.name.localeCompare(right.name),
        ));
        setPlansLoading(false);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        if (isAuthenticationFailure(reason)) {
          dispatch(invalidateAuth());
          navigate("/", { replace: true });
          return;
        }
        setPlans([]);
        setPlansError(getBillingErrorMessage(reason));
        setPlansLoading(false);
      });
    return () => controller.abort();
  }, [context, dispatch, navigate, retryToken]);

  const selectPlan = useCallback((plan: ProductPlanSummary) => {
    if (!plan.can_purchase || selectingPlanID) return;
    const controller = new AbortController();
    selectionRequest.current = controller;
    setSelectingPlanID(plan.id);
    void getProductPlanDetail(context, plan.id, { signal: controller.signal })
      .then((detail) => {
        if (controller.signal.aborted) return;
        if (!detail.can_purchase) {
          // 详情接口是购买前的最终状态，库存或限购变化时同步刷新卡片状态。
          setPlans((current) => current.map((item) => item.id === detail.id
            ? {
              ...item,
              can_purchase: false,
              stock_remaining: detail.stock_remaining,
              purchase_limit: detail.purchase_limit,
              purchased_count: detail.purchased_count,
            }
            : item));
          appToast.warning(t("console.purchasePage.api.unavailable"));
          return;
        }
        setSelectedPlan(detail);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        if (isAuthenticationFailure(reason)) {
          dispatch(invalidateAuth());
          navigate("/", { replace: true });
          return;
        }
        appToast.error(getBillingErrorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setSelectingPlanID(null);
      });
  }, [context, dispatch, navigate, selectingPlanID, t]);

  return (
    <>
      <div className="purchase-page">
        <header className="purchase-hero">
          <h1>
            {t("console.purchasePage.title").replace(
              t("console.purchasePage.titleAccent"),
              "",
            )}
            <span>{t("console.purchasePage.titleAccent")}</span>
          </h1>
          <p>
            {t("console.purchasePage.subtitle")
              .split("\n")
              .map((line, index) => (
                <span key={line}>
                  {renderEmphasizedLine(
                    line,
                    index === 0
                      ? [
                          t("console.purchasePage.subtitleEmphasis.models"),
                          t("console.purchasePage.subtitleEmphasis.quota"),
                        ]
                      : [],
                    false,
                  )}
                </span>
              ))}
          </p>
          <PurchaseActivityTicker messages={activityMessages} />
        </header>
        <PurchasePlanSection
          plans={plans}
          loading={plansLoading}
          error={plansError}
          selectingPlanID={selectingPlanID}
          onRetry={() => setRetryToken((value) => value + 1)}
          onSelect={selectPlan}
        />
        <PurchaseNotice />
        <SupportedTools />
        <FrequentlyAskedQuestions />
      </div>
      <PurchasePaymentModal
        open={selectedPlan !== null}
        context={context}
        planID={selectedPlan?.id}
        onPaid={() => setRetryToken((value) => value + 1)}
        onAuthFailure={() => {
          dispatch(invalidateAuth());
          navigate("/", { replace: true });
        }}
        planName={selectedPlan?.name ?? ""}
        priceCent={selectedPlan?.price.price_cent}
        validitySeconds={selectedPlan?.price.validity_seconds}
        onClose={() => setSelectedPlan(null)}
      />
    </>
  );
}
