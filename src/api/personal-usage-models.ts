import i18n from "@/i18n";
import { ApiError } from "./http";
import {
  getUsageModels,
  type PersonalUsageContext,
  type UsageModelsQuery,
  type UsageModelsResponse,
} from "./personal-usage";

// 保留接口已有的默认每页大小，不依赖未确认的更大分页上限。
const PAGE_SIZE = 20;

function invalidPage(): ApiError {
  return new ApiError(
    i18n.t("api.personalUsage.invalidResponse"),
    502,
    100002,
    null,
  );
}

/** 当前模型列表没有分页交互，因此按首响应总数补齐后再一次性展示。 */
export async function loadAllUsageModels(
  context: PersonalUsageContext,
  query: Omit<UsageModelsQuery, "page" | "page_size">,
  signal: AbortSignal,
): Promise<UsageModelsResponse> {
  let first: UsageModelsResponse | undefined;
  const items: UsageModelsResponse["items"] = [];
  const seen = new Set<string>();
  let totalPages = 1;
  let pageSize = PAGE_SIZE;
  for (let page = 1; page <= totalPages; page++) {
    signal.throwIfAborted();
    const response = await getUsageModels(
      context,
      { ...query, page, page_size: pageSize },
      signal,
    );
    signal.throwIfAborted();
    if (
      response.page !== page ||
      response.page_size > pageSize ||
      response.items.length > response.page_size
    )
      throw invalidPage();
    if (!first) {
      first = response;
      pageSize = response.page_size;
      // 总页数只取首响应，避免服务端不断增加 total 导致本轮请求无法结束。
      totalPages = Math.ceil(first.total / pageSize);
    } else if (response.page_size !== pageSize) throw invalidPage();
    for (const item of response.items) {
      const key = JSON.stringify([item.model_code, item.vendor]);
      if (seen.has(key)) throw invalidPage();
      seen.add(key);
      items.push(item);
    }
    if (items.length >= first.total) return { ...first, items };
    // 未达到总数就返回空页或末页，必须报错并允许重试，不能把截断结果当成完整统计。
    if (response.items.length === 0) throw invalidPage();
  }
  throw invalidPage();
}
