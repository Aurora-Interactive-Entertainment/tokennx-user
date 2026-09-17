import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import {
  dateRangeToTrendQuery,
  dateRangeToUtcBounds,
  PersonalUsageDatePicker,
} from "./personal-usage-date-picker";
const originalRangeBounds = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getBoundingClientRect",
);

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalRangeBounds)
    Object.defineProperty(
      Range.prototype,
      "getBoundingClientRect",
      originalRangeBounds,
    );
  else Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
  await i18n.changeLanguage("zh-CN");
});

describe("个人用量 UTC 日期边界", () => {
  it("本地凌晨的今天保持有效 UTC 区间，与 UTC 今日统计一致", () => {
    vi.useFakeTimers();
    const now = new Date(2026, 8, 17, 0, 30);
    vi.setSystemTime(now);
    const today = new Date(2026, 8, 17);
    const bounds = dateRangeToUtcBounds([today, today]);
    expect(bounds.startAt).toBeLessThan(bounds.endAt);
    expect(bounds.startAt).toBe(
      Math.min(
        Date.UTC(2026, 8, 17),
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      ),
    );
    expect(dateRangeToTrendQuery([today, today])).toEqual({ range: "today" });
  });

  it("历史区间保持 UTC 整日边界，不变成本地午夜", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 17, 12));
    expect(
      dateRangeToUtcBounds([new Date(2026, 8, 1), new Date(2026, 8, 3)]),
    ).toEqual({ startAt: Date.UTC(2026, 8, 1), endAt: Date.UTC(2026, 8, 4) });
  });

  it("跨月多日范围保留历史起日，结束不越过现在；UTC 零点后进入新的一天", () => {
    vi.useFakeTimers();
    const now = new Date(2026, 8, 1, 0, 30);
    vi.setSystemTime(now);
    expect(
      dateRangeToUtcBounds([new Date(2026, 7, 29), new Date(2026, 8, 1)]),
    ).toEqual({
      startAt: Date.UTC(2026, 7, 29),
      endAt: Math.min(now.getTime(), Date.UTC(2026, 8, 2)),
    });
    const afterUtcMidnight = new Date("2026-09-17T00:00:00.001Z");
    vi.setSystemTime(afterUtcMidnight);
    const currentCalendarDay = new Date(
      afterUtcMidnight.getFullYear(),
      afterUtcMidnight.getMonth(),
      afterUtcMidnight.getDate(),
    );
    const expectedStart = Date.UTC(
      currentCalendarDay.getFullYear(),
      currentCalendarDay.getMonth(),
      currentCalendarDay.getDate(),
    );
    expect(
      dateRangeToUtcBounds([currentCalendarDay, currentCalendarDay]),
    ).toEqual({
      startAt: expectedStart,
      endAt: Math.min(afterUtcMidnight.getTime(), expectedStart + 86_400_000),
    });
  });

  it("现有最近 7 天、30 天与 90 天预设不变", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 17, 12));
    const today = new Date(2026, 8, 17);
    for (const [days, range] of [
      [6, "7d"],
      [29, "30d"],
      [89, "90d"],
    ] as const) {
      const start = new Date(today);
      start.setDate(start.getDate() - days);
      expect(dateRangeToTrendQuery([start, today])).toEqual({ range });
    }
  });
});

describe("个人用量日期选择器语言", () => {
  it("展开的日历随中英文切换同步预设、年月、星期与输入提示", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
      }),
    });
    render(
      <PersonalUsageDatePicker
        value={[new Date(2026, 8, 1), new Date(2026, 8, 17)]}
        onChange={() => undefined}
      />,
    );
    fireEvent.click(screen.getAllByRole("textbox")[0]);
    await waitFor(() => expect(document.body).toHaveTextContent("快捷选择"));
    expect(screen.getAllByRole("textbox")[0]).toHaveAttribute(
      "placeholder",
      "开始日期",
    );
    await act(() => i18n.changeLanguage("en-US"));
    await waitFor(() => expect(document.body).toHaveTextContent("Presets"));
    expect(document.body).toHaveTextContent("Last 7 days");
    expect(document.body).toHaveTextContent("Sep 2026");
    expect(document.body).toHaveTextContent("SunMonTueWedThuFriSat");
    expect(document.body).not.toHaveTextContent("快捷选择");
    expect(screen.getAllByRole("textbox")[0]).toHaveAttribute(
      "placeholder",
      "Start date",
    );
    await act(() => i18n.changeLanguage("zh-CN"));
    await waitFor(() => expect(document.body).toHaveTextContent("快捷选择"));
    expect(document.body).toHaveTextContent("2026年 9月");
  });
});
