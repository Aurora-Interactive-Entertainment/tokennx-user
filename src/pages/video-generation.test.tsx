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
  type OptionProps = { value?: string | number; children?: ReactNode }
  const MockButton = ({ children, onClick, disabled, className, 'aria-label': ariaLabel, title }: ButtonProps) => <button type="button" className={className} aria-label={ariaLabel} title={title} disabled={disabled} onClick={onClick}>{children}</button>
  const MockInput = ({ id, value, onChange, placeholder, disabled, maxLength, className, 'aria-label': ariaLabel }: InputProps) => <input id={id} value={value ?? ''} placeholder={placeholder} disabled={disabled} maxLength={maxLength} className={className} aria-label={ariaLabel} onChange={(event) => onChange?.(event.currentTarget.value)} />
  const MockTextArea = ({ id, value, onChange, placeholder, disabled, maxLength, rows, className, 'aria-label': ariaLabel }: InputProps) => <textarea id={id} value={value ?? ''} placeholder={placeholder} disabled={disabled} maxLength={maxLength} rows={rows} className={className} aria-label={ariaLabel} onChange={(event) => onChange?.(event.currentTarget.value)} />
  const MockSelect = ({ id, value, onChange, disabled, className, children, 'aria-label': ariaLabel }: SelectProps) => <select id={id} value={value === undefined ? '' : String(value)} disabled={disabled} className={className} aria-label={ariaLabel} onChange={(event) => onChange?.(event.currentTarget.value)}>{children}</select>
  const MockOption = ({ value, children }: OptionProps) => <option value={value === undefined ? '' : String(value)}>{children}</option>
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
  type OptionProps = { value?: string | number; children?: ReactNode }
  const MockInput = ({ id, value, onChange, onKeyDown, placeholder, disabled, maxLength, className, 'aria-label': ariaLabel }: InputProps) => <input id={id} value={value ?? ''} placeholder={placeholder} disabled={disabled} maxLength={maxLength} className={className} aria-label={ariaLabel} onKeyDown={onKeyDown} onChange={(event) => onChange?.(event.currentTarget.value)} />
  const MockTextArea = ({ id, value, onChange, onKeyDown, placeholder, disabled, maxLength, rows, className, 'aria-label': ariaLabel }: InputProps) => <textarea id={id} value={value ?? ''} placeholder={placeholder} disabled={disabled} maxLength={maxLength} rows={rows} className={className} aria-label={ariaLabel} onKeyDown={onKeyDown} onChange={(event) => onChange?.(event.currentTarget.value)} />
  const MockSelect = ({ id, value, onChange, disabled, className, children, innerTopSlot, 'aria-label': ariaLabel }: SelectProps) => <><select id={id} value={value === undefined ? '' : String(value)} disabled={disabled} className={className} aria-label={ariaLabel} onChange={(event) => onChange?.(event.currentTarget.value)}>{children}</select>{innerTopSlot}</>
  const MockOption = ({ value, children }: OptionProps) => <option value={value === undefined ? '' : String(value)}>{children}</option>
  return { CompatInput: Object.assign(MockInput, { TextArea: MockTextArea }), CompatSelect: Object.assign(MockSelect, { Option: MockOption }) }
})

function videoModel(overrides: Partial<ModelRecord> = {}): ModelRecord {
  return {
    id: 'cogvideo', code: 'cogvideo', alias: 'cogvideo-public', name: 'CogVideo', company: '智谱AI', modality: 'video', capabilities: ['视频生成'], description: '视频模型',
    officialPrice: { base: 2, unit: '¥/秒' }, tokenNxPrice: { base: 1.6, unit: '¥/秒' }, labels: ['视频'], availability: { rate: 99, window: '近 24 小时' }, providerCount: 1, throughput: { value: 1, unit: 'K seconds' },
    ...overrides,
  }
}

function configuredVideoModel(overrides: Partial<ModelRecord> = {}): ModelRecord {
  return videoModel({
    id: 'configured-video', alias: 'configured-video-public', name: 'Configured Video',
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

function renderVideoPage(): void {
  const appStore = createAppStore()
  appStore.dispatch(synchronizeAuthenticatedUser({ id: 'video-user', display_name: '视频测试用户', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' }))
  render(<MemoryRouter initialEntries={['/console/video']}><Provider store={appStore}><AppStoreProvider><VideoPage /></AppStoreProvider></Provider></MemoryRouter>)
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
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    await user.selectOptions(screen.getByRole('combobox', { name: '参考素材' }), 'first-last')
    await user.click(screen.getByRole('button', { name: '首帧 URL' }))
    await user.type(screen.getByLabelText('首帧 URL', { selector: 'input' }), 'https://cdn.example.com/first-frame.png')
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
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0]).toMatchObject({ accessToken: 'user-access-token', model: 'cogvideo-public', prompt: '海边日落，镜头缓慢推进', duration: 5, size: '1280x720', inputReference: 'https://cdn.example.com/reference.png' })
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
    ['16:9', '720P', '1280x720'], ['16:9', '1080P', '1920x1080'],
    ['9:16', '720P', '720x1280'], ['1:1', '1024P', '1024x1024'],
  ])('原比例图标菜单选择 %s · %s 原样提交真实尺寸 %s', async (ratio, resolution, size) => {
    const user = userEvent.setup()
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    const sizeSelect = screen.getByRole('combobox', { name: '比例' })
    await user.click(screen.getByRole('button', { name: ratio }))
    if (resolution !== '1024P') await user.click(screen.getByRole('button', { name: resolution }))
    expect(within(sizeSelect).getByRole('option', { selected: true })).toHaveTextContent(`${ratio} · ${resolution}`)
    await user.type(screen.getByLabelText('视频提示词'), '日落下的山川')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0].size).toBe(size)
  })

  it('保留全部原比例图标与清晰度排列，未支持选项不会伪装成其他尺寸', async () => {
    const user = userEvent.setup()
    renderVideoPage()
    const ratioButtons = within(document.querySelector('.video-aspect-options')!).getAllByRole('button')
    expect(ratioButtons.map((button) => button.textContent)).toEqual(['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'])
    expect(document.querySelectorAll('.video-ratio-icon')).toHaveLength(7)
    expect(within(document.querySelector('.video-resolution-options')!).getAllByRole('button').map((button) => button.textContent)).toEqual(['480P', '720P', '1080P'])
    for (const option of ['adaptive', '21:9', '4:3', '3:4', '480P']) expect(screen.getByRole('button', { name: option })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '1080P' }))
    await user.click(screen.getByRole('button', { name: '9:16' }))
    expect(screen.getByRole('combobox', { name: '比例' })).toHaveTextContent('9:16 · 720P')
    expect(screen.getByRole('button', { name: '1080P' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '1:1' }))
    expect(screen.getByRole('combobox', { name: '比例' })).toHaveTextContent('1:1 · 1024P')
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

  it('历史生成弹窗点击工作区其他位置会收起', async () => {
    const user = userEvent.setup()
    renderVideoPage()

    await screen.findByRole('option', { name: /CogVideo/ })
    const panel = document.querySelector('.video-history-panel')
    await user.click(screen.getByRole('button', { name: '历史生成' }))
    expect(panel).toHaveClass('is-open')

    await user.click(screen.getByText('准备开始生成'))
    expect(panel).not.toHaveClass('is-open')
  })

  it('生成模式 Select 支持参考图与首尾帧切换', async () => {
    const user = userEvent.setup()
    renderVideoPage()

    await screen.findByRole('option', { name: /CogVideo/ })
    await user.selectOptions(screen.getByRole('combobox', { name: '参考素材' }), 'first-last')
    expect(screen.getByRole('button', { name: '首帧 URL' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '末帧 URL' })).toBeInTheDocument()
  })

  it('首帧远程URL正常提交，旧模型未支持的末帧和声音保持明确禁用', async () => {
    const user = userEvent.setup()
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
    await user.selectOptions(screen.getByRole('combobox', { name: '参考素材' }), 'first-last')
    expect(screen.getByRole('button', { name: '首帧 URL' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '末帧 URL' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '声音' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '首帧 URL' }))
    await user.type(screen.getByLabelText('首帧 URL', { selector: 'input' }), 'https://cdn.example.com/first.png')
    expect(screen.getByLabelText('末帧 URL', { selector: 'input' })).toBeDisabled()
    expect(document.querySelector('input[type="file"]')).toBeNull()
    await confirmReferenceDialog(user)
    await user.type(screen.getByLabelText('视频提示词'), '根据首帧生成视频')
    await user.click(screen.getByRole('button', { name: '生成视频' }))
    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledOnce())
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0].inputReference).toBe('https://cdn.example.com/first.png')
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

  it('目录中的自动时长默认值 -1 与默认分辨率直接用于生成', async () => {
    const user = userEvent.setup()
    const model = configuredVideoModel()
    model.videoOptions = { ...model.videoOptions, default_duration: -1, default_resolution: '1080p', max_duration: 30 }
    mockVideoCatalog([model])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()

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
    expect(screen.getByRole('combobox', { name: '比例' })).toHaveTextContent('16:9 · 720P')
  })

  it('支持双图的模型可填写首尾帧远程URL并保留各自角色', async () => {
    const user = userEvent.setup()
    mockVideoCatalog([configuredVideoModel()])
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
    await user.click(screen.getByRole('button', { name: '参考素材 · 添加参考素材' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('参考素材')
    expect(screen.getByLabelText('素材隐私说明')).toBeInTheDocument()
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
    mockVideoCatalog([configuredVideoModel()])
    vi.mocked(submitVideoGeneration).mockResolvedValue(succeededTask)
    renderVideoPage()
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
