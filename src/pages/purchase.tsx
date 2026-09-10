import { useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import miniMaxBackground from "@/assets/figma-combo/minimax.png";
import deepSeekBackground from "@/assets/figma-combo/ds.png";
import seedanceBackground from "@/assets/figma-combo/seedance.png";
import kimiBackground from "@/assets/figma-combo/kimi.png";
import glmBackground from "@/assets/figma-combo/GLM.png";
import "./purchase.css";

type PlanKey = "miniMax" | "deepSeek" | "seedance" | "kimi" | "glm";
type TabKey = "all" | PlanKey;

const PLAN_KEYS: PlanKey[] = ["miniMax", "deepSeek", "seedance", "kimi", "glm"];
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

function ActivityTicker() {
  const { t } = useTranslation();
  return (
    <div
      className="purchase-activity"
      aria-label={t("console.purchasePage.activity.plan")}
    >
      {[0, 1].map((item) => (
        <div className="purchase-activity-item" key={item}>
          <span className="purchase-activity-dot" aria-hidden="true" />
          <strong>{t("console.purchasePage.activity.user")}</strong>
          <span className="purchase-activity-plan">
            {renderEmphasizedLine(
              t("console.purchasePage.activity.plan"),
              [t("console.purchasePage.activity.highlight")],
              false,
            )}
          </span>
          <span className="purchase-activity-separator" aria-hidden="true" />
          <em>{t("console.purchasePage.activity.time")}</em>
        </div>
      ))}
    </div>
  );
}

function PlanCard({ planKey }: { planKey: PlanKey }) {
  const { t } = useTranslation();
  const features = listTranslation(
    t,
    `console.purchasePage.plans.${planKey}.features`,
  );
  const badgeText = String(t("console.purchasePage.firstPurchase")).trim();
  return (
    <article
      className={`purchase-plan-card purchase-plan-card--${planKey}`}
      style={{
        background: `url(${BACKGROUNDS[planKey]}) center / cover no-repeat`,
      }}
    >
      {badgeText ? (
        <span className="purchase-plan-badge">{badgeText}</span>
      ) : null}
      <div className="purchase-plan-content">
        <h3>{t(`console.purchasePage.plans.${planKey}.name`)}</h3>
        <strong>{t(`console.purchasePage.plans.${planKey}.model`)}</strong>
        <div className="purchase-plan-info">
          <span className="purchase-plan-quota">
            {t(`console.purchasePage.plans.${planKey}.quota`)}
          </span>
          <ul>
            {features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </div>
      </div>
      <button
        className="purchase-plan-price"
        type="button"
        aria-label={`${t(`console.purchasePage.plans.${planKey}.name`)} ${t(`console.purchasePage.plans.${planKey}.price`)}`}
      >
        {t(`console.purchasePage.plans.${planKey}.price`)}
      </button>
    </article>
  );
}

function PlanSection() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const tabs: TabKey[] = ["all", ...PLAN_KEYS];
  const cards = useMemo(
    () => (activeTab === "all" ? PLAN_KEYS : [activeTab]),
    [activeTab],
  );
  return (
    <section
      className="purchase-plans"
      aria-label={t("console.purchasePage.tabs.all")}
    >
      <div
        className="purchase-plan-tabs"
        role="tablist"
        style={
          {
            "--purchase-tab-index": tabs.indexOf(activeTab),
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
              ? `${t("console.purchasePage.tabs.all")} ${PLAN_KEYS.length}`
              : t(`console.purchasePage.tabs.${tab}`)}
          </button>
        ))}
      </div>
      <div
        className={`purchase-plan-grid purchase-plan-grid--${cards.length}`}
        key={activeTab}
      >
        {cards.map((planKey) => (
          <PlanCard key={planKey} planKey={planKey} />
        ))}
      </div>
    </section>
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

export function PurchasePage() {
  const { t } = useTranslation();
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
          <ActivityTicker />
        </header>
        <PlanSection />
        <PurchaseNotice />
        <SupportedTools />
        <FrequentlyAskedQuestions />
      </div>
    </>
  );
}
