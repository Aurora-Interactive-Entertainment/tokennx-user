import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { PublicMarketPrice } from '@/api/public-model-market'
import { formatYuanExact } from '@/utils/format'

function describeConditions(conditions: PublicMarketPrice['conditions'], t: TFunction): string[] {
  return Object.entries(conditions ?? {}).flatMap(([key, value]) => {
    if (value === null || value === undefined || value === '') return []
    if (key === 'video_input') {
      if (value === true || value === 'true') return [t('console.models.videoPricing.withInput')]
      if (value === false || value === 'false') return [t('console.models.videoPricing.withoutInput')]
    }
    const label = key === 'resolution' ? t('console.models.videoPricing.resolution')
      : key === 'aspect_ratio' ? t('console.models.videoPricing.aspectRatio') : key
    // 只翻译已知条件；未知字段保留原始名称和值，避免推测其计费含义。
    const description = typeof value === 'object' ? JSON.stringify(value) : String(value)
    return [`${label}: ${description}`]
  })
}

export function PublicModelPrices({ prices }: { prices: PublicMarketPrice[] }) {
  const { t } = useTranslation()
  if (!prices.length) return <p className="models-showcase-card-price-unavailable">{t('public.priceSummary.pending')}</p>
  const descriptions = prices.map((price) => describeConditions(price.conditions, t))
  const signatures = prices.map((price, index) => JSON.stringify([price.meter_kind, price.unit, price.unit_quantity, price.currency, [...descriptions[index]].sort()]))
  return <dl className={`models-showcase-card-prices models-showcase-card-prices--market${prices.length > 2 ? ' models-showcase-card-prices--scroll' : ''}`} tabIndex={prices.length > 2 ? 0 : undefined}>{prices.map((price, index) => {
    const kind = price.meter_kind.toLowerCase()
    const label = kind.startsWith('cache_read') || kind.startsWith('cache_hit') ? t('console.modelDetail.cacheHitPrice')
      : kind.startsWith('cache_creation') || kind.startsWith('cache_create') ? t('console.modelDetail.cacheCreatePrice')
        : kind.includes('input') ? t('public.priceSummary.input') : kind.includes('output') ? t('public.priceSummary.output') : t('public.models.usagePrice')
    const conditions = descriptions[index]
    const sameOptions = signatures.filter((signature) => signature === signatures[index]).length
    const optionNumber = signatures.slice(0, index + 1).filter((signature) => signature === signatures[index]).length
    // 保留接口原始分母与币种，避免把每千 Token 或按秒价格误标为每百万 Token。
    const quantity = price.unit_quantity
    const unit = quantity === 1_000_000 && /^tokens?$/i.test(price.unit) ? 'M Tokens' : `${quantity === 1 ? '' : `${quantity} `}${price.unit}`
    const amount = formatYuanExact(price.unit_price_yuan).replace('¥', '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
    const valid = Number.isFinite(quantity) && quantity > 0 && Boolean(price.unit.trim()) && amount !== '--' && !amount.startsWith('-') && Boolean(price.currency.trim())
    const currency = /^(CNY|RMB)$/i.test(price.currency) ? '¥' : price.currency
    const optionLabel = sameOptions > 1 ? t('public.models.priceOption', { number: optionNumber }) : ''
    const context = [...conditions, optionLabel].filter(Boolean)
    // 沿用原双列和原价占位，在原有空行显示适用条件，避免触屏用户只能看到相同的计费标题。
    return <div key={`${price.meter_kind}-${index}`}>
      <dt title={context.join('\n')}><span>{label}{valid ? ` / ${unit}` : ''}</span></dt>
      <dd><span className={`models-showcase-card-price-original ${context.length ? 'models-showcase-card-price-context' : 'models-showcase-card-price-original--placeholder'}`} title={context.length ? context.join('\n') : undefined} aria-hidden={context.length ? undefined : true}>{context.map((condition, conditionIndex) => <span key={conditionIndex}>{conditionIndex ? ' · ' : null}<span>{condition}</span></span>)}</span><strong className="models-showcase-card-price-current" title={valid ? `${currency} ${price.unit_price_yuan} / ${unit}` : undefined}>{valid ? <><span className="models-showcase-card-price-current-currency">{currency}</span>{amount}</> : '--'}</strong></dd>
    </div>
  })}</dl>
}
