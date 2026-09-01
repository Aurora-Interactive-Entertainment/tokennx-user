export type TokenHeatmapThresholds = readonly [number, number, number];

const TOKEN_LEVEL_QUANTILES = [0.35, 0.7, 0.9] as const;

function quantile(sortedValues: readonly number[], percentile: number): number {
  const position = (sortedValues.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];
  return lower + (upper - lower) * (position - lowerIndex);
}

/** 中文：在对数空间按分位数生成动态阈值，避免异常大值压缩普通日期的颜色差异。 */
export function createTokenHeatmapThresholds(
  values: readonly number[],
): TokenHeatmapThresholds | null {
  const logarithmicValues = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.log1p(value))
    .sort((left, right) => left - right);

  if (logarithmicValues.length === 0) return null;

  return [
    quantile(logarithmicValues, TOKEN_LEVEL_QUANTILES[0]),
    quantile(logarithmicValues, TOKEN_LEVEL_QUANTILES[1]),
    quantile(logarithmicValues, TOKEN_LEVEL_QUANTILES[2]),
  ];
}

/** 中文：0 Token 固定为灰色，非零值依据当前数据集的动态阈值映射到四档颜色。 */
export function tokenHeatmapLevel(
  value: number,
  thresholds: TokenHeatmapThresholds | null,
): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!thresholds) return 1;

  const logarithmicValue = Math.log1p(value);
  if (logarithmicValue <= thresholds[0]) return 1;
  if (logarithmicValue <= thresholds[1]) return 2;
  if (logarithmicValue <= thresholds[2]) return 3;
  return 4;
}
