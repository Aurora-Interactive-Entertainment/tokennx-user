import { useTranslation } from 'react-i18next'
import type { ModelRecord } from '@/data/models'
import { formatYuanExact } from '@/utils/format'
import { pricingPeriodSchedule, pricingRuleDetails, pricingRuleLabel, pricingRuleUnit } from '@/utils/model-time-pricing'
import './model-time-pricing.css'

type TimePricingModel = Pick<ModelRecord, 'pricingPeriods' | 'pricingTimezone' | 'currentPeriodKey' | 'prices'>

export function ModelTimePricing({ model }: { model: TimePricingModel }) {
  const { t } = useTranslation()
  const periods = model.pricingPeriods ?? []
  if (!periods.length) return null

  return (
    <div className="model-time-pricing">
      <div className="model-time-pricing-heading">
        <span>{t('console.timePricing.title')}</span>
        {model.pricingTimezone ? <span>{t('console.timePricing.timezone', { timezone: model.pricingTimezone })}</span> : null}
      </div>
      <div className="model-time-pricing-periods">
        {periods.map((period) => {
          // 当前时段由服务端按定价时区判定，避免浏览器本地时区造成偏差。
          const current = period.key === model.currentPeriodKey
          return (
            <section className={`model-time-pricing-period${current ? ' is-current' : ''}`} key={period.key}>
              <div className="model-time-pricing-label">
                <b>{period.name || period.key}</b>
                {current ? <span className="model-time-pricing-current">{t('console.timePricing.current')}</span> : null}
              </div>
              <div className="model-time-pricing-schedule">{pricingPeriodSchedule(period, t)}</div>
              <ul className="model-time-pricing-rules">
                {period.rules.map((rule, index) => {
                  const details = pricingRuleDetails(rule, t)
                  return (
                    <li key={`${rule.meter_code}-${rule.tier_no}-${index}`}>
                      <div className="model-time-pricing-value">
                        <span>{pricingRuleLabel(rule, model.prices, t)}</span>
                        {/* 完整规则保留原始金额精度，避免极小单价显示为零。 */}
                        <span className="model-time-pricing-amount"><strong data-money-value={rule.unit_price_yuan}>{formatYuanExact(rule.unit_price_yuan)}</strong><small> / {pricingRuleUnit(rule, model.prices, t)}</small></span>
                      </div>
                      {details ? <div className="model-time-pricing-rule-details">{details}</div> : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
      <div className="model-time-pricing-note">{t('console.timePricing.note')}</div>
    </div>
  )
}
