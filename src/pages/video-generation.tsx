import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Dropdown from '@douyinfe/semi-ui/lib/es/dropdown'
import type { RenderSingleSelectedItemFn } from '@douyinfe/semi-ui/lib/es/select'
import Modal from '@/components/app-modal'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { IconAlertTriangle, IconArrowUp, IconCheckCircleStroked, IconChevronDownStroked, IconChevronUpDown, IconClockStroked, IconClose, IconDeleteStroked, IconDownload, IconEditStroked, IconFilterStroked, IconHistory, IconImage, IconInfoCircle, IconLoading, IconMuteStroked, IconMoreStroked, IconPlus, IconRefresh, IconStop, IconVideo, IconVolume2 } from '@douyinfe/semi-icons'
import { EmptyPanel, PageTitle } from '@/components/common'
import { appToast } from '@/components/app-toast'
import { CompatInput as Input, CompatSelect as Select } from '@/components/semi-compat'
import { getUserApiKeys, type UserApiKey, type UserApiKeyContext } from '@/api/user-api-keys'
import { cancelVideoTask, getVideoTask, submitVideoGeneration, videoTaskIsTerminal, VideoRuntimeError, type VideoTask, type VideoTaskStatus } from '@/api/video-runtime'
import { isAuthenticationFailure } from '@/api/http'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { useAppStore } from '@/data/app-state'
import { findModelInList, modelAlias, type ModelRecord } from '@/data/models'
import { useUserModels } from '@/data/user-models'
import { apiKeySupportsModel } from '@/utils/model-access'
import { workspaceContextFor, workspaceContextKey } from '@/utils/workspace'
import { LEGACY_VIDEO_HISTORY_KEY, VIDEO_SESSION_HISTORY_KEY, readUserSessionHistory, writeUserSessionHistory } from '@/utils/ephemeral-history'
import './video-generation.css'

const VIDEO_HISTORY_LIMIT = 20
const VIDEO_PROMPT_MAX_LENGTH = 8_000
const VIDEO_REFERENCE_MAX_BYTES = 4 * 1024 * 1024
const VIDEO_REFERENCE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'
const VIDEO_POLL_INITIAL_DELAY_MS = 1_000
const VIDEO_POLL_INTERVAL_MS = 2_500
const VIDEO_POLL_MAX_ATTEMPTS = 120
const DEFAULT_VIDEO_DURATION = 5
const DEFAULT_VIDEO_SIZE = '1280x720'

const VIDEO_DURATION_SLIDER_OPTIONS = [2, 5, 10, 15, 20, 25, 30] as const
const VIDEO_ASPECT_OPTIONS = ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16'] as const

function sizeForVideoAspect(aspect: string, resolution: string): string {
  if (aspect === '1:1') return '1024x1024'
  if (aspect === '9:16' || aspect === '3:4') return '720x1280'
  return resolution === '1080P' ? '1920x1080' : '1280x720'
}
const VIDEO_SIZE_OPTIONS = [
  { value: '1280x720', labelKey: 'console.video.sizeLandscape' },
  { value: '1920x1080', labelKey: 'console.video.sizeLandscapeHd' },
  { value: '720x1280', labelKey: 'console.video.sizePortrait' },
  { value: '1024x1024', labelKey: 'console.video.sizeSquare' },
] as const

type VideoHistoryEntry = {
  id: string
  workspaceKey: string
  taskId: string
  modelId: string
  model: string
  modelName: string
  prompt: string
  duration: number
  size: string
  inputReference: string | null
  status: VideoTaskStatus
  progress: number | null
  resultUrl: string | null
  thumbnailUrl: string | null
  errorMessage: string | null
  requestId: string
  createdAt: string
}

type VideoSubmissionSnapshot = {
  apiKey: string
  model: string
  modelId: string
  modelName: string
  prompt: string
  duration: number
  size: string
  inputReference: string
  idempotencyKey: string
  historyId?: string
}

type VideoRequestFailure = {
  message: string
  requestId: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isVideoTaskStatus(value: unknown): value is VideoTaskStatus {
  return ['pending', 'processing', 'cancelling', 'succeeded', 'failed', 'cancelled', 'expired', 'unknown'].includes(String(value))
}

function isVideoHistoryEntry(value: unknown): value is VideoHistoryEntry {
  if (!isRecord(value)) return false
  return typeof value.id === 'string'
    && typeof value.workspaceKey === 'string'
    && typeof value.taskId === 'string'
    && typeof value.modelId === 'string'
    && typeof value.model === 'string'
    && typeof value.modelName === 'string'
    && typeof value.prompt === 'string'
    && typeof value.duration === 'number'
    && Number.isFinite(value.duration)
    && typeof value.size === 'string'
    && (value.inputReference === null || typeof value.inputReference === 'string')
    && isVideoTaskStatus(value.status)
    && (value.progress === null || (typeof value.progress === 'number' && Number.isFinite(value.progress)))
    && (value.resultUrl === null || typeof value.resultUrl === 'string')
    && (value.thumbnailUrl === null || typeof value.thumbnailUrl === 'string')
    && (value.errorMessage === null || typeof value.errorMessage === 'string')
    && typeof value.requestId === 'string'
    && typeof value.createdAt === 'string'
}

function readVideoHistory(userId: string | null): VideoHistoryEntry[] {
  return readUserSessionHistory(VIDEO_SESSION_HISTORY_KEY, userId, isVideoHistoryEntry, VIDEO_HISTORY_LIMIT)
}

function compactVideoHistoryEntry(entry: VideoHistoryEntry): VideoHistoryEntry {
  const clip = (value: string | null, max: number): string | null => value === null ? null : value.slice(0, max)
  const inputReference = isPersistableReference(entry.inputReference ?? '') && (entry.inputReference?.length ?? 0) <= 4_096
    ? entry.inputReference
    : null
  return {
    ...entry,
    workspaceKey: entry.workspaceKey.slice(0, 512),
    taskId: entry.taskId.slice(0, 512),
    modelId: entry.modelId.slice(0, 512),
    model: entry.model.slice(0, 512),
    modelName: entry.modelName.slice(0, 512),
    prompt: entry.prompt.slice(0, VIDEO_PROMPT_MAX_LENGTH),
    size: entry.size.slice(0, 64),
    inputReference,
    resultUrl: clip(entry.resultUrl, 4_096),
    thumbnailUrl: clip(entry.thumbnailUrl, 4_096),
    errorMessage: clip(entry.errorMessage, 4_000),
    requestId: entry.requestId.slice(0, 512),
    createdAt: entry.createdAt.slice(0, 128),
  }
}

function writeVideoHistory(userId: string | null, entries: VideoHistoryEntry[]): void {
  writeUserSessionHistory(VIDEO_SESSION_HISTORY_KEY, userId, entries.map(compactVideoHistoryEntry), VIDEO_HISTORY_LIMIT)
}

function workspaceKeyFor(context: UserApiKeyContext): string {
  return workspaceContextKey(context)
}

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `video-submit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createHistoryID(workspaceKey: string, taskID: string): string {
  return `${workspaceKey}:${taskID}`
}

function isPersistableReference(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

function historyTask(entry: VideoHistoryEntry): VideoTask {
  return {
    taskId: entry.taskId,
    status: entry.status,
    progress: entry.progress,
    resultUrl: entry.resultUrl,
    thumbnailUrl: entry.thumbnailUrl,
    errorMessage: entry.errorMessage,
    requestId: entry.requestId,
    raw: {},
  }
}

function formatVideoDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function videoStatusLabelKey(status: VideoTaskStatus): string {
  switch (status) {
    case 'pending': return 'console.video.statusPending'
    case 'processing': return 'console.video.statusProcessing'
    case 'cancelling': return 'console.video.statusCancelling'
    case 'succeeded': return 'console.video.statusSucceeded'
    case 'failed': return 'console.video.statusFailed'
    case 'cancelled': return 'console.video.statusCancelled'
    case 'expired': return 'console.video.statusExpired'
    default: return 'console.video.statusUnknown'
  }
}

function taskIsActive(task: VideoTask | null): boolean {
  return Boolean(task && !videoTaskIsTerminal(task.status) && task.status !== 'unknown')
}

function taskFromHistory(task: VideoTask, entry: VideoHistoryEntry): VideoHistoryEntry {
  return { ...entry, status: task.status, progress: task.progress, resultUrl: task.resultUrl, thumbnailUrl: task.thumbnailUrl, errorMessage: task.errorMessage, requestId: task.requestId }
}

function VideoModelLogo({ model }: { model: ModelRecord }): ReactNode {
  return <span className="video-model-logo">{model.iconUrl ? <img src={model.iconUrl} alt="" /> : model.company.slice(0, 1)}</span>
}

function readVideoFailure(error: unknown, fallback: string): VideoRequestFailure {
  if (error instanceof VideoRuntimeError) return { message: error.message || fallback, requestId: error.requestId }
  if (error instanceof Error) return { message: error.message || fallback, requestId: null }
  return { message: fallback, requestId: null }
}

function waitForVideoPoll(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, delay)
    const abort = (): void => {
      window.clearTimeout(timer)
      reject(new DOMException('视频任务轮询已取消', 'AbortError'))
    }
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}

function VideoHistoryPanel({ entries, selectedID, onSelect, onClear, onNew, disabled, open = false }: { entries: VideoHistoryEntry[]; selectedID: string; onSelect: (entry: VideoHistoryEntry) => void; onClear: () => void; onNew: () => void; disabled: boolean; open?: boolean }) {
  const { t } = useTranslation()
  return <aside className={`video-history-panel experience-history${open ? ' is-open' : ''}`} aria-labelledby="video-history-heading">
    <div className="video-history-heading experience-history-heading"><h2 id="video-history-heading">{t('console.video.historyTitle')}</h2><div className="video-history-actions"><Button className="video-new-button" theme="outline" size="small" onClick={onNew} disabled={disabled}>{t('console.video.newGeneration')}</Button><Button theme="borderless" size="small" icon={<IconDeleteStroked />} aria-label={t('console.video.clearHistory')} title={t('console.video.clearHistory')} onClick={onClear} disabled={entries.length === 0 || disabled} /></div></div>
    {entries.length ? <div className="video-history-list">{entries.map((entry) => <button className={`video-history-item${entry.id === selectedID ? ' is-active' : ''}`} type="button" key={entry.id} onClick={() => onSelect(entry)}>
      <span className="video-history-item-top"><strong>{entry.modelName}</strong><span className={`video-history-status is-${entry.status}`}>{t(videoStatusLabelKey(entry.status))}</span></span>
      <span className="video-history-item-prompt">{entry.prompt}</span>
      <span className="video-history-item-meta">{formatVideoDate(entry.createdAt)} · {entry.duration}s · {entry.size}</span>
    </button>)}</div> : <div className="video-history-empty"><IconHistory aria-hidden="true" /><p>{t('console.video.historyEmpty')}</p><span>{t('console.video.historyEmptyHint')}</span></div>}
  </aside>
}

interface VideoWorkspaceNoticeItem {
  id: string
  message: string
  requestId?: string | null
  action?: ReactNode
}

function VideoWorkspaceNotice({ items }: { items: VideoWorkspaceNoticeItem[] }) {
  const { t } = useTranslation()
  return <div className="workspace-notice-state video-workspace-notice" role="alert">
    <span className="workspace-notice-icon"><IconAlertTriangle aria-hidden="true" /></span>
    <div className="workspace-notice-list">{items.map((item) => <div className="workspace-notice-item" key={item.id}>
      <strong>{item.message}</strong>
      {item.requestId ? <code>{t('console.common.requestIdValue', { requestId: item.requestId })}</code> : null}
      {item.action ? <div className="workspace-notice-actions">{item.action}</div> : null}
    </div>)}</div>
  </div>
}

function VideoStage({ task, entry, modelName, submitting, onCancel, onRetry, onEdit, onDelete }: { task: VideoTask | null; entry?: VideoHistoryEntry; modelName: string; submitting: boolean; onCancel: () => void; onRetry: () => void; onEdit: () => void; onDelete: () => void }) {
  const { t } = useTranslation()
  if (submitting && !task) return <div className="video-stage-state video-stage-state--loading" role="status" aria-label={t('console.video.submitting')}><span className="video-loading-ring"><IconLoading /></span><strong>{t('console.video.submitting')}</strong><p>{t('console.video.submittingHint')}</p><Button theme="borderless" size="small" icon={<IconStop />} onClick={onCancel}>{t('console.video.cancelRequest')}</Button></div>
  if (!task) return <div className="video-stage-state video-stage-state--empty"><span className="video-stage-icon"><IconVideo aria-hidden="true" /></span><strong>{t('console.video.emptyTitle')}</strong><p>{t('console.video.emptyHint')}</p></div>

  const statusLabel = t(videoStatusLabelKey(task.status))
  const prompt = entry?.prompt ?? t('console.video.emptyTitle')
  const duration = entry?.duration ?? 0
  const modelLabel = entry?.modelName || modelName
  const metaLabel = `${modelLabel}${duration ? ` · ${duration}${t('console.video.secondsShort')}` : ''}`
  const progress = task.progress ?? 0
  const isTerminal = videoTaskIsTerminal(task.status) || task.status === 'unknown'
  const isFailure = task.status === 'failed' || task.status === 'expired' || task.status === 'cancelled' || task.status === 'unknown'
  const taskContent = task.status === 'succeeded' && task.resultUrl ? <div className="video-task-result"><div className="video-result-frame"><video controls preload="metadata" poster={task.thumbnailUrl ?? undefined} src={task.resultUrl} aria-label={t('console.video.resultVideo')}><track kind="captions" /></video></div><a className="video-result-link" href={task.resultUrl} target="_blank" rel="noreferrer"><IconDownload aria-hidden="true" />{t('console.video.openResult')}</a></div>
    : task.status === 'succeeded' ? <div className="video-task-placeholder"><IconAlertTriangle aria-hidden="true" /><span>{t('console.video.resultUnavailable')}</span><small>{t('console.video.resultUnavailableHint')}</small></div>
      : isFailure ? <div className="video-task-error" role="alert"><span className="video-task-error-icon"><IconClose aria-hidden="true" /></span><p>{task.errorMessage ?? t('console.video.taskFailedHint')}</p>{task.requestId ? <code>{t('console.common.requestIdValue', { requestId: task.requestId })}</code> : null}</div>
        : <div className="video-task-progress" role="status" aria-label={statusLabel}><span className="video-loading-ring"><IconLoading /></span><div><strong>{statusLabel}</strong><p>{t('console.video.processingHint')}</p></div><div className="video-progress" role="progressbar" aria-label={t('console.video.progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div><span className="video-task-progress-value">{progress > 0 ? `${progress}%` : t('console.video.progressPreparing')}</span></div>
  return <article className={`video-task-card${isFailure ? ' is-failed' : ''}${task.status === 'succeeded' ? ' is-succeeded' : ''}`} data-task-id={task.taskId} aria-label={prompt}>
    <header className="video-task-card-heading"><div><h2>{prompt}</h2><p>{metaLabel} <IconInfoCircle aria-hidden="true" /></p></div><span className={`video-task-status is-${task.status}${task.status === 'succeeded' ? ' video-status-success' : ''}`}>{task.status === 'succeeded' ? <IconCheckCircleStroked aria-hidden="true" /> : null}{statusLabel}</span></header>
    <div className="video-task-card-body">{taskContent}</div>
    <footer className="video-task-card-actions"><Button theme="outline" size="small" icon={<IconEditStroked />} onClick={onEdit}>{t('console.video.edit')}</Button><Button theme="outline" size="small" icon={<IconRefresh />} onClick={onRetry}>{t('console.video.retry')}</Button><Dropdown trigger="click" position="bottomLeft" showTick contentClassName="video-task-more-dropdown" menu={[{ node: 'item', name: t('console.video.delete'), type: 'danger', icon: <IconDeleteStroked />, onClick: onDelete }]}><Button theme="outline" size="small" icon={<IconMoreStroked />} aria-label={t('console.video.moreActions')} title={t('console.video.moreActions')} /></Dropdown>{!isTerminal ? <Button theme="borderless" size="small" icon={<IconStop />} onClick={onCancel}>{task.status === 'cancelling' ? t('console.video.statusCancelling') : t('console.video.cancelGeneration')}</Button> : null}</footer>
  </article>
}

export function VideoPage() {
  const { t } = useTranslation()
  const renderReferenceSelectedItem: RenderSingleSelectedItemFn = ({ value }) => <>
    <span className="video-reference-option-icon">{String(value) === 'reference' ? <IconImage aria-hidden="true" /> : <IconVideo aria-hidden="true" />}</span>
    <span>{String(value) === 'reference' ? t('console.video.referenceMode') : t('console.video.firstLastFrame')}</span>
  </>
  const dispatch = useAppDispatch()
  const auth = useAppSelector((state) => state.auth)
  const userId = auth.status === 'authenticated'
    ? auth.user?.id ?? null
    : auth.status === 'unauthenticated'
      ? null
      : ''
  const navigate = useNavigate()
  const store = useAppStore()
  const [searchParams] = useSearchParams()
  const { models, loading: modelsLoading, error: modelsError } = useUserModels()

  useEffect(() => {
    if (modelsError) appToast.error(modelsError)
  }, [modelsError])
  const workspaceContext = useMemo<UserApiKeyContext>(() => workspaceContextFor(store.activeWorkspace), [store.activeWorkspace.id, store.activeWorkspace.type])
  const workspaceKey = workspaceKeyFor(workspaceContext)
  const requestedModel = searchParams.get('model') ?? ''
  const [apiKeys, setApiKeys] = useState<UserApiKey[]>([])
  const [apiKeysLoading, setApiKeysLoading] = useState(true)
  const [apiKeyError, setApiKeyError] = useState('')
  const [modelID, setModelID] = useState(requestedModel)
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState(DEFAULT_VIDEO_DURATION)
  const [size, setSize] = useState(DEFAULT_VIDEO_SIZE)
  const [inputReference, setInputReference] = useState('')
  const [referenceUrl, setReferenceUrl] = useState('')
  const [referenceName, setReferenceName] = useState('')
  const [firstFrameUrl, setFirstFrameUrl] = useState('')
  const [lastFrameUrl, setLastFrameUrl] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [referenceMode, setReferenceMode] = useState<'reference' | 'first-last'>('reference')
  const [aspectRatio, setAspectRatio] = useState('adaptive')
  const [resolution, setResolution] = useState('480P')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [referenceVisible, setReferenceVisible] = useState(false)
  const [history, setHistory] = useState<VideoHistoryEntry[]>(() => readVideoHistory(userId).filter((entry) => entry.workspaceKey === workspaceKey))
  const [selectedHistoryID, setSelectedHistoryID] = useState('')
  const [currentTask, setCurrentTask] = useState<VideoTask | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [polling, setPolling] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [requestFailure, setRequestFailure] = useState<VideoRequestFailure | null>(null)
  const referenceInputRef = useRef<HTMLInputElement>(null)
  const firstFrameInputRef = useRef<HTMLInputElement>(null)
  const lastFrameInputRef = useRef<HTMLInputElement>(null)
  const submitControllerRef = useRef<AbortController | null>(null)
  const submitAbortReasonRef = useRef<'user' | 'navigation' | null>(null)
  const pollControllerRef = useRef<AbortController | null>(null)
  const lastSubmissionRef = useRef<VideoSubmissionSnapshot | null>(null)
  const historyOwnerRef = useRef(userId)
  const historyHydratingRef = useRef(true)

  useEffect(() => {
    // 中文：所有弹层都支持点击外部区域收起，避免遮挡工作区内容。
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null
      if (!target?.closest('.video-history-panel, .video-history-toggle')) setHistoryOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  const usableApiKeys = useMemo(() => apiKeys.filter((key) => key.status === 'active' && key.secret.trim()), [apiKeys])
  // 中文：后端为每个用户返回默认密钥，页面直接使用首个可用密钥，不再让用户重复选择。
  const selectedApiKey = usableApiKeys[0]
  // 中文：模型选择器只展示当前工作空间真实返回的视频模型，不使用内置目录伪造可用项。
  const videoModels = useMemo(() => models.filter((model) => model.modality === 'video' && Boolean(modelAlias(model))), [models])
  const selectableVideoModels = useMemo(() => selectedApiKey ? videoModels.filter((model) => apiKeySupportsModel(selectedApiKey, model)) : [], [selectedApiKey, videoModels])
  // 中文：有密钥时严格按密钥权限过滤；没有密钥时保留模型目录用于配置预览。
  const displayVideoModels = selectedApiKey ? selectableVideoModels : videoModels
  const selectedModel = findModelInList(displayVideoModels, modelID) ?? displayVideoModels[0]
  const selectedHistory = history.find((entry) => entry.id === selectedHistoryID)
  const operationBusy = submitting || polling || cancelling
  const canSubmit = Boolean(selectedApiKey && selectedModel && prompt.trim() && !operationBusy)

  useEffect(() => {
    submitAbortReasonRef.current = 'navigation'
    submitControllerRef.current?.abort()
    pollControllerRef.current?.abort()
    submitControllerRef.current = null
    pollControllerRef.current = null
    setApiKeys([])
    setApiKeysLoading(true)
    setApiKeyError('')
    setModelID(requestedModel)
    setCurrentTask(null)
    setSelectedHistoryID('')
    setSubmitting(false)
    setPolling(false)
    setCancelling(false)
    setRequestFailure(null)
    historyOwnerRef.current = userId
    historyHydratingRef.current = true
    setHistory(readVideoHistory(userId).filter((entry) => entry.workspaceKey === workspaceKey))
    try {
      window.localStorage.removeItem(LEGACY_VIDEO_HISTORY_KEY)
    } catch {
      // 中文：迁移到账号隔离存储时清理旧的未隔离视频历史。
    }
    setReferenceVisible(false)
  }, [requestedModel, userId, workspaceKey])

  useEffect(() => {
    if (historyOwnerRef.current !== userId || historyHydratingRef.current) {
      historyHydratingRef.current = false
      return
    }
    // 中文：页面只维护当前工作空间的列表，写回时合并同一用户的其他工作空间历史。
    const otherWorkspaceEntries = readVideoHistory(userId).filter((entry) => entry.workspaceKey !== workspaceKey)
    writeVideoHistory(userId, [...history, ...otherWorkspaceEntries])
  }, [history, userId, workspaceKey])

  useEffect(() => {
    let active = true
    setApiKeysLoading(true)
    setApiKeyError('')
    void getUserApiKeys(workspaceContext, 'active').then((result) => {
      if (!active) return
      const keys = result.items
      setApiKeys(keys)
    }).catch((error: unknown) => {
      if (!active) return
      if (isAuthenticationFailure(error)) {
        dispatch(invalidateAuth())
        navigate('/', { replace: true })
        return
      }
      setApiKeyError(error instanceof Error ? error.message : t('console.video.apiKeyLoadFailed'))
    }).finally(() => {
      if (active) setApiKeysLoading(false)
    })
    return () => { active = false }
  }, [dispatch, navigate, t, workspaceContext])

  useEffect(() => {
    if (!selectedModel) {
      if (modelID !== '') setModelID('')
      return
    }
    const alias = modelAlias(selectedModel)
    if (modelID !== alias) setModelID(alias)
  }, [modelID, selectedModel])

  useEffect(() => () => {
    submitAbortReasonRef.current = 'navigation'
    submitControllerRef.current?.abort()
    pollControllerRef.current?.abort()
  }, [])

  function persistHistoryEntry(entry: VideoHistoryEntry): void {
    if (historyOwnerRef.current !== userId) return
    const allEntries = readVideoHistory(userId)
    writeVideoHistory(userId, [entry, ...allEntries.filter((item) => item.id !== entry.id)])
  }

  function updateHistoryEntry(entry: VideoHistoryEntry): void {
    if (historyOwnerRef.current !== userId) return
    setHistory((current) => {
      const next = [entry, ...current.filter((item) => item.id !== entry.id)].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, VIDEO_HISTORY_LIMIT)
      return next
    })
    persistHistoryEntry(entry)
  }

  function updateTask(task: VideoTask, entry: VideoHistoryEntry): void {
    setCurrentTask(task)
    setSelectedHistoryID(entry.id)
    updateHistoryEntry(taskFromHistory(task, entry))
  }

  function createHistoryEntry(task: VideoTask, snapshot: VideoSubmissionSnapshot): VideoHistoryEntry {
    return {
      id: createHistoryID(workspaceKey, task.taskId), workspaceKey, taskId: task.taskId, modelId: snapshot.modelId, model: snapshot.model, modelName: snapshot.modelName,
      prompt: snapshot.prompt, duration: snapshot.duration, size: snapshot.size, inputReference: isPersistableReference(snapshot.inputReference) ? snapshot.inputReference : null,
      status: task.status, progress: task.progress, resultUrl: task.resultUrl, thumbnailUrl: task.thumbnailUrl, errorMessage: task.errorMessage, requestId: task.requestId, createdAt: new Date().toISOString(),
    }
  }

  function createSubmissionFailureTask(failure: VideoRequestFailure): VideoTask {
    // 中文：提交阶段没有服务端 task_id 时也保留一张本地失败卡片，方便编辑和重试。
    return {
      taskId: `local-failed-${Date.now()}`,
      status: 'failed',
      progress: null,
      resultUrl: null,
      thumbnailUrl: null,
      errorMessage: failure.message,
      requestId: failure.requestId ?? createIdempotencyKey(),
      raw: {},
    }
  }

  async function pollTask(apiKey: string, initialTask: VideoTask, entry: VideoHistoryEntry): Promise<void> {
    pollControllerRef.current?.abort()
    const controller = new AbortController()
    pollControllerRef.current = controller
    setPolling(true)
    let task = initialTask
    let attempt = 0
    try {
      while (!controller.signal.aborted && !videoTaskIsTerminal(task.status) && task.status !== 'unknown' && attempt < VIDEO_POLL_MAX_ATTEMPTS) {
        await waitForVideoPoll(attempt === 0 ? VIDEO_POLL_INITIAL_DELAY_MS : VIDEO_POLL_INTERVAL_MS, controller.signal)
        if (controller.signal.aborted) return
        attempt += 1
        task = await getVideoTask(apiKey, task.taskId, controller.signal)
        updateTask(task, entry)
      }
      if (!controller.signal.aborted && !videoTaskIsTerminal(task.status) && task.status !== 'unknown') {
        const timeoutTask: VideoTask = { ...task, status: 'unknown', errorMessage: t('console.video.pollingTimeout') }
        updateTask(timeoutTask, entry)
        setRequestFailure({ message: t('console.video.pollingTimeout'), requestId: task.requestId })
      }
    } catch (error: unknown) {
      if (controller.signal.aborted) return
      const failure = readVideoFailure(error, t('console.video.queryFailed'))
      const failedTask: VideoTask = { ...task, status: 'unknown', errorMessage: failure.message, requestId: failure.requestId ?? task.requestId }
      updateTask(failedTask, entry)
      setRequestFailure(failure)
    } finally {
      if (pollControllerRef.current === controller) {
        pollControllerRef.current = null
        setPolling(false)
      }
    }
  }

  function buildSubmissionSnapshot(retry: VideoSubmissionSnapshot | undefined): VideoSubmissionSnapshot | null {
    if (retry) {
      if (!selectedApiKey || selectedApiKey.secret !== retry.apiKey) {
        Toast.warning(t('console.video.retryKeyMismatch'))
        return null
      }
      return retry
    }
    if (!selectedApiKey) {
      Toast.warning(t('console.video.apiKeyRequired'))
      return null
    }
    if (!selectedModel) {
      Toast.warning(t('console.video.modelRequired'))
      return null
    }
    if (!prompt.trim()) {
      Toast.warning(t('console.video.promptRequired'))
      return null
    }
    if (!apiKeySupportsModel(selectedApiKey, selectedModel)) {
      Toast.warning(t('console.video.modelPermissionDenied'))
      return null
    }
    return {
      apiKey: selectedApiKey.secret, model: modelAlias(selectedModel), modelId: selectedModel.id, modelName: selectedModel.name,
      prompt: prompt.trim(), duration, size, inputReference: inputReference.trim(), idempotencyKey: createIdempotencyKey(),
    }
  }

  async function submitVideo(retry?: VideoSubmissionSnapshot): Promise<void> {
    if (submitting || polling || cancelling) return
    const snapshot = buildSubmissionSnapshot(retry)
    if (!snapshot) return
    pollControllerRef.current?.abort()
    setPolling(false)
    setCurrentTask(null)
    setSelectedHistoryID('')
    setRequestFailure(null)
    setSubmitting(true)
    submitAbortReasonRef.current = null
    const controller = new AbortController()
    submitControllerRef.current = controller
    lastSubmissionRef.current = snapshot
    try {
      const task = await submitVideoGeneration({ ...snapshot, signal: controller.signal })
      const entry = createHistoryEntry(task, snapshot)
      const storedSnapshot = { ...snapshot, historyId: entry.id }
      lastSubmissionRef.current = storedSnapshot
      updateTask(task, entry)
      Toast.success(task.status === 'succeeded' ? t('console.video.generated') : t('console.video.taskSubmitted'))
      if (!videoTaskIsTerminal(task.status) && task.status !== 'unknown') void pollTask(snapshot.apiKey, task, entry)
    } catch (error: unknown) {
      if (controller.signal.aborted && submitAbortReasonRef.current === 'navigation') return
      if (controller.signal.aborted && submitAbortReasonRef.current === 'user') {
        setRequestFailure({ message: t('console.video.requestCancelled'), requestId: null })
        return
      }
      const failure = readVideoFailure(error, t('console.video.submitFailed'))
      const failedTask = createSubmissionFailureTask(failure)
      const failedEntry = createHistoryEntry(failedTask, snapshot)
      const storedSnapshot = { ...snapshot, historyId: failedEntry.id }
      lastSubmissionRef.current = storedSnapshot
      updateTask(failedTask, failedEntry)
      setRequestFailure(null)
    } finally {
      if (submitControllerRef.current === controller) submitControllerRef.current = null
      setSubmitting(false)
    }
  }

  async function cancelCurrentTask(): Promise<void> {
    if (!currentTask || !selectedApiKey || !taskIsActive(currentTask) || cancelling) return
    pollControllerRef.current?.abort()
    setPolling(false)
    setCancelling(true)
    setRequestFailure(null)
    try {
      const task = await cancelVideoTask(selectedApiKey.secret, currentTask.taskId)
      const entry = history.find((item) => item.id === selectedHistoryID)
      if (entry) updateTask(task, entry)
      Toast.info(t('console.video.cancelRequested'))
      if (entry && !videoTaskIsTerminal(task.status) && task.status !== 'unknown') void pollTask(selectedApiKey.secret, task, entry)
    } catch (error: unknown) {
      setRequestFailure(readVideoFailure(error, t('console.video.cancelFailed')))
    } finally {
      setCancelling(false)
    }
  }

  function cancelSubmission(): void {
    submitAbortReasonRef.current = 'user'
    submitControllerRef.current?.abort()
  }

  function clearHistory(): void {
    const allEntries = readVideoHistory(userId).filter((entry) => entry.workspaceKey !== workspaceKey)
    writeVideoHistory(userId, allEntries)
    setHistory([])
    setSelectedHistoryID('')
    setCurrentTask(null)
  }

  function editCurrent(): void {
    const entry = history.find((item) => item.id === selectedHistoryID)
    if (!entry) return
    setPrompt(entry.prompt)
    setModelID(entry.model)
    setDuration(entry.duration)
    setSize(entry.size)
    setResolution(entry.size === '1920x1080' ? '1080P' : '480P')
    setAspectRatio(entry.size === '1024x1024' ? '1:1' : entry.size === '720x1280' ? '9:16' : '16:9')
    setInputReference(entry.inputReference ?? '')
    setReferenceUrl(entry.inputReference && isPersistableReference(entry.inputReference) ? entry.inputReference : '')
    setReferenceName(entry.inputReference ? t('console.video.referenceImage') : '')
    setRequestFailure(null)
    setHistoryOpen(false)
    // 中文：等待受控文本域回填后聚焦，便于直接修改提示词。
    window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('.video-composer-input-row textarea')?.focus(), 0)
  }

  function deleteCurrent(): void {
    const entryID = selectedHistoryID
    if (!entryID) return
    pollControllerRef.current?.abort()
    setPolling(false)
    const remaining = history.filter((entry) => entry.id !== entryID)
    setHistory(remaining)
    writeVideoHistory(userId, [...remaining, ...readVideoHistory(userId).filter((entry) => entry.workspaceKey !== workspaceKey)])
    setSelectedHistoryID('')
    setCurrentTask(null)
    if (lastSubmissionRef.current?.historyId === entryID) lastSubmissionRef.current = null
  }

  function startNewGeneration(): void {
    if (operationBusy) return
    pollControllerRef.current?.abort()
    setPolling(false)
    setRequestFailure(null)
    setCurrentTask(null)
    setSelectedHistoryID('')
    setPrompt('')
    setInputReference('')
    setReferenceUrl('')
    setReferenceName('')
    setFirstFrameUrl('')
    setLastFrameUrl('')
    setDuration(DEFAULT_VIDEO_DURATION)
    setSize(DEFAULT_VIDEO_SIZE)
    setAspectRatio('adaptive')
    setResolution('480P')
    setReferenceMode('reference')
    setHistoryOpen(false)
    setReferenceVisible(false)
    lastSubmissionRef.current = null
  }

  function selectHistory(entry: VideoHistoryEntry): void {
    pollControllerRef.current?.abort()
    setPolling(false)
    setRequestFailure(null)
    setSelectedHistoryID(entry.id)
    setCurrentTask(historyTask(entry))
    setModelID(entry.model)
    setPrompt(entry.prompt)
    setDuration(entry.duration)
    setSize(entry.size)
    setResolution(entry.size === '1920x1080' ? '1080P' : '480P')
    setAspectRatio(entry.size === '1024x1024' ? '1:1' : entry.size === '720x1280' ? '9:16' : '16:9')
    setInputReference(entry.inputReference ?? '')
    setReferenceUrl(entry.inputReference && isPersistableReference(entry.inputReference) ? entry.inputReference : '')
    setReferenceName(entry.inputReference ? t('console.video.referenceImage') : '')
    if (selectedApiKey && !videoTaskIsTerminal(entry.status) && entry.status !== 'unknown') void pollTask(selectedApiKey.secret, historyTask(entry), entry)
  }

  function retryCurrent(): void {
    const entry = history.find((item) => item.id === selectedHistoryID)
    if (!entry) return
    const snapshot = lastSubmissionRef.current?.historyId === entry.id ? lastSubmissionRef.current : selectedApiKey ? {
      apiKey: selectedApiKey.secret, model: entry.model, modelId: entry.modelId, modelName: entry.modelName, prompt: entry.prompt, duration: entry.duration, size: entry.size, inputReference: entry.inputReference ?? '', idempotencyKey: createIdempotencyKey(),
    } : undefined
    if (!snapshot) {
      Toast.warning(t('console.video.apiKeyRequired'))
      return
    }
    void submitVideo(snapshot)
  }

  function swapFrameUrls(): void {
    setFirstFrameUrl(lastFrameUrl)
    setLastFrameUrl(firstFrameUrl)
  }

  function handleFrameFile(event: ChangeEvent<HTMLInputElement>, frame: 'first' | 'last'): void {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      Toast.warning(t('console.video.referenceImageTypeInvalid'))
      return
    }
    if (file.size > VIDEO_REFERENCE_MAX_BYTES) {
      Toast.warning(t('console.video.referenceImageTooLarge'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      if (frame === 'first') {
        setFirstFrameUrl(reader.result)
        setInputReference(reader.result)
      } else {
        setLastFrameUrl(reader.result)
      }
    }
    reader.onerror = () => Toast.error(t('console.video.referenceImageReadFailed'))
    reader.readAsDataURL(file)
  }

  function handleReferenceFile(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      Toast.warning(t('console.video.referenceImageTypeInvalid'))
      return
    }
    if (file.size > VIDEO_REFERENCE_MAX_BYTES) {
      Toast.warning(t('console.video.referenceImageTooLarge'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      setInputReference(reader.result)
      setReferenceUrl('')
      setReferenceName(file.name)
    }
    reader.onerror = () => Toast.error(t('console.video.referenceImageReadFailed'))
    reader.readAsDataURL(file)
  }

  if (modelsLoading) return <div className="page-stack video-console-page"><PageTitle title={t('console.video.title')} description={t('console.video.description')} /><EmptyPanel title={t('console.common.loadingModels')} description={t('console.common.readingModels')} /></div>
  if (modelsError) return <div className="page-stack video-console-page"><PageTitle title={t('console.video.title')} description={t('console.video.description')} /></div>

  const workspaceNotices: VideoWorkspaceNoticeItem[] = []
  if (requestFailure) workspaceNotices.push({ id: 'request-failure', message: requestFailure.message, requestId: requestFailure.requestId, action: <Button theme="outline" size="small" onClick={() => setRequestFailure(null)}>{t('console.common.close')}</Button> })
  if (apiKeyError) workspaceNotices.push({ id: 'api-key-error', message: apiKeyError, action: <Button theme="outline" size="small" icon={<IconRefresh />} onClick={() => window.location.reload()}>{t('console.common.reload')}</Button> })
  if (!apiKeysLoading && usableApiKeys.length === 0) workspaceNotices.push({ id: 'no-api-key', message: t('console.video.noApiKey'), action: <Link className="workspace-notice-link" to="/console/api-keys">{t('console.video.createApiKey')}</Link> })
  if (selectedApiKey && selectableVideoModels.length === 0) workspaceNotices.push({ id: 'no-key-models', message: t('console.video.noKeyModels') })
  if (!videoModels.length) workspaceNotices.push({ id: 'no-video-models', message: t('console.video.noModelsHint') })
  // 中文：已有任务时优先保留结果卡片，提交/轮询错误直接展示在卡片内，保证仍可编辑、重试和删除。
  const showWorkspaceNotices = workspaceNotices.length > 0 && !submitting && !currentTask

  return <div className="page-stack video-console-page">
    <PageTitle title={t('console.video.title')} description={t('console.video.pageDescription')} />
    <section className="video-workspace experience-workbench" aria-label={t('console.video.workspace')}>
      <VideoHistoryPanel entries={history} selectedID={selectedHistoryID} onSelect={selectHistory} onClear={clearHistory} onNew={startNewGeneration} disabled={operationBusy} open={historyOpen} />
      <div className="video-workspace-main experience-main">
        <header className="video-toolbar experience-toolbar" aria-label={t('console.video.connection')}>
          <div className="video-toolbar-actions experience-toolbar-actions">
            <span className="video-toolbar-workspace" title={store.activeWorkspace.name}>{store.activeWorkspace.name}</span>
            <button className="video-history-toggle" type="button" aria-label={t('console.video.historyTitle')} title={t('console.video.historyTitle')} onClick={() => setHistoryOpen((open) => !open)}><IconHistory /></button>
          </div>
        </header>
        <main className="video-stage experience-content">{showWorkspaceNotices ? <VideoWorkspaceNotice items={workspaceNotices} /> : <VideoStage task={currentTask} entry={selectedHistory} modelName={selectedHistory?.modelName ?? selectedModel?.name ?? t('console.video.unnamedModel')} submitting={submitting} onCancel={currentTask && taskIsActive(currentTask) ? () => { void cancelCurrentTask() } : cancelSubmission} onRetry={retryCurrent} onEdit={editCurrent} onDelete={deleteCurrent} />}</main>
        <footer className="video-composer experience-composer">
          <div className="video-composer-box">
            <div className={`video-composer-input-row${referenceMode === 'first-last' ? ' is-first-last' : ''}`}>
              {referenceMode === 'first-last' ? <div className="video-frame-upload-group">
                <button className="video-reference-upload-card video-frame-upload-card video-frame-upload-card--first" type="button" aria-label={t('console.video.firstFrameUrlLabel')} onClick={() => firstFrameInputRef.current?.click()} disabled={operationBusy}>
                  <span className="video-reference-upload-plus" aria-hidden="true"><IconPlus /></span>
                  <span>{t('console.video.firstFrameUrlLabel').replace(/ URL$/, '')}</span>
                </button>
                <button className="video-frame-upload-separator" type="button" aria-label={t('console.video.swapFrames')} onClick={swapFrameUrls} disabled={operationBusy}><IconChevronUpDown aria-hidden="true" /></button>
                <button className="video-reference-upload-card video-frame-upload-card video-frame-upload-card--last" type="button" aria-label={t('console.video.lastFrameUrlLabel')} onClick={() => lastFrameInputRef.current?.click()} disabled={operationBusy}>
                  <span className="video-reference-upload-plus" aria-hidden="true"><IconPlus /></span>
                  <span>{t('console.video.lastFrameUrlLabel').replace(/ URL$/, '')}</span>
                </button>
                <input ref={firstFrameInputRef} className="video-reference-file-input video-frame-file-input" type="file" accept={VIDEO_REFERENCE_ACCEPT} onChange={(event) => handleFrameFile(event, 'first')} aria-label={t('console.video.firstFrameUrlLabel')} />
                <input ref={lastFrameInputRef} className="video-reference-file-input video-frame-file-input" type="file" accept={VIDEO_REFERENCE_ACCEPT} onChange={(event) => handleFrameFile(event, 'last')} aria-label={t('console.video.lastFrameUrlLabel')} />
                </div> : <button className="video-reference-upload-card" type="button" aria-label={`${t('console.video.referenceImage')} · ${t('console.video.uploadReference')}`} onClick={() => setReferenceVisible(true)} disabled={operationBusy}>
                <span className="video-reference-upload-plus" aria-hidden="true"><IconPlus /></span>
                <span>{t('console.video.referenceImage')}</span>
              </button>}
              {inputReference ? <div className="video-reference-row">
                {referenceUrl ? <span className="video-reference-chip video-reference-chip--url"><IconImage aria-hidden="true" /><span>{referenceUrl}</span><Button theme="borderless" size="small" icon={<IconClose />} aria-label={t('console.video.removeReference')} title={t('console.video.removeReference')} onClick={() => { setInputReference(''); setReferenceUrl(''); setReferenceName('') }} /></span> : <span className="video-reference-chip"><img src={inputReference} alt="" /><span>{referenceName || t('console.video.referenceImage')}</span><Button theme="borderless" size="small" icon={<IconClose />} aria-label={t('console.video.removeReference')} title={t('console.video.removeReference')} onClick={() => { setInputReference(''); setReferenceUrl(''); setReferenceName('') }} /></span>}
              </div> : null}
              <Input.TextArea value={prompt} onChange={(value) => setPrompt(value.slice(0, VIDEO_PROMPT_MAX_LENGTH))} maxLength={VIDEO_PROMPT_MAX_LENGTH} rows={3} disabled={operationBusy} placeholder={selectedModel ? t('console.video.promptPlaceholder') : t('console.video.promptDisabledPlaceholder')} aria-label={t('console.video.promptLabel')} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); if (canSubmit) void submitVideo() } }} />
            </div>
            <div className="video-composer-controls">
              <div className="video-control-group">
                <div className="video-reference-picker">
                  <Select className={`video-control-button video-reference-trigger${referenceMode === 'first-last' ? ' video-reference-trigger--first-last' : ''}`} value={referenceMode} aria-label={t('console.video.referenceImage')} arrowIcon={<IconChevronDownStroked />} dropdownClassName="video-reference-select-dropdown" innerTopSlot={<div className="video-popover-title">{t('console.video.generationMode')}</div>} renderSelectedItem={renderReferenceSelectedItem} onChange={(value) => { const nextMode = String(value) as 'reference' | 'first-last'; setReferenceMode(nextMode); setReferenceVisible(false) }} disabled={operationBusy}>
                    {/* 中文：生成模式选项不显示默认选中勾选，避免图标、勾选和文字错位。 */}
                    <Select.Option value="reference" showTick={false}><span className="video-reference-option-icon"><IconImage aria-hidden="true" /></span><span>{t('console.video.referenceMode')}</span></Select.Option>
                    <Select.Option value="first-last" showTick={false}><span className="video-reference-option-icon"><IconVideo aria-hidden="true" /></span><span>{t('console.video.firstLastFrame')}</span></Select.Option>
                  </Select>
                </div>
                <div className="video-model-picker">
                  <Select id="video-model" className="video-control-button video-model-trigger" dropdownClassName="video-model-select-dropdown" value={selectedModel ? modelAlias(selectedModel) : ''} placeholder={t('console.video.chooseModel')} arrowIcon={<IconChevronDownStroked />} position="topLeft" dropdownMatchSelectWidth={false} filter={false} aria-label={t('console.video.model')} onChange={(value) => { setModelID(String(value)); setRequestFailure(null) }} renderSelectedItem={() => selectedModel ? <><VideoModelLogo model={selectedModel} /><span className="video-model-trigger-label">{selectedModel.company}: {selectedModel.name}</span></> : null} renderOptionItem={({ value, selected }) => { const model = displayVideoModels.find((item) => modelAlias(item) === String(value)); if (!model) return displayVideoModels.length === 0 && String(value) === '' ? <div className="video-model-empty-option">{t('console.video.noModels')}</div> : null; return <div className={`video-model-option${selected ? ' is-selected' : ''}`}><VideoModelLogo model={model} /><span className="video-model-option-name">{model.company}: {model.name}</span><span className="video-model-advanced"><span className="video-model-premium-icon" aria-hidden="true">P</span><em>{t('console.video.advanced')}</em></span></div> }} disabled={operationBusy}><Select.Option value="" disabled={displayVideoModels.length === 0}>{displayVideoModels.length === 0 ? t('console.video.noModels') : t('console.video.chooseModel')}</Select.Option>{displayVideoModels.map((model) => <Select.Option key={model.id} value={modelAlias(model)}>{model.company}: {model.name}</Select.Option>)}</Select>
                </div>
                <div className="video-aspect-picker">
                  <Select className="video-control-button video-aspect-trigger video-panel-select" value="settings" arrowIcon={<IconChevronDownStroked />} dropdownClassName="video-aspect-select-dropdown" aria-label={t('console.video.aspectRatio')} renderSelectedItem={() => <><IconFilterStroked aria-hidden="true" /><span>{aspectRatio} · {resolution}</span></>} innerTopSlot={<div className="video-aspect-popover video-select-panel"><div className="video-aspect-section"><strong>{t('console.video.aspectRatio')}</strong><div className="video-aspect-options">{VIDEO_ASPECT_OPTIONS.map((ratio) => <button type="button" className={aspectRatio === ratio ? 'is-selected' : ''} key={ratio} onClick={() => { setAspectRatio(ratio); setSize(sizeForVideoAspect(ratio, resolution)) }}><span className={`video-ratio-icon ratio-${ratio.replace(':', '-')}`} />{ratio}</button>)}</div></div><div className="video-aspect-section"><strong>{t('console.video.resolution')}</strong><div className="video-resolution-options">{['480P', '720P', '1080P'].map((nextResolution) => <button type="button" className={resolution === nextResolution ? 'is-selected' : ''} key={nextResolution} onClick={() => { setResolution(nextResolution); setSize(sizeForVideoAspect(aspectRatio, nextResolution)) }}>{nextResolution}</button>)}</div></div></div>}>
                    <Select.Option value="settings">{aspectRatio} · {resolution}</Select.Option>
                  </Select>
                </div>
                <div className="video-duration-picker">
                  <Select className="video-control-button video-duration-trigger video-panel-select" value="duration" arrowIcon={<IconChevronDownStroked />} dropdownClassName="video-duration-select-dropdown" aria-label={t('console.video.duration')} renderSelectedItem={() => <><IconClockStroked aria-hidden="true" /><span>{duration}{t('console.video.secondsShort')}</span></>} innerTopSlot={<div className="video-duration-popover video-select-panel"><strong>{t('console.video.durationSelect')}</strong><div className="video-duration-control"><input type="range" min="2" max="30" step="1" value={duration} onChange={(event) => setDuration(Number(event.target.value))} aria-label={t('console.video.duration')} /><div className="video-duration-ticks">{VIDEO_DURATION_SLIDER_OPTIONS.map((value) => <span key={value} style={{ left: `${((value - 2) / 28) * 100}%` }}>{value}</span>)}</div></div><label className="video-duration-number"><input type="number" min="2" max="30" value={duration} onChange={(event) => setDuration(Math.max(2, Math.min(30, Number(event.target.value) || 2)))} aria-label={t('console.video.duration')} /><span>{t('console.video.secondsShort')}</span></label></div>}>
                    <Select.Option value="duration">{duration}{t('console.video.secondsShort')}</Select.Option>
                  </Select>
                </div>
                <button className={`video-control-button video-sound-trigger${soundEnabled ? ' is-active' : ''}`} type="button" onClick={() => setSoundEnabled((enabled) => !enabled)} disabled={operationBusy}>{soundEnabled ? <IconVolume2 aria-hidden="true" /> : <IconMuteStroked aria-hidden="true" />}<span>{t('console.video.sound')}</span></button>
              </div>
              <Button className="video-send-button" theme="solid" type="primary" icon={operationBusy ? <IconStop /> : <IconArrowUp />} aria-label={operationBusy ? (submitting ? t('console.video.cancelRequest') : t('console.video.cancelGeneration')) : t('console.video.generate')} title={operationBusy ? (submitting ? t('console.video.cancelRequest') : t('console.video.cancelGeneration')) : t('console.video.generate')} disabled={false} loading={submitting} onClick={() => { if (submitting) cancelSubmission(); else if (currentTask && taskIsActive(currentTask)) void cancelCurrentTask(); else void submitVideo() }} />
            </div>
          </div>
          <div className="video-composer-hint"><span>{t('console.video.shortcut')}</span><span>{selectedModel ? t('console.video.resultHint') : t('console.video.chooseModelHint')}</span></div>
        </footer>
      </div>
    </section>
    <Modal title={referenceMode === 'reference' ? t('console.video.referenceMode') : t('console.video.firstLastFrame')} visible={referenceVisible} onCancel={() => setReferenceVisible(false)} onOk={() => setReferenceVisible(false)} okText={t('console.common.finish')} cancelText={t('console.common.cancel')}>
      {referenceMode === 'reference' ? <div className="video-reference-dialog"><Input id="video-reference-url" value={referenceUrl} onChange={(value) => { setReferenceUrl(value); setInputReference(value.trim()); setReferenceName('') }} placeholder={t('console.video.referenceUrlPlaceholder')} aria-label={t('console.video.referenceUrlLabel')} disabled={operationBusy} /><input ref={referenceInputRef} className="video-reference-file-input" type="file" accept={VIDEO_REFERENCE_ACCEPT} onChange={handleReferenceFile} aria-label={t('console.video.referenceImage')} /><Button className="video-control-button" theme="borderless" icon={<IconImage />} onClick={() => referenceInputRef.current?.click()} disabled={operationBusy}>{t('console.video.referenceImage')}</Button></div> : <div className="video-reference-dialog"><Input id="video-first-frame-url" value={firstFrameUrl} onChange={(value) => { setFirstFrameUrl(value); setInputReference(value.trim()) }} placeholder={t('console.video.firstFrameUrlPlaceholder')} aria-label={t('console.video.firstFrameUrlLabel')} disabled={operationBusy} /><Input id="video-last-frame-url" value={lastFrameUrl} onChange={setLastFrameUrl} placeholder={t('console.video.lastFrameUrlPlaceholder')} aria-label={t('console.video.lastFrameUrlLabel')} disabled={operationBusy} /></div>}
    </Modal>
  </div>
}
