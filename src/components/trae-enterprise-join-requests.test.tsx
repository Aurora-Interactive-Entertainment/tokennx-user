import "@/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getEnterpriseJoinRequests,
  reviewEnterpriseJoinRequest,
  type EnterpriseContext,
  type EnterpriseJoinRequest,
  type EnterpriseJoinRequestPage,
} from "@/api/enterprise-console";
import { createAppStore } from "@/store";
import { TraeEnterpriseJoinRequests } from "./trae-enterprise-join-requests";

vi.mock("@/api/enterprise-console", async () => {
  const actual = await vi.importActual<typeof import("@/api/enterprise-console")>("@/api/enterprise-console");
  return {
    ...actual,
    getEnterpriseJoinRequests: vi.fn(),
    reviewEnterpriseJoinRequest: vi.fn(),
  };
});

const getRequestsMock = vi.mocked(getEnterpriseJoinRequests);
const reviewRequestMock = vi.mocked(reviewEnterpriseJoinRequest);

class TestResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const CONTEXT: EnterpriseContext = {
  id: "ent_test",
  name: "测试企业",
  code: "ENT-TEST",
  member_id: "member_owner",
  role: "owner",
  roles: ["owner"],
  role_options: [
    { code: "member", name: "成员", owner_role: false },
    { code: "administrator", name: "管理员", owner_role: false },
    { code: "owner", name: "超级管理员", owner_role: true },
  ],
  capabilities: {
    can_manage_members: true,
    can_manage_roles: true,
    can_manage_tags: true,
    can_manage_models: true,
    can_manage_usage: true,
    can_view_models: true,
    can_view_usage: true,
    can_view_audit: true,
    can_view_analytics: true,
  },
};

const REQUEST: EnterpriseJoinRequest = {
  id: "join_1",
  applicant_user_id: "user_1",
  applicant_name: "张三",
  applicant_contact: "138****0001",
  requested_role: "administrator",
  request_message: "申请加入研发团队",
  status: "pending",
  created_at: "2026-08-26T08:00:00Z",
  updated_at: "2026-08-26T08:00:00Z",
  version: 1,
};

function requestPage(overrides: Partial<EnterpriseJoinRequestPage> = {}): EnterpriseJoinRequestPage {
  return {
    context: CONTEXT,
    items: [REQUEST],
    total: 1,
    page: 1,
    page_size: 10,
    ...overrides,
  };
}

function renderRequests(onReviewed = vi.fn()) {
  render(
    <MemoryRouter>
      <Provider store={createAppStore()}>
        <TraeEnterpriseJoinRequests context={CONTEXT} onReviewed={onReviewed} />
      </Provider>
    </MemoryRouter>,
  );
  return onReviewed;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  getRequestsMock.mockResolvedValue(requestPage());
  reviewRequestMock.mockResolvedValue({ ...REQUEST, status: "approved", version: 2 });
});

describe("Trae 企业加入申请列表", () => {
  it("按每页 10 条加载申请并展示申请人、角色与审核操作", async () => {
    renderRequests();

    expect(await screen.findByText("张三")).toBeInTheDocument();
    expect(screen.getByText("138****0001")).toBeInTheDocument();
    expect(screen.getByText("申请加入研发团队")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "通过" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "拒绝" })).toBeInTheDocument();
    expect(getRequestsMock).toHaveBeenCalledWith(
      { enterprise_id: "ent_test" },
      expect.objectContaining({ page: 1, page_size: 10, keyword: undefined, status: undefined }),
    );
  });

  it("确认通过后使用申请角色审核，并通知成员列表刷新", async () => {
    const user = userEvent.setup();
    const onReviewed = renderRequests();

    await user.click(await screen.findByRole("button", { name: "通过" }));
    const dialog = screen.getByRole("dialog", { name: "确认通过申请" });
    await user.click(within(dialog).getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(reviewRequestMock).toHaveBeenCalledWith(
        { enterprise_id: "ent_test" },
        "join_1",
        { action: "approve", role: "administrator" },
        expect.any(Object),
      );
    });
    expect(onReviewed).toHaveBeenCalledTimes(1);
  });

  it("输入搜索词时防抖请求，并保持每页 10 条", async () => {
    const user = userEvent.setup();
    renderRequests();
    await screen.findByText("张三");
    getRequestsMock.mockClear();

    await user.type(screen.getByRole("textbox", { name: "搜索人员名称、邮箱" }), "研发");
    expect(getRequestsMock).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(getRequestsMock).toHaveBeenCalledWith(
        { enterprise_id: "ent_test" },
        expect.objectContaining({ page: 1, page_size: 10, keyword: "研发" }),
      );
    });
  });

  it("拒绝原因使用 Semi 必填校验，通过校验后提交拒绝审核", async () => {
    const user = userEvent.setup();
    reviewRequestMock.mockResolvedValue({ ...REQUEST, status: "rejected", rejection_reason: "资料不完整", version: 2 });
    renderRequests();

    await user.click(await screen.findByRole("button", { name: "拒绝" }));
    const dialog = screen.getByRole("dialog", { name: "拒绝加入申请" });
    await user.click(within(dialog).getByRole("button", { name: "确定" }));
    expect(await within(dialog).findByText("请输入拒绝原因")).toBeInTheDocument();
    expect(reviewRequestMock).not.toHaveBeenCalled();

    await user.type(within(dialog).getByPlaceholderText("请输入拒绝原因"), "资料不完整");
    await user.click(within(dialog).getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(reviewRequestMock).toHaveBeenCalledWith(
        { enterprise_id: "ent_test" },
        "join_1",
        { action: "reject", rejection_reason: "资料不完整" },
        expect.any(Object),
      );
    });
  });
});
