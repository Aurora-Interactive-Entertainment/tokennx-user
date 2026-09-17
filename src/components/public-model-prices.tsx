import { useTranslation } from 'react-i18next'
import type { PublicMarketPrice } from '@/api/public-model-market'
import { formatYuanExact } from '@/utils/format'
import { selectPublicModelPrices, type PublicPriceSources } from '@/utils/public-model-prices'

function formatQuote(price?: PublicMarketPrice) {
  if (!price) return undefined
  const quantity = price.unit_quantity
  const rawUnit = price.unit.trim()
  const tokenUnit = /^(?:\d+[mk]?\s*)?tokens?$/i.test(rawUnit)
  const unit = tokenUnit && quantity === 1_000_000 ? 'M Tokens'
    : tokenUnit ? `${quantity === 1 ? '' : `${quantity} `}token`
      : `${quantity === 1 ? '' : `${quantity} `}${rawUnit}`
  const amount = formatYuanExact(price.unit_price_yuan).replace('¥', '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
  if (!Number.isFinite(quantity) || quantity <= 0 || !rawUnit || amount === '--' || amount.startsWith('-') || !price.currency.trim()) return undefined
  const currency = /^(CNY|RMB)$/i.test(price.currency) ? '¥' : price.currency
  return { amount, currency, unit, title: `${currency} ${price.unit_price_yuan} / ${unit}` }
}

export function PublicModelPrices(sources: PublicPriceSources) {
  const { t } = useTranslation()
  return <dl className="models-showcase-card-prices">{(['input', 'output'] as const).map((direction) => {
    const quotes = selectPublicModelPrices(sources, direction)
    const current = formatQuote(quotes.current)
    const original = formatQuote(quotes.original)
    return <div key={direction}>
      <dt>{t(`public.priceSummary.${direction}`)}{current ? ` / ${current.unit}` : ''}</dt>
      <dd>
        {original ? <del className="models-showcase-card-price-original" title={original.title}><span>{original.currency}</span>{original.amount}</del>
          : <span className="models-showcase-card-price-original models-showcase-card-price-original--placeholder" aria-hidden="true" />}
        <strong className="models-showcase-card-price-current" title={current?.title}>{current ? <><span className="models-showcase-card-price-current-currency">{current.currency}</span>{current.amount}</> : '--'}</strong>
      </dd>
    </div>
  })}</dl>
}
