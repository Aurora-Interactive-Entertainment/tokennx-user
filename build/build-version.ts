// 构建与发布校验共用格式，必须与 HTML 中独立运行的版本守卫保持一致。
export const BUILD_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/

export function isValidBuildVersion(value: unknown): value is string {
  return typeof value === 'string' && BUILD_VERSION_PATTERN.test(value)
}

export function normalizeBuildVersion(value: string): string {
  const normalized = value.trim().replace(/[^0-9A-Za-z._-]/g, '-').replace(/-{2,}/g, '-')
  if (!normalized) return ''
  // 保留发布版本的可读内容；补稳定前缀，避免合法字符开头却被浏览器守卫忽略。
  return (/^[A-Za-z0-9]/.test(normalized) ? normalized : `build-${normalized}`).slice(0, 160)
}
