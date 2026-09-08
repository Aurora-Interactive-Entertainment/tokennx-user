import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { AppErrorBoundary } from "./app-error-boundary";

let shouldThrow = true;

function TestChild() {
  if (shouldThrow) throw new Error("Boundary test failure");
  return <p>Recovered content</p>;
}

describe("AppErrorBoundary", () => {
  beforeEach(async () => {
    shouldThrow = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await i18n.changeLanguage("zh-CN");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.classList.remove("app-ready");
  });

  it("展示中文恢复入口并允许重新渲染页面", () => {
    render(
      <AppErrorBoundary>
        <TestChild />
      </AppErrorBoundary>,
    );

    expect(
      screen.getByRole("heading", { name: "页面暂时无法正常显示" }),
    ).toBeVisible();
    expect(document.documentElement).toHaveClass("app-ready");

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(screen.getByText("Recovered content")).toBeVisible();
  });

  it("跟随英文语言设置显示兜底文案", async () => {
    await i18n.changeLanguage("en-US");

    render(
      <AppErrorBoundary>
        <TestChild />
      </AppErrorBoundary>,
    );

    expect(
      screen.getByRole("heading", {
        name: "This page cannot be displayed right now",
      }),
    ).toBeVisible();
  });
});
