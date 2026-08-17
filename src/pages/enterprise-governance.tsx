import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Input from '@douyinfe/semi-ui/lib/es/input'
import Modal from '@douyinfe/semi-ui/lib/es/modal'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { IconDeleteStroked, IconPlus } from '@douyinfe/semi-icons'
import { CompatSelect as Select } from '@/components/semi-compat'
import {
  createEnterpriseRole,
  createEnterpriseTag,
  deleteEnterpriseRole,
  deleteEnterpriseTag,
  getAllEnterpriseMembers,
  getEnterpriseGovernance,
  getEnterpriseTags,
  updateEnterpriseMemberTag,
  updateEnterpriseRole,
  updateEnterpriseTag,
  type EnterpriseContext,
  type EnterpriseGovernanceResponse,
  type EnterpriseMember,
  type EnterprisePermissionDefinition,
  type EnterpriseRole,
  type EnterpriseRoleInput,
  type EnterpriseTag,
  type EnterpriseTagInput,
} from '@/api/enterprise-console'
import {
  EnterpriseEmpty,
  EnterpriseError,
  EnterpriseLoading,
  EnterprisePageShell,
  roleLabel,
  useEnterpriseErrorHandler,
} from './enterprise-console-shared'

type GovernanceTab = 'roles' | 'tags'

function governanceTabFromSearchParams(searchParams: URLSearchParams): GovernanceTab {
  return searchParams.get('view') === 'tags' || searchParams.get('tab') === 'tags' ? 'tags' : 'roles'
}

type RoleDraft = {
  id?: string
  version?: number
  builtIn: boolean
  ownerRole: boolean
  name: string
  description: string
  permissionCodes: string[]
}

type TagDraft = {
  id?: string
  version?: number
  name: string
  description: string
  dailyCostLimitYuan: string
  weeklyCostLimitYuan: string
  monthlyCostLimitYuan: string
  concurrencyLimit: string
  rpmLimit: string
  tpmLimit: string
  allowedModels: string
}

const MAX_ROLE_COUNT = 50
const MAX_ROLE_NAME_LENGTH = 40
const MAX_ROLE_DESCRIPTION_LENGTH = 160
const MAX_TAG_NAME_LENGTH = 24

const ENTERPRISE_GOVERNANCE_RESOURCES = new Set(['members', 'usage', 'audit', 'analytics', 'billing', 'settings', 'models', 'roles', 'tags'])

const EMPTY_TAG_DRAFT: TagDraft = {
  name: '',
  description: '',
  dailyCostLimitYuan: '',
  weeklyCostLimitYuan: '',
  monthlyCostLimitYuan: '',
  concurrencyLimit: '',
  rpmLimit: '',
  tpmLimit: '',
  allowedModels: '',
}

function roleDraftFromRole(role: EnterpriseRole): RoleDraft {
  return {
    id: role.id,
    version: role.version,
    builtIn: role.built_in,
    ownerRole: role.owner_role,
    name: role.name,
    description: role.description,
    permissionCodes: Array.isArray(role.permission_codes) ? [...role.permission_codes] : [],
  }
}

function normalizeEnterpriseRole(role: EnterpriseRole, allowedPermissionCodes?: ReadonlySet<string>): EnterpriseRole {
  const permissionCodes = Array.isArray(role.permission_codes) ? [...role.permission_codes] : []
  return {
    ...role,
    permission_codes: allowedPermissionCodes ? permissionCodes.filter((code) => allowedPermissionCodes.has(code)) : permissionCodes,
  }
}

function normalizeEnterpriseTag(tag: EnterpriseTag): EnterpriseTag {
  return {
    ...tag,
    allowed_models: Array.isArray(tag.allowed_models) ? [...tag.allowed_models] : [],
  }
}

function normalizeEnterpriseGovernance(response: EnterpriseGovernanceResponse): EnterpriseGovernanceResponse {
  const permissions = filterEnterpriseGovernancePermissions(response.permissions).map((permission) => ({
    ...permission,
    depends_on: Array.isArray(permission.depends_on) ? [...permission.depends_on] : [],
  }))
  const allowedPermissionCodes = new Set(permissions.map((permission) => permission.code))
  return {
    ...response,
    permissions,
    roles: Array.isArray(response.roles) ? response.roles.map((role) => normalizeEnterpriseRole(role, allowedPermissionCodes)) : [],
  }
}

function tagDraftFromTag(tag: EnterpriseTag): TagDraft {
  return {
    id: tag.id,
    version: tag.version,
    name: tag.name,
    description: tag.description,
    dailyCostLimitYuan: tag.daily_cost_limit_yuan ?? '',
    weeklyCostLimitYuan: tag.weekly_cost_limit_yuan ?? '',
    monthlyCostLimitYuan: tag.monthly_cost_limit_yuan ?? '',
    concurrencyLimit: tag.concurrency_limit === null ? '' : String(tag.concurrency_limit),
    rpmLimit: tag.rpm_limit === null ? '' : String(tag.rpm_limit),
    tpmLimit: tag.tpm_limit === null ? '' : String(tag.tpm_limit),
    allowedModels: Array.isArray(tag.allowed_models) ? tag.allowed_models.join(', ') : '',
  }
}

function optionalText(value: string): string | null {
  const normalized = value.trim()
  return normalized === '' ? null : normalized
}

function optionalInteger(value: string): number | null {
  const normalized = value.trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function tagInputFromDraft(draft: TagDraft): EnterpriseTagInput | null {
  const integerFields = [draft.concurrencyLimit, draft.rpmLimit, draft.tpmLimit].map(optionalInteger)
  if (integerFields.some((value, index) => value === null && [draft.concurrencyLimit, draft.rpmLimit, draft.tpmLimit][index].trim() !== '')) return null
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    daily_cost_limit_yuan: optionalText(draft.dailyCostLimitYuan),
    weekly_cost_limit_yuan: optionalText(draft.weeklyCostLimitYuan),
    monthly_cost_limit_yuan: optionalText(draft.monthlyCostLimitYuan),
    concurrency_limit: integerFields[0],
    rpm_limit: integerFields[1],
    tpm_limit: integerFields[2],
    allowed_models: draft.allowedModels.split(/[,\n]/).map((value) => value.trim()).filter(Boolean),
  }
}

export function filterEnterpriseGovernancePermissions(permissions: EnterprisePermissionDefinition[]): EnterprisePermissionDefinition[] {
  return Array.isArray(permissions) ? permissions.filter((permission) => ENTERPRISE_GOVERNANCE_RESOURCES.has(permission.resource)) : []
}

function groupedPermissions(permissions: EnterprisePermissionDefinition[]): Array<[string, EnterprisePermissionDefinition[]]> {
  const groups = new Map<string, EnterprisePermissionDefinition[]>()
  permissions.forEach((permission) => {
    const current = groups.get(permission.resource) ?? []
    current.push(permission)
    groups.set(permission.resource, current)
  })
  return [...groups.entries()]
}

function resourceLabel(resource: string, translate: ReturnType<typeof useTranslation>['t']): string {
  return translate(`console.enterprise.governance.resources.${resource}`, { defaultValue: resource })
}

function roleCountLabel(role: EnterpriseRole, translate: ReturnType<typeof useTranslation>['t']): string {
  const category = role.built_in ? translate('console.enterprise.governance.systemRole') : translate('console.enterprise.governance.customRole')
  return translate('console.enterprise.governance.roleCount', { category, count: role.member_count })
}

function memberInitial(member: EnterpriseMember): string {
  return (member.display_name || member.user_id || '?').slice(0, 1)
}

function isOwnerMember(member: EnterpriseMember, roleOptions: EnterpriseContext['role_options']): boolean {
  const roleCodes = member.roles.length ? member.roles : [member.role]
  return roleCodes.some((code) => roleOptions?.some((option) => option.code === code && option.owner_role) === true)
}

function permissionInputID(code: string): string {
  return `enterprise-permission-${code.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

export function updatePermissionSelection(code: string, selected: boolean, current: string[], permissions: EnterprisePermissionDefinition[]): string[] {
  const dependencies = new Map(permissions.map((permission) => [permission.code, Array.isArray(permission.depends_on) ? permission.depends_on : []]))
  const dependents = new Map<string, string[]>()
  dependencies.forEach((items, permissionCode) => items.forEach((dependency) => {
    dependents.set(dependency, [...(dependents.get(dependency) ?? []), permissionCode])
  }))
  const next = new Set(current)
  if (selected) {
    const addWithDependencies = (permissionCode: string): void => {
      if (next.has(permissionCode)) return
      next.add(permissionCode)
      ;(dependencies.get(permissionCode) ?? []).forEach(addWithDependencies)
    }
    addWithDependencies(code)
  } else {
    const removeWithDependents = (permissionCode: string): void => {
      next.delete(permissionCode)
      ;(dependents.get(permissionCode) ?? []).forEach(removeWithDependents)
    }
    removeWithDependents(code)
  }
  return permissions.filter((permission) => next.has(permission.code)).map((permission) => permission.code)
}

function RoleList({ roles, selectedID, canCreate, onSelect, onCreate }: { roles: EnterpriseRole[]; selectedID: string; canCreate: boolean; onSelect: (role: EnterpriseRole) => void; onCreate: () => void }) {
  const { t } = useTranslation()
  const customRoleCount = roles.filter((role) => !role.built_in && !role.owner_role).length
  return <aside className="enterprise-governance-rail" aria-label={t('console.enterprise.governance.roleList')}>
    <div className="enterprise-governance-rail-header"><span className="enterprise-governance-rail-title">{t('console.enterprise.governance.roles')}</span><span className="enterprise-governance-rail-tools"><span className="enterprise-governance-rail-count">{roles.length}</span><Button theme="borderless" type="tertiary" size="small" className="enterprise-governance-rail-add" icon={<IconPlus />} aria-label={t('console.enterprise.governance.createRole')} title={t('console.enterprise.governance.createRole')} onClick={onCreate} disabled={!canCreate || customRoleCount >= MAX_ROLE_COUNT} /></span></div>
    {roles.length === 0 ? <EnterpriseEmpty title={t('console.enterprise.governance.noRoles')} description={t('console.enterprise.governance.noRolesHint')} /> : <div className="enterprise-governance-rail-list">{roles.map((role) => <button type="button" className={`enterprise-governance-rail-item${selectedID === role.id ? ' is-selected' : ''}`} aria-current={selectedID === role.id} key={role.id} onClick={() => onSelect(role)}><span className="enterprise-governance-rail-avatar" aria-hidden="true">{role.name.slice(0, 1)}</span><span className="enterprise-governance-rail-copy"><span className="enterprise-governance-rail-name">{role.name}</span><span className="enterprise-governance-rail-meta">{roleCountLabel(role, t)}</span></span></button>)}</div>}
  </aside>
}

function RoleEditor({ draft, permissions, canEdit, saving, onChange, onSave, onDelete }: { draft: RoleDraft; permissions: EnterprisePermissionDefinition[]; canEdit: boolean; saving: boolean; onChange: (patch: Partial<RoleDraft>) => void; onSave: () => void; onDelete: () => void }) {
  const { t } = useTranslation()
  const permissionGroups = groupedPermissions(permissions)
  const ownerRole = draft.ownerRole
  const editableCustomRole = !draft.builtIn && !ownerRole
  const permissionMessages = t('console.enterprise.governance.permissions', { returnObjects: true }) as unknown as Record<string, { name: string; description: string }>
  const description = ownerRole ? t('console.enterprise.governance.ownerDescription') : draft.description || t('console.enterprise.governance.customRoleDescription')
  return <section className="enterprise-governance-main" aria-label={t('console.enterprise.governance.rolePermissionEdit')}>
    <div className="enterprise-governance-panel-heading"><div><h2>{draft.name || t('console.enterprise.governance.unnamedRole')}</h2><p className="enterprise-governance-role-description">{description}</p></div><div className="enterprise-governance-panel-actions">{draft.id && !ownerRole ? <Button theme="borderless" type="danger" icon={<IconDeleteStroked />} disabled={!canEdit || saving} onClick={onDelete}>{t('console.enterprise.governance.deleteRole')}</Button> : null}{!ownerRole ? <Button theme="solid" type="primary" loading={saving} disabled={!canEdit || saving} onClick={onSave}>{t('console.enterprise.governance.savePermission')}</Button> : null}</div></div>
    {editableCustomRole ? <div className="enterprise-governance-role-form"><div className="enterprise-governance-role-form-grid"><label className="enterprise-governance-form-field"><span>{t('console.enterprise.governance.roleName')}</span><Input value={draft.name} maxLength={MAX_ROLE_NAME_LENGTH} disabled={!canEdit} onChange={(value) => onChange({ name: value })} /></label><label className="enterprise-governance-form-field"><span>{t('console.enterprise.governance.roleDescription')}</span><Input value={draft.description} maxLength={MAX_ROLE_DESCRIPTION_LENGTH} disabled={!canEdit} onChange={(value) => onChange({ description: value })} /></label></div><p className="enterprise-governance-field-hint">{t('console.enterprise.governance.customRoleHint')}</p></div> : null}
    <div className="enterprise-governance-permission-heading"><div><h3>{t('console.enterprise.governance.permissionMatrix')}</h3><p>{t('console.enterprise.governance.permissionHint')}</p></div><span>{t('console.enterprise.governance.selectedCount', { count: draft.permissionCodes.length })}</span></div>
    <div className="enterprise-governance-permission-groups">{permissionGroups.map(([resource, items]) => <section className="enterprise-governance-permission-group" key={resource}><h3>{resourceLabel(resource, t)}</h3>{items.map((permission) => { const inputID = permissionInputID(permission.code); const checked = draft.permissionCodes.includes(permission.code); const message = permissionMessages[permission.code] ?? permission; return <div className="enterprise-governance-permission-row" key={permission.code}><div className="enterprise-governance-permission-label">{message.name}</div><div className="enterprise-governance-permission-description">{message.description}</div><div className="enterprise-governance-permission-control"><input id={inputID} type="checkbox" checked={checked} aria-label={message.name} disabled={!canEdit || ownerRole} onChange={(event) => onChange({ permissionCodes: updatePermissionSelection(permission.code, event.target.checked, draft.permissionCodes, permissions) })} /><label htmlFor={inputID}>{checked ? t('console.enterprise.governance.enabled') : t('console.enterprise.governance.disabled')}</label></div></div> })}</section>)}</div>
  </section>
}

function TagList({ tags, selectedID, canCreate, onSelect, onCreate }: { tags: EnterpriseTag[]; selectedID: string; canCreate: boolean; onSelect: (tag: EnterpriseTag) => void; onCreate: () => void }) {
  const { t } = useTranslation()
  return <aside className="enterprise-governance-rail" aria-label={t('console.enterprise.governance.tagListLabel')}>
    <div className="enterprise-governance-rail-header"><span className="enterprise-governance-rail-title">{t('console.enterprise.governance.tags')}</span><span className="enterprise-governance-rail-tools"><span className="enterprise-governance-rail-count">{tags.length}</span><Button theme="borderless" type="tertiary" size="small" className="enterprise-governance-rail-add" icon={<IconPlus />} aria-label={t('console.enterprise.governance.createTag')} title={t('console.enterprise.governance.createTag')} onClick={onCreate} disabled={!canCreate} /></span></div>
    {tags.length === 0 ? <EnterpriseEmpty title={t('console.enterprise.governance.noTags')} description={t('console.enterprise.governance.noTagsHint')} /> : <div className="enterprise-governance-rail-list">{tags.map((tag) => <button type="button" className={`enterprise-governance-rail-item${selectedID === tag.id ? ' is-selected' : ''}`} aria-current={selectedID === tag.id} key={tag.id} onClick={() => onSelect(tag)}><span className="enterprise-governance-rail-avatar" aria-hidden="true">#</span><span className="enterprise-governance-rail-copy"><span className="enterprise-governance-rail-name">{tag.name}</span><span className="enterprise-governance-rail-meta">{t('console.enterprise.governance.tagMemberCount', { count: tag.member_count })}</span></span></button>)}</div>}
  </aside>
}

function TagEditor({ draft, canEdit, canBind, members, roleOptions, saving, bindingID, bindMemberID, onChange, onSave, onDelete, onBind, onBindMemberChange }: { draft: TagDraft; canEdit: boolean; canBind: boolean; members: EnterpriseMember[]; roleOptions: EnterpriseContext['role_options']; saving: boolean; bindingID: string; bindMemberID: string; onChange: (patch: Partial<TagDraft>) => void; onSave: () => void; onDelete: () => void; onBind: (member: EnterpriseMember, tagID: string) => void; onBindMemberChange: (memberID: string) => void }) {
  const { t } = useTranslation()
  const tagID = draft.id ?? ''
  const boundMembers = members.filter((member) => member.tags?.some((tag) => tag.id === tagID))
  const unboundMembers = members.filter((member) => !isOwnerMember(member, roleOptions) && !member.tags?.length)
  return <section className="enterprise-governance-main" aria-label={t('console.enterprise.governance.tagEdit')}>
    <div className="enterprise-governance-panel-heading"><div><h2>{draft.name ? t('console.enterprise.governance.tagHeading', { name: draft.name }) : t('console.enterprise.governance.tags')}</h2><p className="enterprise-governance-role-description">{t('console.enterprise.governance.tagPolicy')}</p></div><div className="enterprise-governance-panel-actions">{draft.id ? <Button theme="borderless" type="danger" icon={<IconDeleteStroked />} disabled={!canEdit || saving} onClick={onDelete}>{t('console.enterprise.governance.deleteTag')}</Button> : null}<Button theme="solid" type="primary" loading={saving} disabled={!canEdit || saving} onClick={onSave}>{t('console.enterprise.governance.savePolicy')}</Button></div></div>
    <div className="enterprise-governance-policy-grid"><label className="enterprise-governance-form-field"><span>{t('console.enterprise.governance.dailyCost')}</span><input className="source-input" type="number" min="0" step="0.01" value={draft.dailyCostLimitYuan} disabled={!canEdit} onChange={(event) => onChange({ dailyCostLimitYuan: event.target.value })} /></label><label className="enterprise-governance-form-field"><span>{t('console.enterprise.governance.weeklyCost')}</span><input className="source-input" type="number" min="0" step="0.01" value={draft.weeklyCostLimitYuan} disabled={!canEdit} onChange={(event) => onChange({ weeklyCostLimitYuan: event.target.value })} /></label><label className="enterprise-governance-form-field"><span>{t('console.enterprise.governance.monthlyCost')}</span><input className="source-input" type="number" min="0" step="0.01" value={draft.monthlyCostLimitYuan} disabled={!canEdit} onChange={(event) => onChange({ monthlyCostLimitYuan: event.target.value })} /></label><label className="enterprise-governance-form-field"><span>{t('console.enterprise.governance.concurrency')}</span><input className="source-input" type="number" min="0" step="1" value={draft.concurrencyLimit} disabled={!canEdit} onChange={(event) => onChange({ concurrencyLimit: event.target.value })} /></label><label className="enterprise-governance-form-field"><span>RPM</span><input className="source-input" type="number" min="0" step="1" value={draft.rpmLimit} disabled={!canEdit} onChange={(event) => onChange({ rpmLimit: event.target.value })} /></label><label className="enterprise-governance-form-field"><span>TPM</span><input className="source-input" type="number" min="0" step="1" value={draft.tpmLimit} disabled={!canEdit} onChange={(event) => onChange({ tpmLimit: event.target.value })} /></label></div>
    <div className="enterprise-governance-policy-models"><label className="enterprise-governance-form-field" htmlFor="enterprise-tag-models"><span>{t('console.enterprise.governance.allowedModels')}</span><textarea id="enterprise-tag-models" className="source-input enterprise-governance-policy-models-input" value={draft.allowedModels} disabled={!canEdit} onChange={(event) => onChange({ allowedModels: event.target.value })} placeholder={t('console.enterprise.governance.globalModelHint')} /></label><p className="enterprise-governance-field-hint">{t('console.enterprise.governance.modelHint')}</p></div>
    {tagID ? <section className="enterprise-governance-bound-members" aria-labelledby="enterprise-bound-members-title"><div className="enterprise-governance-panel-heading"><div><h3 id="enterprise-bound-members-title">{t('console.enterprise.governance.boundMembers')}</h3><p>{t('console.enterprise.governance.boundMembersHint')}</p></div></div>{boundMembers.length ? <div className="enterprise-governance-bound-member-list">{boundMembers.map((member) => <div className="enterprise-governance-bound-member" key={member.id}><span className="enterprise-governance-bound-member-name"><span className="enterprise-governance-bound-member-avatar" aria-hidden="true">{memberInitial(member)}</span><span><strong>{member.display_name || member.user_id}</strong><small>{roleLabel(member.role, roleOptions ?? [])}</small></span></span>{canBind && !isOwnerMember(member, roleOptions) ? <Button theme="borderless" size="small" disabled={bindingID === member.id} onClick={() => onBind(member, '')}>{t('console.enterprise.governance.unbind')}</Button> : null}</div>)}</div> : <p className="enterprise-governance-rail-meta">{t('console.enterprise.governance.noBoundMembers')}</p>}{canBind ? <div className="enterprise-governance-bind-form"><label className="enterprise-governance-form-field" htmlFor="enterprise-bind-member"><span>{t('console.enterprise.governance.bindMember')}</span><Select id="enterprise-bind-member" value={bindMemberID} disabled={Boolean(bindingID)} onChange={(value) => onBindMemberChange(String(value))} block><Select.Option value="">{t('console.enterprise.governance.selectMember')}</Select.Option>{unboundMembers.map((member) => <Select.Option value={member.id} key={member.id}>{member.display_name || member.user_id} · {roleLabel(member.role, roleOptions ?? [])}</Select.Option>)}</Select></label><Button theme="outline" disabled={!bindMemberID || Boolean(bindingID)} loading={Boolean(bindingID)} onClick={() => { const member = unboundMembers.find((item) => item.id === bindMemberID); if (member) onBind(member, tagID) }}>{t('console.enterprise.governance.bindMember')}</Button></div> : null}</section> : null}
  </section>
}

function RoleCreationDialog({ draft, saving, onChange, onCreate, onCancel }: { draft: RoleDraft | null; saving: boolean; onChange: (patch: Partial<RoleDraft>) => void; onCreate: () => void; onCancel: () => void }) {
  const { t } = useTranslation()
  return <Modal title={t('console.enterprise.governance.createRole')} visible={Boolean(draft && !draft.id)} onCancel={onCancel} onOk={onCreate} okText={t('console.enterprise.governance.createRoleAction')} cancelText={t('console.common.cancel')} okButtonProps={{ loading: saving, disabled: saving || !draft?.name.trim() }}>
    <div className="enterprise-governance-create-form"><label className="enterprise-governance-form-field"><span>{t('console.enterprise.governance.roleName')}</span><Input value={draft?.name ?? ''} maxLength={MAX_ROLE_NAME_LENGTH} placeholder={t('console.enterprise.governance.roleNamePlaceholder')} onChange={(value) => onChange({ name: value })} /></label><label className="enterprise-governance-form-field"><span>{t('console.enterprise.governance.roleDescription')}</span><Input value={draft?.description ?? ''} maxLength={MAX_ROLE_DESCRIPTION_LENGTH} placeholder={t('console.enterprise.governance.roleDescriptionPlaceholder')} onChange={(value) => onChange({ description: value })} /></label></div>
  </Modal>
}

function TagCreationDialog({ draft, saving, onChange, onCreate, onCancel }: { draft: TagDraft | null; saving: boolean; onChange: (patch: Partial<TagDraft>) => void; onCreate: () => void; onCancel: () => void }) {
  const { t } = useTranslation()
  return <Modal title={t('console.enterprise.governance.createTag')} visible={Boolean(draft && !draft.id)} onCancel={onCancel} onOk={onCreate} okText={t('console.enterprise.governance.createTagAction')} cancelText={t('console.common.cancel')} okButtonProps={{ loading: saving, disabled: saving || !draft?.name.trim() }}>
    <div className="enterprise-governance-create-form"><label className="enterprise-governance-form-field"><span>{t('console.enterprise.governance.tagName')}</span><Input value={draft?.name ?? ''} maxLength={MAX_TAG_NAME_LENGTH} placeholder={t('console.enterprise.governance.tagNamePlaceholder')} onChange={(value) => onChange({ name: value })} /></label><p className="enterprise-governance-field-hint">{t('console.enterprise.governance.tagCreationHint')}</p></div>
  </Modal>
}

function GovernanceContent({ context }: { context: EnterpriseContext }) {
  const { t } = useTranslation()
  const handleError = useEnterpriseErrorHandler()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<GovernanceTab>(() => governanceTabFromSearchParams(searchParams))
  const [governance, setGovernance] = useState<EnterpriseGovernanceResponse | null>(null)
  const [tags, setTags] = useState<EnterpriseTag[]>([])
  const [members, setMembers] = useState<EnterpriseMember[]>([])
  const [selectedRoleID, setSelectedRoleID] = useState('')
  const [selectedTagID, setSelectedTagID] = useState('')
  const [roleDraft, setRoleDraft] = useState<RoleDraft | null>(null)
  const [tagDraft, setTagDraft] = useState<TagDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const [bindingID, setBindingID] = useState('')
  const [bindMemberID, setBindMemberID] = useState('')

  const ownerRole = context.role === 'owner' || context.roles.includes('owner') || context.role_options?.some((option) => option.owner_role && context.roles.includes(option.code)) === true
  const hasPermission = (permission: string): boolean => ownerRole || context.permissions?.includes(permission) === true
  const canEditRoles = context.capabilities.can_manage_roles && hasPermission('roles.edit')
  const canEditTags = context.capabilities.can_manage_tags && hasPermission('tags.edit')
  const canBindTags = context.capabilities.can_manage_tags && hasPermission('tags.bind')
  const requestContext = useMemo(() => ({ enterprise_id: context.id }), [context.id])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    const canReadMemberResources = ownerRole || context.permissions?.includes('members.view') === true
    const tagRequest = canReadMemberResources ? getEnterpriseTags(requestContext, { signal: controller.signal }) : Promise.resolve<EnterpriseTag[]>([])
    const memberRequest = tab === 'tags' && canReadMemberResources ? getAllEnterpriseMembers(requestContext, { signal: controller.signal }) : Promise.resolve([] as EnterpriseMember[])
    Promise.all([
      getEnterpriseGovernance(requestContext, { signal: controller.signal }),
      tagRequest,
      memberRequest,
    ]).then(([roleResult, tagResult, memberResult]) => {
      if (!active) return
      const normalizedRoleResult = normalizeEnterpriseGovernance(roleResult)
      const normalizedTags = Array.isArray(tagResult) ? tagResult.map(normalizeEnterpriseTag) : []
      setGovernance(normalizedRoleResult)
      setTags(normalizedTags)
      setMembers(memberResult)
      setSelectedRoleID((previous) => normalizedRoleResult.roles.some((role) => role.id === previous) ? previous : normalizedRoleResult.roles[0]?.id ?? '')
      setSelectedTagID((previous) => normalizedTags.some((tag) => tag.id === previous) ? previous : normalizedTags[0]?.id ?? '')
    }).catch((reason: unknown) => {
      if (!active || controller.signal.aborted) return
      const result = handleError(reason)
      if (result) setError(result)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [context.permissions, handleError, ownerRole, requestContext, tab])

  const selectedRole = governance?.roles.find((role) => role.id === selectedRoleID) ?? null
  const selectedTag = tags.find((tag) => tag.id === selectedTagID) ?? null

  function createRole(): void {
    setRoleDraft({ builtIn: false, ownerRole: false, name: '', description: '', permissionCodes: [] })
  }

  function editRole(role: EnterpriseRole): void {
    setSelectedRoleID(role.id)
    setRoleDraft(roleDraftFromRole(role))
  }

  async function saveRole(): Promise<void> {
    if (!roleDraft) return
    const name = roleDraft.name.trim()
    if (!name || name.length > MAX_ROLE_NAME_LENGTH || roleDraft.description.trim().length > MAX_ROLE_DESCRIPTION_LENGTH) {
      Toast.warning(t('console.enterprise.governance.roleValidation', { nameLength: MAX_ROLE_NAME_LENGTH, descriptionLength: MAX_ROLE_DESCRIPTION_LENGTH }))
      return
    }
    const input: EnterpriseRoleInput = { name, description: roleDraft.description.trim(), permission_codes: roleDraft.permissionCodes }
    setSaving(true)
    try {
      const result = roleDraft.id && roleDraft.version ? await updateEnterpriseRole(requestContext, roleDraft.id, { ...input, expected_version: roleDraft.version }) : await createEnterpriseRole(requestContext, input)
      const allowedPermissionCodes = new Set(governance?.permissions.map((permission) => permission.code) ?? [])
      const normalizedResult = normalizeEnterpriseRole(result, allowedPermissionCodes)
      setGovernance((previous) => previous ? { ...previous, roles: roleDraft.id ? previous.roles.map((role) => role.id === normalizedResult.id ? { ...role, ...normalizedResult } : role) : [...previous.roles, normalizedResult] } : previous)
      setSelectedRoleID(normalizedResult.id)
      setRoleDraft(null)
      Toast.success(roleDraft.id ? t('console.enterprise.governance.saveSuccess') : t('console.enterprise.governance.createSuccess'))
    } catch (reason: unknown) {
      const result = handleError(reason)
      if (result) Toast.error(result.message)
    } finally {
      setSaving(false)
    }
  }

  async function removeRole(): Promise<void> {
    if (!roleDraft?.id || !selectedRole || !window.confirm(t('console.enterprise.governance.deleteConfirm', { name: selectedRole.name }))) return
    if (selectedRole.member_count > 0 || selectedRole.invitation_count > 0) {
      Toast.warning(t('console.enterprise.governance.roleInUse'))
      return
    }
    setSaving(true)
    try {
      await deleteEnterpriseRole(requestContext, selectedRole.id, selectedRole.version)
      const remaining = governance?.roles.filter((role) => role.id !== selectedRole.id) ?? []
      setGovernance((previous) => previous ? { ...previous, roles: remaining } : previous)
      setSelectedRoleID(remaining[0]?.id ?? '')
      setRoleDraft(null)
      Toast.success(t('console.enterprise.governance.deleteSuccess'))
    } catch (reason: unknown) {
      const result = handleError(reason)
      if (result) Toast.error(result.message)
    } finally {
      setSaving(false)
    }
  }

  function createTag(): void {
    setTagDraft({ ...EMPTY_TAG_DRAFT })
  }

  function editTag(tag: EnterpriseTag): void {
    setSelectedTagID(tag.id)
    setBindMemberID('')
    setTagDraft(tagDraftFromTag(tag))
  }

  async function saveTag(): Promise<void> {
    if (!tagDraft || !tagDraft.name.trim()) {
      Toast.warning(t('console.enterprise.governance.tagNameRequired'))
      return
    }
    const input = tagInputFromDraft(tagDraft)
    if (!input) {
      Toast.warning(t('console.enterprise.governance.invalidTagLimit'))
      return
    }
    setSaving(true)
    try {
      const result = tagDraft.id && tagDraft.version ? await updateEnterpriseTag(requestContext, tagDraft.id, { ...input, expected_version: tagDraft.version }) : await createEnterpriseTag(requestContext, input)
      const normalizedResult = normalizeEnterpriseTag(result)
      setTags((previous) => tagDraft.id ? previous.map((tag) => tag.id === normalizedResult.id ? normalizedResult : tag) : [...previous, normalizedResult])
      setSelectedTagID(normalizedResult.id)
      setTagDraft(null)
      Toast.success(tagDraft.id ? t('console.enterprise.governance.tagSaved') : t('console.enterprise.governance.tagCreated'))
    } catch (reason: unknown) {
      const result = handleError(reason)
      if (result) Toast.error(result.message)
    } finally {
      setSaving(false)
    }
  }

  async function removeTag(): Promise<void> {
    if (!tagDraft?.id || !selectedTag || !window.confirm(t('console.enterprise.governance.tagDeleteConfirm', { name: selectedTag.name }))) return
    setSaving(true)
    try {
      await deleteEnterpriseTag(requestContext, selectedTag.id, selectedTag.version)
      const remaining = tags.filter((tag) => tag.id !== selectedTag.id)
      setTags(remaining)
      setSelectedTagID(remaining[0]?.id ?? '')
      setTagDraft(null)
      Toast.success(t('console.enterprise.governance.tagDeleted'))
    } catch (reason: unknown) {
      const result = handleError(reason)
      if (result) Toast.error(result.message)
    } finally {
      setSaving(false)
    }
  }

  async function bindTag(member: EnterpriseMember, tagID: string): Promise<void> {
    const previousTagID = member.tags?.[0]?.id ?? ''
    if (previousTagID === tagID) return
    setBindingID(member.id)
    try {
      const updated = await updateEnterpriseMemberTag(requestContext, member.id, { tag_id: tagID, expected_version: member.version })
      setMembers((previous) => previous.map((item) => item.id === updated.id ? updated : item))
      const nextTagID = updated.tags?.[0]?.id ?? ''
      setTags((previous) => previous.map((tag) => {
        if (tag.id === previousTagID) return { ...tag, member_count: Math.max(0, tag.member_count - 1) }
        if (nextTagID && tag.id === nextTagID) return { ...tag, member_count: tag.member_count + 1 }
        return tag
      }))
      setBindMemberID('')
      Toast.success(t('console.enterprise.governance.bindSuccess'))
    } catch (reason: unknown) {
      const result = handleError(reason)
      if (result) Toast.error(result.message)
    } finally {
      setBindingID('')
    }
  }

  if (loading) return <EnterpriseLoading label={t('console.enterprise.governance.loading')} />
  if (error) return <EnterpriseError message={error.message} requestId={error.requestId} onRetry={() => window.location.reload()} />
  if (!governance) return <EnterpriseEmpty title={t('console.enterprise.governance.noGovernance')} description={t('console.enterprise.governance.noGovernanceHint')} />

  const roleCreationDraft = roleDraft?.id ? null : roleDraft
  const tagCreationDraft = tagDraft?.id ? null : tagDraft
  const roleEditor = roleCreationDraft ? null : roleDraft ?? (selectedRole ? roleDraftFromRole(selectedRole) : null)
  const tagEditor = tagCreationDraft ? null : tagDraft ?? (selectedTag ? tagDraftFromTag(selectedTag) : null)
  return <div className="enterprise-governance-content">
    <div className="enterprise-governance-tabs" role="tablist" aria-label={t('console.enterprise.governance.title')}>
      <button id="enterprise-governance-tab-roles" type="button" role="tab" aria-controls="enterprise-governance-panel-roles" aria-selected={tab === 'roles'} tabIndex={tab === 'roles' ? 0 : -1} className={tab === 'roles' ? 'active' : ''} onClick={() => setTab('roles')}>{t('console.enterprise.governance.roleTab')}</button>
      <button id="enterprise-governance-tab-tags" type="button" role="tab" aria-controls="enterprise-governance-panel-tags" aria-selected={tab === 'tags'} tabIndex={tab === 'tags' ? 0 : -1} className={tab === 'tags' ? 'active' : ''} onClick={() => setTab('tags')}>{t('console.enterprise.governance.tagTab')}</button>
    </div>
    {tab === 'roles' ? <div id="enterprise-governance-panel-roles" className="enterprise-governance-layout" role="tabpanel" aria-labelledby="enterprise-governance-tab-roles">
      <RoleList roles={governance.roles} selectedID={selectedRoleID} canCreate={canEditRoles} onSelect={editRole} onCreate={createRole} />
      {roleEditor ? <RoleEditor draft={roleEditor} permissions={governance.permissions} canEdit={canEditRoles} saving={saving} onChange={(patch) => setRoleDraft((previous) => ({ ...(previous ?? roleEditor), ...patch }))} onSave={() => { void saveRole() }} onDelete={() => { void removeRole() }} /> : <EnterpriseEmpty title={t('console.enterprise.governance.selectRole')} description={t('console.enterprise.governance.selectRoleHint')} />}
    </div> : <div id="enterprise-governance-panel-tags" className="enterprise-governance-layout" role="tabpanel" aria-labelledby="enterprise-governance-tab-tags">
      <TagList tags={tags} selectedID={selectedTagID} canCreate={canEditTags} onSelect={editTag} onCreate={createTag} />
      {tagEditor ? <TagEditor draft={tagEditor} canEdit={canEditTags} canBind={canBindTags} members={members} roleOptions={context.role_options} saving={saving} bindingID={bindingID} bindMemberID={bindMemberID} onChange={(patch) => setTagDraft((previous) => ({ ...(previous ?? tagEditor), ...patch }))} onSave={() => { void saveTag() }} onDelete={() => { void removeTag() }} onBind={(member, tagID) => { void bindTag(member, tagID) }} onBindMemberChange={setBindMemberID} /> : <EnterpriseEmpty title={t('console.enterprise.governance.selectTag')} description={t('console.enterprise.governance.selectTagHint')} />}
    </div>}
    <RoleCreationDialog draft={roleCreationDraft} saving={saving} onChange={(patch) => setRoleDraft((previous) => previous ? { ...previous, ...patch } : previous)} onCreate={() => { void saveRole() }} onCancel={() => setRoleDraft(null)} />
    <TagCreationDialog draft={tagCreationDraft} saving={saving} onChange={(patch) => setTagDraft((previous) => previous ? { ...previous, ...patch } : previous)} onCreate={() => { void saveTag() }} onCancel={() => setTagDraft(null)} />
  </div>
}

export function EnterpriseGovernancePage() {
  const { t } = useTranslation()
  return <EnterprisePageShell title={t('console.enterprise.governance.title')} description={t('console.enterprise.governance.description')}>{(context) => <GovernanceContent context={context} />}</EnterprisePageShell>
}
