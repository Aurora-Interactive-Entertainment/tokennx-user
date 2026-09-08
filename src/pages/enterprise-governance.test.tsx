import "@/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthResult } from "@/api/auth";
import { clearAuthTokens, saveAuthTokens } from "@/auth/token-storage";
import {
  deleteEnterpriseRole,
  getEnterpriseContext,
  getEnterpriseGovernance,
  type EnterpriseContext,
  type EnterpriseGovernanceResponse,
  type EnterprisePermissionDefinition,
  type EnterpriseRole,
} from "@/api/enterprise-console";
import { AppStoreProvider } from "@/data/app-state";
import { createAppStore } from "@/store";
import { EnterpriseGovernancePage } from "./enterprise-governance";

vi.mock("@/api/enterprise-console", async () => {
  const actual = await vi.importActual<
    typeof import("@/api/enterprise-console")
  >("@/api/enterprise-console");
  return {
    ...actual,
    deleteEnterpriseRole: vi.fn(),
    getEnterpriseContext: vi.fn(),
    getEnterpriseGovernance: vi.fn(),
  };
});

const deleteEnterpriseRoleMock = vi.mocked(deleteEnterpriseRole);
const getEnterpriseContextMock = vi.mocked(getEnterpriseContext);
const getEnterpriseGovernanceMock = vi.mocked(getEnterpriseGovernance);

const ENTERPRISE_ID = "ent_governance_test";
const AUTH_RESULT: AuthResult = {
  status: "succeeded",
  binding_required: false,
  access_token: "enterprise-token",
  refresh_token: "enterprise-refresh",
  refresh_expires_at: Date.UTC(2099, 0, 1),
  user: {
    id: "user_governance_test",
    display_name: "治理测试用户",
    avatar_url: "",
    locale: "zh-CN",
    timezone: "Asia/Shanghai",
    status: "active",
  },
};

const CONTEXT: EnterpriseContext = {
  id: ENTERPRISE_ID,
  name: "治理测试企业",
  code: "ENT-GOVERNANCE-TEST",
  member_id: "membership_governance_test",
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

const PERMISSION: EnterprisePermissionDefinition = {
  id: "permission-roles-view",
  code: "roles.view",
  name: "查看角色权限",
  description: "查看企业角色和权限矩阵",
  resource: "roles",
  action: "view",
  depends_on: [],
};

const CUSTOM_ROLE: EnterpriseRole = {
  id: "role-data-analyst",
  code: "data_analyst",
  name: "数据分析员",
  description: "查看数据分析结果",
  built_in: false,
  owner_role: false,
  status: "active",
  version: 7,
  member_count: 0,
  invitation_count: 0,
  permission_codes: ["roles.view"],
};

function governanceResponse(
  roles: EnterpriseRole[] = [CUSTOM_ROLE],
): EnterpriseGovernanceResponse {
  return { context: CONTEXT, permissions: [PERMISSION], roles };
}

function setEnterpriseWorkspace(): void {
  window.localStorage.setItem(
    "token-nx:user-front:v1",
    JSON.stringify({
      activeWorkspaceId: ENTERPRISE_ID,
      workspaces: [
        {
          id: ENTERPRISE_ID,
          name: CONTEXT.name,
          type: "enterprise",
          role: "owner",
        },
      ],
    }),
  );
}

function renderPage(): void {
  setEnterpriseWorkspace();
  const appStore = createAppStore();
  appStore.dispatch({
    type: "auth/loginWithEmail/fulfilled",
    payload: AUTH_RESULT.user,
  });
  render(
    <MemoryRouter initialEntries={["/console/enterprise-governance"]}>
      <Provider store={appStore}>
        <AppStoreProvider>
          <EnterpriseGovernancePage />
        </AppStoreProvider>
      </Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAuthTokens();
  window.localStorage.clear();
  saveAuthTokens(AUTH_RESULT);
  getEnterpriseContextMock.mockResolvedValue(CONTEXT);
  getEnterpriseGovernanceMock.mockResolvedValue(governanceResponse());
  deleteEnterpriseRoleMock.mockResolvedValue();
});

describe("企业权限管理页面", () => {
  it("首次加载角色时可以打开标准 AppModal 删除确认弹窗", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      (await screen.findByText("删除角色")).closest(
        "button",
      ) as HTMLButtonElement,
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("确定删除“数据分析员”角色吗？");
    expect(
      within(dialog).getByRole("heading", { name: "删除角色" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "confirm" }),
    ).toHaveTextContent("确认删除");
  });

  it("确认删除时使用当前角色和版本并更新角色列表", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      (await screen.findByText("删除角色")).closest(
        "button",
      ) as HTMLButtonElement,
    );
    await user.click(await screen.findByRole("button", { name: "confirm" }));

    await waitFor(() =>
      expect(deleteEnterpriseRoleMock).toHaveBeenCalledWith(
        { enterprise_id: ENTERPRISE_ID },
        CUSTOM_ROLE.id,
        CUSTOM_ROLE.version,
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toHaveClass(
        "semi-modal-content-animate-hide",
      ),
    );
    expect(await screen.findByText("选择一个角色")).toBeInTheDocument();
  });

  it("取消删除不会调用删除接口", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      (await screen.findByText("删除角色")).closest(
        "button",
      ) as HTMLButtonElement,
    );
    await user.click(await screen.findByRole("button", { name: "cancel" }));

    expect(deleteEnterpriseRoleMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveClass(
      "semi-modal-content-animate-hide",
    );
  });
});
