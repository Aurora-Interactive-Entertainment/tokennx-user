import { expect, it } from 'vitest'
import type { EnterpriseContext } from '@/api/enterprise-console'
import { hasEnterpriseMemberPermission } from './enterprise-member-access'

const context = { role: 'auditor', permissions: ['members.view'], capabilities: { can_manage_members: true, can_manage_roles: true, can_manage_departments: true } } as EnterpriseContext

it('自定义角色以细粒度权限为准，不因页面总能力放开其他写操作', () => {
  expect(hasEnterpriseMemberPermission(context, 'members.view')).toBe(true)
  for (const permission of ['members.remove', 'roles.edit', 'members.invite', 'members.approve', 'departments.manage', 'department_members.manage']) expect(hasEnterpriseMemberPermission(context, permission)).toBe(false)
})

it('所有者拥有权限，旧服务省略权限目录时兼容原能力', () => {
  expect(hasEnterpriseMemberPermission({ ...context, role: 'owner' }, 'members.remove')).toBe(true)
  expect(hasEnterpriseMemberPermission({ ...context, permissions: undefined }, 'roles.edit')).toBe(true)
  expect(hasEnterpriseMemberPermission({ ...context, permissions: [], capabilities: { ...context.capabilities, can_manage_members: true } }, 'members.remove')).toBe(false)
})
