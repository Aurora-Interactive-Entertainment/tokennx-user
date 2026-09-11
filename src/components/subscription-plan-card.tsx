import { useTranslation } from 'react-i18next'
import type { CatalogPlan } from '@/api/product-plans'
import { canSelectPlan, formatPlanPrice, planBonus, planFeatures, planName, planQuota } from './purchase-plan-display'
import miniMaxBackground from '@/assets/figma-combo/minimax.png'
import deepSeekBackground from '@/assets/figma-combo/ds.png'
import seedanceBackground from '@/assets/figma-combo/seedance.png'
import kimiBackground from '@/assets/figma-combo/kimi.png'
import glmBackground from '@/assets/figma-combo/GLM.png'

const TONES = ['miniMax', 'deepSeek', 'seedance', 'glm', 'kimi']
const BACKGROUNDS = [miniMaxBackground, deepSeekBackground, seedanceBackground, glmBackground, kimiBackground]
const MODEL_NAMES = ['minimax', 'deepseek', 'seedance', 'glm', 'kimi']

export function SubscriptionPlanCard({ plan, index, onSelect }: { plan: CatalogPlan; index: number; onSelect: (plan: CatalogPlan) => void }) {
  const { t, i18n } = useTranslation()
  const name = planName(plan)
  const badge = planBonus(plan, i18n.language, t)
  const price = formatPlanPrice(plan.price?.price_cent)
  const available = canSelectPlan(plan)
  const label = available ? price : t('console.purchasePage.api.unavailable')
  // 按模型匹配已有插画，不能按列表顺序配图，否则筛选和排序后会显示其他品牌。
  const modelText = `${plan.model_code} ${plan.model_name} ${plan.group_name}`.toLowerCase()
  const modelIndex = MODEL_NAMES.findIndex(model => modelText.includes(model))
  const toneIndex = modelIndex >= 0 ? modelIndex : index % TONES.length
  const fallback = modelIndex >= 0 ? `url("${BACKGROUNDS[modelIndex]}")` : 'linear-gradient(135deg, #e1f4ff, #eee4ff)'
  const backgroundImage = plan.cover_url?.trim()
    ? `url("${plan.cover_url.replace(/["\\]/g, '\\$&')}"), ${fallback}`
    : fallback

  return <article className={`purchase-subscription-plan purchase-subscription-plan--${TONES[toneIndex]}`} style={{ backgroundImage }}>
    {badge && <span className="purchase-subscription-plan-badge">{badge}</span>}
    <div className="purchase-subscription-plan-content">
      <h3>
        <span className="purchase-subscription-plan-name" title={name}>{name}</span>
        {/* 公开目录不返回限购，只有登录后才展示真实限购次数。 */}
        {'purchase_limit' in plan && plan.purchase_limit > 0 && <span className="purchase-subscription-limit-tag">{t('console.purchasePage.api.purchaseLimit', { count: plan.purchase_limit })}</span>}
      </h3>
      <strong>{plan.model_name || plan.group_name}</strong>
      <div className="purchase-subscription-plan-info">
        <span>{planQuota(plan, i18n.language, t)}</span>
        <ul>{planFeatures(plan, i18n.language, t).map(feature => <li key={feature}>{feature}</li>)}</ul>
      </div>
    </div>
    <button className="purchase-subscription-plan-price" type="button" disabled={!available} aria-label={`${name} ${label}`} onClick={() => onSelect(plan)}>{label}</button>
  </article>
}
