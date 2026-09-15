import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import {
  enterpriseAuditCodeLabel,
  enterpriseRoleLabel,
  joinSourceLabel,
} from './enterprise-labels'

// 枚举翻译要跟着界面语言走，显式切语言，避免依赖运行环境的默认值。
const originalLanguage = i18n.language

describe('enterprise label helpers', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('zh-CN')
  })

  afterAll(async () => {
    await i18n.changeLanguage(originalLanguage)
  })

  it('translates join source codes shown in the account type column', () => {
    expect(joinSourceLabel('owner')).toBe('所有者')
    expect(joinSourceLabel('admin')).toBe('管理员')
    expect(joinSourceLabel('invitation')).toBe('邀请加入')
    expect(joinSourceLabel('certification')).toBe('认证加入')
  })

  it('matches join source codes regardless of case and surrounding whitespace', () => {
    expect(joinSourceLabel(' Owner ')).toBe('所有者')
    expect(joinSourceLabel('INVITATION')).toBe('邀请加入')
  })

  it('keeps unknown join source codes unchanged for server-side extensions', () => {
    expect(joinSourceLabel('partner_channel')).toBe('partner_channel')
  })

  it('translates built-in roles and keeps custom role names', () => {
    expect(enterpriseRoleLabel('owner')).toBe('所有者')
    expect(enterpriseRoleLabel('administrator')).toBe('管理员')
    expect(enterpriseRoleLabel('member')).toBe('成员')
    expect(
      enterpriseRoleLabel('custom-finance', [
        { code: 'custom-finance', name: '财务管理员', owner_role: false },
      ]),
    ).toBe('财务管理员')
  })

  it('translates audit resource codes and keeps unknown ones unchanged', () => {
    expect(enterpriseAuditCodeLabel('enterprise_department')).toBe('部门')
    expect(enterpriseAuditCodeLabel('enterprise_member')).toBe('成员')
    expect(enterpriseAuditCodeLabel('enterprise_unknown')).toBe('enterprise_unknown')
  })

  it('serves English labels after switching the interface language', async () => {
    await i18n.changeLanguage('en-US')
    expect(joinSourceLabel('owner')).toBe('Owner')
    expect(joinSourceLabel('invitation')).toBe('Invited')
    expect(enterpriseRoleLabel('owner')).toBe('Owner')
  })
})
