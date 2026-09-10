import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProductPlanSummary } from '@/api/product-plans'
import miniMaxBackground from '@/assets/figma-combo/minimax.png'
import deepSeekBackground from '@/assets/figma-combo/ds.png'
import seedanceBackground from '@/assets/figma-combo/seedance.png'
import kimiBackground from '@/assets/figma-combo/kimi.png'
import glmBackground from '@/assets/figma-combo/GLM.png'

const CARD_BACKGROUNDS = [miniMaxBackground, deepSeekBackground, seedanceBackground, kimiBackground, glmBackground]
const CARD_TONES = ['miniMax', 'deepSeek', 'seedance', 'kimi', 'glm'] as const

type GroupOption = { name: string; sortOrder: number }

function normalizeInteger(value: string | number | null | undefined): string | null {
  const raw = String(value ?? '').trim()
  return /^\d+$/.test(raw) ? raw.replace(/^0+(?=\d)/, '') : null
}

function formatCount(value: string | number | null | undefined, locale: string): string {
  const normalized = normalizeInteger(value)
  if (!normalized) return String(value ?? '').trim()
  try {
    return BigInt(normalized).toLocaleString(locale)
  } catch {
    return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }
}

function formatPrice(priceCent: string | number | undefined): string {
  const normalized = normalizeInteger(priceCent)
  if (!normalized) return '—'
  const whole = normalized.length > 2 ? normalized.slice(0, -2) : '0'
  const fraction = normalized.slice(-2).padStart(2, '0')
  return `¥${whole}.${fraction}`
}

function groupOptions(plans: ProductPlanSummary[]): GroupOption[] {
  const groups = new Map<string, number>()
  plans.forEach((plan) => {
    const name = plan.group_name?.trim() || plan.model_name?.trim() || plan.model_code
    const previous = groups.get(name)
    const sortOrder = Number.isFinite(plan.group_sort_order) ? plan.group_sort_order : 0
    if (previous === undefined || sortOrder < previous) groups.set(name, sortOrder)
  })
  return Array.from(groups, ([name, sortOrder]) => ({ name, sortOrder }))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
}

function planQuota(plan: ProductPlanSummary, locale: string, t: ReturnType<typeof useTranslation>['t']): string {
  if (plan.token_quota) return t('console.purchasePage.api.tokenQuota', { value: formatCount(plan.token_quota, locale) })
  if (plan.request_quota) return t('console.purchasePage.api.requestQuota', { value: formatCount(plan.request_quota, locale) })
  return t('console.purchasePage.api.quotaUnavailable')
}

function planFeatures(plan: ProductPlanSummary, locale: string, t: ReturnType<typeof useTranslation>['t']): string[] {
  const features: string[] = []
  const description = plan.description?.trim()
  if (description) features.push(description)
  const seconds = plan.price?.validity_seconds
  if (Number.isFinite(seconds) && seconds > 0) {
    const days = Math.max(1, Math.ceil(seconds / 86400))
    features.push(t('console.purchasePage.api.validity', { count: days }))
  }
  const availability = [
    plan.stock_remaining !== null
      ? t('console.purchasePage.api.stockRemaining', { count: Math.max(0, plan.stock_remaining) })
      : '',
    plan.purchase_limit > 0
      ? t('console.purchasePage.api.purchaseRemaining', {
        count: Math.max(0, plan.purchase_limit - plan.purchased_count),
      })
      : '',
  ].filter(Boolean)
  if (availability.length > 0) features.push(availability.join(' · '))
  const limits = [
    plan.rpm_limit > 0 ? `RPM ${formatCount(plan.rpm_limit, locale)}` : '',
    plan.tpm_limit > 0 ? `TPM ${formatCount(plan.tpm_limit, locale)}` : '',
    plan.concurrency_limit > 0 ? t('console.purchasePage.api.concurrency', { count: plan.concurrency_limit }) : '',
  ].filter(Boolean)
  if (limits.length > 0) features.push(limits.join(' · '))
  return features.slice(0, 3)
}

function bonusLabel(plan: ProductPlanSummary, locale: string, t: ReturnType<typeof useTranslation>['t']): string {
  if (!plan.first_purchase_bonus_available) return ''
  if (plan.first_purchase_bonus_token) {
    return t('console.purchasePage.api.bonusToken', { value: formatCount(plan.first_purchase_bonus_token, locale) })
  }
  if (plan.first_purchase_bonus_request > 0) {
    return t('console.purchasePage.api.bonusRequest', { count: plan.first_purchase_bonus_request })
  }
  return t('console.purchasePage.api.firstPurchaseBonus')
}

function PurchasePlanCard({
  plan,
  index,
  selecting,
  onSelect,
}: {
  plan: ProductPlanSummary
  index: number
  selecting: boolean
  onSelect: (plan: ProductPlanSummary) => void
}) {
  const { t, i18n } = useTranslation()
  const tone = CARD_TONES[index % CARD_TONES.length]
  const fallback = CARD_BACKGROUNDS[index % CARD_BACKGROUNDS.length]
  const badge = bonusLabel(plan, i18n.language, t)
  const price = formatPrice(plan.price?.price_cent)
  const disabled = !plan.can_purchase || selecting
  const buttonLabel = selecting
    ? t('console.purchasePage.api.readingDetail')
    : plan.can_purchase ? price : t('console.purchasePage.api.unavailable')
  const backgroundImage = plan.cover_url?.trim()
    ? `url("${plan.cover_url.replace(/["\\]/g, '\\$&')}"), url("${fallback}")`
    : `url("${fallback}")`

  return (
    <article
      className={`purchase-plan-card purchase-plan-card--${tone}`}
      style={{ backgroundImage }}
    >
      {badge ? <span className="purchase-plan-badge">{badge}</span> : null}
      <div className="purchase-plan-content">
        <h3>
          {plan.name?.trim() || plan.code}
          {/* 限购标签：先渲染样式，后续由接口字段控制是否显示。 */}
          <span className="purchase-plan-limit-tag">{t('console.purchasePage.api.limitOne')}</span>
        </h3>
        <strong>{plan.model_name?.trim() || plan.group_name}</strong>
        <div className="purchase-plan-info">
          <span className="purchase-plan-quota">{planQuota(plan, i18n.language, t)}</span>
          <ul>
            {planFeatures(plan, i18n.language, t).map((feature) => <li key={feature}>{feature}</li>)}
          </ul>
        </div>
      </div>
      <button
        className="purchase-plan-price"
        type="button"
        disabled={disabled}
        aria-label={`${plan.name} ${buttonLabel}`}
        onClick={() => onSelect(plan)}
      >
        {buttonLabel}
      </button>
    </article>
  )
}

export default function PurchasePlanSection({
  plans,
  loading,
  error,
  selectingPlanID,
  onRetry,
  onSelect,
}: {
  plans: ProductPlanSummary[]
  loading: boolean
  error: string
  selectingPlanID: string | null
  onRetry: () => void
  onSelect: (plan: ProductPlanSummary) => void
}) {
  const { t } = useTranslation()
  const groups = useMemo(() => groupOptions(plans), [plans])
  const [activeGroup, setActiveGroup] = useState('all')
  const tabs = useMemo(() => ['all', ...groups.map((group) => group.name)], [groups])
  const cards = useMemo(() => activeGroup === 'all'
    ? plans
    : plans.filter((plan) => (plan.group_name?.trim() || plan.model_name?.trim() || plan.model_code) === activeGroup), [activeGroup, plans])

  useEffect(() => {
    if (!tabs.includes(activeGroup)) setActiveGroup('all')
  }, [activeGroup, tabs])

  if (loading) {
    return <section className="purchase-plans purchase-plan-state" role="status">{t('console.purchasePage.api.loading')}</section>
  }
  if (error) {
    return (
      <section className="purchase-plans purchase-plan-state" role="alert">
        <strong>{t('console.purchasePage.api.loadFailed')}</strong>
        <span>{error}</span>
        <button type="button" onClick={onRetry}>{t('console.purchasePage.api.retry')}</button>
      </section>
    )
  }
  if (plans.length === 0) {
    return <section className="purchase-plans purchase-plan-state">{t('console.purchasePage.api.empty')}</section>
  }

  return (
    <section className="purchase-plans" aria-label={t('console.purchasePage.tabs.all')}>
      <div
        className="purchase-plan-tabs"
        role="tablist"
        style={{
          '--purchase-tab-index': tabs.indexOf(activeGroup),
          '--purchase-tab-count': tabs.length,
        } as CSSProperties}
      >
        {tabs.map((tab) => (
          <button
            className={activeGroup === tab ? 'is-active' : ''}
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeGroup === tab}
            onClick={() => setActiveGroup(tab)}
          >
            {tab === 'all' ? `${t('console.purchasePage.tabs.all')} ${plans.length}` : tab}
          </button>
        ))}
      </div>
      <div className={`purchase-plan-grid purchase-plan-grid--${cards.length}`} key={activeGroup}>
        {cards.map((plan, index) => (
          <PurchasePlanCard
            key={plan.id}
            plan={plan}
            index={plans.indexOf(plan) >= 0 ? plans.indexOf(plan) : index}
            selecting={selectingPlanID === plan.id}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  )
}
