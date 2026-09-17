import type { PublicMarketPrice, PublicMarketTemplatePrice } from '@/api/public-model-market'
import type { UserModelPricingPeriod } from '@/api/user-models'

export type PriceDirection = 'input' | 'output'
export type PublicPriceSources = {
  prices: PublicMarketPrice[]
  templatePrices?: PublicMarketTemplatePrice[] | null
  templatePricingPeriods?: UserModelPricingPeriod[]
  templatePricingTimezone?: string
}

export function priceDirection(meter: string): PriceDirection | undefined {
  const normalized = meter.toLowerCase()
  if (normalized === 'input' || normalized === 'input_token') return 'input'
  if (normalized === 'output' || normalized === 'output_token') return 'output'
  return undefined
}

function conditionKey(conditions?: Record<string, unknown>): string {
  return JSON.stringify(Object.entries(conditions ?? {}).filter(([, value]) => value !== '' && value !== undefined && value !== null).map(([key, value]) => [key, String(value)]).sort(([a], [b]) => a.localeCompare(b)))
}

function activeTemplatePeriod(periods: UserModelPricingPeriod[], timezone: string | undefined, now: Date): UserModelPricingPeriod | undefined {
  const fallback = periods.find((period) => period.default)
  if (!periods.some((period) => !period.default)) return fallback
  // 官方与平台的时段标识不一定相同，按官方时区独立选择当前生效规则。
  if (!timezone) return undefined
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
    const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(part('weekday'))
    const minute = Number(part('hour')) * 60 + Number(part('minute'))
    return periods.find((period) => !period.default && Boolean(period.weekday_mask & (1 << weekday)) && minute >= period.start_minute && minute < period.end_minute) ?? fallback
  } catch { return undefined }
}

export function selectPublicModelPrices(sources: PublicPriceSources, direction: PriceDirection, now = new Date()): { current?: PublicMarketPrice; original?: PublicMarketPrice } {
  // 卡片仅取输入/输出基础档，缓存价和额外规格不再挤进双列价格区域。
  const candidates = sources.prices.filter((price) => (priceDirection(price.meter_code ?? '') ?? priceDirection(price.meter_kind)) === direction)
  const conditionPriority = (price: PublicMarketPrice) => !Object.keys(price.conditions ?? {}).length ? 0 : String(price.conditions?.video_input) === 'false' ? 1 : 2
  const current = [...candidates].sort((a, b) => (a.lower_bound ?? 0) - (b.lower_bound ?? 0) || (a.tier_no ?? 0) - (b.tier_no ?? 0) || conditionPriority(a) - conditionPriority(b))[0]
  if (!current) return {}
  const periods = sources.templatePricingPeriods ?? []
  if (periods.length) {
    const period = activeTemplatePeriod(periods, sources.templatePricingTimezone, now)
    const original = period?.rules.find((rule) => priceDirection(rule.meter_code) === direction
      && rule.unit_quantity === current.unit_quantity
      && rule.lower_bound === (current.lower_bound ?? 0)
      && rule.upper_bound === current.upper_bound
      && (current.tier_no === undefined || rule.tier_no === current.tier_no)
      && conditionKey(rule.conditions) === conditionKey(current.conditions)
      && (['width', 'height', 'quality_level', 'duration_seconds'] as const).every((key) => (rule[key] || undefined) === (current[key] || undefined)))
    // 结构化官方报价已经是人民币；缺少同规格原价时不拿其他阶梯或规格凑数。
    return { current, original: original ? { ...current, currency: 'CNY', unit_price_yuan: original.unit_price_yuan } : undefined }
  }
  const original = sources.templatePrices?.find((price) => priceDirection(price.meter_type) === direction
    && price.unit_quantity === current.unit_quantity
    && (current.tier_no === undefined || price.tier_no === current.tier_no || (price.tier_no === 0 && !current.lower_bound && current.upper_bound === undefined))
    && (price.meter_unit === current.unit || (/^(?:\d+[mk]?\s*)?tokens?$/i.test(price.meter_unit) && /^(?:\d+[mk]?\s*)?tokens?$/i.test(current.unit)))
    && (price.tier_lower_bound || '0') === String(current.lower_bound ?? 0)
    && (price.tier_upper_bound || '') === String(current.upper_bound ?? '')
    && (['quality_level', 'duration_seconds'] as const).every((key) => (price[key] || undefined) === (current[key] || undefined))
    && !current.width && !current.height
    && !Object.keys(current.conditions ?? {}).length)
  return { current, original: original ? { ...current, currency: original.currency, unit_price_yuan: original.unit_price } : undefined }
}
