import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import AppModal from "@/components/app-modal";
import { LoginDialog } from "@/components/common";
import { useAppSelector } from "@/store/hooks";
import "./activity-campaign-modal.css";

export type ActivityCampaign = {
  /** 活动主视觉图片，直接作为弹窗上半部分展示。 */
  image?: string;
  /** 主视觉图片替代文案，未配置时回退到多语言标题。 */
  copy?: string;
  /** 仅登录用户可见；不用于控制点击后的登录流程。 */
  loginRequired?: boolean;
  /** 主按钮跳转地址，同时支持站内路径与站外绝对地址。 */
  targetUrl?: string;
  /** 主按钮文案，未配置时回退到多语言默认值。 */
  targetText?: string;
  /** 活动结束时间（毫秒时间戳），未配置时不展示倒计时。 */
  activityEndAt?: number;
};

export type ActivityCampaignModalProps = {
  /** 仅在有可展示的活动数据时渲染，无数据时上层直接不挂载弹窗。 */
  campaign: ActivityCampaign;
};

export const ACTIVITY_CAMPAIGN_CLOSED_DATE_KEY =
  "token-nx:activity-campaign:closed-date:v1";

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

export function getActivityCampaignCountdown(
  endAt: number,
  now: number,
): Countdown {
  const totalSeconds = Math.ceil(Math.max(0, endAt - now) / 1000);
  return {
    days: pad(Math.floor(totalSeconds / 86400)),
    hours: pad(Math.floor((totalSeconds % 86400) / 3600)),
    minutes: pad(Math.floor((totalSeconds % 3600) / 60)),
    seconds: pad(totalSeconds % 60),
  };
}

/** 站内地址换算成路由路径，站外地址保持绝对地址；地址非法时返回 null 表示不跳转。 */
export function getActivityCampaignTarget(
  url: string,
  origin: string,
): { href: string; external: boolean } | null {
  try {
    if (!url.trim()) return null;
    const target = new URL(url.trim(), origin);
    // 活动跳转仅接受网页地址，拒绝脚本和其他非网页协议。
    if (target.protocol !== "http:" && target.protocol !== "https:")
      return null;
    if (target.origin === origin) {
      return {
        href: `${target.pathname}${target.search}${target.hash}`,
        external: false,
      };
    }
    return { href: target.toString(), external: true };
  } catch {
    return null;
  }
}

export function ActivityCampaignModal({
  campaign,
}: ActivityCampaignModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const authStatus = useAppSelector((state) => state.auth.status);
  const [visible, setVisible] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginPending, setLoginPending] = useState(false);
  const [pendingTarget, setPendingTarget] =
    useState<ReturnType<typeof getActivityCampaignTarget>>(null);
  const [now, setNow] = useState(() => Date.now());
  const target = campaign.targetUrl
    ? getActivityCampaignTarget(campaign.targetUrl, window.location.origin)
    : null;
  // 登录态改变后立即隐藏旧响应中的受限活动，不等待首页请求完成。
  const canDisplay =
    (campaign.loginRequired !== true || authStatus === "authenticated") &&
    (campaign.activityEndAt === undefined || campaign.activityEndAt > now);
  const campaignCopy =
    campaign.copy ?? t("console.purchasePage.activityModal.title");

  useEffect(() => {
    // 每日仅展示一次：当天已关闭过就不再弹出。
    if (hasClosedActivityCampaignToday()) return;
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!loginPending) return;
    // 等活动弹窗关闭后再打开项目统一登录抽屉，避免两个遮罩叠加。
    const timer = window.setTimeout(() => setLoginOpen(true), 180);
    return () => window.clearTimeout(timer);
  }, [loginPending]);

  useEffect(() => {
    if (!visible) return undefined;
    setNow(Date.now());
    // 每次按当前时间重新计算，切回后台页面后也不会因计时器延迟产生累计偏差。
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [visible]);

  const countdown = useMemo(
    () =>
      campaign.activityEndAt === undefined
        ? null
        : getActivityCampaignCountdown(campaign.activityEndAt, now),
    [campaign.activityEndAt, now],
  );

  const closeCampaign = useCallback((): void => {
    markActivityCampaignClosedToday();
    setVisible(false);
  }, []);

  function handleConfirm(): void {
    if (!canDisplay) return;
    closeCampaign();
    if (authStatus !== "authenticated") {
      // 未配置跳转地址时仍保留领取入口；登录完成后仅关闭，不跳到无关页面。
      setPendingTarget(target);
      setLoginPending(true);
      return;
    }
    if (target) openTarget(target);
  }

  function openTarget(destination: NonNullable<typeof target>): void {
    // 站外地址使用完整导航，站内地址继续交给路由。
    if (destination.external) window.location.assign(destination.href);
    else navigate(destination.href);
  }

  const closeLogin = useCallback(() => {
    setLoginOpen(false);
    setLoginPending(false);
    setPendingTarget(null);
  }, []);

  return (
    <>
      {/* 活动失效时卸载活动内容，已发起的登录流程仍正常完成。 */}
      {canDisplay ? (
        <AppModal
          className={`activity-campaign-modal${campaign.image ? "" : " activity-campaign-modal--no-cover"}`}
          visible={visible && canDisplay}
          title={null}
          aria-label={t("console.purchasePage.activityModal.title")}
          closable={!campaign.image}
          footer={null}
          width={480}
          onCancel={closeCampaign}
        >
          <div className="activity-campaign-content">
            {campaign.image ? (
              <div className="activity-campaign-visual">
                <img src={campaign.image} alt={campaignCopy} />
                <button
                  className="activity-campaign-close"
                  type="button"
                  aria-label={t("console.purchasePage.activityModal.close")}
                  onClick={closeCampaign}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M5 5l14 14M19 5L5 19" />
                  </svg>
                </button>
              </div>
            ) : null}
            <div className="activity-campaign-body">
              {countdown ? (
                <>
                  <h2>{t("console.purchasePage.activityModal.countdown")}</h2>
                  <div
                    className="activity-campaign-countdown"
                    aria-label={t(
                      "console.purchasePage.activityModal.countdown",
                    )}
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
                </>
              ) : null}
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
                  {campaign.targetText ??
                    t("console.purchasePage.activityModal.confirm")}
                </button>
              </div>
            </div>
          </div>
        </AppModal>
      ) : null}
      <LoginDialog
        open={loginOpen}
        dialogId="activity-login-dialog"
        onClose={closeLogin}
        onSuccess={() => {
          if (pendingTarget) openTarget(pendingTarget);
          closeLogin();
        }}
      />
    </>
  );
}
