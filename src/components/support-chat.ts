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

// 回复规则集中在 mock 适配层，后续接入真实客服服务时只替换这一层。
const MOCK_SUPPORT_REPLIES: Record<SupportLocale, readonly MockSupportReply[]> = {
  'zh-CN': [
    { keywords: ['价格', '收费', '计费'], response: '你可以在价格页查看模型的输入、输出价格和可用率；如果需要，我也可以帮你定位具体模型。' },
    { keywords: ['余额', '充值', '套餐'], response: '余额和套餐入口都在控制台的费用中心，充值后通常会很快同步到当前工作空间。' },
    { keywords: ['模型', 'api', '密钥'], response: '你可以先从模型目录选择能力，再到控制台创建 API Key；每把密钥都可以限制可访问的模型范围。' },
    { keywords: ['故障', '异常', '状态', '打不开'], response: '这里是本地自助答疑，不会提交故障工单。请通过页脚的企业客服二维码联系人工，并提供发生时间和请求 ID。' },
    { keywords: ['退款', '发票', '账单'], response: '退款和账单问题需要人工核对。请通过页脚的企业客服二维码联系人工；此处消息不会转交客服或创建工单。' },
  ],
  'en-US': [
    { keywords: ['price', 'pricing', 'cost', 'billing'], response: 'You can compare model input, output, and availability on the pricing page. I can also help you find a specific model.' },
    { keywords: ['balance', 'top up', 'plan', 'subscription'], response: 'Balance and plan actions are available in the billing area of your console and usually sync quickly after a top-up.' },
    { keywords: ['model', 'api', 'key'], response: 'Choose a capability in the model catalog, then create an API key in the console. Each key can be scoped to selected models.' },
    { keywords: ['outage', 'error', 'status', 'unavailable'], response: 'This is a local FAQ assistant and does not submit support tickets. Use the enterprise support QR code in the footer to contact support with the time and request ID.' },
    { keywords: ['refund', 'invoice', 'receipt'], response: 'Refunds and billing issues require a support specialist. Use the enterprise support QR code in the footer; messages here are not forwarded and do not create a ticket.' },
  ],
}

const MOCK_SUPPORT_FALLBACKS: Record<SupportLocale, string> = {
  'zh-CN': '这里提供本地常见问题解答，消息不会发送给人工客服。需要人工处理时，请通过页脚的企业客服二维码联系，不要在此提交敏感信息。',
  'en-US': 'This local assistant answers common questions. Messages are not sent to support. For personal assistance, use the enterprise support QR code in the footer and do not submit sensitive information here.',
}

function normalizeSupportMessage(message: string): string {
  return message.trim().toLocaleLowerCase()
}

export function getMockSupportReply(message: string, locale: SupportLocale = 'zh-CN'): string {
  const normalizedMessage = normalizeSupportMessage(message)
  const reply = MOCK_SUPPORT_REPLIES[locale].find((item) => item.keywords.some((keyword) => normalizedMessage.includes(keyword)))
  return reply?.response ?? MOCK_SUPPORT_FALLBACKS[locale]
}
