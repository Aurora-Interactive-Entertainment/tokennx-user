import { describe, expect, it } from "vitest";
import {
  createTokenHeatmapThresholds,
  tokenHeatmapLevel,
} from "./token-heatmap-levels";

function levels(values: readonly number[]): number[] {
  const thresholds = createTokenHeatmapThresholds(values);
  return values.map((value) => tokenHeatmapLevel(value, thresholds));
}

describe("Token 热力图动态分级", () => {
  it("将 0 和非法数值固定映射为最低等级", () => {
    const thresholds = createTokenHeatmapThresholds([0, 100, 200]);

    expect(tokenHeatmapLevel(0, thresholds)).toBe(0);
    expect(tokenHeatmapLevel(-1, thresholds)).toBe(0);
    expect(tokenHeatmapLevel(Number.NaN, thresholds)).toBe(0);
  });

  it("让跨度较大的非零数据覆盖低中高和极高等级", () => {
    const result = levels([100, 500, 2_000, 10_000, 100_000, 1_000_000]);

    expect(new Set(result)).toEqual(new Set([1, 2, 3, 4]));
    expect(result).toEqual([...result].sort((left, right) => left - right));
  });

  it("区分当前实际数据中原本都会落入最深色的日期", () => {
    expect(levels([471_220, 6_479_401])).toEqual([1, 4]);
  });

  it("避免单个异常超大值压扁其余日期", () => {
    const ordinaryValues = [
      100, 200, 400, 800, 1_600, 3_200, 6_400, 12_800, 25_600, 51_200,
    ];
    const result = levels([...ordinaryValues, 1_000_000_000_000]);
    const ordinaryLevels = result.slice(0, ordinaryValues.length);

    expect(new Set(ordinaryLevels)).toEqual(new Set([1, 2, 3]));
    expect(result.at(-1)).toBe(4);
  });

  it("只把最高分位的极高用量映射为最深色", () => {
    const values = Array.from({ length: 100 }, (_, index) => index + 1);
    const result = levels(values);

    expect(result.filter((level) => level === 4)).toHaveLength(10);
  });

  it("相同 Token 数值始终保持相同颜色等级", () => {
    const values = [100, 100, 100, 1_000, 1_000, 10_000];
    const result = levels(values);

    expect(new Set(result.slice(0, 3)).size).toBe(1);
    expect(new Set(result.slice(3, 5)).size).toBe(1);
  });
});
