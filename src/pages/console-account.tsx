import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { getActiveLocale } from '@/i18n'
import { Link, useNavigate, useSearchParams } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Modal from '@douyinfe/semi-ui/lib/es/modal'
import Switch from '@douyinfe/semi-ui/lib/es/switch'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { IconArrowRight, IconBarChartHStroked, IconCheckCircleStroked, IconCopy, IconCreditCard, IconDeleteStroked, IconEditStroked, IconGift, IconKey, IconMinusCircleStroked, IconPlus, IconPlusCircleStroked, IconSearch, IconUserGroup } from '@douyinfe/semi-icons'
import { BannerNotice, EmptyPanel, MetricCard, ModelLogo, PageTitle, SectionHeading, workspacesFromMemberships } from '@/components/common'
import { MoneyText } from '@/components/money'
import { CompatCard as Card, CompatInput as Input, CompatSelect as Select } from '@/components/semi-compat'
import { useAppStore } from '@/data/app-state'
import { modelAlias } from '@/data/models'
import { getAccessToken } from '@/auth/token-storage'
import { getProfileEnterprises } from '@/api/profile'
import { ENTERPRISE_CREDIT_CODE_LENGTH, ENTERPRISE_LEGAL_REPRESENTATIVE_MAX_LENGTH, ENTERPRISE_NAME_MAX_LENGTH, NEW_ENTERPRISE_CREATE_PATH, getEnterpriseCertification, getEnterpriseCertificationErrorMessage, normalizeEnterpriseCreditCode, submitEnterpriseCertification, validateEnterpriseCertificationForm, type EnterpriseApplicantType, type EnterpriseCertification, type EnterpriseCertificationFormInput, type EnterpriseCertificationValidationErrors, type SubmitEnterpriseCertificationRequest } from '@/api/enterprise-certification'
import { getUserApiKeyErrorMessage, getUserApiKeys, createUserApiKey, updateUserApiKey, enableUserApiKey, disableUserApiKey, revokeUserApiKey, type ApiKeyScope, type ApiKeyStatusFilter, type CreatedUserApiKey, type UserApiKey, type UserApiKeyContext, type UserApiKeyList, type UserApiKeyMutation } from '@/api/user-api-keys'
import { isAuthenticationFailure } from '@/api/http'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'
import { apiTimeToISOString, formatApiTime, type ApiTimeValue } from '@/utils/format'

type ApiKeyExpiryPreset = 'never' | '30days' | '90days' | '365days' | 'current'

type ApiKeyFormState = {
  name: string
  tagsText: string
  expiresAt: string | null
  scope: ApiKeyScope
  modelIds: string[]
  billingSource: 'balance' | 'subscription'
  limitsEnabled: boolean
  costLimitYuan: string
  rpm: string
  tpm: string
  concurrency: string
}

type ApiKeyAction = {
  type: 'enable' | 'disable' | 'delete'
  key: UserApiKey
}

const API_KEY_DAY_MS = 24 * 60 * 60 * 1000
const API_KEY_USAGE_PERCENT_MIN = 0
const API_KEY_USAGE_PERCENT_MAX = 100
const API_KEY_USAGE_WARNING_THRESHOLD = 80
const USER_API_KEY_RECORDS_PATH = '/console/records'

function userApiKeyRecordsHref(keyId: string): string {
  return `${USER_API_KEY_RECORDS_PATH}?keyId=${encodeURIComponent(keyId)}`
}

function emptyApiKeyForm(): ApiKeyFormState {
  return { name: '', tagsText: '', expiresAt: null, scope: 'all', modelIds: [], billingSource: 'balance', limitsEnabled: true, costLimitYuan: '', rpm: '', tpm: '', concurrency: '' }
}

function apiDateLabel(value: ApiTimeValue | null): string {
  return formatApiTime(value)
}

function yuanLabel(value: string | null): ReactNode {
  if (!value) return '--'
  return <MoneyText value={value} />
}

function numberLabel(value: number | null): string {
  return value === null || value === undefined ? '--' : value.toLocaleString(getActiveLocale())
}

// 中文：用户只通过模型名称、厂商和别名识别模型，内部模型 id 只用于提交权限关联。
function apiKeyModelLabel(model: { id: string; name: string; company: string; alias?: string }, t: TFunction): string {
  return t('console.playground.modelWithProvider', { name: model.name || t('console.playground.unnamedModel'), company: model.company || t('console.common.platformModel'), alias: modelAlias(model) || t('console.common.modelAliasUnset') })
}

export function ApiKeysPage() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const store = useAppStore()
  const [modalVisible, setModalVisible] = useState(false)
  const [editingKey, setEditingKey] = useState<UserApiKey | null>(null)
  const [form, setForm] = useState<ApiKeyFormState>(emptyApiKeyForm)
  const [expiryPreset, setExpiryPreset] = useState<ApiKeyExpiryPreset>('never')
  const [modelSearch, setModelSearch] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [filter, setFilter] = useState<ApiKeyStatusFilter>('all')
  const [result, setResult] = useState<UserApiKeyList | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [action, setAction] = useState<ApiKeyAction | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const workspaceContext = useMemo<UserApiKeyContext>(() => store.activeWorkspace.type === 'enterprise'
    ? { account_type: 'enterprise', enterprise_id: store.activeWorkspace.id }
    : { account_type: 'personal' }, [store.activeWorkspace.id, store.activeWorkspace.type])
  const workspaceKey = `${workspaceContext.account_type}:${workspaceContext.account_type === 'enterprise' ? workspaceContext.enterprise_id : 'personal'}`

  useEffect(() => {
    setResult(null)
    setEditingKey(null)
    setAction(null)
    setModalVisible(false)
    setActionLoading(false)
  }, [workspaceKey])

  useEffect(() => {
    let active = true
    setLoading(true)
    setErrorMessage('')
    getUserApiKeys(workspaceContext, filter).then((value) => {
      if (active) setResult(value)
    }).catch((error: unknown) => {
      if (!active) return
      if (isAuthenticationFailure(error)) {
        dispatch(invalidateAuth())
        navigate('/', { replace: true })
        return
      }
      const message = getUserApiKeyErrorMessage(error)
      setErrorMessage(message)
      Toast.error(message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [dispatch, filter, navigate, reloadToken, workspaceContext])

  function updateForm(patch: Partial<ApiKeyFormState>): void {
    setForm((previous) => ({ ...previous, ...patch }))
  }

  function openCreate(): void {
    setEditingKey(null)
    const requestedModelKey = searchParams.get('model')?.trim()
    const requestedModel = requestedModelKey ? (result?.available_models ?? []).find((model) => model.id === requestedModelKey || model.alias === requestedModelKey) : undefined
    setForm(requestedModel ? { ...emptyApiKeyForm(), scope: 'selected', modelIds: [requestedModel.id] } : emptyApiKeyForm())
    setExpiryPreset('never')
    setModelSearch('')
    setAdvancedOpen(false)
    setModalVisible(true)
  }

  function openEdit(key: UserApiKey): void {
    setEditingKey(key)
    setForm({
      name: key.name, tagsText: key.tags.join(', '), expiresAt: apiTimeToISOString(key.expires_at), scope: key.scope, modelIds: key.model_ids ?? [],
      billingSource: key.billing_source, limitsEnabled: key.limits.enabled, costLimitYuan: key.limits.cost_limit_yuan ?? '',
      rpm: key.limits.rpm === null ? '' : String(key.limits.rpm), tpm: key.limits.tpm === null ? '' : String(key.limits.tpm),
      concurrency: key.limits.concurrency === null ? '' : String(key.limits.concurrency),
    })
    setExpiryPreset(key.expires_at !== null ? 'current' : 'never')
    setModelSearch('')
    setAdvancedOpen(key.limits.cost_limit_yuan !== null || key.limits.rpm !== null || key.limits.tpm !== null || key.limits.concurrency !== null)
    setModalVisible(true)
  }

  function closeModal(): void {
    if (saving) return
    setModalVisible(false)
    setEditingKey(null)
  }

  function selectExpiry(value: string): void {
    if (value === 'never') {
      setExpiryPreset('never')
      updateForm({ expiresAt: null })
      return
    }
    // 中文：编辑时允许恢复到打开表单时的原始到期日。
    if (value === 'current') {
      setExpiryPreset('current')
      updateForm({ expiresAt: apiTimeToISOString(editingKey?.expires_at) })
      return
    }
    const days = value === '30days' ? 30 : value === '90days' ? 90 : value === '365days' ? 365 : 0
    if (days > 0) {
      setExpiryPreset(value as ApiKeyExpiryPreset)
      updateForm({ expiresAt: new Date(Date.now() + days * API_KEY_DAY_MS).toISOString() })
    }
  }

  function buildMutation(): UserApiKeyMutation | null {
    const name = form.name.trim()
    if (!name) { Toast.warning(t('console.account.keyNameRequired')); return null }
    if (Array.from(name).length > 32) { Toast.warning(t('console.account.keyNameTooLong')); return null }
    const tags = form.tagsText.split(/[,，\n]/).map((tag) => tag.trim()).filter(Boolean)
    if (tags.length > 16 || Array.from(tags.join(',')).length > 120 || tags.some((tag) => Array.from(tag).length > 32)) {
      Toast.warning(t('console.account.tagsInvalid')); return null
    }
    if (form.scope === 'selected' && form.modelIds.length === 0) { Toast.warning(t('console.account.modelRequired')); return null }
    const parseLimit = (value: string): number | null => {
      if (!value.trim()) return null
      const parsed = Number(value)
      return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN
    }
    const rpm = form.limitsEnabled ? parseLimit(form.rpm) : null
    const tpm = form.limitsEnabled ? parseLimit(form.tpm) : null
    const concurrency = form.limitsEnabled ? parseLimit(form.concurrency) : null
    if ([rpm, tpm, concurrency].some((value) => Number.isNaN(value))) { Toast.warning(t('console.account.limitInvalid')); return null }
    const cost = form.limitsEnabled ? form.costLimitYuan.trim() : ''
    if (cost && (!/^[0-9]{1,12}(\.[0-9]{1,9})?$/.test(cost) || Number(cost) <= 0)) { Toast.warning(t('console.account.costInvalid')); return null }
    return {
      name, tags, expires_at: form.expiresAt, scope: form.scope, model_ids: form.scope === 'all' ? [] : form.modelIds,
      billing_source: form.billingSource, limits_enabled: form.limitsEnabled, cost_limit_yuan: cost || null,
      rpm, tpm, concurrency,
    }
  }

  async function saveKey(): Promise<void> {
    const input = buildMutation()
    if (!input || saving) return
    setSaving(true)
    try {
      if (editingKey) {
        const updated = await updateUserApiKey(workspaceContext, editingKey.id, input)
        setResult((previous) => previous ? { ...previous, items: previous.items.map((item) => item.id === updated.id ? updated : item) } : previous)
        // 中文：保存成功后直接关闭，避免 saving 状态拦截 closeModal。
        setModalVisible(false)
        setEditingKey(null)
        Toast.success(t('console.account.updateSuccess'))
      } else {
        const created: CreatedUserApiKey = await createUserApiKey(workspaceContext, input)
        setResult((previous) => previous ? { ...previous, items: [created.item, ...previous.items] } : previous)
        setModalVisible(false)
        setEditingKey(null)
        Toast.success(t('console.account.createSuccess'))
      }
    } catch (error: unknown) {
      if (isAuthenticationFailure(error)) {
        dispatch(invalidateAuth())
        navigate('/', { replace: true })
      } else {
        Toast.error(getUserApiKeyErrorMessage(error))
      }
    } finally {
      setSaving(false)
    }
  }

  async function runAction(): Promise<void> {
    if (!action || actionLoading) return
    setActionLoading(true)
    try {
      if (action.type === 'delete') {
        await revokeUserApiKey(workspaceContext, action.key.id)
        setResult((previous) => previous ? { ...previous, items: previous.items.filter((item) => item.id !== action.key.id) } : previous)
        Toast.success(t('console.account.deleteSuccess'))
      } else {
        const updated = action.type === 'enable' ? await enableUserApiKey(workspaceContext, action.key.id) : await disableUserApiKey(workspaceContext, action.key.id)
        setResult((previous) => previous ? { ...previous, items: previous.items.map((item) => item.id === updated.id ? updated : item) } : previous)
        Toast.success(action.type === 'enable' ? t('console.account.enabledSuccess') : t('console.account.disabledSuccess'))
      }
      setAction(null)
    } catch (error: unknown) {
      if (isAuthenticationFailure(error)) {
        dispatch(invalidateAuth())
        navigate('/', { replace: true })
      } else {
        Toast.error(getUserApiKeyErrorMessage(error))
      }
    } finally {
      setActionLoading(false)
    }
  }

  async function copyText(value: string, message: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value)
      Toast.success(message)
    } catch {
      Toast.error(t('console.common.copyFailed'))
    }
  }

  function copyApiKey(key: UserApiKey): void {
    if (!key.secret) {
      Toast.error(t('console.account.alreadyHasCopy'))
      return
    }
    void copyText(key.secret, t('console.account.copiedKey'))
  }

  const items = result?.items ?? []
  const rows = items.filter((item) => filter === 'all' || item.status === filter)
  const availableModels = result?.available_models ?? []
  const filteredModels = availableModels.filter((model) => apiKeyModelLabel(model, t).toLocaleLowerCase().includes(modelSearch.trim().toLocaleLowerCase()))
  const availableModelsLoading = loading && result === null
  const workspaceLabel = store.activeWorkspace.type === 'enterprise' ? store.activeWorkspace.name : t('console.common.personalWorkspace')

  return (
    <div className="page-stack api-keys-console-page">
      <PageTitle
        title={t('console.account.apiKeysTitle')}
        description={t('console.account.apiKeysDescription')}
        actions={<><div className="status-filters" role="group" aria-label={t('console.account.modelScopeFilter')}>{(['all', 'active', 'disabled'] as const).map((key) => <button type="button" className={'status-filter-btn' + (filter === key ? ' active' : '')} aria-pressed={filter === key} key={key} onClick={() => setFilter(key)}>{key === 'all' ? t('console.account.all') : key === 'active' ? t('console.account.enable') : t('console.account.disabled')}</button>)}</div><Button theme="solid" type="primary" icon={<IconPlus />} onClick={openCreate}>{t('console.account.create')}</Button></>}
      />
      {errorMessage ? <BannerNotice tone="warning"><span>{errorMessage}</span><Button theme="borderless" size="small" onClick={() => setReloadToken((value) => value + 1)}>{t('console.common.reload')}</Button></BannerNotice> : null}
      {loading ? <div className="api-keys-loading" role="status"><span className="api-keys-loading-spinner" />{t('console.account.noKeysLoading')}</div> : rows.length === 0 ? <EmptyPanel title={t('console.account.noKeys')} description={t('console.account.noKeysHint')} action={<Button theme="solid" type="primary" icon={<IconPlus />} onClick={openCreate}>{t('console.account.create')}</Button>} /> : <div className="source-table-scroll" role="region" aria-label={t('console.account.tableRegion')} tabIndex={0}><table className="api-keys-table"><thead><tr><th>{t('console.account.name')}</th><th>{t('console.account.key')}</th><th>{t('console.account.createdBy')}</th><th>{t('console.account.limits')}</th><th>{t('console.account.usageLimit')}</th><th>{t('console.account.availableModels')}</th><th>{t('console.common.status')}</th><th>{t('console.account.tags')}</th><th>{t('console.account.createdTime')}</th><th>{t('console.account.lastUsed')}</th><th>{t('console.account.activity')}</th><th>{t('console.account.operation')}</th></tr></thead><tbody>{rows.map((row) => {
        const limit = row.limits.cost_limit_yuan ? Number(row.limits.cost_limit_yuan) : 0
        const used = Number(row.limits.used_amount_yuan || 0)
        const progress = limit > 0 && Number.isFinite(used) ? Math.min(API_KEY_USAGE_PERCENT_MAX, Math.max(API_KEY_USAGE_PERCENT_MIN, used / limit * API_KEY_USAGE_PERCENT_MAX)) : API_KEY_USAGE_PERCENT_MIN
        const progressClass = progress >= API_KEY_USAGE_PERCENT_MAX ? 'full' : progress >= API_KEY_USAGE_WARNING_THRESHOLD ? 'warn' : ''
        const modelLabels = row.scope === 'all' ? [t('console.account.allModelsTag')] : row.models.length ? row.models.map((model) => apiKeyModelLabel(model, t)) : [t('console.account.notSelected')]
        return <tr key={row.id}><td className="api-key-name-cell"><div className="key-name-cell"><strong title={row.name}>{row.name}</strong><span className="cell-secondary">{workspaceLabel}</span></div></td><td><span className="key-masked">{row.masked_key}<button type="button" className="copy-btn" title={t(row.secret ? 'console.account.copyFullKey' : 'console.account.notAvailable')} aria-label={t(row.secret ? 'console.account.copyFullKey' : 'console.account.notAvailable')} disabled={!row.secret} onClick={() => copyApiKey(row)}><IconCopy /></button></span></td><td><div className="creator-cell"><span className="creator-avatar" aria-hidden="true">{(row.creator.display_name || '?').slice(0, 1)}</span><span className="creator-copy"><strong>{row.creator.display_name || t('console.account.unknownUser')}</strong><span className="cell-secondary">{row.creator.masked_phone || t('console.account.phoneUnbound')}</span></span></div></td><td className="limit-cell">{row.limits.enabled === false ? <span className="table-muted">{t('console.account.limitClosed')}</span> : <div className="metric-stack"><span className="metric-line"><strong>RPM</strong>{numberLabel(row.limits.rpm)}</span><span className="metric-line"><strong>TPM</strong>{numberLabel(row.limits.tpm)}</span><span className="metric-line"><strong>{t('console.account.costLimit')}</strong>{yuanLabel(row.limits.cost_limit_yuan)}</span></div>}</td><td><div className="usage-cell"><span><span className="usage-value">{yuanLabel(row.limits.used_amount_yuan)}</span> <span className="cell-secondary">/ {yuanLabel(row.limits.cost_limit_yuan)}</span></span>{row.limits.cost_limit_yuan ? <div className="usage-bar" aria-label={t('console.account.usedPercent', { percent: Math.round(progress) })}><div className={'usage-bar-fill ' + progressClass} style={{ width: String(progress) + '%' }} /></div> : null}</div></td><td className="model-cell"><div className="model-tags">{modelLabels.slice(0, 2).map((label) => <span className="model-tag" title={label} key={label}>{label}</span>)}{modelLabels.length > 2 ? <span className="model-tag">+{modelLabels.length - 2}</span> : null}</div></td><td><span className={'api-key-status-badge ' + row.status}>{row.status === 'active' ? t('console.account.enable') : row.status === 'disabled' ? t('console.account.disabled') : t('console.account.expired')}</span></td><td className="tag-cell">{row.tags.length ? <div className="tag-list">{row.tags.map((tag) => <span className="model-tag" title={tag} key={tag}>{tag}</span>)}</div> : <span className="table-muted">--</span>}</td><td>{apiDateLabel(row.created_at)}</td><td>{apiDateLabel(row.last_used_at)}</td><td><Link className="activity-link" to={userApiKeyRecordsHref(row.id)} title={t('console.account.viewRecords')}>{t('console.common.details')}<IconArrowRight aria-hidden="true" /></Link></td><td><div className="action-buttons"><button className="table-icon-action" type="button" aria-label={t('console.account.edit')} title={t('console.account.edit')} onClick={() => openEdit(row)}><IconEditStroked /></button>{row.status === 'expired' ? null : row.status === 'active' ? <button className="table-icon-action" type="button" aria-label={t('console.account.disableTitle')} title={t('console.account.disableTitle')} onClick={() => setAction({ type: 'disable', key: row })}><IconMinusCircleStroked /></button> : <button className="table-icon-action" type="button" aria-label={t('console.account.enableTitle')} title={t('console.account.enableTitle')} onClick={() => setAction({ type: 'enable', key: row })}><IconPlusCircleStroked /></button>}<button className="table-icon-action danger" type="button" aria-label={t('console.account.delete')} title={t('console.account.delete')} onClick={() => setAction({ type: 'delete', key: row })}><IconDeleteStroked /></button></div></td></tr>
      })}</tbody></table></div>}
      <Modal title={editingKey ? t('console.account.edit') : t('console.account.create')} visible={modalVisible} onCancel={closeModal} onOk={() => { void saveKey() }} okText={editingKey ? t('console.account.saveChanges') : t('console.account.createKeyAction')} cancelText={t('console.common.cancel')} okButtonProps={{ loading: saving, disabled: saving }}><div className="modal-form api-key-modal-form"><BannerNotice tone="info"><span>{t('console.account.secureHint')}</span></BannerNotice>{availableModelsLoading ? <BannerNotice tone="info">{t('console.account.visibleModelsLoading')}</BannerNotice> : null}<div className="api-key-form-field"><label className="field-label" htmlFor="key-name">{t('console.account.keyName')}</label><Input id="key-name" value={form.name} onChange={(value) => updateForm({ name: value })} placeholder={t('console.account.keyNamePlaceholder')} maxLength={32} showClear /><span className="api-key-field-hint">{Array.from(form.name).length}/32</span></div><div className="api-key-form-field"><label className="field-label" htmlFor="key-tags">{t('console.account.tags')} <small>（{t('console.account.optional')}）</small></label><Input id="key-tags" value={form.tagsText} onChange={(value) => updateForm({ tagsText: value })} placeholder={t('console.account.tagsPlaceholder')} maxLength={120} /><span className="api-key-field-hint">{t('console.account.tagsHint')}</span></div><div className="api-key-form-field"><label className="field-label" htmlFor="key-expiry">{t('console.account.validity')}</label><Select id="key-expiry" value={expiryPreset} onChange={(value) => selectExpiry(String(value))} block>{editingKey ? <Select.Option value="current">{t('console.account.keepExpiry')}</Select.Option> : null}<Select.Option value="never">{t('console.account.forever')}</Select.Option><Select.Option value="30days">{t('console.account.days30')}</Select.Option><Select.Option value="90days">{t('console.account.days90')}</Select.Option><Select.Option value="365days">{t('console.account.year1')}</Select.Option></Select><span className="api-key-field-hint">{t('console.account.expiryHint')}</span></div><fieldset className="api-key-form-field api-key-fieldset"><legend className="field-label">{t('console.account.keyScope')}</legend><div className="api-key-scope-options"><label className="api-key-scope-radio"><input type="radio" name="api-key-scope" value="all" checked={form.scope === 'all'} onChange={() => updateForm({ scope: 'all', modelIds: [] })} /><span>{t('console.account.currentEnabledModels')}</span></label><label className="api-key-scope-radio"><input type="radio" name="api-key-scope" value="selected" checked={form.scope === 'selected'} onChange={() => updateForm({ scope: 'selected' })} /><span>{t('console.account.selectedModel')}</span></label></div>{form.scope === 'selected' ? <div className="api-key-model-picker"><div className="api-key-model-picker-toolbar"><Input className="api-key-model-search" value={modelSearch} onChange={setModelSearch} placeholder={t('console.account.searchModel')} aria-label={t('console.account.searchModel')} /><span>{t('console.account.selectedCount', { count: form.modelIds.length })}</span></div><div className="api-key-model-list">{filteredModels.length ? filteredModels.map((model) => <label className="api-key-model-option" key={model.id}><input type="checkbox" checked={form.modelIds.includes(model.id)} onChange={(event) => updateForm({ modelIds: event.target.checked ? [...form.modelIds, model.id] : form.modelIds.filter((id) => id !== model.id) })} /><span>{apiKeyModelLabel(model, t)}</span></label>) : <span className="api-key-model-empty">{t('console.account.noMatchingModels')}</span>}</div></div> : null}<span className="api-key-field-hint">{t('console.account.modelScopeHint')}</span></fieldset><fieldset className="api-key-form-field api-key-fieldset" aria-describedby="billing-source-hint"><legend className="field-label">{t('console.account.expenseSource')}</legend><div className="billing-source-options"><label className="billing-source-option"><input type="radio" name="api-key-billing-source" value="balance" checked={form.billingSource === 'balance'} onChange={() => updateForm({ billingSource: 'balance' })} /><span>{t('console.account.balanceExpense')}</span></label><label className="billing-source-option"><input type="radio" name="api-key-billing-source" value="subscription" checked={form.billingSource === 'subscription'} onChange={() => updateForm({ billingSource: 'subscription' })} /><span>{t('console.account.subscriptionExpense')}</span></label></div><span className="api-key-field-hint" id="billing-source-hint">{t('console.account.billingHint')}</span></fieldset><div className="api-key-form-field"><label className="api-key-switch-row"><span><strong>{t('console.account.enableLimits')}</strong><small>{t('console.account.enableLimitsHint')}</small></span><Switch checked={form.limitsEnabled} onChange={(checked) => updateForm({ limitsEnabled: checked })} aria-label={t('console.account.enableLimits')} /></label></div><button className="api-key-advanced-toggle" type="button" aria-expanded={advancedOpen} aria-controls="api-key-advanced-fields" onClick={() => setAdvancedOpen((value) => !value)}><span className="api-key-expand-caret" aria-hidden="true">▶</span><span>{t('console.account.advanced')}</span></button><div id="api-key-advanced-fields" className="api-key-advanced-fields">{advancedOpen ? form.limitsEnabled ? <div className="api-key-advanced-settings"><div className="api-key-form-field"><div className="api-key-limit-field-head"><label className="field-label" htmlFor="key-cost-limit">{t('console.account.cumulativeLimit')} <small>（{t('console.account.optional')}）</small></label><span>{t('console.account.unsetAccountBalance')}</span></div><div className="api-key-input-with-prefix"><span>¥</span><Input id="key-cost-limit" value={form.costLimitYuan} onChange={(value) => updateForm({ costLimitYuan: value })} placeholder={t('console.account.costLimitPlaceholder')} inputMode="decimal" /></div><span className="api-key-field-hint">{t('console.account.costLimitHint')}</span></div><div className="api-key-form-field"><label className="field-label">{t('console.account.rateLimit')} <small>（{t('console.account.optional')}）</small></label><div className="api-key-limit-grid"><label><span>{t('console.account.concurrency')}</span><Input id="key-concurrency" value={form.concurrency} onChange={(value) => updateForm({ concurrency: value.replace(/\D/g, '') })} placeholder={t('console.account.unlimited')} inputMode="numeric" /></label><label><span>RPM</span><Input id="key-rpm" value={form.rpm} onChange={(value) => updateForm({ rpm: value.replace(/\D/g, '') })} placeholder={t('console.account.unlimited')} inputMode="numeric" /></label><label><span>TPM</span><Input id="key-tpm" value={form.tpm} onChange={(value) => updateForm({ tpm: value.replace(/\D/g, '') })} placeholder={t('console.account.unlimited')} inputMode="numeric" /></label></div><span className="api-key-field-hint">{t('console.account.rateLimitHint')}</span></div></div> : <span className="api-key-field-hint api-key-limit-disabled-hint">{t('console.account.limitsDisabledHint')}</span> : null}</div></div></Modal>
      <Modal key={action?.type ?? 'closed'} title={action?.type === 'delete' ? t('console.account.deleteTitle') : action?.type === 'disable' ? t('console.account.disableTitle') : t('console.account.enableTitle')} visible={action !== null} onCancel={() => { if (!actionLoading) setAction(null) }} onOk={() => { void runAction() }} okText={action?.type === 'delete' ? t('console.account.confirmDelete') : action?.type === 'disable' ? t('console.account.confirmDisable') : t('console.account.confirmEnable')} cancelText={t('console.common.cancel')} okButtonProps={{ loading: actionLoading, disabled: actionLoading }}><p className="api-key-confirm-copy">{action?.type === 'delete' ? t('console.account.deleteHint', { name: action.key.name }) : action?.type === 'disable' ? t('console.account.disableHint', { name: action.key.name }) : t('console.account.enableHint', { name: action?.key.name })}</p></Modal>
    </div>
  )
}

export { RecordsPage } from './records'

export { BillingPage } from './billing'

export function SettingsPage() {
  const { t } = useTranslation()
  const store = useAppStore()
  const [nickname, setNickname] = useState(store.nickname)
  const [lowBalance, setLowBalance] = useState(true)
  const [invitations, setInvitations] = useState(true)
  const [productUpdates, setProductUpdates] = useState(false)
  const [deleteVisible, setDeleteVisible] = useState(false)
  function saveProfile(): void {
    const next = nickname.trim()
    if (!next) { Toast.warning(t('profile.personal.emptyName')); return }
    store.updateProfile({ nickname: next, phone: store.phone, avatar: next.slice(0, 1).toUpperCase() })
    Toast.success(t('profile.personal.saved'))
  }
  return <div className="page-stack settings-console-page"><PageTitle title={t('profile.title')} description={t('profile.description')} /><div className="settings-page-inner"><section className="settings-section"><div className="settings-section-head"><h2>{t('profile.personal.title')}</h2><p>{t('profile.personal.description')}</p><p className="settings-hint">{t('profile.personal.dataHint')}</p></div><div className="settings-form"><div className="settings-row"><span className="settings-label">{t('profile.personal.avatar')}</span><div className="settings-control"><div className="settings-avatar">{store.avatar}</div><p className="settings-hint">{t('profile.personal.avatarHint')}</p></div></div><div className="settings-row"><label className="settings-label" htmlFor="nickname">{t('profile.personal.nickname')}</label><div className="settings-control"><Input id="nickname" value={nickname} onChange={setNickname} maxLength={20} /><p className="settings-hint">{t('profile.personal.nicknameHint', { count: 20 })}</p></div></div><div className="settings-row"><span className="settings-label">{t('profile.contact.phone')}</span><div className="settings-control"><div className="settings-inline"><span className="settings-readonly">{store.phone}</span><Button theme="outline" size="small" onClick={() => Toast.info(t('profile.personal.phoneHint'))}>{t('profile.contact.changePhone')}</Button></div><p className="settings-hint">{t('profile.personal.phoneHint')}</p></div></div><div className="settings-row"><span className="settings-label">{t('profile.contact.email')}</span><div className="settings-control"><div className="settings-inline"><span className="settings-readonly">{t('profile.contact.unboundEmail')}</span><Button theme="outline" size="small" onClick={() => Toast.info(t('profile.personal.emailHint'))}>{t('profile.contact.bindEmail')}</Button></div><p className="settings-hint">{t('profile.personal.emailHint')}</p></div></div><div className="settings-row"><span className="settings-label">{t('profile.overview.id')}</span><div className="settings-control"><div className="settings-inline"><code className="settings-readonly">usr_han_001</code><Button theme="outline" size="small" onClick={() => Toast.success(t('profile.overview.copied'))}>{t('profile.overview.copyShort')}</Button></div><p className="settings-hint">{t('profile.personal.userIdHint')}</p></div></div><div className="settings-row"><span /><div className="settings-actions"><Button theme="solid" type="primary" onClick={saveProfile}>{t('profile.personal.save')}</Button></div></div></div></section><section className="settings-section"><div className="settings-section-head"><h2>{t('profile.notifications.title')}</h2><p>{t('profile.notifications.description')}</p></div><div className="notification-list"><label className="notification-row"><span><strong>{t('profile.notifications.lowBalance')}</strong><small>{t('profile.notifications.lowBalanceDescription')}</small></span><Switch checked={lowBalance} onChange={setLowBalance} /></label><label className="notification-row"><span><strong>{t('profile.notifications.invitations')}</strong><small>{t('profile.notifications.invitationsDescription')}</small></span><Switch checked={invitations} onChange={setInvitations} /></label><label className="notification-row"><span><strong>{t('profile.notifications.productUpdates')}</strong><small>{t('profile.notifications.productUpdatesDescription')}</small></span><Switch checked={productUpdates} onChange={setProductUpdates} /></label></div></section><section className="settings-section"><div className="settings-section-head"><h2>{t('profile.workspace.title')}</h2><p>{t('profile.workspace.description')}</p></div><div className="workspace-list">{store.workspaces.map((workspace) => <div className="workspace-item" key={workspace.id}><div><strong>{workspace.name}</strong><small>{workspace.type === 'enterprise' ? t('profile.workspace.enterpriseType') : t('profile.workspace.personalType')}</small></div><span>{workspace.id === store.activeWorkspace.id ? t('profile.workspace.current') : workspace.role === 'owner' ? t('profile.workspace.owner') : workspace.role}</span></div>)}</div><Button theme="outline" onClick={() => window.location.assign(NEW_ENTERPRISE_CREATE_PATH)}>{t('profile.workspace.create')}</Button><p className="settings-hint">{t('profile.workspace.createHint')}</p></section><section className="settings-section settings-security-section"><div className="settings-section-head"><h2>{t('profile.security.title')}</h2><p>{t('profile.security.description')}</p></div><div className="settings-actions"><Button theme="outline" type="danger" onClick={() => setDeleteVisible(true)}>{t('profile.security.deactivate')}</Button><span className="settings-hint">{t('profile.security.deactivateHint')}</span></div></section></div><Modal title={t('profile.security.dialogTitle')} visible={deleteVisible} onCancel={() => setDeleteVisible(false)} onOk={() => { setDeleteVisible(false); Toast.warning(t('profile.security.dialogPending')) }} okText={t('profile.security.dialogContinue')} cancelText={t('profile.security.dialogCancel')}><p>{t('profile.security.dialogDescription')}</p></Modal></div>
}

export function InvitationsPage() {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const inviteLink = 'https://tokennx.invalid/invite/usr_han_001'
  function copyLink(): void { navigator.clipboard.writeText(inviteLink).then(() => { setCopied(true); Toast.success(t('console.invitations.copied')); window.setTimeout(() => setCopied(false), 1500) }).catch(() => Toast.error(t('console.common.copyFailed'))) }
  return <div className="invite-page"><header className="invite-hero"><span className="invite-hero-icon"><IconGift /></span><div><h1>{t('console.invitations.title')}</h1><p>{t('console.invitations.description')}</p></div></header><section className="invite-summary"><article><IconCreditCard /><span>{t('console.invitations.pending')}</span><strong><MoneyText value="12.800000" /></strong></article><article><IconBarChartHStroked /><span>{t('console.invitations.total')}</span><strong><MoneyText value="36.500000" /></strong></article><article><IconUserGroup /><span>{t('console.invitations.count')}</span><strong>3</strong></article></section><section className="invite-link-card"><div className="invite-section-heading"><span className="invite-section-icon"><IconKey /></span><div><h2>{t('console.invitations.link')}</h2><p>{t('console.invitations.linkHint')}</p></div></div><div className="invite-link-row"><Input value={inviteLink} readOnly /><Button theme="solid" type="primary" icon={<IconCopy />} onClick={copyLink}>{copied ? t('console.invitations.copied') : t('console.invitations.copy')}</Button></div></section><section className="invite-records"><div className="invite-section-heading"><div><h2>{t('console.invitations.records')}</h2><p>{t('console.invitations.recordsHint')}</p></div></div><div className="source-table-scroll"><table className="invite-table"><thead><tr><th>{t('console.invitations.member')}</th><th>{t('console.invitations.role')}</th><th>{t('console.invitations.status')}</th><th>{t('console.invitations.joinedAt')}</th><th>{t('console.invitations.operation')}</th></tr></thead><tbody>{[['林舟', 'lin***@demo.invalid', '2026/07/15 16:42:18'], ['周然', 'zhou***@demo.invalid', '2026/07/13 11:08:36'], ['陈屿', 'chen***@demo.invalid', '2026/07/10 09:25:04']].map(([name, email, time]) => <tr key={name}><td><strong>{name}</strong><small>{email}</small></td><td><em>{t('console.invitations.developer')}</em></td><td><span className="invite-status">{t('console.invitations.joined')}</span></td><td>{time}</td><td>{t('console.invitations.noAction')}</td></tr>)}</tbody></table></div></section><section className="invite-rules"><h2>{t('console.invitations.rules')}</h2><ol><li>{t('console.invitations.ruleSource')}</li><li>{t('console.invitations.ruleStatus')}</li><li>{t('console.invitations.ruleSettlement')}</li></ol></section></div>
}

export function EnterpriseCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const dispatch = useAppDispatch()
  const { replaceEnterpriseWorkspaces } = useAppStore()
  const isNewApplication = searchParams.get('mode') === 'new'
  const [certification, setCertification] = useState<EnterpriseCertification | null>(null)
  const [enterpriseName, setEnterpriseName] = useState('')
  const [creditCode, setCreditCode] = useState('')
  const [legalRepresentative, setLegalRepresentative] = useState('')
  const [applicantType, setApplicantType] = useState<EnterpriseApplicantType>('legal_representative')
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<EnterpriseCertificationValidationErrors>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [workspaceRefreshError, setWorkspaceRefreshError] = useState('')
  const [newApplicationSubmitted, setNewApplicationSubmitted] = useState(false)

  const invalidateSession = useCallback((): void => {
    dispatch(invalidateAuth())
    navigate('/', { replace: true })
  }, [dispatch, navigate])

  const loadCertification = useCallback(async (): Promise<void> => {
    const accessToken = getAccessToken()
    if (!accessToken) {
      invalidateSession()
      setLoading(false)
      return
    }
    if (isNewApplication) {
      setCertification(null)
      setErrorMessage('')
      setWorkspaceRefreshError('')
      setLoading(false)
      return
    }
    setLoading(true)
    setErrorMessage('')
    try {
      setCertification(await getEnterpriseCertification(accessToken))
    } catch (requestError: unknown) {
      if (isAuthenticationFailure(requestError)) {
        invalidateSession()
      } else {
        setErrorMessage(getEnterpriseCertificationErrorMessage(requestError))
      }
    } finally {
      setLoading(false)
    }
  }, [invalidateSession, isNewApplication])

  const refreshEnterpriseWorkspaces = useCallback(async (accessToken: string): Promise<void> => {
    setWorkspaceRefreshError('')
    try {
      const memberships = await getProfileEnterprises(getAccessToken() ?? accessToken)
      replaceEnterpriseWorkspaces(workspacesFromMemberships(memberships))
    } catch (requestError: unknown) {
      if (isAuthenticationFailure(requestError)) {
        invalidateSession()
        return
      }
      setWorkspaceRefreshError(t('console.enterpriseCreate.workspaceRefreshError'))
    }
  }, [invalidateSession, replaceEnterpriseWorkspaces, t])

  useEffect(() => {
    if (!isNewApplication) return
    setCertification(null)
    setEnterpriseName('')
    setCreditCode('')
    setLegalRepresentative('')
    setApplicantType('legal_representative')
    setConsent(false)
    setErrors({})
    setNewApplicationSubmitted(false)
  }, [isNewApplication])

  const visibleCertification = isNewApplication && !newApplicationSubmitted ? null : certification

  useEffect(() => {
    void loadCertification()
  }, [loadCertification])

  useEffect(() => {
    if (visibleCertification?.status !== 'approved') return
    const accessToken = getAccessToken()
    if (!accessToken) {
      invalidateSession()
      return
    }
    void refreshEnterpriseWorkspaces(accessToken)
  }, [invalidateSession, refreshEnterpriseWorkspaces, visibleCertification])

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const input: EnterpriseCertificationFormInput = { enterpriseName, creditCode, legalRepresentative, applicantType, consent }
    const nextErrors = validateEnterpriseCertificationForm(input)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    const accessToken = getAccessToken()
    if (!accessToken) {
      invalidateSession()
      return
    }
    const request: SubmitEnterpriseCertificationRequest = {
      enterprise_name: enterpriseName.trim(),
      credit_code: normalizeEnterpriseCreditCode(creditCode),
      legal_representative: legalRepresentative.trim(),
      applicant_type: applicantType,
      consent,
    }
    setSubmitting(true)
    setErrorMessage('')
    void submitEnterpriseCertification(accessToken, request).then((result) => {
      if (isNewApplication) setNewApplicationSubmitted(true)
      setCertification(result)
    }).catch((requestError: unknown) => {
      if (isAuthenticationFailure(requestError)) {
        invalidateSession()
        return
      }
      setErrorMessage(getEnterpriseCertificationErrorMessage(requestError))
    }).finally(() => {
      setSubmitting(false)
    })
  }

  if (loading && !visibleCertification) {
    return <div className="page-stack enterprise-create-page"><PageTitle title={t('console.enterpriseCreate.title')} description={t('console.enterpriseCreate.description')} /><div className="profile-state-panel" role="status">{t('console.enterpriseCreate.loading')}</div></div>
  }

  const approved = visibleCertification?.status === 'approved'
  const showForm = !visibleCertification || visibleCertification.status === 'unsubmitted' || visibleCertification.status === 'rejected' || visibleCertification.status === 'cancelled'
  return <div className="page-stack enterprise-create-page">
    <PageTitle title={t('console.enterpriseCreate.title')} description={t('console.enterpriseCreate.description')} />
    {errorMessage ? <BannerNotice tone="warning"><div className="profile-error-content"><span>{errorMessage}</span><Button theme="borderless" size="small" loading={loading} disabled={loading} onClick={() => { void loadCertification() }}>{t('console.enterpriseCreate.reload')}</Button></div></BannerNotice> : null}
    {!approved && visibleCertification?.status === 'rejected' ? <BannerNotice tone="warning">{t('console.enterpriseCreate.rejected')}</BannerNotice> : null}
    <div className="enterprise-create-layout">
      <Card className="enterprise-create-card">
        <span className="eyebrow">{t('console.enterpriseCreate.eyebrow')}</span>
        {approved ? <>
          <h2>{t('console.enterpriseCreate.approvedTitle')}</h2>
          <p>{t('console.enterpriseCreate.approvedHint')}</p>
          {workspaceRefreshError ? <BannerNotice tone="warning">{workspaceRefreshError}</BannerNotice> : null}
          <div className="real-name-status" aria-label={t('console.enterpriseCreate.resultLabel')}>
            <div className="real-name-status-row"><span>{t('console.enterpriseCreate.enterpriseName')}</span><strong>{visibleCertification?.enterprise_name || t('console.enterpriseCreate.verifiedEnterprise')}</strong></div>
            <div className="real-name-status-row"><span>{t('console.enterpriseCreate.creditCode')}</span><strong>{visibleCertification?.credit_code_masked || t('console.enterpriseCreate.protected')}</strong></div>
            <div className="real-name-status-row"><span>{t('console.enterpriseCreate.legalRepresentative')}</span><strong>{visibleCertification?.legal_representative_masked || t('console.enterpriseCreate.protected')}</strong></div>
            <div className="real-name-status-row"><span>{t('console.enterpriseCreate.applicantType')}</span><strong>{visibleCertification?.applicant_type === 'authorized_agent' ? t('console.enterpriseCreate.authorizedAgent') : t('console.enterpriseCreate.legalRepresentativeApplicant')}</strong></div>
            <div className="real-name-status-row"><span>{t('console.enterpriseCreate.workspace')}</span><strong>{t('console.enterpriseCreate.created')}</strong></div>
          </div>
        </> : showForm ? <>
          <h2>{t('console.enterpriseCreate.formTitle')}</h2>
          <p>{t('console.enterpriseCreate.formHint')}</p>
          <form className="real-name-form" onSubmit={submit} noValidate>
            <label className="real-name-field" htmlFor="enterprise-name">
              <span>{t('console.enterpriseCreate.enterpriseName')}</span>
              <Input id="enterprise-name" value={enterpriseName} onChange={(value) => { setEnterpriseName(value); setErrors((previous) => ({ ...previous, enterpriseName: undefined })) }} maxLength={ENTERPRISE_NAME_MAX_LENGTH} placeholder={t('console.enterpriseCreate.namePlaceholder')} aria-invalid={Boolean(errors.enterpriseName)} aria-describedby={errors.enterpriseName ? 'enterprise-name-error' : undefined} />
              {errors.enterpriseName ? <span className="profile-field-error" id="enterprise-name-error" role="alert">{errors.enterpriseName}</span> : null}
            </label>
            <label className="real-name-field" htmlFor="enterprise-credit-code">
              <span>{t('console.enterpriseCreate.creditCode')}</span>
              <Input id="enterprise-credit-code" value={creditCode} onChange={(value) => { setCreditCode(normalizeEnterpriseCreditCode(value)); setErrors((previous) => ({ ...previous, creditCode: undefined })) }} maxLength={ENTERPRISE_CREDIT_CODE_LENGTH} placeholder={t('console.enterpriseCreate.creditCodePlaceholder')} aria-invalid={Boolean(errors.creditCode)} aria-describedby={errors.creditCode ? 'enterprise-credit-code-error' : undefined} />
              {errors.creditCode ? <span className="profile-field-error" id="enterprise-credit-code-error" role="alert">{errors.creditCode}</span> : null}
            </label>
            <label className="real-name-field" htmlFor="enterprise-legal-representative">
              <span>{t('console.enterpriseCreate.legalRepresentative')}</span>
              <Input id="enterprise-legal-representative" value={legalRepresentative} onChange={(value) => { setLegalRepresentative(value); setErrors((previous) => ({ ...previous, legalRepresentative: undefined })) }} maxLength={ENTERPRISE_LEGAL_REPRESENTATIVE_MAX_LENGTH} placeholder={t('console.enterpriseCreate.legalRepresentativePlaceholder')} aria-invalid={Boolean(errors.legalRepresentative)} aria-describedby={errors.legalRepresentative ? 'enterprise-legal-representative-error' : undefined} />
              {errors.legalRepresentative ? <span className="profile-field-error" id="enterprise-legal-representative-error" role="alert">{errors.legalRepresentative}</span> : null}
            </label>
            <label className="real-name-field" htmlFor="enterprise-applicant-type">
              <span>{t('console.enterpriseCreate.applicantType')}</span>
              <select className="source-input real-name-select" id="enterprise-applicant-type" value={applicantType} onChange={(event) => { setApplicantType(event.target.value as EnterpriseApplicantType); setErrors((previous) => ({ ...previous, applicantType: undefined })) }} aria-invalid={Boolean(errors.applicantType)} aria-describedby={errors.applicantType ? 'enterprise-applicant-type-error' : undefined}>
                <option value="legal_representative">{t('console.enterpriseCreate.legalRepresentativeApplicant')}</option>
                <option value="authorized_agent">{t('console.enterpriseCreate.authorizedAgent')}</option>
              </select>
              {errors.applicantType ? <span className="profile-field-error" id="enterprise-applicant-type-error" role="alert">{errors.applicantType}</span> : null}
            </label>
            <label className="real-name-consent" htmlFor="enterprise-certification-consent">
              <input id="enterprise-certification-consent" type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); if (event.target.checked) setErrors((previous) => ({ ...previous, consent: undefined })) }} aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent ? 'enterprise-certification-consent-error' : undefined} />
              <span>{t('console.enterpriseCreate.consent')}</span>
            </label>
            {errors.consent ? <span className="profile-field-error" id="enterprise-certification-consent-error" role="alert">{errors.consent}</span> : null}
            <Button className="real-name-submit" htmlType="submit" theme="solid" type="primary" loading={submitting} disabled={submitting}>{t('console.enterpriseCreate.submit')}</Button>
          </form>
          <p className="real-name-demo-note">{t('console.enterpriseCreate.demoNote')}</p>
        </> : <>
          <h2>{t('console.enterpriseCreate.pendingTitle')}</h2>
          <p>{t('console.enterpriseCreate.pendingHint')}</p>
          <Button theme="outline" loading={loading} disabled={loading} onClick={() => { void loadCertification() }}>{t('console.enterpriseCreate.refreshStatus')}</Button>
        </>}
      </Card>
      <aside className="enterprise-create-aside">
        <h3>{t('console.enterpriseCreate.afterTitle')}</h3>
        <div><IconCheckCircleStroked /><span>{t('console.enterpriseCreate.afterWorkspace')}</span></div>
        <div><IconCheckCircleStroked /><span>{t('console.enterpriseCreate.afterOwner')}</span></div>
        <div><IconCheckCircleStroked /><span>{t('console.enterpriseCreate.afterMembers')}</span></div>
        <div><IconCheckCircleStroked /><span>{t('console.enterpriseCreate.afterResources')}</span></div>
        <Button theme="borderless" icon={<IconArrowRight />} onClick={() => navigate('/about')}>{t('console.enterpriseCreate.about')}</Button>
      </aside>
    </div>
  </div>
}

export function EnterpriseSettingsPage() {
  const { t } = useTranslation()
  return <div className="page-stack enterprise-settings-page"><PageTitle title={t('console.enterpriseSettings.title')} description={t('console.enterpriseSettings.description')} /><div className="enterprise-settings-wrap"><section className="enterprise-settings-section"><h2>{t('console.enterpriseSettings.profileTitle')}</h2><p>{t('console.enterpriseSettings.profileDescription')}</p><div className="enterprise-read-grid"><div><span>{t('console.enterpriseSettings.logo')}</span><strong className="ent-logo">N</strong></div><div><span>{t('console.enterpriseSettings.verifiedName')}</span><strong>NX Labs 智能科技（上海）有限公司</strong></div><div><span>{t('console.enterpriseSettings.creditCode')}</span><strong>91310000MA1FL0AB2C</strong></div><div><span>{t('console.enterpriseSettings.status')}</span><strong className="source-status-badge active">{t('console.enterpriseSettings.verified')}</strong></div><div><span>{t('console.enterpriseSettings.nature')}</span><strong>{t('console.enterpriseSettings.companyNature')}</strong></div><div><span>{t('console.enterpriseSettings.createdAt')}</span><strong>2026-05-08</strong></div></div><div className="enterprise-form-grid"><label>{t('console.enterpriseSettings.displayName')}<Input defaultValue="NX Labs" /></label><label>{t('console.enterpriseSettings.logoInput')}<Input defaultValue="N" /></label><label>{t('console.enterpriseSettings.contact')}<Input defaultValue="han" /></label><label>{t('console.enterpriseSettings.phone')}<Input defaultValue="138****8000" /></label></div><label className="enterprise-description-field">{t('console.enterpriseSettings.summary')}<Input.TextArea defaultValue={t('console.enterpriseSettings.summaryDefault')} rows={3} /></label><div className="settings-actions"><Button theme="outline" onClick={() => Toast.info(t('console.enterpriseSettings.changeCertificationHint'))}>{t('console.enterpriseSettings.changeCertification')}</Button><Button theme="solid" type="primary" onClick={() => Toast.success(t('console.enterpriseSettings.saved'))}>{t('console.enterpriseSettings.save')}</Button></div></section><section className="enterprise-settings-section"><h2>{t('console.enterpriseSettings.protectionTitle')}</h2><p>{t('console.enterpriseSettings.protectionIntro')}</p><p><span className="source-status-badge active">{t('console.enterpriseSettings.protectionEnabled')}</span></p><p>{t('console.enterpriseSettings.protectionDetails')}</p></section><section className="enterprise-settings-section"><h2>{t('console.enterpriseSettings.ownershipTitle')}</h2><p>{t('console.enterpriseSettings.ownershipHint')}</p><div className="owner-row"><span className="owner-avatar">{t('console.enterpriseSettings.ownerInitial')}</span><strong>{t('console.enterpriseSettings.ownerName')} <small>{t('console.enterpriseSettings.owner')}</small></strong></div><Button theme="outline" onClick={() => Toast.info(t('console.enterpriseSettings.transferHint'))}>{t('console.enterpriseSettings.transfer')}</Button></section></div></div>
}
