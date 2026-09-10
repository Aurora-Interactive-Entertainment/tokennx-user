import { getAccessToken } from '@/auth/token-storage'
import { fetchAuthenticatedJson } from './authenticated'
import { fetchJson, type FetchJsonOptions } from './http'

// 临时联调开关：恢复登录要求时改为 false，仅影响公开订阅入口。
export const PUBLIC_PURCHASE_GUEST_DEBUG = true
// TODO：套餐列表接口就绪后替换成真实商品公开 ID；这些占位 ID 仅用于观察请求与弹窗流程。
export const PUBLIC_PURCHASE_DEBUG_PLAN_IDS: Record<string, string> = {
  miniMax: 'debug-plan-minimax',
  deepSeek: 'debug-plan-deepseek',
  seedance: 'debug-plan-seedance',
  kimi: 'debug-plan-kimi',
  glm: 'debug-plan-glm',
}
export type PurchaseRequestOptions = FetchJsonOptions & { guestDebug?: boolean }

export function fetchPurchaseJson<T>(path: string, options: PurchaseRequestOptions = {}): Promise<T> {
  const { guestDebug, ...request } = options
  // 调试请求仍携带已有令牌；没有令牌时直接请求后端，保留真实的 401 响应。
  if (PUBLIC_PURCHASE_GUEST_DEBUG && guestDebug) {
    return fetchJson<T>(path, { ...request, accessToken: request.accessToken ?? getAccessToken() ?? undefined })
  }
  return fetchAuthenticatedJson<T>(path, request)
}
