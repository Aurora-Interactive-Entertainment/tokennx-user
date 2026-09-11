import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import AppModal from "@/components/app-modal";
import { LoginDialog } from "@/components/common";
import { useAppSelector } from "@/store/hooks";
import "./activity-campaign-modal.css";

export type ActivityCampaign = {
  /** 活动主视觉图片，接口返回后可直接替换默认视觉。 */
  image?: string;
  /** 接口明确返回的登录状态；未返回时回退到本地认证状态。 */
  isLoggedIn?: boolean | null;
  redirectPath?: string;
  copy?: string;
  confirmText?: string;
  activityEndAt?: string;
};

export type ActivityCampaignModalProps = {
  /** 接口暂未接入时使用默认活动稿；返回 null 可明确关闭活动展示。 */
  campaign?: ActivityCampaign | null;
  /** 后续接口可直接控制本次是否满足展示条件。 */
  shouldDisplay?: boolean;
};

export const ACTIVITY_CAMPAIGN_CLOSED_DATE_KEY =
  "token-nx:activity-campaign:closed-date:v1";

const DEFAULT_CAMPAIGN: ActivityCampaign = {};

type ActivityStorage = Pick<Storage, "getItem" | "setItem">;

function getActivityStorage(): ActivityStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // 隐私模式或浏览器禁用本地存储时，活动弹窗仍可正常使用，只是不持久化关闭状态。
    return null;
  }
}

/** 使用本地日历日期，避免 UTC 转换导致午夜附近跨天判断错误。 */
export function getActivityCampaignDateKey(date: Date = new Date()): string {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function hasClosedActivityCampaignToday(
  storage: Pick<Storage, "getItem"> | null = getActivityStorage(),
  date: Date = new Date(),
): boolean {
  if (!storage) return false;
  try {
    return (
      storage.getItem(ACTIVITY_CAMPAIGN_CLOSED_DATE_KEY) ===
      getActivityCampaignDateKey(date)
    );
  } catch {
    return false;
  }
}

export function markActivityCampaignClosedToday(
  storage: Pick<Storage, "setItem"> | null = getActivityStorage(),
  date: Date = new Date(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      ACTIVITY_CAMPAIGN_CLOSED_DATE_KEY,
      getActivityCampaignDateKey(date),
    );
  } catch {
    // 写入失败不阻断关闭动作，当前会话仍按正常交互继续。
  }
}

type Countdown = {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
};

function pad(value: number): string {
  return String(Math.max(0, value)).padStart(2, "0");
}

function getCountdown(endAt?: string): Countdown {
  const end = endAt ? Date.parse(endAt) : Number.NaN;
  const remaining = Number.isFinite(end)
    ? Math.max(0, end - Date.now())
    : 4 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000 + 20 * 60 * 1000 + 43 * 1000;
  const totalSeconds = Math.floor(remaining / 1000);
  return {
    days: pad(Math.floor(totalSeconds / 86400)),
    hours: pad(Math.floor((totalSeconds % 86400) / 3600)),
    minutes: pad(Math.floor((totalSeconds % 3600) / 60)),
    seconds: pad(totalSeconds % 60),
  };
}

function CampaignFallbackVisual({
  copy,
  autoIssued,
}: {
  copy: string;
  autoIssued: string;
}) {
  const lines = copy
    // 避免把英文千位分隔符（如 1,000）误切成两行。
    .split(/[，；;\n]|,(?!\d)/)
    .map((line) => line.trim())
    .filter(Boolean);
  const couponMatch = (lines[0] ?? "").match(/^(.*?)(¥\s*[\d,.]+)(.*)$/);
  const highlightLine = lines.at(-1) ?? "";
  const highlightMatch = highlightLine.match(/^(.*?)(\d[\d,]*)(.*)$/);
  return (
    <div className="activity-campaign-visual-fallback">
      <div className="activity-campaign-stars" aria-hidden="true" />
      <p>
        {couponMatch ? (
          <>
            {couponMatch[1]}
            <b className="activity-campaign-coupon-value">{couponMatch[2]}</b>
            <span className="activity-campaign-coupon-label">
              {couponMatch[3]}
            </span>
          </>
        ) : (
          (lines[0] ?? copy)
        )}
      </p>
      {lines.slice(1, -1).map((line) => (
        <div className="activity-campaign-visual-subline" key={line}>
          {line}
        </div>
      ))}
      {lines.length > 1 ? (
        <strong>
          {highlightMatch ? (
            <>
              <span className="activity-campaign-highlight-prefix">
                {highlightMatch[1]}
              </span>
              <b className="activity-campaign-highlight-number">
                {highlightMatch[2]}
              </b>
              <span className="activity-campaign-highlight-label">
                {highlightMatch[3]}
              </span>
            </>
          ) : (
            highlightLine
          )}
        </strong>
      ) : null}
      <span>{autoIssued}</span>
    </div>
  );
}

export function ActivityCampaignModal({
  campaign = DEFAULT_CAMPAIGN,
  shouldDisplay = true,
}: ActivityCampaignModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const authStatus = useAppSelector((state) => state.auth.status);
  const [visible, setVisible] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const loginTimerRef = useRef<number | undefined>(undefined);
  const campaignAvailable = campaign !== null;
  const data = { ...DEFAULT_CAMPAIGN, ...(campaign ?? {}) };
  const campaignCopy =
    data.copy ?? t("console.purchasePage.activityModal.copy");

  useEffect(() => {
    if (!shouldDisplay || !campaignAvailable) {
      if (loginTimerRef.current !== undefined) {
        window.clearTimeout(loginTimerRef.current);
        loginTimerRef.current = undefined;
      }
      setVisible(false);
      setLoginOpen(false);
      return;
    }
    setVisible(!hasClosedActivityCampaignToday());
  }, [campaignAvailable, shouldDisplay]);

  useEffect(
    () => () => {
      if (loginTimerRef.current !== undefined) {
        window.clearTimeout(loginTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!data.activityEndAt || !visible) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [data.activityEndAt, visible]);

  const countdown = useMemo(() => {
    return getCountdown(data.activityEndAt);
  }, [data.activityEndAt, now]);

  const closeCampaign = useCallback((): void => {
    markActivityCampaignClosedToday();
    setVisible(false);
  }, []);

  function handleConfirm(): void {
    closeCampaign();
    const requiresLogin =
      data.isLoggedIn === false ||
      (data.isLoggedIn == null && authStatus !== "authenticated");
    if (requiresLogin) {
      // 先关闭活动弹窗，再拉起统一登录抽屉，避免两个遮罩叠加。
      if (loginTimerRef.current !== undefined) {
        window.clearTimeout(loginTimerRef.current);
      }
      loginTimerRef.current = window.setTimeout(() => {
        loginTimerRef.current = undefined;
        setLoginOpen(true);
      }, 180);
      return;
    }
    if (data.redirectPath) navigate(data.redirectPath);
  }

  return (
    <>
      <AppModal
        className="activity-campaign-modal"
        visible={visible}
        title={null}
        aria-label={t("console.purchasePage.activityModal.title")}
        closable={false}
        footer={null}
        width={480}
        onCancel={closeCampaign}
      >
        <div className="activity-campaign-content">
          <div className="activity-campaign-visual">
            {data.image ? (
              <img src={data.image} alt={campaignCopy} />
            ) : null}
            <button
              className="activity-campaign-close"
              type="button"
              aria-label={t("console.purchasePage.activityModal.close")}
              onClick={closeCampaign}
            >
              <span aria-hidden="true" />
            </button>
          </div>
          <div className="activity-campaign-body">
            <h2>{t("console.purchasePage.activityModal.countdown")}</h2>
            <div
              className="activity-campaign-countdown"
              aria-label={t("console.purchasePage.activityModal.countdown")}
            >
              {[
                countdown.days,
                countdown.hours,
                countdown.minutes,
                countdown.seconds,
              ].map((value, index) => (
                <span
                  className="activity-campaign-time-group"
                  key={`${index}-${value}`}
                >
                  <strong>{value}</strong>
                  {index < 3 ? <i aria-hidden="true">:</i> : null}
                </span>
              ))}
            </div>
            <div className="activity-campaign-actions">
              <button
                className="activity-campaign-button activity-campaign-button--secondary"
                type="button"
                onClick={closeCampaign}
              >
                {t("console.purchasePage.activityModal.later")}
              </button>
              <button
                className="activity-campaign-button activity-campaign-button--primary"
                type="button"
                onClick={handleConfirm}
              >
                {data.confirmText ??
                  t("console.purchasePage.activityModal.confirm")}
              </button>
            </div>
          </div>
        </div>
      </AppModal>
      <LoginDialog
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => {
          setLoginOpen(false);
          if (data.redirectPath) navigate(data.redirectPath);
        }}
      />
    </>
  );
}
