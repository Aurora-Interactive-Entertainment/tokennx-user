import type { UserModelPrice } from '@/api/user-models'
import type { ModelRecord } from '@/data/models'
import { priceDirection } from './public-model-prices'

function direction(price: UserModelPrice) {
  // 缓存读写价格不属于普通输入价格，不能按名称包含 input 来匹配。
  if (/cache/i.test(`${price.purpose ?? ''} ${price.meter_code} ${price.meter_kind}`)) return undefined
  return priceDirection(price.purpose ?? '') ?? priceDirection(price.meter_code) ?? priceDirection(price.meter_kind)
}

function normalizedPrice(price: UserModelPrice): number | null {
  const amount = price.unit_price_yuan.trim() ? Number(price.unit_price_yuan) : NaN
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(price.unit_quantity) || price.unit_quantity <= 0) return null
  // Token 统一比较每百万价格，其他用量统一比较单单位价格，避免千 Token 与百万 Token 错排。
  const quantity = /^(?:\d+[mk]?\s*)?tokens?$/i.test(price.unit.trim()) ? 1_000_000 : 1
  const value = amount / price.unit_quantity * quantity
  return Number.isFinite(value) ? value : null
}

function firstTierPrice(prices: UserModelPrice[]): number | null {
  const price = [...prices].sort((a, b) => (a.lower_bound ?? 0) - (b.lower_bound ?? 0)
    || a.tier_no - b.tier_no
    || Object.keys(a.conditions ?? {}).length - Object.keys(b.conditions ?? {}).length)[0]
  return price ? normalizedPrice(price) : null
}

function validPrice(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/** 排序优先使用当前接口报价；输入相同再比输出，同价保留原目录顺序。 */
export function modelSortPrices(model: ModelRecord): { primary: number | null; secondary: number | null } {
  if (model.prices?.length) {
    const input = firstTierPrice(model.prices.filter((price) => direction(price) === 'input'))
    const output = firstTierPrice(model.prices.filter((price) => direction(price) === 'output'))
    const base = firstTierPrice(model.prices.filter((price) => !direction(price)
      && !/cache/i.test(`${price.purpose ?? ''} ${price.meter_code} ${price.meter_kind}`)))
    return { primary: input ?? base ?? output, secondary: input === null ? null : output }
  }
  // 兼容没有原始报价明细的旧目录，保持原先的价格优先级。
  const price = model.tokenNxPrice
  const input = validPrice(price.input)
  const output = validPrice(price.output) ?? validPrice(price.hd)
  return {
    primary: input ?? validPrice(price.base) ?? validPrice(price.standard) ?? output,
    secondary: input === null ? null : output,
  }
}
