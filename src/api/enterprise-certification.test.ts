import "@/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmEnterpriseFaceVerification,
  getEnterpriseCertification,
  normalizeEnterpriseCreditCode,
  startEnterpriseFaceVerification,
  submitEnterpriseCertification,
  uploadEnterpriseCertificationMaterial,
  validateEnterpriseCertificationForm,
  type EnterpriseCertification,
} from "./enterprise-certification";

const CERTIFICATION: EnterpriseCertification = {
  status: "unsubmitted",
  current_stage: "not_started",
};

function response(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("enterprise certification API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("queries and submits the complete legal representative request", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(response(CERTIFICATION)));
    await expect(
      getEnterpriseCertification("enterprise-token"),
    ).resolves.toEqual(CERTIFICATION);
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(
      "/api/user/enterprise/certification",
    );

    const request = {
      enterprise_name: "测试企业",
      credit_code: "91330100MA1FL0AB2C",
      legal_representative: "张三",
      legal_representative_id: "110101199001011234",
      contact_name: "李四",
      contact_phone: "0571-12345678",
      applicant_type: "legal_representative" as const,
      license_url:
        "/api/user/enterprise/certification/materials/license/content",
      consent: true as const,
    };
    await submitEnterpriseCertification("enterprise-token", request);
    expect(fetchMock.mock.calls.at(-1)?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))).toEqual(
      request,
    );
  });

  it("submits all authorized agent fields", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        response({ status: "submitted", current_stage: "manual_review" }),
      );
    const request = {
      enterprise_name: "测试企业",
      credit_code: "91330100MA1FL0AB2C",
      legal_representative: "张三",
      legal_representative_id: "110101199001011234",
      contact_name: "李四",
      contact_phone: "0571-12345678",
      applicant_type: "authorized_agent" as const,
      authorized_agent_name: "王五",
      authorized_agent_id: "110101199001010015",
      license_url: "/material/license",
      authorization_url: "/material/authorization",
      consent: true as const,
    };
    await submitEnterpriseCertification("enterprise-token", request);
    expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))).toEqual(
      request,
    );
  });

  it("uploads each material with its explicit type", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        response({
          resource_url: "/material",
          file_name: "license.png",
          mime_type: "image/png",
          size_bytes: 3,
        }),
      ),
    );
    const file = new File(["png"], "license.png", { type: "image/png" });
    await uploadEnterpriseCertificationMaterial("enterprise-token", file);
    const options = fetchMock.mock.calls.at(-1)?.[1];
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(
      "/api/user/enterprise/certification/materials",
    );
    expect(options?.body).toBeInstanceOf(FormData);
    expect((options?.body as FormData).get("material_type")).toBe(
      "business_license",
    );
    expect((options?.body as FormData).get("file")).toBe(file);
    expect(new Headers(options?.headers).has("Content-Type")).toBe(false);

    const authorization = new File(["pdf"], "authorization.pdf", {
      type: "application/pdf",
    });
    await uploadEnterpriseCertificationMaterial(
      "enterprise-token",
      authorization,
      "authorization_letter",
    );
    expect(
      (fetchMock.mock.calls.at(-1)?.[1]?.body as FormData).get("material_type"),
    ).toBe("authorization_letter");
    expect(
      (fetchMock.mock.calls.at(-1)?.[1]?.body as FormData).get("file"),
    ).toBe(authorization);
  });

  it("starts and confirms legal representative face verification", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        response({
          status: "checking",
          current_stage: "face_verification",
          face_url: "https://example.com/face",
        }),
      ),
    );
    await startEnterpriseFaceVerification(
      "enterprise-token",
      "https://console.example.com/console/enterprise-create",
    );
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(
      "/api/user/enterprise/certification/face",
    );
    expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))).toEqual({
      return_url: "https://console.example.com/console/enterprise-create",
    });
    await confirmEnterpriseFaceVerification("enterprise-token");
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(
      "/api/user/enterprise/certification/face/confirm",
    );
    expect(fetchMock.mock.calls.at(-1)?.[1]?.body).toBeUndefined();
  });

  it("normalizes credit codes and validates every required submission field", () => {
    expect(normalizeEnterpriseCreditCode(" 91330100ma1fl0ab2c ")).toBe(
      "91330100MA1FL0AB2C",
    );
    expect(
      validateEnterpriseCertificationForm({
        enterpriseName: "",
        creditCode: "",
        legalRepresentative: "",
        legalRepresentativeId: "",
        contactName: "",
        contactPhone: "",
        applicantType: "authorized_agent",
        authorizedAgentName: "",
        authorizedAgentId: "",
        licenseUrl: "",
        authorizationUrl: "",
        consent: false,
      }),
    ).toMatchObject({
      enterpriseName: "企业名称必填",
      creditCode: "统一社会信用代码必填",
      legalRepresentative: "法定代表人必填",
      legalRepresentativeId: "法定代表人身份证件号必填",
      contactName: "企业联系人必填",
      contactPhone: "联系电话必填",
      authorizedAgentName: "被授权经办人姓名必填",
      authorizedAgentId: "被授权经办人身份证号必填",
      licenseUrl: "营业执照必填",
      authorizationUrl: "授权书必填",
      consent: "请阅读并同意《服务协议》、《隐私政策》",
    });
    expect(
      validateEnterpriseCertificationForm({
        enterpriseName: "测试企业",
        creditCode: "91330100MA1FL0AB2C",
        legalRepresentative: "张三",
        legalRepresentativeId: "110101199001011234",
        contactName: "李四",
        contactPhone: "0571-12345678",
        applicantType: "legal_representative",
        authorizedAgentName: "",
        authorizedAgentId: "",
        licenseUrl: "/material",
        authorizationUrl: "",
        consent: true,
      }),
    ).toEqual({});
  });
});
