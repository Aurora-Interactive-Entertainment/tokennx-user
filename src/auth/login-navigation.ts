export const DEFAULT_CONSOLE_PATH = '/console/quickstart'

/** 登录只允许返回站内路径；未指定目标时使用快速接入。 */
export function normalizeLoginReturnPath(value: string | null | undefined): string {
  const path = value?.trim()
  if (!path || !path.startsWith('/') || path.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(path)) return DEFAULT_CONSOLE_PATH
  return path
}

/** 业务入口显式指定的目标优先，邮箱引导不应覆盖登录后的去向。 */
export function resolveLoginDestination(returnPath?: string | null): string {
  return normalizeLoginReturnPath(returnPath)
}
