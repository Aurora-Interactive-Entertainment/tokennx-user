import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Modal from '@douyinfe/semi-ui/lib/es/modal'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { IconCopy, IconDeleteStroked, IconEditStroked, IconPlus, IconSearch } from '@douyinfe/semi-icons'
import { CompatInput as Input, CompatSelect as Select } from '@/components/semi-compat'
import { MoneyText } from '@/components/money'
import { AppPagination } from '@/components/app-pagination'
import {
  createEnterpriseInvitation,
  createEnterpriseTag,
  deleteEnterpriseTag,
  getEnterpriseInvitationUsages,
  getEnterpriseInvitations,
  getEnterpriseJoinRequests,
  getEnterpriseMember,
  getEnterpriseMembers,
  getEnterpriseTags,
  reviewEnterpriseJoinRequest,
  updateEnterpriseInvitation,
  updateEnterpriseMemberBudget,
  updateEnterpriseMemberRole,
  updateEnterpriseMemberStatus,
  updateEnterpriseMemberTag,
  updateEnterpriseTag,
  type EnterpriseContext,
  type EnterpriseInvitation,
  type EnterpriseInvitationUsage,
  type EnterpriseJoinRequest,
  type EnterpriseMember,
  type EnterpriseRoleOption,
  type EnterpriseTag,
  type EnterpriseTagInput,
} from '@/api/enterprise-console'
import {
  EnterpriseEmpty,
  EnterpriseError,
  EnterpriseExportButton,
  EnterpriseLoading,
  EnterprisePageShell,
  EnterpriseRefreshButton,
  exportEnterpriseCsv,
  formatEnterpriseNumber,
  formatEnterpriseRate,
  formatEnterpriseTime,
  invitationStatusLabel,
  joinRequestStatusLabel,
  memberStatusLabel,
  roleLabel,
  roleVisualClass,
  useEnterpriseErrorHandler,
} from './enterprise-console-shared'
import { formatLocalDateInput, localDateToTimestamp } from '@/utils/format'
import { resolveInvitationURL } from '@/utils/invitation'
import i18n from '@/i18n'

type MembersTab = 'members' | 'requests' | 'invitations'

const DEFAULT_MEMBER_PAGE_SIZE = 20
const DEFAULT_INVITATION_MAX_USES = 10
const EMPTY_ROLE_OPTIONS: EnterpriseRoleOption[] = []

type PaginationProps = {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

function MembersPagination({ page, pageSize, total, onChange, onPageSizeChange }: PaginationProps) {
  const { t } = useTranslation()
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  return <AppPagination ariaLabel={t('console.enterprise.members.pageSummary', { total: formatEnterpriseNumber(total), page, pageCount })} currentPage={page} pageSize={pageSize} total={total} summary={t('console.enterprise.members.pageSummary', { total: formatEnterpriseNumber(total), page, pageCount })} onPageChange={onChange} onPageSizeChange={onPageSizeChange} />
}

function statusClass(value: string): string {
  if (value === 'active' || value === 'approved' || value === 'success') return 'active'
  if (value === 'removed' || value === 'rejected' || value === 'disabled' || value === 'revoked' || value === 'expired' || value === 'exhausted' || value === 'failed') return 'failed'
  return 'pending'
}

function memberInitial(member: Pick<EnterpriseMember, 'display_name' | 'avatar_url'>): string {
  return member.avatar_url.trim() || member.display_name.trim().slice(0, 1).toUpperCase() || '?'
}

// 中文：兼容历史接口返回的 null 标签，页面统一按空数组渲染。
function memberTagRefs(member: Pick<EnterpriseMember, 'tags'> | null | undefined): EnterpriseMember['tags'] {
  return Array.isArray(member?.tags) ? member.tags : []
}

function normalizeMember(member: EnterpriseMember): EnterpriseMember {
  return { ...member, tags: memberTagRefs(member) }
}

function updateTagMemberCounts(tags: EnterpriseTag[], previousMember: EnterpriseMember | null, nextMember: EnterpriseMember): EnterpriseTag[] {
  const previousTagID = memberTagRefs(previousMember)[0]?.id ?? ''
  const nextTagID = memberTagRefs(nextMember)[0]?.id ?? ''
  if (previousTagID === nextTagID) return tags
  return tags.map((tag) => {
    if (tag.id === previousTagID) return { ...tag, member_count: Math.max(0, tag.member_count - 1) }
    if (tag.id === nextTagID) return { ...tag, member_count: tag.member_count + 1 }
    return tag
  })
}

function roleOptionsWithCurrent(options: EnterpriseRoleOption[], currentRole: string): EnterpriseRoleOption[] {
  if (!currentRole || options.some((option) => option.code === currentRole)) return options
  return [...options, { code: currentRole, name: currentRole, owner_role: currentRole === 'owner' }]
}

function assignableRoleOptions(options: EnterpriseRoleOption[]): EnterpriseRoleOption[] {
  return options.filter((option) => !option.owner_role)
}

function isOwnerRole(role: string, options: EnterpriseRoleOption[]): boolean {
  return options.find((option) => option.code === role)?.owner_role ?? role === 'owner'
}

function copyText(value: string): void {
  if (!value.trim()) {
    Toast.warning(i18n.t('console.enterprise.members.copyEmpty'))
    return
  }
  if (!navigator.clipboard) {
    Toast.error(i18n.t('console.enterprise.members.copyUnsupported'))
    return
  }
  void navigator.clipboard.writeText(value).then(() => Toast.success(i18n.t('console.enterprise.members.copied'))).catch(() => Toast.error(i18n.t('console.enterprise.members.copyFailed')))
}

function nullableNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : Number.NaN
}

function nullableMoney(value: string): string | null {
  const trimmed = value.trim()
  return trimmed || null
}

function dateToTimestamp(value: string): number | null {
  if (!value) return null
  return localDateToTimestamp(value, true) ?? null
}

function tagInputFromForm(form: TagFormState): EnterpriseTagInput | null {
  const name = form.name.trim()
  if (!name) {
    Toast.warning(i18n.t('console.enterprise.members.tagInputRequired'))
    return null
  }
  const numbers = [nullableNumber(form.concurrencyLimit), nullableNumber(form.rpmLimit), nullableNumber(form.tpmLimit)]
  if (numbers.some((value) => Number.isNaN(value))) {
    Toast.warning(i18n.t('console.enterprise.members.tagInputInvalid'))
    return null
  }
  return {
    name,
    description: form.description.trim(),
    daily_cost_limit_yuan: nullableMoney(form.dailyLimit),
    weekly_cost_limit_yuan: nullableMoney(form.weeklyLimit),
    monthly_cost_limit_yuan: nullableMoney(form.monthlyLimit),
    concurrency_limit: numbers[0],
    rpm_limit: numbers[1],
    tpm_limit: numbers[2],
    allowed_models: form.allowedModels.split(/[,，\n]/).map((value) => value.trim()).filter(Boolean),
  }
}

type TagFormState = {
  name: string
  description: string
  dailyLimit: string
  weeklyLimit: string
  monthlyLimit: string
  concurrencyLimit: string
  rpmLimit: string
  tpmLimit: string
  allowedModels: string
}

function emptyTagForm(): TagFormState {
  return { name: '', description: '', dailyLimit: '', weeklyLimit: '', monthlyLimit: '', concurrencyLimit: '', rpmLimit: '', tpmLimit: '', allowedModels: '' }
}

function tagFormFromTag(tag: EnterpriseTag): TagFormState {
  return {
    name: tag.name,
    description: tag.description,
    dailyLimit: tag.daily_cost_limit_yuan ?? '',
    weeklyLimit: tag.weekly_cost_limit_yuan ?? '',
    monthlyLimit: tag.monthly_cost_limit_yuan ?? '',
    concurrencyLimit: tag.concurrency_limit === null ? '' : String(tag.concurrency_limit),
    rpmLimit: tag.rpm_limit === null ? '' : String(tag.rpm_limit),
    tpmLimit: tag.tpm_limit === null ? '' : String(tag.tpm_limit),
    allowedModels: tag.allowed_models.join(', '),
  }
}

function TagEditorModal({ visible, tag, saving, onCancel, onSave }: { visible: boolean; tag: EnterpriseTag | null; saving: boolean; onCancel: () => void; onSave: (form: TagFormState) => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState<TagFormState>(emptyTagForm)
  useEffect(() => setForm(tag ? tagFormFromTag(tag) : emptyTagForm()), [tag, visible])
  const update = (patch: Partial<TagFormState>) => setForm((previous) => ({ ...previous, ...patch }))
  return <Modal title={tag ? t('console.enterprise.members.tagEdit') : t('console.enterprise.members.tagCreate')} visible={visible} onCancel={onCancel} onOk={() => onSave(form)} okText={tag ? t('console.enterprise.members.tagSave') : t('console.enterprise.members.tagCreateAction')} cancelText={t('console.enterprise.members.cancel')} okButtonProps={{ loading: saving, disabled: saving }}>
    <div className="enterprise-form-grid enterprise-tag-form">
      <label>{t('console.enterprise.members.tagName')}<Input value={form.name} onChange={(value) => update({ name: value })} maxLength={32} placeholder={t('console.enterprise.members.namePlaceholder')} /></label>
      <label>{t('console.enterprise.members.tagDescription')}<Input value={form.description} onChange={(value) => update({ description: value })} maxLength={120} placeholder={t('console.enterprise.members.descriptionPlaceholder')} /></label>
      <label>{t('console.enterprise.members.dailyLimit')}<Input value={form.dailyLimit} onChange={(value) => update({ dailyLimit: value })} inputMode="decimal" placeholder={t('console.enterprise.members.emptyPlaceholder')} /></label>
      <label>{t('console.enterprise.members.weeklyLimit')}<Input value={form.weeklyLimit} onChange={(value) => update({ weeklyLimit: value })} inputMode="decimal" placeholder={t('console.enterprise.members.emptyPlaceholder')} /></label>
      <label>{t('console.enterprise.members.monthlyLimit')}<Input value={form.monthlyLimit} onChange={(value) => update({ monthlyLimit: value })} inputMode="decimal" placeholder={t('console.enterprise.members.emptyPlaceholder')} /></label>
      <label>{t('console.enterprise.members.concurrencyLimit')}<Input value={form.concurrencyLimit} onChange={(value) => update({ concurrencyLimit: value })} inputMode="numeric" placeholder={t('console.enterprise.members.emptyPlaceholder')} /></label>
      <label>{t('console.enterprise.members.rpmLimit')}<Input value={form.rpmLimit} onChange={(value) => update({ rpmLimit: value })} inputMode="numeric" placeholder={t('console.enterprise.members.emptyPlaceholder')} /></label>
      <label>{t('console.enterprise.members.tpmLimit')}<Input value={form.tpmLimit} onChange={(value) => update({ tpmLimit: value })} inputMode="numeric" placeholder={t('console.enterprise.members.emptyPlaceholder')} /></label>
      <label className="enterprise-form-field-wide">{t('console.enterprise.members.allowedModels')}<Input value={form.allowedModels} onChange={(value) => update({ allowedModels: value })} placeholder={t('console.enterprise.members.modelsPlaceholder')} /></label>
    </div>
  </Modal>
}

function TagManagerModal({ visible, tags, canManage, onCancel, onCreate, onEdit, onDelete, loading }: { visible: boolean; tags: EnterpriseTag[]; canManage: boolean; onCancel: () => void; onCreate: () => void; onEdit: (tag: EnterpriseTag) => void; onDelete: (tag: EnterpriseTag) => void; loading: boolean }) {
  const { t } = useTranslation()
  return <Modal title={t('console.enterprise.members.tagManager')} visible={visible} onCancel={onCancel} footer={null} width="760px"><div className="enterprise-modal-heading"><p>{t('console.enterprise.members.tagManagerHint')}</p>{canManage ? <Button theme="solid" type="primary" icon={<IconPlus />} onClick={onCreate}>{t('console.enterprise.members.newTag')}</Button> : null}</div>{loading ? <EnterpriseLoading label={t('console.enterprise.members.loadingTags')} /> : tags.length === 0 ? <EnterpriseEmpty title={t('console.enterprise.members.noTag')} description={t('console.enterprise.members.noTagHint')} action={canManage ? <Button theme="solid" type="primary" icon={<IconPlus />} onClick={onCreate}>{t('console.enterprise.members.newTag')}</Button> : undefined} /> : <div className="source-table-scroll"><table className="enterprise-tags-table"><thead><tr><th>{t('console.enterprise.members.tag')}</th><th>{t('console.enterprise.members.quotaPolicy')}</th><th>{t('console.enterprise.members.rateLimit')}</th><th>{t('console.enterprise.members.memberCount')}</th><th>{t('console.enterprise.members.operation')}</th></tr></thead><tbody>{tags.map((tag) => <tr key={tag.id}><td><strong>{tag.name}</strong><small>{tag.description || t('console.enterprise.members.noDescription')}</small></td><td>{tag.monthly_cost_limit_yuan ? <>{t('console.enterprise.usage.monthShort')} <MoneyText value={tag.monthly_cost_limit_yuan} /></> : t('console.enterprise.members.noQuota')}</td><td>{tag.rpm_limit === null ? t('console.enterprise.members.noRateLimit') : `RPM ${formatEnterpriseNumber(tag.rpm_limit)}`}</td><td>{formatEnterpriseNumber(tag.member_count)}</td><td><div className="enterprise-row-actions"><Button theme="borderless" icon={<IconEditStroked />} aria-label={`${t('console.enterprise.members.editTag')} ${tag.name}`} title={`${t('console.enterprise.members.editTag')} ${tag.name}`} disabled={!canManage} onClick={() => onEdit(tag)} /><Button theme="borderless" type="danger" icon={<IconDeleteStroked />} aria-label={`${t('console.enterprise.members.deleteTag')} ${tag.name}`} title={`${t('console.enterprise.members.deleteTag')} ${tag.name}`} disabled={!canManage || tag.member_count > 0} onClick={() => onDelete(tag)} /></div></td></tr>)}</tbody></table></div>}</Modal>
}

function MemberDetailModal({ member, tags, roleOptions, context, visible, loading, onClose, onUpdated }: { member: EnterpriseMember | null; tags: EnterpriseTag[]; roleOptions: EnterpriseRoleOption[]; context: EnterpriseContext; visible: boolean; loading: boolean; onClose: () => void; onUpdated: (member: EnterpriseMember) => void }) {
  const { t } = useTranslation()
  const handleError = useEnterpriseErrorHandler()
  const [role, setRole] = useState('')
  const [tagID, setTagID] = useState('')
  const [costLimit, setCostLimit] = useState('')
  const [periodType, setPeriodType] = useState('monthly')
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    if (!member) return
    setRole(member.role)
    setTagID(memberTagRefs(member)[0]?.id ?? '')
    setCostLimit(member.budget?.cost_limit_yuan ?? '')
    setPeriodType(member.budget?.period_type || 'monthly')
    setError('')
  }, [member])

  useEffect(() => {
    if (!visible || loading) return
    // 中文：Semi Select 的弹层通过 Portal 渲染，监听 Portal 挂载后再补齐控件名称。
    const applyAccessibleLabels = () => {
      const root = document.querySelector<HTMLElement>('.enterprise-member-detail')
      if (!root) return
      root.querySelectorAll<HTMLElement>('[role="combobox"]').forEach((control) => {
        const label = control.closest('label')
        const labelText = label ? Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE)?.textContent?.trim() : ''
        if (labelText && control.getAttribute('aria-label') !== labelText) control.setAttribute('aria-label', labelText)
      })
    }
    applyAccessibleLabels()
    const observer = new MutationObserver(applyAccessibleLabels)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [loading, member?.id, visible])

  if (loading) return <Modal title={t('console.enterprise.members.memberDetail')} visible={visible} onCancel={onClose} footer={null} width="720px"><EnterpriseLoading label={t('console.enterprise.members.loadingDetail')} /></Modal>
  if (!member) return null
  const memberSnapshot = member
  const availableRoleOptions = roleOptionsWithCurrent(roleOptions, memberSnapshot.role)
  const ownerRole = isOwnerRole(memberSnapshot.role, availableRoleOptions)
  const canManageRoles = context.capabilities.can_manage_roles && !ownerRole
  const canManageMembers = context.capabilities.can_manage_members && !ownerRole
  const canManageTags = context.capabilities.can_manage_tags
  const canManageUsage = context.capabilities.can_manage_usage

  async function saveRole(): Promise<void> {
    if (!canManageRoles || role === memberSnapshot.role || saving) return
    setSaving('role')
    setError('')
    try {
      const updated = await updateEnterpriseMemberRole({ enterprise_id: context.id }, memberSnapshot.id, { role, expected_version: memberSnapshot.version })
      onUpdated(updated)
      Toast.success(t('console.enterprise.members.memberUpdated'))
    } catch (reason: unknown) {
      const result = handleError(reason)
      if (result) setError(result.message)
    } finally {
      setSaving('')
    }
  }

  async function saveTag(): Promise<void> {
    if (!canManageTags || saving) return
    setSaving('tag')
    setError('')
    try {
      const updated = await updateEnterpriseMemberTag({ enterprise_id: context.id }, memberSnapshot.id, { tag_id: tagID, expected_version: memberSnapshot.version })
      onUpdated(updated)
      Toast.success(t('console.enterprise.members.tagUpdated'))
    } catch (reason: unknown) {
      const result = handleError(reason)
      if (result) setError(result.message)
    } finally {
      setSaving('')
    }
  }

  async function saveBudget(): Promise<void> {
    if (!canManageUsage || saving) return
    const trimmed = costLimit.trim()
    if (trimmed && !/^\d{1,12}(?:\.\d{1,9})?$/.test(trimmed)) {
      setError(t('console.enterprise.members.budgetInvalid'))
      return
    }
    setSaving('budget')
    setError('')
    try {
      const updated = await updateEnterpriseMemberBudget({ enterprise_id: context.id }, memberSnapshot.id, { cost_limit_yuan: trimmed || null, period_type: periodType, expected_version: memberSnapshot.budget?.version ?? 0 })
      onUpdated(updated)
      Toast.success(t('console.enterprise.members.budgetUpdated'))
    } catch (reason: unknown) {
      const result = handleError(reason)
      if (result) setError(result.message)
    } finally {
      setSaving('')
    }
  }

  async function updateStatus(status: 'active' | 'removed'): Promise<void> {
    if (!canManageMembers || saving) return
    setSaving('status')
    setError('')
    try {
      const updated = await updateEnterpriseMemberStatus({ enterprise_id: context.id }, memberSnapshot.id, { status, expected_version: memberSnapshot.version })
      onUpdated(updated)
      setConfirmRemove(false)
      Toast.success(status === 'removed' ? t('console.enterprise.members.removed') : t('console.enterprise.members.restored'))
    } catch (reason: unknown) {
      const result = handleError(reason)
      if (result) setError(result.message)
    } finally {
      setSaving('')
    }
  }

  // 中文：角色变更是同步表单动作，使用原生选择器确保键盘操作能立即回写受控值。
  return <>
    <Modal title={t('console.enterprise.members.memberDetail')} visible={visible} onCancel={onClose} footer={null} width="720px"><div className="enterprise-member-detail"><header className="enterprise-detail-identity"><span className="enterprise-member-avatar enterprise-member-avatar-large">{memberInitial(member)}</span><div><h2>{member.display_name || t('console.enterprise.members.unnamedMember')}</h2><p>{member.masked_contact || t('console.enterprise.members.noContact')} · {t('console.enterprise.members.joinedAt')} {formatEnterpriseTime(member.joined_at)}</p></div><span className={`source-status-badge ${statusClass(member.status)}`}>{memberStatusLabel(member.status)}</span></header><dl className="enterprise-detail-facts"><div><dt>{t('console.enterprise.members.memberId')}</dt><dd><code>{member.id}</code></dd></div><div><dt>{t('console.enterprise.members.joinSource')}</dt><dd>{member.join_source || t('console.enterprise.members.enterpriseInvite')}</dd></div><div><dt>{t('console.enterprise.members.currentRole')}</dt><dd>{roleLabel(member.role, availableRoleOptions)}</dd></div><div><dt>{t('console.enterprise.members.version')}</dt><dd>{member.version}</dd></div></dl>{error ? <BannerInlineError message={error} /> : null}<section className="enterprise-detail-section"><div className="enterprise-section-heading"><h3>{t('console.enterprise.members.roleAccess')}</h3><span>{t('console.enterprise.members.auditHint')}</span></div><div className="enterprise-detail-control"><label>{t('console.enterprise.members.enterpriseRole')}<Select value={role} onChange={(value) => setRole(String(value))} onSelect={(value) => setRole(String(value))} disabled={!canManageRoles} aria-label={t('console.enterprise.members.enterpriseRole')} block>{availableRoleOptions.map((option) => <Select.Option value={option.code} key={option.code}>{option.name}</Select.Option>)}</Select></label><Button theme="outline" loading={saving === 'role'} disabled={!canManageRoles || role === member.role || Boolean(saving)} onClick={() => { void saveRole() }}>{t('console.enterprise.members.saveRole')}</Button></div><div className="enterprise-detail-control"><label>{t('console.enterprise.members.accessStatus')}<Select value={member.status} disabled block><Select.Option value="active">{t('console.enterprise.memberActive')}</Select.Option><Select.Option value="suspended">{t('console.enterprise.memberSuspended')}</Select.Option><Select.Option value="removed">{t('console.enterprise.memberRemoved')}</Select.Option></Select></label>{member.status === 'removed' ? <Button theme="outline" loading={saving === 'status'} disabled={!canManageMembers || Boolean(saving)} onClick={() => { void updateStatus('active') }}>{t('console.enterprise.members.restoreAccess')}</Button> : <Button theme="outline" type="danger" disabled={!canManageMembers || Boolean(saving)} onClick={() => setConfirmRemove(true)}>{t('console.enterprise.members.removeMember')}</Button>}</div></section><section className="enterprise-detail-section"><div className="enterprise-section-heading"><h3>{t('console.enterprise.members.memberTags')}</h3><span>{t('console.enterprise.members.tagPolicyHint')}</span></div><div className="enterprise-detail-control"><label>{t('console.enterprise.members.bindTag')}<Select value={tagID} onChange={(value) => setTagID(String(value))} disabled={!canManageTags} block><Select.Option value="">{t('console.enterprise.members.noTagBind')}</Select.Option>{tags.map((tag) => <Select.Option value={tag.id} key={tag.id}>{tag.name}</Select.Option>)}</Select></label><Button theme="outline" loading={saving === 'tag'} disabled={!canManageTags || Boolean(saving)} onClick={() => { void saveTag() }}>{t('console.enterprise.members.saveMemberTag')}</Button></div><div className="enterprise-tag-pills">{member.tags.length ? member.tags.map((tag) => <span key={tag.id}>{tag.name}</span>) : <small>{t('console.enterprise.members.currentNoTag')}</small>}</div></section><section className="enterprise-detail-section"><div className="enterprise-section-heading"><h3>{t('console.enterprise.members.budget')}</h3><span>{t('console.enterprise.members.independentBudget')}</span></div><div className="enterprise-detail-control enterprise-budget-control"><label>{t('console.enterprise.members.costLimit')}<Input value={costLimit} onChange={setCostLimit} disabled={!canManageUsage} inputMode="decimal" placeholder={t('console.enterprise.members.costLimitPlaceholder')} /></label><label>{t('console.enterprise.members.periodType')}<Select value={periodType} onChange={(value) => setPeriodType(String(value))} disabled={!canManageUsage} block><Select.Option value="monthly">{t('console.enterprise.members.monthly')}</Select.Option><Select.Option value="billing_cycle">{t('console.enterprise.members.billingCycle')}</Select.Option></Select></label><Button theme="outline" loading={saving === 'budget'} disabled={!canManageUsage || Boolean(saving)} onClick={() => { void saveBudget() }}>{t('console.enterprise.members.saveBudget')}</Button></div><div className="enterprise-budget-summary"><span>{t('console.enterprise.members.used')} <MoneyText value={member.budget?.used_cost_yuan} /></span><span>{t('console.enterprise.members.limit')} {member.budget?.cost_limit_yuan ? <MoneyText value={member.budget.cost_limit_yuan} /> : t('console.enterprise.members.notSet')}</span><span>{t('console.enterprise.members.usageRate')} {formatEnterpriseRate(member.budget?.usage_percent)}</span></div></section></div></Modal><Modal title={t('console.enterprise.members.confirmRemove')} visible={confirmRemove} onCancel={() => setConfirmRemove(false)} onOk={() => { void updateStatus('removed') }} okText={t('console.enterprise.members.confirmRemoveAction')} cancelText={t('console.enterprise.members.cancel')} okButtonProps={{ loading: saving === 'status', disabled: Boolean(saving) }}><p>{t('console.enterprise.members.confirmRemoveText')}</p></Modal>
  </>
}

function BannerInlineError({ message }: { message: string }) {
  return <div className="enterprise-inline-error" role="alert">{message}</div>
}

function InviteModal({ visible, saving, roleOptions, onCancel, onCreate, created }: { visible: boolean; saving: boolean; roleOptions: EnterpriseRoleOption[]; onCancel: () => void; onCreate: (input: { role: string; max_uses: number; expires_at: number | null }) => void; created: EnterpriseInvitation | null }) {
  const { t } = useTranslation()
  const [role, setRole] = useState('')
  const [maxUses, setMaxUses] = useState(String(DEFAULT_INVITATION_MAX_USES))
  const [expiresAt, setExpiresAt] = useState('')
  useEffect(() => {
    if (!visible) return
    setRole(assignableRoleOptions(roleOptions)[0]?.code ?? '')
    setMaxUses(String(DEFAULT_INVITATION_MAX_USES))
    setExpiresAt('')
  }, [roleOptions, visible])
  const createdURL = created ? resolveInvitationURL(created.invite_url, window.location.origin) : ''
  if (created) return <Modal title={t('console.enterprise.members.inviteCreated')} visible={visible} onCancel={onCancel} footer={null}><div className="enterprise-invite-created"><p>{t('console.enterprise.members.inviteCreatedHint')}</p><div className="enterprise-copy-row"><input className="source-input" readOnly value={createdURL} aria-label={t('console.enterprise.members.inviteLink')} /><Button theme="solid" type="primary" icon={<IconCopy />} disabled={!createdURL} onClick={() => copyText(createdURL)}>{t('console.enterprise.members.copyLink')}</Button></div><dl><div><dt>{t('console.enterprise.members.role')}</dt><dd>{created.role_name || roleLabel(created.role, roleOptions)}</dd></div><div><dt>{t('console.enterprise.members.maxUses')}</dt><dd>{created.max_uses}</dd></div><div><dt>{t('console.enterprise.members.validUntil')}</dt><dd>{created.expires_at ? formatEnterpriseTime(created.expires_at) : t('console.join.forever')}</dd></div></dl><Button theme="outline" onClick={onCancel}>{t('console.enterprise.members.complete')}</Button></div></Modal>
  return <Modal title={t('console.enterprise.members.createInvite')} visible={visible} onCancel={onCancel} onOk={() => { const parsed = Number(maxUses); if (!role) { Toast.warning(t('console.enterprise.members.roleRequired')); return } if (!Number.isInteger(parsed) || parsed <= 0) { Toast.warning(t('console.enterprise.members.usesPositive')); return } onCreate({ role, max_uses: parsed, expires_at: dateToTimestamp(expiresAt) }) }} okText={t('console.enterprise.members.createLink')} cancelText={t('console.enterprise.members.cancel')} okButtonProps={{ loading: saving, disabled: saving || !role }}><div className="enterprise-form-grid enterprise-invitation-form"><label>{t('console.enterprise.members.role')}<Select value={role} onChange={(value) => setRole(String(value))} block disabled={!assignableRoleOptions(roleOptions).length}>{assignableRoleOptions(roleOptions).map((option) => <Select.Option value={option.code} key={option.code}>{option.name}</Select.Option>)}</Select></label><label>{t('console.enterprise.members.maxUses')}<Input value={maxUses} onChange={(value) => setMaxUses(value.replace(/\D/g, ''))} inputMode="numeric" placeholder={t('console.enterprise.members.maxUsesPlaceholder')} /></label><label>{t('console.enterprise.members.expiresOptional')}<input className="source-input" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label><p className="enterprise-form-hint">{t('console.enterprise.members.inviteHint')}</p></div></Modal>
}

function JoinRequestReviewModal({ request, visible, saving, roleOptions, onCancel, onReview }: { request: EnterpriseJoinRequest | null; visible: boolean; saving: boolean; roleOptions: EnterpriseRoleOption[]; onCancel: () => void; onReview: (input: { action: string; role?: string; rejection_reason?: string }) => void }) {
  const { t } = useTranslation()
  const [role, setRole] = useState('')
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (!request) return
    const options = assignableRoleOptions(roleOptions)
    setRole(options.some((option) => option.code === request.requested_role) ? request.requested_role : options[0]?.code ?? '')
    setReason('')
  }, [request, roleOptions])
  if (!request) return null
  return <Modal title={t('console.enterprise.members.reviewJoin')} visible={visible} onCancel={onCancel} footer={null}><div className="enterprise-review-modal"><div className="enterprise-review-identity"><span className="enterprise-member-avatar">{request.applicant_name.slice(0, 1)}</span><div><strong>{request.applicant_name}</strong><span>{request.applicant_contact || t('console.enterprise.members.noContact')} · {formatEnterpriseTime(request.created_at)}</span></div></div><p className="enterprise-review-message">{request.request_message || t('console.enterprise.members.noApplyMessage')}</p><label>{t('console.enterprise.members.approveRole')}<Select value={role} onChange={(value) => setRole(String(value))} block disabled={!role}>{assignableRoleOptions(roleOptions).map((option) => <Select.Option value={option.code} key={option.code}>{option.name}</Select.Option>)}</Select></label><label>{t('console.enterprise.members.rejectReason')}<Input value={reason} onChange={setReason} placeholder={t('console.enterprise.members.reasonPlaceholder')} maxLength={200} /></label><div className="enterprise-modal-actions"><Button theme="outline" type="danger" disabled={saving} onClick={() => onReview({ action: 'reject', rejection_reason: reason.trim() })}>{t('console.enterprise.members.rejectApply')}</Button><Button theme="solid" type="primary" loading={saving} disabled={saving || !role} onClick={() => onReview({ action: 'approve', role })}>{t('console.enterprise.members.approveJoin')}</Button></div></div></Modal>
}

function InvitationUsagesModal({ invitation, usages, loading, roleOptions, onClose }: { invitation: EnterpriseInvitation | null; usages: EnterpriseInvitationUsage[]; loading: boolean; roleOptions: EnterpriseRoleOption[]; onClose: () => void }) {
  const { t } = useTranslation()
  return <Modal title={invitation ? `${t('console.enterprise.members.invitationUsage')} · ${invitation.role_name || roleLabel(invitation.role, roleOptions)}` : t('console.enterprise.members.invitationUsage')} visible={Boolean(invitation)} onCancel={onClose} footer={null} width="620px">{loading ? <EnterpriseLoading label={t('console.enterprise.members.loadingInvitationUsage')} /> : usages.length === 0 ? <EnterpriseEmpty title={t('console.enterprise.members.noInvitationUsage')} description={t('console.enterprise.members.noInvitationUsageHint')} /> : <div className="source-table-scroll"><table className="enterprise-invitation-usages"><thead><tr><th>{t('console.enterprise.members.member')}</th><th>{t('console.enterprise.members.joinedTime')}</th></tr></thead><tbody>{usages.map((usage) => <tr key={`${usage.user_id}-${usage.joined_at}`}><td><strong>{usage.user_name}</strong><small>{usage.member_id || usage.user_id}</small></td><td>{formatEnterpriseTime(usage.joined_at)}</td></tr>)}</tbody></table></div>}</Modal>
}

function MembersContent({ context }: { context: EnterpriseContext }) {
  const { t } = useTranslation()
  const handleError = useEnterpriseErrorHandler()
  const requestContext = { enterprise_id: context.id }
  const [tab, setTab] = useState<MembersTab>('members')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_MEMBER_PAGE_SIZE)
  const [keyword, setKeyword] = useState('')
  const [role, setRole] = useState('all')
  const [status, setStatus] = useState('all')
  const [members, setMembers] = useState<{ items: EnterpriseMember[]; total: number; page: number; page_size: number } | null>(null)
  const [requests, setRequests] = useState<{ items: EnterpriseJoinRequest[]; total: number; page: number; page_size: number } | null>(null)
  const [invitations, setInvitations] = useState<{ items: EnterpriseInvitation[]; total: number; page: number; page_size: number } | null>(null)
  const [tags, setTags] = useState<EnterpriseTag[]>([])
  const [loading, setLoading] = useState(true)
  const [tagsLoading, setTagsLoading] = useState(false)
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [selectedMember, setSelectedMember] = useState<EnterpriseMember | null>(null)
  const [memberDetailLoading, setMemberDetailLoading] = useState(false)
  const [memberDetailError, setMemberDetailError] = useState('')
  const [tagManagerVisible, setTagManagerVisible] = useState(false)
  const [tagEditor, setTagEditor] = useState<EnterpriseTag | null | undefined>(undefined)
  const [tagSaving, setTagSaving] = useState(false)
  const [selectedReviewRequest, setSelectedReviewRequest] = useState<EnterpriseJoinRequest | null>(null)
  const [reviewSaving, setReviewSaving] = useState(false)
  const [inviteVisible, setInviteVisible] = useState(false)
  const [inviteSaving, setInviteSaving] = useState(false)
  const [createdInvitation, setCreatedInvitation] = useState<EnterpriseInvitation | null>(null)
  const [usageInvitation, setUsageInvitation] = useState<EnterpriseInvitation | null>(null)
  const [invitationUsages, setInvitationUsages] = useState<EnterpriseInvitationUsage[]>([])
  const [invitationUsageLoading, setInvitationUsageLoading] = useState(false)
  const roleOptions = context.role_options ?? EMPTY_ROLE_OPTIONS

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setTagsLoading(true)
    getEnterpriseTags(requestContext, { signal: controller.signal }).then((result) => {
      if (active) setTags(result)
    }).catch((reason: unknown) => {
      if (!active || controller.signal.aborted) return
      const result = handleError(reason)
      if (result) Toast.error(result.message)
    }).finally(() => {
      if (active) setTagsLoading(false)
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [context.id, handleError, reloadToken])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    // 中文：按当前标签分别等待对应分页类型，避免联合响应误写入其他列表状态。
    async function loadTabData(): Promise<void> {
      try {
        if (tab === 'members') {
          const result = await getEnterpriseMembers(requestContext, { page, page_size: pageSize, keyword, role, status, signal: controller.signal })
          if (active) setMembers({ ...result, items: result.items.map(normalizeMember) })
        } else if (tab === 'requests') {
          const result = await getEnterpriseJoinRequests(requestContext, { page, page_size: pageSize, status: 'pending', signal: controller.signal })
          if (active) setRequests(result)
        } else {
          const result = await getEnterpriseInvitations(requestContext, { page, page_size: pageSize, signal: controller.signal })
          if (active) setInvitations(result)
        }
      } catch (reason: unknown) {
        if (!active || controller.signal.aborted) return
        const result = handleError(reason)
        if (result) setError(result)
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadTabData()
    return () => {
      active = false
      controller.abort()
    }
  }, [context.id, handleError, keyword, page, pageSize, reloadToken, role, status, tab])

  function refresh(): void {
    setReloadToken((value) => value + 1)
  }

  function changeTab(nextTab: MembersTab): void {
    setTab(nextTab)
    setPage(1)
    setError(null)
  }

  async function openMember(member: EnterpriseMember): Promise<void> {
    setSelectedMember(normalizeMember(member))
    setMemberDetailError('')
    setMemberDetailLoading(true)
    try {
      setSelectedMember(normalizeMember(await getEnterpriseMember(requestContext, member.id)))
    } catch (reason: unknown) {
      const result = handleError(reason)
      if (result) setMemberDetailError(result.message)
    } finally {
      setMemberDetailLoading(false)
    }
  }

  function updateMember(member: EnterpriseMember): void {
    const normalized = normalizeMember(member)
    setTags((previous) => updateTagMemberCounts(previous, selectedMember, normalized))
    setSelectedMember(normalized)
    setMembers((previous) => previous ? { ...previous, items: previous.items.map((item) => item.id === normalized.id ? normalized : item) } : previous)
  }

  async function reviewRequest(input: { action: string; role?: string; rejection_reason?: string }): Promise<void> {
    if (!selectedReviewRequest) return
    if (input.action === 'reject' && !input.rejection_reason) {
      Toast.warning(t('console.enterprise.members.rejectReasonRequired'))
      return
    }
    setReviewSaving(true)
    try {
      await reviewEnterpriseJoinRequest(requestContext, selectedReviewRequest.id, input)
      setSelectedReviewRequest(null)
      setRequests((previous) => previous ? { ...previous, items: previous.items.filter((item) => item.id !== selectedReviewRequest.id), total: Math.max(0, previous.total - 1) } : previous)
      Toast.success(input.action === 'approve' ? t('console.enterprise.members.approved') : t('console.enterprise.members.rejected'))
      refresh()
    } catch (reason: unknown) {
      const result = handleError(reason)
      if (result) Toast.error(result.message)
    } finally {
      setReviewSaving(false)
    }
  }

  async function createInvitation(input: { role: string; max_uses: number; expires_at: number | null }): Promise<void> {
    setInviteSaving(true)
    try {
      const created = await createEnterpriseInvitation(requestContext, input)
      setCreatedInvitation(created)
      setInvitations((previous) => {
        if (!previous) return previous
        // 中文：服务端重试可能返回已存在的邀请，按 ID 幂等更新避免重复行和错误总数。
        const existed = previous.items.some((item) => item.id === created.id)
        return { ...previous, items: [created, ...previous.items.filter((item) => item.id !== created.id)], total: previous.total + (existed ? 0 : 1) }
      })
      Toast.success(t('console.enterprise.members.inviteCreated'))
    } catch (reason: unknown) {
      const result = handleError(reason)
      if (result) Toast.error(result.message)
    } finally {
      setInviteSaving(false)
    }
  }

  function copyInvitation(invitation: EnterpriseInvitation): void {
    copyText(resolveInvitationURL(invitation.invite_url, window.location.origin))
  }

  async function disableInvitation(invitation: EnterpriseInvitation): Promise<void> {
    if (!window.confirm(t('console.enterprise.members.revokeConfirm', { role: invitation.role_name || roleLabel(invitation.role, roleOptions) }))) return
    try {
      const updated = await updateEnterpriseInvitation(requestContext, invitation.id, { action: 'revoke', expected_version: invitation.version })
      setInvitations((previous) => previous ? { ...previous, items: previous.items.map((item) => item.id === updated.id ? { ...item, ...updated, role: updated.role || item.role, role_name: updated.role_name || item.role_name, inviter_name: updated.inviter_name || item.inviter_name, expires_at: updated.expires_at ?? item.expires_at } : item) } : previous)
      Toast.success(t('console.enterprise.members.inviteRevoked'))
    } catch (reason: unknown) {
      const result = handleError(reason)
      if (result) Toast.error(result.message)
    }
  }

  async function regenerateInvitation(invitation: EnterpriseInvitation): Promise<void> {
    if (!window.confirm(t('console.enterprise.members.regenerateConfirm', { role: invitation.role_name || roleLabel(invitation.role, roleOptions) }))) return
    try {
      const updated = await updateEnterpriseInvitation(requestContext, invitation.id, { action: 'regenerate', expected_version: invitation.version })
      const nextInvitation = { ...updated, role: updated.role || invitation.role, role_name: updated.role_name || invitation.role_name, inviter_name: updated.inviter_name || invitation.inviter_name, expires_at: updated.expires_at ?? invitation.expires_at }
      setCreatedInvitation(nextInvitation)
      setInviteVisible(true)
      setInvitations((previous) => previous ? { ...previous, items: [nextInvitation, ...previous.items.map((item) => item.id === invitation.id ? { ...item, status: 'revoked', version: item.version + 1 } : item)], total: previous.total + 1 } : previous)
      Toast.success(t('console.enterprise.members.regenerated'))
    } catch (reason: unknown) {
      const result = handleError(reason)
      if (result) Toast.error(result.message)
    }
  }

  async function openInvitationUsages(invitation: EnterpriseInvitation): Promise<void> {
    setUsageInvitation(invitation)
    setInvitationUsages([])
    setInvitationUsageLoading(true)
    try {
      setInvitationUsages(await getEnterpriseInvitationUsages(requestContext, invitation.id))
    } catch (reason: unknown) {
      const result = handleError(reason)
      if (result) Toast.error(result.message)
    } finally {
      setInvitationUsageLoading(false)
    }
  }

  async function saveTag(form: TagFormState): Promise<void> {
    const input = tagInputFromForm(form)
    if (!input) return
    setTagSaving(true)
    try {
      if (tagEditor) {
        const updated = await updateEnterpriseTag(requestContext, tagEditor.id, { ...input, expected_version: tagEditor.version })
        setTags((previous) => previous.map((tag) => tag.id === updated.id ? updated : tag))
        Toast.success(t('console.enterprise.members.tagSaved'))
      } else {
        const created = await createEnterpriseTag(requestContext, input)
        setTags((previous) => [created, ...previous])
        Toast.success(t('console.enterprise.members.tagCreated'))
      }
      setTagEditor(undefined)
    } catch (reason: unknown) {
      const result = handleError(reason)
      if (result) Toast.error(result.message)
    } finally {
      setTagSaving(false)
    }
  }

  async function removeTag(tag: EnterpriseTag): Promise<void> {
    if (!window.confirm(t('console.enterprise.members.deleteTagConfirm', { name: tag.name }))) return
    try {
      await deleteEnterpriseTag(requestContext, tag.id, tag.version)
      setTags((previous) => previous.filter((item) => item.id !== tag.id))
      Toast.success(t('console.enterprise.members.tagDeleted'))
    } catch (reason: unknown) {
      const result = handleError(reason)
      if (result) Toast.error(result.message)
    }
  }

  function exportMembers(): void {
    const rows = (members?.items ?? []).map((member) => [member.display_name, member.masked_contact, roleLabel(member.role, roleOptions), memberStatusLabel(member.status), memberTagRefs(member).map((tag) => tag.name).join('、'), member.budget?.cost_limit_yuan ?? t('console.enterprise.members.noBudget'), formatEnterpriseTime(member.joined_at)])
    exportEnterpriseCsv(`enterprise-members-${formatLocalDateInput(new Date())}.csv`, [t('console.enterprise.members.member'), t('console.enterprise.members.contact'), t('console.enterprise.members.role'), t('console.enterprise.members.status'), t('console.enterprise.members.tagsLabel'), t('console.enterprise.members.costQuota'), t('console.enterprise.members.joinedTime')], rows)
    Toast.success(t('console.enterprise.members.exportSuccess'))
  }

  const pendingCount = requests?.total ?? 0
  const content = tab === 'members' ? <MembersTable data={members} roleOptions={roleOptions} loading={loading} error={error} canManage={context.capabilities.can_manage_members} onRetry={refresh} onOpen={openMember} /> : tab === 'requests' ? <JoinRequestsTable data={requests} roleOptions={roleOptions} loading={loading} error={error} canManage={context.capabilities.can_manage_members} onRetry={refresh} onReview={setSelectedReviewRequest} /> : <InvitationsTable data={invitations} roleOptions={roleOptions} loading={loading} error={error} canManage={context.capabilities.can_manage_members} onRetry={refresh} onCopy={copyInvitation} onDisable={disableInvitation} onRegenerate={regenerateInvitation} onUsages={openInvitationUsages} />

  return <>
    <div className="enterprise-members-toolbar"><div className="enterprise-tabs" role="tablist" aria-label={t('console.enterprise.members.title')}><button className={tab === 'members' ? 'active' : ''} type="button" role="tab" aria-selected={tab === 'members'} onClick={() => changeTab('members')}>{t('console.enterprise.members.members')}</button><button className={tab === 'requests' ? 'active' : ''} type="button" role="tab" aria-selected={tab === 'requests'} onClick={() => changeTab('requests')}>{t('console.enterprise.members.requests')}{pendingCount > 0 ? <span>{pendingCount}</span> : null}</button><button className={tab === 'invitations' ? 'active' : ''} type="button" role="tab" aria-selected={tab === 'invitations'} onClick={() => changeTab('invitations')}>{t('console.enterprise.members.invitations')}</button></div><div className="enterprise-page-actions"><EnterpriseRefreshButton onClick={refresh} label={t('console.enterprise.members.refresh')} />{context.capabilities.can_manage_tags ? <Button theme="outline" onClick={() => setTagManagerVisible(true)}>{t('console.enterprise.members.tags')}</Button> : null}{tab === 'members' ? <EnterpriseExportButton onClick={exportMembers} disabled={!members?.items.length} label={t('console.enterprise.members.export')} /> : null}{tab === 'invitations' && context.capabilities.can_manage_members ? <Button aria-label={t('console.enterprise.members.createInvite')} theme="solid" type="primary" icon={<IconPlus />} onClick={() => { setCreatedInvitation(null); setInviteVisible(true) }}>{t('console.enterprise.members.createInvite')}</Button> : null}</div></div>
    {tab === 'members' ? <div className="enterprise-filter-toolbar"><Input className="app-standard-input enterprise-search-input" size="large" prefix={<IconSearch aria-hidden="true" />} value={keyword} onChange={(value) => { setKeyword(value); setPage(1) }} placeholder={t('console.enterprise.members.searchPlaceholder')} aria-label={t('console.enterprise.members.searchPlaceholder')} showClear /><label className="enterprise-filter-field"><span id="enterprise-member-role-filter-label">{t('console.enterprise.members.roleFilter')}</span><Select value={role} onChange={(value) => { setRole(String(value)); setPage(1) }} onSelect={(value) => { setRole(String(value)); setPage(1) }} aria-labelledby="enterprise-member-role-filter-label" block><Select.Option value="all">{t('console.enterprise.members.allRoles')}</Select.Option>{roleOptions.map((option) => <Select.Option value={option.code} key={option.code}>{option.name}</Select.Option>)}</Select></label><label className="enterprise-filter-field"><span id="enterprise-member-status-filter-label">{t('console.enterprise.members.statusFilter')}</span><Select value={status} onChange={(value) => { setStatus(String(value)); setPage(1) }} onSelect={(value) => { setStatus(String(value)); setPage(1) }} aria-labelledby="enterprise-member-status-filter-label" block><Select.Option value="all">{t('console.enterprise.members.allStatuses')}</Select.Option><Select.Option value="active">{t('console.enterprise.memberActive')}</Select.Option><Select.Option value="suspended">{t('console.enterprise.memberSuspended')}</Select.Option><Select.Option value="removed">{t('console.enterprise.memberRemoved')}</Select.Option></Select></label>{context.capabilities.can_manage_members ? <Button className="enterprise-member-invite-button" theme="solid" type="primary" onClick={() => { setCreatedInvitation(null); setInviteVisible(true) }} disabled={!assignableRoleOptions(roleOptions).length}>{t('console.enterprise.members.inviteMember')}</Button> : null}</div> : null}
    {content}
    <MembersPagination page={tab === 'members' ? members?.page ?? page : tab === 'requests' ? requests?.page ?? page : invitations?.page ?? page} pageSize={tab === 'members' ? members?.page_size ?? pageSize : tab === 'requests' ? requests?.page_size ?? pageSize : invitations?.page_size ?? pageSize} total={tab === 'members' ? members?.total ?? 0 : tab === 'requests' ? requests?.total ?? 0 : invitations?.total ?? 0} onChange={setPage} onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1) }} />
    <MemberDetailModal member={selectedMember} tags={tags} roleOptions={roleOptions} context={context} visible={Boolean(selectedMember) || memberDetailLoading} loading={memberDetailLoading} onClose={() => { setSelectedMember(null); setMemberDetailError('') }} onUpdated={updateMember} />
    {memberDetailError ? <Modal title={t('console.enterprise.members.memberDetail')} visible={Boolean(memberDetailError)} onCancel={() => setMemberDetailError('')} footer={null}><EnterpriseError message={memberDetailError} requestId={null} onRetry={() => { setMemberDetailError(''); const member = selectedMember; if (member) void openMember(member) }} /></Modal> : null}
    <TagManagerModal visible={tagManagerVisible} tags={tags} canManage={context.capabilities.can_manage_tags} onCancel={() => setTagManagerVisible(false)} onCreate={() => setTagEditor(null)} onEdit={(tag) => setTagEditor(tag)} onDelete={(tag) => { void removeTag(tag) }} loading={tagsLoading} />
    <TagEditorModal visible={tagEditor !== undefined} tag={tagEditor ?? null} saving={tagSaving} onCancel={() => setTagEditor(undefined)} onSave={(form) => { void saveTag(form) }} />
    <JoinRequestReviewModal request={selectedReviewRequest} roleOptions={roleOptions} visible={Boolean(selectedReviewRequest)} saving={reviewSaving} onCancel={() => setSelectedReviewRequest(null)} onReview={(input) => { void reviewRequest(input) }} />
    <InviteModal visible={inviteVisible} roleOptions={roleOptions} saving={inviteSaving} created={createdInvitation} onCancel={() => { setInviteVisible(false); setCreatedInvitation(null) }} onCreate={(input) => { void createInvitation(input) }} />
    <InvitationUsagesModal invitation={usageInvitation} usages={invitationUsages} loading={invitationUsageLoading} roleOptions={roleOptions} onClose={() => setUsageInvitation(null)} />
  </>
}

function MembersTable({ data, roleOptions, loading, error, canManage, onRetry, onOpen }: { data: { items: EnterpriseMember[]; total: number } | null; roleOptions: EnterpriseRoleOption[]; loading: boolean; error: { message: string; requestId: string | null } | null; canManage: boolean; onRetry: () => void; onOpen: (member: EnterpriseMember) => void }) {
  const { t } = useTranslation()
  if (loading && !data) return <EnterpriseLoading label={t('console.enterprise.members.loadingMembers')} />
  if (error && !data) return <EnterpriseError message={error.message} requestId={error.requestId} onRetry={onRetry} />
  if (!data?.items.length) return <EnterpriseEmpty title={t('console.enterprise.members.noMembers')} description={t('console.enterprise.members.noMembersHint')} />
  return <div className="source-table-scroll enterprise-table-region" role="region" aria-label={t('console.enterprise.members.membersList')} tabIndex={0}><table className="enterprise-members-table"><thead><tr><th>{t('console.enterprise.members.member')}</th><th>{t('console.enterprise.members.role')}</th><th>{t('console.enterprise.members.status')}</th><th>{t('console.enterprise.members.tagsLabel')}</th><th>{t('console.enterprise.members.quotaUsage')}</th><th>{t('console.enterprise.members.joinedTime')}</th><th>{t('console.enterprise.members.operation')}</th></tr></thead><tbody>{data.items.map((member) => <tr key={member.id}><td><span className="enterprise-member-identity"><span className="enterprise-member-avatar">{memberInitial(member)}</span><span><strong>{member.display_name || t('console.enterprise.members.unnamedMember')}</strong><small>{member.masked_contact || member.user_id}</small></span></span></td><td><span className={`role-tag ${roleVisualClass(member.role, roleOptions)}`}>{roleLabel(member.role, roleOptions)}</span></td><td><span className={`source-status-badge ${statusClass(member.status)}`}>{memberStatusLabel(member.status)}</span></td><td><div className="enterprise-table-tags">{memberTagRefs(member).length ? memberTagRefs(member).map((tag) => <span key={tag.id}>{tag.name}</span>) : <small>{t('console.enterprise.members.ungrouped')}</small>}</div></td><td><span>{member.budget?.cost_limit_yuan ? <MoneyText value={member.budget.cost_limit_yuan} /> : t('console.enterprise.members.noBudget')}</span><small>{member.budget?.usage_percent === null || member.budget?.usage_percent === undefined ? t('console.enterprise.members.noUsageRate') : `${formatEnterpriseRate(member.budget.usage_percent)} ${t('console.enterprise.members.used')}`}</small></td><td>{formatEnterpriseTime(member.joined_at)}</td><td><Button theme="borderless" disabled={!canManage && member.status === 'removed'} onClick={() => onOpen(member)}>{t('console.enterprise.members.viewDetails')}</Button></td></tr>)}</tbody></table></div>
}

function JoinRequestsTable({ data, roleOptions, loading, error, canManage, onRetry, onReview }: { data: { items: EnterpriseJoinRequest[]; total: number } | null; roleOptions: EnterpriseRoleOption[]; loading: boolean; error: { message: string; requestId: string | null } | null; canManage: boolean; onRetry: () => void; onReview: (request: EnterpriseJoinRequest) => void }) {
  const { t } = useTranslation()
  if (loading && !data) return <EnterpriseLoading label={t('console.enterprise.members.loadingRequests')} />
  if (error && !data) return <EnterpriseError message={error.message} requestId={error.requestId} onRetry={onRetry} />
  if (!data?.items.length) return <EnterpriseEmpty title={t('console.enterprise.members.noRequests')} description={t('console.enterprise.members.pendingReviewHint')} />
  return <div className="source-table-scroll enterprise-table-region" role="region" aria-label={t('console.enterprise.members.requestList')} tabIndex={0}><table className="enterprise-members-table"><thead><tr><th>{t('console.enterprise.members.applicant')}</th><th>{t('console.enterprise.members.applyRole')}</th><th>{t('console.enterprise.members.applyMessage')}</th><th>{t('console.enterprise.members.requestTime')}</th><th>{t('console.enterprise.members.requestStatus')}</th><th>{t('console.enterprise.members.review')}</th></tr></thead><tbody>{data.items.map((request) => <tr key={request.id}><td><span className="enterprise-member-identity"><span className="enterprise-member-avatar">{request.applicant_name.slice(0, 1)}</span><span><strong>{request.applicant_name}</strong><small>{request.applicant_contact || request.applicant_user_id}</small></span></span></td><td>{roleLabel(request.requested_role, roleOptions)}</td><td className="enterprise-truncate-cell" title={request.request_message}>{request.request_message || t('console.enterprise.members.noApplyMessage')}</td><td>{formatEnterpriseTime(request.created_at)}</td><td><span className={`source-status-badge ${statusClass(request.status)}`}>{joinRequestStatusLabel(request.status)}</span></td><td><Button theme="outline" disabled={!canManage || request.status !== 'pending'} onClick={() => onReview(request)}>{t('console.enterprise.members.review')}</Button></td></tr>)}</tbody></table></div>
}

function InvitationsTable({ data, roleOptions, loading, error, canManage, onRetry, onCopy, onDisable, onRegenerate, onUsages }: { data: { items: EnterpriseInvitation[]; total: number } | null; roleOptions: EnterpriseRoleOption[]; loading: boolean; error: { message: string; requestId: string | null } | null; canManage: boolean; onRetry: () => void; onCopy: (invitation: EnterpriseInvitation) => void; onDisable: (invitation: EnterpriseInvitation) => void; onRegenerate: (invitation: EnterpriseInvitation) => void; onUsages: (invitation: EnterpriseInvitation) => void }) {
  const { t } = useTranslation()
  if (loading && !data) return <EnterpriseLoading label={t('console.enterprise.members.loadingInvitations')} />
  if (error && !data) return <EnterpriseError message={error.message} requestId={error.requestId} onRetry={onRetry} />
  if (!data?.items.length) return <EnterpriseEmpty title={t('console.enterprise.members.noInvitations')} description={t('console.enterprise.members.invitationListHint')} />
  return <div className="source-table-scroll enterprise-table-region" role="region" aria-label={t('console.enterprise.members.invitationList')} tabIndex={0}><table className="enterprise-members-table enterprise-invitations-table"><thead><tr><th>{t('console.enterprise.members.role')}</th><th>{t('console.enterprise.members.inviteLink')}</th><th>{t('console.enterprise.members.usageRecords')}</th><th>{t('console.enterprise.members.validUntil')}</th><th>{t('console.enterprise.members.creator')}</th><th>{t('console.enterprise.members.status')}</th><th>{t('console.enterprise.members.operation')}</th></tr></thead><tbody>{data.items.map((invitation) => { const inviteURL = resolveInvitationURL(invitation.invite_url, window.location.origin); const canChange = canManage && invitation.status === 'active'; return <tr key={invitation.id}><td><strong>{invitation.role_name || roleLabel(invitation.role, roleOptions)}</strong><small>{invitation.id}</small></td><td className="enterprise-invitation-url-cell">{inviteURL ? <code title={inviteURL}>{inviteURL}</code> : <small>{t('console.enterprise.members.historyLinkUnavailable')}</small>}</td><td>{formatEnterpriseNumber(invitation.used_count)} / {invitation.max_uses}</td><td>{invitation.expires_at ? formatEnterpriseTime(invitation.expires_at) : t('console.join.forever')}</td><td>{invitation.inviter_name || t('console.enterprise.members.enterpriseMember')}</td><td><span className={`source-status-badge ${statusClass(invitation.status)}`}>{invitationStatusLabel(invitation.status)}</span></td><td><div className="enterprise-row-actions"><Button theme="borderless" disabled={!canManage || !inviteURL} onClick={() => onCopy(invitation)}>{t('console.enterprise.members.copyLink')}</Button>{inviteURL ? <a className="enterprise-row-action-link" href={inviteURL} target="_blank" rel="noreferrer">{t('console.enterprise.members.openPreview')}</a> : null}<Button theme="borderless" onClick={() => onUsages(invitation)}>{t('console.enterprise.members.usageRecords')}</Button>{canChange ? <><Button theme="borderless" onClick={() => onRegenerate(invitation)}>{t('console.enterprise.members.regenerate')}</Button><Button theme="borderless" type="danger" onClick={() => onDisable(invitation)}>{t('console.enterprise.members.revoke')}</Button></> : null}</div></td></tr> })}</tbody></table></div>
}

export function MembersPage() {
  const { t } = useTranslation()
  return <EnterprisePageShell title={t('console.enterprise.members.title')} description={t('console.enterprise.members.description')}>{(context) => <MembersContent context={context} />}</EnterprisePageShell>
}
