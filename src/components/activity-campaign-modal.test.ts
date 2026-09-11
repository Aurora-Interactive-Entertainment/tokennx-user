import { describe, expect, it, vi } from "vitest";
import {
  ACTIVITY_CAMPAIGN_CLOSED_DATE_KEY,
  getActivityCampaignDateKey,
  getActivityCampaignCountdown,
  hasClosedActivityCampaignToday,
  markActivityCampaignClosedToday,
} from "./activity-campaign-modal";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("活动弹窗每日关闭记录", () => {
  it("按本地日历日期生成记录键", () => {
    expect(getActivityCampaignDateKey(new Date(2026, 0, 2, 23, 59))).toBe(
      "2026-01-02",
    );
  });

  it("当天关闭后命中，第二天刷新后重新允许展示", () => {
    const storage = createStorage();
    const closedAt = new Date(2026, 8, 9, 23, 59);
    markActivityCampaignClosedToday(storage, closedAt);

    expect(storage.getItem(ACTIVITY_CAMPAIGN_CLOSED_DATE_KEY)).toBe(
      "2026-09-09",
    );
    expect(hasClosedActivityCampaignToday(storage, closedAt)).toBe(true);
    expect(
      hasClosedActivityCampaignToday(storage, new Date(2026, 8, 10, 0, 1)),
    ).toBe(false);
  });

  it("存储异常时不阻断关闭，也不会误判为已关闭", () => {
    const brokenStorage = {
      getItem: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
      setItem: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
    };
    const now = new Date(2026, 8, 9);

    expect(() =>
      markActivityCampaignClosedToday(brokenStorage, now),
    ).not.toThrow();
    expect(hasClosedActivityCampaignToday(brokenStorage, now)).toBe(false);
  });
});

describe("活动倒计时", () => {
  it("每秒递减，并在分钟边界正确借位", () => {
    const endAt = Date.parse("2026-09-15T09:21:00Z");
    const now = Date.parse("2026-09-11T00:00:00Z");
    expect(getActivityCampaignCountdown(endAt, now)).toEqual({ days: "04", hours: "09", minutes: "21", seconds: "00" });
    expect(getActivityCampaignCountdown(endAt, now + 1000)).toEqual({ days: "04", hours: "09", minutes: "20", seconds: "59" });
  });

  it("到期后保持为零，计时器延迟时仍按实际剩余时间计算", () => {
    expect(getActivityCampaignCountdown(10000, 7500).seconds).toBe("03");
    expect(getActivityCampaignCountdown(10000, 12000)).toEqual({ days: "00", hours: "00", minutes: "00", seconds: "00" });
  });
});
