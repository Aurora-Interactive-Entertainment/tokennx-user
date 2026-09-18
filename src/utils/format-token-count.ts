const TOKEN_UNITS = [
  { threshold: 1_000_000_000_000, suffix: "T" },
  { threshold: 1_000_000_000, suffix: "B" },
  { threshold: 1_000_000, suffix: "M" },
  { threshold: 10_000, suffix: "w" },
  { threshold: 1_000, suffix: "K" },
] as const;

export function formatTokenCount(value: number, language: string): string {
  if (!Number.isFinite(value)) return "--";
  // 仅缩写展示值，统计、色阶和导出继续使用原始 Token 数量。
  const unit = TOKEN_UNITS.find(({ threshold }) => Math.abs(value) >= threshold);
  const formatted = new Intl.NumberFormat(language, {
    maximumFractionDigits: unit ? 2 : 0,
  }).format(unit ? value / unit.threshold : value);
  return `${formatted}${unit?.suffix ?? ""}`;
}
