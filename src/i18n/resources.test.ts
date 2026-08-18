import { describe, expect, it } from 'vitest'
import i18n from '@/i18n'

function leafPaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return prefix ? [prefix] : []
  return Object.entries(value).flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key))
}

describe('i18n resources', () => {
  it('keeps Chinese and English resource leaves aligned', () => {
    const zh = new Set(leafPaths(i18n.getResourceBundle('zh-CN', 'translation')))
    const en = new Set(leafPaths(i18n.getResourceBundle('en-US', 'translation')))
    expect([...zh].filter((key) => !en.has(key))).toEqual([])
    expect([...en].filter((key) => !zh.has(key))).toEqual([])
  })
})
