export type SupportLocale = 'zh-CN' | 'en-US'

export type SupportMessageRole = 'user' | 'support'

export interface SupportChatMessage {
  id: string
  role: SupportMessageRole
  text: string
}

interface MockSupportReply {
  keywords: readonly string[]
  response: string
}

export const MOCK_SUPPORT_REPLY_DELAY_MS = 650

// 中文：回复规则集中在 mock 适配层，后续接入真实客服服务时只替换这一层。
const MOCK_SUPPORT_REPLIES: Record<SupportLocale, readonly MockSupportReply[]> = {
  'zh-CN': [
    { keywords: ['价格', '收费', '计费'], response: '你可以在价格页查看模型的输入、输出价格和可用率；如果需要，我也可以帮你定位具体模型。' },
    { keywords: ['余额', '充值', '套餐'], response: '余额和套餐入口都在控制台的费用中心，充值后通常会很快同步到当前工作空间。' },
    { keywords: ['模型', 'api', '密钥'], response: '你可以先从模型目录选择能力，再到控制台创建 API Key；每把密钥都可以限制可访问的模型范围。' },
    { keywords: ['故障', '异常', '状态', '打不开'], response: '我先帮你记录这个问题。你可以查看服务状态页；如果仍未恢复，请把发生时间和请求 ID 发给客服。' },
    { keywords: ['退款', '发票', '账单'], response: '请提供订单号或账单记录，我会把信息转给人工客服继续核对。' },
  ],
  'en-US': [
    { keywords: ['price', 'pricing', 'cost', 'billing'], response: 'You can compare model input, output, and availability on the pricing page. I can also help you find a specific model.' },
    { keywords: ['balance', 'top up', 'plan', 'subscription'], response: 'Balance and plan actions are available in the billing area of your console and usually sync quickly after a top-up.' },
    { keywords: ['model', 'api', 'key'], response: 'Choose a capability in the model catalog, then create an API key in the console. Each key can be scoped to selected models.' },
    { keywords: ['outage', 'error', 'status', 'unavailable'], response: 'I can help record the issue. Check the service status page, and send the time and request ID to support if it continues.' },
    { keywords: ['refund', 'invoice', 'receipt'], response: 'Please share the order number or billing record and I will pass it to a support specialist for review.' },
  ],
}

const MOCK_SUPPORT_FALLBACKS: Record<SupportLocale, string> = {
  'zh-CN': '收到你的消息了。我会先帮你整理问题，客服通常会在几分钟内回复；你也可以补充订单号、模型名称或请求 ID。',
  'en-US': 'Thanks for your message. I will help organize the issue first. Support usually replies within a few minutes, and you can include an order number, model name, or request ID.',
}

function normalizeSupportMessage(message: string): string {
  return message.trim().toLocaleLowerCase()
}

export function getMockSupportReply(message: string, locale: SupportLocale = 'zh-CN'): string {
  const normalizedMessage = normalizeSupportMessage(message)
  const reply = MOCK_SUPPORT_REPLIES[locale].find((item) => item.keywords.some((keyword) => normalizedMessage.includes(keyword)))
  return reply?.response ?? MOCK_SUPPORT_FALLBACKS[locale]
}
