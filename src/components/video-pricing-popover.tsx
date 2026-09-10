import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { UserModelPrice } from "@/api/user-models";
import type { ModelRecord } from "@/data/models";
import { formatDecimal, formatNumber } from "@/utils/format";
import { useTranslation } from "react-i18next";
import "./video-pricing-popover.css";

type VideoPricingRow = {
  resolution: string;
  aspectRatio: string;
  duration: string;
  unitPrice: string;
  tokenUsage: string;
  cost: string;
  perSecond: string;
};

type VideoPricingTab = {
  id: string;
  label: string;
  rows: VideoPricingRow[];
};

const DEFAULT_RESOLUTIONS = ["480P", "720P", "1080P"];
// 为弹层保留更明显的左右外边距，并将最大宽度增加 80px。
const POPOVER_VIEWPORT_GUTTER = 80;
const POPOVER_MAX_WIDTH = 980;
const HOVER_SHOW_DELAY = 150;

function normalizeResolution(value: string): string {
  const normalized = value.trim().toUpperCase();
  return normalized.endsWith("P") ? normalized : `${normalized}P`;
}

function priceIdentity(price: UserModelPrice): string {
  return `${price.purpose ?? ""} ${price.meter_kind} ${price.meter_code} ${price.selector_meter_code ?? ""}`.toLowerCase();
}

function isVideoInputPrice(price: UserModelPrice): boolean {
  const identity = priceIdentity(price);
  return (
    identity.includes("input") ||
    identity.includes("reference") ||
    identity.includes("image")
  );
}

function formatPrice(price: UserModelPrice | undefined): string {
  if (!price) return "--";
  const amount = Number(price.unit_price_yuan);
  if (!Number.isFinite(amount)) return "--";
  const currency =
    price.currency.trim().toUpperCase() === "CNY"
      ? "¥"
      : price.currency.trim() || "¥";
  const unit = price.unit.trim() || "unit";
  const quantity = price.unit_quantity > 0 ? price.unit_quantity : 1;
  const denominator =
    quantity === 1
      ? unit
      : quantity === 1_000_000 && unit.toLowerCase() === "token"
        ? "M tokens"
        : `${formatNumber(quantity)} ${unit}`;
  return `${formatDecimal(amount) ?? amount} ${currency}/${denominator}`;
}

function formatModelBasePrice(model: ModelRecord): string {
  const amount = model.tokenNxPrice.base;
  if (amount === undefined || !Number.isFinite(amount)) return "--";
  return `${formatDecimal(amount) ?? amount} ${model.tokenNxPrice.unit}`;
}

function formatMetric(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "--";
  return formatNumber(Number(value.toFixed(1)));
}

function priceForResolution(
  prices: UserModelPrice[],
  resolution: string,
): UserModelPrice | undefined {
  const normalized = resolution.toLowerCase().replace(/[^a-z0-9]/g, "");
  return prices.find((price) => {
    const selector = (price.selector_meter_code ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const meter =
      `${price.meter_code} ${price.meter_kind} ${price.purpose ?? ""}`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    return selector.includes(normalized) || meter.includes(normalized);
  });
}

function buildRows(
  model: ModelRecord,
  prices: UserModelPrice[],
): VideoPricingRow[] {
  const resolutions = (
    model.params?.["分辨率"] ??
    model.params?.resolution ??
    DEFAULT_RESOLUTIONS
  )
    .map(String)
    .filter(Boolean)
    .map(normalizeResolution);
  const uniqueResolutions = [
    ...new Set(resolutions.length ? resolutions : DEFAULT_RESOLUTIONS),
  ];
  return uniqueResolutions.map((resolution) => {
    const price = priceForResolution(prices, resolution) ?? prices[0];
    const unitPrice = price ? formatPrice(price) : formatModelBasePrice(model);
    const numericUnitPrice = price
      ? Number(price.unit_price_yuan)
      : model.tokenNxPrice.base;
    const durationSeconds = 5;
    const dimensions: Record<string, [number, number]> = {
      "480P": [854, 480],
      "720P": [1280, 720],
      "1080P": [1920, 1080],
    };
    const [width, height] = dimensions[resolution] ?? dimensions["720P"];
    const tokenUsageValue = (width * height * 24 * durationSeconds) / 1024;
    const resolutionFactor =
      resolution === "480P" ? 0.5 : resolution === "1080P" ? 2 : 1;
    const costValue =
      numericUnitPrice !== undefined && Number.isFinite(numericUnitPrice)
        ? price && /token/i.test(price.unit)
          ? (numericUnitPrice * (tokenUsageValue ?? 0)) /
            Math.max(1, price.unit_quantity || 1)
          : numericUnitPrice * durationSeconds * resolutionFactor
        : undefined;
    return {
      resolution,
      aspectRatio: "16:9",
      duration: `${durationSeconds}s`,
      unitPrice,
      tokenUsage: formatMetric(tokenUsageValue),
      cost: costValue === undefined ? "--" : `${formatMetric(costValue)} ¥/个`,
      perSecond:
        costValue === undefined
          ? "--"
          : `${formatMetric(costValue / durationSeconds)} ¥/秒`,
    };
  });
}

function buildTabs(
  model: ModelRecord,
  t: (key: string) => string,
): VideoPricingTab[] {
  const allPrices = model.prices ?? [];
  const firstTier = allPrices.length
    ? Math.min(...allPrices.map((price) => price.tier_no))
    : undefined;
  const prices =
    firstTier === undefined
      ? []
      : allPrices.filter((price) => price.tier_no === firstTier);
  const inputPrices = prices.filter(isVideoInputPrice);
  const outputPrices = prices.filter((price) => !isVideoInputPrice(price));
  const tabs: VideoPricingTab[] = [
    {
      id: "without-input",
      label: t("console.models.videoPricing.withoutInput"),
      rows: buildRows(model, outputPrices.length ? outputPrices : prices),
    },
  ];
  if (inputPrices.length)
    tabs.push({
      id: "with-input",
      label: t("console.models.videoPricing.withInput"),
      rows: buildRows(model, [...outputPrices, ...inputPrices]),
    });
  return tabs;
}

function VideoPricingContent({
  tabs,
  t,
}: {
  tabs: VideoPricingTab[];
  t: (key: string) => string;
}): ReactNode {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "without-input");
  const currentTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  if (!currentTab) return null;
  return (
    <div className="video-pricing-popover-content">
      <div className="video-pricing-popover-heading">
        <strong>{t("console.models.videoPricing.title")}</strong>
        <span>
          <b>{t("console.models.videoPricing.cost")}</b> ={" "}
          {t("console.models.videoPricing.tokenPrice")} ×{" "}
          {t("console.models.videoPricing.tokenUsage")}
        </span>
      </div>
      {tabs.length > 1 ? (
        <div
          className="video-pricing-tabs"
          role="tablist"
          aria-label={t("console.models.videoPricing.tabs")}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === currentTab.id}
              className={tab.id === currentTab.id ? "is-active" : ""}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}
      <p className="video-pricing-formula">
        {t("console.models.videoPricing.usageFormula")}
      </p>
      <div className="video-pricing-table-wrap">
        <table className="video-pricing-table">
          <thead>
            <tr>
              <th>{t("console.models.videoPricing.resolution")}</th>
              <th>{t("console.models.videoPricing.aspectRatio")}</th>
              <th>{t("console.models.videoPricing.duration")}</th>
              <th>{t("console.models.videoPricing.unitPrice")}</th>
              <th>{t("console.models.videoPricing.tokenUsage")}</th>
              <th>{t("console.models.videoPricing.cost")}</th>
              <th>{t("console.models.videoPricing.perSecond")}</th>
            </tr>
          </thead>
          <tbody>
            {currentTab.rows.map((row) => (
              <tr key={row.resolution}>
                <th scope="row">{row.resolution}</th>
                <td>{row.aspectRatio}</td>
                <td>{row.duration}</td>
                <td>{row.unitPrice}</td>
                <td>{row.tokenUsage}</td>
                <td>{row.cost}</td>
                <td>{row.perSecond}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <small className="video-pricing-note">
        {t("console.models.videoPricing.note")}
      </small>
    </div>
  );
}

export function VideoPricingPopover({ model }: { model: ModelRecord }) {
  const { t } = useTranslation();
  const tabs = useMemo(() => buildTabs(model, t), [model, t]);
  const triggerLabel = t("console.models.videoPricing.trigger");
  const [visible, setVisible] = useState(false);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>();
  const showTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const updatePopoverPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    // 以触发区中心定位，并为弹窗保留左右安全外边距。
    const popupWidth = Math.min(
      POPOVER_MAX_WIDTH,
      Math.max(0, window.innerWidth - POPOVER_VIEWPORT_GUTTER * 2),
    );
    const minCenter = POPOVER_VIEWPORT_GUTTER + popupWidth / 2;
    const maxCenter = window.innerWidth - minCenter;
    const center = Math.min(
      Math.max(rect.left + rect.width / 2, minCenter),
      maxCenter,
    );
    setPopupStyle({
      left: `${center}px`,
      top: `${Math.max(16, rect.top - 10)}px`,
    });
  };

  useEffect(() => {
    return () => {
      if (showTimer.current !== undefined)
        window.clearTimeout(showTimer.current);
      if (hideTimer.current !== undefined)
        window.clearTimeout(hideTimer.current);
    };
  }, []);

  // 触发区和弹窗分属不同层级，使用短延迟确保鼠标移入弹窗时不会立即关闭。
  const showPopover = () => {
    if (showTimer.current !== undefined) window.clearTimeout(showTimer.current);
    if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current);
    updatePopoverPosition();
    setVisible(true);
  };
  const scheduleHoverPopover = () => {
    if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current);
    if (showTimer.current !== undefined) window.clearTimeout(showTimer.current);
    // 鼠标短暂掠过时不立即弹出，停留片刻后再展示价格示例。
    showTimer.current = window.setTimeout(showPopover, HOVER_SHOW_DELAY);
  };
  const hidePopover = () => {
    if (showTimer.current !== undefined) window.clearTimeout(showTimer.current);
    if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setVisible(false), 180);
  };

  useEffect(() => {
    if (!visible) return;
    // 窗口尺寸或页面滚动变化时同步位置，保证响应式场景下弹窗仍贴着触发区。
    const handleViewportChange = () => updatePopoverPosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [visible]);

  return (
    <div className="model-card-video-pricing">
      <span
        ref={triggerRef}
        className="model-card-video-pricing-trigger"
        title={triggerLabel}
        aria-label={triggerLabel}
        tabIndex={0}
        onMouseEnter={scheduleHoverPopover}
        onMouseLeave={hidePopover}
        onFocus={showPopover}
        onBlur={hidePopover}
      >
        {triggerLabel}
      </span>
      {visible && popupStyle && typeof document !== "undefined"
        ? createPortal(
            <div
              className="video-pricing-popover-portal"
              style={popupStyle}
              onMouseEnter={showPopover}
              onMouseLeave={hidePopover}
            >
              <VideoPricingContent tabs={tabs} t={t} />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
