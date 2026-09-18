import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { requestSupportWidget } from "@/components/common";
import headerTrialPill from "@/assets/figma-header/trial-pill.png";
import headerTrialFreeTag from "@/assets/figma-header/trial-free-tag.svg";
import dsv4CardBg from "@/assets/figma-combo/dsv4.png";
import glm5CardBg from "@/assets/figma-combo/GLM5.png";
import kimik3CardBg from "@/assets/figma-combo/kimik3.png";
import seedance2CardBg from "@/assets/figma-combo/seedance2.png";
import minimaxh3CardBg from "@/assets/figma-combo/minimaxh3.png";
import kehuCardBg from "@/assets/figma-combo/kehu.png";
import "./purchase-hover-menu.css";

const PLANS = [
  { key: "deepSeek", name: "Deepseek V4 flash", price: "1.99", tokens: 15_000_000, background: dsv4CardBg, visible: true },
  { key: "glm", name: "GLM 5.3", price: "1.99", tokens: 2_000_000, background: glm5CardBg, visible: true },
  { key: "kimi", name: "Kimi K3", price: "4.99", tokens: 2_000_000, background: kimik3CardBg, visible: true },
  { key: "seedance", name: "Seedance 2.0", price: "29.9", tokens: 1_000_000, background: seedance2CardBg, visible: true },
  // MiniMax 暂无可用数据，后续确认套餐数据后再恢复快捷入口。
  { key: "miniMax", name: "MiNiMax H3", price: "1.99", tokens: 15_000_000, background: minimaxh3CardBg, visible: false },
];

export function PurchaseHoverMenu({ onSelect }: { onSelect: () => void }) {
  const { t, i18n } = useTranslation(); const [open, setOpen] = useState(false); const root = useRef<HTMLDivElement>(null); const trigger = useRef<HTMLButtonElement>(null); const suppressFocus = useRef(false); const id = useId(); const copy = "console.purchasePage.hoverMenu";
  const tokenFormatter = new Intl.NumberFormat(i18n.language, { notation: "compact", maximumFractionDigits: 0 });
  useEffect(() => { if (!open) return; const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener("pointerdown", dismiss); return () => document.removeEventListener("pointerdown", dismiss); }, [open]);
  const selectPlan = () => { suppressFocus.current = true; setOpen(false); trigger.current?.focus(); onSelect(); };
  // 点击头部订阅入口直接打开完整套餐目录，悬停时仍保留快捷套餐菜单。
  const openCatalog = () => { setOpen(false); onSelect(); };
  return <div ref={root} className="header-trial-entry" onMouseEnter={() => { suppressFocus.current = false; setOpen(true); }} onMouseLeave={() => setOpen(false)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); suppressFocus.current = true; setOpen(false); trigger.current?.focus(); } }}>
    <button ref={trigger} className="header-trial-badge" type="button" aria-label={t(`${copy}.orderNow`)} aria-expanded={open} aria-controls={id} onFocus={() => { if (!suppressFocus.current) setOpen(true); }} onClick={openCatalog}><img className="header-trial-pill" src={headerTrialPill} alt="" aria-hidden="true" /><span className="header-trial-glass" aria-hidden="true" /><strong>{t(`${copy}.offer`)}</strong><span className="header-trial-subscription" aria-hidden="true">{t(`${copy}.orderNow`)}</span><span className="header-trial-free"><img src={headerTrialFreeTag} alt="" aria-hidden="true" /><em>{t(`${copy}.limited`)}</em></span></button>
    <div className={`purchase-hover-bridge${open ? " is-open" : ""}`} id={id}><div className="purchase-hover-panel" role="group" aria-label={t(`${copy}.label`)}>{PLANS.filter((plan) => plan.visible).map((plan) => <button className={`purchase-hover-card purchase-hover-card--${plan.key}`} type="button" key={plan.key} style={{ background: `url(${plan.background}) center / cover no-repeat` }} onClick={selectPlan}><strong>{plan.name}</strong><span className="purchase-hover-badge">{t(`${copy}.${plan.key === "seedance" ? "discount" : "limited"}`)}</span><span className="purchase-hover-price">¥ {plan.price} <span>/ {t(`${copy}.quota`, { amount: tokenFormatter.format(plan.tokens) })}</span></span>{plan.key === "seedance" && <small>{t(`${copy}.videoRate`)}</small>}</button>)}<button className="purchase-hover-card purchase-hover-card--enterprise" type="button" style={{ background: `url(${kehuCardBg}) center / cover no-repeat` }} onClick={() => { suppressFocus.current = true; setOpen(false); trigger.current?.focus(); requestSupportWidget("contact"); }}><strong>{t(`${copy}.enterprise`)}</strong><span className="purchase-hover-contact">{t(`${copy}.contact`)}</span></button></div></div>
  </div>;
}
