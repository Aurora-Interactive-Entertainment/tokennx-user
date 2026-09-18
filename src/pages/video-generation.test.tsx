import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppStoreProvider } from '@/data/app-state'
import { createAppStore } from '@/store'
import type { VideoTask } from '@/api/video-runtime'
import type { ModelRecord } from '@/data/models'
import type { UserVideoParameterConfig } from '@/api/user-models'
import { cancelVideoTask, getVideoTask, submitVideoGeneration } from '@/api/video-runtime'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import { useUserModels } from '@/data/user-models'
import { synchronizeAuthenticatedUser } from '@/store/auth-slice'
import { VIDEO_SESSION_HISTORY_KEY } from '@/utils/ephemeral-history'
import { useBuildUpdateBlocker } from '@/runtime/use-build-update-blocker'
import { VideoPage } from './video-generation'

vi.mock('@/api/video-runtime', () => {
  class MockVideoRuntimeError extends Error {
    readonly requestId: string | null = null
  }

  return { cancelVideoTask: vi.fn(), getVideoTask: vi.fn(), submitVideoGeneration: vi.fn(), videoTaskIsTerminal: (status: string) => ['succeeded', 'failed', 'cancelled', 'expired'].includes(status), VideoRuntimeError: MockVideoRuntimeError }
})

vi.mock('@/data/user-models', () => ({ useUserModels: vi.fn() }))
vi.mock('@/runtime/use-build-update-blocker', () => ({ useBuildUpdateBlocker: vi.fn() }))

vi.mock('@/components/common', () => ({ BannerNotice: () => null, EmptyPanel: () => null, PageTitle: () => null }))

vi.mock('@douyinfe/semi-ui', () => {
  type ButtonProps = { children?: ReactNode; onClick?: () => void; disabled?: boolean; className?: string; 'aria-label'?: string; title?: string }
  type InputProps = { id?: string; value?: string; onChange?: (value: string) => void; placeholder?: string; disabled?: boolean; maxLength?: number; rows?: number; className?: string; 'aria-label'?: string }
  type SelectProps = { id?: string; value?: string | number; onChange?: (value: string) => void; disabled?: boolean; className?: string; children?: ReactNode; 'aria-label'?: string }
  type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean }
  const MockButton = ({ children, onClick, disabled, className, 'aria-label': ariaLabel, title }: ButtonProps) => <button type="button" className={className} aria-label={ariaLabel} title={title} disabled={disabled} onClick={onClick}>{children}</button>
  const MockInput = ({ id, value, onChange, placeholder, disabled, maxLength, className, 'aria-label': ariaLabel }: InputProps) => <input id={id} value={value ?? ''} placeholder={placeholder} disabled={disabled} maxLength={maxLength} className={className} aria-label={ariaLabel} onChange={(event) => onChange?.(event.currentTarget.value)} />
  const MockTextArea = ({ id, value, onChange, placeholder, disabled, maxLength, rows, className, 'aria-label': ariaLabel }: InputProps) => <textarea id={id} value={value ?? ''} placeholder={placeholder} disabled={disabled} maxLength={maxLength} rows={rows} className={className} aria-label={ariaLabel} onChange={(event) => onChange?.(event.currentTarget.value)} />
  const MockSelect = ({ id, value, onChange, disabled, className, children, 'aria-label': ariaLabel }: SelectProps) => <select id={id} value={value === undefined ? '' : String(value)} disabled={disabled} className={className} aria-label={ariaLabel} onChange={(event) => onChange?.(event.currentTarget.value)}>{children}</select>
  const MockOption = ({ value, children, disabled }: OptionProps) => <option disabled={disabled} value={value === undefined ? '' : String(value)}>{children}</option>
  const Input = Object.assign(MockInput, { TextArea: MockTextArea })
  const Select = Object.assign(MockSelect, { Option: MockOption })
  const MockModal = ({ visible, children }: { visible?: boolean; children?: ReactNode }) => visible ? <div role="dialog">{children}</div> : null
  const MockIcon = () => null
  return {
    Button: MockButton,
    Modal: MockModal,
    Toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn(), destroyAll: vi.fn() },
    IconAlertTriangle: MockIcon,
    IconArrowUp: MockIcon,
    IconCheckCircleStroked: MockIcon,
    IconClose: MockIcon,
    IconDeleteStroked: MockIcon,
    IconDownload: MockIcon,
    IconHistory: MockIcon,
    IconImage: MockIcon,
    IconLoading: MockIcon,
    IconMuteStroked: MockIcon,
    IconPlus: MockIcon,
    IconRefresh: MockIcon,
    IconSetting: MockIcon,
    IconStop: MockIcon,
    IconVideo: MockIcon,
    IconVolume2: MockIcon,
  }
})

vi.mock('@douyinfe/semi-icons', () => {
  const MockIcon = () => null
  return { IconAlertTriangle: MockIcon, IconArrowUp: MockIcon, IconCheckCircleStroked: MockIcon, IconChevronDownStroked: MockIcon, IconChevronUpDown: MockIcon, IconClockStroked: MockIcon, IconClose: MockIcon, IconDeleteStroked: MockIcon, IconDownload: MockIcon, IconEditStroked: MockIcon, IconFilterStroked: MockIcon, IconHistory: MockIcon, IconImage: MockIcon, IconImageStroked: MockIcon, IconInfoCircle: MockIcon, IconLoading: MockIcon, IconMuteStroked: MockIcon, IconMoreStroked: MockIcon, IconPlus: MockIcon, IconRefresh: MockIcon, IconSearch: MockIcon, IconSortStroked: MockIcon, IconSetting: MockIcon, IconStop: MockIcon, IconTick: MockIcon, IconVideo: MockIcon, IconVideoStroked: MockIcon, IconVolume2: MockIcon }
})

vi.mock('@/components/semi-compat', () => {
  type KeyboardLike = { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; preventDefault: () => void }
  type InputProps = { id?: string; value?: string; onChange?: (value: string) => void; onKeyDown?: (event: KeyboardLike) => void; placeholder?: string; disabled?: boolean; maxLength?: number; rows?: number; className?: string; 'aria-label'?: string }
  type SelectProps = { id?: string; value?: string | number; onChange?: (value: string) => void; disabled?: boolean; className?: string; children?: ReactNode; innerTopSlot?: ReactNode; 'aria-label'?: string }
  type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean }
  const MockInput = ({ id, value, onChange, onKeyDown, placeholder, disabled, maxLength, className, 'aria-label': ariaLabel }: InputProps) => <input id={id} value={value ?? ''} placeholder={placeholder} disabled={disabled} maxLength={maxLength} className={className} aria-label={ariaLabel} onKeyDown={onKeyDown} onChange={(event) => onChange?.(event.currentTarget.value)} />
  const MockTextArea = ({ id, value, onChange, onKeyDown, placeholder, disabled, maxLength, rows, className, 'aria-label': ariaLabel }: InputProps) => <textarea id={id} value={value ?? ''} placeholder={placeholder} disabled={disabled} maxLength={maxLength} rows={rows} className={className} aria-label={ariaLabel} onKeyDown={onKeyDown} onChange={(event) => onChange?.(event.currentTarget.value)} />
  const MockSelect = ({ id, value, onChange, disabled, className, children, innerTopSlot, 'aria-label': ariaLabel }: SelectProps) => <><select id={id} value={value === undefined ? '' : String(value)} disabled={disabled} className={className} aria-label={ariaLabel} onChange={(event) => onChange?.(event.currentTarget.value)}>{children}</select>{innerTopSlot}</>
  const MockOption = ({ value, children, disabled }: OptionProps) => <option disabled={disabled} value={value === undefined ? '' : String(value)}>{children}</option>
  return { CompatInput: Object.assign(MockInput, { TextArea: MockTextArea }), CompatSelect: Object.assign(MockSelect, { Option: MockOption }) }
})

function videoModel(overrides: Partial<ModelRecord> = {}): ModelRecord {
  return {
    id: 'cogvideo', code: 'cogvideo', alias: 'cogvideo-public', name: 'CogVideo', company: '智谱AI', modality: 'video', capabilities: ['视频生成'], description: '视频模型',
    officialPrice: { base: 2, unit: '¥/秒' }, tokenNxPrice: { base: 1.6, unit: '¥/秒' }, labels: ['视频'], availability: { rate: 99, window: '近 24 小时' }, providerCount: 1, throughput: { value: 1, unit: 'K seconds' },
    // 业务回归使用目录明确声明的能力，不能依赖页面补出不存在的默认参数。
    parameterConfig: { schema_version: 1, video: {
      modes: ['text_to_video', 'image_to_video', 'first_last_frame', 'reference_to_video'], ratios: ['16:9', '9:16', '1:1'], resolutions: ['720p', '1080p'], sizes: null,
      durations: { min: 2, max: 30, step: 1, auto: false }, defaults: { mode: 'text_to_video', duration: 5, ratio: '16:9', resolution: '720p' },
      media: { min_total: 0, max_total: 1, roles: { first_frame: { min: 0, max: 1 }, reference_image: { min: 0, max: 1 } } },
    } },
    ...overrides,
  }
}

function configuredVideoModel(overrides: Partial<ModelRecord> = {}): ModelRecord {
  return videoModel({
    id: 'configured-video', alias: 'configured-video-public', name: 'Configured Video',
    parameterConfig: undefined,
    videoOptions: {
      family: 'seedance', ratios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], resolutions: ['480p', '720p', '1080p'],
      default_duration: 5, default_resolution: '720p', min_duration: 4, max_duration: 15, auto_duration: true,
      max_images: 2, max_videos: 1, max_audios: 1, requires_prompt: true, output_meter: 'output_token',
    },
    ...overrides,
  })
}

function mockVideoCatalog(models: ModelRecord[]): void {
  vi.mocked(useUserModels).mockReturnValue({ models, activities: [], total: null, page: null, pageSize: null, loading: false, error: '', refresh: vi.fn() })
}

async function confirmReferenceDialog(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^(confirm|完成)$/i }))
}

const pendingTask: VideoTask = { taskId: 'task-video-1', status: 'pending', progress: 0, resultUrl: null, thumbnailUrl: null, errorMessage: null, requestId: 'request-video-1', raw: {} }
const processingTask: VideoTask = { ...pendingTask, status: 'processing', progress: 38 }
const succeededTask: VideoTask = { ...pendingTask, status: 'succeeded', progress: 100, resultUrl: 'https://cdn.example.com/video-1.mp4' }

function renderVideoPage(): ReturnType<typeof createAppStore> {
  const appStore = createAppStore()
  appStore.dispatch(synchronizeAuthenticatedUser({ id: 'video-user', display_name: '视频测试用户', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' }))
  render(<MemoryRouter initialEntries={['/console/video']}><Provider store={appStore}><AppStoreProvider><VideoPage /></AppStoreProvider></Provider></MemoryRouter>)
  return appStore
}

function fullVideoModel(videoOverrides: Partial<UserVideoParameterConfig> = {}, overrides: Partial<ModelRecord> = {}): ModelRecord {
  return videoModel({
    id: 'full-video', alias: 'full-video-public', name: 'Full Video', parameterVersion: 'video-v1',
    parameterConfig: { schema_version: 1, video: {
      protocol: 'seedance', modes: ['text_to_video', 'image_to_video', 'first_last_frame', 'reference_to_video'],
      ratios: ['adaptive', '16:9', '9:16'], resolutions: ['720p', '1080p'], sizes: null,
      durations: { min: 4, max: 12, step: 2, auto: true }, defaults: { duration: 6, ratio: '16:9', resolution: '720p' },
      media: { min_total: 0, max_total: 4, roles: { first_frame: { min: 0, max: 1 }, last_frame: { min: 0, max: 1 }, reference_image: { min: 0, max: 3 }, reference_video: { min: 0, max: 2 }, reference_audio: { min: 0, max: 2 } } },
      ...videoOverrides,
    } },
    ...overrides,
  })
}

function saveVideoRecoveryHistory(tasks: Array<Pick<VideoTask, 'taskId' | 'status'>>, userId = 'video-user'): void {
  // 沿用正式历史格式，覆盖旧记录没有幂等键和多个任务恢复的场景。
  window.localStorage.setItem(VIDEO_SESSION_HISTORY_KEY, JSON.stringify({ version: 1, userId, entries: tasks.map((task, index) => ({
    ...pendingTask, ...task, id: `personal:personal:${task.taskId}`, workspaceKey: 'personal:personal',
    modelId: 'cogvideo', model: 'cogvideo-public', modelName: 'CogVideo', prompt: task.taskId,
    duration: 5, size: '', ratio: '16:9', resolution: '720p', inputReference: null, createdAt: new Date(Date.UTC(2026, 0, 2, 0, 0, -index)).toISOString(),
  })) }))
}

describe('视频生成页面', () => {
  beforeEach(() => {
    clearAuthTokens({ force: true })
    window.localStorage.clear()
    vi.clearAllMocks()
    saveAuthTokens({ status: 'succeeded', binding_required: false, access_token: 'user-access-token', refresh_token: 'video-refresh-token', refresh_expires_at: Date.UTC(2099, 0, 1) })
    vi.mocked(useUserModels).mockReturnValue({ models: [videoModel(), videoModel({ id: 'other-video', code: 'other-video', alias: 'other-video-public', name: 'Other Video' })], activities: [], total: null, page: null, pageSize: null, loading: false, error: '', refresh: vi.fn() })
  })

  afterEach(() => {
    clearAuthTokens({ force: true })
    vi.restoreAllMocks()
  })

  it.each([false, true])('视频恢复：提交响应丢失后重试复用原幂等键，重新进入=%s', async (reenter) => {
    const user = userEvent.setup()
    vi.mocked(submitVideoGeneration).mockRejectedValueOnce(new Error('任务号返回前断网')).mockResolvedValue(succeededTask)
    renderVideoPage()
    fireEvent.change(screen.getByLabelText('视频提示词'), { target: { value: '不能重复创建的视频' } })
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await screen.findByText('任务号返回前断网')
    const originalKey = vi.mocked(submitVideoGeneration).mock.calls[0][0].idempotencyKey
    if (reenter) { cleanup(); renderVideoPage() }
    await user.click(screen.getByRole('button', { name: '重新生成' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledTimes(2))
    expect(vi.mocked(submitVideoGeneration).mock.calls[1][0].idempotencyKey).toBe(originalKey)
    expect(screen.getByLabelText('视频生成结果')).toBeInTheDocument()
  })

  it('视频恢复：旧失败历史没有幂等键仍可重试，新增失败记录保留新键', async () => {
    const user = userEvent.setup()
    saveVideoRecoveryHistory([{ taskId: 'local-failed-legacy', status: 'failed' }])
    vi.mocked(submitVideoGeneration).mockRejectedValue(new Error('仍然断网'))
    renderVideoPage()
    await user.click(screen.getByRole('button', { name: '重新生成' }))
    await screen.findByText('仍然断网')
    const newKey = vi.mocked(submitVideoGeneration).mock.calls[0][0].idempotencyKey
    expect(newKey).toBeTruthy()
    const saved = JSON.parse(window.localStorage.getItem(VIDEO_SESSION_HISTORY_KEY)!) as { entries: Array<{ errorMessage: string; idempotencyKey?: string }> }
    expect(saved.entries.find((entry) => entry.errorMessage === '仍然断网')?.idempotencyKey).toBe(newKey)
  })

  it('视频恢复：成功历史保存原键，但重进后的重新生成使用新键', async () => {
    const user = userEvent.setup()
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    fireEvent.change(screen.getByLabelText('视频提示词'), { target: { value: '明确生成另一条视频' } })
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await screen.findByLabelText('视频生成结果')
    const originalKey = vi.mocked(submitVideoGeneration).mock.calls[0][0].idempotencyKey
    cleanup()
    renderVideoPage()
    await user.click(screen.getByRole('button', { name: '重新生成' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledTimes(2))
    expect(vi.mocked(submitVideoGeneration).mock.calls[1][0].idempotencyKey).not.toBe(originalKey)
  })

  it('视频恢复：全部未完成历史自动查询，终态及未知状态不会被自动重放', async () => {
    saveVideoRecoveryHistory([
      { taskId: '恢复甲', status: 'pending' }, { taskId: '恢复乙', status: 'processing' }, { taskId: '恢复丙', status: 'cancelling' },
      { taskId: '已成功', status: 'succeeded' }, { taskId: '已失败', status: 'failed' }, { taskId: '已取消', status: 'cancelled' },
      { taskId: '已过期', status: 'expired' }, { taskId: '未知', status: 'unknown' },
    ])
    vi.mocked(getVideoTask).mockImplementation(async (_token, taskId) => ({ ...succeededTask, taskId }))
    renderVideoPage()
    await waitFor(() => expect(getVideoTask).toHaveBeenCalledTimes(3), { timeout: 2_500 })
    expect(vi.mocked(getVideoTask).mock.calls.map((call) => call[1]).sort()).toEqual(['恢复丙', '恢复乙', '恢复甲'].sort())
    for (const taskId of ['恢复甲', '恢复乙', '恢复丙']) expect(within(screen.getByRole('article', { name: taskId })).getByLabelText('视频生成结果')).toBeInTheDocument()
    expect(submitVideoGeneration).not.toHaveBeenCalled()
  })

  it('视频恢复：重复选择正在查询的历史不会取消或重复请求', async () => {
    const user = userEvent.setup()
    saveVideoRecoveryHistory([{ taskId: '查询中的任务', status: 'processing' }])
    let complete!: (value: VideoTask) => void
    vi.mocked(getVideoTask).mockImplementation(() => new Promise((resolve) => { complete = resolve }))
    renderVideoPage()
    await waitFor(() => expect(getVideoTask).toHaveBeenCalledOnce(), { timeout: 2_500 })
    const signal = vi.mocked(getVideoTask).mock.calls[0][2]!
    const historyButton = within(document.querySelector('.video-history-panel')!).getByRole('button', { name: /查询中的任务/ })
    await user.click(historyButton)
    await user.click(historyButton)
    expect(signal.aborted).toBe(false)
    await act(async () => complete({ ...succeededTask, taskId: '查询中的任务' }))
    expect(getVideoTask).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('视频生成结果')).toBeInTheDocument()
  })

  it('视频恢复：后台任务完成不抢走当前历史选择，停止仍作用于选中任务', async () => {
    const user = userEvent.setup()
    saveVideoRecoveryHistory([{ taskId: '后台任务', status: 'processing' }, { taskId: '选中任务', status: 'processing' }])
    const completions = new Map<string, (value: VideoTask) => void>()
    vi.mocked(getVideoTask).mockImplementation((_token, taskId) => new Promise((resolve) => { completions.set(taskId, resolve) }))
    vi.mocked(cancelVideoTask).mockResolvedValue({ ...pendingTask, taskId: '选中任务', status: 'cancelled' })
    renderVideoPage()
    await waitFor(() => expect(getVideoTask).toHaveBeenCalledTimes(2), { timeout: 2_500 })
    await user.click(within(document.querySelector('.video-history-panel')!).getByRole('button', { name: /选中任务/ }))
    await act(async () => completions.get('后台任务')!({ ...succeededTask, taskId: '后台任务' }))
    expect(document.querySelector('.video-history-item.is-active')).toHaveTextContent('选中任务')
    expect(screen.getByLabelText('视频提示词')).toHaveValue('选中任务')
    await user.click(document.querySelector<HTMLButtonElement>('.video-send-button')!)
    await waitFor(() => expect(cancelVideoTask).toHaveBeenCalledWith('user-access-token', '选中任务', expect.any(AbortSignal)))
    await waitFor(() => expect(screen.getByRole('article', { name: '选中任务' })).toHaveTextContent('已取消'))
    const savedAfterCancel = window.localStorage.getItem(VIDEO_SESSION_HISTORY_KEY)
    await act(async () => completions.get('选中任务')!({ ...succeededTask, taskId: '选中任务' }))
    expect(window.localStorage.getItem(VIDEO_SESSION_HISTORY_KEY)).toBe(savedAfterCancel)
    expect(getVideoTask).toHaveBeenCalledTimes(2)
  })

  it.each(['unmount', 'account'] as const)('视频恢复：%s 会中止查询且忽略取消后的迟到成功', async (change) => {
    saveVideoRecoveryHistory([{ taskId: '旧账号任务', status: 'processing' }])
    let complete!: (value: VideoTask) => void
    vi.mocked(getVideoTask).mockImplementation(() => new Promise((resolve) => { complete = resolve }))
    const appStore = renderVideoPage()
    await waitFor(() => expect(getVideoTask).toHaveBeenCalledOnce(), { timeout: 2_500 })
    const signal = vi.mocked(getVideoTask).mock.calls[0][2]!
    if (change === 'unmount') cleanup()
    else await act(async () => { appStore.dispatch(synchronizeAuthenticatedUser({ id: 'new-video-user', display_name: '新账号', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' })) })
    expect(signal.aborted).toBe(true)
    const savedAfterChange = window.localStorage.getItem(VIDEO_SESSION_HISTORY_KEY)
    await act(async () => complete({ ...succeededTask, taskId: '旧账号任务' }))
    expect(window.localStorage.getItem(VIDEO_SESSION_HISTORY_KEY)).toBe(savedAfterChange)
    expect(screen.queryByRole('article', { name: '旧账号任务' })).not.toBeInTheDocument()
    expect(getVideoTask).toHaveBeenCalledOnce()
  })

  it('视频草稿、提交和轮询保护刷新，成功历史里的提示词不会永久阻塞', async () => {
    const user = userEvent.setup()
    let complete!: (value: VideoTask) => void
    vi.mocked(submitVideoGeneration).mockResolvedValue(pendingTask)
    vi.mocked(getVideoTask).mockImplementation(() => new Promise((resolve) => { complete = resolve }))
    renderVideoPage()
    const input = screen.getByLabelText('视频提示词')
    expect(input.closest('[data-build-update-managed]')).not.toBeNull()
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(false)
    await user.type(input, '已保存的视频提示词')
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(true)
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(getVideoTask).toHaveBeenCalledOnce(), { timeout: 2_500 })
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(true)
    await act(async () => complete(succeededTask))
    expect(input).toHaveValue('已保存的视频提示词')
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(false)
    await user.type(input, '下一轮')
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(true)
  })

  it('轮询期间新写的提示词不会被旧任务完成误标为已保存', async () => {
    const user = userEvent.setup()
    let complete!: (value: VideoTask) => void
    vi.mocked(submitVideoGeneration).mockResolvedValue(pendingTask)
    vi.mocked(getVideoTask).mockImplementation(() => new Promise((resolve) => { complete = resolve }))
    renderVideoPage()
    await user.type(screen.getByLabelText('视频提示词'), '原始提示词')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(getVideoTask).toHaveBeenCalledOnce(), { timeout: 2_500 })
    fireEvent.change(screen.getByLabelText('视频提示词'), { target: { value: '准备下一轮' } })
    await act(async () => complete(succeededTask))
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(true)
    await user.click(screen.getByRole('button', { name: '新生成' }))
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(false)
  })

  it('只改模型参数也保护刷新，失败仍保护，主动新建才释放', async () => {
    const user = userEvent.setup()
    vi.mocked(submitVideoGeneration).mockRejectedValue(new Error('视频临时失败'))
    renderVideoPage()
    const duration = screen.getByRole('slider', { name: '时长' })
    expect(duration.closest('[data-build-update-managed]')).not.toBeNull()
    fireEvent.change(duration, { target: { value: '10' } })
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(true)
    await user.selectOptions(screen.getByRole('combobox', { name: '视频模型' }), 'other-video-public')
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(true)
    await user.type(screen.getByLabelText('视频提示词'), '失败草稿')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await screen.findByText('视频临时失败')
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(true)
    await user.click(screen.getByRole('button', { name: '新生成' }))
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(false)
  })

  it('远程首帧形成草稿时保护刷新，成功记录URL后释放保护', async () => {
    const user = userEvent.setup()
    mockVideoCatalog([fullVideoModel({ modes: ['image_to_video'], media: { min_total: 1, max_total: 1, roles: { first_frame: { min: 1, max: 1 } } } })])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    await user.click(screen.getByRole('button', { name: '参考素材 · 添加参考素材' }))
    await user.type(screen.getByLabelText('参考图 URL'), 'https://cdn.example.com/first-frame.png')
    await confirmReferenceDialog(user)
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(true)
    await user.type(screen.getByLabelText('视频提示词'), '远程首帧生成')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await screen.findByLabelText('视频生成结果')
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(false)
    await user.click(screen.getByRole('button', { name: '新生成' }))
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(false)
  })

  it('参考图URL尚未确认时保护刷新，取消且未产生草稿后释放', async () => {
    const user = userEvent.setup()
    renderVideoPage()
    await user.click(screen.getByRole('button', { name: '参考素材 · 添加参考素材' }))
    expect(screen.getByLabelText('参考图 URL').closest('[data-build-update-managed]')).not.toBeNull()
    await user.type(screen.getByLabelText('参考图 URL'), 'https://cdn.example.com/unconfirmed.png')
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(true)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^(cancel|取消)$/i }))
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(false)
  })

  it('历史重试成功不能把另一份未提交提示词标成已保存', async () => {
    const user = userEvent.setup()
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    await user.type(screen.getByLabelText('视频提示词'), '历史中的提示词')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await screen.findByLabelText('视频生成结果')
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(false)
    fireEvent.change(screen.getByLabelText('视频提示词'), { target: { value: '另一份新草稿' } })
    await user.click(screen.getByRole('button', { name: '重新生成' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledTimes(2))
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(true)
  })

  it('取消视频任务期间保护刷新，取消完成后释放已经记录的提示词', async () => {
    const user = userEvent.setup()
    let completeCancel!: (value: VideoTask) => void
    vi.mocked(submitVideoGeneration).mockResolvedValue(processingTask)
    vi.mocked(getVideoTask).mockImplementation(() => new Promise(() => {}))
    vi.mocked(cancelVideoTask).mockImplementation(() => new Promise((resolve) => { completeCancel = resolve }))
    renderVideoPage()
    await user.type(screen.getByLabelText('视频提示词'), '取消已记录任务')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    await user.click(within(document.querySelector('article')!).getByRole('button', { name: '取消生成' }))
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(true)
    await act(async () => completeCancel({ ...processingTask, status: 'cancelled' }))
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(false)
  })

  it('视频历史无法落盘时，生成成功也继续保护内存里的结果', async () => {
    const user = userEvent.setup()
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === VIDEO_SESSION_HISTORY_KEY) throw new DOMException('存储配额不足', 'QuotaExceededError')
      originalSetItem.call(this, key, value)
    })
    renderVideoPage()
    await user.type(screen.getByLabelText('视频提示词'), '结果只能保存在内存')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await screen.findByLabelText('视频生成结果')
    expect(window.localStorage.getItem(VIDEO_SESSION_HISTORY_KEY)).toBeNull()
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(true)
    await user.click(screen.getByRole('button', { name: '新生成' }))
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(true)
  })

  it('不依赖 API Key，展示当前空间目录中的全部视频模型', async () => {
    const user = userEvent.setup()
    renderVideoPage()

    expect(await screen.findByRole('option', { name: /CogVideo/ })).toBeInTheDocument()
    const modelSelect = document.getElementById('video-model')
    expect(modelSelect).not.toBeNull()
    expect(screen.getByRole('option', { name: /Other Video/ })).toBeInTheDocument()
    expect(document.querySelector('.video-history-panel')).toBeInTheDocument()
    expect(document.querySelector('.video-workspace.experience-workbench')).toBeInTheDocument()
  })

  it('模型目录里 alias 重复时只保留一条，避免下拉出现选不中的重复项', async () => {
    // 两条记录 id 不同但 alias 相同；alias 是提交给后端的标识，重复会让下拉渲染出两个相同 value 的选项。
    vi.mocked(useUserModels).mockReturnValue({ models: [videoModel(), videoModel({ id: 'cogvideo-copy', code: 'cogvideo-copy', name: 'CogVideo 副本' })], activities: [], total: null, page: null, pageSize: null, loading: false, error: '', refresh: vi.fn() })
    renderVideoPage()

    expect(await screen.findByRole('option', { name: '智谱AI: CogVideo' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '智谱AI: CogVideo 副本' })).not.toBeInTheDocument()
  })

  it('模型接口没有数据时不展示伪造模型，并在选择器中显示空状态', async () => {
    vi.mocked(useUserModels).mockReturnValue({ models: [], activities: [], total: null, page: null, pageSize: null, loading: false, error: '', refresh: vi.fn() })
    renderVideoPage()

    // 空模型列表只能显示本地化空态，不能回退为不可实际调用的内置模型。
    expect(screen.queryByRole('option', { name: /CogVideo/ })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: '当前空间暂无可用视频模型' })).toBeInTheDocument()
  })

  it('使用登录态令牌且不显示密钥选择框', async () => {
    renderVideoPage()

    await screen.findByRole('option', { name: /CogVideo/ })
    expect(document.querySelector('.video-api-key-select')).toBeNull()
    expect(screen.queryByText(/API Key/)).toBeNull()
  })

  it('提交真实参数并轮询到结果视频', async () => {
    const user = userEvent.setup()
    vi.mocked(submitVideoGeneration).mockResolvedValue(pendingTask)
    vi.mocked(getVideoTask).mockResolvedValue(succeededTask)
    renderVideoPage()

    await screen.findByRole('option', { name: /CogVideo/ })
    await user.type(screen.getByLabelText('视频提示词'), '海边日落，镜头缓慢推进')
    await user.click(screen.getByRole('button', { name: '参考素材 · 添加参考素材' }))
    await user.type(screen.getByLabelText('参考图 URL'), 'https://cdn.example.com/reference.png')
    await confirmReferenceDialog(user)
    await user.click(screen.getByRole('button', { name: '生成视频' }))

    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledTimes(1))
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0]).toMatchObject({ accessToken: 'user-access-token', model: 'cogvideo-public', prompt: '海边日落，镜头缓慢推进', duration: 5, ratio: '16:9', resolution: '720p', references: [{ type: 'image', url: 'https://cdn.example.com/reference.png', role: 'reference_image' }] })
    await waitFor(() => expect(getVideoTask).toHaveBeenCalledWith('user-access-token', 'task-video-1', expect.anything()), { timeout: 2_500 })
    expect(await screen.findByLabelText('视频生成结果')).toBeInTheDocument()
    expect(document.querySelector('.video-status-success')).toHaveTextContent('已完成')
    await waitFor(() => expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(false))
  })

  it('提示词输入框按 Enter 直接提交，Shift + Enter 只换行', async () => {
    const user = userEvent.setup()
    // 用失败态避免轮询定时器干扰，只验证提交有没有被触发。
    vi.mocked(submitVideoGeneration).mockResolvedValue({ ...pendingTask, status: 'failed', errorMessage: '算力资源不足' })
    renderVideoPage()

    await screen.findByRole('option', { name: /CogVideo/ })
    const input = screen.getByLabelText('视频提示词')
    await user.type(input, '海边日落')
    await user.type(input, '{shift>}{enter}{/shift}')
    expect(submitVideoGeneration).not.toHaveBeenCalled()

    await user.type(input, '{enter}')
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledTimes(1))
  })

  it('中文输入法确认候选不会误提交，普通 Enter 仍正常提交', async () => {
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    const input = screen.getByLabelText('视频提示词')
    fireEvent.change(input, { target: { value: '镜头向前移动' } })
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })
    expect(submitVideoGeneration).not.toHaveBeenCalled()
    fireEvent.compositionEnd(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
  })

  it.each([
    ['16:9', '720P'], ['16:9', '1080P'], ['9:16', '720P'], ['1:1', '1080P'],
  ])('比例图标菜单选择 %s · %s 原样提交目录参数', async (ratio, resolution) => {
    const user = userEvent.setup()
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    const sizeSelect = screen.getByRole('combobox', { name: '比例' })
    await user.click(screen.getByRole('button', { name: ratio }))
    await user.click(screen.getByRole('button', { name: resolution }))
    expect(within(sizeSelect).getByRole('option', { selected: true })).toHaveTextContent(`${ratio} · ${resolution}`)
    await user.type(screen.getByLabelText('视频提示词'), '日落下的山川')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0]).toMatchObject({ ratio, resolution: resolution.toLowerCase(), size: '' })
  })

  it('保留全部原比例图标与清晰度排列，未支持选项不会伪装成其他尺寸', async () => {
    const user = userEvent.setup()
    renderVideoPage()
    const ratioButtons = within(document.querySelector('.video-aspect-options')!).getAllByRole('button')
    expect(ratioButtons.map((button) => button.textContent)).toEqual(['自适应', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'])
    expect(document.querySelectorAll('.video-ratio-icon')).toHaveLength(7)
    expect(within(document.querySelector('.video-resolution-options')!).getAllByRole('button').map((button) => button.textContent)).toEqual(['480P', '720P', '1080P'])
    for (const option of ['自适应', '21:9', '4:3', '3:4', '480P']) expect(screen.getByRole('button', { name: option })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '1080P' }))
    await user.click(screen.getByRole('button', { name: '9:16' }))
    expect(screen.getByRole('combobox', { name: '比例' })).toHaveTextContent('9:16 · 1080P')
    expect(screen.getByRole('button', { name: '1080P' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '1:1' }))
    expect(screen.getByRole('combobox', { name: '比例' })).toHaveTextContent('1:1 · 1080P')
  })

  it('对已有服务端任务的记录点「重新生成」会换新的幂等键，避免被服务端回放成同一条旧任务', async () => {
    const user = userEvent.setup()
    // 失败态是终态，不需要等轮询，操作行里的「重新生成」立即可用。
    vi.mocked(submitVideoGeneration).mockResolvedValue({ ...pendingTask, status: 'failed', errorMessage: '算力资源不足' })
    renderVideoPage()

    await screen.findByRole('option', { name: /CogVideo/ })
    await user.type(screen.getByLabelText('视频提示词'), '一只小狗')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: '重新生成' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledTimes(2))

    // 同一条记录重试必须换新键：沿用旧键的话服务端会按幂等直接返回那条旧任务，等于没重新生成。
    const firstKey = vi.mocked(submitVideoGeneration).mock.calls[0]?.[0]?.idempotencyKey
    const secondKey = vi.mocked(submitVideoGeneration).mock.calls[1]?.[0]?.idempotencyKey
    expect(firstKey).toBeTruthy()
    expect(secondKey).toBeTruthy()
    expect(secondKey).not.toBe(firstKey)
  })

  it('取消任务使用 DELETE 契约并继续显示取消中的任务状态', async () => {
    const user = userEvent.setup()
    vi.mocked(submitVideoGeneration).mockResolvedValue(processingTask)
    vi.mocked(cancelVideoTask).mockResolvedValue({ ...processingTask, status: 'cancelling' })
    vi.mocked(getVideoTask).mockResolvedValue({ ...processingTask, status: 'cancelling' })
    renderVideoPage()

    await screen.findByRole('option', { name: /CogVideo/ })
    await user.type(screen.getByLabelText('视频提示词'), '一座城市从夜晚变成白天')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledTimes(1))
    await user.click(within(screen.getByRole('article')).getByRole('button', { name: '取消生成' }))

    await waitFor(() => expect(cancelVideoTask).toHaveBeenCalledWith('user-access-token', 'task-video-1', expect.any(AbortSignal)))
    await waitFor(() => expect(getVideoTask).toHaveBeenCalledWith('user-access-token', 'task-video-1', expect.anything()), { timeout: 2_500 })
    expect(screen.getByRole('status', { name: '取消中' })).toBeInTheDocument()
  })

  it('新生成会清空当前任务和输入，但保留固定历史栏', async () => {
    const user = userEvent.setup()
    renderVideoPage()

    await screen.findByRole('option', { name: /CogVideo/ })
    await user.type(screen.getByLabelText('视频提示词'), '一只纸飞机飞过城市上空')
    await user.click(screen.getByRole('button', { name: '新生成' }))

    expect(screen.getByLabelText('视频提示词')).toHaveValue('')
    expect(screen.getByText('准备开始生成')).toBeInTheDocument()
    expect(document.querySelector('.video-history-panel')).toBeInTheDocument()
  })

  it('生成模式 Select 支持参考图与首尾帧切换', async () => {
    const user = userEvent.setup()
    mockVideoCatalog([fullVideoModel()])
    renderVideoPage()

    await screen.findByRole('option', { name: /Full Video/ })
    await user.selectOptions(screen.getByRole('combobox', { name: '参考素材' }), 'first-last')
    expect(screen.getByRole('button', { name: '首帧 URL' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '末帧 URL' })).toBeInTheDocument()
  })

  it('单图模式按声明映射首帧角色，未支持的首尾帧模式和声音保持禁用', async () => {
    const user = userEvent.setup()
    mockVideoCatalog([fullVideoModel({ modes: ['image_to_video'], media: { min_total: 1, max_total: 1, roles: { first_frame: { min: 1, max: 1 } } } })])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    expect(screen.getByRole('option', { name: '首尾帧' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '声音' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '参考素材 · 添加参考素材' }))
    await user.type(screen.getByLabelText('参考图 URL'), 'https://cdn.example.com/first.png')
    expect(document.querySelector('input[type="file"]')).toBeNull()
    await confirmReferenceDialog(user)
    await user.type(screen.getByLabelText('视频提示词'), '根据首帧生成视频')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0].references).toEqual([{ type: 'image', url: 'https://cdn.example.com/first.png', role: 'first_frame' }])
  })

  it('模型、比例和时长弹层按参考页交互并保持互斥', async () => {
    const user = userEvent.setup()
    renderVideoPage()

    await screen.findByRole('option', { name: /CogVideo/ })
    const modelSelect = screen.getByRole('combobox', { name: '视频模型' })
    expect(modelSelect).toHaveValue('cogvideo-public')
    await user.selectOptions(modelSelect, 'other-video-public')
    expect(modelSelect).toHaveValue('other-video-public')
    expect(screen.getByRole('combobox', { name: '比例' })).toHaveValue('settings')
    expect(screen.getByRole('combobox', { name: '比例' })).toHaveTextContent('16:9 · 720P')
    expect(screen.getByRole('combobox', { name: '时长' })).toHaveValue('duration')
  })

  it('没有 API Key 也不阻止登录用户发起生成', async () => {
    vi.mocked(submitVideoGeneration).mockResolvedValue(pendingTask)
    renderVideoPage()

    await screen.findByRole('option', { name: /CogVideo/ })
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('视频提示词'), '一只鸟掠过湖面')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledTimes(1))
    expect(document.querySelector('.video-workspace.experience-workbench')).toBeInTheDocument()
    expect(document.querySelector('.video-console-page > .banner-notice')).toBeNull()
  })

  it('提交失败仍保留可编辑、重试和删除的结果卡片', async () => {
    const user = userEvent.setup()
    vi.mocked(submitVideoGeneration).mockRejectedValue(new Error('余额不足'))
    renderVideoPage()

    await screen.findByRole('option', { name: /CogVideo/ })
    await user.type(screen.getByLabelText('视频提示词'), '一只猫在窗边看雨')
    await user.click(screen.getByRole('button', { name: '生成视频' }))

    expect(await screen.findByText('余额不足')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '编辑' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新生成' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '编辑' }))
    expect(screen.getByLabelText('视频提示词')).toHaveValue('一只猫在窗边看雨')

    await user.click(screen.getByRole('button', { name: '更多操作' }))
    await user.click(await screen.findByText('删除'))
    expect(screen.queryByText('余额不足')).toBeNull()
  })

  it('进入页面时列表直接落到底部，之后新增记录才用平滑滚动', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const user = userEvent.setup()
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)

    renderVideoPage()
    await screen.findByRole('option', { name: /CogVideo/ })
    // 没有记录时不渲染时间线，也就不需要滚动。
    expect(scrollIntoView).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('视频提示词'), '一只小狗躺在沙发上')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    await waitFor(() => expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'end', behavior: 'smooth' }))

    // 历史落盘后重新进入页面：首屏直接落到底部，避免平滑动画被后到的布局打断。
    await waitFor(() => expect(window.localStorage.getItem(VIDEO_SESSION_HISTORY_KEY)).toContain('task-video-1'))
    cleanup()
    scrollIntoView.mockClear()
    renderVideoPage()
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'end', behavior: 'auto' }))
    delete (Element.prototype as { scrollIntoView?: () => void }).scrollIntoView
  })

  it('目录视频配置决定新增比例、分辨率、时长范围与实际提交参数', async () => {
    const user = userEvent.setup()
    const model = configuredVideoModel()
    mockVideoCatalog([model])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()

    const duration = screen.getByRole('slider', { name: '时长' })
    expect(duration).toHaveAttribute('min', '4')
    expect(duration).toHaveAttribute('max', '15')
    expect(duration).toHaveValue('5')
    expect(screen.getByRole('button', { name: '21:9' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '480P' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '21:9' }))
    await user.click(screen.getByRole('button', { name: '480P' }))
    const durationInput = screen.getByRole('spinbutton', { name: '时长' })
    fireEvent.change(durationInput, { target: { value: '99' } })
    fireEvent.blur(durationInput)
    expect(duration).toHaveValue('15')
    await user.type(screen.getByLabelText('视频提示词'), '宽幅城市航拍')
    await user.click(screen.getByRole('button', { name: '生成视频' }))

    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0]).toMatchObject({ model: 'configured-video-public', duration: 15, size: '', ratio: '21:9', resolution: '480p', videoOptions: model.videoOptions, references: [] })
  })

  it('完整参数配置优先于旧字段，步长时长和提交参数均使用新契约', async () => {
    const user = userEvent.setup()
    const model = fullVideoModel({}, { videoOptions: { ratios: ['21:9'], resolutions: ['480p'], min_duration: 1, max_duration: 30, default_duration: 5 } })
    mockVideoCatalog([model])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    expect(screen.getByRole('button', { name: '21:9' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '480P' })).toBeDisabled()
    expect(screen.getByRole('slider', { name: '时长' })).toHaveAttribute('step', '2')
    const input = screen.getByRole('spinbutton', { name: '时长' })
    fireEvent.change(input, { target: { value: '9' } })
    fireEvent.blur(input)
    expect([8, 10]).toContain(Number(screen.getByRole('spinbutton', { name: '时长' }).getAttribute('value')))
    await user.type(screen.getByLabelText('视频提示词'), '完整目录配置')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0]).toMatchObject({ parameterConfig: model.parameterConfig, generationMode: 'text_to_video', ratio: '16:9', resolution: '720p' })
  })

  it('首屏按默认模式的规则应用比例与时长默认值，即使基础秒数仍合法', async () => {
    const user = userEvent.setup()
    mockVideoCatalog([fullVideoModel({
      durations: { min: 4, max: 12, step: 1, auto: false },
      defaults: { mode: 'text_to_video', resolution: '720p', duration: 5 },
      rules: [{ mode: 'text_to_video', default_ratio: '16:9', default_duration: 10 }],
    })])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    expect(screen.getByRole('combobox', { name: '比例' })).toHaveTextContent('16:9 · 720P')
    expect(screen.getByRole('spinbutton', { name: '时长' })).toHaveValue(10)
    await user.type(screen.getByLabelText('视频提示词'), '使用模式默认参数')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0]).toMatchObject({ generationMode: 'text_to_video', ratio: '16:9', resolution: '720p', duration: 10 })
  })

  it('同时声明默认尺寸与档位时优先档位，编辑档位历史不会补入默认尺寸', async () => {
    const user = userEvent.setup()
    mockVideoCatalog([fullVideoModel({
      sizes: [{ width: 1280, height: 720 }],
      defaults: { mode: 'text_to_video', ratio: '16:9', resolution: '720p', size: { width: 1280, height: 720 }, duration: 6 },
    })])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    expect(screen.getByRole('combobox', { name: '比例' })).toHaveTextContent('16:9 · 720P')
    await user.type(screen.getByLabelText('视频提示词'), '恢复分辨率档位历史')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await screen.findByLabelText('视频生成结果')
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0]).toMatchObject({ resolution: '720p', size: '' })
    await user.click(screen.getByRole('button', { name: '1080P' }))
    await user.click(screen.getByRole('button', { name: '编辑' }))
    expect(screen.getByRole('combobox', { name: '比例' })).toHaveTextContent('16:9 · 720P')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledTimes(2))
    expect(vi.mocked(submitVideoGeneration).mock.calls[1]?.[0]).toMatchObject({ resolution: '720p', size: '' })
  })

  it('枚举时长按档位滑动，不能将滑块索引当作秒数提交', async () => {
    const user = userEvent.setup()
    mockVideoCatalog([fullVideoModel({ durations: { values: [4, 7, 12], auto: false }, defaults: { duration: 7, ratio: '16:9', resolution: '720p' } })])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    const slider = screen.getByRole('slider', { name: '时长' })
    expect(slider).toHaveAttribute('max', '2')
    fireEvent.change(slider, { target: { value: '2' } })
    expect(screen.getByRole('spinbutton', { name: '时长' })).toHaveValue(12)
    await user.type(screen.getByLabelText('视频提示词'), '枚举时长')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0].duration).toBe(12)
  })

  it('声音使用接口默认false，并将用户开启后的true传到生成请求', async () => {
    const user = userEvent.setup()
    mockVideoCatalog([fullVideoModel({ generate_audio: { supported: true, default: false } })])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    const sound = screen.getByRole('button', { name: '声音' })
    expect(sound).toBeEnabled()
    expect(sound).toHaveAttribute('aria-pressed', 'false')
    await user.type(screen.getByLabelText('视频提示词'), '声音参数按选择提交')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0].generateAudio).toBe(false)
    await user.click(sound)
    expect(sound).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledTimes(2))
    expect(vi.mocked(submitVideoGeneration).mock.calls[1]?.[0].generateAudio).toBe(true)
  })

  it('视频编辑模式联动自动时长，并按声明提交source_video角色和模式', async () => {
    const user = userEvent.setup()
    mockVideoCatalog([fullVideoModel({
      modes: ['text_to_video', 'video_edit'],
      media: { min_total: 0, max_total: 1, roles: { source_video: { min: 0, max: 1 } } },
      rules: [{ mode: 'video_edit', durations: { auto: true, auto_only: true }, default_duration: -1, media: { min_total: 1, max_total: 1, roles: { source_video: { min: 1, max: 1 } } } }],
    })])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    await user.selectOptions(screen.getByRole('combobox', { name: '参考素材' }), 'video_edit')
    expect(screen.queryByRole('slider', { name: '时长' })).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: '自动' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '参考素材 · 添加参考素材' }))
    expect(screen.getByRole('tab', { name: '视频' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '图片' })).toBeDisabled()
    await user.type(screen.getByLabelText('参考视频 URL'), 'https://cdn.example.com/source.mp4')
    await confirmReferenceDialog(user)
    await user.type(screen.getByLabelText('视频提示词'), '重新编辑视频')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0]).toMatchObject({ generationMode: 'video_edit', duration: -1, references: [{ type: 'video', url: 'https://cdn.example.com/source.mp4', role: 'source_video' }] })
  })

  it('仅自动时长不暴露手动输入，也不补出默认秒数', async () => {
    const user = userEvent.setup()
    mockVideoCatalog([fullVideoModel({ durations: { auto: true, auto_only: true }, defaults: { duration: -1, ratio: '16:9', resolution: '720p' } })])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    expect(screen.queryByRole('slider', { name: '时长' })).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: '时长' })).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: '自动' })).toBeDisabled()
    await user.type(screen.getByLabelText('视频提示词'), '自动时长')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0].duration).toBe(-1)
  })

  it('允许省略时长时，清空已选秒数并失焦后提交省略时长', async () => {
    const user = userEvent.setup()
    mockVideoCatalog([fullVideoModel({ durations: { min: 4, max: 12, step: 2, auto: false, omit_allowed: true } })])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    fireEvent.change(screen.getByRole('slider', { name: '时长' }), { target: { value: '8' } })
    const durationInput = screen.getByRole('spinbutton', { name: '时长' })
    expect(durationInput).toHaveValue(8)
    await user.clear(durationInput)
    fireEvent.blur(durationInput)
    expect(screen.getByRole('spinbutton', { name: '时长' })).toHaveValue(null)
    await user.type(screen.getByLabelText('视频提示词'), '由服务商决定生成时长')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0].duration).toBeUndefined()
  })

  it('目录只有完整尺寸组合时直接选择该组合，不从比例计算像素', async () => {
    const user = userEvent.setup()
    mockVideoCatalog([fullVideoModel({ ratios: null, resolutions: null, sizes: [{ width: 832, height: 480 }, { width: 480, height: 832 }], defaults: { duration: 6, size: { width: 832, height: 480 } } })])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    expect(screen.getByRole('button', { name: '16:9' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '720P' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '480x832' }))
    await user.type(screen.getByLabelText('视频提示词'), '指定像素组合')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0]).toMatchObject({ size: '480x832' })
  })

  it('同时返回分辨率档位与多组像素尺寸时，尺寸栏仅展示分辨率档位', () => {
    mockVideoCatalog([fullVideoModel({
      resolutions: ['480p', '720p', '1080p'],
      sizes: [{ width: 832, height: 480 }, { width: 480, height: 832 }, { width: 1280, height: 720 }, { width: 720, height: 1280 }, { width: 1920, height: 1080 }, { width: 1080, height: 1920 }],
    })])
    renderVideoPage()
    const sizePanel = within(document.querySelector('.video-resolution-options')!)
    expect(sizePanel.getAllByRole('button').map((button) => button.textContent)).toEqual(['480P', '720P', '1080P'])
    for (const name of ['480P', '720P', '1080P']) expect(sizePanel.getByRole('button', { name })).toBeEnabled()
    expect(sizePanel.queryByRole('button', { name: /\d+x\d+/ })).not.toBeInTheDocument()
  })

  it('同模型参数版本变更重置旧参数和素材，保留提示词', async () => {
    const user = userEvent.setup()
    const model = fullVideoModel()
    mockVideoCatalog([model])
    const appStore = renderVideoPage()
    await user.type(screen.getByLabelText('视频提示词'), '继续保留提示词')
    fireEvent.change(screen.getByRole('slider', { name: '时长' }), { target: { value: '12' } })
    await user.click(screen.getByRole('button', { name: '参考素材 · 添加参考素材' }))
    await user.type(screen.getByLabelText('参考图 URL'), 'https://cdn.example.com/previous.png')
    await confirmReferenceDialog(user)
    mockVideoCatalog([{ ...model, parameterVersion: 'video-v2' }])
    act(() => appStore.dispatch(synchronizeAuthenticatedUser({ id: 'video-user', display_name: '更新目录', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' })))
    await waitFor(() => expect(screen.getByRole('spinbutton', { name: '时长' })).toHaveValue(6))
    expect(screen.getByRole('button', { name: '参考素材 · 添加参考素材' })).toBeInTheDocument()
    expect(screen.getByLabelText('视频提示词')).toHaveValue('继续保留提示词')
  })

  it('缺失契约时禁用生成与素材，null能力不虚构比例或分辨率', async () => {
    const user = userEvent.setup()
    mockVideoCatalog([videoModel({ parameterConfig: undefined, videoOptions: undefined })])
    renderVideoPage()
    await user.type(screen.getByLabelText('视频提示词'), '没有能力声明')
    expect(screen.getByRole('button', { name: '生成视频' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '参考素材 · 添加参考素材' })).toBeDisabled()
    for (const name of ['16:9', '720P', '1080P']) expect(screen.getByRole('button', { name })).toBeDisabled()
    expect(submitVideoGeneration).not.toHaveBeenCalled()
  })

  it('分辨率条件同步收紧时长和素材数量，超限旧素材必须编辑后才能提交', async () => {
    const user = userEvent.setup()
    mockVideoCatalog([fullVideoModel({ rules: [{ resolution: '1080p', durations: { values: [4, 6], auto: false }, default_duration: 4, media: { min_total: 0, max_total: 1, roles: { reference_image: { min: 0, max: 1 } } } }] })])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    fireEvent.change(screen.getByRole('slider', { name: '时长' }), { target: { value: '12' } })
    await user.click(screen.getByRole('button', { name: '参考素材 · 添加参考素材' }))
    await user.type(screen.getByLabelText('参考图 URL'), 'https://cdn.example.com/one.png\nhttps://cdn.example.com/two.png')
    await confirmReferenceDialog(user)
    await user.click(screen.getByRole('button', { name: '1080P' }))
    await waitFor(() => expect(screen.getByRole('spinbutton', { name: '时长' })).toHaveValue(4))
    await user.type(screen.getByLabelText('视频提示词'), '高清条件限制')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    expect(submitVideoGeneration).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '编辑参考素材：图片 · 2' }))
    await confirmReferenceDialog(user)
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('1')
    await user.clear(screen.getByLabelText('参考图 URL'))
    await user.type(screen.getByLabelText('参考图 URL'), 'https://cdn.example.com/one.png')
    await confirmReferenceDialog(user)
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0]).toMatchObject({ duration: 4, resolution: '1080p', references: [{ type: 'image', url: 'https://cdn.example.com/one.png', role: 'reference_image' }] })
  })

  it('目录中的自动时长默认值 -1 与默认分辨率直接用于生成', async () => {
    const user = userEvent.setup()
    const model = configuredVideoModel()
    model.videoOptions = { ...model.videoOptions, default_duration: -1, default_resolution: '1080p', max_duration: 30 }
    mockVideoCatalog([model])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    await user.click(screen.getByRole('button', { name: '自适应' }))

    expect(screen.getByRole('combobox', { name: '时长' })).toHaveTextContent('自动')
    expect(screen.getByRole('combobox', { name: '比例' })).toHaveTextContent('1080P')
    await user.type(screen.getByLabelText('视频提示词'), '按故事内容安排时长')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0]).toMatchObject({ duration: -1, ratio: 'adaptive', resolution: '1080p' })
  })

  it('参数面板保留标准选项，接口未支持的比例和清晰度置灰禁选', () => {
    const model = configuredVideoModel()
    model.videoOptions = { ...model.videoOptions, ratios: ['16:9'], resolutions: ['720p'], auto_duration: false }
    mockVideoCatalog([model])
    renderVideoPage()

    expect(screen.getByRole('button', { name: '16:9' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '720P' })).toBeEnabled()
    for (const name of ['21:9', '4:3', '1:1', '3:4', '9:16', '480P', '1080P']) expect(screen.getByRole('button', { name })).toBeDisabled()
    expect(screen.queryByRole('switch', { name: '自动' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '比例' })).toHaveTextContent('720P')
    expect(screen.getByRole('button', { name: '16:9' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('支持双图的模型可填写首尾帧远程URL并保留各自角色', async () => {
    const user = userEvent.setup()
    mockVideoCatalog([fullVideoModel()])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    await user.selectOptions(screen.getByRole('combobox', { name: '参考素材' }), 'first-last')
    expect(screen.getByRole('button', { name: '末帧 URL' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '首帧 URL' }))
    await user.type(screen.getByLabelText('首帧 URL', { selector: 'input' }), 'https://cdn.example.com/first.png')
    await user.type(screen.getByLabelText('末帧 URL', { selector: 'input' }), 'https://cdn.example.com/last.png')
    await confirmReferenceDialog(user)
    await user.type(screen.getByLabelText('视频提示词'), '从首帧过渡至尾帧')
    await user.click(screen.getByRole('button', { name: '生成视频' }))

    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0].references).toEqual([
      { type: 'image', url: 'https://cdn.example.com/first.png', role: 'first_frame' },
      { type: 'image', url: 'https://cdn.example.com/last.png', role: 'last_frame' },
    ])
  })

  it('切换模型清理素材并应用新模型默认值，不能携带原模型超限参数', async () => {
    const user = userEvent.setup()
    const first = configuredVideoModel()
    const second = configuredVideoModel({ id: 'next-video', alias: 'next-video-public', name: 'Next Video', videoOptions: { ...first.videoOptions, default_duration: -1, default_resolution: '1080p', max_duration: 30, max_images: 0 } })
    mockVideoCatalog([first, second])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()

    await user.click(screen.getByRole('button', { name: '21:9' }))
    fireEvent.change(screen.getByRole('slider', { name: '时长' }), { target: { value: '15' } })
    await user.click(screen.getByRole('button', { name: '参考素材 · 添加参考素材' }))
    await user.type(screen.getByLabelText('参考图 URL'), 'https://cdn.example.com/old-model.png')
    await confirmReferenceDialog(user)
    await user.selectOptions(screen.getByRole('combobox', { name: '视频模型' }), 'next-video-public')
    await user.click(screen.getByRole('button', { name: '自适应' }))
    await user.type(screen.getByLabelText('视频提示词'), '切换后使用新参数')
    await user.click(screen.getByRole('button', { name: '生成视频' }))

    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0]).toMatchObject({ model: 'next-video-public', duration: -1, ratio: 'adaptive', resolution: '1080p', references: [] })
  })

  it('多行远程图片超过接口上限整体拒绝，合法批次完整提交', async () => {
    const user = userEvent.setup()
    mockVideoCatalog([configuredVideoModel()])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    await user.click(screen.getByRole('button', { name: '自适应' }))
    await user.click(screen.getByRole('button', { name: '参考素材 · 添加参考素材' }))
    const referenceInput = screen.getByLabelText('参考图 URL')
    const urls = [1, 2, 3].map((index) => `https://cdn.example.com/reference-${index}.png`)
    await user.type(referenceInput, urls.join('\n'))
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('最多支持 2 个图片素材')
    await confirmReferenceDialog(user)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(submitVideoGeneration).not.toHaveBeenCalled()
    await user.clear(screen.getByLabelText('参考图 URL'))
    await user.type(screen.getByLabelText('参考图 URL'), urls.slice(0, 2).join('\n'))
    await confirmReferenceDialog(user)
    await user.type(screen.getByLabelText('视频提示词'), '参考两张图片生成')
    await user.click(screen.getByRole('button', { name: '生成视频' }))

    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    const references = vi.mocked(submitVideoGeneration).mock.calls[0]?.[0].references
    expect(references).toHaveLength(2)
    expect(references).toEqual(urls.slice(0, 2).map((url) => expect.objectContaining({ type: 'image', url })))
    expect(vi.mocked(useBuildUpdateBlocker).mock.lastCall?.[0]).toBe(false)
  })

  it('参考素材弹窗按类型分组且只接收公开远程URL', async () => {
    const user = userEvent.setup()
    mockVideoCatalog([configuredVideoModel()])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    await user.click(screen.getByRole('button', { name: '自适应' }))
    await user.click(screen.getByRole('button', { name: '参考素材 · 添加参考素材' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('参考素材')
    const privacy = screen.getByLabelText('素材隐私说明')
    expect(privacy).toBeInTheDocument()
    // 隐私说明改用与用量管理页一致的 semi 图标（本套件把图标 mock 成空组件），
    // 这里确保按钮内不再有手写的文字感叹号。
    expect(privacy.textContent).toBe('')
    expect(document.querySelector('input[type="file"]')).toBeNull()
    for (const name of ['图片', '视频', '音频']) expect(screen.getByRole('tab', { name })).toBeEnabled()
    for (const url of ['data:image/png;base64,YQ==', 'blob:https://example.com/local', 'https://user:secret@example.com/image.png']) {
      await user.clear(screen.getByLabelText('参考图 URL'))
      await user.type(screen.getByLabelText('参考图 URL'), url)
      await confirmReferenceDialog(user)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('HTTP')
      expect(within(screen.getByRole('dialog')).queryByText('每次仅使用一种素材，完成后将使用当前类型。')).not.toBeInTheDocument()
      expect(within(screen.getByRole('dialog')).queryByText('远程 URL · 每行一个')).not.toBeInTheDocument()
    }
    await user.clear(screen.getByLabelText('参考图 URL'))
    await user.type(screen.getByLabelText('参考图 URL'), 'https://cdn.example.com/reference.png')
    await confirmReferenceDialog(user)
    await user.type(screen.getByLabelText('视频提示词'), '结合参考图生成')
    await user.click(screen.getByRole('button', { name: '生成视频' }))

    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0].references).toEqual([
      expect.objectContaining({ type: 'image', url: 'https://cdn.example.com/reference.png' }),
    ])
  })

  it.each([
    { type: 'video', label: '视频', input: '参考视频 URL', role: 'reference_video', extension: 'mp4' },
    { type: 'audio', label: '音频', input: '参考音频 URL', role: 'reference_audio', extension: 'mp3' },
  ])('$label素材校验接口上限，确认仅提交当前类型的URL和角色', async ({ type, label, input, role, extension }) => {
    const user = userEvent.setup()
    mockVideoCatalog([fullVideoModel({ media: { min_total: 0, max_total: 2, roles: { reference_image: { min: 0, max: 2 }, reference_video: { min: 0, max: 1 }, reference_audio: { min: 0, max: 1 } } } })])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    await user.click(screen.getByRole('button', { name: '自适应' }))
    await user.click(screen.getByRole('button', { name: '参考素材 · 添加参考素材' }))
    await user.type(screen.getByLabelText('参考图 URL'), 'https://cdn.example.com/draft-image.png')
    await user.click(screen.getByRole('tab', { name: label }))
    const url = `https://cdn.example.com/reference.${extension}`
    await user.type(screen.getByLabelText(input), `${url}\nhttps://cdn.example.com/extra.${extension}`)
    await confirmReferenceDialog(user)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('1')
    await user.clear(screen.getByLabelText(input))
    await user.type(screen.getByLabelText(input), url)
    // 来回切换保留输入草稿，但确认时不能把其他类型的草稿一并带入生成请求。
    await user.click(screen.getByRole('tab', { name: '图片' }))
    expect(screen.getByLabelText('参考图 URL')).toHaveValue('https://cdn.example.com/draft-image.png')
    await user.click(screen.getByRole('tab', { name: label }))
    expect(screen.getByLabelText(input)).toHaveValue(url)
    await confirmReferenceDialog(user)
    expect(screen.getByRole('button', { name: `编辑参考素材：${label} · 1` })).toBeInTheDocument()
    await user.type(screen.getByLabelText('视频提示词'), '根据参考素材生成')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0].references).toEqual([{ type, url, role }])
  })

  it('确认后显示素材数量并支持编辑，取消类型切换不覆盖已确认内容，清空后无素材提交', async () => {
    const user = userEvent.setup()
    mockVideoCatalog([configuredVideoModel()])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    await user.click(screen.getByRole('button', { name: '自适应' }))
    await user.click(screen.getByRole('button', { name: '参考素材 · 添加参考素材' }))
    const urls = 'https://cdn.example.com/first.png\nhttps://cdn.example.com/second.png'
    await user.type(screen.getByLabelText('参考图 URL'), urls)
    await confirmReferenceDialog(user)
    await user.click(screen.getByRole('button', { name: '编辑参考素材：图片 · 2' }))
    expect(screen.getByLabelText('参考图 URL')).toHaveValue(urls)
    await user.click(screen.getByRole('tab', { name: '视频' }))
    await user.type(screen.getByLabelText('参考视频 URL'), 'https://cdn.example.com/unconfirmed.mp4')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^(cancel|取消)$/i }))
    await user.click(screen.getByRole('button', { name: '编辑参考素材：图片 · 2' }))
    expect(screen.getByRole('tab', { name: '图片' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('参考图 URL')).toHaveValue(urls)
    await user.click(screen.getByRole('tab', { name: '视频' }))
    expect(screen.getByLabelText('参考视频 URL')).toHaveValue('')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^(cancel|取消)$/i }))
    await user.click(screen.getByRole('button', { name: '清空参考素材' }))
    expect(screen.getByRole('button', { name: '参考素材 · 添加参考素材' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('视频提示词'), '清空参考素材后生成')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0].references).toEqual([])
  })

  it('接口不支持的素材类型禁用，图片不可用时仍可添加支持的视频', async () => {
    const user = userEvent.setup()
    const model = configuredVideoModel()
    model.videoOptions = { ...model.videoOptions, max_images: 0, max_audios: 0 }
    mockVideoCatalog([model])
    renderVideoPage()
    await user.click(screen.getByRole('button', { name: '参考素材 · 添加参考素材' }))
    expect(screen.getByRole('tab', { name: '图片' })).toBeDisabled()
    expect(screen.getByRole('tab', { name: '音频' })).toBeDisabled()
    expect(screen.getByRole('tab', { name: '视频' })).toBeEnabled()
    expect(screen.getByRole('tab', { name: '视频' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('参考视频 URL')).toBeEnabled()
  })

  it('requires_prompt 为 false 时允许空提示词生成，true 仍保持必填', async () => {
    const user = userEvent.setup()
    const optionalPromptModel = configuredVideoModel()
    optionalPromptModel.videoOptions = { ...optionalPromptModel.videoOptions, requires_prompt: false }
    mockVideoCatalog([optionalPromptModel, configuredVideoModel({ id: 'required-video', alias: 'required-video-public', name: 'Required Video' })])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    await user.click(screen.getByRole('button', { name: '自适应' }))

    expect(screen.getByRole('button', { name: '生成视频' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0].prompt).toBe('')
    await user.selectOptions(screen.getByRole('combobox', { name: '视频模型' }), 'required-video-public')
    expect(screen.getByRole('button', { name: '生成视频' })).toBeDisabled()
  })

  it('配置模型失败重试保留最初参数快照，不采用后来修改的新草稿参数', async () => {
    const user = userEvent.setup()
    const model = configuredVideoModel()
    mockVideoCatalog([model])
    vi.mocked(submitVideoGeneration).mockRejectedValue(new Error('配置模型临时失败'))
    renderVideoPage()
    await user.click(screen.getByRole('button', { name: '21:9' }))
    await user.click(screen.getByRole('button', { name: '480P' }))
    await user.click(screen.getByRole('switch', { name: '自动' }))
    await user.type(screen.getByLabelText('视频提示词'), '保留原始参数')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await screen.findByText('配置模型临时失败')
    await user.click(screen.getByRole('button', { name: '16:9' }))
    await user.click(screen.getByRole('button', { name: '1080P' }))
    await user.click(screen.getByRole('button', { name: '重新生成' }))

    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledTimes(2))
    expect(vi.mocked(submitVideoGeneration).mock.calls[1]?.[0]).toMatchObject({ duration: -1, ratio: '21:9', resolution: '480p', videoOptions: model.videoOptions })
    expect(vi.mocked(submitVideoGeneration).mock.calls[1]?.[0].idempotencyKey).toBe(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0].idempotencyKey)
  })

  it('兼容旧历史缺失本地素材的状态，重试、选历史和编辑都不能静默变成无图生成', async () => {
    const user = userEvent.setup()
    mockVideoCatalog([configuredVideoModel()])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    await user.click(screen.getByRole('button', { name: '自适应' }))
    await user.type(screen.getByLabelText('视频提示词'), '本地素材不能静默丢失')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await screen.findByLabelText('视频生成结果')
    await waitFor(() => expect(window.localStorage.getItem(VIDEO_SESSION_HISTORY_KEY)).toContain('task-video-1'))

    cleanup()
    // 旧版本上传的本地图不会落盘，保留其缺失标记来验证升级后的恢复路径。
    const savedHistory = JSON.parse(window.localStorage.getItem(VIDEO_SESSION_HISTORY_KEY)!) as { entries: Array<Record<string, unknown>> }
    Object.assign(savedHistory.entries[0], { missingReferences: true, referenceCount: 1, references: [], inputReference: null })
    window.localStorage.setItem(VIDEO_SESSION_HISTORY_KEY, JSON.stringify(savedHistory))
    vi.mocked(submitVideoGeneration).mockClear()
    renderVideoPage()
    await user.click(screen.getByRole('button', { name: '重新生成' }))
    expect(submitVideoGeneration).not.toHaveBeenCalled()
    await user.click(within(document.querySelector('.video-history-panel')!).getByRole('button', { name: /本地素材不能静默丢失/ }))
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    expect(submitVideoGeneration).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '编辑' }))
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    expect(submitVideoGeneration).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '参考素材 · 添加参考素材' }))
    await user.type(screen.getByLabelText('参考图 URL'), 'https://cdn.example.com/replacement.png')
    await confirmReferenceDialog(user)
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0].references).toEqual([expect.objectContaining({ type: 'image', url: 'https://cdn.example.com/replacement.png' })])
  })

  it('历史模型已下架时不能通过编辑或重试自动改用目录中的其他模型', async () => {
    const user = userEvent.setup()
    mockVideoCatalog([configuredVideoModel()])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    await user.click(screen.getByRole('button', { name: '自适应' }))
    await user.type(screen.getByLabelText('视频提示词'), '不能自动更换计费模型')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await screen.findByLabelText('视频生成结果')
    await waitFor(() => expect(window.localStorage.getItem(VIDEO_SESSION_HISTORY_KEY)).toContain('task-video-1'))

    cleanup()
    vi.mocked(submitVideoGeneration).mockClear()
    mockVideoCatalog([configuredVideoModel({ id: 'replacement-model', alias: 'replacement-public', name: 'Replacement Model' })])
    renderVideoPage()
    await user.click(screen.getByRole('button', { name: '重新生成' }))
    expect(submitVideoGeneration).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '编辑' }))
    expect(screen.getByLabelText('视频提示词')).toHaveValue('')
    await user.click(within(document.querySelector('.video-history-panel')!).getByRole('button', { name: /不能自动更换计费模型/ }))
    expect(screen.getByLabelText('视频提示词')).toHaveValue('')
    expect(screen.getByRole('button', { name: '生成视频' })).toBeDisabled()
    expect(submitVideoGeneration).not.toHaveBeenCalled()
  })
})
