import "@/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUsageModels, type UsageModelsResponse } from "./personal-usage";
import { loadAllUsageModels } from "./personal-usage-models";

vi.mock("./personal-usage", () => ({ getUsageModels: vi.fn() }));
const context = { account_type: "personal" as const };
const query = { range: "30d" as const };
const item = {
  model_code: "model-1",
  model_alias: "model-1",
  model_name: "Model 1",
  vendor: "Vendor",
  requests: 1,
  input_tokens: 1,
  output_tokens: 0,
  cached_tokens: 0,
  cost_yuan: "1",
  average_latency_ms: null,
};
function page(
  items: UsageModelsResponse["items"],
  current = 1,
  total = items.length,
  pageSize = 20,
): UsageModelsResponse {
  return {
    can_view_billing: true,
    items,
    page: current,
    page_size: pageSize,
    total,
  };
}
beforeEach(() => vi.resetAllMocks());

describe("完整用量模型目录请求边界", () => {
  it("真正的空列表正常返回且不继续翻页", async () => {
    vi.mocked(getUsageModels).mockResolvedValue(page([]));
    await expect(
      loadAllUsageModels(context, query, new AbortController().signal),
    ).resolves.toMatchObject({ items: [], total: 0 });
    expect(getUsageModels).toHaveBeenCalledOnce();
  });

  it("服务端缩小页大小时沿用实际页大小补齐", async () => {
    vi.mocked(getUsageModels)
      .mockResolvedValueOnce(page([item], 1, 2, 1))
      .mockResolvedValueOnce(
        page([{ ...item, model_code: "model-2" }], 2, 2, 1),
      );
    const signal = new AbortController().signal;
    await expect(
      loadAllUsageModels(context, query, signal),
    ).resolves.toMatchObject({
      items: [item, { ...item, model_code: "model-2" }],
    });
    expect(getUsageModels).toHaveBeenLastCalledWith(
      context,
      { range: "30d", page: 2, page_size: 1 },
      signal,
    );
  });

  it.each([
    ["重复页码", page([{ ...item, model_code: "model-2" }], 1, 2, 1)],
    ["重复内容", page([item], 2, 2, 1)],
    ["未完成却返回空页", page([], 2, 2, 1)],
    ["中途改变页大小", page([{ ...item, model_code: "model-2" }], 2, 2, 2)],
  ])("%s 时停止，防止请求循环或静默截断", async (_label, response) => {
    vi.mocked(getUsageModels)
      .mockResolvedValueOnce(page([item], 1, 2, 1))
      .mockResolvedValue(response);
    await expect(
      loadAllUsageModels(context, query, new AbortController().signal),
    ).rejects.toMatchObject({ name: "ApiError", code: 100002 });
    expect(getUsageModels).toHaveBeenCalledTimes(2);
  });

  it("total 在分页期间增长也只读取首响应确定的页数", async () => {
    vi.mocked(getUsageModels)
      .mockResolvedValueOnce(page([item], 1, 2, 1))
      .mockResolvedValueOnce(
        page([{ ...item, model_code: "model-2" }], 2, 999, 1),
      );
    await expect(
      loadAllUsageModels(context, query, new AbortController().signal),
    ).resolves.toMatchObject({ total: 2 });
    expect(getUsageModels).toHaveBeenCalledTimes(2);
  });

  it("预先取消时不请求；请求返回前取消时不发起下一页", async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(
      loadAllUsageModels(context, query, cancelled.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(getUsageModels).not.toHaveBeenCalled();
    const controller = new AbortController();
    vi.mocked(getUsageModels).mockImplementation(async () => {
      controller.abort();
      return page([item], 1, 2, 1);
    });
    await expect(
      loadAllUsageModels(context, query, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(getUsageModels).toHaveBeenCalledOnce();
  });
});
