const INVITATION_URL_PROTOCOLS = new Set(['http:', 'https:'])

function isSupportedInvitationProtocol(value: URL): boolean {
  return INVITATION_URL_PROTOCOLS.has(value.protocol)
}

// 中文：接口历史版本可能只返回站内路径，展示和复制前统一解析为可直接分享的完整地址。
export function resolveInvitationURL(value: string | null | undefined, baseURL: string): string {
  const candidate = value?.trim() ?? ''
  if (!candidate) return ''

  let resolved: URL
  try {
    resolved = new URL(candidate)
  } catch {
    try {
      resolved = new URL(candidate, baseURL)
    } catch {
      return ''
    }
  }

  if (!isSupportedInvitationProtocol(resolved) || resolved.username || resolved.password) return ''
  return resolved.href
}
