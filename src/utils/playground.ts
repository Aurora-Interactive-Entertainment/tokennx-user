export const PLAYGROUND_MAX_ROUNDS = 10
export const PLAYGROUND_MAX_INPUT_CHARACTERS = 1000

export type PlaygroundConversationRole = 'user' | 'assistant'

export interface PlaygroundConversationMessage {
  role: PlaygroundConversationRole
}

export function playgroundCharacterCount(value: string): number {
  return Array.from(value).length
}

export function limitPlaygroundPrompt(value: string): string {
  return playgroundCharacterCount(value) <= PLAYGROUND_MAX_INPUT_CHARACTERS
    ? value
    : Array.from(value).slice(0, PLAYGROUND_MAX_INPUT_CHARACTERS).join('')
}

// 中文：只按用户消息统计轮次，流式生成中的临时回复不会提前占用下一轮。
export function playgroundRoundCount(messages: readonly PlaygroundConversationMessage[]): number {
  return messages.reduce((count, message) => count + (message.role === 'user' ? 1 : 0), 0)
}

export function canStartPlaygroundRound(rounds: number): boolean {
  return Number.isSafeInteger(rounds) && rounds >= 0 && rounds < PLAYGROUND_MAX_ROUNDS
}
