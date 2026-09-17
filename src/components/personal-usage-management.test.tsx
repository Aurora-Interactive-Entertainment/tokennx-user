import "@/i18n";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalUsageManagement } from "./personal-usage-management";
import {
  getUsageFilters,
  getUsageModels,
  getUsageRecords,
  getUsageSummary,
  type UsageModelsResponse,
} from "@/api/personal-usage";

vi.mock("@/api/personal-usage", async (original) => ({
  ...(await original<object>()),
  getUsageFilters: vi.fn(),
  getUsageModels: vi.fn(),
  getUsageRecords: vi.fn(),
  getUsageSummary: vi.fn(),
}));
vi.mock("@/components/app-toast", () => ({ appToast: { error: vi.fn() } }));
const context = { account_type: "personal" as const };
const summary = {
  can_view_billing: true,
  metrics: {
    request_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    total_cost_yuan: "2",
    average_latency_ms: null,
    success_rate: null,
  },
};
function model(index: number, prefix = "model") {
  return {
    model_code: `${prefix}-${index}`,
    model_alias: `${prefix}-${index}`,
    model_name: `${prefix}-${index}`,
    vendor: "Vendor",
    requests: 1,
    input_tokens: 1,
    output_tokens: 0,
    cached_tokens: 0,
    cost_yuan: "1",
    average_latency_ms: null,
  };
}
function page(
  number: number,
  total: number,
  prefix = "model",
): UsageModelsResponse {
  return {
    can_view_billing: true,
    items: Array.from(
      { length: Math.min(20, Math.max(0, total - (number - 1) * 20)) },
      (_, index) => model((number - 1) * 20 + index + 1, prefix),
    ),
    page: number,
    page_size: 20,
    total,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getUsageFilters).mockResolvedValue({
    can_filter_members: false,
    models: [],
    api_keys: [],
    statuses: [],
    members: [],
  });
  vi.mocked(getUsageSummary).mockResolvedValue(summary);
  vi.mocked(getUsageRecords).mockResolvedValue({
    account: { id: "personal", type: "personal", name: "User" },
    can_filter_members: false,
    can_view_billing: true,
    filters: { models: [], api_keys: [], members: [] },
    items: [],
    page: 1,
    page_size: 10,
    total: 0,
  });
});

describe("个人用量模型统计完整性", () => {
  it("单页保持原列表内容且只请求一次", async () => {
    vi.mocked(getUsageModels).mockResolvedValue(page(1, 2));
    render(
      <PersonalUsageManagement
        context={context}
        onApiKeyChange={() => undefined}
      />,
    );
    expect(await screen.findByText("model-2")).toBeInTheDocument();
    expect(getUsageModels).toHaveBeenCalledOnce();
  });

  it("超过 20 个模型自动补齐下一页，沿用已支持的 page_size=20", async () => {
    vi.mocked(getUsageModels).mockImplementation(async (_context, query) =>
      page(query?.page ?? 1, 23),
    );
    render(
      <PersonalUsageManagement
        context={context}
        apiKeyID="key-A"
        onApiKeyChange={() => undefined}
      />,
    );
    expect(await screen.findByText("model-23")).toBeInTheDocument();
    expect(document.querySelectorAll(".personal-usage-model-row")).toHaveLength(
      23,
    );
    expect(getUsageModels).toHaveBeenLastCalledWith(
      context,
      { range: "30d", api_key_id: "key-A", page: 2, page_size: 20 },
      expect.any(AbortSignal),
    );
    expect(getUsageModels).toHaveBeenCalledTimes(2);
  });

  it("后续分页失败停止加载并提供重试，不把部分列表当成完整结果", async () => {
    vi.mocked(getUsageModels)
      .mockResolvedValueOnce(page(1, 43))
      .mockRejectedValueOnce(new Error("第二页加载失败"));
    render(
      <PersonalUsageManagement
        context={context}
        onApiKeyChange={() => undefined}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "第二页加载失败",
    );
    expect(getUsageModels).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("model-1")).not.toBeInTheDocument();
  });

  it("切换 API Key 后忽略旧模型与摘要迟到响应，也不继续请求旧 Key 的下一页", async () => {
    const oldModels = deferred<UsageModelsResponse>();
    const oldSummary = deferred<typeof summary>();
    vi.mocked(getUsageModels).mockImplementation(async (_context, query) =>
      query?.api_key_id === "key-A" ? oldModels.promise : page(1, 1, "new"),
    );
    vi.mocked(getUsageSummary).mockImplementation(async (_context, query) =>
      query?.api_key_id === "key-A" ? oldSummary.promise : summary,
    );
    const { rerender } = render(
      <PersonalUsageManagement
        context={context}
        apiKeyID="key-A"
        onApiKeyChange={() => undefined}
      />,
    );
    const oldSignal = vi.mocked(getUsageModels).mock.calls[0][2];
    rerender(
      <PersonalUsageManagement
        context={context}
        apiKeyID="key-B"
        onApiKeyChange={() => undefined}
      />,
    );
    expect(await screen.findByText("new-1")).toBeInTheDocument();
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => {
      oldModels.resolve(page(1, 43, "old"));
      oldSummary.resolve({
        ...summary,
        metrics: { ...summary.metrics, total_cost_yuan: "99" },
      });
    });
    expect(screen.getByText("new-1")).toBeInTheDocument();
    expect(screen.queryByText("old-1")).not.toBeInTheDocument();
    expect(
      document.querySelector(".personal-usage-model-total"),
    ).toHaveTextContent("￥2");
    expect(getUsageModels).toHaveBeenCalledTimes(2);
  });

  it("切换企业时取消旧企业第二页，迟到分页不能覆盖新主体或继续翻页", async () => {
    const oldSecondPage = deferred<UsageModelsResponse>();
    vi.mocked(getUsageModels).mockImplementation(async (scope, query) => {
      if (
        scope.account_type === "enterprise" &&
        scope.enterprise_id === "enterprise-A"
      )
        return (query?.page ?? 1) === 1
          ? page(1, 43, "old")
          : oldSecondPage.promise;
      return page(1, 1, "new");
    });
    const { rerender } = render(
      <PersonalUsageManagement
        context={{ account_type: "enterprise", enterprise_id: "enterprise-A" }}
        onApiKeyChange={() => undefined}
      />,
    );
    await waitFor(() => expect(getUsageModels).toHaveBeenCalledTimes(2));
    const oldSignal = vi.mocked(getUsageModels).mock.calls[1][2];
    rerender(
      <PersonalUsageManagement
        context={{ account_type: "enterprise", enterprise_id: "enterprise-B" }}
        onApiKeyChange={() => undefined}
      />,
    );
    expect(await screen.findByText("new-1")).toBeInTheDocument();
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => {
      oldSecondPage.resolve(page(2, 43, "old"));
    });
    expect(screen.getByText("new-1")).toBeInTheDocument();
    expect(screen.queryByText("old-21")).not.toBeInTheDocument();
    expect(getUsageModels).toHaveBeenCalledTimes(3);
  });
});
