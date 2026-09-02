import "@/i18n";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthTokens, saveAuthTokens } from "@/auth/token-storage";
import type { AuthResult } from "@/api/auth";
import { ApiError } from "@/api/http";
import {
  confirmEnterpriseFaceVerification,
  getEnterpriseCertification,
  NEW_ENTERPRISE_CREATE_PATH,
  startEnterpriseFaceVerification,
  submitEnterpriseCertification,
  uploadEnterpriseCertificationMaterial,
  type EnterpriseCertification,
} from "@/api/enterprise-certification";
import {
  getProfileEnterprises,
  type EnterpriseMembership,
} from "@/api/profile";
import { AppStoreProvider, useAppStore } from "@/data/app-state";
import { createAppStore } from "@/store";
import i18n from "@/i18n";
import { EnterpriseCreatePage } from "./console-account";

vi.mock("qrcode", () => ({
  default: { toCanvas: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/api/enterprise-certification", async () => {
  const actual = await vi.importActual<
    typeof import("@/api/enterprise-certification")
  >("@/api/enterprise-certification");
  return {
    ...actual,
    getEnterpriseCertification: vi.fn(),
    uploadEnterpriseCertificationMaterial: vi.fn(),
    submitEnterpriseCertification: vi.fn(),
    startEnterpriseFaceVerification: vi.fn(),
    confirmEnterpriseFaceVerification: vi.fn(),
  };
});
vi.mock("@/api/profile", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/profile")>("@/api/profile");
  return { ...actual, getProfileEnterprises: vi.fn() };
});

const getCertificationMock = vi.mocked(getEnterpriseCertification);
const uploadMaterialMock = vi.mocked(uploadEnterpriseCertificationMaterial);
const submitCertificationMock = vi.mocked(submitEnterpriseCertification);
const startFaceMock = vi.mocked(startEnterpriseFaceVerification);
const confirmFaceMock = vi.mocked(confirmEnterpriseFaceVerification);
const getProfileEnterprisesMock = vi.mocked(getProfileEnterprises);

const AUTH_RESULT: AuthResult = {
  status: "succeeded",
  binding_required: false,
  access_token: "enterprise-token",
  refresh_token: "enterprise-refresh",
  refresh_expires_at: Date.UTC(2099, 0, 1),
  user: {
    id: "01K0USERPUBLICIDEXAMPLE01",
    display_name: "测试用户",
    avatar_url: "",
    locale: "zh-CN",
    timezone: "Asia/Shanghai",
    status: "active",
  },
};
const UNSUBMITTED: EnterpriseCertification = {
  status: "unsubmitted",
  current_stage: "not_started",
};
const COMPLETED: EnterpriseCertification = {
  status: "approved",
  current_stage: "completed",
  applicant_type: "legal_representative",
  enterprise_id: "ent_test",
  enterprise_name: "测试企业",
  credit_code_masked: "9133**********AB2C",
  legal_representative_masked: "张*",
};
const FACE_REQUIRED: EnterpriseCertification = {
  id: "cert_test",
  status: "checking",
  current_stage: "face_verification_required",
  enterprise_name: "测试企业",
  credit_code_masked: "9133**********AB2C",
  applicant_type: "legal_representative",
};
const FACE_ACTIVE: EnterpriseCertification = {
  ...FACE_REQUIRED,
  current_stage: "face_verification",
  face_url: "https://example.com/face",
};
const MANUAL_REVIEW: EnterpriseCertification = {
  id: "cert_agent",
  status: "submitted",
  current_stage: "manual_review",
  applicant_type: "authorized_agent",
  enterprise_name: "测试企业",
  credit_code_masked: "9133**********AB2C",
  authorized_agent_name_masked: "王*",
};
const MEMBERSHIP: EnterpriseMembership = {
  id: "mem_test",
  enterprise_id: "ent_test",
  enterprise_name: "测试企业",
  enterprise_code: "ent_test",
  member_status: "active",
  join_source: "certification",
  roles: ["owner"],
  owner: true,
  joined_at: Date.parse("2026-07-29T00:00:00Z"),
  exited_at: null,
  version: 1,
};

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}
function WorkspaceProbe() {
  const store = useAppStore();
  return (
    <output data-testid="workspace-names">
      {store.workspaces.map((workspace) => workspace.name).join("|")}
    </output>
  );
}
function renderPage(initialEntry = "/console/enterprise-create") {
  const appStore = createAppStore();
  appStore.dispatch({
    type: "auth/loginWithEmail/fulfilled",
    payload: AUTH_RESULT.user,
  });
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Provider store={appStore}>
        <AppStoreProvider>
          <EnterpriseCreatePage />
          <LocationProbe />
          <WorkspaceProbe />
        </AppStoreProvider>
      </Provider>
    </MemoryRouter>,
  );
}

async function uploadLicense(
  container: HTMLElement,
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  const input = container.querySelector<HTMLInputElement>(
    "#enterprise-license",
  );
  expect(input).not.toBeNull();
  await user.upload(
    input as HTMLInputElement,
    new File(["png"], "license.png", { type: "image/png" }),
  );
}

async function fillBaseFields(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  const name = screen.getByRole("textbox", { name: /企业名称/ });
  if (!(name as HTMLInputElement).value) await user.type(name, "测试企业");
  const code = screen.getByRole("textbox", { name: /统一社会信用代码/ });
  if (!(code as HTMLInputElement).value)
    await user.type(code, "91330100MA1FL0AB2C");
  const legalName = screen.getByRole("textbox", {
    name: /^法定代表人$/,
  });
  if (!(legalName as HTMLInputElement).value)
    await user.type(legalName, "张三");
  await user.type(
    screen.getByRole("textbox", { name: /法定代表人身份证件号/ }),
    "110101199001011234",
  );
  await user.type(screen.getByRole("textbox", { name: /企业联系人/ }), "李四");
  await user.type(
    screen.getByRole("textbox", { name: /联系电话/ }),
    "0571-12345678",
  );
}

describe("enterprise verification page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthTokens();
    window.localStorage.clear();
    saveAuthTokens(AUTH_RESULT);
    getCertificationMock.mockResolvedValue(UNSUBMITTED);
    getProfileEnterprisesMock.mockResolvedValue([]);
    startFaceMock.mockResolvedValue(FACE_ACTIVE);
    confirmFaceMock.mockResolvedValue(FACE_ACTIVE);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:material"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("shows the reference-style form without other-organization logic", async () => {
    const user = userEvent.setup();
    renderPage(NEW_ENTERPRISE_CREATE_PATH);
    expect(
      await screen.findByRole("heading", { name: "基本信息" }),
    ).toBeInTheDocument();
    expect(getCertificationMock).toHaveBeenCalledWith("enterprise-token");
    expect(screen.getByRole("radio", { name: "企业" })).toBeChecked();
    expect(
      screen.queryByRole("radio", { name: "其他组织" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "法定代表人" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "代办人" })).not.toBeChecked();
    expect(
      within(screen.getByRole("list", { name: "企业认证步骤" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "提交认证" }));
    expect(await screen.findByText("营业执照必填")).toBeInTheDocument();
    expect(screen.getByText("法定代表人必填")).toBeInTheDocument();
  });

  it("starts with an empty form in new mode even when an old face session exists", async () => {
    getCertificationMock.mockResolvedValue(FACE_ACTIVE);
    renderPage(NEW_ENTERPRISE_CREATE_PATH);

    expect(
      await screen.findByRole("heading", { name: "基本信息" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /企业名称/ })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: /统一社会信用代码/ })).toHaveValue(
      "",
    );
    expect(startFaceMock).not.toHaveBeenCalled();
  });

  it("shows the completed result and refreshes enterprise workspaces", async () => {
    getCertificationMock.mockResolvedValue(COMPLETED);
    getProfileEnterprisesMock.mockResolvedValue([MEMBERSHIP]);
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "企业认证已完成" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "企业认证步骤" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(3);
    await waitFor(() =>
      expect(getProfileEnterprisesMock).toHaveBeenCalledWith(
        "enterprise-token",
      ),
    );
    expect(screen.getByTestId("workspace-names")).toHaveTextContent("测试企业");
  });

  it("submits the legal representative form and opens face verification automatically", async () => {
    const user = userEvent.setup();
    let resolveUpload:
      | ((
          result: Awaited<
            ReturnType<typeof uploadEnterpriseCertificationMaterial>
          >,
        ) => void)
      | undefined;
    uploadMaterialMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );
    submitCertificationMock.mockResolvedValue(FACE_REQUIRED);
    const view = renderPage();
    await screen.findByRole("heading", { name: "基本信息" });
    await uploadLicense(view.container, user);
    expect(await screen.findByText("正在识别营业执照")).toBeInTheDocument();
    await act(async () => {
      resolveUpload?.({
        resource_url: "/material/license",
        file_name: "license.png",
        mime_type: "image/png",
        size_bytes: 3,
        recognition: {
          enterprise_name: "测试企业",
          credit_code: "91330100MA1FL0AB2C",
          legal_representative: "张三",
        },
      });
    });
    await fillBaseFields(user);
    await user.click(screen.getByRole("checkbox", { name: /我已阅读并同意/ }));
    await user.click(screen.getByRole("button", { name: "提交认证" }));
    await waitFor(() =>
      expect(submitCertificationMock).toHaveBeenCalledWith("enterprise-token", {
        enterprise_name: "测试企业",
        credit_code: "91330100MA1FL0AB2C",
        legal_representative: "张三",
        legal_representative_id: "110101199001011234",
        contact_name: "李四",
        contact_phone: "0571-12345678",
        applicant_type: "legal_representative",
        license_url: "/material/license",
        consent: true,
      }),
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "基本信息" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "法人扫码核验" }),
    ).not.toBeInTheDocument();
    expect(startFaceMock).toHaveBeenCalledTimes(1);
  });

  it("submits agent materials and goes directly to the two-step manual review page", async () => {
    const user = userEvent.setup();
    uploadMaterialMock.mockImplementation((_token, file, materialType) =>
      Promise.resolve(
        materialType === "authorization_letter"
          ? {
              resource_url: "/material/authorization",
              file_name: file.name,
              mime_type: file.type,
              size_bytes: file.size,
            }
          : {
              resource_url: "/material/license",
              file_name: file.name,
              mime_type: file.type,
              size_bytes: file.size,
              recognition: {
                enterprise_name: "测试企业",
                credit_code: "91330100MA1FL0AB2C",
                legal_representative: "张三",
              },
            },
      ),
    );
    submitCertificationMock.mockResolvedValue(MANUAL_REVIEW);
    const view = renderPage();
    await user.click(await screen.findByRole("radio", { name: "代办人" }));
    expect(
      within(screen.getByRole("list", { name: "企业认证步骤" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(2);
    await uploadLicense(view.container, user);
    const authorizationInput = view.container.querySelector<HTMLInputElement>(
      "#enterprise-authorization",
    );
    expect(authorizationInput).not.toBeNull();
    await user.upload(
      authorizationInput as HTMLInputElement,
      new File(["pdf"], "authorization.pdf", { type: "application/pdf" }),
    );
    await fillBaseFields(user);
    await user.type(
      screen.getByRole("textbox", { name: /被授权经办人姓名/ }),
      "王五",
    );
    await user.type(
      screen.getByRole("textbox", { name: /被授权经办人身份证号/ }),
      "110101199001010015",
    );
    await user.click(screen.getByRole("checkbox", { name: /我已阅读并同意/ }));
    await user.click(screen.getByRole("button", { name: "提交认证" }));
    await waitFor(() =>
      expect(submitCertificationMock).toHaveBeenCalledWith(
        "enterprise-token",
        expect.objectContaining({
          applicant_type: "authorized_agent",
          authorized_agent_name: "王五",
          authorized_agent_id: "110101199001010015",
          authorization_url: "/material/authorization",
        }),
      ),
    );
    expect(
      await screen.findByRole("heading", { name: "企业资料审核中" }),
    ).toBeInTheDocument();
    expect(startFaceMock).not.toHaveBeenCalled();
    expect(confirmFaceMock).not.toHaveBeenCalled();
  });

  it("restores an agent application directly into manual review", async () => {
    getCertificationMock.mockResolvedValue(MANUAL_REVIEW);
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "企业资料审核中" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "企业认证步骤" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(2);
    expect(startFaceMock).not.toHaveBeenCalled();
  });

  it("keeps the face dialog open when confirmation is still pending", async () => {
    const user = userEvent.setup();
    getCertificationMock.mockResolvedValue(FACE_REQUIRED);
    confirmFaceMock.mockResolvedValue(FACE_ACTIVE);
    renderPage();
    // 中文：法人进入核验阶段后会自动发起刷脸并打开二维码弹窗。
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(startFaceMock).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("button", {
        name: i18n.t("console.enterpriseCreate.faceCompleted"),
      }),
    );
    expect(
      await screen.findByText(
        i18n.t("console.enterpriseCreate.faceConfirmPendingTitle"),
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("returns to the information step when the face dialog is closed", async () => {
    const user = userEvent.setup();
    getCertificationMock.mockResolvedValue(FACE_ACTIVE);
    renderPage();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(startFaceMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", {
        name: i18n.t("console.enterpriseCreate.closeFace"),
      }),
    ).toHaveClass("semi-button-outline");
    expect(
      screen.getByRole("button", {
        name: i18n.t("console.enterpriseCreate.faceCompleted"),
      }),
    ).toHaveClass("semi-button-solid");
    await user.click(
      screen.getByRole("button", {
        name: i18n.t("console.enterpriseCreate.closeFace"),
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "基本信息" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "代办人" }));
    expect(screen.getByRole("radio", { name: "代办人" })).toBeChecked();
    expect(
      screen.getByRole("heading", { name: "基本信息" }),
    ).toBeInTheDocument();
  });

  it("shows the API message when face confirmation fails", async () => {
    const user = userEvent.setup();
    getCertificationMock.mockResolvedValue(FACE_REQUIRED);
    confirmFaceMock.mockRejectedValue(
      new ApiError("请求参数无效", 400, 100001, "request-face-confirm"),
    );
    renderPage();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(startFaceMock).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("button", {
        name: i18n.t("console.enterpriseCreate.faceCompleted"),
      }),
    );
    expect(await screen.findByText("请求参数无效")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("invalidates an expired session and returns to the home page", async () => {
    getCertificationMock.mockRejectedValue(
      new ApiError("expired", 401, 110001, "request-2"),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/"),
    );
    expect(
      window.sessionStorage.getItem("token-nx:user-front:refresh"),
    ).toBeNull();
  });
});
