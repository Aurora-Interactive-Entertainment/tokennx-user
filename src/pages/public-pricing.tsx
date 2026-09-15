import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LoginRequiredAction, PublicLayout } from '@/components/common'
import { formatPlanPrice, planFeatures, planGroup, planName, planQuota } from '@/components/purchase-plan-display'
import { usePurchaseCatalog } from '@/components/use-purchase-catalog'
import './public-pricing.css'

export function PricingPage() {
  const { t, i18n } = useTranslation()
  // 与导航套餐入口共用公开目录及分页逻辑；购买动作继续进入现有登录和支付流程。
  const { plans, loading, error, reload } = usePurchaseCatalog(null)
  const prefix = i18n.language.startsWith('en') ? '/en' : ''
  return <PublicLayout mainClassName="public-page">
    <header className="public-page-head">
      <h1>{t('public.pricing.title')}</h1>
      <p>{t('public.pricing.description')}</p>
      <div className="public-actions"><Link className="btn btn-secondary" to={`${prefix}/models`}>{t('public.pricing.viewCapabilities')}</Link></div>
    </header>
    <section className="public-section" aria-live="polite" aria-busy={loading}>
      {loading ? <p role="status">{t('public.pricing.loading')}</p> : error ? <div className="public-actions"><p role="alert">{t('public.pricing.loadFailed')}</p><button className="btn btn-secondary" type="button" onClick={reload}>{t('public.pricing.retry')}</button></div> : plans.length === 0 ? <p>{t('public.pricing.empty')}</p> : <div className="public-pricing-grid">
        {plans.map(plan => <article className="public-package-card" key={plan.id}>
          <p className="public-package-group">{planGroup(plan)}</p>
          <h2>{planName(plan)}</h2>
          <strong className="public-package-price">{formatPlanPrice(plan.price?.price_cent)}</strong>
          <p>{planQuota(plan, i18n.language, t)}</p>
          {'purchase_limit' in plan && plan.purchase_limit > 0 ? <p>{t('console.purchasePage.api.purchaseLimit', { count: plan.purchase_limit })}</p> : null}
          <ul>{planFeatures(plan, i18n.language, t).map((feature, index) => <li key={index}>{feature}</li>)}</ul>
          <LoginRequiredAction className="btn btn-primary" returnPath="/console/purchase">{t('public.pricing.buyPackage')}</LoginRequiredAction>
        </article>)}
      </div>}
    </section>
    <section className="public-section"><h2>{t('public.pricing.localCostTitle')}</h2><div className="public-grid">
      {['textModel', 'generationModel', 'failedRequest'].map(key => <div className="public-grid-item" key={key}><h3>{t(`public.pricing.${key}`)}</h3><p>{t(`public.pricing.${key}Description`)}</p></div>)}
    </div></section>
  </PublicLayout>
}
