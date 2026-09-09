import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthTokens, getAccessToken, saveAuthTokens } from '@/auth/token-storage'
import type { AuthResult } from '@/api/auth'
import { AppStoreProvider, useAppStore } from '@/data/app-state'
import { createAppStore } from '@/store'
import { ApiKeysPage, updateSelectedKeyIDs } from './console-account'

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

function mockApiKeyApi(config: {
  expireAccess?: boolean;
  refreshFails?: boolean;
  empty?: boolean;
  limitsDisabled?: boolean;
  noSelectedModels?: boolean;
  withoutSecret?: boolean;
  createdAtAsNumber?: boolean;
  enterpriseItems?: boolean;
  availableModels?: Array<{ id: string; alias: string; name: string; company: string }>;
  subscription?: { hasSubscription: boolean; models: Array<{ id: string; alias: string; name: string; company: string }> };
  subscriptionError?: boolean;
} = {}) {
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
      if (config.refreshFails) return apiResponse(null, 401, 160001, '认证信息无效')
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
    if (accessExpired && url.includes('/api/user/api-keys')) return apiResponse(null, 401, 160001, '认证信息无效')
    if (url.includes('/api/user/api-keys') && method === 'GET' && !url.includes('/activity')) {
      if (url.includes('/subscription-models')) {
        if (config.subscriptionError) return apiResponse(null, 500, 100002, '订阅查询失败')
        return apiResponse(config.subscription
          ? { has_subscription: config.subscription.hasSubscription, models: config.subscription.models }
          : { has_subscription: false, models: [] })
      }
      const accountType = new URL(url, 'https://saas.example.com').searchParams.get('account_type')
      return apiResponse({ items: accountType === 'enterprise' && !config.enterpriseItems ? [] : items, available_models: config.availableModels ?? [{ id: 'gpt-4o', alias: 'gpt-public', name: 'GPT-4o', company: 'OpenAI' }] })
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

function renderPage(observeLocation = false, initialEntry = '/console/api-keys', includeWorkspaceProbe = false, mode: 'mine' | 'enterprise' = 'mine') {
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
            <ApiKeysPage mode={mode} />
          </AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    ),
  }
}

// 中文：企业编辑测试覆盖专用接口与当前成员通用 PUT 的分流，避免误把不可编辑字段静默丢弃。
function mockEnterpriseKeyEditApi(key: typeof KEY_ITEM) {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, requestOptions) => {
    const url = new URL(String(input), 'https://saas.example.com')
    const method = requestOptions?.method ?? 'GET'
    if (url.pathname === '/api/user/models') return apiResponse({ items: [] })
    if (url.pathname === '/api/user/enterprise/enterprise-1/departments') return apiResponse({ items: [], total: 0, page: 1, page_size: 20 })
    if (url.pathname === '/api/user/enterprise/enterprise-1/members') {
      return apiResponse({ items: [{ id: 'member-1', user_id: 'user-1', display_name: '接口用户', masked_contact: '138****5678', status: 'active' }], total: 1, page: 1, page_size: 20 })
    }
    if (url.pathname === '/api/user/enterprise/enterprise-1/api-keys' && method === 'GET') {
      return apiResponse({ items: [key], available_models: [], total: 1, page: 1, page_size: 20 })
    }
    if (url.pathname === `/api/user/api-keys/${key.id}` && method === 'PUT') {
      const body = JSON.parse(String(requestOptions?.body)) as Record<string, unknown>
      return apiResponse({ ...key, name: body.name, tags: body.tags, expires_at: null })
    }
    if (url.pathname === '/api/user/enterprise/enterprise-1/api-keys/batch' && method === 'POST') {
      return apiResponse({ items: [key], updated: 1 })
    }
    throw new Error(`unexpected request: ${method} ${url}`)
  })
  return fetchMock
}

describe('密钥管理页面', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    clearAuthTokens()
    window.localStorage.clear()
    saveAuthTokens(authResult())
  })

  it('分页全选只修改当前页的选择状态', () => {
    expect(updateSelectedKeyIDs(['page-one-key'], ['page-two-key'], true)).toEqual(['page-one-key', 'page-two-key'])
    expect(updateSelectedKeyIDs(['page-one-key', 'page-two-key'], ['page-two-key'], false)).toEqual(['page-one-key'])
  })

  it('加载真实密钥列表并展示参考页核心结构', async () => {
    mockApiKeyApi()
    renderPage()

    expect(await screen.findByRole('heading', { name: '我的密钥' })).toBeInTheDocument()
    expect(screen.queryByText(/安全提示|本地演示模式/)).not.toBeInTheDocument()
    expect(screen.getByText('默认密钥')).toBeInTheDocument()
    expect(screen.getByText('nx_live_••••abcd')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '复制完整 API 密钥' })).toBeInTheDocument()
    expect(document.querySelector('.api-keys-console-page')).toHaveClass('api-keys-console-page--personal')
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      '名称',
      'API 密钥',
      '创建人',
      '状态',
      '创建时间',
      '操作',
    ])
    expect(screen.getByRole('button', { name: /创建 API 密钥/ })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'API Key 状态筛选' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '详情' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '编辑 API 密钥' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '禁用 API 密钥' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除 API 密钥' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /密钥活动/ })).not.toBeInTheDocument()
  })

  it('企业空间保留创建人信息', async () => {
    window.localStorage.setItem('token-nx:user-front:v1', JSON.stringify({
      activeWorkspaceId: 'enterprise-1',
      workspaces: [{ id: 'enterprise-1', name: '示例企业', type: 'enterprise', role: 'owner' }],
    }))
    mockApiKeyApi({ enterpriseItems: true })
    renderPage()

    expect(await screen.findByRole('columnheader', { name: '创建人' })).toBeInTheDocument()
    expect(document.querySelector('.api-keys-console-page')).not.toHaveClass('api-keys-console-page--personal')
    expect(screen.getByText('接口用户')).toBeInTheDocument()
  })

  // 中文：创建接口发起前，必填项应在字段内显示 Semi 错误状态，而非仅显示全局提示。
  it('创建企业密钥时在密钥名称和操作人字段显示必填提示', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('token-nx:user-front:v1', JSON.stringify({
      activeWorkspaceId: 'enterprise-1',
      workspaces: [{ id: 'enterprise-1', name: '示例企业', type: 'enterprise', role: 'owner' }],
    }))
    const { fetchMock } = mockApiKeyApi()
    renderPage(false, '/console/enterprise-api-keys', false, 'enterprise')

    await user.click(await screen.findByRole('button', { name: /创建 API 密钥/ }))
    await waitFor(() => {
      const memberRequests = fetchMock.mock.calls
        .map(([input]) => new URL(String(input), 'https://saas.example.com'))
        .filter((url) => url.pathname === '/api/user/enterprise/enterprise-1/members')
      expect(memberRequests.length).toBeGreaterThanOrEqual(2)
      expect(memberRequests.every((url) => !url.searchParams.has('status'))).toBe(true)
    })
    await user.click(screen.getByRole('button', { name: 'confirm' }))

    expect(await screen.findByText('请输入密钥名称')).toBeInTheDocument()
    expect(screen.getByText('请选择操作人')).toBeInTheDocument()
    expect(document.querySelector('#key-name')?.closest('.semi-input-wrapper')).toHaveClass('semi-input-wrapper-error')
    expect(document.querySelector('#key-member')).toHaveClass('semi-select-error')
  })

  // 中文：密钥管理页的部门筛选在前端按成员目录过滤，人员筛选则使用企业密钥接口参数。
  it('企业密钥管理支持按部门和可搜索人员筛选', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('token-nx:user-front:v1', JSON.stringify({
      activeWorkspaceId: 'enterprise-1',
      workspaces: [{ id: 'enterprise-1', name: '示例企业', type: 'enterprise', role: 'owner' }],
    }))
    const salesKey = { ...structuredClone(KEY_ITEM), creator: { ...KEY_ITEM.creator, id: 'user-sales', display_name: '销售成员' } }
    const engineeringKey = { ...structuredClone(KEY_ITEM), id: 'key-engineering', name: '研发密钥', creator: { ...KEY_ITEM.creator, id: 'user-engineering', display_name: '研发成员' } }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input), 'https://saas.example.com')
      if (url.pathname === '/api/user/enterprise/enterprise-1/departments') {
        return apiResponse({ context: {}, items: [
          { id: 'department-sales', name: '销售部', parent_id: null, depth: 1, child_count: 0, member_count: 1, version: 1, created_at: KEY_ITEM.created_at, updated_at: KEY_ITEM.created_at },
          { id: 'department-engineering', name: '研发部', parent_id: null, depth: 1, child_count: 0, member_count: 1, version: 1, created_at: KEY_ITEM.created_at, updated_at: KEY_ITEM.created_at },
        ], total: 2, page: 1, page_size: 20 })
      }
      if (url.pathname === '/api/user/enterprise/enterprise-1/members') {
        return apiResponse({ context: {}, items: [
          { id: 'member-sales', user_id: 'user-sales', display_name: '销售成员', masked_contact: '138****0001', status: 'active', department: { id: 'department-sales', name: '销售部' } },
          { id: 'member-engineering', user_id: 'user-engineering', display_name: '研发成员', masked_contact: '138****0002', status: 'active', department: { id: 'department-engineering', name: '研发部' } },
        ], total: 2, page: 1, page_size: 20 })
      }
      if (url.pathname === '/api/user/enterprise/enterprise-1/api-keys') {
        const items = url.searchParams.get('member_id') === 'member-sales' ? [salesKey] : [salesKey, engineeringKey]
        return apiResponse({ items, available_models: [] })
      }
      throw new Error(`unexpected request: ${url}`)
    })

    renderPage(false, '/console/enterprise-api-keys', false, 'enterprise')

    expect(await screen.findByRole('combobox', { name: '部门筛选' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '人员筛选' })).toBeInTheDocument()
    await screen.findByText('研发密钥')

    await user.click(screen.getByRole('combobox', { name: '部门筛选' }))
    const departmentOption = (await screen.findByText('销售部')).closest('.semi-select-option')
    expect(departmentOption).not.toBeNull()
    fireEvent.click(departmentOption as HTMLElement)
    await waitFor(() => expect(screen.queryByText('研发密钥')).not.toBeInTheDocument())

    await user.click(screen.getByRole('combobox', { name: '人员筛选' }))
    const search = await screen.findByPlaceholderText('搜索人员昵称或手机号...')
    await user.type(search, '销售')
    fireEvent.click(await screen.findByRole('option', { name: /销售成员/ }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => {
      const url = new URL(String(input), 'https://saas.example.com')
      return url.pathname === '/api/user/enterprise/enterprise-1/api-keys' && url.searchParams.get('member_id') === 'member-sales'
    })).toBe(true))
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

  it('我的密钥不渲染限制和模型列', async () => {
    mockApiKeyApi({ limitsDisabled: true, noSelectedModels: true })
    renderPage()

    const row = (await screen.findByText('默认密钥')).closest('tr') as HTMLElement
    expect(within(row).queryByText('已关闭')).not.toBeInTheDocument()
    expect(within(row).queryByText('未选择')).not.toBeInTheDocument()
  })

  // 中文：模型权限表单使用别名识别模型，并排除没有可用别名的模型。
  it('模型选择项显示别名并兼容旧 code 深链', async () => {
    const user = userEvent.setup()
    mockApiKeyApi()
    renderPage(false, '/console/api-keys?model=gpt-4o')

    await screen.findByText('默认密钥')
    await user.click(screen.getAllByRole('button', { name: /创建 API 密钥/ })[0])

    // 中文：限制开关关闭时高级配置收起，打开后再验证模型多选内容。
    await user.click(screen.getByRole('switch', { name: '启用限制' }))
    fireEvent.click(document.querySelector('#key-models') as HTMLElement)

    expect(screen.getByRole('option', { name: /GPT-4o（OpenAI · gpt-public）/ })).toBeInTheDocument()
    expect(screen.queryByText('内部模型')).toBeNull()
    expect(screen.queryByText('gpt-4o')).toBeNull()
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

    await screen.findByRole('heading', { name: '我的密钥' })
    await user.click(screen.getAllByRole('button', { name: /创建 API 密钥/ })[0])
    await user.click(screen.getByRole('switch', { name: '启用限制' }))
    await user.click(screen.getByRole('radio', { name: '指定模型' }))
    fireEvent.click(document.querySelector('#key-models') as HTMLElement)

    expect(screen.getByRole('option', { name: /企业已启用模型（企业厂商 · enterprise-enabled-public）/ })).toBeInTheDocument()
    expect(screen.queryByText('企业已关闭模型（企业厂商 · enterprise-disabled-public）')).not.toBeInTheDocument()
    expect(screen.queryByText('GPT-4o（OpenAI · gpt-public）')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/user/models'))).toBe(false)
  })

  it('企业成员编辑自己的密钥使用完整 PUT 并发送 RFC3339 字段', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('token-nx:user-front:v1', JSON.stringify({
      activeWorkspaceId: 'enterprise-1',
      workspaces: [{ id: 'enterprise-1', name: '示例企业', type: 'enterprise', role: 'owner' }],
    }))
    const fetchMock = mockEnterpriseKeyEditApi(structuredClone(KEY_ITEM))
    renderPage(false, '/console/enterprise-api-keys', false, 'enterprise')

    await user.click(await screen.findByRole('button', { name: '编辑 API 密钥' }))
    const nameInput = screen.getByLabelText('密钥名称')
    await user.clear(nameInput)
    await user.type(nameInput, '本人更新密钥')
    await user.click(screen.getByRole('button', { name: 'confirm' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => {
      const requestURL = new URL(String(url), 'https://saas.example.com')
      return requestURL.pathname === `/api/user/api-keys/${KEY_ID}` && options?.method === 'PUT'
    })).toBe(true))
    const putCall = fetchMock.mock.calls.find(([url, options]) => {
      const requestURL = new URL(String(url), 'https://saas.example.com')
      return requestURL.pathname === `/api/user/api-keys/${KEY_ID}` && options?.method === 'PUT'
    })
    expect(JSON.parse(String(putCall?.[1]?.body))).toMatchObject({ name: '本人更新密钥', expires_at: null })
  })

  it('企业编辑他人密钥时禁用不支持的字段并使用批量更新接口', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('token-nx:user-front:v1', JSON.stringify({
      activeWorkspaceId: 'enterprise-1',
      workspaces: [{ id: 'enterprise-1', name: '示例企业', type: 'enterprise', role: 'owner' }],
    }))
    const foreignKey = { ...structuredClone(KEY_ITEM), creator: { ...KEY_ITEM.creator, id: 'user-other', display_name: '其他成员' } }
    const fetchMock = mockEnterpriseKeyEditApi(foreignKey)
    renderPage(false, '/console/enterprise-api-keys', false, 'enterprise')

    await user.click(await screen.findByRole('button', { name: '编辑 API 密钥' }))
    expect(screen.getByLabelText('密钥名称')).toBeDisabled()
    expect(screen.getByLabelText('标签')).toBeDisabled()
    // Semi Select 的可访问标签挂在外层 div，使用 id/aria-disabled 断言而非 getByLabelText。
    expect(document.querySelector('#key-expiry')).toHaveAttribute('aria-disabled', 'true')
    await user.click(screen.getByRole('button', { name: 'confirm' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => {
      const requestURL = new URL(String(url), 'https://saas.example.com')
      return requestURL.pathname === '/api/user/enterprise/enterprise-1/api-keys/batch' && options?.method === 'POST'
    })).toBe(true))
    expect(fetchMock.mock.calls.some(([url, options]) => String(url).includes('/api/user/api-keys/') && options?.method === 'PUT')).toBe(false)
  })

  // 中文：订阅计费必须以订阅模型接口返回的集合为准，并在成功后自动全选。
  it('切换订阅计费时加载并全选订阅模型，提交非空模型子集', async () => {
    const user = userEvent.setup()
    const subscriptionModels = [
      { id: 'sub-model-a', alias: 'sub-a', name: '订阅模型 A', company: '订阅厂商' },
      { id: 'sub-model-b', alias: 'sub-b', name: '订阅模型 B', company: '订阅厂商' },
    ]
    const { fetchMock } = mockApiKeyApi({
      subscription: { hasSubscription: true, models: subscriptionModels },
    })
    renderPage(false, '/console/api-keys')

    await screen.findByText('默认密钥')
    await user.click(screen.getByRole('button', { name: /创建 API 密钥/ }))
    await user.type(screen.getByLabelText('密钥名称'), '订阅密钥')
    await user.click(screen.getByRole('switch', { name: '启用限制' }))
    await user.click(screen.getByRole('radio', { name: '按订阅消耗' }))

    expect(await screen.findByText('已选 2 个')).toBeInTheDocument()
    const confirm = screen.getByRole('button', { name: 'confirm' })
    await waitFor(() => expect(confirm).toBeEnabled())
    await user.click(confirm)
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => {
      const requestURL = new URL(String(url), 'https://saas.example.com')
      return requestURL.pathname === '/api/user/api-keys' && options?.method === 'POST'
    })).toBe(true))
    const postCall = fetchMock.mock.calls.find(([url, options]) => {
      const requestURL = new URL(String(url), 'https://saas.example.com')
      return requestURL.pathname === '/api/user/api-keys' && options?.method === 'POST'
    })
    const body = JSON.parse(String(postCall?.[1]?.body)) as { billing_source: string; scope: string; model_ids: string[] }
    expect(body).toMatchObject({ billing_source: 'subscription', scope: 'selected' })
    expect(body.model_ids).toEqual(['sub-model-a', 'sub-model-b'])
  })

  it('无订阅或订阅查询失败时禁止提交 API 密钥', async () => {
    const user = userEvent.setup()
    mockApiKeyApi({ subscription: { hasSubscription: false, models: [] } })
    renderPage(false, '/console/api-keys')

    await screen.findByText('默认密钥')
    await user.click(screen.getByRole('button', { name: /创建 API 密钥/ }))
    await user.type(screen.getByLabelText('密钥名称'), '无订阅密钥')
    await user.click(screen.getByRole('switch', { name: '启用限制' }))
    await user.click(screen.getByRole('radio', { name: '按订阅消耗' }))

    expect(await screen.findByText('当前没有可用的订阅模型')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'confirm' })).toBeDisabled()
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

  it('复制列表密钥时使用完整值，并在创建后显示完整密钥弹窗', async () => {
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
    const createdSecretDialog = screen.getByRole('heading', { name: '创建密钥' }).closest('[role="dialog"]')
    expect(createdSecretDialog).not.toBeNull()
    expect(within(createdSecretDialog as HTMLElement).getByText('nx_live_created_persisted_secret')).toBeInTheDocument()
    await user.click(within(createdSecretDialog as HTMLElement).getByRole('button', { name: '复制' }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('nx_live_created_persisted_secret'))
    await user.click(within(createdSecretDialog as HTMLElement).getByRole('button', { name: '完成' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: '创建密钥' })).not.toBeInTheDocument())
    const createdRow = await waitFor(() => screen.getByText('生产环境密钥').closest('tr') as HTMLElement)
    expect(within(createdRow).queryByRole('link', { name: '详情' })).not.toBeInTheDocument()
    expect(within(createdRow).getByRole('button', { name: '复制完整 API 密钥' })).toBeInTheDocument()

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
