import { describe, expect, it } from 'vitest'
import { limitPlaygroundPrompt, playgroundCharacterCount, PLAYGROUND_MAX_INPUT_CHARACTERS } from './playground'

describe('智能对话输入限制', () => {
  it('按 Unicode 字符统计并限制输入长度', () => {
    const value = '字'.repeat(PLAYGROUND_MAX_INPUT_CHARACTERS + 1)

    expect(playgroundCharacterCount('你好😀')).toBe(3)
    expect(playgroundCharacterCount(value)).toBe(PLAYGROUND_MAX_INPUT_CHARACTERS + 1)
    expect(playgroundCharacterCount(limitPlaygroundPrompt(value))).toBe(PLAYGROUND_MAX_INPUT_CHARACTERS)
  })

  it('限制 Emoji 输入时不会把一个字符拆开', () => {
    const value = '😀'.repeat(PLAYGROUND_MAX_INPUT_CHARACTERS + 1)
    const limited = limitPlaygroundPrompt(value)

    expect(limited).toBe('😀'.repeat(PLAYGROUND_MAX_INPUT_CHARACTERS))
  })
})
