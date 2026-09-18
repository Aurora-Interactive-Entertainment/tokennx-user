import type { EnterpriseContext } from '@/api/enterprise-console'

export function isEnterpriseOwner(context: EnterpriseContext): boolean {
  return context.role === 'owner' || context.role_options?.some((role) => role.code === context.role && role.owner_role) === true
}

// 新接口以具体权限为准；旧部署缺少 permissions 时才使用页面能力兼容。
export function hasEnterpriseMemberPermission(context: EnterpriseContext, permission: string): boolean {
  if (isEnterpriseOwner(context)) return true
  if (context.permissions) return context.permissions.includes(permission)
  switch (permission) {
    case 'members.view': return true
    case 'departments.view': return context.capabilities.can_view_departments !== false
    case 'departments.manage': return context.capabilities.can_manage_departments ?? context.capabilities.can_manage_members
    case 'department_members.manage': return context.capabilities.can_manage_department_members ?? context.capabilities.can_manage_members
    case 'roles.edit': return context.capabilities.can_manage_roles
    default: return context.capabilities.can_manage_members
  }
}
