import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProductPlanSummary } from '@/api/product-plans'
import miniMaxBackground from '@/assets/figma-combo/minimax.png'
import deepSeekBackground from '@/assets/figma-combo/ds.png'
import seedanceBackground from '@/assets/figma-combo/seedance.png'
import kimiBackground from '@/assets/figma-combo/kimi.png'
import glmBackground from '@/assets/figma-combo/GLM.png'

import { formatPlanPrice, planGroups, planGroup, planQuota, planFeatures, planBonus, planName } from './purchase-plan-display'

const CARD_BACKGROUNDS = [miniMaxBackground, deepSeekBackground, seedanceBackground, kimiBackground, glmBackground]
const CARD_TONES = ['miniMax', 'deepSeek', 'seedance', 'kimi', 'glm'] as const

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
  const badge = planBonus(plan, i18n.language, t)
  const price = formatPlanPrice(plan.price?.price_cent)
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
          {planName(plan)}
          {/* 限购次数由登录后的列表决定。 */}
          {plan.purchase_limit > 0 && <span className="purchase-plan-limit-tag">{t('console.purchasePage.api.purchaseLimit', { count: plan.purchase_limit })}</span>}
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
  const groups = useMemo(() => planGroups(plans), [plans])
  const [activeGroup, setActiveGroup] = useState('all')
  const tabs = useMemo(() => ['all', ...groups], [groups])
  const cards = useMemo(() => activeGroup === 'all'
    ? plans
    : plans.filter((plan) => planGroup(plan) === activeGroup), [activeGroup, plans])

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
