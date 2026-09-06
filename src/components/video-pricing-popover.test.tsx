import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import type { ModelRecord } from "@/data/models";
import { VideoPricingPopover } from "./video-pricing-popover";

const MODEL: ModelRecord = {
  id: "video-test",
  name: "视频测试模型",
  company: "Token NX",
  modality: "video",
  capabilities: ["视频生成"],
  description: "用于验证费用提示的测试模型。",
  officialPrice: { base: 1, unit: "¥/秒" },
  tokenNxPrice: { base: 1, unit: "¥/秒" },
  labels: ["视频"],
  availability: { rate: 100, window: "近 24 小时" },
  providerCount: 1,
  throughput: { value: 1, unit: "K seconds" },
};

describe("VideoPricingPopover", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("鼠标进入费用说明时，将价格弹层挂到 body", () => {
    const { container } = render(<VideoPricingPopover model={MODEL} />);
    const trigger = container.querySelector(
      ".model-card-video-pricing-trigger",
    );

    expect(trigger).not.toBeNull();
    expect(document.querySelector(".video-pricing-popover-portal")).toBeNull();

    fireEvent.mouseEnter(trigger!);
    expect(document.querySelector(".video-pricing-popover-portal")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(150);
    });

    const portal = document.querySelector(".video-pricing-popover-portal");
    expect(portal).toBeInTheDocument();
    expect(portal?.parentElement).toBe(document.body);
    expect(screen.getByText("价格示例")).toBeInTheDocument();
  });

  it("视口宽度不足时，为弹层保留左右安全外边距", () => {
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1200,
    });
    const { container } = render(<VideoPricingPopover model={MODEL} />);
    const trigger = container.querySelector(
      ".model-card-video-pricing-trigger",
    ) as HTMLElement;
    trigger.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 400,
        width: 20,
        height: 28,
        bottom: 428,
        right: 20,
        x: 0,
        y: 400,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(document.querySelector(".video-pricing-popover-portal")).toHaveStyle(
      { left: "570px" },
    );
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
  });
});
