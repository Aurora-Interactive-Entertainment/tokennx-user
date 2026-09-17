import { useTranslation } from 'react-i18next'
import type { UserModelPrice, UserModelPricingPeriod, UserModelPricingRule } from '@/api/user-models'
import type { ModelRecord } from '@/data/models'
import { formatYuanExact } from '@/utils/format'
import { groupPricingPeriods, pricingPeriodName, pricingPeriodSchedule, pricingRuleDetails, pricingRuleLabel, pricingRuleUnit } from '@/utils/model-time-pricing'
import './model-time-pricing.css'

type TimePricingModel = Pick<ModelRecord, 'pricingPeriods' | 'pricingTimezone' | 'currentPeriodKey' | 'prices'>

function PricingSchedules({ periods }: { periods: UserModelPricingPeriod[] }) {
  const { t } = useTranslation()
  return (
    <div className="model-time-pricing-schedules">
      {periods.map((period) => <div className="model-time-pricing-schedule" key={period.key}>{pricingPeriodSchedule(period, t)}</div>)}
    </div>
  )
}

function PricingRules({ rules, prices }: { rules: UserModelPricingRule[]; prices: UserModelPrice[] | undefined }) {
  const { t } = useTranslation()
  return (
    <ul className="model-time-pricing-rules">
      {rules.map((rule, index) => {
        // 单一全量价格无需重复说明“阶梯 1：0 及以上”，真实阶梯和其他规格仍完整保留。
        const showTier = !(rule.tier_no === 1 && rule.lower_bound === 0 && rule.upper_bound === undefined
          && rules.filter((item) => item.kind === rule.kind && item.meter_code === rule.meter_code).length === 1)
        const details = pricingRuleDetails(rule, t, { showTier })
        return (
          <li key={`${rule.meter_code}-${rule.tier_no}-${index}`}>
            <div className="model-time-pricing-value">
              <div className="model-time-pricing-rule-info">
                <span>{pricingRuleLabel(rule, prices, t)}</span>
                {details ? <div className="model-time-pricing-rule-details">{details}</div> : null}
              </div>
              {/* 完整规则保留原始金额精度，避免极小单价显示为零。 */}
              <span className="model-time-pricing-amount"><strong data-money-value={rule.unit_price_yuan}>{formatYuanExact(rule.unit_price_yuan)}</strong><small> / {pricingRuleUnit(rule, prices, t)}</small></span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function ModelTimePricing({ model }: { model: TimePricingModel }) {
  const { t } = useTranslation()
  const groups = groupPricingPeriods(model.pricingPeriods ?? [])
  // 只有一种价格时与上方价格信息重复；同名但规则不同的多时段价格仍需保留。
  if (!groups.length || (groups.length === 1 && groups[0].rates.length === 1)) return null

  return (
    <div className="model-time-pricing">
      <div className="model-time-pricing-heading">
        <span>{t('console.timePricing.title')}</span>
      </div>
      <div className="model-time-pricing-periods">
        {groups.map((group) => {
          // 当前时段由服务端按定价时区判定，避免浏览器本地时区造成偏差。
          const current = group.periods.some((period) => period.key === model.currentPeriodKey)
          const sharedRules = group.rates.length === 1
          return (
            <section className={`model-time-pricing-period${current ? ' is-current' : ''}`} key={group.key}>
              <div className="model-time-pricing-header">
                <div className="model-time-pricing-label">
                  <b>{pricingPeriodName(group.name, t) || group.periods[0].key}</b>
                  {current ? <span className="model-time-pricing-current">{t('console.timePricing.current')}</span> : null}
                </div>
                {sharedRules ? <PricingSchedules periods={group.periods} /> : null}
              </div>
              {group.rates.map((rate) => (
                <div className="model-time-pricing-rate-group" key={rate.periods[0].key}>
                  {/* 同名但价格或规格不同的时段仍逐组列出，保留时间与计费规则的对应关系。 */}
                  {!sharedRules ? <PricingSchedules periods={rate.periods} /> : null}
                  <PricingRules rules={rate.rules} prices={model.prices} />
                </div>
              ))}
            </section>
          )
        })}
      </div>
      <div className="model-time-pricing-note">{t('console.timePricing.note')}</div>
    </div>
  )
}
