import type { UsageRecord } from '@/data/app-state'
import type { ModelRecord } from '@/data/models'
import { getActiveLanguage, getActiveLocale } from '@/i18n'

export const MONEY_DISPLAY_DECIMAL_PLACES = 3
export type MoneyValue = string | number | null | undefined

export function formatCurrency(value: number, digits = MONEY_DISPLAY_DECIMAL_PLACES): string {
  return new Intl.NumberFormat(getActiveLocale(), {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatDecimal(value: number | undefined, digits = MONEY_DISPLAY_DECIMAL_PLACES): string | null {
  if (value === undefined || !Number.isFinite(value) || !Number.isInteger(digits) || digits < 0) return null
  return value.toLocaleString(getActiveLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

type DecimalParts = {
  negative: boolean
  integer: string
  fraction: string
}

function normalizeMoneyValue(value: MoneyValue): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null
  return value.trim()
}

function parseDecimal(value: string): DecimalParts | null {
  const match = value.trim().match(/^([+-]?)(\d+)(?:\.(\d+))?$/)
  if (!match) return null
  return {
    negative: match[1] === '-',
    integer: match[2].replace(/^0+(?=\d)/, ''),
    fraction: match[3] ?? '',
  }
}

function incrementInteger(value: string): string {
  const digits = value.split('')
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    if (digits[index] !== '9') {
      digits[index] = String.fromCharCode(digits[index].charCodeAt(0) + 1)
      return digits.join('')
    }
    digits[index] = '0'
  }
  return `1${digits.join('')}`
}

function roundDecimal(parts: DecimalParts, digits: number): { integer: string; fraction: string } {
  const fractionDigits = parts.fraction.slice(0, digits).padEnd(digits, '0').split('')
  const shouldRound = parts.fraction.length > digits && parts.fraction[digits] >= '5'
  if (shouldRound) {
    let carry = true
    for (let index = fractionDigits.length - 1; index >= 0 && carry; index -= 1) {
      if (fractionDigits[index] === '9') {
        fractionDigits[index] = '0'
      } else {
        fractionDigits[index] = String.fromCharCode(fractionDigits[index].charCodeAt(0) + 1)
        carry = false
      }
    }
    if (carry) return { integer: incrementInteger(parts.integer), fraction: fractionDigits.join('') }
  }
  return { integer: parts.integer, fraction: fractionDigits.join('') }
}

function groupInteger(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function formatYuan(value: MoneyValue, digits = MONEY_DISPLAY_DECIMAL_PLACES): string {
  const normalized = normalizeMoneyValue(value)
  if (normalized === null || !Number.isInteger(digits) || digits < 0) return '--'
  const parts = parseDecimal(normalized)
  if (!parts) return '--'
  const rounded = roundDecimal(parts, digits)
  const fraction = digits > 0 ? `.${rounded.fraction}` : ''
  return `${parts.negative ? '-' : ''}¥${groupInteger(rounded.integer)}${fraction}`
}

export function formatYuanExact(value: MoneyValue): string {
  const normalized = normalizeMoneyValue(value)
  if (normalized === null) return '--'
  const parts = parseDecimal(normalized)
  if (!parts) return '--'
  const fraction = parts.fraction ? `.${parts.fraction}` : ''
  return `${parts.negative ? '-' : ''}¥${groupInteger(parts.integer)}${fraction}`
}

export function isZeroYuan(value: MoneyValue): boolean {
  const normalized = normalizeMoneyValue(value)
  return normalized !== null && /^[-+]?0(?:\.0*)?$/.test(normalized)
}

export function formatSignedYuan(value: MoneyValue, direction: 'income' | 'expense' | 'adjustment'): string {
  const formatted = formatYuan(value)
  if (formatted === '--' || direction === 'adjustment') return formatted
  return `${direction === 'income' ? '+' : '-'}${formatted}`
}

export function formatSignedYuanExact(value: MoneyValue, direction: 'income' | 'expense' | 'adjustment'): string {
  const formatted = formatYuanExact(value)
  if (formatted === '--' || direction === 'adjustment') return formatted
  return `${direction === 'income' ? '+' : '-'}${formatted}`
}

export type ApiTimeValue = string | number

const UNIX_TIMESTAMP_MILLISECONDS_THRESHOLD = 1_000_000_000_000
const LOCAL_DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const API_TIME_FIELD_SUFFIXES = ['_at', '_from', '_until', '_start', '_end', '_time', '_watermark'] as const

export function isApiTimeValue(value: unknown): value is ApiTimeValue {
  return typeof value === 'string' || typeof value === 'number'
}

export function isApiTimeFieldName(fieldName: string): boolean {
  const normalized = fieldName.trim().toLowerCase()
  if (!normalized || normalized === 'date' || normalized === 'time') return false
  return API_TIME_FIELD_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
}

export function formatLocalDateInput(date: Date): string {
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function shiftLocalDate(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function localDateToISOString(value: string, endOfDay = false): string | undefined {
  const match = value.trim().match(LOCAL_DATE_INPUT_PATTERN)
  if (!match) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0)
  // 中文：日期输入代表用户本地日历日期，先在本地构造边界，再转换为 UTC ISO 时间。
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined
  return date.toISOString()
}

function parseUnixTimestamp(value: number): Date {
  if (!Number.isFinite(value)) return new Date(Number.NaN)
  const milliseconds = Math.abs(value) < UNIX_TIMESTAMP_MILLISECONDS_THRESHOLD ? value * 1000 : value
  return new Date(milliseconds)
}

function parseApiTime(value: ApiTimeValue): Date {
  if (typeof value === 'number') return parseUnixTimestamp(value)
  // 兼容历史接口的无时区时间，并按后端 UTC 约定解释，避免被浏览器误当成本地时间。
  const trimmed = value.trim()
  if (!trimmed) return new Date(Number.NaN)
  if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) return parseUnixTimestamp(Number(trimmed))
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T')
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
  return new Date(hasTimezone ? normalized : `${normalized}Z`)
}

function apiTimeFallback(value: ApiTimeValue): string {
  return typeof value === 'number' ? String(value) : value.replace('T', ' ').replace(/Z$/, '')
}

export function apiTimeToISOString(value: ApiTimeValue | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const date = parseApiTime(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function formatApiTime(value: ApiTimeValue | null | undefined, timeZone?: string): string {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return '--'
  const date = parseApiTime(value)
  if (Number.isNaN(date.getTime())) return apiTimeFallback(value)
  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }
    if (!timeZone) delete options.timeZone
    return new Intl.DateTimeFormat(getActiveLocale(), options).format(date).replaceAll('/', '-')
  } catch {
    return apiTimeFallback(value)
  }
}

export function formatCount(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '--'
  const raw = typeof value === 'number' ? (Number.isFinite(value) ? Math.trunc(value).toString() : '') : value.trim()
  if (!/^\d+$/.test(raw)) return '--'
  return raw.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(getActiveLocale()).format(value)
}

export function modelPriceSummary(model: ModelRecord): string {
  const price = model.tokenNxPrice
  const formatPresent = (value: number | undefined): string | null => formatDecimal(value)
  const input = formatPresent(price.input)
  const output = formatPresent(price.output)
  const english = getActiveLanguage() === 'en-US'
  if (input !== null && output !== null) return english ? `Input ${input} / Output ${output} ${price.unit}` : `输入 ${input} / 输出 ${output} ${price.unit}`
  const standard = formatPresent(price.standard)
  const hd = formatPresent(price.hd)
  if (standard !== null && hd !== null) return english ? `Standard ${standard} / HD ${hd} ${price.unit}` : `标准 ${standard} / 高清 ${hd} ${price.unit}`
  const base = formatPresent(price.base)
  if (base !== null) return `${base} ${price.unit}`
  return english ? 'Price pending' : '价格待公布'
}

export function usageTotal(records: UsageRecord[]): { cost: number; inputTokens: number; outputTokens: number; requests: number } {
  return records.reduce((total, record) => ({
    cost: total.cost + record.cost,
    inputTokens: total.inputTokens + record.inputTokens,
    outputTokens: total.outputTokens + record.outputTokens,
    requests: total.requests + 1,
  }), { cost: 0, inputTokens: 0, outputTokens: 0, requests: 0 })
}

export function relativeTime(value: ApiTimeValue): string {
  const parsed = parseApiTime(value)
  if (Number.isNaN(parsed.getTime())) return typeof value === 'number' ? String(value) : value
  const minutes = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 60000))
  const english = getActiveLanguage() === 'en-US'
  if (minutes < 1) return english ? 'Just now' : '刚刚'
  if (minutes < 60) return english ? `${minutes} minute${minutes === 1 ? '' : 's'} ago` : `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return english ? `${hours} hour${hours === 1 ? '' : 's'} ago` : `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return english ? `${days} day${days === 1 ? '' : 's'} ago` : `${days} 天前`
}

export function formatApiTimeField(fieldName: string, value: unknown): string | null {
  if (!isApiTimeFieldName(fieldName) || !isApiTimeValue(value)) return null
  return formatApiTime(value)
}
