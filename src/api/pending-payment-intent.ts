import { getAccessTokenUserId } from '@/auth/token-storage'
import type { BillingContext } from './billing'
import type { PaymentChannel } from './payment-flow'

export interface PendingPaymentIntent {
  id: string
  createKey: string
  payKey: string
  channel: PaymentChannel
  orderID: string | null
  amountYuan?: string
}

const STORAGE_PREFIX = 'token-nx:pending-payment-intent:v1:'
const memory = new Map<string, PendingPaymentIntent>()
// 存储不可用时以内存为准；清理失败也保留空记录的标记，避免旧存储内容复活。
const memoryOnly = new Set<string>()
const INTENT_FIELDS = new Set(['id', 'createKey', 'payKey', 'channel', 'orderID', 'amountYuan'])

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
    && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value)
}

function requestKey(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && /^[\x20-\x7e]{1,128}$/.test(value)
}

function validAmount(value: unknown): value is string {
  // 保留原始合法金额文本，同幂等键恢复时不能把 100 悄悄改成 100.00。
  return typeof value === 'string' && /^\d{1,128}(?:\.\d{1,2})?$/.test(value)
}

function parseIntent(value: unknown, kind: 'recharge' | 'plan'): PendingPaymentIntent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => !INTENT_FIELDS.has(key))
    || !requestKey(record.id) || !requestKey(record.createKey) || !requestKey(record.payKey)
    || (record.channel !== 'wechat' && record.channel !== 'alipay')
    || (record.orderID !== null && !identifier(record.orderID))
    || (kind === 'recharge' && (!validAmount(record.amountYuan) || !/[1-9]/.test(record.amountYuan)))
    || (record.amountYuan !== undefined && !validAmount(record.amountYuan))) return null
  return {
    id: record.id,
    createKey: record.createKey,
    payKey: record.payKey,
    channel: record.channel,
    orderID: record.orderID as string | null,
    ...(record.amountYuan !== undefined ? { amountYuan: record.amountYuan as string } : {}),
  }
}

export function paymentIntentScope(context: BillingContext, kind: 'recharge' | 'plan', planID?: string): string | null {
  const userID = getAccessTokenUserId()
  if (!identifier(userID) || !context || !['personal', 'enterprise'].includes(context.account_type)
    || !['recharge', 'plan'].includes(kind)
    || (context.account_type === 'enterprise' && !identifier(context.enterprise_id))
    || (kind === 'plan' && !identifier(planID))) return null
  return STORAGE_PREFIX + JSON.stringify([
    userID, context.account_type, context.account_type === 'enterprise' ? context.enterprise_id : null,
    kind, kind === 'plan' ? planID : null,
  ])
}

function scopeKind(scope: string | null): 'recharge' | 'plan' | null {
  if (typeof scope !== 'string' || scope.length > 2048 || !scope.startsWith(STORAGE_PREFIX)) return null
  try {
    const parts: unknown = JSON.parse(scope.slice(STORAGE_PREFIX.length))
    if (!Array.isArray(parts) || parts.length !== 5) return null
    const [userID, accountType, enterpriseID, kind, planID] = parts
    // 调用方保存着旧 scope 时，也不能在切换账号后读写另一账号的意图。
    if (!identifier(userID) || userID !== getAccessTokenUserId()
      || !['personal', 'enterprise'].includes(accountType)
      || (accountType === 'enterprise' ? !identifier(enterpriseID) : enterpriseID !== null)
      || !['recharge', 'plan'].includes(kind)
      || (kind === 'plan' ? !identifier(planID) : planID !== null)) return null
    return kind
  } catch {
    return null
  }
}

export function readPendingPaymentIntent(scope: string | null): PendingPaymentIntent | null {
  const kind = scopeKind(scope)
  if (!scope || !kind) return null
  if (!memoryOnly.has(scope)) {
    try {
      const raw = window.sessionStorage.getItem(scope)
      const parsed = raw === null || raw.length > 4096 ? null : parseIntent(JSON.parse(raw), kind)
      if (parsed) memory.set(scope, parsed)
      else memory.delete(scope)
      return parsed ? { ...parsed } : null
    } catch (error) {
      // 损坏的 JSON 不能从旧缓存恢复；只有浏览器存储访问失败才降级。
      if (error instanceof SyntaxError) {
        memory.delete(scope)
        return null
      }
      memoryOnly.add(scope)
    }
  }
  const cached = memory.get(scope)
  return cached ? { ...cached } : null
}

export function writePendingPaymentIntent(scope: string | null, intent: PendingPaymentIntent): void {
  const kind = scopeKind(scope)
  if (!scope || !kind) return
  const parsed = parseIntent(intent, kind)
  if (!parsed) return
  const current = readPendingPaymentIntent(scope)
  // 一个主体/商品同时只有一个待付意图，迟到的旧组件不能覆盖新会话。
  if (current && current.id !== parsed.id) return
  memory.set(scope, parsed)
  try {
    window.sessionStorage.setItem(scope, JSON.stringify(parsed))
    memoryOnly.delete(scope)
  } catch {
    memoryOnly.add(scope)
  }
}

/** 仅供调用方确认关闭、过期或已入账后清理；未知支付状态必须继续保留。 */
export function clearPendingPaymentIntent(scope: string | null, intentID: string): void {
  if (!scopeKind(scope) || !scope) return
  const current = readPendingPaymentIntent(scope)
  if (!current || current.id !== intentID) return
  memory.delete(scope)
  try {
    window.sessionStorage.removeItem(scope)
    memoryOnly.delete(scope)
  } catch {
    memoryOnly.add(scope)
  }
}
