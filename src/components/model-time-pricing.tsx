import { useTranslation } from 'react-i18next'
import type { ModelRecord } from '@/data/models'
import { BackofficeMoneyText as MoneyText } from './money'
import './model-time-pricing.css'

export function ModelTimePricing({ model, compact = false }: { model: ModelRecord; compact?: boolean }) {
  const { t } = useTranslation()
  const hasTimePricing = model.company.trim().toLowerCase() === 'deepseek'
  if (!hasTimePricing) {
    // 没有峰谷价的模型也保留同等空间，避免同一行卡片内容上下跳动。
    return compact ? <div className="model-time-pricing model-time-pricing--compact model-time-pricing--placeholder" aria-hidden="true" /> : null
  }

  // 接口尚未提供分时价格：仅用当前价格及五折价格预览排版，不参与计费。
  const periods = [
    { key: 'peak', time: '08:00–24:00', factor: 1 },
    { key: 'offPeak', time: '00:00–08:00', factor: 0.5 },
  ] as const

  return (
    <div className={`model-time-pricing${compact ? ' model-time-pricing--compact' : ''}`}>
      <div className="model-time-pricing-heading">
        <span>{t('console.timePricing.title')} <small>{t('console.timePricing.example')}</small></span>
        <span>{t('console.timePricing.timezone')}</span>
      </div>
      <div className="model-time-pricing-periods">
        {periods.map(({ key, time, factor }) => (
          <div className={`model-time-pricing-period model-time-pricing-period--${key}`} key={key}>
            <div className="model-time-pricing-label"><b>{t(`console.timePricing.${key}`)}</b><span>{time}</span></div>
            <div className="model-time-pricing-values">
              {(['input', 'output'] as const).map((purpose) => {
                const price = model.tokenNxPrice[purpose]
                return <span key={purpose}>{t(`console.common.${purpose}`)} <strong><MoneyText value={price === undefined ? undefined : price * factor} withCurrency={false} /></strong></span>
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="model-time-pricing-note">{t('console.timePricing.note')} · {model.tokenNxPrice.unit}</div>
    </div>
  )
}
