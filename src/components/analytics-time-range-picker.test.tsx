import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import {
  AnalyticsTimeRangePicker,
  isTimeRangeAllowed,
  type TimeRangeDateRestriction,
  type TimeRangeValue,
} from "./analytics-time-range-picker";

const TODAY = new Date(2026, 7, 17, 12, 0, 0);
const CUSTOM_PRESET = [{ value: "custom", label: "自定义" }] as const;

function renderPicker(
  restriction: TimeRangeDateRestriction,
  value: TimeRangeValue<string> = {
    range: "custom",
    startDate: "",
    endDate: "",
  },
  onChange = vi.fn(),
) {
  const result = render(
    <AnalyticsTimeRangePicker
      value={value}
      presets={CUSTOM_PRESET}
      dateRestriction={restriction}
      onChange={onChange}
    />,
  );
  fireEvent.click(
    result.container.querySelector(".analytics-time-range-trigger")!,
  );
  return { ...result, onChange };
}

function dateButtons(value: string): HTMLButtonElement[] {
  return screen.getAllByRole("button", { name: value }) as HTMLButtonElement[];
}

describe("日期范围选择限制", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    await i18n.changeLanguage("zh-CN");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("统计类范围仅允许今天及向前90个自然日", () => {
    const { container } = renderPicker("last-90-days");

    expect(dateButtons("2026-08-18").every((button) => button.disabled)).toBe(
      true,
    );
    const previousButton = container.querySelector(
      ".analytics-time-range-calendar-nav",
    ) as HTMLButtonElement;
    fireEvent.click(previousButton);
    fireEvent.click(previousButton);
    fireEvent.click(previousButton);

    expect(dateButtons("2026-05-19").every((button) => button.disabled)).toBe(
      true,
    );
    expect(dateButtons("2026-05-20").some((button) => !button.disabled)).toBe(
      true,
    );
    expect(isTimeRangeAllowed("2026-05-20", "2026-08-17", "last-90-days", TODAY)).toBe(true);
    expect(isTimeRangeAllowed("2026-05-19", "2026-08-17", "last-90-days", TODAY)).toBe(false);
  });

  it("先有结束日期时，开始日期只能在联动范围内选择", () => {
    const onChange = vi.fn();
    const { container } = renderPicker(
      "last-90-days",
      { range: "custom", startDate: "", endDate: "2026-08-10" },
      onChange,
    );

    expect(dateButtons("2026-08-11").every((button) => button.disabled)).toBe(
      true,
    );
    fireEvent.click(dateButtons("2026-08-01").find((button) => !button.disabled)!);
    const applyButton = container.querySelector(
      ".analytics-time-range-actions .btn-primary",
    ) as HTMLButtonElement;
    expect(applyButton).not.toBeDisabled();
    fireEvent.click(applyButton);
    expect(onChange).toHaveBeenCalledWith({
      range: "custom",
      startDate: "2026-08-01",
      endDate: "2026-08-10",
    });
  });

  it("操作日志只禁用未来日期，不限制历史回溯", () => {
    const { container } = renderPicker("past-only");
    expect(dateButtons("2026-08-18").every((button) => button.disabled)).toBe(
      true,
    );

    const previousButton = container.querySelector(
      ".analytics-time-range-calendar-nav",
    ) as HTMLButtonElement;
    fireEvent.click(previousButton);
    fireEvent.click(previousButton);
    fireEvent.click(previousButton);
    expect(dateButtons("2026-05-19").some((button) => !button.disabled)).toBe(
      true,
    );
    expect(isTimeRangeAllowed("2020-01-01", "2026-08-17", "past-only", TODAY)).toBe(true);
    expect(isTimeRangeAllowed("2020-01-01", "2026-08-18", "past-only", TODAY)).toBe(false);
  });
});
