import type { TFunction } from 'i18next'
import type { CatalogPlan } from '@/api/product-plans'

export function formatPlanCount(value: string | number | null | undefined, locale: string): string {
  const raw = String(value ?? '').trim()
  // 额度和金额不经过 Number 转换，超大整数也能保持精确值。
  return /^\d+$/.test(raw) ? BigInt(raw).toLocaleString(locale) : raw
}

export function formatPlanPrice(value: string | number | undefined): string {
  const raw = String(value ?? '').trim()
  if (!/^\d+$/.test(raw)) return '—'
  const normalized = raw.replace(/^0+(?=\d)/, '')
  return `¥${normalized.length > 2 ? normalized.slice(0, -2) : '0'}.${normalized.slice(-2).padStart(2, '0')}`
}

export const planName = (plan: CatalogPlan) => plan.display_name?.trim() || plan.name?.trim() || plan.code
export const planGroup = (plan: CatalogPlan) => plan.group_name?.trim() || plan.model_name?.trim() || plan.model_code
export const canSelectPlan = (plan: CatalogPlan) => !('can_purchase' in plan) || plan.can_purchase === true

export function planGroups(plans: CatalogPlan[]): string[] {
  const groups = new Map<string, number>()
  plans.forEach(plan => {
    const name = planGroup(plan)
    groups.set(name, Math.min(groups.get(name) ?? Infinity, plan.group_sort_order || 0))
  })
  return [...groups].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([name]) => name)
}

export function planQuota(plan: CatalogPlan, locale: string, t: TFunction): string {
  const model = plan.models?.[0]
  const token = model ? model.token_quota : plan.token_quota
  const request = model ? model.request_quota : plan.request_quota
  if (token != null) return t('console.purchasePage.api.tokenQuota', { value: formatPlanCount(token, locale) })
  if (request != null) return t('console.purchasePage.api.requestQuota', { value: formatPlanCount(request, locale) })
  return t('console.purchasePage.api.quotaUnavailable')
}

export function planFeatures(plan: CatalogPlan, locale: string, t: TFunction): string[] {
  const features: string[] = []
  if (plan.description?.trim()) features.push(plan.description.trim())
  const seconds = plan.price?.validity_seconds
  if (seconds > 0) features.push(t('console.purchasePage.api.validity', { count: Math.max(1, Math.ceil(seconds / 86400)) }))
  const availability = [
    'stock_remaining' in plan && plan.stock_remaining != null ? t('console.purchasePage.api.stockRemaining', { count: Math.max(0, plan.stock_remaining) }) : '',
    'purchase_limit' in plan && plan.purchase_limit > 0 ? t('console.purchasePage.api.purchaseRemaining', { count: Math.max(0, plan.purchase_limit - plan.purchased_count) }) : '',
  ].filter(Boolean)
  if (availability.length) features.push(availability.join(' · '))
  const limits = [
    plan.rpm_limit > 0 ? `RPM ${formatPlanCount(plan.rpm_limit, locale)}` : '',
    plan.tpm_limit > 0 ? `TPM ${formatPlanCount(plan.tpm_limit, locale)}` : '',
    plan.concurrency_limit > 0 ? t('console.purchasePage.api.concurrency', { count: plan.concurrency_limit }) : '',
  ].filter(Boolean)
  if (limits.length) features.push(limits.join(' · '))
  return features.slice(0, 3)
}

export function planBonus(plan: CatalogPlan, locale: string, t: TFunction): string {
  if ('first_purchase_bonus_available' in plan && !plan.first_purchase_bonus_available) return ''
  if (plan.first_purchase_bonus_token && !/^0+$/.test(plan.first_purchase_bonus_token)) return t('console.purchasePage.api.bonusToken', { value: formatPlanCount(plan.first_purchase_bonus_token, locale) })
  if (plan.first_purchase_bonus_request > 0) return t('console.purchasePage.api.bonusRequest', { count: plan.first_purchase_bonus_request })
  return ''
}
