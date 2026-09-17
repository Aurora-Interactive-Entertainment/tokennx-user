import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Dropdown from '@douyinfe/semi-ui/lib/es/dropdown'
import type { RenderSingleSelectedItemFn } from '@douyinfe/semi-ui/lib/es/select'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { IconAlertTriangle, IconArrowUp, IconCheckCircleStroked, IconChevronDownStroked, IconClose, IconDeleteStroked, IconDownload, IconEditStroked, IconHistory, IconImage, IconInfoCircle, IconLoading, IconMoreStroked, IconRefresh, IconStop, IconVideo, IconVolume2 } from '@douyinfe/semi-icons'
import { EmptyPanel, PageTitle } from '@/components/common'
import { appToast } from '@/components/app-toast'
import { CompatInput as Input, CompatSelect as Select } from '@/components/semi-compat'
import { WaveBackground } from '@/components/wave-background'
import { cancelVideoTask, getVideoTask, submitVideoGeneration, videoTaskIsTerminal, VideoRuntimeError, type VideoReference, type VideoTask, type VideoTaskStatus } from '@/api/video-runtime'
import type { UserVideoOptions } from '@/api/user-models'
import { getAccessToken } from '@/auth/token-storage'
import { isAuthenticationFailure } from '@/api/http'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppStore } from '@/data/app-state'
import { findModelInList, modelAlias, type ModelRecord } from '@/data/models'
import { useUserModels } from '@/data/user-models'
import { useBuildUpdateBlocker } from '@/runtime/use-build-update-blocker'
import { workspaceContextFor, workspaceContextKey, type WorkspaceAccountContext } from '@/utils/workspace'
import { LEGACY_VIDEO_HISTORY_KEY, VIDEO_SESSION_HISTORY_KEY, readUserSessionHistory, writeUserSessionHistory } from '@/utils/ephemeral-history'
import { isVideoDurationAllowed, normalizeVideoOptions, validateVideoParameters, type NormalizedVideoOptions } from '@/utils/video-options'
import { VideoParameterControls } from './video-parameter-controls'
import { VideoReferenceMedia } from './video-reference-media'
import './video-generation.css'
import './video-generation-mobile.css'

const VIDEO_HISTORY_LIMIT = 20
const VIDEO_PROMPT_MAX_LENGTH = 8_000
const VIDEO_POLL_INITIAL_DELAY_MS = 1_000
const VIDEO_POLL_INTERVAL_MS = 2_500
const VIDEO_POLL_MAX_ATTEMPTS = 120
const DEFAULT_VIDEO_DURATION = 5
const DEFAULT_VIDEO_SIZE = '1280x720'
// 提交阶段就失败、服务端还没生成 task_id 的记录用这个前缀，重试时可以安全复用原幂等键重放。
const LOCAL_FAILURE_TASK_PREFIX = 'local-failed-'

// 旧模型与新目录校验共用同一组尺寸，避免界面和请求限制分叉。
const VIDEO_SIZE_OPTIONS = normalizeVideoOptions().sizes

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
  ratio?: string
  resolution?: string
  references?: VideoReference[]
  missingReferences?: boolean
  referenceCount?: number
  status: VideoTaskStatus
  progress: number | null
  resultUrl: string | null
  thumbnailUrl: string | null
  errorMessage: string | null
  requestId: string
  createdAt: string
}

type VideoSubmissionSnapshot = {
  model: string
  modelId: string
  modelName: string
  prompt: string
  duration: number
  size: string
  inputReference: string
  ratio?: string
  resolution?: string
  references?: VideoReference[]
  videoOptions?: UserVideoOptions
  missingReferences?: boolean
  idempotencyKey: string
  historyId?: string
}

type VideoRequestFailure = {
  message: string
  requestId: string | null
}

type VideoDraft = Pick<VideoSubmissionSnapshot, 'model' | 'prompt' | 'duration' | 'size' | 'inputReference' | 'ratio' | 'resolution' | 'references'> & {
  referenceMode: 'reference' | 'first-last'
  firstFrameUrl: string
  lastFrameUrl: string
}

function emptyVideoDraft(model: string, options = normalizeVideoOptions()): VideoDraft {
  return { model, prompt: '', duration: options.defaultDuration, size: options.defaultSize, inputReference: '', ratio: options.hasVideoOptions ? options.defaultRatio : undefined, resolution: options.hasVideoOptions ? options.defaultResolution : undefined, references: options.hasVideoOptions ? [] : undefined, referenceMode: 'reference', firstFrameUrl: '', lastFrameUrl: '' }
}

function sameVideoDraft(left: VideoDraft, right: VideoDraft): boolean {
  return (Object.keys(left) as Array<keyof VideoDraft>).every((key) => key === 'references' ? JSON.stringify(left[key]) === JSON.stringify(right[key]) : left[key] === right[key])
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
    && (value.ratio === undefined || typeof value.ratio === 'string')
    && (value.resolution === undefined || typeof value.resolution === 'string')
    && (value.references === undefined || (Array.isArray(value.references) && value.references.every((item) => isRecord(item) && ['image', 'video', 'audio'].includes(String(item.type)) && typeof item.url === 'string' && (item.role === undefined || ['reference_image', 'first_frame', 'last_frame', 'reference_video', 'reference_audio'].includes(String(item.role))))))
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
    // 大型本地素材只留在内存；刷新后明确要求重新补充，不能悄悄生成无参考的视频。
    references: entry.references?.filter((item) => isPersistableReference(item.url) && item.url.length <= 4_096),
    missingReferences: entry.missingReferences || Boolean(entry.inputReference && !inputReference) || Boolean(entry.references?.some((item) => !isPersistableReference(item.url) || item.url.length > 4_096)),
    referenceCount: entry.referenceCount ?? (entry.references?.length || (entry.inputReference ? 1 : 0)),
    resultUrl: clip(entry.resultUrl, 4_096),
    thumbnailUrl: clip(entry.thumbnailUrl, 4_096),
    errorMessage: clip(entry.errorMessage, 4_000),
    requestId: entry.requestId.slice(0, 512),
    createdAt: entry.createdAt.slice(0, 128),
  }
}

function writeVideoHistory(userId: string | null, entries: VideoHistoryEntry[]): boolean {
  return writeUserSessionHistory(VIDEO_SESSION_HISTORY_KEY, userId, entries.map(compactVideoHistoryEntry), VIDEO_HISTORY_LIMIT)
}

function workspaceKeyFor(context: WorkspaceAccountContext): string {
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
    let settled = false
    const cleanup = () => {
      window.clearTimeout(timer)
      signal.removeEventListener('abort', abort)
    }
    const finish = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const timer = window.setTimeout(finish, delay)
    const abort = (): void => {
      if (settled) return
      settled = true
      cleanup()
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
      <span className="video-history-item-meta">{formatVideoDate(entry.createdAt)} · {entry.duration === -1 ? t('console.video.autoDuration') : `${entry.duration}${t('console.video.secondsShort')}`} · {[entry.ratio === 'adaptive' ? t('console.video.adaptiveRatio') : entry.ratio, entry.resolution?.toUpperCase(), entry.size].filter(Boolean).join(' · ')}</span>
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

// 记录按自然日分组，同一天的生成归到同一个日期标题下。
function videoDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

function videoDayLabel(date: Date, language: string, today: string, yesterday: string): string {
  const now = new Date()
  if (videoDayKey(date) === videoDayKey(now)) return today
  if (videoDayKey(date) === videoDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return yesterday
  return date.toLocaleDateString(language.startsWith('en') ? 'en-US' : 'zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

type VideoRecordGroup = { key: string; label: string; entries: VideoHistoryEntry[] }

function videoRecordGroups(entries: VideoHistoryEntry[], language: string, today: string, yesterday: string): VideoRecordGroup[] {
  // 按对话式排布：越旧越靠上，最新一条落在列表底部（entries 本身是最新在前，这里整体倒过来）。
  return [...entries].reverse().reduce<VideoRecordGroup[]>((groups, entry) => {
    const date = new Date(entry.createdAt)
    const valid = !Number.isNaN(date.getTime())
    const key = valid ? videoDayKey(date) : entry.createdAt
    const current = groups[groups.length - 1]
    if (current?.key === key) {
      current.entries.push(entry)
      return groups
    }
    groups.push({ key, label: valid ? videoDayLabel(date, language, today, yesterday) : entry.createdAt, entries: [entry] })
    return groups
  }, [])
}

type VideoRecordHandlers = {
  onCancel: (entry: VideoHistoryEntry) => void
  onRetry: (entry: VideoHistoryEntry) => void
  onEdit: (entry: VideoHistoryEntry) => void
  onDelete: (entry: VideoHistoryEntry) => void
}

function VideoRecordActions({ entry, statusLabel, succeeded, isActive, generating, handlers }: { entry: VideoHistoryEntry; statusLabel: string; succeeded: boolean; isActive: boolean; generating: boolean; handlers: VideoRecordHandlers }) {
  const { t } = useTranslation()
  const cancellingThis = entry.status === 'cancelling'
  return <div className="video-record-actions">
    {/* 终态在操作行标出结果；生成中把状态标在画面上，避免同一状态出现两遍。 */}
    {!isActive ? <span className={`video-task-status is-${entry.status}${succeeded ? ' video-status-success' : ''}`}>{succeeded ? <IconCheckCircleStroked aria-hidden="true" /> : null}{statusLabel}</span> : null}
    <Button theme="outline" size="small" icon={<IconEditStroked />} onClick={() => handlers.onEdit(entry)}>{t('console.video.edit')}</Button>
    {/* 同一时刻只允许一个生成任务，已有任务在跑时「重新生成」开不了新任务，直接禁用而不是点了没反应。 */}
    <Button theme="outline" size="small" icon={<IconRefresh />} disabled={generating} onClick={() => handlers.onRetry(entry)}>{t('console.video.retry')}</Button>
    <Dropdown trigger="click" position="bottomLeft" showTick={false} contentClassName="video-task-more-dropdown" menu={[{ node: 'item', name: t('console.video.delete'), type: 'danger', icon: <IconDeleteStroked />, onClick: () => handlers.onDelete(entry) }]}><Button theme="outline" size="small" icon={<IconMoreStroked />} disabled={isActive} aria-label={t('console.video.moreActions')} title={t('console.video.moreActions')} /></Dropdown>
    {/* 取消中已经发过 DELETE，重复点击只会再打一次接口。 */}
    {isActive ? <Button theme="borderless" size="small" icon={<IconStop />} disabled={cancellingThis} onClick={() => handlers.onCancel(entry)}>{cancellingThis ? t('console.video.statusCancelling') : t('console.video.cancelGeneration')}</Button> : null}
  </div>
}

function VideoRecordBody({ entry, statusLabel }: { entry: VideoHistoryEntry; statusLabel: string }) {
  const { t } = useTranslation()
  if (entry.status === 'succeeded') {
    if (!entry.resultUrl) return <div className="video-task-placeholder"><IconAlertTriangle aria-hidden="true" /><span>{t('console.video.resultUnavailable')}</span><small>{t('console.video.resultUnavailableHint')}</small></div>
    return <div className="video-task-result"><div className="video-result-frame"><video controls preload="metadata" poster={entry.thumbnailUrl ?? undefined} src={entry.resultUrl} aria-label={t('console.video.resultVideo')}><track kind="captions" /></video></div><a className="video-result-link" href={entry.resultUrl} target="_blank" rel="noreferrer"><IconDownload aria-hidden="true" />{t('console.video.openResult')}</a></div>
  }
  const progress = entry.progress ?? 0
  // 用户主动取消不是故障，用中性提示而不是红色报错卡。
  if (entry.status === 'cancelled') return <div className="video-task-placeholder"><IconStop aria-hidden="true" /><span>{t('console.video.statusCancelled')}</span></div>
  if (entry.status === 'failed' || entry.status === 'expired' || entry.status === 'unknown') {
    return <div className="video-task-error" role="alert"><span className="video-task-error-icon"><IconClose aria-hidden="true" /></span><p>{entry.errorMessage ?? t('console.video.taskFailedHint')}</p>{entry.requestId ? <code>{t('console.common.requestIdValue', { requestId: entry.requestId })}</code> : null}</div>
  }
  // 生成中先占住结果的位置：与成片同宽的 16:9 画框，左上角标状态。
  return <div className="video-task-render" role="status" aria-label={statusLabel}>
    <WaveBackground />
    <span className="video-task-render-badge">{statusLabel}</span>
    <div className="video-progress" role="progressbar" aria-label={t('console.video.progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
  </div>
}

function VideoRecord({ entry, generating, handlers }: { entry: VideoHistoryEntry; generating: boolean; handlers: VideoRecordHandlers }) {
  const { t } = useTranslation()
  const statusLabel = t(videoStatusLabelKey(entry.status))
  const isActive = !videoTaskIsTerminal(entry.status) && entry.status !== 'unknown'
  const succeeded = entry.status === 'succeeded'
  return <article className="video-record" data-task-id={entry.taskId} aria-label={entry.prompt}>
    <h3 className="video-record-prompt">{entry.prompt}</h3>
    <p className="video-record-meta">{entry.modelName} · {entry.duration === -1 ? t('console.video.autoDuration') : `${entry.duration}${t('console.video.secondsShort')}`}{entry.resolution ? ` · ${entry.resolution.toUpperCase()}` : ''}{entry.ratio ? ` · ${entry.ratio === 'adaptive' ? t('console.video.adaptiveRatio') : entry.ratio}` : ''} <IconInfoCircle aria-hidden="true" /></p>
    <div className="video-record-body"><VideoRecordBody entry={entry} statusLabel={statusLabel} /></div>
    <VideoRecordActions entry={entry} statusLabel={statusLabel} succeeded={succeeded} isActive={isActive} generating={generating} handlers={handlers} />
  </article>
}

function VideoTimeline({ entries, submitting, pendingPrompt, generating, onCancelSubmit, handlers }: { entries: VideoHistoryEntry[]; submitting: boolean; pendingPrompt: string; generating: boolean; onCancelSubmit: () => void; handlers: VideoRecordHandlers }) {
  const { t, i18n } = useTranslation()
  const timelineRef = useRef<HTMLDivElement>(null)
  const initialPassRef = useRef(true)
  const recordCount = entries.length
  useEffect(() => {
    const node = timelineRef.current
    // 进入页面先直接落到底部：平滑动画会被随后加载的成片、海报布局打断在半路。
    // 之后只在条数变化（新任务出现）时贴底，进度刷新不打断用户阅读。
    const initialPass = initialPassRef.current
    initialPassRef.current = false
    // jsdom 不实现 scrollIntoView，先判存在；生产环境才有平滑滚动。
    if (!node || typeof node.scrollIntoView !== 'function') return
    node.scrollIntoView({ block: 'end', behavior: initialPass ? 'auto' : 'smooth' })
  }, [recordCount])

  if (!entries.length && !submitting) return <div className="video-stage-state video-stage-state--empty"><span className="video-stage-icon"><IconVideo aria-hidden="true" /></span><strong>{t('console.video.emptyTitle')}</strong><p>{t('console.video.emptyHint')}</p></div>
  const groups = videoRecordGroups(entries, i18n.language, t('console.video.dateToday'), t('console.video.dateYesterday'))
  return <div className="video-record-timeline" ref={timelineRef}>
    {groups.map((group) => <section className="video-record-group" key={group.key}>
      <h2 className="video-record-group-title">{group.label}</h2>
      {group.entries.map((entry) => <VideoRecord key={entry.id} entry={entry} generating={generating} handlers={handlers} />)}
    </section>)}
    {/* 提交请求在途时先落一个占位记录，让新任务立刻出现在列表底部。 */}
    {submitting ? <div className="video-record video-record--pending">
      <h3 className="video-record-prompt">{pendingPrompt || t('console.video.emptyTitle')}</h3>
      <p className="video-record-meta">{t('console.video.submitting')}</p>
      <div className="video-record-body"><div className="video-task-render" role="status" aria-label={t('console.video.submitting')}><WaveBackground /><span className="video-task-render-badge">{t('console.video.submitting')}</span></div></div>
      <div className="video-record-actions"><Button theme="borderless" size="small" icon={<IconStop />} onClick={onCancelSubmit}>{t('console.video.cancelRequest')}</Button></div>
    </div> : null}
  </div>
}

export function VideoPage() {
  const { t } = useTranslation()
  const renderReferenceSelectedItem: RenderSingleSelectedItemFn = ({ value }) => <>
    <span className="video-reference-option-icon">{String(value) === 'reference' ? <IconImage aria-hidden="true" /> : <IconVideo aria-hidden="true" />}</span>
    <span>{String(value) === 'reference' ? t('console.video.referenceMode') : t('console.video.firstLastFrame')}</span>
  </>
  const auth = useAppSelector((state) => state.auth)
  const userId = auth.status === 'authenticated'
    ? auth.user?.id ?? null
    : auth.status === 'unauthenticated'
      ? null
      : ''
  const store = useAppStore()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { models, loading: modelsLoading, error: modelsError } = useUserModels()

  useEffect(() => {
    if (modelsError) appToast.error(modelsError)
  }, [modelsError])
  const workspaceContext = useMemo<WorkspaceAccountContext>(() => workspaceContextFor(store.activeWorkspace), [store.activeWorkspace.id, store.activeWorkspace.type])
  const workspaceKey = workspaceKeyFor(workspaceContext)
  const requestedModel = searchParams.get('model') ?? ''
  const [modelID, setModelID] = useState(requestedModel)
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState(DEFAULT_VIDEO_DURATION)
  const [size, setSize] = useState(DEFAULT_VIDEO_SIZE)
  const [configuredRatio, setConfiguredRatio] = useState('')
  const [configuredResolution, setConfiguredResolution] = useState('')
  const [mediaReferences, setMediaReferences] = useState<VideoReference[]>([])
  const [referenceRevision, setReferenceRevision] = useState(0)
  const [requiredReferenceCount, setRequiredReferenceCount] = useState(0)
  const [referenceDraftDirty, setReferenceDraftDirty] = useState(false)
  const handleReferenceDraftChange = useCallback((dirty: boolean) => setReferenceDraftDirty(dirty), [])
  const appliedOptionsRef = useRef('')
  const [inputReference, setInputReference] = useState('')
  const [referenceUrl, setReferenceUrl] = useState('')
  const [referenceName, setReferenceName] = useState('')
  const [firstFrameUrl, setFirstFrameUrl] = useState('')
  const [lastFrameUrl, setLastFrameUrl] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [referenceMode, setReferenceMode] = useState<'reference' | 'first-last'>('reference')
  const [history, setHistory] = useState<VideoHistoryEntry[]>(() => readVideoHistory(userId).filter((entry) => entry.workspaceKey === workspaceKey))
  const [savedHistory, setSavedHistory] = useState(history)
  const [selectedHistoryID, setSelectedHistoryID] = useState('')
  const [currentTask, setCurrentTask] = useState<VideoTask | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [polling, setPolling] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [requestFailure, setRequestFailure] = useState<VideoRequestFailure | null>(null)
  const [submittedDraft, setSubmittedDraft] = useState<VideoDraft | null>(null)
  const initialModelRef = useRef<string | null>(null)
  const submitControllerRef = useRef<AbortController | null>(null)
  const cancelControllerRef = useRef<AbortController | null>(null)
  const submitAbortReasonRef = useRef<'user' | 'navigation' | null>(null)
  // 记录列表里可以同时存在多条任务，轮询控制器按 taskId 各自持有：
  // 对某一条做操作（取消/删除/查历史）不应中断其他任务的轮询，否则那条会永远停在「生成中」。
  const pollControllersRef = useRef<Map<string, AbortController>>(new Map())
  const lastSubmissionRef = useRef<VideoSubmissionSnapshot | null>(null)
  const historyOwnerRef = useRef(userId)
  const historyHydratingRef = useRef(true)

  function abortAllPolling(): void {
    for (const controller of pollControllersRef.current.values()) controller.abort()
    pollControllersRef.current.clear()
  }

  function stopPolling(taskId?: string): void {
    if (taskId) {
      pollControllersRef.current.get(taskId)?.abort()
      pollControllersRef.current.delete(taskId)
    } else {
      abortAllPolling()
    }
    setPolling(pollControllersRef.current.size > 0)
  }

  // 登录态失效统一清理并回首页，避免停在原页反复失败（与对话页、模型广场一致）。
  function redirectToLoginOnAuthFailure(error: unknown): boolean {
    if (!isAuthenticationFailure(error)) return false
    // Runtime 已负责有归属的会话清理，页面只同步未认证状态，避免旧响应误清新账号。
    if (!getAccessToken()) {
      dispatch(invalidateAuth())
      navigate('/', { replace: true })
    }
    return true
  }

  useEffect(() => {
    // 所有弹层都支持点击外部区域收起，避免遮挡工作区内容。
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null
      if (!target?.closest('.video-history-panel, .video-history-toggle')) setHistoryOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  // 视频 Runtime 使用登录态隐藏试用额度，模型选择器仅展示当前空间目录中的视频模型。
  const videoModels = useMemo(() => {
    // 模型目录按 alias 提交；重复 alias 会在下拉里生成选不中的重复项，这里按 alias 去重。
    const seenAliases = new Set<string>()
    return models.filter((model) => {
      if (model.modality !== 'video') return false
      const alias = modelAlias(model)
      if (!alias || seenAliases.has(alias)) return false
      seenAliases.add(alias)
      return true
    })
  }, [models])
  const displayVideoModels = videoModels
  const selectedModel = findModelInList(displayVideoModels, modelID) ?? displayVideoModels[0]
  const videoOptions = useMemo(() => normalizeVideoOptions(selectedModel?.videoOptions), [selectedModel?.videoOptions])
  const selectedSize = VIDEO_SIZE_OPTIONS.find((option) => option.value === size)
  const aspectRatio = videoOptions.hasVideoOptions ? configuredRatio : selectedSize?.aspect ?? size
  const resolution = videoOptions.hasVideoOptions ? configuredResolution : selectedSize?.resolution ?? ''
  const selectedHistory = history.find((entry) => entry.id === selectedHistoryID)
  const operationBusy = submitting || polling || cancelling
  // 轮询最长可持续数分钟，参数栏不应跟着锁死：只在提交/取消请求在途时锁，生成期间仍可准备下一轮的参数。
  const paramsBusy = submitting || cancelling
  const canSubmit = Boolean(selectedModel && (!videoOptions.requiresPrompt || prompt.trim()) && !operationBusy && !paramsBusy)
  // 生成中允许点击发送按钮取消任务；取消请求处理期间锁定按钮，空输入时禁止提交。
  const canCancel = submitting || Boolean(currentTask && taskIsActive(currentTask))
  const sendDisabled = cancelling || (!canCancel && !canSubmit)
  const currentModelAlias = selectedModel ? modelAlias(selectedModel) : ''
  if (initialModelRef.current === null && currentModelAlias && !modelsLoading) initialModelRef.current = currentModelAlias
  const currentDraft: VideoDraft = { model: currentModelAlias, prompt: prompt.trim(), duration, size, inputReference: inputReference.trim(), referenceMode, firstFrameUrl, lastFrameUrl, ratio: videoOptions.hasVideoOptions ? configuredRatio : undefined, resolution: videoOptions.hasVideoOptions ? configuredResolution : undefined, references: videoOptions.hasVideoOptions ? mediaReferences : undefined }
  // 提交成功后提示词仍留在输入框，以历史保存时的快照区分下一轮草稿；本地图片无法写入历史，始终保护。
  const hasUnsavedDraft = !sameVideoDraft(currentDraft, submittedDraft ?? emptyVideoDraft(initialModelRef.current ?? currentModelAlias, normalizeVideoOptions(findModelInList(videoModels, initialModelRef.current ?? currentModelAlias)?.videoOptions)))
    || [inputReference, firstFrameUrl, lastFrameUrl].some((value) => value.trim() && (!isPersistableReference(value) || value.length > 4_096))
    || mediaReferences.some((item) => !isPersistableReference(item.url) || item.url.length > 4_096)
  useBuildUpdateBlocker(operationBusy || referenceDraftDirty || hasUnsavedDraft || requiredReferenceCount > (videoOptions.hasVideoOptions ? mediaReferences.length : inputReference ? 1 : 0) || Boolean(requestFailure)
    || (history.length > 0 && history !== savedHistory)
    || Boolean(currentTask && ['failed', 'expired', 'unknown'].includes(currentTask.status))
    || history.some((entry) => taskIsActive(historyTask(entry))))

  function optionsKey(model: ModelRecord | undefined): string {
    return JSON.stringify([userId, workspaceKey, model?.id, model?.videoOptions])
  }

  function resetModelParameters(options: NormalizedVideoOptions): void {
    setReferenceRevision((revision) => revision + 1)
    setRequiredReferenceCount(0)
    setDuration(options.defaultDuration)
    setSize(options.defaultSize)
    setConfiguredRatio(options.defaultRatio)
    setConfiguredResolution(options.defaultResolution)
    setMediaReferences([])
    setInputReference('')
    setReferenceUrl('')
    setReferenceName('')
    setFirstFrameUrl('')
    setLastFrameUrl('')
    setReferenceMode('reference')
  }

  useEffect(() => {
    if (!selectedModel || modelsLoading) return
    const key = optionsKey(selectedModel)
    if (appliedOptionsRef.current === key) return
    // 切换模型后使用它自己的默认值；素材不跨模型沿用，避免新上限或协议与旧草稿冲突。
    if (appliedOptionsRef.current && (mediaReferences.length || inputReference)) Toast.info(t('console.video.modelReferencesCleared'))
    appliedOptionsRef.current = key
    resetModelParameters(videoOptions)
  }, [selectedModel, videoOptions, modelsLoading, workspaceKey, userId])

  useEffect(() => {
    submitAbortReasonRef.current = 'navigation'
    submitControllerRef.current?.abort()
    cancelControllerRef.current?.abort()
    abortAllPolling()
    submitControllerRef.current = null
    setModelID(requestedModel)
    setCurrentTask(null)
    setSelectedHistoryID('')
    setSubmitting(false)
    setPolling(false)
    setCancelling(false)
    setRequestFailure(null)
    historyOwnerRef.current = userId
    setSubmittedDraft(null)
    initialModelRef.current = null
    historyHydratingRef.current = true
    const restored = readVideoHistory(userId).filter((entry) => entry.workspaceKey === workspaceKey)
    setHistory(restored)
    setSavedHistory(restored)
    // 刷新或重新进入页面后，未完成的任务否则会一直停在「生成中」，这里主动续上轮询。
    const pendingEntry = restored.find((entry) => !videoTaskIsTerminal(entry.status) && entry.status !== 'unknown')
    if (pendingEntry && getAccessToken()?.trim()) void pollTask(historyTask(pendingEntry), pendingEntry)
    try {
      window.localStorage.removeItem(LEGACY_VIDEO_HISTORY_KEY)
    } catch {
      // 迁移到账号隔离存储时清理旧的未隔离视频历史。
    }
  }, [requestedModel, userId, workspaceKey])

  useEffect(() => {
    if (historyOwnerRef.current !== userId || historyHydratingRef.current) {
      historyHydratingRef.current = false
      return
    }
    // 页面只维护当前工作空间的列表，写回时合并同一用户的其他工作空间历史。
    const otherWorkspaceEntries = readVideoHistory(userId).filter((entry) => entry.workspaceKey !== workspaceKey)
    // 历史写入失败时继续保护内存结果，避免版本更新把尚未落盘的视频信息清掉。
    if (writeVideoHistory(userId, [...history, ...otherWorkspaceEntries])) setSavedHistory(history)
  }, [history, userId, workspaceKey])

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
    cancelControllerRef.current?.abort()
    abortAllPolling()
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
      // 内存记录保留原始参考图（含本地文件转出的 data URL），重试/编辑时才拿得到；
      // 落盘由 compactVideoHistoryEntry 负责裁掉超长的 data URL。
      prompt: snapshot.prompt, duration: snapshot.duration, size: snapshot.size, inputReference: snapshot.inputReference || null,
      ratio: snapshot.ratio, resolution: snapshot.resolution, references: snapshot.references,
      status: task.status, progress: task.progress, resultUrl: task.resultUrl, thumbnailUrl: task.thumbnailUrl, errorMessage: task.errorMessage, requestId: task.requestId, createdAt: new Date().toISOString(),
    }
  }

  function createSubmissionFailureTask(failure: VideoRequestFailure): VideoTask {
    // 提交阶段没有服务端 task_id 时也保留一张本地失败卡片，方便编辑和重试。
    return {
      taskId: `${LOCAL_FAILURE_TASK_PREFIX}${Date.now()}`,
      status: 'failed',
      progress: null,
      resultUrl: null,
      thumbnailUrl: null,
      errorMessage: failure.message,
      requestId: failure.requestId ?? createIdempotencyKey(),
      raw: {},
    }
  }

  async function pollTask(initialTask: VideoTask, entry: VideoHistoryEntry): Promise<void> {
    const taskId = entry.taskId
    pollControllersRef.current.get(taskId)?.abort()
    const controller = new AbortController()
    pollControllersRef.current.set(taskId, controller)
    setPolling(true)
    let task = initialTask
    let attempt = 0
    try {
      while (!controller.signal.aborted && !videoTaskIsTerminal(task.status) && task.status !== 'unknown' && attempt < VIDEO_POLL_MAX_ATTEMPTS) {
        await waitForVideoPoll(attempt === 0 ? VIDEO_POLL_INITIAL_DELAY_MS : VIDEO_POLL_INTERVAL_MS, controller.signal)
        if (controller.signal.aborted) return
        attempt += 1
        // 每次轮询读取最新登录态令牌，兼容后台刷新令牌后的访问令牌轮换。
        const accessToken = getAccessToken()?.trim()
        if (!accessToken) throw new VideoRuntimeError(t('api.modelRuntime.accessTokenRequired'), 401, 'invalid_user_session', null)
        task = await getVideoTask(accessToken, task.taskId, controller.signal)
        updateTask(task, entry)
      }
      if (!controller.signal.aborted && !videoTaskIsTerminal(task.status) && task.status !== 'unknown') {
        const timeoutTask: VideoTask = { ...task, status: 'unknown', errorMessage: t('console.video.pollingTimeout') }
        updateTask(timeoutTask, entry)
        setRequestFailure({ message: t('console.video.pollingTimeout'), requestId: task.requestId })
      }
    } catch (error: unknown) {
      if (controller.signal.aborted) return
      if (redirectToLoginOnAuthFailure(error)) return
      const failure = readVideoFailure(error, t('console.video.queryFailed'))
      const failedTask: VideoTask = { ...task, status: 'unknown', errorMessage: failure.message, requestId: failure.requestId ?? task.requestId }
      updateTask(failedTask, entry)
      setRequestFailure(failure)
    } finally {
      if (pollControllersRef.current.get(taskId) === controller) {
        pollControllersRef.current.delete(taskId)
        setPolling(pollControllersRef.current.size > 0)
      }
    }
  }

  function buildSubmissionSnapshot(retry: VideoSubmissionSnapshot | undefined): VideoSubmissionSnapshot | null {
    if (!getAccessToken()?.trim()) {
      Toast.warning(t('api.modelRuntime.accessTokenRequired'))
      return null
    }
    const submissionModel = retry ? findModelInList(videoModels, retry.model) : selectedModel
    if (!submissionModel) {
      Toast.warning(t('console.video.modelRequired'))
      return null
    }
    if (retry?.missingReferences) {
      Toast.warning(t('console.video.missingReferences'))
      return null
    }
    if (!retry && requiredReferenceCount > (videoOptions.hasVideoOptions ? mediaReferences.length : inputReference ? 1 : 0)) {
      Toast.warning(t('console.video.missingReferences'))
      return null
    }
    const snapshot: VideoSubmissionSnapshot = retry ? { ...retry, videoOptions: submissionModel.videoOptions ?? undefined } : {
      model: modelAlias(submissionModel), modelId: submissionModel.id, modelName: submissionModel.name,
      prompt: prompt.trim(), duration, size, inputReference: inputReference.trim(), idempotencyKey: createIdempotencyKey(),
      ...(videoOptions.hasVideoOptions ? { ratio: configuredRatio, resolution: configuredResolution, references: mediaReferences, videoOptions: submissionModel.videoOptions ?? undefined } : {}),
    }
    const options = normalizeVideoOptions(submissionModel.videoOptions)
    if (snapshot.references?.some((item) => item.role === 'last_frame') && !snapshot.references.some((item) => item.role === 'first_frame')) {
      Toast.warning(t('console.video.firstFrameRequired'))
      return null
    }
    const error = validateVideoParameters({ ...snapshot, imageCount: snapshot.references?.filter((item) => item.type === 'image').length ?? (snapshot.inputReference ? 1 : 0), videoCount: snapshot.references?.filter((item) => item.type === 'video').length, audioCount: snapshot.references?.filter((item) => item.type === 'audio').length }, options)
    if (error) {
      Toast.warning(t(error === 'prompt' ? 'console.video.promptRequired' : error === 'mixed-media' ? 'console.video.mixedMedia' : 'console.video.parametersChanged'))
      return null
    }
    return snapshot
  }

  async function submitVideo(retry?: VideoSubmissionSnapshot): Promise<void> {
    if (submitting || polling || cancelling) return
    const snapshot = buildSubmissionSnapshot(retry)
    if (!snapshot) return
    const draftAtSubmission = currentDraft
    stopPolling()
    setCurrentTask(null)
    setSelectedHistoryID('')
    setRequestFailure(null)
    setSubmitting(true)
    submitAbortReasonRef.current = null
    const controller = new AbortController()
    submitControllerRef.current = controller
    lastSubmissionRef.current = snapshot
    try {
      const accessToken = getAccessToken()?.trim()
      if (!accessToken) throw new VideoRuntimeError(t('api.modelRuntime.accessTokenRequired'), 401, 'invalid_user_session', null)
      const task = await submitVideoGeneration({ ...snapshot, accessToken, signal: controller.signal })
      const entry = createHistoryEntry(task, snapshot)
      const storedSnapshot = { ...snapshot, historyId: entry.id }
      lastSubmissionRef.current = storedSnapshot
      updateTask(task, entry)
      // 重试历史记录时不能把输入框里另一份新草稿也标为已保存。
      if ((task.status === 'succeeded' || taskIsActive(task))
        && snapshot.model === draftAtSubmission.model && snapshot.prompt === draftAtSubmission.prompt
        && snapshot.duration === draftAtSubmission.duration && snapshot.size === draftAtSubmission.size
        && snapshot.inputReference === draftAtSubmission.inputReference && snapshot.ratio === draftAtSubmission.ratio
        && snapshot.resolution === draftAtSubmission.resolution && JSON.stringify(snapshot.references) === JSON.stringify(draftAtSubmission.references)) setSubmittedDraft(draftAtSubmission)
      Toast.success(task.status === 'succeeded' ? t('console.video.generated') : t('console.video.taskSubmitted'))
      if (!videoTaskIsTerminal(task.status) && task.status !== 'unknown') void pollTask(task, entry)
    } catch (error: unknown) {
      if (controller.signal.aborted && submitAbortReasonRef.current === 'navigation') return
      if (controller.signal.aborted && submitAbortReasonRef.current === 'user') {
        setRequestFailure({ message: t('console.video.requestCancelled'), requestId: null })
        return
      }
      if (redirectToLoginOnAuthFailure(error)) return
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

  async function cancelTask(entry: VideoHistoryEntry): Promise<void> {
    if (cancelling || !taskIsActive(historyTask(entry))) return
    // 只停这一条任务的轮询；顺手停掉别条会让它们永远停在「生成中」。
    stopPolling(entry.taskId)
    setCancelling(true)
    setRequestFailure(null)
    const controller = new AbortController()
    cancelControllerRef.current = controller
    try {
      const accessToken = getAccessToken()?.trim()
      if (!accessToken) throw new VideoRuntimeError(t('api.modelRuntime.accessTokenRequired'), 401, 'invalid_user_session', null)
      const task = await cancelVideoTask(accessToken, entry.taskId, controller.signal)
      if (controller.signal.aborted) return
      updateTask(task, entry)
      Toast.info(t('console.video.cancelRequested'))
      if (!videoTaskIsTerminal(task.status) && task.status !== 'unknown') void pollTask(task, entry)
    } catch (error: unknown) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
      if (redirectToLoginOnAuthFailure(error)) return
      // 取消失败时任务还在跑，必须让用户看到原因；有任务在跑时工作区横幅会被抑制，所以直接弹提示。
      appToast.error(readVideoFailure(error, t('console.video.cancelFailed')).message)
      if (taskIsActive(historyTask(entry))) void pollTask(historyTask(entry), entry)
    } finally {
      if (cancelControllerRef.current === controller) cancelControllerRef.current = null
      setCancelling(false)
    }
  }

  // 发送按钮在生成期间是“停止”，作用于当前跟踪的那条任务。
  function cancelActiveTask(): void {
    const entry = history.find((item) => item.taskId === currentTask?.taskId)
    if (entry) void cancelTask(entry)
  }

  function cancelSubmission(): void {
    submitAbortReasonRef.current = 'user'
    submitControllerRef.current?.abort()
  }

  function clearHistory(): void {
    setSubmittedDraft(null)
    const allEntries = readVideoHistory(userId).filter((entry) => entry.workspaceKey !== workspaceKey)
    writeVideoHistory(userId, allEntries)
    setHistory([])
    setSelectedHistoryID('')
    setCurrentTask(null)
  }

  function editEntry(entry: VideoHistoryEntry): void {
    if (!findModelInList(videoModels, entry.model)) { Toast.warning(t('console.video.modelRequired')); return }
    setSubmittedDraft(null)
    setPrompt(entry.prompt)
    setModelID(entry.model)
    restoreEntryParameters(entry)
    setRequestFailure(null)
    setHistoryOpen(false)
    // 等待受控文本域回填后聚焦，便于直接修改提示词。
    window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('.video-composer-input-row textarea')?.focus(), 0)
  }

  function restoreEntryParameters(entry: VideoHistoryEntry): VideoDraft {
    setReferenceRevision((revision) => revision + 1)
    const model = findModelInList(videoModels, entry.model)
    const options = normalizeVideoOptions(model?.videoOptions)
    setRequiredReferenceCount(entry.missingReferences ? entry.referenceCount ?? (entry.references?.length ?? 0) + 1 : 0)
    appliedOptionsRef.current = optionsKey(model)
    const draft = emptyVideoDraft(entry.model, options)
    draft.prompt = entry.prompt
    draft.duration = isVideoDurationAllowed(entry.duration, options) ? entry.duration : options.defaultDuration
    if (options.hasVideoOptions) {
      draft.ratio = options.ratios.includes(entry.ratio ?? '') ? entry.ratio : options.defaultRatio
      draft.resolution = options.resolutions.includes(entry.resolution ?? '') ? entry.resolution : options.defaultResolution
      draft.references = entry.references ?? (entry.inputReference ? [{ type: 'image', url: entry.inputReference, role: 'reference_image' }] : [])
      draft.referenceMode = draft.references.some((item) => item.role === 'first_frame' || item.role === 'last_frame') ? 'first-last' : 'reference'
    } else {
      draft.size = options.sizes.some((item) => item.value === entry.size) ? entry.size : options.defaultSize
      draft.inputReference = entry.inputReference ?? (entry.references?.length === 1 && entry.references[0].type === 'image' ? entry.references[0].url : '')
      if (entry.references?.length && !draft.inputReference) {
        setRequiredReferenceCount(entry.references.length)
        Toast.warning(t('console.video.parametersChanged'))
      }
    }
    setDuration(draft.duration)
    setSize(draft.size)
    setConfiguredRatio(draft.ratio ?? '')
    setConfiguredResolution(draft.resolution ?? '')
    setMediaReferences(draft.references ?? [])
    setReferenceMode(draft.referenceMode)
    setFirstFrameUrl('')
    setLastFrameUrl('')
    setInputReference(draft.inputReference)
    setReferenceUrl(isPersistableReference(draft.inputReference) ? draft.inputReference : '')
    setReferenceName(draft.inputReference ? t('console.video.referenceImage') : '')
    if (entry.missingReferences) Toast.warning(t('console.video.missingReferences'))
    return draft
  }

  function deleteEntry(entry: VideoHistoryEntry): void {
    // 在跑的任务删掉后，服务端任务还在跑但界面既看不到也取消不了，先要求用户取消。
    if (taskIsActive(historyTask(entry))) {
      appToast.error(t('console.video.deleteActiveHint'))
      return
    }
    const entryID = entry.id
    // 只停这一条的轮询，别条任务要继续更新。
    stopPolling(entry.taskId)
    const remaining = history.filter((item) => item.id !== entryID)
    setHistory(remaining)
    writeVideoHistory(userId, [...remaining, ...readVideoHistory(userId).filter((item) => item.workspaceKey !== workspaceKey)])
    if (selectedHistoryID === entryID) setSelectedHistoryID('')
    if (currentTask?.taskId === entry.taskId) {
      setCurrentTask(null)
      setSubmittedDraft(null)
    }
    if (lastSubmissionRef.current?.historyId === entryID) lastSubmissionRef.current = null
  }

  function startNewGeneration(): void {
    if (operationBusy) return
    setSubmittedDraft(emptyVideoDraft(currentModelAlias, videoOptions))
    stopPolling()
    setRequestFailure(null)
    setCurrentTask(null)
    setSelectedHistoryID('')
    setPrompt('')
    setInputReference('')
    setReferenceUrl('')
    setReferenceName('')
    setFirstFrameUrl('')
    setLastFrameUrl('')
    resetModelParameters(videoOptions)
    setReferenceMode('reference')
    setHistoryOpen(false)
    lastSubmissionRef.current = null
  }

  function selectHistory(entry: VideoHistoryEntry): void {
    if (!findModelInList(videoModels, entry.model)) { Toast.warning(t('console.video.modelRequired')); return }
    setSubmittedDraft(restoreEntryParameters(entry))
    // 选一条历史不应该打断正在生成的任务，这里刻意不 abort 任何轮询。
    setRequestFailure(null)
    setSelectedHistoryID(entry.id)
    setCurrentTask(historyTask(entry))
    setModelID(entry.model)
    setPrompt(entry.prompt)
    // 终态不必再查；unknown（轮询超时或查询失败）要把本地状态当成进行中再查一次，
    // 因为服务端很可能已经跑完了。
    if (getAccessToken()?.trim() && !videoTaskIsTerminal(entry.status)) void pollTask({ ...historyTask(entry), status: 'processing' }, entry)
  }

  function retryEntry(entry: VideoHistoryEntry): void {
    // 只有「本地提交失败、服务端还没拿到 task_id」的记录才复用原幂等键做重放。
    // 已经有服务端任务的记录必须换新键，否则服务端按幂等回放，返回的还是同一条旧任务。
    const replay = entry.taskId.startsWith(LOCAL_FAILURE_TASK_PREFIX) && lastSubmissionRef.current?.historyId === entry.id
      ? lastSubmissionRef.current
      : null
    const snapshot = replay ?? {
      model: entry.model, modelId: entry.modelId, modelName: entry.modelName, prompt: entry.prompt, duration: entry.duration, size: entry.size, inputReference: entry.inputReference ?? '', idempotencyKey: createIdempotencyKey(),
      ratio: entry.ratio, resolution: entry.resolution, references: entry.references, missingReferences: entry.missingReferences,
    }
    void submitVideo(snapshot)
  }

  function changeReferenceMedia(references: VideoReference[]): void {
    if (videoOptions.hasVideoOptions) { setMediaReferences(references); return }
    const image = references.find((item) => item.type === 'image')?.url ?? ''
    setInputReference(image)
    setReferenceUrl(image)
    setReferenceName('')
    setFirstFrameUrl(referenceMode === 'first-last' ? image : '')
    setLastFrameUrl('')
  }

  function selectAspectRatio(ratio: string): void {
    if (videoOptions.hasVideoOptions) { setConfiguredRatio(ratio); return }
    const options = VIDEO_SIZE_OPTIONS.filter((option) => option.aspect === ratio)
    const option = options.find((item) => item.resolution === resolution) ?? options[0]
    if (option) setSize(option.value)
  }

  function selectResolution(nextResolution: string): void {
    if (videoOptions.hasVideoOptions) { setConfiguredResolution(nextResolution); return }
    const option = VIDEO_SIZE_OPTIONS.find((item) => item.aspect === aspectRatio && item.resolution === nextResolution)
    if (option) setSize(option.value)
  }

  if (modelsLoading) return <div className="page-stack video-console-page"><PageTitle title={t('console.video.title')} description={t('console.video.description')} /><EmptyPanel title={t('console.common.loadingModels')} description={t('console.common.readingModels')} /></div>
  if (modelsError) return <div className="page-stack video-console-page"><PageTitle title={t('console.video.title')} description={t('console.video.description')} /></div>

  const workspaceNotices: VideoWorkspaceNoticeItem[] = []
  if (requestFailure) workspaceNotices.push({ id: 'request-failure', message: requestFailure.message, requestId: requestFailure.requestId, action: <Button theme="outline" size="small" onClick={() => setRequestFailure(null)}>{t('console.common.close')}</Button> })
  if (!videoModels.length) workspaceNotices.push({ id: 'no-video-models', message: t('console.video.noModelsHint') })
  // 已有任务时优先保留结果卡片，提交/轮询错误直接展示在卡片内，保证仍可编辑、重试和删除。
  const showWorkspaceNotices = workspaceNotices.length > 0 && !submitting && !currentTask

  return <div data-build-update-managed className="page-stack video-console-page">
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
        <main className="video-stage experience-content">{showWorkspaceNotices ? <VideoWorkspaceNotice items={workspaceNotices} /> : <VideoTimeline entries={history} submitting={submitting} pendingPrompt={prompt} generating={operationBusy} onCancelSubmit={cancelSubmission} handlers={{ onCancel: (entry) => { void cancelTask(entry) }, onRetry: retryEntry, onEdit: editEntry, onDelete: deleteEntry }} />}</main>
        <footer className="video-composer experience-composer">
          <div className="video-composer-box">
            <div className={`video-composer-input-row${referenceMode === 'first-last' ? ' is-first-last' : ''}`}>
              <VideoReferenceMedia key={[optionsKey(selectedModel), referenceMode, referenceRevision].join(':')} value={videoOptions.hasVideoOptions ? mediaReferences : inputReference ? [{ type: 'image', url: inputReference, role: referenceMode === 'first-last' ? 'first_frame' : 'reference_image' }] : []} options={videoOptions} mode={referenceMode} disabled={paramsBusy} onChange={changeReferenceMedia} onDraftChange={handleReferenceDraftChange} />
              {inputReference ? <div className="video-reference-row">
                {referenceUrl ? <span className="video-reference-chip video-reference-chip--url"><IconImage aria-hidden="true" /><span>{referenceUrl}</span><Button theme="borderless" size="small" icon={<IconClose />} aria-label={t('console.video.removeReference')} title={t('console.video.removeReference')} onClick={() => { setInputReference(''); setReferenceUrl(''); setReferenceName('') }} /></span> : <span className="video-reference-chip"><img src={inputReference} alt="" /><span>{referenceName || t('console.video.referenceImage')}</span><Button theme="borderless" size="small" icon={<IconClose />} aria-label={t('console.video.removeReference')} title={t('console.video.removeReference')} onClick={() => { setInputReference(''); setReferenceUrl(''); setReferenceName('') }} /></span>}
              </div> : null}
              <Input.TextArea value={prompt} onChange={(value) => setPrompt(value.slice(0, VIDEO_PROMPT_MAX_LENGTH))} maxLength={VIDEO_PROMPT_MAX_LENGTH} rows={3} disabled={paramsBusy} placeholder={selectedModel ? t('console.video.promptPlaceholder') : t('console.video.promptDisabledPlaceholder')} aria-label={t('console.video.promptLabel')} onKeyDown={(event) => { if (event.nativeEvent.isComposing || event.keyCode === 229) return; if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (canSubmit) void submitVideo() } }} />
            </div>
            <div className="video-composer-controls">
              <div className="video-control-group">
                <div className="video-primary-controls">
                  <div className="video-reference-picker">
                    <Select className={`video-control-button video-reference-trigger${referenceMode === 'first-last' ? ' video-reference-trigger--first-last' : ''}`} value={referenceMode} aria-label={t('console.video.referenceMedia')} arrowIcon={<IconChevronDownStroked />} dropdownClassName="video-reference-select-dropdown" position="topLeft" innerTopSlot={<div className="video-popover-title">{t('console.video.generationMode')}</div>} renderSelectedItem={renderReferenceSelectedItem} onChange={(value) => { const nextMode = String(value) as 'reference' | 'first-last'; if (nextMode !== referenceMode && mediaReferences.length) { setMediaReferences([]); Toast.info(t('console.video.modeReferencesCleared')) }; setReferenceMode(nextMode); setRequiredReferenceCount(0) }} disabled={paramsBusy}>
                      {/* 生成模式选项不显示默认选中勾选，避免图标、勾选和文字错位。 */}
                      <Select.Option value="reference" showTick={false}><span className="video-reference-option-icon"><IconImage aria-hidden="true" /></span><span>{t('console.video.referenceMode')}</span></Select.Option>
                      <Select.Option value="first-last" showTick={false} disabled={videoOptions.hasVideoOptions && (videoOptions.family !== 'seedance' || videoOptions.maxImages === 0)}><span className="video-reference-option-icon"><IconVideo aria-hidden="true" /></span><span>{t('console.video.firstLastFrame')}</span></Select.Option>
                    </Select>
                  </div>
                  <div className="video-model-picker">
                    <Select id="video-model" className="video-control-button video-model-trigger" dropdownClassName="video-model-select-dropdown" value={selectedModel ? modelAlias(selectedModel) : ''} placeholder={t('console.video.chooseModel')} arrowIcon={<IconChevronDownStroked />} position="topLeft" dropdownMatchSelectWidth={false} filter={false} aria-label={t('console.video.model')} onChange={(value) => { setModelID(String(value)); setRequestFailure(null) }} renderSelectedItem={() => selectedModel ? <><VideoModelLogo model={selectedModel} /><span className="video-model-trigger-label" title={`${selectedModel.company}: ${selectedModel.name}`}><span className="video-model-company">{selectedModel.company}: </span>{selectedModel.name}</span></> : null} renderOptionItem={({ value, selected, focused, onClick, onMouseEnter }) => { const model = displayVideoModels.find((item) => modelAlias(item) === String(value)); if (!model) return displayVideoModels.length === 0 && String(value) === '' ? <div className="video-model-empty-option">{t('console.video.noModels')}</div> : null; /* Semi 通过 props 下发点击处理，不透传 onClick 就永远切换不了模型。 */ return <div className={`video-model-option${selected ? ' is-selected' : ''}${focused ? ' is-focused' : ''}`} onClick={onClick} onMouseEnter={onMouseEnter}><VideoModelLogo model={model} /><span className="video-model-option-name">{model.company}: {model.name}</span><span className="video-model-advanced"><span className="video-model-premium-icon" aria-hidden="true">P</span><em>{t('console.video.advanced')}</em></span></div> }} disabled={paramsBusy}><Select.Option value="" disabled={displayVideoModels.length === 0}>{displayVideoModels.length === 0 ? t('console.video.noModels') : t('console.video.chooseModel')}</Select.Option>{displayVideoModels.map((model) => <Select.Option key={model.id} value={modelAlias(model)}>{model.company}: {model.name}</Select.Option>)}</Select>
                  </div>
                </div>
                <div className="video-parameter-controls">
                  <VideoParameterControls options={videoOptions} duration={duration} aspectRatio={aspectRatio} resolution={resolution} disabled={paramsBusy} onDurationChange={setDuration} onAspectRatioChange={selectAspectRatio} onResolutionChange={selectResolution} />
                  <button className="video-control-button video-sound-trigger" type="button" aria-label={t('console.video.sound')} title={t('console.video.optionUnavailable')} disabled><IconVolume2 aria-hidden="true" /><span>{t('console.video.sound')}</span></button>
                </div>
              </div>
              <Button className="generation-send-button video-send-button" theme="solid" type="primary" icon={operationBusy ? <IconStop /> : <IconArrowUp />} aria-label={operationBusy ? (submitting ? t('console.video.cancelRequest') : t('console.video.cancelGeneration')) : t('console.video.generate')} title={operationBusy ? (submitting ? t('console.video.cancelRequest') : t('console.video.cancelGeneration')) : t('console.video.generate')} disabled={sendDisabled} loading={submitting} onClick={() => { if (submitting) cancelSubmission(); else if (currentTask && taskIsActive(currentTask)) cancelActiveTask(); else void submitVideo() }} />
            </div>
          </div>
          <div className="video-composer-hint"><span>{t('console.video.shortcut')}</span><span>{selectedModel ? t('console.video.resultHint') : t('console.video.chooseModelHint')}</span></div>
        </footer>
      </div>
    </section>
  </div>
}
