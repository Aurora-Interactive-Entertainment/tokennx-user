/**
 * 中文：真实浏览器优先使用 Canvas，测试环境或不支持 2D 上下文时回退 SVG。
 * 这样可以降低大量数据点的 DOM 更新成本，同时保持无 Canvas 环境的兼容性。
 */
export function getChartRenderer(): "canvas" | "svg" {
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) return "svg";
  if (typeof document === "undefined") return "svg";
  try {
    const context = document.createElement("canvas").getContext("2d");
    return context && typeof context.fillText === "function" ? "canvas" : "svg";
  } catch {
    return "svg";
  }
}
