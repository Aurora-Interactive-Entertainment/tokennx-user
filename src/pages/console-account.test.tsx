import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthTokens, getAccessToken, saveAuthTokens } from '@/auth/token-storage'
import type { AuthResult } from '@/api/auth'
import { AppStoreProvider, useAppStore } from '@/data/app-state'
import { createAppStore } from '@/store'
import { ApiKeysPage, RecordsPage } from './console-account'

const KEY_ID = 'key_demo_default'

const KEY_ITEM = {
  id: KEY_ID,
  name: '默认密钥',
  masked_key: 'nx_live_••••abcd',
  secret: 'nx_live_persisted_full_secret',
  status: 'active',
  scope: 'all',
  model_ids: [] as string[],
  models: [] as Array<{ id: string; alias: string; name: string; company: string }>,
  tags: ['演示'],
  billing_source: 'balance',
  limits: {
    enabled: true,
    cost_limit_yuan: '100.000000000',
    used_amount_yuan: '12.500000000',
    rpm: 60,
    tpm: null,
    concurrency: 2,
  },
  creator: {
    id: 'user-1',
    display_name: '接口用户',
    masked_phone: '138****5678',
  },
  created_at: '2026-07-20T08:00:00Z',
  expires_at: null,
  last_used_at: null,
}

function apiResponse(data: unknown, status = 200, code = 0, msg = 'success'): Response {
  return new Response(JSON.stringify({ code, msg, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function authResult(): AuthResult {
  return {
    status: 'succeeded',
    binding_required: false,
    access_token: 'api-key-token',
    refresh_token: 'refresh-token',
    refresh_expires_at: Date.UTC(2099, 0, 1),
    user: {
      id: 'user-1',
      display_name: '接口用户',
      avatar_url: '',
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      status: 'active',
    },
  }
}

function mockApiKeyApi(config: { expireAccess?: boolean; refreshFails?: boolean; empty?: boolean; limitsDisabled?: boolean; noSelectedModels?: boolean; withoutSecret?: boolean; createdAtAsNumber?: boolean; availableModels?: Array<{ id: string; alias: string; name: string; company: string }> } = {}) {
  const keyItem = structuredClone(KEY_ITEM)
  if (config.limitsDisabled) keyItem.limits.enabled = false
  if (config.withoutSecret) keyItem.secret = ''
  if (config.noSelectedModels) {
    keyItem.scope = 'selected'
    keyItem.model_ids = []
    keyItem.models = []
  }
  let items = config.empty ? [] : [keyItem]
  let accessExpired = config.expireAccess ?? false
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, requestOptions) => {
    const url = String(input)
    const method = requestOptions?.method ?? 'GET'
    if (url.endsWith('/api/auth/refresh')) {
      if (config.refreshFails) return apiResponse(null, 401, 110001, '认证信息无效')
      accessExpired = false
      return apiResponse({ ...authResult(), access_token: 'refreshed-api-key-token', refresh_token: 'rotated-refresh' })
    }
    if (url.includes('/api/user/models')) {
      return apiResponse({ items: [{
        id: 'gpt-4o', alias: 'gpt-public', name: 'GPT-4o', company: 'OpenAI', modality: 'text', billing_mode: 'token', context_window_tokens: 128000,
        description: '测试模型', capabilities: ['chat'], provider_count: 1,
        prices: [{ meter_code: 'input', meter_kind: 'input_token', unit: 'token', currency: 'CNY', unit_quantity: 1000000, unit_price_yuan: '2.5', tier_no: 0 }],
      }, {
        id: 'internal-model', name: '内部模型', company: '平台', modality: 'text', billing_mode: 'token', context_window_tokens: 128000,
        description: '没有别名的内部模型', capabilities: ['chat'], provider_count: 1, prices: [],
      }, {
        id: 'enterprise-disabled-model', alias: 'enterprise-disabled-public', name: '企业已关闭模型', company: '企业厂商', modality: 'text', billing_mode: 'token', context_window_tokens: 128000,
        description: '企业空间已关闭的模型', capabilities: ['chat'], provider_count: 1, prices: [],
      }] })
    }
    if (accessExpired && url.includes('/api/user/api-keys')) return apiResponse(null, 401, 110001, '认证信息无效')
    if (url.includes('/api/user/api-keys') && method === 'GET' && !url.includes('/activity')) {
      const accountType = new URL(url, 'https://saas.example.com').searchParams.get('account_type')
      return apiResponse({ items: accountType === 'enterprise' ? [] : items, available_models: config.availableModels ?? [{ id: 'gpt-4o', alias: 'gpt-public', name: 'GPT-4o', company: 'OpenAI' }] })
    }
    if (url.includes('/api/user/api-keys') && method === 'POST' && !url.includes('/enable') && !url.includes('/disable')) {
      const body = JSON.parse(String(requestOptions?.body)) as { name: string }
      const item = { ...structuredClone(KEY_ITEM), id: 'key-created', name: body.name, masked_key: 'nx_live_••••wxyz', secret: 'nx_live_created_persisted_secret', created_at: config.createdAtAsNumber ? Date.parse(KEY_ITEM.created_at) : KEY_ITEM.created_at } as unknown as typeof keyItem
      items = [item, ...items]
      return apiResponse({ item, secret: 'nx_live_created_persisted_secret' })
    }
    if (url.includes('/enable') && method === 'POST') {
      items = items.map((item) => item.id === KEY_ID ? { ...item, status: 'active' } : item)
      return apiResponse(items.find((item) => item.id === KEY_ID))
    }
    if (url.includes('/disable') && method === 'POST') {
      items = items.map((item) => item.id === KEY_ID ? { ...item, status: 'disabled' } : item)
      return apiResponse(items.find((item) => item.id === KEY_ID))
    }
    if (url.includes('/api/user/api-keys/') && method === 'DELETE') {
      items = items.filter((item) => item.id !== KEY_ID)
      return apiResponse({})
    }
    throw new Error(`unexpected request: ${url}`)
  })
  return { fetchMock }
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

function WorkspaceSwitchProbe() {
  const store = useAppStore()
  return <button type="button" onClick={() => store.switchWorkspace('enterprise-1')}>切换到企业空间</button>
}

function renderPage(observeLocation = false, initialEntry = '/console/api-keys', includeWorkspaceProbe = false) {
  const appStore = createAppStore()
  appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: authResult().user })
  return {
    appStore,
    ...render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Provider store={appStore}>
          <AppStoreProvider>
            {observeLocation ? <LocationProbe /> : null}
            {includeWorkspaceProbe ? <WorkspaceSwitchProbe /> : null}
            <ApiKeysPage />
          </AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    ),
  }
}

describe('密钥管理页面', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    clearAuthTokens()
    window.localStorage.clear()
    saveAuthTokens(authResult())
  })

  it('加载真实密钥列表并展示参考页核心结构', async () => {
    mockApiKeyApi()
    renderPage()

    expect(await screen.findByRole('heading', { name: '密钥管理' })).toBeInTheDocument()
    expect(screen.queryByText(/安全提示|本地演示模式/)).not.toBeInTheDocument()
    expect(screen.getByText('默认密钥')).toBeInTheDocument()
    expect(screen.getByText('¥12.500')).toBeInTheDocument()
    expect(screen.getAllByTitle('¥100.000000000').every((element) => element.textContent === '¥100.000')).toBe(true)
    expect(screen.getAllByTitle('¥12.500000000').length).toBeGreaterThan(0)
    expect(screen.getAllByTitle('¥100.000000000').length).toBeGreaterThan(0)
    expect(screen.getByText('nx_live_••••abcd')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '复制完整 API 密钥' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /创建 API 密钥/ })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'API Key 状态筛选' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '详情' })).toHaveAttribute('href', '/console/records?keyId=key_demo_default')
    expect(screen.getByRole('button', { name: '编辑 API 密钥' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '禁用 API 密钥' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除 API 密钥' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /密钥活动/ })).not.toBeInTheDocument()
  })

  it('切换空间后清理旧密钥并按企业账务主体重新加载', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockApiKeyApi()
    window.localStorage.setItem('token-nx:user-front:v1', JSON.stringify({
      activeWorkspaceId: 'personal',
      workspaces: [
        { id: 'personal', name: '个人空间', type: 'personal', role: 'owner' },
        { id: 'enterprise-1', name: '示例企业', type: 'enterprise', role: 'owner' },
      ],
    }))
    renderPage(false, '/console/api-keys', true)

    expect(await screen.findByText('默认密钥')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '切换到企业空间' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => {
      const requestURL = new URL(String(url), 'https://saas.example.com')
      return requestURL.pathname === '/api/user/api-keys' && requestURL.searchParams.get('account_type') === 'enterprise' && requestURL.searchParams.get('enterprise_id') === 'enterprise-1'
    })).toBe(true))
    expect(screen.queryByText('默认密钥')).not.toBeInTheDocument()
  })

  it('认证失败且刷新失败时清理会话并跳转首页', async () => {
    mockApiKeyApi({ expireAccess: true, refreshFails: true })
    const { appStore } = renderPage(true)

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/))
    expect(getAccessToken()).toBeNull()
    expect(appStore.getState().auth).toMatchObject({ status: 'unauthenticated', user: null })
  })

  it('按参考页展示关闭限制和未选择模型状态', async () => {
    mockApiKeyApi({ limitsDisabled: true, noSelectedModels: true })
    renderPage()

    const row = (await screen.findByText('默认密钥')).closest('tr') as HTMLElement
    expect(within(row).getByText('已关闭')).toBeInTheDocument()
    expect(within(row).getByText('未选择')).toBeInTheDocument()
  })

  // 中文：模型权限表单使用别名识别模型，并排除没有可用别名的模型。
  it('模型选择项显示别名并兼容旧 code 深链', async () => {
    const user = userEvent.setup()
    mockApiKeyApi()
    renderPage(false, '/console/api-keys?model=gpt-4o')

    await screen.findByText('默认密钥')
    await user.click(screen.getAllByRole('button', { name: /创建 API 密钥/ })[0])

    expect(screen.getByText('GPT-4o（OpenAI · gpt-public）')).toBeInTheDocument()
    expect(screen.queryByText('内部模型')).toBeNull()
    expect(screen.queryByText('gpt-4o')).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'GPT-4o（OpenAI · gpt-public）' })).toBeChecked()
  })

  // 中文：企业空间模型选择必须以服务端按企业权限过滤后的 API Key 模型列表为准。
  it('企业空间只显示企业已启用的模型', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockApiKeyApi({
      availableModels: [{ id: 'enterprise-enabled-model', alias: 'enterprise-enabled-public', name: '企业已启用模型', company: '企业厂商' }],
    })
    window.localStorage.setItem('token-nx:user-front:v1', JSON.stringify({
      activeWorkspaceId: 'enterprise-1',
      workspaces: [
        { id: 'personal', name: '个人空间', type: 'personal', role: 'owner' },
        { id: 'enterprise-1', name: '示例企业', type: 'enterprise', role: 'owner' },
      ],
    }))
    renderPage()

    await screen.findByRole('heading', { name: '密钥管理' })
    await user.click(screen.getAllByRole('button', { name: /创建 API 密钥/ })[0])
    await user.click(screen.getByRole('radio', { name: '指定模型' }))

    expect(screen.getByRole('checkbox', { name: '企业已启用模型（企业厂商 · enterprise-enabled-public）' })).toBeInTheDocument()
    expect(screen.queryByText('企业已关闭模型（企业厂商 · enterprise-disabled-public）')).not.toBeInTheDocument()
    expect(screen.queryByText('GPT-4o（OpenAI · gpt-public）')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/user/models'))).toBe(false)
  })

  it('历史密钥没有完整值时不回退复制脱敏文本', async () => {
    mockApiKeyApi({ withoutSecret: true })
    renderPage()

    const row = (await screen.findByText('默认密钥')).closest('tr') as HTMLElement
    const copyButton = within(row).getByRole('button', { name: '完整 API 密钥不可用，请重新创建' })
    expect(copyButton).toBeDisabled()
    expect(within(row).getByText('nx_live_••••abcd')).toBeInTheDocument()
  })

  it('创建接口返回数字时间字段时仍能正常展示新密钥', async () => {
    const user = userEvent.setup()
    mockApiKeyApi({ createdAtAsNumber: true })
    renderPage()

    await screen.findByText('默认密钥')
    await user.click(screen.getByRole('button', { name: /创建 API 密钥/ }))
    await user.type(screen.getByLabelText('密钥名称'), '数字时间密钥')
    await user.click(screen.getByRole('button', { name: 'confirm' }))

    const createdRow = await waitFor(() => screen.getByText('数字时间密钥').closest('tr') as HTMLElement)
    expect(within(createdRow).getByText(/2026-07-20/)).toBeInTheDocument()
  })

  it('复制列表密钥时使用完整值，并在创建后直接回到列表', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockApiKeyApi()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    renderPage()

    const defaultRow = (await screen.findByText('默认密钥')).closest('tr') as HTMLElement
    await user.click(within(defaultRow).getByRole('button', { name: '复制完整 API 密钥' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(KEY_ITEM.secret))

    await user.click(screen.getByRole('button', { name: /创建 API 密钥/ }))
    await user.type(screen.getByLabelText('密钥名称'), '生产环境密钥')
    await user.click(screen.getByRole('button', { name: 'confirm' }))

    expect(fetchMock.mock.calls.some(([url, options]) => {
      const requestURL = new URL(String(url), 'https://saas.example.com')
      return requestURL.pathname === '/api/user/api-keys' && requestURL.searchParams.get('account_type') === 'personal' && options?.method === 'POST'
    })).toBe(true)
    const createdRow = await waitFor(() => screen.getByText('生产环境密钥').closest('tr') as HTMLElement)
    expect(screen.queryByText(/一次性密钥|只展示这一次/)).not.toBeInTheDocument()
    expect(within(createdRow).getByRole('button', { name: '复制完整 API 密钥' })).toBeInTheDocument()
    expect(within(defaultRow).getByRole('link', { name: '详情' })).toHaveAttribute('href', '/console/records?keyId=key_demo_default')

    await user.click(within(defaultRow).getByRole('button', { name: '禁用 API 密钥' }))
    const disableDialog = screen.getByRole('heading', { name: '禁用 API 密钥' }).closest('[role="dialog"]')
    expect(disableDialog).not.toBeNull()
    await user.click(within(disableDialog as HTMLElement).getByRole('button', { name: 'confirm' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/disable'))).toBe(true))
    await waitFor(() => expect(within(defaultRow).getByRole('button', { name: '启用 API 密钥' })).toBeInTheDocument())
    await waitFor(() => expect(screen.queryByRole('heading', { name: '禁用 API 密钥' })).not.toBeInTheDocument())

    await user.click(within(defaultRow).getByRole('button', { name: '删除 API 密钥' }))
    const deleteDialog = screen.getByRole('heading', { name: '删除 API 密钥' }).closest('[role="dialog"]')
    expect(deleteDialog).not.toBeNull()
    const deleteConfirmButton = within(deleteDialog as HTMLElement).getByRole('button', { name: 'confirm' })
    await waitFor(() => expect(deleteConfirmButton).toBeEnabled())
    await user.click(deleteConfirmButton)
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => String(url).includes(`/api/user/api-keys/${KEY_ID}`) && options?.method === 'DELETE')).toBe(true))
  })
})

describe('调用记录页面', () => {
  it('通过真实 API 加载记录并按 API 密钥深链筛选', async () => {
    clearAuthTokens()
    saveAuthTokens(authResult())
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse({
      account: { id: 'account-personal', type: 'personal', name: '个人空间' },
      can_filter_members: false,
      can_view_billing: true,
      filters: {
        api_keys: [{ id: KEY_ID, name: '默认密钥', source: 'api' }],
        models: [{ code: 'deepseek-chat', alias: 'deepseek-public', name: 'DeepSeek V3', vendor: 'DeepSeek' }],
        members: [],
      },
      items: [{
        id: 'event-1', request_id: 'req_demo_0010', event_type: 'request.completed', occurred_at: '2026-07-14T10:20:41Z',
        model_code: 'deepseek-chat', model_alias: 'deepseek-public', model_name: 'DeepSeek V3', status: 'success', source: 'api', api_key_id: KEY_ID, api_key_name: '默认密钥',
        member_id: 'user-1', member_name: '接口用户', input_tokens: 1250, output_tokens: 480, cached_tokens: 100, cache_hit_rate: 8, latency_ms: 1330,
        cost_yuan: '0.221000000', error_code: '', error_message: '', status_code: 200, channel: 'OpenAI', task_id: '', task_status: '', task_reason: '',
      }],
      page: 1, page_size: 20, total: 1,
    }))
    render(
      <MemoryRouter initialEntries={[`/console/records?keyId=${KEY_ID}`]}>
        <Provider store={createAppStore()}>
          <AppStoreProvider><RecordsPage /></AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '调用记录' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'API 密钥' })).toHaveValue(KEY_ID)
    expect(screen.getByText('req_demo_0010')).toBeInTheDocument()
    expect(screen.queryByText('req_demo_0009')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/user/usage/records'))).toBe(true)
  })
})
