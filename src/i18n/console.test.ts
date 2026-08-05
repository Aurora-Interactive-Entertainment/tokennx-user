import { describe, expect, it } from 'vitest'
import { consoleResources } from './console'

function leafPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return prefix ? [prefix] : []
  return Object.entries(value).flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key))
}

describe('控制台多语言资源', () => {
  it('中英文资源保持相同的叶子键集合', () => {
    const zhKeys = new Set(leafPaths(consoleResources['zh-CN']))
    const enKeys = new Set(leafPaths(consoleResources['en-US']))

    expect([...zhKeys].filter((key) => !enKeys.has(key))).toEqual([])
    expect([...enKeys].filter((key) => !zhKeys.has(key))).toEqual([])
  })
})
