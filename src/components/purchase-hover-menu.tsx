import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import headerTrialPill from "@/assets/figma-header/trial-pill.png";
import headerTrialFreeTag from "@/assets/figma-header/trial-free-tag.svg";
import "./purchase-hover-menu.css";

const PLANS = [
  { key: "deepSeek", name: "Deepseek V4 Pro", price: "1.99" },
  { key: "glm", name: "GLM 5.2", price: "1.99" },
  { key: "kimi", name: "Kimi K3", price: "4.99" },
  { key: "seedance", name: "Seedance 2.0", price: "29.9" },
  { key: "miniMax", name: "MiNiMax H3", price: "1.99" },
];

export function PurchaseHoverMenu({ onSelect }: { onSelect: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const suppressFocus = useRef(false);
  const id = useId();
  const copy = "console.purchasePage.hoverMenu";

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  function selectPlan() {
    // 弹窗关闭后焦点会回到入口，避免因此再次展开下拉框。
    suppressFocus.current = true;
    setOpen(false);
    trigger.current?.focus();
    onSelect();
  }

  return (
    <div
      ref={root}
      className="header-trial-entry"
      onMouseEnter={() => {
        suppressFocus.current = false;
        setOpen(true);
      }}
      onMouseLeave={() => setOpen(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          suppressFocus.current = true;
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className="header-trial-badge"
        type="button"
        aria-label={t("console.common.subscription")}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onFocus={() => {
          if (!suppressFocus.current) setOpen(true);
        }}
        onClick={() => setOpen(true)}
      >
        <img
          className="header-trial-pill"
          src={headerTrialPill}
          alt=""
          aria-hidden="true"
        />
        <span className="header-trial-glass" aria-hidden="true" />
        <strong>{t("console.common.trial")}</strong>
        <span className="header-trial-subscription" aria-hidden="true">
          {t("console.common.subscription")}
        </span>
        <span className="header-trial-free">
          <img src={headerTrialFreeTag} alt="" aria-hidden="true" />
          <em>{t("console.models.free")}</em>
        </span>
      </button>
      {open && (
        <div className="purchase-hover-bridge" id={id}>
          <div
            className="purchase-hover-panel"
            role="group"
            aria-label={t(`${copy}.label`)}
          >
            {PLANS.map((plan) => (
              <button
                className={`purchase-hover-card purchase-hover-card--${plan.key}`}
                type="button"
                key={plan.key}
                onClick={selectPlan}
              >
                <strong>{plan.name}</strong>
                <span className="purchase-hover-badge">
                  {t(`${copy}.limited`)}
                </span>
                <span className="purchase-hover-price">
                  ¥ {plan.price} <span>/ {t(`${copy}.quota`)}</span>
                </span>
                {plan.key === "seedance" && (
                  <small>{t(`${copy}.videoRate`)}</small>
                )}
              </button>
            ))}
            <button
              className="purchase-hover-card purchase-hover-card--enterprise"
              type="button"
              onClick={selectPlan}
            >
              <strong>{t(`${copy}.enterprise`)}</strong>
              <span className="purchase-hover-contact">
                {t(`${copy}.contact`)}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
