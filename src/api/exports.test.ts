import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthTokens, saveAuthTokens } from "@/auth/token-storage";
import {
  createExportTask,
  downloadExportTask,
  getExportErrorMessage,
} from "./exports";
import { ApiError } from "./http";

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("exports API", () => {
  beforeEach(() => {
    saveAuthTokens({
      status: "succeeded",
      binding_required: false,
      access_token: "export-token",
      refresh_token: "export-refresh-token",
      refresh_expires_at: Date.UTC(2099, 0, 1),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearAuthTokens();
  });

  it("creates an export task with context, filters, and idempotency", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      envelope({
        id: "export-1",
        export_no: "UEXP-export-1",
        export_code: "enterprise.audit_logs",
        format: "csv",
        status: "queued",
        progress: 0,
        file_name: "audit.csv",
        row_count: 0,
        size_bytes: 0,
        requested_at: 0,
        downloadable: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createExportTask(
      {
        export_code: "enterprise.audit_logs",
        format: "csv",
        context: { enterprise_id: "ent-1" },
        filters: { action: "enterprise.member.update" },
      },
      { idempotencyKey: "audit-export-1" },
    );

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/user/exports");
    const request = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(request?.headers).get("Authorization")).toBe(
      "Bearer export-token",
    );
    expect(new Headers(request?.headers).get("Idempotency-Key")).toBe(
      "audit-export-1",
    );
    expect(JSON.parse(String(request?.body))).toMatchObject({
      export_code: "enterprise.audit_logs",
      context: { enterprise_id: "ent-1" },
      filters: { action: "enterprise.member.update" },
    });
  });

  it("keeps the download response as a binary stream", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("csv-bytes", {
        status: 200,
        headers: { "Content-Type": "text/csv" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await downloadExportTask("export-1");
    expect(await response.text()).toBe("csv-bytes");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/user/exports/export-1/download",
    );
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Accept")).toBe(
      "*/*",
    );
  });

  it("maps export task API errors to localized messages", () => {
    expect(getExportErrorMessage(new ApiError("limit", 429, 150005, null))).toBe(
      "导出任务数量已达上限，请稍后再试",
    );
  });
});
