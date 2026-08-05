import '@/i18n'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResult } from '@/api/auth'
import { clearAuthTokens, getAccessToken, saveAuthTokens } from '@/auth/token-storage'
import { NEW_ENTERPRISE_CREATE_PATH } from '@/api/enterprise-certification'
import { limitDisplayNameLength, PROFILE_DISPLAY_NAME_MAX_LENGTH } from '@/api/profile'
import { AppStoreProvider } from '@/data/app-state'
import { createAppStore } from '@/store'
import { SettingsPage } from './console-profile'

const PROFILE = {
  id: '01K0USERPUBLICIDEXAMPLE01',
  display_name: '接口用户',
  avatar_url: '',
  locale: 'zh-CN',
  timezone: 'Asia/Shanghai',
  status: 'active',
  version: 4,
  phone: { bound: true, masked_identifier: '138****5678' },
  email: { bound: false, masked_identifier: '' },
}

const PREFERENCES = {
  items: [
    { code: 'low_balance', enabled: true, default_enabled: true, version: 0 },
    { code: 'invitations', enabled: true, default_enabled: true, version: 0 },
    { code: 'product_updates', enabled: false, default_enabled: false, version: 0 },
  ],
}

const ENTERPRISES = [{
  id: '01K0MEMBERPUBLICIDEXAMPLE1',
  enterprise_id: '01K0ENTERPRISEPUBLICIDEX01',
  enterprise_name: '示例企业',
  enterprise_code: 'ENT-001',
  member_status: 'active',
  join_source: 'owner',
  roles: ['owner'],
  owner: true,
  joined_at: '2026-07-01T08:00:00Z',
  version: 1,
}]

const ENTERPRISE_CONTEXT = {
  id: '01K0ENTERPRISEPUBLICIDEX01',
  name: '示例企业',
  code: 'ENT-001',
  member_id: '01K0MEMBERPUBLICIDEXAMPLE1',
  role: 'owner',
  roles: ['owner'],
  capabilities: {
    can_manage_members: true,
    can_manage_roles: true,
    can_manage_tags: true,
    can_manage_models: true,
    can_manage_usage: true,
    can_view_models: true,
    can_view_usage: true,
    can_view_audit: true,
    can_view_analytics: true,
  },
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
    access_token: 'profile-token',
    refresh_token: 'refresh-token',
    refresh_expires_at: Date.UTC(2099, 0, 1),
    user: {
      id: PROFILE.id,
      display_name: PROFILE.display_name,
      avatar_url: '',
      locale: PROFILE.locale,
      timezone: PROFILE.timezone,
      status: PROFILE.status,
    },
  }
}

function mockProfileApi(config: { expireAccess?: boolean; refreshFails?: boolean } = {}) {
  let profile = structuredClone(PROFILE)
  let preferences = structuredClone(PREFERENCES)
  let accessExpired = config.expireAccess ?? false
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, requestOptions) => {
    const url = String(input)
    const method = requestOptions?.method ?? 'GET'
    if (url.endsWith('/api/auth/refresh')) {
      if (config.refreshFails) return apiResponse(null, 401, 110001, '认证信息无效')
      accessExpired = false
      return apiResponse({ ...authResult(), access_token: 'refreshed-profile-token', refresh_token: 'rotated-profile-refresh' })
    }
    if (accessExpired && url.includes('/api/user/profile')) return apiResponse(null, 401, 110001, '认证信息无效')
    if (url.endsWith('/api/user/profile') && method === 'GET') return apiResponse(profile)
    if (url.endsWith('/api/user/profile/enterprises')) return apiResponse(ENTERPRISES)
    if (url.endsWith('/api/user/enterprise/01K0ENTERPRISEPUBLICIDEX01/context')) return apiResponse(ENTERPRISE_CONTEXT)
    if (url.endsWith('/api/user/profile/notification-preferences') && method === 'GET') return apiResponse(preferences)
    if (url.endsWith('/api/user/profile/nickname')) {
      const body = JSON.parse(String(requestOptions?.body)) as { display_name: string }
      profile = { ...profile, display_name: body.display_name, version: profile.version + 1 }
      return apiResponse(profile)
    }
    if (url.endsWith('/api/user/profile/contact/code')) return apiResponse({ destination_masked: '139****5678', expires_at: '2099-01-01T00:05:00Z', retry_after_seconds: 60 })
    if (url.endsWith('/api/user/profile/phone')) {
      profile = { ...profile, phone: { bound: true, masked_identifier: '139****5678' }, version: profile.version + 1 }
      return apiResponse(profile)
    }
    if (url.endsWith('/api/user/profile/email')) {
      profile = { ...profile, email: { bound: true, masked_identifier: 'n***@example.com' }, version: profile.version + 1 }
      return apiResponse(profile)
    }
    if (url.endsWith('/api/user/profile/notification-preferences')) {
      const body = JSON.parse(String(requestOptions?.body)) as { values: Record<string, boolean> }
      preferences = { items: preferences.items.map((item) => ({ ...item, enabled: body.values[item.code] ?? item.enabled, version: body.values[item.code] === undefined ? item.version : item.version + 1 })) }
      return apiResponse(preferences)
    }
    throw new Error(`unexpected request: ${url}`)
  })
  return { fetchMock }
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}

function renderPage(observeLocation = false, enterprise = false) {
  if (enterprise) {
    window.localStorage.setItem('token-nx:user-front:v1', JSON.stringify({
      activeWorkspaceId: ENTERPRISE_CONTEXT.id,
      workspaces: [
        { id: 'personal', name: '个人空间', type: 'personal', role: 'owner' },
        { id: ENTERPRISE_CONTEXT.id, name: ENTERPRISE_CONTEXT.name, type: 'enterprise', role: 'owner' },
      ],
    }))
  }
  const appStore = createAppStore()
  appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: authResult().user })
  return { appStore, ...render(<MemoryRouter initialEntries={['/console/settings']}><Provider store={appStore}><AppStoreProvider>{observeLocation ? <LocationProbe /> : null}<SettingsPage /></AppStoreProvider></Provider></MemoryRouter>) }
}

describe('个人中心页面', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    clearAuthTokens()
    window.localStorage.clear()
    saveAuthTokens(authResult())
  })

  it('按参考设置页结构加载真实资料、企业关系和通知偏好', async () => {
    const { fetchMock } = mockProfileApi()
    const { appStore } = renderPage()

    expect(await screen.findByRole('heading', { name: '个人中心' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '个人资料' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '通知偏好' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '工作空间' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '账号安全' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('接口用户')).toBeInTheDocument()
    expect(screen.getByText('01K0USERPUBLICIDEXAMPLE01')).toBeInTheDocument()
    expect(screen.getByText('138****5678')).toBeInTheDocument()
    expect(screen.getByText('接口用户 的个人空间')).toBeInTheDocument()
    expect(screen.getByText('示例企业')).toBeInTheDocument()
    expect(document.querySelector('.settings-console-page .profile-overview-section')).toBeNull()
    expect(document.querySelectorAll('.settings-section')).toHaveLength(4)
    expect(screen.getAllByRole('switch')).toHaveLength(3)
    expect(appStore.getState().auth.user?.phone_masked).toBe('138****5678')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('资料接口返回认证失败时刷新令牌并继续加载个人中心', async () => {
    const { fetchMock } = mockProfileApi({ expireAccess: true })
    renderPage()

    expect(await screen.findByDisplayValue('接口用户')).toBeInTheDocument()
    expect(getAccessToken()).toBe('refreshed-profile-token')
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/auth/refresh'))).toBe(true)
  })

  it('资料接口和刷新令牌都认证失败时清理会话并返回首页', async () => {
    mockProfileApi({ expireAccess: true, refreshFails: true })
    const { appStore } = renderPage(true)

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/))
    expect(getAccessToken()).toBeNull()
    expect(window.localStorage.getItem('token-nx:auth:refresh:v1')).toBeNull()
    expect(appStore.getState().auth).toMatchObject({ status: 'unauthenticated', user: null, error: null })
  })

  it('保存昵称时提交当前版本接口并刷新认证用户状态', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockProfileApi()
    const { appStore } = renderPage()
    const input = await screen.findByLabelText('昵称')

    await user.clear(input)
    await user.type(input, '更新后的昵称')
    await user.click(screen.getByRole('button', { name: '保存更改' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => String(url).endsWith('/api/user/profile/nickname') && JSON.parse(String(options?.body)).display_name === '更新后的昵称')).toBe(true))
    expect(appStore.getState().auth.user?.display_name).toBe('更新后的昵称')
  })

  it('输入昵称时按 Unicode 字符上限截断，并只提交受限后的值', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockProfileApi()
    renderPage()

    const input = await screen.findByLabelText('昵称')
    const longName = '名'.repeat(PROFILE_DISPLAY_NAME_MAX_LENGTH + 1)
    await user.clear(input)
    await user.type(input, longName)

    expect(input).toHaveAttribute('maxlength', String(PROFILE_DISPLAY_NAME_MAX_LENGTH))
    expect(input).toHaveValue(limitDisplayNameLength(longName))
    await user.click(screen.getByRole('button', { name: '保存更改' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => String(url).endsWith('/api/user/profile/nickname') && JSON.parse(String(options?.body)).display_name === limitDisplayNameLength(longName))).toBe(true))
  })

  it('通知开关按部分更新契约提交，并在服务端返回后更新状态', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockProfileApi()
    renderPage()

    const switches = await screen.findAllByRole('switch')
    await user.click(switches[0])

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => String(url).endsWith('/api/user/profile/notification-preferences') && options?.method === 'PUT')).toBe(true))
    const preferenceRequest = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith('/api/user/profile/notification-preferences') && options?.method === 'PUT')
    expect(JSON.parse(String(preferenceRequest?.[1]?.body))).toEqual({ values: { low_balance: false } })
  })

  it('更换手机号需要当前值和新值分别验证，并提交双验证码', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockProfileApi()
    renderPage()

    await user.click(await screen.findByRole('button', { name: '更换手机号' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('当前联系方式')
    const currentDestination = document.querySelector<HTMLInputElement>('#profile-phone-current-destination')
    const newDestination = document.querySelector<HTMLInputElement>('#profile-phone-new-destination')
    if (!currentDestination || !newDestination) throw new Error('联系方式输入框未渲染')
    await user.type(currentDestination, '13812345678')
    await user.type(newDestination, '13912345678')
    await user.click(screen.getByRole('button', { name: '发送当前验证码' }))
    await user.click(screen.getByRole('button', { name: '发送新验证码' }))
    const currentCode = document.querySelector<HTMLInputElement>('#profile-phone-currentCode')
    const newCode = document.querySelector<HTMLInputElement>('#profile-phone-newCode')
    if (!currentCode || !newCode) throw new Error('验证码输入框未渲染')
    await user.type(currentCode, '123456')
    await user.type(newCode, '654321')
    await user.click(screen.getByRole('button', { name: '保存联系方式' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => String(url).endsWith('/api/user/profile/phone') && options?.method === 'PUT')).toBe(true))
    const codeRequests = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/user/profile/contact/code'))
    expect(codeRequests).toHaveLength(2)
    expect(JSON.parse(String(codeRequests[0][1]?.body))).toMatchObject({ provider_code: 'phone', purpose: 'current', destination: '13812345678' })
    expect(JSON.parse(String(codeRequests[1][1]?.body))).toMatchObject({ provider_code: 'phone', purpose: 'new', destination: '13912345678' })
    const updateRequest = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith('/api/user/profile/phone') && options?.method === 'PUT')
    expect(JSON.parse(String(updateRequest?.[1]?.body))).toEqual({ current_destination: '13812345678', current_code: '123456', new_destination: '13912345678', new_code: '654321' })
    expect(await screen.findByText('139****5678')).toBeInTheDocument()
  })

  it('复制用户 ID 并保留参考页的工作空间与安全入口', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    const originalClipboard = navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    mockProfileApi()
    renderPage()

    await screen.findByRole('heading', { name: '工作空间' })
    await user.click(screen.getByRole('button', { name: '复制' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(PROFILE.id))

    await user.click(screen.getByRole('button', { name: '进入注销流程' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('确认注销账号')
    expect(screen.getByRole('dialog')).toHaveTextContent('不会立即删除当前账号或数据')
    await user.click(screen.getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveClass('semi-modal-content-animate-hide'))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard })
  })

  it('创建企业空间入口跳转到企业创建页', async () => {
    const user = userEvent.setup()
    mockProfileApi()
    renderPage(true)

    await user.click(await screen.findByRole('button', { name: '创建企业空间' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(NEW_ENTERPRISE_CREATE_PATH))
  })

  it('企业空间同时展示企业账号和当前成员的个人资料', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockProfileApi()
    renderPage(false, true)

    expect(await screen.findByRole('heading', { name: '企业账号' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '个人资料' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '企业账号信息' })).toBeInTheDocument()
    expect(screen.getAllByText('示例企业')).toHaveLength(2)
    expect(screen.getByText('ENT-001')).toBeInTheDocument()
    expect(screen.getByText('01K0MEMBERPUBLICIDEXAMPLE1')).toBeInTheDocument()
    expect(screen.getAllByText('所有者')).toHaveLength(1)
    expect(screen.getByLabelText('昵称')).toHaveValue(PROFILE.display_name)
    expect(screen.getByText(PROFILE.id)).toBeInTheDocument()
    expect(screen.getByText('138****5678')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '通知偏好' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '账号安全' })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/user/enterprise/01K0ENTERPRISEPUBLICIDEX01/context'))).toBe(true)

    await user.clear(screen.getByLabelText('昵称'))
    await user.type(screen.getByLabelText('昵称'), '企业空间中的新昵称')
    await user.click(screen.getByRole('button', { name: '保存更改' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => String(url).endsWith('/api/user/profile/nickname') && JSON.parse(String(options?.body)).display_name === '企业空间中的新昵称')).toBe(true))
  })
})
