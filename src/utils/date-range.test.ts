import { describe, expect, it } from 'vitest'
import { addLocalDays, endOfLocalDay, startOfLocalDay } from './date-range'

describe('local date range helpers', () => {
  it('normalizes a date to the local day start', () => {
    const value = startOfLocalDay(new Date(2026, 0, 15, 13, 42, 8))
    expect(value.getFullYear()).toBe(2026)
    expect(value.getMonth()).toBe(0)
    expect(value.getDate()).toBe(15)
    expect(value.getHours()).toBe(0)
    expect(value.getMinutes()).toBe(0)
  })

  it('adds calendar days without mutating the input', () => {
    const input = new Date(2026, 2, 28, 12)
    const next = addLocalDays(input, 2)
    expect(next.getDate()).toBe(30)
    expect(input.getDate()).toBe(28)
  })

  it('returns the final millisecond of the local day', () => {
    const value = endOfLocalDay(new Date(2026, 0, 15, 13, 42))
    expect(value.getHours()).toBe(23)
    expect(value.getMinutes()).toBe(59)
    expect(value.getSeconds()).toBe(59)
    expect(value.getMilliseconds()).toBe(999)
  })
})
