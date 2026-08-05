import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button, Modal, Toast } from '@douyinfe/semi-ui'
import { IconAlertTriangle, IconArrowUp, IconCheckCircleStroked, IconClose, IconDeleteStroked, IconDownload, IconHistory, IconImage, IconLoading, IconRefresh, IconSetting, IconStop, IconVideo } from '@douyinfe/semi-icons'
import { BannerNotice, EmptyPanel, PageTitle } from '@/components/common'
import { CompatInput as Input, CompatSelect as Select } from '@/components/semi-compat'
import { getUserApiKeys, type UserApiKey, type UserApiKeyContext } from '@/api/user-api-keys'
import { cancelVideoTask, getVideoTask, submitVideoGeneration, videoTaskIsTerminal, VideoRuntimeError, type VideoTask, type VideoTaskStatus } from '@/api/video-runtime'
import { isAuthenticationFailure } from '@/api/http'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'
import { useAppStore } from '@/data/app-state'
import { findModelInList, modelAlias, type ModelRecord } from '@/data/models'
import { useUserModels } from '@/data/user-models'
import { apiKeySupportsModel } from '@/utils/model-access'

const VIDEO_HISTORY_STORAGE_KEY = 'token-nx:video-history:v1'
const VIDEO_HISTORY_LIMIT = 20
const VIDEO_PROMPT_MAX_LENGTH = 8_000
const VIDEO_REFERENCE_MAX_BYTES = 4 * 1024 * 1024
const VIDEO_REFERENCE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'
const VIDEO_POLL_INITIAL_DELAY_MS = 1_000
const VIDEO_POLL_INTERVAL_MS = 2_500
const VIDEO_POLL_MAX_ATTEMPTS = 120
const DEFAULT_VIDEO_DURATION = 5
const DEFAULT_VIDEO_SIZE = '1280x720'

const VIDEO_DURATION_OPTIONS = [5, 10] as const
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
    && typeof value.size === 'string'
    && (value.inputReference === null || typeof value.inputReference === 'string')
    && isVideoTaskStatus(value.status)
    && (value.progress === null || typeof value.progress === 'number')
    && (value.resultUrl === null || typeof value.resultUrl === 'string')
    && (value.thumbnailUrl === null || typeof value.thumbnailUrl === 'string')
    && (value.errorMessage === null || typeof value.errorMessage === 'string')
    && typeof value.requestId === 'string'
    && typeof value.createdAt === 'string'
}

function readVideoHistory(): VideoHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(VIDEO_HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isVideoHistoryEntry).slice(0, VIDEO_HISTORY_LIMIT) : []
  } catch {
    return []
  }
}

function writeVideoHistory(entries: VideoHistoryEntry[]): void {
  try {
    window.localStorage.setItem(VIDEO_HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, VIDEO_HISTORY_LIMIT)))
  } catch {
    // 中文：历史记录只影响本地展示，浏览器存储不可用时不阻断真实任务提交。
  }
}

function workspaceKeyFor(context: UserApiKeyContext): string {
  return context.account_type === 'enterprise' ? `${context.account_type}:${context.enterprise_id}` : 'personal:personal'
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

function VideoHistoryPanel({ entries, selectedID, onSelect, onClear, onNew, disabled }: { entries: VideoHistoryEntry[]; selectedID: string; onSelect: (entry: VideoHistoryEntry) => void; onClear: () => void; onNew: () => void; disabled: boolean }) {
  const { t } = useTranslation()
  return <aside className="video-history-panel experience-history" aria-labelledby="video-history-heading">
    <div className="video-history-heading experience-history-heading"><h2 id="video-history-heading">{t('console.video.historyTitle')}</h2><div className="video-history-actions"><Button className="video-new-button" theme="outline" size="small" onClick={onNew} disabled={disabled}>{t('console.video.newGeneration')}</Button><Button theme="borderless" size="small" icon={<IconDeleteStroked />} aria-label={t('console.video.clearHistory')} title={t('console.video.clearHistory')} onClick={onClear} disabled={entries.length === 0 || disabled} /></div></div>
    {entries.length ? <div className="video-history-list">{entries.map((entry) => <button className={`video-history-item${entry.id === selectedID ? ' is-active' : ''}`} type="button" key={entry.id} onClick={() => onSelect(entry)}>
      <span className="video-history-item-top"><strong>{entry.modelName}</strong><span className={`video-history-status is-${entry.status}`}>{t(videoStatusLabelKey(entry.status))}</span></span>
      <span className="video-history-item-prompt">{entry.prompt}</span>
      <span className="video-history-item-meta">{formatVideoDate(entry.createdAt)} · {entry.duration}s · {entry.size}</span>
    </button>)}</div> : <div className="video-history-empty"><IconHistory aria-hidden="true" /><p>{t('console.video.historyEmpty')}</p><span>{t('console.video.historyEmptyHint')}</span></div>}
  </aside>
}

function VideoStage({ task, modelName, submitting, onCancel, onRetry }: { task: VideoTask | null; modelName: string; submitting: boolean; onCancel: () => void; onRetry: () => void }) {
  const { t } = useTranslation()
  if (submitting && !task) return <div className="video-stage-state video-stage-state--loading" role="status" aria-label={t('console.video.submitting')}><span className="video-loading-ring"><IconLoading /></span><strong>{t('console.video.submitting')}</strong><p>{t('console.video.submittingHint')}</p><Button theme="borderless" size="small" icon={<IconStop />} onClick={onCancel}>{t('console.video.cancelRequest')}</Button></div>
  if (!task) return <div className="video-stage-state video-stage-state--empty"><span className="video-stage-icon"><IconVideo aria-hidden="true" /></span><strong>{t('console.video.emptyTitle')}</strong><p>{t('console.video.emptyHint')}</p></div>

  const statusLabel = t(videoStatusLabelKey(task.status))
  if (task.status === 'succeeded' && task.resultUrl) return <div className="video-result-view"><div className="video-result-frame"><video controls preload="metadata" poster={task.thumbnailUrl ?? undefined} src={task.resultUrl} aria-label={t('console.video.resultVideo')}><track kind="captions" /></video></div><div className="video-result-summary"><div><span>{t('console.video.resultModel')}</span><strong>{modelName}</strong></div><div><span>{t('console.video.taskId')}</span><code>{task.taskId}</code></div><div><span>{t('console.video.taskStatus')}</span><strong className="video-status-success"><IconCheckCircleStroked aria-hidden="true" />{statusLabel}</strong></div></div><div className="video-result-actions"><a className="video-result-link" href={task.resultUrl} target="_blank" rel="noreferrer"><IconDownload aria-hidden="true" />{t('console.video.openResult')}</a><Button theme="outline" size="small" icon={<IconRefresh />} onClick={onRetry}>{t('console.video.retry')}</Button></div></div>
  if (task.status === 'succeeded') return <div className="video-stage-state video-stage-state--warning"><span className="video-stage-icon"><IconAlertTriangle aria-hidden="true" /></span><strong>{t('console.video.resultUnavailable')}</strong><p>{t('console.video.resultUnavailableHint')}</p><Button theme="outline" size="small" icon={<IconRefresh />} onClick={onRetry}>{t('console.video.retry')}</Button></div>
  if (task.status === 'failed' || task.status === 'expired' || task.status === 'cancelled' || task.status === 'unknown') return <div className="video-stage-state video-stage-state--warning"><span className="video-stage-icon"><IconAlertTriangle aria-hidden="true" /></span><strong>{statusLabel}</strong><p>{task.errorMessage ?? t('console.video.taskFailedHint')}</p>{task.requestId ? <code className="video-request-id">{t('console.common.requestIdValue', { requestId: task.requestId })}</code> : null}<Button theme="outline" size="small" icon={<IconRefresh />} onClick={onRetry}>{t('console.video.retry')}</Button></div>

  const progress = task.progress ?? 0
  return <div className="video-stage-state video-stage-state--loading" role="status" aria-label={statusLabel}><span className="video-loading-ring"><IconLoading /></span><strong>{statusLabel}</strong><p>{t('console.video.processingHint')}</p><div className="video-progress" role="progressbar" aria-label={t('console.video.progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div><div className="video-task-meta"><code>{task.taskId}</code><span>{progress > 0 ? `${progress}%` : t('console.video.progressPreparing')}</span></div><Button theme="borderless" size="small" icon={<IconStop />} onClick={onCancel}>{task.status === 'cancelling' ? t('console.video.statusCancelling') : t('console.video.cancelGeneration')}</Button></div>
}

export function VideoPage() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const store = useAppStore()
  const [searchParams] = useSearchParams()
  const { models, loading: modelsLoading, error: modelsError, refresh: refreshModels } = useUserModels()
  const workspaceContext = useMemo<UserApiKeyContext>(() => store.activeWorkspace.type === 'enterprise' ? { account_type: 'enterprise', enterprise_id: store.activeWorkspace.id } : { account_type: 'personal' }, [store.activeWorkspace.id, store.activeWorkspace.type])
  const workspaceKey = workspaceKeyFor(workspaceContext)
  const requestedModel = searchParams.get('model') ?? ''
  const [apiKeys, setApiKeys] = useState<UserApiKey[]>([])
  const [selectedApiKeyID, setSelectedApiKeyID] = useState('')
  const [apiKeysLoading, setApiKeysLoading] = useState(true)
  const [apiKeyError, setApiKeyError] = useState('')
  const [modelID, setModelID] = useState(requestedModel)
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState(DEFAULT_VIDEO_DURATION)
  const [size, setSize] = useState(DEFAULT_VIDEO_SIZE)
  const [inputReference, setInputReference] = useState('')
  const [referenceUrl, setReferenceUrl] = useState('')
  const [referenceName, setReferenceName] = useState('')
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [referenceVisible, setReferenceVisible] = useState(false)
  const [history, setHistory] = useState<VideoHistoryEntry[]>(() => readVideoHistory().filter((entry) => entry.workspaceKey === workspaceKey))
  const [selectedHistoryID, setSelectedHistoryID] = useState('')
  const [currentTask, setCurrentTask] = useState<VideoTask | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [polling, setPolling] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [requestFailure, setRequestFailure] = useState<VideoRequestFailure | null>(null)
  const referenceInputRef = useRef<HTMLInputElement>(null)
  const submitControllerRef = useRef<AbortController | null>(null)
  const submitAbortReasonRef = useRef<'user' | 'navigation' | null>(null)
  const pollControllerRef = useRef<AbortController | null>(null)
  const lastSubmissionRef = useRef<VideoSubmissionSnapshot | null>(null)

  const usableApiKeys = useMemo(() => apiKeys.filter((key) => key.status === 'active' && key.secret.trim()), [apiKeys])
  const selectedApiKey = usableApiKeys.find((key) => key.id === selectedApiKeyID)
  const videoModels = useMemo(() => models.filter((model) => model.modality === 'video' && Boolean(modelAlias(model))), [models])
  const selectableVideoModels = useMemo(() => selectedApiKey ? videoModels.filter((model) => apiKeySupportsModel(selectedApiKey, model)) : [], [selectedApiKey, videoModels])
  const selectedModel = findModelInList(selectableVideoModels, modelID) ?? selectableVideoModels[0]
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
    setSelectedApiKeyID('')
    setApiKeysLoading(true)
    setApiKeyError('')
    setModelID(requestedModel)
    setCurrentTask(null)
    setSelectedHistoryID('')
    setSubmitting(false)
    setPolling(false)
    setCancelling(false)
    setRequestFailure(null)
    setHistory(readVideoHistory().filter((entry) => entry.workspaceKey === workspaceKey))
    setReferenceVisible(false)
  }, [requestedModel, workspaceKey])

  useEffect(() => {
    let active = true
    setApiKeysLoading(true)
    setApiKeyError('')
    void getUserApiKeys(workspaceContext, 'active').then((result) => {
      if (!active) return
      const keys = result.items
      setApiKeys(keys)
      const firstUsable = keys.find((key) => key.status === 'active' && key.secret.trim())
      setSelectedApiKeyID((current) => current && keys.some((key) => key.id === current) ? current : firstUsable?.id ?? '')
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
    const allEntries = readVideoHistory()
    writeVideoHistory([entry, ...allEntries.filter((item) => item.id !== entry.id)])
  }

  function updateHistoryEntry(entry: VideoHistoryEntry): void {
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
      setRequestFailure(readVideoFailure(error, t('console.video.submitFailed')))
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
    const allEntries = readVideoHistory().filter((entry) => entry.workspaceKey !== workspaceKey)
    writeVideoHistory(allEntries)
    setHistory([])
    setSelectedHistoryID('')
    setCurrentTask(null)
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
    setDuration(DEFAULT_VIDEO_DURATION)
    setSize(DEFAULT_VIDEO_SIZE)
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
  if (modelsError) return <div className="page-stack video-console-page"><PageTitle title={t('console.video.title')} description={t('console.video.description')} /><EmptyPanel title={t('console.common.modelCatalogFailed')} description={modelsError} action={<Button theme="outline" icon={<IconRefresh />} onClick={refreshModels}>{t('console.common.reload')}</Button>} /></div>

  return <div className="page-stack video-console-page">
    <PageTitle title={t('console.video.title')} description={t('console.video.pageDescription')} />
    {apiKeyError ? <BannerNotice tone="warning"><span>{apiKeyError}</span><Button theme="borderless" size="small" icon={<IconRefresh />} onClick={() => window.location.reload()}>{t('console.common.reload')}</Button></BannerNotice> : null}
    {!apiKeysLoading && usableApiKeys.length === 0 ? <BannerNotice tone="warning"><span>{t('console.video.noApiKey')}</span><Link to="/console/api-keys">{t('console.video.createApiKey')}</Link></BannerNotice> : null}
    {selectedApiKey && selectableVideoModels.length === 0 ? <BannerNotice tone="warning">{t('console.video.noKeyModels')}</BannerNotice> : null}
    {!videoModels.length ? <BannerNotice tone="warning">{t('console.video.noModelsHint')}</BannerNotice> : null}
    {requestFailure ? <BannerNotice tone="warning"><span className="video-request-error"><strong>{requestFailure.message}</strong>{requestFailure.requestId ? <code>{t('console.common.requestIdValue', { requestId: requestFailure.requestId })}</code> : null}</span><Button theme="borderless" size="small" onClick={() => setRequestFailure(null)}>{t('console.common.close')}</Button></BannerNotice> : null}
    <section className="video-workspace experience-workbench" aria-label={t('console.video.workspace')}>
      <VideoHistoryPanel entries={history} selectedID={selectedHistoryID} onSelect={selectHistory} onClear={clearHistory} onNew={startNewGeneration} disabled={operationBusy} />
      <div className="video-workspace-main experience-main">
        <header className="video-toolbar experience-toolbar" aria-label={t('console.video.connection')}>
          <div className="video-toolbar-actions experience-toolbar-actions">
            <span className="video-toolbar-workspace" title={store.activeWorkspace.name}>{store.activeWorkspace.name}</span>
            <label htmlFor="video-api-key">{t('console.video.apiKey')}</label>
            <Select id="video-api-key" className="video-api-key-select" dropdownClassName="video-select-dropdown" value={selectedApiKey?.id ?? ''} onChange={(value) => { setSelectedApiKeyID(String(value)); setModelID(''); setCurrentTask(null); setSelectedHistoryID(''); setRequestFailure(null) }} disabled={apiKeysLoading || usableApiKeys.length === 0} aria-label={t('console.video.apiKey')}><Select.Option value="">{apiKeysLoading ? t('console.video.apiKeyLoading') : t('console.video.selectApiKey')}</Select.Option>{usableApiKeys.map((key) => <Select.Option key={key.id} value={key.id}>{key.name} · {key.masked_key}</Select.Option>)}</Select>
            <Link className="video-key-link" to="/console/api-keys">{t('console.video.manageApiKey')}</Link>
          </div>
        </header>
        <main className="video-stage experience-content"><VideoStage task={currentTask} modelName={selectedHistory?.modelName ?? selectedModel?.name ?? t('console.video.unnamedModel')} submitting={submitting} onCancel={currentTask && taskIsActive(currentTask) ? () => { void cancelCurrentTask() } : cancelSubmission} onRetry={retryCurrent} /></main>
        <footer className="video-composer experience-composer">
          <div className="video-composer-box">
            {inputReference ? <div className="video-reference-row">
              {referenceUrl ? <span className="video-reference-chip video-reference-chip--url"><IconImage aria-hidden="true" /><span>{referenceUrl}</span><Button theme="borderless" size="small" icon={<IconClose />} aria-label={t('console.video.removeReference')} title={t('console.video.removeReference')} onClick={() => { setInputReference(''); setReferenceUrl(''); setReferenceName('') }} /></span> : <span className="video-reference-chip"><img src={inputReference} alt="" /><span>{referenceName || t('console.video.referenceImage')}</span><Button theme="borderless" size="small" icon={<IconClose />} aria-label={t('console.video.removeReference')} title={t('console.video.removeReference')} onClick={() => { setInputReference(''); setReferenceUrl(''); setReferenceName('') }} /></span>}
            </div> : null}
            <Input.TextArea value={prompt} onChange={(value) => setPrompt(value.slice(0, VIDEO_PROMPT_MAX_LENGTH))} maxLength={VIDEO_PROMPT_MAX_LENGTH} rows={3} disabled={!selectedApiKey || !selectedModel || operationBusy} placeholder={selectedApiKey && selectedModel ? t('console.video.promptPlaceholder') : t('console.video.promptDisabledPlaceholder')} aria-label={t('console.video.promptLabel')} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); if (canSubmit) void submitVideo() } }} />
            <div className="video-composer-controls">
              <div className="video-control-group">
                <Button className="video-control-button" theme="borderless" icon={<IconImage />} onClick={() => setReferenceVisible(true)} disabled={!selectedApiKey || operationBusy}>{t('console.video.referenceImage')}</Button>
                <Select id="video-model" className="video-model-select" dropdownClassName="video-select-dropdown" value={selectedModel ? modelAlias(selectedModel) : ''} onChange={(value) => { setModelID(String(value)); setRequestFailure(null) }} disabled={selectableVideoModels.length === 0 || operationBusy} aria-label={t('console.video.model')}><Select.Option value="">{t('console.video.chooseModel')}</Select.Option>{selectableVideoModels.map((model) => <Select.Option key={model.id} value={modelAlias(model)}>{t('console.video.modelOption', { name: model.name, company: model.company, alias: modelAlias(model) })}</Select.Option>)}</Select>
                <Button className="video-control-button" theme="borderless" icon={<IconSetting />} onClick={() => setSettingsVisible(true)} disabled={!selectedModel || operationBusy}>{t('console.video.settings')}</Button>
              </div>
              <Button className="video-send-button" theme="solid" type="primary" icon={operationBusy ? <IconStop /> : <IconArrowUp />} aria-label={operationBusy ? (submitting ? t('console.video.cancelRequest') : t('console.video.cancelGeneration')) : t('console.video.generate')} title={operationBusy ? (submitting ? t('console.video.cancelRequest') : t('console.video.cancelGeneration')) : t('console.video.generate')} disabled={operationBusy ? false : !canSubmit} loading={submitting} onClick={() => { if (submitting) cancelSubmission(); else if (currentTask && taskIsActive(currentTask)) void cancelCurrentTask(); else void submitVideo() }} />
            </div>
          </div>
          <div className="video-composer-hint"><span>{t('console.video.shortcut')}</span><span>{t('console.video.parametersSummary', { duration, size })} · {selectedModel ? t('console.video.resultHint') : t('console.video.chooseModelHint')}</span></div>
        </footer>
      </div>
    </section>
    <Modal title={t('console.video.referenceImage')} visible={referenceVisible} onCancel={() => setReferenceVisible(false)} onOk={() => setReferenceVisible(false)} okText={t('console.common.finish')} cancelText={t('console.common.cancel')}><div className="video-reference-dialog"><Input id="video-reference-url" value={referenceUrl} onChange={(value) => { setReferenceUrl(value); setInputReference(value.trim()); setReferenceName('') }} placeholder={t('console.video.referenceUrlPlaceholder')} aria-label={t('console.video.referenceUrlLabel')} disabled={!selectedApiKey || operationBusy} /><input ref={referenceInputRef} className="video-reference-file-input" type="file" accept={VIDEO_REFERENCE_ACCEPT} onChange={handleReferenceFile} aria-label={t('console.video.referenceImage')} /><Button className="video-control-button" theme="borderless" icon={<IconImage />} onClick={() => referenceInputRef.current?.click()} disabled={!selectedApiKey || operationBusy}>{t('console.video.referenceImage')}</Button></div></Modal>
    <Modal title={t('console.video.settingsTitle')} visible={settingsVisible} onCancel={() => setSettingsVisible(false)} onOk={() => setSettingsVisible(false)} okText={t('console.common.finish')} cancelText={t('console.common.cancel')}><div className="video-settings-form"><label className="field-label" htmlFor="video-duration">{t('console.video.duration')}</label><Select id="video-duration" value={duration} onChange={(value) => setDuration(Number(value))} block>{VIDEO_DURATION_OPTIONS.map((value) => <Select.Option value={value} key={value}>{t('console.video.durationOption', { value })}</Select.Option>)}</Select><label className="field-label" htmlFor="video-size">{t('console.video.resolution')}</label><Select id="video-size" value={size} onChange={(value) => setSize(String(value))} block>{VIDEO_SIZE_OPTIONS.map((option) => <Select.Option value={option.value} key={option.value}>{t(option.labelKey)} · {option.value}</Select.Option>)}</Select><p className="video-settings-hint">{t('console.video.settingsHint')}</p></div></Modal>
  </div>
}
