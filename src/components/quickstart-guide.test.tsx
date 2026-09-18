import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import i18n from '@/i18n'
import { MODEL_CATALOG } from '@/data/models'
import { useUserModels } from '@/data/user-models'
import { QuickstartGuide } from './quickstart-guide'

vi.mock('@/data/user-models', () => ({ useUserModels: vi.fn() }))

const models = [
  { ...MODEL_CATALOG[0], id: 'text-1', alias: 'text-one', name: 'Text One', modality: 'text' as const },
  { ...MODEL_CATALOG[0], id: 'text-2', alias: 'text-two', name: 'Text Two', modality: 'text' as const },
  { ...MODEL_CATALOG[0], id: 'image-1', alias: 'image-one', name: 'Image One', modality: 'image' as const },
]

function NavigationProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return <><output data-testid="query">{location.search}</output><output data-testid="pathname">{location.pathname}</output><output data-testid="route-state">{JSON.stringify(location.state)}</output><button onClick={() => navigate(-1)}>后退</button><button onClick={() => navigate(1)}>前进</button></>
}

function renderGuide(query = '') {
  return render(<MemoryRouter initialEntries={['/console/quickstart' + query]}><Routes><Route path="/console/quickstart" element={<QuickstartGuide />} /><Route path="/docs/*" element={<div />} /><Route path="/en/docs/*" element={<div />} /></Routes><NavigationProbe /></MemoryRouter>)
}

function currentParams() {
  return new URLSearchParams(screen.getByTestId('query').textContent ?? '')
}

beforeEach(() => {
  void i18n.changeLanguage('zh-CN')
  vi.mocked(useUserModels).mockReturnValue({ models, activities: [], total: null, page: null, pageSize: null, loading: false, error: '', refresh: vi.fn() })
})
afterEach(() => { Toast.destroyAll(); vi.restoreAllMocks() })

describe('快速接入选项与模型边界', () => {
  it.each([
    ['ChatGPT', '/docs/01M074Z9VZ3ZVE60PRQYNFDVEQ/chatgpt'],
    ['OpenCode 桌面端', '/docs/01M074Z9VZCQHJJYXD38M8C6QD/opencode-desktop'],
    ['WorkBuddy', '/docs/01M074Z9VZA7TN69HNMJG6BAY1/workbuddy'],
    ['CodeBuddy', '/docs/01M074Z9VZJ64B7AMDSAANE0X9/codebuddy'],
    ['Hermes Agent', '/docs/01M074Z9VZDTQ59SB7F80TW1GP/hermes-agent'],
    ['Cursor', '/docs/01M074Z9VZQAKBA72757SS2J1Y/cursor'],
    ['Kilo Code', '/docs/01M074Z9VZZFYDP7W07HQW8MHG/kilo-code'],
    ['Cherry Studio', '/docs/01M074Z9VZRFKCX72EKCTBBK87/cherry-studio'],
    ['TRAE', '/docs/01M074Z9VZ7XNKVXWESFPA1PR6/trae'],
  ])('%s 文档在当前路由打开，并携带使用指南回退标记', (tool, path) => {
    renderGuide()
    fireEvent.click(screen.getByRole('button', { name: '接入智能体' }))
    fireEvent.click(screen.getByRole('tab', { name: 'AI 工具接入' }))
    fireEvent.click(screen.getByRole('tab', { name: tool }))
    expect(screen.getByRole('tab', { name: tool }).querySelector('img')).toHaveAttribute('src', expect.stringMatching(/\.svg|^data:image\/svg\+xml/))
    const link = screen.getByRole('link', { name: /查看文档/ })
    expect(link).toHaveAttribute('href', path)
    expect(link).not.toHaveAttribute('target')
    fireEvent.click(link)
    expect(screen.getByTestId('pathname')).toHaveTextContent(path)
    expect(screen.getByTestId('route-state')).toHaveTextContent('"quickstartUsageGuide":true')
  })

  it('工具目录与使用指南顺序一致，移除旧占位工具', () => {
    renderGuide()
    fireEvent.click(screen.getByRole('button', { name: '接入智能体' }))
    fireEvent.click(screen.getByRole('tab', { name: 'AI 工具接入' }))
    expect(Array.from(screen.getByRole('tablist', { name: 'AI 工具' }).querySelectorAll('[role="tab"]')).map((tab) => tab.textContent)).toEqual(['ChatGPT', 'OpenCode 桌面端', 'WorkBuddy', 'CodeBuddy', 'Cursor', 'Hermes Agent', 'Kilo Code', 'Cherry Studio', 'TRAE'])
  })

  it('英文工具文档保留英文路由', async () => {
    await i18n.changeLanguage('en-US')
    renderGuide()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('console.quickstart.stepAgent') }))
    fireEvent.click(screen.getByRole('tab', { name: i18n.t('console.quickstart.agentIntegration') }))
    expect(screen.getByRole('link', { name: /View docs/i })).toHaveAttribute('href', '/en/docs/01M074Z9VZA7TN69HNMJG6BAY1/workbuddy')
  })
  it('Responses 模式同步 URL，切换语言、模型和创建密钥返回链接均保留模式', () => {
    renderGuide('?model=text-one&protocol=openai&language=curl&source=shared')
    fireEvent.click(screen.getByRole('button', { name: '接入智能体' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Responses API' }))
    expect(currentParams().get('apiMode')).toBe('responses')
    fireEvent.click(screen.getByRole('tab', { name: 'Node.js' }))
    expect(currentParams().get('language')).toBe('node')
    expect(document.querySelector('pre')).toHaveTextContent('client.responses.create')
    fireEvent.click(screen.getByRole('button', { name: '选择示例模型' }))
    fireEvent.click(screen.getByRole('button', { name: /Text Two/ }))
    expect(currentParams().get('model')).toBe('text-two')
    expect(currentParams().get('apiMode')).toBe('responses')
    expect(currentParams().get('source')).toBe('shared')
    fireEvent.click(screen.getByRole('button', { name: '创建 API Key' }))
    const href = screen.getByRole('link', { name: '立即创建' }).getAttribute('href')!
    const returnPath = new URL(href, 'http://localhost').searchParams.get('return')!
    expect(new URL(returnPath, 'http://localhost').searchParams.get('apiMode')).toBe('responses')
  })

  it('分享或重新挂载保留 Responses，前进后退同步全部接入选项', () => {
    const view = renderGuide('?model=text-one&protocol=openai&language=python&apiMode=responses')
    fireEvent.click(screen.getByRole('button', { name: '接入智能体' }))
    expect(screen.getByRole('tab', { name: 'Responses API' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Python' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'Gemini' }))
    expect(currentParams().get('apiMode')).toBe('chat')
    expect(document.querySelector('pre')).toHaveTextContent('genai.Client')
    fireEvent.click(screen.getByRole('button', { name: '后退' }))
    expect(screen.getByRole('tab', { name: 'Responses API' })).toHaveAttribute('aria-selected', 'true')
    expect(document.querySelector('pre')).toHaveTextContent('client.responses.create')
    fireEvent.click(screen.getByRole('button', { name: '前进' }))
    expect(screen.getByRole('tab', { name: 'Gemini' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('button', { name: '后退' }))
    const query = screen.getByTestId('query').textContent!
    view.unmount()
    renderGuide(query)
    fireEvent.click(screen.getByRole('button', { name: '接入智能体' }))
    expect(screen.getByRole('tab', { name: 'Responses API' })).toHaveAttribute('aria-selected', 'true')
  })

  it.each(['', '?model=text-one&protocol=invalid&language=invalid&apiMode=invalid'])('缺失或非法选项统一回退 cURL：%s', (query) => {
    renderGuide(query)
    expect(currentParams().get('language')).toBe('curl')
    expect(currentParams().get('protocol')).toBe('openai')
    expect(currentParams().get('apiMode')).toBe('chat')
  })

  it('非文本模型保留选择并提示专用样例，不再提供错误的对话代码与复制按钮', () => {
    renderGuide('?model=image-one&apiMode=responses')
    fireEvent.click(screen.getByRole('button', { name: '接入智能体' }))
    expect(screen.getByText('Image One 暂无公开代码样例').closest('[role="status"]')).not.toBeNull()
    expect(currentParams().get('model')).toBe('image-one')
    expect(document.querySelector('pre')).toBeNull()
    expect(screen.queryByRole('button', { name: '复制' })).toBeNull()
  })

  it('收起的面板禁止焦点与交互，展开后恢复', () => {
    renderGuide()
    const panel = document.querySelector('#quickstart-agent')!.closest('.quickstart-pdf-step-panel')!
    expect(panel).toHaveAttribute('inert')
    fireEvent.click(screen.getByRole('button', { name: '接入智能体' }))
    expect(panel).not.toHaveAttribute('inert')
    fireEvent.click(screen.getByRole('button', { name: '接入智能体' }))
    expect(panel).toHaveAttribute('inert')
  })
})

describe('快速接入无数据状态', () => {
  it('空列表保留标题、空状态和可用的重试入口', () => {
    const refresh = vi.fn()
    vi.mocked(useUserModels).mockReturnValue({ models: [], activities: [], total: null, page: null, pageSize: null, loading: false, error: '', refresh })
    render(<MemoryRouter><QuickstartGuide /></MemoryRouter>)
    expect(screen.getByText('几分钟内完成接入')).toBeVisible()
    expect(screen.getByText('暂无可用模型')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
    expect(refresh).toHaveBeenCalledOnce()
  })
  it('请求失败显示错误面板，不再返回空容器', () => {
    vi.mocked(useUserModels).mockReturnValue({ models: [], activities: [], total: null, page: null, pageSize: null, loading: false, error: '服务暂不可用', refresh: vi.fn() })
    render(<MemoryRouter><QuickstartGuide /></MemoryRouter>)
    expect(screen.getByText('模型加载失败')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('服务暂不可用')
  })
})
