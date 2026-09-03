import "@/i18n";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthResult } from "@/api/auth";
import { clearAuthTokens, saveAuthTokens } from "@/auth/token-storage";
import { AppStoreProvider } from "@/data/app-state";
import { createAppStore } from "@/store";
import { RechargePage } from "./recharge";

const AUTH_RESULT: AuthResult = {
  status: "succeeded",
  binding_required: false,
  access_token: "enterprise-recharge-token",
  refresh_token: "enterprise-recharge-refresh-token",
  access_expires_at: Date.UTC(2099, 0, 1, 0, 15),
  refresh_expires_at: Date.UTC(2099, 1, 1),
  user: {
    id: "enterprise-owner",
    display_name: "企业所有者",
    avatar_url: "",
    locale: "zh-CN",
    timezone: "Asia/Shanghai",
    status: "active",
  },
};

function apiResponse(data: unknown, code = 0, msg = "success"): Response {
  return new Response(JSON.stringify({ code, msg, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("充值管理页面", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearAuthTokens({ force: true, broadcast: false });
    saveAuthTokens(AUTH_RESULT);
    window.localStorage.setItem(
      "token-nx:user-front:v1",
      JSON.stringify({
        activeWorkspaceId: "enterprise-recharge-1",
        workspaces: [
          {
            id: "enterprise-recharge-1",
            name: "充值测试企业",
            type: "enterprise",
            role: "owner",
          },
        ],
      }),
    );
  });

  it("企业空间复用充值页面并把充值订单归入当前企业", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, options) => {
        const url = new URL(String(input), window.location.origin);
        if (
          url.pathname === "/api/user/payment/orders" &&
          options?.method === "POST"
        ) {
          return apiResponse({
            id: "enterprise-order-1",
            order_no: "ENTERPRISE-ORDER-1",
            status: "pending",
            amount_yuan: "50.00",
          });
        }
        if (
          url.pathname === "/api/user/payment/orders/enterprise-order-1/pay" &&
          options?.method === "POST"
        ) {
          return apiResponse({
            order: {
              id: "enterprise-order-1",
              order_no: "ENTERPRISE-ORDER-1",
              status: "paid",
              amount_yuan: "50.00",
            },
            transaction: { id: "enterprise-transaction-1" },
            form_html: "",
          });
        }
        throw new Error(`unexpected request: ${url.pathname}`);
      });

    render(
      <MemoryRouter initialEntries={["/console/recharge"]}>
        <Provider store={createAppStore()}>
          <AppStoreProvider>
            <RechargePage />
          </AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    expect(
      screen.getByRole("heading", { name: "充值汇款" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "当前企业空间暂不支持个人支付宝充值，请切换到个人空间。",
      ),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "发票管理" })).toHaveAttribute("href", "/console/billing?tab=invoice");
    expect(screen.getByRole("link", { name: "提现" })).toHaveAttribute("href", "/console/billing");
    expect(screen.getByRole("link", { name: "收支明细" })).toHaveAttribute("href", "/console/billing#billingLedgerHeading");
    expect(screen.getByRole("link", { name: "续费管理" })).toHaveAttribute("href", "/console/trae-enterprise/subscription");

    await user.click(screen.getByRole("button", { name: "200 元" }));
    await user.click(screen.getByRole("button", { name: "立即充值" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => new URL(String(input), window.location.origin).pathname.endsWith("/pay"))).toBe(true));

    const orderCall = fetchMock.mock.calls.find(
      ([input]) =>
        new URL(String(input), window.location.origin).pathname ===
        "/api/user/payment/orders",
    );
    const orderURL = new URL(String(orderCall?.[0]), window.location.origin);
    expect(orderURL.searchParams.get("account_type")).toBe("enterprise");
    expect(orderURL.searchParams.get("enterprise_id")).toBe(
      "enterprise-recharge-1",
    );
    expect(JSON.parse(String(orderCall?.[1]?.body))).toEqual({
      amount_yuan: "200",
    });

    const paymentCall = fetchMock.mock.calls.find(([input]) =>
      new URL(String(input), window.location.origin).pathname.endsWith("/pay"),
    );
    expect(JSON.parse(String(paymentCall?.[1]?.body))).toEqual({ scene: "pc" });
  });

  it("余额提醒弹窗复用个人通知偏好并保存阈值", async () => {
    let preferences = {
      items: [
        { code: "low_balance", enabled: true, default_enabled: true, threshold_supported: true, threshold_amount_nano: 4_280_000_000, version: 1 },
      ],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname === "/api/user/billing/wallet") return apiResponse({ wallet: { id: "wallet-1", currency: "CNY", status: "active", paid_available_yuan: "4.28", bonus_available_yuan: "0", paid_frozen_yuan: "0", bonus_frozen_yuan: "0", debt_yuan: "0", total_available_yuan: "4.28", total_balance_yuan: "4.28", version: "1" }, bonus_grants: [] });
      if (url.pathname === "/api/user/profile/notification-preferences" && options?.method !== "PUT") return apiResponse(preferences);
      if (url.pathname === "/api/user/profile" && options?.method !== "PUT") return apiResponse({ id: "user-1", display_name: "测试用户", avatar_url: "", locale: "zh-CN", timezone: "Asia/Shanghai", status: "active", version: 1, phone: { bound: true, masked_identifier: "138****0000" }, email: { bound: true, masked_identifier: "t***@example.com" } });
      if (url.pathname === "/api/user/profile/notification-preferences" && options?.method === "PUT") {
        const body = JSON.parse(String(options.body)) as { values: { low_balance: boolean }; thresholds: { low_balance: number } };
        preferences = { items: [{ ...preferences.items[0], enabled: body.values.low_balance, threshold_amount_nano: body.thresholds.low_balance, version: 2 }] };
        return apiResponse(preferences);
      }
      throw new Error(`unexpected request: ${url.pathname}`);
    });

    render(
      <MemoryRouter initialEntries={["/console/recharge"]}>
        <Provider store={createAppStore()}>
          <AppStoreProvider>
            <RechargePage />
          </AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    // 中文：兼容其他工作区窗口同步的历史“预警”文案，测试只关注按钮可打开标准弹窗。
    await user.click(screen.getByRole("button", { name: /设置余额(?:提醒|预警)/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("t***@example.com");
    const thresholdInput = within(dialog).getByRole("textbox", { name: "额度阈值" });
    expect(thresholdInput).toHaveValue("4.28");
    await user.clear(thresholdInput);
    await user.type(thresholdInput, "10");
    await user.click(dialog.querySelector(".semi-modal-footer .semi-button-primary") as HTMLElement);
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, options]) => new URL(String(input), window.location.origin).pathname === "/api/user/profile/notification-preferences" && options?.method === "PUT")).toBe(true));
    const preferenceRequest = fetchMock.mock.calls.find(([input, options]) => new URL(String(input), window.location.origin).pathname === "/api/user/profile/notification-preferences" && options?.method === "PUT");
    expect(JSON.parse(String(preferenceRequest?.[1]?.body))).toEqual({ values: { low_balance: true }, thresholds: { low_balance: 10_000_000_000 } });
  });

  it("实名认证拦截仅展示引导弹窗，不显示重复的顶部提示", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
      const url = new URL(String(input), window.location.origin);
      if (
        url.pathname === "/api/user/payment/orders" &&
        options?.method === "POST"
      ) {
        return apiResponse({}, 140008, "完成实名认证后才能充值");
      }
      throw new Error(`unexpected request: ${url.pathname}`);
    });

    render(
      <MemoryRouter initialEntries={["/console/recharge"]}>
        <Provider store={createAppStore()}>
          <AppStoreProvider>
            <RechargePage />
          </AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "200 元" }));
    await user.click(screen.getByRole("button", { name: "立即充值" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector("h2")).toHaveTextContent("实名认证");
    // 中文：后端错误文案不应再以 Toast 与实名引导弹窗重复展示。
    expect(screen.queryByText("完成实名认证后才能充值")).toBeNull();
    expect(document.querySelector(".semi-toast")).toBeNull();
  });

  it.each([
    { workspaceType: "personal" as const, workspaceId: "personal-recharge-1", accountType: "personal" },
    { workspaceType: "enterprise" as const, workspaceId: "enterprise-recharge-1", accountType: "enterprise" },
  ])("$workspaceType 关闭二维码弹窗后停止轮询，再次确认支付重新获取二维码", async ({ workspaceType, workspaceId, accountType }) => {
    window.localStorage.setItem(
      "token-nx:user-front:v1",
      JSON.stringify({
        activeWorkspaceId: workspaceId,
        workspaces: [{ id: workspaceId, name: "充值测试空间", type: workspaceType, role: "owner" }],
      }),
    );
    let orderSequence = 0;
    let queryCount = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
      const url = new URL(String(input), window.location.origin);
      const orderMatch = url.pathname.match(/^\/api\/user\/payment\/orders\/(recharge-order-\d+)\/pay$/);
      if (url.pathname === "/api/user/payment/orders" && options?.method === "POST") {
        orderSequence += 1;
        return apiResponse({ id: `recharge-order-${orderSequence}`, order_no: `RECHARGE-${orderSequence}`, status: "pending", amount_yuan: "50.00" });
      }
      if (orderMatch && options?.method === "POST") {
        return apiResponse({ order: { id: orderMatch[1], order_no: `RECHARGE-${orderMatch[1].split("-").at(-1)}`, status: "paying", amount_yuan: "50.00" }, transaction: { id: `transaction-${orderMatch[1]}` }, qr_code: `https://pay.example.test/${orderMatch[1]}`, form_html: "" });
      }
      if (url.pathname.match(/^\/api\/user\/payment\/orders\/recharge-order-\d+$/)) {
        queryCount += 1;
        return apiResponse({ id: url.pathname.split("/").at(-1), order_no: `RECHARGE-${queryCount}`, status: "paying", amount_yuan: "50.00" });
      }
      throw new Error(`unexpected request: ${url.pathname}`);
    });

    render(
      <MemoryRouter initialEntries={["/console/recharge"]}>
        <Provider store={createAppStore()}>
          <AppStoreProvider>
            <RechargePage />
          </AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "200 元" }));
    await user.click(screen.getByRole("button", { name: "立即充值" }));
    await waitFor(() => expect(queryCount).toBe(1));
    const firstOrderCall = fetchMock.mock.calls.find(([input, requestOptions]) => requestOptions?.method === "POST" && new URL(String(input), window.location.origin).pathname === "/api/user/payment/orders");
    expect(new URL(String(firstOrderCall?.[0]), window.location.origin).searchParams.get("account_type")).toBe(accountType);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("查看支付二维码")).toBeNull();

    const closeButton = document.querySelector(".payment-qr-dialog .semi-modal-close") as HTMLElement | null;
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton as HTMLElement);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    expect(queryCount).toBe(1);

    await user.click(screen.getByRole("button", { name: "立即充值" }));
    await waitFor(() => expect(orderSequence).toBe(2));
    await waitFor(() => expect(queryCount).toBe(2));
    const orderCalls = fetchMock.mock.calls.filter(([input, requestOptions]) => requestOptions?.method === "POST" && new URL(String(input), window.location.origin).pathname === "/api/user/payment/orders");
    const paymentCalls = fetchMock.mock.calls.filter(([input, requestOptions]) => requestOptions?.method === "POST" && new URL(String(input), window.location.origin).pathname.endsWith("/pay"));
    expect(orderCalls).toHaveLength(2);
    expect(paymentCalls).toHaveLength(2);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
