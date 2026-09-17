import type { TFunction } from 'i18next'
import type { UserModelPrice, UserModelPricingPeriod, UserModelPricingRule } from '@/api/user-models'
import { formatNumber } from './format'

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const METER_LABELS: Record<string, string> = {
  input_token: 'console.modelDetail.inputTokens',
  output_token: 'console.modelDetail.outputTokens',
  cache_hit_token: 'console.modelDetail.cacheHitPrice',
  cache_read_input_token: 'console.modelDetail.cacheHitPrice',
  cache_creation_input_token: 'console.modelDetail.cacheCreatePrice',
}
const PURPOSE_LABELS: Record<string, string> = {
  input: 'console.modelDetail.inputTokens',
  output: 'console.modelDetail.outputTokens',
  cache_hit: 'console.modelDetail.cacheHitPrice',
  cache_creation: 'console.modelDetail.cacheCreatePrice',
}

function minuteLabel(minute: number): string {
  // 1440 表示当天结束的 24:00，不能转换为次日 00:00。
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

export function pricingPeriodSchedule(period: UserModelPricingPeriod, t: TFunction): string {
  // 默认规则只在其他时段均未匹配时生效，不按其全天掩码展示为叠加价格。
  if (period.default) return t('console.timePricing.fallback')
  const days = period.weekday_mask === 127 ? t('console.timePricing.everyDay')
    : period.weekday_mask === 31 ? t('console.timePricing.weekdays')
      : WEEKDAY_KEYS.filter((_, index) => period.weekday_mask & (1 << index)).map((day) => t(`console.timePricing.${day}`)).join(' / ')
  return `${days} · ${minuteLabel(period.start_minute)}–${minuteLabel(period.end_minute)}`
}

export function pricingRuleLabel(rule: UserModelPricingRule, prices: UserModelPrice[] | undefined, t: TFunction): string {
  const price = prices?.find((item) => item.meter_code === rule.meter_code)
  const key = METER_LABELS[rule.meter_code] || (price?.purpose ? PURPOSE_LABELS[price.purpose] : undefined)
  return key ? t(key) : rule.meter_code
}

export function pricingRuleUnit(rule: UserModelPricingRule, prices: UserModelPrice[] | undefined, t: TFunction): string {
  const priceUnit = prices?.find((item) => item.meter_code === rule.meter_code)?.unit.trim()
  // 规则未携带单位：优先复用同一计量项的价格单位，未知用量/工具规则不猜测“次”或“秒”。
  const unit = priceUnit || (rule.kind === 'token' ? 'token' : rule.kind === 'request' ? 'request' : 'unit')
  if (unit === 'token' && rule.unit_quantity === 1_000_000) return t('console.timePricing.millionTokens')
  const unitKeys: Record<string, string> = {
    token: 'tokens', request: 'requests', unit: 'units', second: 'seconds', seconds: 'seconds',
    image: 'images', character: 'characters',
  }
  const label = unitKeys[unit] ? t(`console.timePricing.${unitKeys[unit]}`) : unit
  return `${formatNumber(rule.unit_quantity)} ${label}`
}

export function pricingRuleDetails(rule: UserModelPricingRule, t: TFunction): string {
  const details: string[] = []
  if (rule.tier_no > 0) {
    const lower = formatNumber(rule.lower_bound)
    const range = rule.upper_bound === undefined ? t('console.timePricing.from', { lower }) : `${lower}–${formatNumber(rule.upper_bound)}`
    details.push(t('console.timePricing.tier', { tier: rule.tier_no, range }))
  }
  if (rule.width && rule.height) details.push(`${rule.width} × ${rule.height} px`)
  else {
    if (rule.width) details.push(t('console.timePricing.width', { value: rule.width }))
    if (rule.height) details.push(t('console.timePricing.height', { value: rule.height }))
  }
  if (rule.quality_level) details.push(t('console.timePricing.quality', { value: rule.quality_level }))
  if (rule.duration_seconds) details.push(t('console.timePricing.duration', { value: rule.duration_seconds }))
  if (rule.tool_code) details.push(t('console.timePricing.tool', { value: rule.tool_code }))
  Object.entries(rule.conditions ?? {}).forEach(([key, value]) => {
    if (key === 'video_input' && (value === 'true' || value === 'false')) {
      details.push(t(`console.models.videoPricing.${value === 'true' ? 'withInput' : 'withoutInput'}`))
      return
    }
    const label = key === 'resolution' ? t('console.models.videoPricing.resolution')
      : key === 'aspect_ratio' ? t('console.models.videoPricing.aspectRatio') : key
    // 接口可扩展规格；已知条件复用现有翻译，未知条件保留原始名称和值。
    details.push(`${label}: ${value}`)
  })
  return details.join(' · ')
}
