import "@/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getEnterpriseAuditLogs,
  type EnterpriseAuditLog,
  type EnterpriseAuditLogPage,
  type EnterpriseContext,
} from "@/api/enterprise-console";
import { createAppStore } from "@/store";
import { TraeEnterpriseAudit } from "./trae-enterprise-audit";

vi.mock("@/api/enterprise-console", async () => {
  const actual = await vi.importActual<typeof import("@/api/enterprise-console")>("@/api/enterprise-console");
  return { ...actual, getEnterpriseAuditLogs: vi.fn() };
});

const getEnterpriseAuditLogsMock = vi.mocked(getEnterpriseAuditLogs);

const CONTEXT: EnterpriseContext = {
  id: "ent_test",
  name: "测试企业",
  code: "ENT-TEST",
  member_id: "member_owner",
  role: "owner",
  roles: ["owner"],
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

const LOG: EnterpriseAuditLog = {
  id: "evt_1",
  category: "enterprise.member",
  action: "enterprise.member.status.update",
  summary: "更新成员状态",
  actor_id: "member_owner",
  actor_name: "管理员",
  actor_contact: "138****0001",
  result: "success",
  result_code: "0",
  resource_type: "enterprise_member",
  resource_id: "member_2",
  before: { status: "active" },
  after: { status: "removed" },
  request_id: "req_audit_1",
  occurred_at: "2026-08-25T09:00:00Z",
};

function auditPage(overrides: Partial<EnterpriseAuditLogPage> = {}): EnterpriseAuditLogPage {
  return {
    context: CONTEXT,
    items: [LOG],
    total: 21,
    page: 1,
    page_size: 10,
    ...overrides,
  };
}

function renderAudit(): void {
  render(
    <MemoryRouter>
      <Provider store={createAppStore()}>
        <TraeEnterpriseAudit context={CONTEXT} />
      </Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getEnterpriseAuditLogsMock.mockResolvedValue(auditPage());
});

describe("Trae 企业操作日志", () => {
  it("按接口分页加载日志，并以本地自然日构造完整时间范围", async () => {
    renderAudit();

    expect(await screen.findByText("enterprise.member.status.update")).toBeInTheDocument();
    expect(screen.getByText("enterprise_member · member_2")).toBeInTheDocument();
    expect(screen.getByText("管理员")).toBeInTheDocument();

    const [, options] = getEnterpriseAuditLogsMock.mock.calls[0]!;
    if (!options) throw new Error("审计日志请求参数缺失");
    expect(getEnterpriseAuditLogsMock).toHaveBeenCalledWith(
      { enterprise_id: "ent_test" },
      expect.objectContaining({ page: 1, page_size: 10 }),
    );
    expect(new Date(Number(options.start_at)).getHours()).toBe(0);
    expect(new Date(Number(options.start_at)).getMinutes()).toBe(0);
    expect(new Date(Number(options.end_at)).getHours()).toBe(23);
    expect(new Date(Number(options.end_at)).getMinutes()).toBe(59);
  });

  it("打开列表项后展示接口返回的资源、结果和变更内容", async () => {
    const user = userEvent.setup();
    renderAudit();

    await user.click(await screen.findByText("enterprise.member.status.update"));

    const dialog = await screen.findByRole("dialog", { name: "操作详情" });
    expect(dialog).toHaveTextContent("enterprise_member · member_2");
    expect(dialog).toHaveTextContent("req_audit_1");
    expect(dialog).toHaveTextContent('"status": "active"');
    expect(dialog).toHaveTextContent('"status": "removed"');
  });

  it("使用服务端总数翻页，而不是在前端切分当前页数据", async () => {
    const user = userEvent.setup();
    renderAudit();

    await screen.findByText("共 21 条");
    await user.click(screen.getByText("2", { selector: ".semi-page-item" }));

    await waitFor(() => {
      expect(getEnterpriseAuditLogsMock).toHaveBeenLastCalledWith(
        { enterprise_id: "ent_test" },
        expect.objectContaining({ page: 2, page_size: 10 }),
      );
    });
  });
});
