import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppStoreProvider } from '@/data/app-state'
import { createAppStore } from '@/store'
import type { UserApiKey } from '@/api/user-api-keys'
import type { VideoTask } from '@/api/video-runtime'
import type { ModelRecord } from '@/data/models'
import { getUserApiKeys } from '@/api/user-api-keys'
import { cancelVideoTask, getVideoTask, submitVideoGeneration } from '@/api/video-runtime'
import { useUserModels } from '@/data/user-models'
import { VideoPage } from './video-generation'

vi.mock('@/api/user-api-keys', () => ({ getUserApiKeys: vi.fn() }))

vi.mock('@/api/video-runtime', () => {
  class MockVideoRuntimeError extends Error {
    readonly requestId: string | null = null
  }

  return { cancelVideoTask: vi.fn(), getVideoTask: vi.fn(), submitVideoGeneration: vi.fn(), videoTaskIsTerminal: (status: string) => ['succeeded', 'failed', 'cancelled', 'expired'].includes(status), VideoRuntimeError: MockVideoRuntimeError }
})

vi.mock('@/data/user-models', () => ({ useUserModels: vi.fn() }))

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
  type InputProps = { id?: string; value?: string; onChange?: (value: string) => void; placeholder?: string; disabled?: boolean; maxLength?: number; rows?: number; className?: string; 'aria-label'?: string }
  type SelectProps = { id?: string; value?: string | number; onChange?: (value: string) => void; disabled?: boolean; className?: string; children?: ReactNode; 'aria-label'?: string }
  type OptionProps = { value?: string | number; children?: ReactNode }
  const MockInput = ({ id, value, onChange, placeholder, disabled, maxLength, className, 'aria-label': ariaLabel }: InputProps) => <input id={id} value={value ?? ''} placeholder={placeholder} disabled={disabled} maxLength={maxLength} className={className} aria-label={ariaLabel} onChange={(event) => onChange?.(event.currentTarget.value)} />
  const MockTextArea = ({ id, value, onChange, placeholder, disabled, maxLength, rows, className, 'aria-label': ariaLabel }: InputProps) => <textarea id={id} value={value ?? ''} placeholder={placeholder} disabled={disabled} maxLength={maxLength} rows={rows} className={className} aria-label={ariaLabel} onChange={(event) => onChange?.(event.currentTarget.value)} />
  const MockSelect = ({ id, value, onChange, disabled, className, children, 'aria-label': ariaLabel }: SelectProps) => <select id={id} value={value === undefined ? '' : String(value)} disabled={disabled} className={className} aria-label={ariaLabel} onChange={(event) => onChange?.(event.currentTarget.value)}>{children}</select>
  const MockOption = ({ value, children }: OptionProps) => <option value={value === undefined ? '' : String(value)}>{children}</option>
  return { CompatInput: Object.assign(MockInput, { TextArea: MockTextArea }), CompatSelect: Object.assign(MockSelect, { Option: MockOption }) }
})

function activeApiKey(overrides: Partial<UserApiKey> = {}): UserApiKey {
  return {
    id: 'key-video-test', name: '视频联调密钥', masked_key: 'nx_live_••••••••test', secret: 'nx_live_video_secret', status: 'active', scope: 'all', model_ids: null, models: [], tags: [], billing_source: 'balance',
    limits: { enabled: true, cost_limit_yuan: null, used_amount_yuan: '0', rpm: null, tpm: null, concurrency: null },
    creator: { id: 'user-video-test', display_name: '测试用户', masked_phone: '138****0000' }, created_at: Date.parse('2026-07-30T10:00:00Z'), expires_at: null, last_used_at: null,
    ...overrides,
  }
}

function videoModel(overrides: Partial<ModelRecord> = {}): ModelRecord {
  return {
    id: 'cogvideo', code: 'cogvideo', alias: 'cogvideo-public', name: 'CogVideo', company: '智谱AI', modality: 'video', capabilities: ['视频生成'], description: '视频模型',
    officialPrice: { base: 2, unit: '¥/秒' }, tokenNxPrice: { base: 1.6, unit: '¥/秒' }, labels: ['视频'], availability: { rate: 99, window: '近 24 小时' }, providerCount: 1, throughput: { value: 1, unit: 'K seconds' },
    ...overrides,
  }
}

const pendingTask: VideoTask = { taskId: 'task-video-1', status: 'pending', progress: 0, resultUrl: null, thumbnailUrl: null, errorMessage: null, requestId: 'request-video-1', raw: {} }
const processingTask: VideoTask = { ...pendingTask, status: 'processing', progress: 38 }
const succeededTask: VideoTask = { ...pendingTask, status: 'succeeded', progress: 100, resultUrl: 'https://cdn.example.com/video-1.mp4' }

function renderVideoPage(): void {
  render(<MemoryRouter initialEntries={['/console/video']}><Provider store={createAppStore()}><AppStoreProvider><VideoPage /></AppStoreProvider></Provider></MemoryRouter>)
}

describe('视频生成页面', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(useUserModels).mockReturnValue({ models: [videoModel(), videoModel({ id: 'other-video', code: 'other-video', alias: 'other-video-public', name: 'Other Video' })], activities: [], total: null, page: null, pageSize: null, loading: false, error: '', refresh: vi.fn() })
    vi.mocked(getUserApiKeys).mockResolvedValue({ items: [activeApiKey()], available_models: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('加载 API Key 后只展示该密钥可调用的视频模型', async () => {
    vi.mocked(getUserApiKeys).mockResolvedValue({ items: [activeApiKey({ scope: 'selected', model_ids: ['cogvideo'] })], available_models: [] })
    const user = userEvent.setup()
    renderVideoPage()

    expect(await screen.findByRole('option', { name: /CogVideo/ })).toBeInTheDocument()
    const modelSelect = document.getElementById('video-model')
    expect(modelSelect).not.toBeNull()
    expect(screen.queryByRole('option', { name: /Other Video/ })).toBeNull()
    expect(document.querySelector('.video-history-panel')).toBeInTheDocument()
    expect(document.querySelector('.video-workspace.experience-workbench')).toBeInTheDocument()
  })

  it('提交真实参数并轮询到结果视频', async () => {
    const user = userEvent.setup()
    vi.mocked(submitVideoGeneration).mockResolvedValue(pendingTask)
    vi.mocked(getVideoTask).mockResolvedValue(succeededTask)
    renderVideoPage()

    await screen.findByRole('option', { name: /CogVideo/ })
    await user.type(screen.getByLabelText('视频提示词'), '海边日落，镜头缓慢推进')
    await user.click(screen.getByRole('button', { name: '参考图 · 上传参考图' }))
    await user.type(screen.getByLabelText('参考图 URL'), 'https://cdn.example.com/reference.png')
    await user.click(screen.getByRole('button', { name: '生成视频' }))

    await waitFor(() => expect(submitVideoGeneration).toHaveBeenCalledTimes(1))
    expect(vi.mocked(submitVideoGeneration).mock.calls[0]?.[0]).toMatchObject({ apiKey: 'nx_live_video_secret', model: 'cogvideo-public', prompt: '海边日落，镜头缓慢推进', duration: 5, size: '1280x720', inputReference: 'https://cdn.example.com/reference.png' })
    await waitFor(() => expect(getVideoTask).toHaveBeenCalledWith('nx_live_video_secret', 'task-video-1', expect.anything()), { timeout: 2_500 })
    expect(await screen.findByLabelText('视频生成结果')).toBeInTheDocument()
    expect(document.querySelector('.video-status-success')).toHaveTextContent('已完成')
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

    await waitFor(() => expect(cancelVideoTask).toHaveBeenCalledWith('nx_live_video_secret', 'task-video-1'))
    await waitFor(() => expect(getVideoTask).toHaveBeenCalledWith('nx_live_video_secret', 'task-video-1', expect.anything()), { timeout: 2_500 })
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
    await user.selectOptions(screen.getByRole('combobox', { name: '参考图' }), 'first-last')
    expect(screen.getByRole('button', { name: '首帧 URL' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '末帧 URL' })).toBeInTheDocument()
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
    expect(screen.getByRole('combobox', { name: '时长' })).toHaveValue('duration')
  })

  it('工作区缺少可用密钥时在结果区内显示提示', async () => {
    vi.mocked(getUserApiKeys).mockResolvedValue({ items: [], available_models: [] })
    renderVideoPage()

    await waitFor(() => expect(document.querySelector('.video-workspace-notice')).toBeInTheDocument())
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
})
