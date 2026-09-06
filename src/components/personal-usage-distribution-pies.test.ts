import { describe, expect, it } from "vitest";
import { distributionEntries } from "./personal-usage-distribution-pies";

describe("个人用量分布数据", () => {
  it("把工具 request_count 映射为饼图数据", () => {
    expect(
      distributionEntries([
        { id: "tool-claude", name: "Claude Code", request_count: 319 },
        { id: "tool-empty", name: "无用量工具", request_count: 0 },
      ]),
    ).toEqual([{ name: "Claude Code", value: 319, requestCount: 319 }]);
  });

  it("兼容数字字符串并按用量降序排列", () => {
    expect(distributionEntries({ "Claude Code": "319", Codex: 120 })).toEqual([
      { name: "Claude Code", value: 319, requestCount: 319 },
      { name: "Codex", value: 120, requestCount: 120 },
    ]);
  });

  it("兼容接口包装层和工具 ID 映射结构", () => {
    expect(
      distributionEntries({
        data: {
          items: {
            "tool-claude": { tool_name: "Claude Code", total_count: "319" },
          },
        },
      }),
    ).toEqual([{ name: "Claude Code", value: 319, requestCount: 319 }]);
  });

  it("保留请求数和 Token 字段供分布列表展示", () => {
    expect(
      distributionEntries([
        { name: "GPT", request_count: 12, total_tokens: 151870000 },
      ]),
    ).toEqual([
      { name: "GPT", value: 151870000, requestCount: 12, totalTokens: 151870000 },
    ]);
  });
});
