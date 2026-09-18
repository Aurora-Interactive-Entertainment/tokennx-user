import { getEnterpriseDepartmentMembers, getEnterpriseMembers, type EnterpriseMember } from '@/api/enterprise-console'

// 部门接口包含全部后代且姓名、邮箱条件不是 OR；读取完整结果后按直属部门和搜索框语义筛选。
export async function loadEnterpriseMemberRows(enterpriseID: string, departmentID: string, keyword: string, status: string, signal: AbortSignal): Promise<{ items: EnterpriseMember[]; total: number }> {
  const items: EnterpriseMember[] = []
  let page = 1
  while (!signal.aborted) {
    const options = { page, page_size: 100, status: status === 'all' ? undefined : status, signal }
    const result = departmentID === 'company'
      ? await getEnterpriseMembers({ enterprise_id: enterpriseID }, { ...options, keyword: keyword || undefined })
      : await getEnterpriseDepartmentMembers({ enterprise_id: enterpriseID }, departmentID, options)
    items.push(...result.items)
    if (!result.items.length || items.length >= result.total) break
    page += 1
  }
  const query = keyword.toLowerCase()
  const filtered = departmentID === 'company' ? items : items.filter((member) => member.department?.id === departmentID && (!query || `${member.display_name} ${member.masked_contact} ${member.user_id}`.toLowerCase().includes(query)))
  return { items: filtered, total: filtered.length }
}
