import { describe, expect, it } from 'vitest'
import { getMockSupportReply } from './support-chat'

describe('mock 客服回复', () => {
  it('根据中文价格关键词返回对应回复', () => {
    expect(getMockSupportReply('  请问模型价格在哪里查看？  ')).toContain('价格页')
  })

  it('根据英文关键词返回对应回复', () => {
    expect(getMockSupportReply('How can I check my API key?', 'en-US')).toContain('model catalog')
  })

  it('没有匹配关键词时返回可继续追问的兜底回复', () => {
    expect(getMockSupportReply('我想咨询一个暂时没有配置的问题')).toContain('补充订单号')
    expect(getMockSupportReply('', 'en-US')).toContain('Thanks for your message')
  })
})
