import type { MoneyValue } from '@/utils/format'
import { formatSignedYuan, formatSignedYuanExact, formatYuan, formatYuanExact } from '@/utils/format'
import type { ModelPrice } from '@/data/models'
import { useTranslation } from 'react-i18next'

export type MoneyDirection = 'income' | 'expense' | 'adjustment'

type MoneyTextProps = {
  value: MoneyValue
  rawValue?: MoneyValue
  direction?: MoneyDirection
  withCurrency?: boolean
  digits?: number
  className?: string
}

function removeCurrency(value: string): string {
  return value.replace('¥', '')
}

export function MoneyText({ value, rawValue = value, direction, withCurrency = true, digits, className = '' }: MoneyTextProps) {
  const displayValue = direction ? formatSignedYuan(value, direction, digits) : formatYuan(value, digits)
  const exactValue = direction ? formatSignedYuanExact(rawValue, direction) : formatYuanExact(rawValue)
  const visibleValue = withCurrency ? displayValue : removeCurrency(displayValue)
  const titleValue = withCurrency ? exactValue : removeCurrency(exactValue)
  const title = exactValue === '--' ? undefined : titleValue
  return <span className={className || undefined} data-money-value={String(rawValue ?? '')} title={title}>{visibleValue}</span>
}

function ModelPriceValue({ value, rawValue }: { value: number | undefined; rawValue?: string }) {
  return <MoneyText value={value} rawValue={rawValue} withCurrency={false} />
}

export function ModelPriceSummary({ price }: { price: ModelPrice }) {
  const { t } = useTranslation()
  if (price.input !== undefined && price.output !== undefined) {
    return <><span>{t('public.priceSummary.input')} <ModelPriceValue value={price.input} rawValue={price.inputRaw} /></span><span> / {t('public.priceSummary.output')} <ModelPriceValue value={price.output} rawValue={price.outputRaw} /> {price.unit}</span></>
  }
  if (price.standard !== undefined && price.hd !== undefined) {
    return <><span>{t('public.priceSummary.standard')} <ModelPriceValue value={price.standard} rawValue={price.standardRaw} /></span><span> / {t('public.priceSummary.hd')} <ModelPriceValue value={price.hd} rawValue={price.hdRaw} /> {price.unit}</span></>
  }
  if (price.base !== undefined) return <><ModelPriceValue value={price.base} rawValue={price.baseRaw} /> {price.unit}</>
  return <>{t('public.priceSummary.pending')}</>
}
