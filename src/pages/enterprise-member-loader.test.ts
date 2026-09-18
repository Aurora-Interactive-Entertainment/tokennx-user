import { beforeEach, expect, it, vi } from 'vitest'
import { getEnterpriseDepartmentMembers, getEnterpriseMembers, type EnterpriseMember } from '@/api/enterprise-console'
import { loadEnterpriseMemberRows } from './enterprise-member-loader'

vi.mock('@/api/enterprise-console', () => ({ getEnterpriseDepartmentMembers: vi.fn(), getEnterpriseMembers: vi.fn() }))
beforeEach(() => vi.clearAllMocks())
const member = (id: string, departmentID = 'sales'): EnterpriseMember => ({ id, user_id: `user-${id}`, display_name: id, masked_contact: `${id}@example.com`, status: 'active', department: { id: departmentID, name: departmentID } } as EnterpriseMember)

it('部门搜索匹配邮箱并排除子部门人员，统计与直属列表一致', async () => {
  vi.mocked(getEnterpriseDepartmentMembers).mockResolvedValue({ items: [member('alice'), member('alice-child', 'child'), member('bob')], total: 3 } as never)
  const result = await loadEnterpriseMemberRows('ent', 'sales', 'alice@example.com', 'all', new AbortController().signal)
  expect(result.items.map((item) => item.id)).toEqual(['alice'])
  expect(result.total).toBe(1)
  expect(getEnterpriseDepartmentMembers).toHaveBeenCalledWith({ enterprise_id: 'ent' }, 'sales', expect.objectContaining({ page: 1, page_size: 100, status: undefined }))
  expect(vi.mocked(getEnterpriseDepartmentMembers).mock.calls[0][2]).not.toHaveProperty('name')
})

it('企业全量搜索保留服务端按用户公开 ID 返回的匹配结果', async () => {
  vi.mocked(getEnterpriseMembers).mockResolvedValue({ items: [member('alice')], total: 1 } as never)
  const result = await loadEnterpriseMemberRows('ent', 'company', 'user-alice', 'all', new AbortController().signal)
  expect(result.total).toBe(1)
  expect(getEnterpriseMembers).toHaveBeenCalledWith({ enterprise_id: 'ent' }, expect.objectContaining({ keyword: 'user-alice' }))
})

it('超过一万名成员仍按 total 读取后续页，不截断第 101 页', async () => {
  vi.mocked(getEnterpriseMembers).mockImplementation(async (_, options) => ({ items: Array.from({ length: options?.page === 101 ? 1 : 100 }, (_, index) => member(`${options?.page}-${index}`)), total: 10001 } as never))
  const result = await loadEnterpriseMemberRows('ent', 'company', '', 'all', new AbortController().signal)
  expect(result.items).toHaveLength(10001)
  expect(getEnterpriseMembers).toHaveBeenCalledTimes(101)
})
