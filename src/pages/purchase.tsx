import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { isUserProductPlan, type ProductPlanSummary } from "@/api/product-plans";
import { usePurchaseCatalog } from "@/components/use-purchase-catalog";
import ActivityTicker from "@/components/activity-ticker";
import PurchasePlanSection from "@/components/purchase-plan-section";
import { PurchasePaymentModal } from "@/components/purchase-payment-modal";
import { useAppStore } from "@/data/app-state";
import { invalidateAuth } from "@/store/auth-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import claudeCodeLogo from "@/assets/svg/Claudecode.svg";
import geminiLogo from "@/assets/svg/gemini.svg";
import openAiLogo from "@/assets/svg/OpenAl.svg";
import qwenLogo from "@/assets/svg/qwen.svg";
import cursorLogo from "@/assets/ai-tools/cursor.svg";
import githubCopilotLogo from "@/assets/ai-tools/github-copilot.svg";
import openCodeLogo from "@/assets/ai-tools/opencode.svg";
import windsurfLogo from "@/assets/ai-tools/windsurf.svg";
import clineLogo from "@/assets/ai-tools/cline.svg";
import rooCodeLogo from "@/assets/ai-tools/roo-code.svg";
import traeLogo from "@/assets/ai-tools/trae.svg";
import workBuddyLogo from "@/assets/ai-tools/workbuddy.svg";
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

// 品牌名称保持官方写法，图标使用本地资源，避免页面依赖外部图片服务。
const SUPPORTED_TOOLS = [
  { name: "WorkBuddy", logo: workBuddyLogo },
  { name: "Claude Code", logo: claudeCodeLogo },
  { name: "Cursor", logo: cursorLogo },
  { name: "OpenAI Codex", logo: openAiLogo },
  { name: "GitHub Copilot", logo: githubCopilotLogo },
  { name: "Windsurf", logo: windsurfLogo },
  { name: "Gemini CLI", logo: geminiLogo },
  { name: "Qwen Code", logo: qwenLogo },
  { name: "Cline", logo: clineLogo },
  { name: "Roo Code", logo: rooCodeLogo },
  { name: "OpenCode", logo: openCodeLogo },
  { name: "TRAE", logo: traeLogo },
];

function SupportedTools() {
  const { t } = useTranslation();
  return (
    <section className="purchase-tools">
      <SectionHeading
        title={t("console.purchasePage.tools.title")}
        subtitle={t("console.purchasePage.tools.subtitle")}
      />
      <div className="purchase-tool-grid">
        {SUPPORTED_TOOLS.map((tool) => (
          <div className="purchase-tool-card" key={tool.name}>
            <span className="purchase-tool-logo-wrap">
              <img className="purchase-tool-logo" src={tool.logo} alt="" />
            </span>
            <span className="purchase-tool-name">{tool.name}</span>
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
  const auth = useAppSelector(state => state.auth);
  const userKey = auth.status === "authenticated" && auth.user ? `${auth.user.id}:${auth.loginSequence}` : null;
  const catalog = usePurchaseCatalog(userKey, context);
  const plans = catalog.plans.filter(isUserProductPlan);
  const [selection, setSelection] = useState<{ scope: string; plan: ProductPlanSummary } | null>(null);
  const selectedPlan = selection?.scope === catalog.scope ? selection.plan : null;

  useEffect(() => { setSelection(null); }, [catalog.scope]);

  function selectPlan(plan: ProductPlanSummary) {
    // 新列表已包含完整权益，不再调用已取消的套餐详情接口。
    if (userKey && plan.can_purchase && !catalog.loading && !catalog.error) {
      setSelection({ scope: catalog.scope, plan });
    }
  }

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
          loading={catalog.loading}
          error={catalog.error}
          selectingPlanID={null}
          onRetry={catalog.reload}
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
        onPaid={catalog.reload}
        onAuthFailure={() => {
          dispatch(invalidateAuth());
          navigate("/", { replace: true });
        }}
        planName={selectedPlan?.name ?? ""}
        priceCent={selectedPlan?.price.price_cent}
        validitySeconds={selectedPlan?.price.validity_seconds}
        onClose={() => setSelection(null)}
      />
    </>
  );
}
