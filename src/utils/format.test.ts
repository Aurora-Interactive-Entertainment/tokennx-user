import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiTimeToMilliseconds, formatApiTime, formatApiTimeField, formatCount, formatCurrency, formatDecimal, formatLocalDateInput, formatNumber, formatSignedYuan, formatYuan, formatYuanExact, isApiTimeFieldName, isApiTimestamp, isZeroYuan, localDateToTimestamp, modelPriceSummary, relativeTime, shiftLocalDate, usageTotal } from './format'
import { normalizeQuickstartLanguage, normalizeQuickstartProtocol, quickstartCodeSample } from './quickstart'
import { findModel } from '@/data/models'

describe('展示格式与用量聚合', () => {
  beforeEach(() => vi.useRealTimers())

  it('格式化人民币和数字', () => {
    expect(formatCurrency(10)).toBe('¥10.000')
    expect(formatCurrency(0.0012, 4)).toBe('¥0.0012')
    expect(formatDecimal(0.1)).toBe('0.100')
    expect(formatNumber(1234567)).toBe('1,234,567')
  })

  it('使用十进制字符串格式化金额，不通过浮点数累加或展示', () => {
    expect(formatYuan('100.000000000')).toBe('¥100.000')
    expect(formatYuan('999999999999999999.995')).toBe('¥999,999,999,999,999,999.995')
    expect(formatYuan('0.0049')).toBe('¥0.005')
    expect(formatYuan('0.005')).toBe('¥0.005')
    expect(formatYuan('0.123456789')).toBe('¥0.123')
    expect(formatYuan('0.000000005')).toBe('¥0.000')
    expect(formatYuan('0.9995')).toBe('¥1.000')
    expect(formatYuan('-0.0005')).toBe('-¥0.001')
    expect(formatYuanExact('0.123456789')).toBe('¥0.123456789')
    expect(formatYuan('12.5', 0)).toBe('¥13')
    expect(formatYuan('not-an-amount')).toBe('--')
    expect(formatSignedYuan('10.000000000', 'income')).toBe('+¥10.000')
    expect(formatSignedYuan('10.000000000', 'expense')).toBe('-¥10.000')
    expect(formatSignedYuan('10.000000000', 'adjustment')).toBe('¥10.000')
    expect(isZeroYuan('0.000000000')).toBe(true)
    expect(isZeroYuan('0.000000001')).toBe(false)
  })

  it('按 UTC 接口时间和浏览器时区格式化用户端展示', () => {
    expect(formatApiTime('2026-07-23T08:30:00.123456Z', 'UTC')).toBe('2026-07-23 08:30:00')
    expect(formatApiTime('2026-07-23T08:30:00.123456Z', 'Asia/Shanghai')).toBe('2026-07-23 16:30:00')
    expect(formatApiTime('2026-07-23 08:30:00', 'UTC')).toBe('2026-07-23 08:30:00')
    const timestamp = Date.parse('2026-07-23T08:30:00Z')
    expect(formatApiTime(timestamp, 'UTC')).toBe('2026-07-23 08:30:00')
    expect(formatApiTime(Math.floor(timestamp / 1000), 'UTC')).toBe('2026-07-23 08:30:00')
    expect(formatApiTime(null)).toBe('--')
    expect(formatApiTime('bad-date')).toBe('bad-date')
    expect(formatCount('0001000')).toBe('1,000')
    expect(formatCount('900719925474099312345')).toBe('900,719,925,474,099,312,345')
    expect(formatCount('not-a-count')).toBe('--')
  })

  it('统一处理本地日期边界和审计时间字段', () => {
    const localDate = new Date(2026, 6, 30, 12, 0, 0, 0)
    expect(formatLocalDateInput(localDate)).toBe('2026-07-30')
    expect(formatLocalDateInput(shiftLocalDate(localDate, -1))).toBe('2026-07-29')
    expect(localDateToTimestamp('2026-07-30')).toBe(new Date(2026, 6, 30, 0, 0, 0, 0).getTime())
    expect(localDateToTimestamp('2026-07-30', true)).toBe(new Date(2026, 6, 30, 23, 59, 59, 999).getTime())
    expect(localDateToTimestamp('2026-02-30')).toBeUndefined()
    expect(isApiTimestamp(Date.UTC(2026, 6, 30))).toBe(true)
    expect(isApiTimestamp(Date.UTC(2026, 6, 30) / 1000)).toBe(false)
    expect(apiTimeToMilliseconds(Date.UTC(2026, 6, 30))).toBe(Date.UTC(2026, 6, 30))
    expect(isApiTimeFieldName('expires_at')).toBe(true)
    expect(isApiTimeFieldName('date')).toBe(false)
    expect(formatApiTimeField('expires_at', Date.parse('2026-07-23T08:30:00Z'))).toContain('2026-07-23')
    expect(formatApiTimeField('date', '2026-07-23')).toBeNull()
  })

  it('根据模型计费结构生成价格摘要', () => {
    expect(modelPriceSummary(findModel('deepseek-chat')!)).toBe('输入 0.100 / 输出 0.200 ¥/M tokens')
    expect(modelPriceSummary(findModel('cogvideo')!)).toBe('1.600 ¥/秒')
    expect(modelPriceSummary(findModel('dall-e-3')!)).toBe('标准 0.280 / 高清 0.840 ¥/张')
    expect(modelPriceSummary({ tokenNxPrice: { unit: '¥/次' } } as never)).toBe('价格待公布')
  })

  it('聚合请求、输入输出 Token 和费用', () => {
    const result = usageTotal([
      { id: '1', requestId: 'req_1', modelId: 'deepseek-chat', status: 'success', createdAt: '2026-07-16 09:00:00', inputTokens: 10, outputTokens: 4, cost: 0.2, latency: 100, source: 'API' },
      { id: '2', requestId: 'req_2', modelId: 'gpt-4o', status: 'failed', createdAt: '2026-07-16 09:01:00', inputTokens: 6, outputTokens: 0, cost: 0, latency: 80, source: '控制台测试' },
    ])
    expect(result).toEqual({ cost: 0.2, inputTokens: 16, outputTokens: 4, requests: 2 })
    expect(usageTotal([])).toEqual({ cost: 0, inputTokens: 0, outputTokens: 0, requests: 0 })
  })

  it('对非法日期保留原文，对合法日期生成相对时间', () => {
    expect(relativeTime('not-a-date')).toBe('not-a-date')
    expect(relativeTime(new Date(Date.now() - 1000).toISOString())).toBe('刚刚')
    expect(relativeTime(new Date(Date.now() - 20 * 60000).toISOString())).toBe('20 分钟前')
    expect(relativeTime(new Date(Date.now() - 3 * 60 * 60000).toISOString())).toBe('3 小时前')
    expect(relativeTime(new Date(Date.now() - 2 * 24 * 60 * 60000).toISOString())).toBe('2 天前')
  })

  it('按协议、语言和模型生成快速接入代码', () => {
    expect(normalizeQuickstartProtocol('invalid')).toBe('openai')
    expect(normalizeQuickstartLanguage('invalid')).toBe('python')
    expect(quickstartCodeSample({ protocol: 'openai', language: 'python', modelAlias: 'deepseek-public' })).toContain('model="deepseek-public"')
    expect(quickstartCodeSample({ protocol: 'openai', language: 'node', modelAlias: 'gpt-public' })).toContain('baseURL')
    expect(quickstartCodeSample({ protocol: 'openai', language: 'curl', modelAlias: 'gpt-public' })).toContain('/chat/completions')
    expect(quickstartCodeSample({ protocol: 'anthropic', language: 'python', modelAlias: 'claude-public' })).toContain('Anthropic')
    expect(quickstartCodeSample({ protocol: 'anthropic', language: 'node', modelAlias: 'claude-public' })).toContain('@anthropic-ai/sdk')
    expect(quickstartCodeSample({ protocol: 'anthropic', language: 'curl', modelAlias: 'claude-public' })).toContain('/messages')
  })
})
