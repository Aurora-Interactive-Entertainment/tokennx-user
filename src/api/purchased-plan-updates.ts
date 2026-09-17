import type { BillingContext } from './billing'

type Subscription = { scope: string; listener: () => void }
const subscriptions = new Set<Subscription>()

function scopeFor(userID: string, context: BillingContext): string {
  return JSON.stringify([userID, context.account_type, context.enterprise_id ?? ''])
}

// 到账通知只刷新同账号、同账务主体的已购权益；不把前端通知当作到账凭证。
export function notifyPurchasedPlansChanged(userID: string | undefined, context: BillingContext): void {
  if (!userID) return
  const scope = scopeFor(userID, context)
  for (const subscription of subscriptions) {
    if (subscription.scope === scope) subscription.listener()
  }
}

export function subscribePurchasedPlansChanged(userID: string | undefined, context: BillingContext, listener: () => void): () => void {
  if (!userID) return () => {}
  const subscription = { scope: scopeFor(userID, context), listener }
  subscriptions.add(subscription)
  return () => { subscriptions.delete(subscription) }
}
