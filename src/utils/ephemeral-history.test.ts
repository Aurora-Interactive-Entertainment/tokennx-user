import { beforeEach, describe, expect, it } from 'vitest'
import {
  PLAYGROUND_SESSION_HISTORY_KEY,
  SESSION_HISTORY_MAX_BYTES,
  readUserSessionHistory,
  writeUserSessionHistory,
} from './ephemeral-history'

type TestEntry = { id: string; content: string }

function isTestEntry(value: unknown): value is TestEntry {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof (value as TestEntry).id === 'string'
    && typeof (value as TestEntry).content === 'string',
  )
}

describe('用户历史存储', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('只允许同一用户读取并清除账号不匹配的数据', () => {
    writeUserSessionHistory(PLAYGROUND_SESSION_HISTORY_KEY, 'user-a', [{ id: '1', content: '私密内容' }])
    expect(readUserSessionHistory(PLAYGROUND_SESSION_HISTORY_KEY, 'user-a', isTestEntry)).toEqual([
      { id: '1', content: '私密内容' },
    ])
    expect(readUserSessionHistory(PLAYGROUND_SESSION_HISTORY_KEY, 'user-b', isTestEntry)).toEqual([])
    expect(window.localStorage.getItem(PLAYGROUND_SESSION_HISTORY_KEY)).toBeNull()
  })

  it('未登录时不读取也不写入历史', () => {
    writeUserSessionHistory(PLAYGROUND_SESSION_HISTORY_KEY, null, [{ id: '1', content: '内容' }])
    expect(window.localStorage.getItem(PLAYGROUND_SESSION_HISTORY_KEY)).toBeNull()
    expect(readUserSessionHistory(PLAYGROUND_SESSION_HISTORY_KEY, '', isTestEntry)).toEqual([])
  })

  it('限制条数并优先保留最新记录', () => {
    const entries = Array.from({ length: 30 }, (_, index) => ({ id: String(index), content: `内容 ${index}` }))
    writeUserSessionHistory(PLAYGROUND_SESSION_HISTORY_KEY, 'user-a', entries)
    const restored = readUserSessionHistory(PLAYGROUND_SESSION_HISTORY_KEY, 'user-a', isTestEntry)
    expect(restored).toHaveLength(20)
    expect(restored[0]?.id).toBe('0')
    expect(restored.at(-1)?.id).toBe('19')
  })

  it('超过容量时丢弃最旧记录并保持存储可解析', () => {
    const entries = Array.from({ length: 20 }, (_, index) => ({
      id: String(index),
      content: `${index}-${'x'.repeat(100_000)}`,
    }))
    writeUserSessionHistory(PLAYGROUND_SESSION_HISTORY_KEY, 'user-a', entries)
    const raw = window.localStorage.getItem(PLAYGROUND_SESSION_HISTORY_KEY)
    expect(raw).not.toBeNull()
    expect(String(raw).length * 2).toBeLessThanOrEqual(SESSION_HISTORY_MAX_BYTES)
    const restored = readUserSessionHistory(PLAYGROUND_SESSION_HISTORY_KEY, 'user-a', isTestEntry)
    expect(restored.length).toBeGreaterThan(0)
    expect(restored.length).toBeLessThan(20)
    expect(restored[0]?.id).toBe('0')
  })
})
