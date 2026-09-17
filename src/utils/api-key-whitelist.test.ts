import { describe, expect, it } from 'vitest'
import { parseApiKeyWhitelist } from './api-key-whitelist'

describe('API 密钥白名单规则', () => {
  it('支持混合分隔符并对单地址补前缀后去重', () => {
    expect(parseApiKeyWhitelist(' 192.168.1.1，192.168.1.1/32;10.122.0.7/24；2001:db8::1\r\n2001:db8::/64|::ffff:192.0.2.1,, ')).toEqual({
      entries: ['192.168.1.1/32', '10.122.0.7/24', '2001:db8::1/128', '2001:db8::/64', '::ffff:192.0.2.1/128'],
      invalid: null,
      tooMany: false,
    })
  })

  it.each(['', ' ,；\r\n| '])('空输入产生用于清空的空数组：%s', (value) => {
    expect(parseApiKeyWhitelist(value)).toEqual({ entries: [], invalid: null, tooMany: false })
  })

  it.each(['0.0.0.0/0', '::/0', '192.0.2.1/33', '::1/129', '256.0.0.1', '01.2.3.4', '1.2.3.4/', '1.2.3.4/24/1', '1.2.3.4/24/', '2001:::1', '2001::db8::1', '1:2:3:4:5:6:7:8:9', '192.0.2.1::', 'example.com'])('拒绝非法规则且不部分提交：%s', (value) => {
    expect(parseApiKeyWhitelist(`192.0.2.2,${value}`)).toMatchObject({ entries: [], invalid: value })
  })

  it('按去重后的规则数量限制 64 条', () => {
    const rules = Array.from({ length: 64 }, (_, i) => `192.0.2.${i + 1}`)
    const allowed = parseApiKeyWhitelist([...rules, '192.0.2.1/32'].join(','))
    expect(allowed.entries).toHaveLength(64)
    expect(allowed.tooMany).toBe(false)
    expect(parseApiKeyWhitelist([...rules, '192.0.2.65'].join(',')).tooMany).toBe(true)
  })
})
