import "@/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEnterpriseInvitation,
  getEnterpriseInvitationUsages,
  getEnterpriseInvitations,
  type EnterpriseContext,
  type EnterpriseInvitation,
} from "@/api/enterprise-console";
import { createAppStore } from "@/store";
import { TraeEnterpriseInvitations } from "./trae-enterprise-invitations";

vi.mock("@/api/enterprise-console", async () => {
  const actual = await vi.importActual<typeof import("@/api/enterprise-console")>("@/api/enterprise-console");
  return { ...actual, createEnterpriseInvitation: vi.fn(), getEnterpriseInvitations: vi.fn(), getEnterpriseInvitationUsages: vi.fn() };
});

const createInvitationMock = vi.mocked(createEnterpriseInvitation);
const getInvitationsMock = vi.mocked(getEnterpriseInvitations);
const getUsagesMock = vi.mocked(getEnterpriseInvitationUsages);
const clipboardWriteTextMock = vi.fn();

const CONTEXT: EnterpriseContext = {
  id: "ent_test",
  name: "测试企业",
  code: "ENT-TEST",
  member_id: "member_owner",
  role: "owner",
  roles: ["owner"],
  role_options: [{ code: "member", name: "企业成员", owner_role: false }],
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

const INVITATION: EnterpriseInvitation = {
  id: "link_1",
  role: "member",
  role_name: "企业成员",
  max_uses: 10,
  used_count: 2,
  expires_at: null,
  status: "active",
  inviter_name: "管理员",
  created_at: "2026-08-26T08:00:00Z",
  updated_at: "2026-08-26T08:00:00Z",
  invite_token: "secret-token",
  invite_url: "/join?token=secret-token",
  version: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  getInvitationsMock.mockResolvedValue({ context: CONTEXT, items: [INVITATION], total: 1, page: 1, page_size: 10 });
  getUsagesMock.mockResolvedValue([]);
  createInvitationMock.mockResolvedValue(INVITATION);
  clipboardWriteTextMock.mockReset();
  clipboardWriteTextMock.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: clipboardWriteTextMock } });
});

function renderInvitations(createOpen = false) {
  return render(
    <MemoryRouter>
      <Provider store={createAppStore()}>
        <TraeEnterpriseInvitations context={CONTEXT} createOpen={createOpen} onCreateOpenChange={vi.fn()} />
      </Provider>
    </MemoryRouter>,
  );
}

describe("Trae 企业邀请链接", () => {
  it("按每页 10 条查询邀请列表并展示链接操作", async () => {
    renderInvitations();
    expect(await screen.findByText("邀请链接")).toBeInTheDocument();
    expect(screen.getByText("2/10 · 无期限")).toBeInTheDocument();
    expect(getInvitationsMock).toHaveBeenCalledWith(
      { enterprise_id: "ent_test" },
      expect.objectContaining({ page: 1, page_size: 10, status: undefined }),
    );
  });

  it("创建邀请时提交角色、次数和有效期", async () => {
    const user = userEvent.setup();
    renderInvitations(true);
    const dialog = screen.getByRole("dialog", { name: "邀请成员" });
    await user.clear(within(dialog).getByLabelText("可使用次数"));
    await user.type(within(dialog).getByLabelText("可使用次数"), "10");
    await user.click(within(dialog).getByRole("button", { name: "生成邀请链接" }));
    await waitFor(() => {
      expect(createInvitationMock).toHaveBeenCalledWith(
        { enterprise_id: "ent_test" },
        { role: "member", max_uses: 10, expires_at: null },
        expect.any(Object),
      );
    });
  });

  it("点击使用情况后查询对应邀请链接的使用记录", async () => {
    const user = userEvent.setup();
    getUsagesMock.mockResolvedValue([{ user_id: "user_1", member_id: "member_1", user_name: "张三", joined_at: "2026-08-26T09:00:00Z" }]);
    renderInvitations();
    await user.click(await screen.findByRole("button", { name: "使用情况" }));
    expect(await screen.findByRole("dialog", { name: "邀请链接使用情况" })).toHaveTextContent("张三");
    expect(getUsagesMock).toHaveBeenCalledWith({ enterprise_id: "ent_test" }, "link_1", expect.any(Object));
  });
});
