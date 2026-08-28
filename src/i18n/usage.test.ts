import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import i18n from './index'

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

function staticTranslationKeys(source: string): string[] {
  const keys = new Set<string>()
  const patterns = [
    /\bt\(\s*['"]([^'"]+)['"]/g,
    /\bi18n\.t\(\s*['"]([^'"]+)['"]/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) keys.add(match[1])
  }
  return [...keys]
}

describe('i18n usage coverage', () => {
  it('every static translation key used by source code exists in both languages', () => {
    const root = join(process.cwd(), 'src')
    const usages = new Map<string, string[]>()
    for (const file of sourceFiles(root)) {
      if (file.includes(`${join('src', 'i18n')}${'\\'}`)) continue
      for (const key of staticTranslationKeys(readFileSync(file, 'utf8'))) {
        const files = usages.get(key) ?? []
        files.push(relative(process.cwd(), file))
        usages.set(key, files)
      }
    }

    const missing = [...usages.entries()]
      .filter(([key]) => !i18n.exists(key, { lng: 'zh-CN' }) || !i18n.exists(key, { lng: 'en-US' }))
      .map(([key, files]) => `${key} (${files.join(', ')})`)
      .sort()

    expect(missing).toEqual([])
  })
})
