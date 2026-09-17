// 只为已注册的公开页面切换语言路径，控制台、外链和授权回调保持原目标。
const PUBLIC_ROUTE = /^\/(?:models(?:\/[^/?#]+)?|rankings|apps|docs(?:\/[^?#]*)?|pricing|status|about|contact|quickstart|news(?:\/[^/?#]+)?|terms|privacy|recharge-agreement|login)?\/?$/

export function publicPath(path: string, language: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path
  const match = path.match(/^([^?#]*)([?#].*)?$/)
  if (!match) return path
  const pathname = match[1].replace(/^\/en(?=\/|$)/, '') || '/'
  if (!PUBLIC_ROUTE.test(pathname)) return path
  const localized = language.toLowerCase().startsWith('en') ? `/en${pathname === '/' ? '' : pathname}` : pathname
  return `${localized}${match[2] ?? ''}`
}
