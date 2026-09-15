import i18n from '@/i18n'
import type { EnterpriseRoleOption } from '@/api/enterprise-console'

// 只翻译展示文本，接口请求和权限判断始终保留服务端枚举代码。
export function enterpriseRoleLabel(
  value: string,
  options: EnterpriseRoleOption[] = [],
): string {
  const code = value.trim()
  const option = options.find((item) => item.code === code)
  const builtIn =
    option?.owner_role || code === 'owner'
      ? 'owner'
      : code === 'admin' || code === 'administrator'
        ? 'admin'
        : code === 'member'
          ? 'member'
          : null
  return builtIn
    ? i18n.t(`enterpriseLabels.roles.${builtIn}`)
    : option?.name || code || i18n.t('console.enterprise.roleUnnamed')
}

const JOIN_SOURCE_KEYS: Record<string, string> = {
  owner: 'owner',
  admin: 'admin',
  member: 'member',
  invitation: 'invitation',
  invite: 'invitation',
  certification: 'certification',
}

// 「账号类型」列展示的是服务端下发的加入来源枚举，未知代码保留原值以兼容服务端扩展。
export function joinSourceLabel(value: string): string {
  const code = value.trim().toLowerCase()
  const key = JOIN_SOURCE_KEYS[code]
  return key ? i18n.t(`enterpriseLabels.joinSources.${key}`) : value.trim()
}

const AUDIT_RESOURCE_KEYS: Record<string, string> = {
  enterprise: 'enterprise',
  enterprise_department: 'department',
  enterprise_member: 'member',
  enterprise_role: 'role',
  enterprise_invitation: 'invitation',
  enterprise_join_request: 'joinRequest',
  enterprise_api_key: 'apiKey',
  enterprise_model: 'model',
  enterprise_tag: 'tag',
  enterprise_settings: 'settings',
}

// 操作列表、详情和筛选共用枚举翻译；未知代码保留原值，兼容服务端扩展。
export function enterpriseAuditCodeLabel(value: string): string {
  const code = value.trim()
  const key = AUDIT_RESOURCE_KEYS[code]
  return key ? i18n.t(`enterpriseLabels.auditResources.${key}`) : code
}
