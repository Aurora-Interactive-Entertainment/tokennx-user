import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { BannerNotice } from '@/components/common'
import { AppPagination } from '@/components/app-pagination'
import { CompatSelect as Select } from '@/components/semi-compat'
import { getEnterpriseModels, updateEnterpriseModel, type EnterpriseContext, type EnterpriseModel, type EnterpriseModelPage } from '@/api/enterprise-console'
import { isApiError } from '@/api/http'
import { EnterpriseEmpty, EnterpriseError, EnterpriseLoading, EnterprisePageShell, EnterpriseRefreshButton, useEnterpriseErrorHandler, type EnterpriseRequestError } from './enterprise-console-shared'

const MODEL_PAGE_SIZES = [10, 20, 50, 100] as const
const MODEL_SEARCH_DEBOUNCE_MS = 260

const MODEL_MODALITY_OPTIONS = ['all', 'text', 'image', 'video', 'audio', 'embedding', 'rerank', 'multimodal'] as const

type ModelModalityFilter = (typeof MODEL_MODALITY_OPTIONS)[number]

const MODEL_MODALITY_INITIALS: Record<string, string> = {
  text: 'T',
  image: 'I',
  video: 'V',
  audio: 'A',
  embedding: 'E',
  rerank: 'R',
  multimodal: 'M',
}

function modalityLabel(value: string, t: (key: string) => string): string {
  const key: Record<string, string> = { all: 'console.enterprise.model.allModalities', text: 'console.enterprise.model.text', image: 'console.enterprise.model.image', video: 'console.enterprise.model.video', audio: 'console.enterprise.model.audio', embedding: 'console.enterprise.model.embedding', rerank: 'console.enterprise.model.rerank', multimodal: 'console.enterprise.model.multimodal' }
  return key[value] ? t(key[value]) : value || t('console.enterprise.model.other')
}

function modalityInitial(value: string): string {
  return MODEL_MODALITY_INITIALS[value] ?? '?'
}

function applyModelUpdate(data: EnterpriseModelPage, updated: EnterpriseModel): EnterpriseModelPage {
  const current = data.items.find((item) => item.id === updated.id)
  const enabledDelta = current && current.enabled !== updated.enabled ? (updated.enabled ? 1 : -1) : 0
  return {
    ...data,
    items: data.items.map((item) => item.id === updated.id ? updated : item),
    enabled_count: data.enabled_count + enabledDelta,
    disabled_count: Math.max(0, data.disabled_count - enabledDelta),
  }
}

function ModelsSummary({ data }: { data: EnterpriseModelPage }) {
  const { t } = useTranslation()
  const summary = [
    { value: data.enabled_count, label: t('console.enterprise.model.enabled'), tone: 'on' },
    { value: data.disabled_count, label: t('console.enterprise.model.disabled'), tone: 'off' },
    { value: data.enabled_count + data.disabled_count, label: t('console.enterprise.model.platformTotal'), tone: 'total' },
  ]
  return <div className="enterprise-models-summary" aria-label={t('console.enterprise.model.summary')}>{summary.map((item) => <div className={`enterprise-models-summary-chip ${item.tone}`} key={item.label}><strong>{item.value}</strong><span>{item.label}</span></div>)}</div>
}

function ModelsToolbar({ keyword, modality, onKeywordChange, onModalityChange }: { keyword: string; modality: ModelModalityFilter; onKeywordChange: (value: string) => void; onModalityChange: (value: ModelModalityFilter) => void }) {
  const { t } = useTranslation()
  return <form className="enterprise-models-toolbar" role="search" onSubmit={(event) => event.preventDefault()}><input className="enterprise-models-search" value={keyword} onChange={(event) => onKeywordChange(event.target.value)} placeholder={t('console.enterprise.model.searchPlaceholder')} aria-label={t('console.enterprise.model.searchLabel')} /><Select className="enterprise-models-filter" value={modality} onChange={(value) => onModalityChange(String(value) as ModelModalityFilter)} aria-label={t('console.enterprise.model.modalityFilter')}>{MODEL_MODALITY_OPTIONS.map((value) => <Select.Option value={value} key={value}>{modalityLabel(value, t)}</Select.Option>)}</Select></form>
}

function ModelStateControl({ model, canManage, saving, onToggle }: { model: EnterpriseModel; canManage: boolean; saving: boolean; onToggle: (model: EnterpriseModel) => void }) {
  const { t } = useTranslation()
  const stateLabel = model.enabled ? t('console.enterprise.model.enabled') : t('console.enterprise.model.disabled')
  return <div className="enterprise-model-state"><span className={`enterprise-model-state-label ${model.enabled ? 'on' : 'off'}`}>{stateLabel}</span>{canManage ? <button className={`enterprise-model-switch${model.enabled ? ' is-on' : ''}`} type="button" role="switch" aria-checked={model.enabled} aria-label={`${model.enabled ? t('console.enterprise.model.disable') : t('console.enterprise.model.enable')} ${model.name}`} disabled={saving} aria-busy={saving} onClick={() => onToggle(model)}><span aria-hidden="true" /></button> : null}</div>
}

function ModelsTable({ data, canManage, savingModelID, onToggle }: { data: EnterpriseModelPage; canManage: boolean; savingModelID: string; onToggle: (model: EnterpriseModel) => void }) {
  const { t } = useTranslation()
  if (!data.items.length) return <EnterpriseEmpty title={t('console.enterprise.model.noMatch')} description={t('console.enterprise.model.adjustFilter')} />
  return <div className="enterprise-models-table-scroll" role="region" aria-label={t('console.enterprise.model.title')} tabIndex={0}><table className="enterprise-models-table enterprise-models-table--managed"><colgroup><col /><col className="enterprise-models-col-modality" /><col className="enterprise-models-col-capabilities" /><col className="enterprise-models-col-state" /></colgroup><thead><tr><th scope="col">{t('console.enterprise.model.model')}</th><th scope="col">{t('console.enterprise.model.modality')}</th><th scope="col">{t('console.enterprise.model.capabilities')}</th><th scope="col">{t('console.enterprise.model.enable')}</th></tr></thead><tbody>{data.items.map((model) => <tr key={model.id}><td><div className="enterprise-model-identity"><span className="enterprise-model-badge" aria-hidden="true">{modalityInitial(model.modality)}</span><span><strong title={model.name}>{model.name}</strong><small title={model.company}>{model.company}</small></span></div></td><td><span className="enterprise-model-modality">{modalityLabel(model.modality, t)}</span></td><td><div className="enterprise-model-capabilities">{model.capabilities.length ? model.capabilities.map((capability) => <span key={capability}>{capability}</span>) : <span className="enterprise-model-empty-capability">{t('console.enterprise.model.notTagged')}</span>}</div></td><td><ModelStateControl model={model} canManage={canManage} saving={savingModelID === model.id} onToggle={onToggle} /></td></tr>)}</tbody></table></div>
}

function ModelsPagination({ data, page, pageSize, onPageChange, onPageSizeChange }: { data: EnterpriseModelPage; page: number; pageSize: number; onPageChange: (nextPage: number) => void; onPageSizeChange: (nextPageSize: number) => void }) {
  const { t } = useTranslation()
  if (!data.total) return null
  const currentPageSize = data.page_size > 0 ? data.page_size : pageSize
  const rangeStart = (page - 1) * currentPageSize + 1
  const rangeEnd = Math.min(page * currentPageSize, data.total)
  return <AppPagination ariaLabel={t('console.enterprise.model.page')} currentPage={page} pageSize={currentPageSize} total={data.total} pageSizeOptions={[...MODEL_PAGE_SIZES]} summary={t('console.enterprise.model.showRange', { start: rangeStart, end: rangeEnd, total: data.total })} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />
}

function ModelsContent({ context }: { context: EnterpriseContext }) {
  const { t } = useTranslation()
  const handleError = useEnterpriseErrorHandler()
  const canManage = context.capabilities.can_manage_models
  const [keyword, setKeyword] = useState('')
  const [requestKeyword, setRequestKeyword] = useState('')
  const [modality, setModality] = useState<ModelModalityFilter>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(MODEL_PAGE_SIZES[0])
  const [data, setData] = useState<EnterpriseModelPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<EnterpriseRequestError | null>(null)
  const [actionError, setActionError] = useState<EnterpriseRequestError | null>(null)
  const [savingModelID, setSavingModelID] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRequestKeyword(keyword.trim())
      setPage(1)
    }, MODEL_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [keyword])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    setActionError(null)
    getEnterpriseModels({ enterprise_id: context.id }, {
      page,
      page_size: pageSize,
      keyword: requestKeyword || undefined,
      modality: modality === 'all' ? undefined : modality,
      include_disabled: true,
      signal: controller.signal,
    }).then((result) => {
      if (!active) return
      const lastPage = Math.max(1, Math.ceil(result.total / Math.max(1, result.page_size)))
      if (result.total > 0 && result.page > lastPage) {
        setPage(lastPage)
        return
      }
      setData(result)
    }).catch((reason: unknown) => {
      if (!active || controller.signal.aborted) return
      const handled = handleError(reason)
      if (handled) setError(handled)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [context.id, handleError, modality, page, pageSize, reloadToken, requestKeyword])

  async function toggleModel(model: EnterpriseModel): Promise<void> {
    if (!canManage || savingModelID) return
    setSavingModelID(model.id)
    setActionError(null)
    try {
      const updated = await updateEnterpriseModel({ enterprise_id: context.id }, model.id, { enabled: !model.enabled, expected_version: model.setting_version })
      setData((previous) => previous ? applyModelUpdate(previous, updated) : previous)
      Toast.success(updated.enabled ? t('console.enterprise.model.updated') : t('console.enterprise.model.updateDisabled'))
    } catch (reason: unknown) {
      const handled = handleError(reason)
      if (!handled) return
      setActionError(handled)
      if (isApiError(reason) && reason.code === 140004) {
        Toast.warning(t('console.enterprise.model.conflict'))
        setReloadToken((value) => value + 1)
      }
    } finally {
      setSavingModelID('')
    }
  }

  const note = context.role === 'member'
    ? { tone: 'warning' as const, title: t('console.enterprise.model.stateReadonly'), copy: t('console.enterprise.model.memberReadonly') }
    : canManage
      ? { tone: 'info' as const, title: t('console.enterprise.model.permissionTitle'), copy: t('console.enterprise.model.permissionCopy') }
      : { tone: 'warning' as const, title: t('console.enterprise.model.stateReadonly'), copy: t('console.enterprise.model.noManage') }

  return <>
    <BannerNotice tone={note.tone}><strong>{note.title}</strong><span>{note.copy}</span></BannerNotice>
    {actionError ? <div className="enterprise-models-action-error" role="alert"><span>{actionError.message}</span>{actionError.requestId ? <small>{t('console.common.requestIdValue', { requestId: actionError.requestId })}</small> : null}<EnterpriseRefreshButton onClick={() => setReloadToken((value) => value + 1)} label={t('console.enterprise.model.refreshDirectory')} /></div> : null}
    <section className="enterprise-models-config" aria-labelledby="enterpriseModelsConfigTitle">
      <div className="enterprise-models-config-head"><div><h2 id="enterpriseModelsConfigTitle">{t('console.enterprise.model.configTitle')}</h2><p>{t('console.enterprise.model.configCopy')}</p></div></div>
      <section className="enterprise-models-subsection" aria-labelledby="enterpriseModelsDirectoryTitle"><div className="enterprise-models-subsection-head"><div><h3 id="enterpriseModelsDirectoryTitle">{t('console.enterprise.model.directoryTitle')}</h3><p>{t('console.enterprise.model.directoryCopy')}</p></div></div>{canManage && data ? <ModelsSummary data={data} /> : null}<ModelsToolbar keyword={keyword} modality={modality} onKeywordChange={setKeyword} onModalityChange={(value) => { setModality(value); setPage(1) }} />{error && !data ? <EnterpriseError message={error.message} requestId={error.requestId} onRetry={() => setReloadToken((value) => value + 1)} /> : loading && !data ? <EnterpriseLoading label={t('console.enterprise.model.loading')} /> : data ? <div aria-busy={loading}><ModelsTable data={data} canManage={canManage} savingModelID={savingModelID} onToggle={(model) => { void toggleModel(model) }} /><ModelsPagination data={data} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1) }} /></div> : null}</section>
    </section>
  </>
}

export function EnterpriseModelsPage() {
  const { t } = useTranslation()
  return <EnterprisePageShell title={t('console.enterprise.model.title')} description={t('console.enterprise.model.description')} capability="can_view_models" className="enterprise-models-page">{(context) => <ModelsContent context={context} />}</EnterprisePageShell>
}
