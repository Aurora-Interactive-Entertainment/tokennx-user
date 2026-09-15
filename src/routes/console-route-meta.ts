// 控制台页面与标题共用路径清单，新增页面必须同时提供中英文标题。
export const CONSOLE_ROUTE_META = {
  models: { zh: '模型广场', en: 'Model catalog' },
  'models/:modelId': { zh: '模型详情', en: 'Model details' },
  playground: { zh: '智能对话', en: 'AI chat' },
  image: { zh: '图片生成', en: 'Image generation' },
  video: { zh: '视频生成', en: 'Video generation' },
  quickstart: { zh: '快速接入', en: 'Quickstart' },
  'api-keys': { zh: '我的密钥', en: 'My API keys' },
  'enterprise-api-keys': { zh: '密钥管理', en: 'Enterprise API keys' },
  usage: { zh: '个人用量', en: 'Personal usage' },
  billing: { zh: '费用管理', en: 'Billing' },
  subscription: { zh: '套餐管理', en: 'Plan management' },
  purchase: { zh: '套餐购买', en: 'Purchase plans' },
  recharge: { zh: '充值管理', en: 'Top-up management' },
  'real-name': { zh: '实名认证', en: 'Identity verification' },
  settings: { zh: '个人设置', en: 'Personal settings' },
  invitations: { zh: '邀请返现', en: 'Referral rewards' },
  'enterprise-create': { zh: '企业入驻', en: 'Create enterprise' },
  'enterprise-governance': { zh: '权限管理', en: 'Permission management' },
  'enterprise-models': { zh: '企业模型', en: 'Enterprise models' },
  'enterprise-settings': { zh: '企业设置', en: 'Enterprise settings' },
  'trae-enterprise/data-analysis': { zh: '数据分析', en: 'Data analysis' },
  'trae-enterprise/users': { zh: '人员管理', en: 'Member management' },
  // 与同名 subscription 路由是同一个页面，只是企业命名空间不同，标题保持一致。
  'trae-enterprise/subscription': {
    zh: '套餐管理',
    en: 'Plan management',
  },
  'trae-enterprise/usage': { zh: '用量管理', en: 'Usage management' },
  'trae-enterprise/operation-log': { zh: '操作日志', en: 'Operation log' },
} as const

export type ConsoleRoutePath = keyof typeof CONSOLE_ROUTE_META

export function consoleRouteTitle(routePath: string, language: string): string {
  const path = routePath.replace(/^\/console\/?/, '')
  const key = path.startsWith('models/')
    ? 'models/:modelId'
    : (path as ConsoleRoutePath)
  const meta = CONSOLE_ROUTE_META[key]
  return (
    meta?.[language.startsWith('en') ? 'en' : 'zh'] ??
    (language.startsWith('en') ? 'Console' : '控制台')
  )
}
