import type { MoneyValue } from '@/utils/format'
import { BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES, formatSignedYuan, formatSignedYuanExact, formatYuan, formatYuanExact } from '@/utils/format'
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

export function BackofficeMoneyText(props: MoneyTextProps) {
  return <MoneyText {...props} digits={props.digits ?? BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES} />
}

function ModelPriceValue({ value, rawValue, digits }: { value: number | undefined; rawValue?: string; digits?: number }) {
  return <MoneyText value={value} rawValue={rawValue} withCurrency={false} digits={digits} />
}

export function ModelPriceSummary({ price, digits }: { price: ModelPrice; digits?: number }) {
  const { t } = useTranslation()
  if (price.input !== undefined && price.output !== undefined) {
    return <><span>{t('public.priceSummary.input')} <ModelPriceValue value={price.input} rawValue={price.inputRaw} digits={digits} /></span><span> / {t('public.priceSummary.output')} <ModelPriceValue value={price.output} rawValue={price.outputRaw} digits={digits} /> {price.unit}</span></>
  }
  if (price.standard !== undefined && price.hd !== undefined) {
    return <><span>{t('public.priceSummary.standard')} <ModelPriceValue value={price.standard} rawValue={price.standardRaw} digits={digits} /></span><span> / {t('public.priceSummary.hd')} <ModelPriceValue value={price.hd} rawValue={price.hdRaw} digits={digits} /> {price.unit}</span></>
  }
  if (price.base !== undefined) return <><ModelPriceValue value={price.base} rawValue={price.baseRaw} digits={digits} /> {price.unit}</>
  return <>{t('public.priceSummary.pending')}</>
}
