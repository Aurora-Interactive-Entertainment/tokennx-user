import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppStoreProvider } from '@/data/app-state'
import { createAppStore } from '@/store'
import { MODEL_API_BASE_URL, ModelRuntimeError, streamChatCompletion } from '@/api/model-runtime'
import { getUserApiKeys, type UserApiKey } from '@/api/user-api-keys'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import type { AuthResult } from '@/api/auth'
import { apiKeySupportsModel, ConsoleModelsPage, PlaygroundPage, QuickstartPage } from './console-core'

function CurrentPath() {
  const location = useLocation()
  return <output data-testid="current-path">{location.pathname}</output>
}

function renderConsolePage(page: React.ReactNode, initialEntries: string[] = ['/console']): void {
  render(<MemoryRouter initialEntries={initialEntries}><Provider store={createAppStore()}><AppStoreProvider>{page}</AppStoreProvider></Provider></MemoryRouter>)
}

vi.mock('@/api/model-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/model-runtime')>()
  return { ...actual, streamChatCompletion: vi.fn() }
})

vi.mock('@/api/user-api-keys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/user-api-keys')>()
  return { ...actual, getUserApiKeys: vi.fn() }
})

function activeApiKey(): UserApiKey {
  return {
    id: 'key-live-test',
    name: '联调密钥',
    masked_key: 'nx_live_••••••••test',
    secret: 'nx_live_test_secret',
    status: 'active',
    scope: 'all',
    model_ids: null,
    models: [],
    tags: [],
    billing_source: 'balance',
    limits: { enabled: true, cost_limit_yuan: null, used_amount_yuan: '0', rpm: null, tpm: null, concurrency: null },
    creator: { id: 'user-test', display_name: '测试用户', masked_phone: '138****0000' },
    created_at: '2026-07-27T10:00:00Z',
    expires_at: null,
    last_used_at: null,
  }
}

function authResult(): AuthResult {
  return {
    status: 'succeeded',
    binding_required: false,
    access_token: 'console-model-token',
    refresh_token: 'refresh-token',
    refresh_expires_at: Date.UTC(2099, 0, 1),
    user: {
      id: 'user-test',
      display_name: '测试用户',
      avatar_url: '',
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      status: 'active',
    },
  }
}

function visibleModelsResponse(): { items: Array<Record<string, unknown>> } {
  return {
    items: [
      {
        id: 'deepseek-chat', alias: 'deepseek-public', name: '后端 DeepSeek', company: '后端厂商', modality: 'text', billing_mode: 'token', context_window_tokens: 64000,
        description: '来自用户模型目录的模型', capabilities: ['chat'], provider_count: 1, total_tokens: '1770000000',
        prices: [{ meter_code: 'input', meter_kind: 'input_token', unit: 'token', currency: 'CNY', unit_quantity: 1000000, unit_price_yuan: '0.10', tier_no: 0 }],
      },
      {
        id: 'qwen-chat', alias: 'qwen-public', name: '后端 Qwen', company: '后端千问厂商', modality: 'text', billing_mode: 'token', context_window_tokens: 32000,
        description: '来自用户模型目录的另一文本模型', capabilities: ['chat'], provider_count: 1, total_tokens: '1200000',
        prices: [{ meter_code: 'input', meter_kind: 'input_token', unit: 'token', currency: 'CNY', unit_quantity: 1000000, unit_price_yuan: '0.20', tier_no: 0 }],
      },
      {
        id: 'backend-vision', name: '后端 Vision', company: '后端视觉厂商', modality: 'image', billing_mode: 'request',
        description: '来自用户模型目录的无价格模型', capabilities: null, provider_count: 0, prices: null,
      },
    ],
  }
}

function manyModelsResponse(): { items: Array<Record<string, unknown>> } {
  return {
    items: Array.from({ length: 12 }, (_, index) => {
      const number = index + 1
      const image = number > 8
      const free = number === 12
      const price = free ? '0.00' : (number / 10).toFixed(2)
      return {
        id: `backend-model-${number}`,
        alias: `backend-public-${number}`,
        name: `后端模型 ${number}`,
        company: number % 2 === 0 ? '后端厂商 A' : '后端厂商 B',
        modality: image ? 'image' : 'text',
        billing_mode: 'token',
        context_window_tokens: image ? undefined : 32000,
        description: `后端模型 ${number} 描述`,
        capabilities: image ? ['图像生成'] : ['chat'],
        provider_count: 1,
        total_tokens: `${number * 1000}`,
        prices: image
          ? [{ meter_code: 'base', meter_kind: 'request', unit: 'request', currency: 'CNY', unit_quantity: 1, unit_price_yuan: price, tier_no: 0 }]
          : [{ meter_code: 'input', meter_kind: 'input_token', unit: 'token', currency: 'CNY', unit_quantity: 1000000, unit_price_yuan: price, tier_no: 0 }],
      }
    }),
  }
}

async function selectPlaygroundApiKey(user: ReturnType<typeof userEvent.setup>, name = '联调密钥'): Promise<void> {
  const keySelect = await waitFor(() => {
    const element = document.getElementById('playground-api-key')
    if (!element) throw new Error('API Key 选择器尚未渲染')
    return element
  })
  await user.click(keySelect)
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(`${name} ·`) }))
}

describe('控制台模型接入页面', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAuthTokens()
    saveAuthTokens(authResult())
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 0, msg: 'success', data: visibleModelsResponse() }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('按 API Key 范围判断模型权限，全部范围允许文本模型，指定范围只允许授权模型', () => {
    const deepseek = { id: 'model-public-deepseek', code: 'deepseek-chat', alias: 'deepseek-public' }
    const qwen = { id: 'model-public-qwen', code: 'qwen-chat', alias: 'qwen-public' }
    const allKey = activeApiKey()
    const selectedKey = { ...allKey, scope: 'selected' as const, model_ids: ['qwen-chat'], models: [] }

    expect(apiKeySupportsModel(undefined, deepseek)).toBe(false)
    expect(apiKeySupportsModel(allKey, deepseek)).toBe(true)
    expect(apiKeySupportsModel(allKey, qwen)).toBe(true)
    expect(apiKeySupportsModel(selectedKey, deepseek)).toBe(false)
    expect(apiKeySupportsModel(selectedKey, qwen)).toBe(true)
  })

  it('显示配置的 Base URL，并支持复制可执行接入样例', async () => {
    const user = userEvent.setup()
    const clipboardWriteText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    renderConsolePage(<QuickstartPage />, ['/console/quickstart?model=deepseek-chat&protocol=openai&language=curl'])

    await waitFor(() => expect(screen.getByText('后端连接已配置')).toBeInTheDocument())
    expect(screen.getByText(MODEL_API_BASE_URL)).toBeInTheDocument()
    expect(screen.getByText(/后端 DeepSeek · OpenAI/)).toBeInTheDocument()
    expect(screen.getByText(/chat\/completions/)).toBeInTheDocument()
    expect(screen.queryByText(/真实 API 未接入|api\.tokennx\.invalid|本地演示模式/)).toBeNull()

    await user.click(screen.getByRole('button', { name: '复制模型 Base URL' }))

    expect(clipboardWriteText).toHaveBeenCalledWith(MODEL_API_BASE_URL)
  })

  it('将接口返回的全部用户可见模型展示在模型广场', async () => {
    const user = userEvent.setup()
    const clipboardWriteText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    renderConsolePage(<ConsoleModelsPage />, ['/console/models'])

    await waitFor(() => expect(screen.getByText('3 个模型')).toBeInTheDocument())
    expect(screen.getByText('后端 DeepSeek')).toBeInTheDocument()
    expect(screen.getByText('后端 Qwen')).toBeInTheDocument()
    expect(screen.getByText('deepseek-public')).toBeInTheDocument()
    expect(screen.getByText('后端 Vision')).toBeInTheDocument()
    expect(screen.getByText('后端视觉厂商')).toBeInTheDocument()
    expect(screen.getByText('1.77B token')).toBeInTheDocument()
    expect(document.querySelector('.models-console-page .model-card-grid')).not.toHaveClass('model-card-grid--single')

    await user.click(screen.getByRole('button', { name: '复制 后端 DeepSeek 模型别名' }))
    expect(clipboardWriteText).toHaveBeenCalledWith('deepseek-public')
  })

  it('分页后切换搜索会回到第一页，并按当前结果显示范围', async () => {
    const user = userEvent.setup()
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(JSON.stringify({ code: 0, msg: 'success', data: manyModelsResponse() }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderConsolePage(<ConsoleModelsPage />, ['/console/models'])

    await waitFor(() => expect(screen.getByText('12 个模型')).toBeInTheDocument())
    expect(screen.getByText('显示 1-10 / 共 12 条')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '下一页' }))
    expect(await screen.findByText('显示 11-12 / 共 12 条')).toBeInTheDocument()

    const search = screen.getByRole('textbox', { name: '搜索模型名称或公司' })
    await user.type(search, '后端模型 12')
    expect(await screen.findByText('1 个模型')).toBeInTheDocument()
    expect(screen.getByText('显示 1-1 / 共 1 条')).toBeInTheDocument()
    expect(screen.getByText('后端模型 12')).toBeInTheDocument()
    expect(document.querySelector('.models-console-page .model-card-grid')).toHaveClass('model-card-grid--single')
  })

  it('免费筛选联动分类计数，并支持清除无结果条件', async () => {
    const user = userEvent.setup()
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(JSON.stringify({ code: 0, msg: 'success', data: manyModelsResponse() }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderConsolePage(<ConsoleModelsPage />, ['/console/models'])

    await waitFor(() => expect(screen.getByText('12 个模型')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '免费' }))
    expect(await screen.findByText('1 个模型')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /全部\s*1/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /图片\s*1/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /文本\s*0/ })).toBeDisabled()

    const search = screen.getByRole('textbox', { name: '搜索模型名称或公司' })
    await user.type(search, '不存在')
    expect(await screen.findByText('未找到匹配模型')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '清除筛选' }))
    expect(await screen.findByText('12 个模型')).toBeInTheDocument()
  })

  it('未选择 API Key 时隐藏模型列表，选择后只展示该 Key 可访问的模型', async () => {
    const user = userEvent.setup()
    const scopedApiKey: UserApiKey = {
      ...activeApiKey(),
      id: 'key-scoped-test',
      name: '限定模型密钥',
      scope: 'selected',
      model_ids: ['deepseek-chat'],
      models: [{ id: 'deepseek-chat', alias: 'deepseek-public', name: '后端 DeepSeek', company: '后端厂商' }],
    }
    vi.mocked(getUserApiKeys).mockResolvedValue({ items: [activeApiKey(), scopedApiKey], available_models: [] })

    renderConsolePage(<PlaygroundPage />, ['/console/playground?model=deepseek-chat'])

    await waitFor(() => expect(screen.getByText('请选择 API Key')).toBeInTheDocument())
    const modelSelect = document.getElementById('playground-model')
    expect(modelSelect).not.toBeNull()
    expect(modelSelect).toHaveAttribute('aria-disabled', 'true')

    await selectPlaygroundApiKey(user, '限定模型密钥')

    if (!modelSelect) throw new Error('模型选择器尚未渲染')
    await waitFor(() => expect(modelSelect).toHaveAttribute('aria-disabled', 'false'))
    await user.click(modelSelect)
    expect(await screen.findByRole('option', { name: /后端 DeepSeek/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /后端 Qwen/ })).toBeNull()
  })

  it('加载活动 API Key 后把用户输入交给模型请求并展示真实回复', async () => {
    const user = userEvent.setup()
    const apiKey = activeApiKey()
    const clipboardWriteText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    vi.mocked(getUserApiKeys).mockResolvedValue({ items: [apiKey], available_models: [] })
    vi.mocked(streamChatCompletion).mockImplementation(async (input) => {
      input.onReasoningDelta?.('先')
      input.onReasoningDelta?.('分析')
      input.onDelta?.('真实')
      input.onDelta?.('回复')
      return { content: '**真实回复**\n\n- Markdown 已渲染\n\n<script>alert(1)</script>', reasoning: '先分析', requestId: 'req-live-test', inputTokens: 8, outputTokens: 4, finishReason: 'stop', latencyMs: 96 }
    })

    renderConsolePage(<PlaygroundPage />, ['/console/playground?model=deepseek-chat'])

    await selectPlaygroundApiKey(user)
    expect(screen.queryByText('模型服务已就绪')).toBeNull()
    await user.type(screen.getByLabelText('测试提示词'), '请返回真实结果')
    await user.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => expect(streamChatCompletion).toHaveBeenCalledTimes(1))
    expect(vi.mocked(streamChatCompletion).mock.calls[0]?.[0]).toMatchObject({
      apiKey: 'nx_live_test_secret',
      model: 'deepseek-public',
      messages: [{ role: 'user', content: '请返回真实结果' }],
      temperature: 0.7,
      maxTokens: 2000,
    })
    expect(vi.mocked(streamChatCompletion).mock.calls[0]?.[0]).not.toHaveProperty('prompt')
    expect(await screen.findByText('真实回复')).toBeInTheDocument()
    expect(screen.getByText('思考过程')).toBeInTheDocument()
    expect(screen.getByText('先分析')).toBeInTheDocument()
    expect(screen.getByText('Markdown 已渲染')).toBeInTheDocument()
    expect(document.querySelector('.message.ai script')).toBeNull()
    expect(screen.getByText(/后端 DeepSeek · deepseek-public · Temperature 0.7 · Max Tokens 2000/)).toBeInTheDocument()
    expect(screen.queryByText(/deepseek-chat · 第/)).toBeNull()
    expect(screen.queryByText(/第 .*轮/)).toBeNull()

    await user.click(screen.getByRole('button', { name: '复制回复' }))
    await user.click(screen.getByRole('button', { name: '复制用户消息' }))
    expect(clipboardWriteText).toHaveBeenNthCalledWith(1, '**真实回复**\n\n- Markdown 已渲染\n\n<script>alert(1)</script>')
    expect(clipboardWriteText).toHaveBeenNthCalledWith(2, '请返回真实结果')
  })

  it('限制输入为 1000 个字符并显示实时字符计数', async () => {
    const user = userEvent.setup()
    vi.mocked(getUserApiKeys).mockResolvedValue({ items: [activeApiKey()], available_models: [] })

    renderConsolePage(<PlaygroundPage />, ['/console/playground?model=deepseek-chat'])
    await selectPlaygroundApiKey(user)

    const input = screen.getByLabelText('测试提示词')
    expect(screen.getByText('0/1000')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: `${'a'.repeat(1000)}b` } })

    expect(input).toHaveValue('a'.repeat(1000))
    expect(screen.getByText('1000/1000')).toBeInTheDocument()
  })

  it('连续会话请求携带当前会话历史消息', async () => {
    const user = userEvent.setup()
    vi.mocked(getUserApiKeys).mockResolvedValue({ items: [activeApiKey()], available_models: [] })
    vi.mocked(streamChatCompletion)
      .mockResolvedValueOnce({ content: '第一轮回复', reasoning: '第一轮思考', requestId: 'req-round-1', inputTokens: 3, outputTokens: 4, finishReason: 'stop', latencyMs: 20 })
      .mockResolvedValueOnce({ content: '第二轮回复', reasoning: '第二轮思考', requestId: 'req-round-2', inputTokens: 7, outputTokens: 8, finishReason: 'stop', latencyMs: 30 })

    renderConsolePage(<PlaygroundPage />, ['/console/playground?model=deepseek-chat'])
    await selectPlaygroundApiKey(user)
    await user.type(screen.getByLabelText('测试提示词'), '第一轮问题')
    await user.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(streamChatCompletion).toHaveBeenCalledTimes(1))
    await user.type(screen.getByLabelText('测试提示词'), '第二轮问题')
    await user.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(streamChatCompletion).toHaveBeenCalledTimes(2))

    expect(vi.mocked(streamChatCompletion).mock.calls[1]?.[0].messages).toEqual([
      { role: 'user', content: '第一轮问题' },
      { role: 'assistant', content: '第一轮回复' },
      { role: 'user', content: '第二轮问题' },
    ])
  })

  it('模型响应等待时显示加载动画，并用停止图标中止请求', async () => {
    const user = userEvent.setup()
    vi.mocked(getUserApiKeys).mockResolvedValue({ items: [activeApiKey()], available_models: [] })
    let aborted = false
    vi.mocked(streamChatCompletion).mockImplementationOnce((input) => new Promise((_resolve, reject) => {
      input.signal?.addEventListener('abort', () => {
        aborted = true
        reject(new DOMException('请求已中止', 'AbortError'))
      }, { once: true })
    }))

    renderConsolePage(<PlaygroundPage />, ['/console/playground?model=deepseek-chat'])
    await selectPlaygroundApiKey(user)
    await user.type(screen.getByLabelText('测试提示词'), '等待响应')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByRole('status', { name: '正在生成响应' })).toBeInTheDocument()
    expect(screen.queryByText('正在连接模型服务')).toBeNull()
    expect(screen.getByRole('button', { name: '停止生成' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '停止生成' })).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: '停止生成' }))
    await waitFor(() => expect(aborted).toBe(true))
    expect(await screen.findByRole('button', { name: '编辑失败消息' })).toBeInTheDocument()
  })

  it('达到会话限制后禁用输入并提示开启新会话', async () => {
    const user = userEvent.setup()
    vi.mocked(getUserApiKeys).mockResolvedValue({ items: [activeApiKey()], available_models: [] })
    vi.mocked(streamChatCompletion).mockImplementation(async (input) => {
      input.onDelta?.('回复')
      return { content: '回复', reasoning: '', requestId: `req-round-${vi.mocked(streamChatCompletion).mock.calls.length}`, inputTokens: 1, outputTokens: 1, finishReason: 'stop', latencyMs: 10 }
    })

    renderConsolePage(<PlaygroundPage />, ['/console/playground?model=deepseek-chat'])
    await selectPlaygroundApiKey(user)
    for (let round = 1; round <= 10; round += 1) {
      await user.type(screen.getByLabelText('测试提示词'), `第${round}次请求`)
      await user.click(screen.getByRole('button', { name: '发送' }))
      await waitFor(() => expect(streamChatCompletion).toHaveBeenCalledTimes(round))
    }

    const input = screen.getByLabelText('测试提示词')
    expect(input).toBeDisabled()
    expect(screen.getByPlaceholderText('当前会话已达到限制，请开启新的会话继续')).toBeDisabled()
    expect(screen.queryByText(/第 .*轮/)).toBeNull()
    expect(screen.queryByText(/\/10 轮/)).toBeNull()
  })

  it('失败请求可编辑并在重试成功后替换失败内容', async () => {
    const user = userEvent.setup()
    vi.mocked(getUserApiKeys).mockResolvedValue({ items: [activeApiKey()], available_models: [] })
    vi.mocked(streamChatCompletion)
      .mockRejectedValueOnce(new ModelRuntimeError('请求内容包含不允许的文本', 400, 'content_blocked', 'req-failed'))
      .mockResolvedValueOnce({ content: '重试成功', reasoning: '', requestId: 'req-retry', inputTokens: 2, outputTokens: 3, finishReason: 'stop', latencyMs: 12 })

    renderConsolePage(<PlaygroundPage />, ['/console/playground?model=deepseek-chat'])
    await selectPlaygroundApiKey(user)
    await user.type(screen.getByLabelText('测试提示词'), '失败问题')
    await user.click(screen.getByRole('button', { name: '发送' }))

    await screen.findByRole('button', { name: '编辑失败消息' })
    await user.click(screen.getByRole('button', { name: '编辑失败消息' }))
    expect(screen.getByLabelText('测试提示词')).toHaveValue('失败问题')
    await user.clear(screen.getByLabelText('测试提示词'))
    await user.type(screen.getByLabelText('测试提示词'), '修正问题')
    await user.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => expect(streamChatCompletion).toHaveBeenCalledTimes(2))
    expect(vi.mocked(streamChatCompletion).mock.calls[1]?.[0].messages).toEqual([{ role: 'user', content: '修正问题' }])
    expect(await screen.findByText('重试成功')).toBeInTheDocument()
    expect(screen.queryByText('失败问题')).toBeNull()
    expect(screen.queryByRole('button', { name: '编辑失败消息' })).toBeNull()
  })

  it('没有可用 API Key 时不展示演示连接提示或后端地址', async () => {
    vi.mocked(getUserApiKeys).mockResolvedValue({ items: [], available_models: [] })

    renderConsolePage(<PlaygroundPage />, ['/console/playground?model=deepseek-chat'])

    await waitFor(() => expect(getUserApiKeys).toHaveBeenCalledWith({ account_type: 'personal' }, 'active'))
    expect(screen.queryByText('尚未配置可用 API Key')).toBeNull()
    expect(screen.queryByText(/请求地址/)).toBeNull()
    expect(screen.queryByText(/chat\/completions/)).toBeNull()
    expect(screen.queryByText(/请先创建并启用一把 API Key/)).toBeNull()
    expect(screen.queryByText('汇总本周所有对话中的用户诉求。')).toBeNull()
    expect(screen.queryByText('给出一份接口异常排查清单。')).toBeNull()
  })

  it('指定范围 Key 没有匹配文本模型时保留工作区但禁用发送', async () => {
    const user = userEvent.setup()
    vi.mocked(getUserApiKeys).mockResolvedValue({ items: [{ ...activeApiKey(), scope: 'selected', model_ids: ['model-not-visible'], models: [] }], available_models: [] })

    renderConsolePage(<PlaygroundPage />, ['/console/playground?model=deepseek-chat'])

    await selectPlaygroundApiKey(user)
    expect(await screen.findByText('当前 API Key 没有可用的文本模型，请切换 API Key 或调整密钥的模型范围。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
    await user.type(screen.getByLabelText('测试提示词'), '不应发送')
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
    expect(streamChatCompletion).not.toHaveBeenCalled()
  })

  it('模型目录认证失效时清理令牌并跳转首页', async () => {
    vi.mocked(globalThis.fetch).mockImplementation(async () => new Response(JSON.stringify({ code: 110001, msg: '认证信息无效', data: {} }), { status: 401, headers: { 'Content-Type': 'application/json' } }))

    renderConsolePage(<><ConsoleModelsPage /><CurrentPath /></>, ['/console/models'])

    await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/'))
    expect(window.localStorage.getItem('token-nx:refresh-session:v1')).toBeNull()
  })

})
