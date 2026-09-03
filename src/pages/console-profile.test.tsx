import '@/i18n'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResult } from '@/api/auth'
import { clearAuthTokens, getAccessToken, getVerifiedPhone, saveAuthTokens, saveVerifiedPhone } from '@/auth/token-storage'
import { NEW_ENTERPRISE_CREATE_PATH } from '@/api/enterprise-certification'
import { limitDisplayNameLength, PROFILE_DISPLAY_NAME_MAX_LENGTH } from '@/api/profile'
import { AppStoreProvider } from '@/data/app-state'
import { createAppStore } from '@/store'
import { PublicHeader } from '@/components/common'
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

function mockProfileApi(config: { expireAccess?: boolean; refreshFails?: boolean; nicknameFailures?: number; phoneFailures?: number; emailFailures?: number; emailBound?: boolean; ownerEnterprises?: string[]; deletionPrecheck404?: boolean } = {}) {
  let profile = structuredClone(PROFILE)
  if (config.emailBound) profile = { ...profile, email: { bound: true, masked_identifier: 'o***@example.com' } }
  let preferences = structuredClone(PREFERENCES)
  let accessExpired = config.expireAccess ?? false
  let nicknameFailures = config.nicknameFailures ?? 0
  let phoneFailures = config.phoneFailures ?? 0
  let emailFailures = config.emailFailures ?? 0
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
    if (url.endsWith('/api/user/account-deletion/precheck')) {
      if (config.deletionPrecheck404) return apiResponse(null, 404, 0, 'Not Found')
      return apiResponse({ can_request: true, owner_enterprises: config.ownerEnterprises ?? [], member_count: ENTERPRISES.length, balance_policy: 'paid_balance_non_refundable' })
    }
    if (url.endsWith('/api/user/enterprise/01K0ENTERPRISEPUBLICIDEX01/context')) return apiResponse(ENTERPRISE_CONTEXT)
    if (url.endsWith('/api/user/profile/notification-preferences') && method === 'GET') return apiResponse(preferences)
    if (url.endsWith('/api/user/profile/nickname') && method === 'PUT') {
      if (nicknameFailures > 0) {
        nicknameFailures -= 1
        return apiResponse(null, 409, 100006, '资料版本冲突')
      }
      const body = JSON.parse(String(requestOptions?.body)) as { display_name: string }
      profile = { ...profile, display_name: body.display_name, version: profile.version + 1 }
      return apiResponse(profile)
    }
    if (url.endsWith('/api/user/profile/contact/code')) return apiResponse([])
    if (url.endsWith('/api/user/profile/phone')) {
      if (phoneFailures > 0) {
        phoneFailures -= 1
        return apiResponse(null, 503, 100007, '联系方式服务不可用')
      }
      profile = { ...profile, phone: { bound: true, masked_identifier: '139****5678' }, version: profile.version + 1 }
      return apiResponse(profile)
    }
    if (url.endsWith('/api/user/profile/email')) {
      if (emailFailures > 0) {
        emailFailures -= 1
        return apiResponse(null, 409, 110003, '该邮箱已被其他账号绑定')
      }
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

async function openAccountSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '管理' }))
  const dialog = await screen.findByRole('dialog', { name: '个人设置' })
  await waitFor(() => expect(within(dialog).getByRole('button', { name: '昵称' })).toBeEnabled())
  return dialog
}

async function openNicknameEditor(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await openAccountSettings(user)
  await user.click(within(dialog).getByRole('button', { name: '昵称' }))
  return within(dialog).getByRole('textbox', { name: '昵称' })
}

async function getContactInput(id: string) {
  await waitFor(() => expect(document.querySelector(`#${id}`)).not.toBeNull())
  return document.querySelector<HTMLInputElement>(`#${id}`)!
}

describe('个人设置页面', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    clearAuthTokens()
    window.localStorage.clear()
    window.sessionStorage.clear()
    saveAuthTokens(authResult())
    saveVerifiedPhone(PROFILE.id, '13812345678')
  })

  it('按参考设置页结构加载真实资料、企业关系和通知偏好', async () => {
    const { fetchMock } = mockProfileApi()
    const { appStore } = renderPage()

    expect(await screen.findByRole('heading', { name: '个人设置' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '账户' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '个人资料' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '通知偏好' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '工作空间' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '账号安全' })).toBeInTheDocument()
    expect(screen.getByText('管理登录凭据、安全设置，或删除你的账户。')).toBeInTheDocument()
    expect(screen.getByText('接口用户 的个人空间')).toBeInTheDocument()
    expect(screen.getByText('示例企业')).toBeInTheDocument()
    expect(document.querySelector('.settings-console-page .profile-overview-section')).toBeNull()
    expect(document.querySelectorAll('.settings-section')).toHaveLength(4)
    expect(screen.getByRole('navigation', { name: '个人设置导航' })).toHaveTextContent('账户通知偏好工作空间账号安全')
    expect(document.querySelector('#settings-account > .settings-section-head + .settings-card')).not.toBeNull()
    expect(screen.getAllByRole('switch')).toHaveLength(3)
    expect(appStore.getState().auth.user?.phone_masked).toBe('138****5678')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('资料接口返回认证失败时刷新令牌并继续加载个人中心', async () => {
    const { fetchMock } = mockProfileApi({ expireAccess: true })
    renderPage()

    expect(await screen.findByRole('heading', { name: '账户' })).toBeInTheDocument()
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

  it('按 Enter 确认昵称时提交当前版本接口并刷新认证用户状态', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockProfileApi()
    const { appStore } = renderPage()
    const input = await openNicknameEditor(user)

    await user.clear(input)
    await user.type(input, '  更新后的昵称  ')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => {
      const headers = new Headers(options?.headers)
      return String(url).endsWith('/api/user/profile/nickname')
        && options?.method === 'PUT'
        && headers.get('Authorization') === 'Bearer profile-token'
        && JSON.parse(String(options?.body)).display_name === '更新后的昵称'
    })).toBe(true))
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/user/profile/nickname'))).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: '个人设置' })).toHaveTextContent('更新后的昵称')
    expect(appStore.getState().auth.user?.display_name).toBe('更新后的昵称')
    expect(screen.queryByRole('button', { name: '保存更改' })).not.toBeInTheDocument()
  })

  it('昵称输入框失焦时按 Unicode 字符上限提交受限后的值', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockProfileApi()
    renderPage()

    const input = await openNicknameEditor(user)
    const longName = '名'.repeat(PROFILE_DISPLAY_NAME_MAX_LENGTH + 1)
    await user.clear(input)
    await user.type(input, longName)

    expect(input).toHaveAttribute('maxlength', String(PROFILE_DISPLAY_NAME_MAX_LENGTH))
    expect(input).toHaveValue(limitDisplayNameLength(longName))
    await user.tab()

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => String(url).endsWith('/api/user/profile/nickname') && JSON.parse(String(options?.body)).display_name === limitDisplayNameLength(longName))).toBe(true))
  })

  it('昵称未变化时按 Enter 或失焦都不发送更新请求', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockProfileApi()
    renderPage()

    const input = await openNicknameEditor(user)
    await user.click(input)
    await user.keyboard('{Enter}')
    await user.tab()

    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/user/profile/nickname'))).toHaveLength(0)
  })

  it('昵称更新失败时保留输入内容并允许再次确认重试', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockProfileApi({ nicknameFailures: 1 })
    const { appStore } = renderPage()
    const input = await openNicknameEditor(user)

    await user.clear(input)
    await user.type(input, '待重试昵称')
    await user.tab()

    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/user/profile/nickname'))).toHaveLength(1))
    expect(input).toHaveValue('待重试昵称')
    expect(appStore.getState().auth.user?.display_name).toBe(PROFILE.display_name)

    await user.click(input)
    await user.keyboard('{Enter}')

    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/user/profile/nickname'))).toHaveLength(2))
    expect(input).toHaveValue('待重试昵称')
    expect(appStore.getState().auth.user?.display_name).toBe('待重试昵称')
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

  it('点击左侧锚点时滚动到对应区块并同步高亮', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    mockProfileApi()
    renderPage()

    const navigation = await screen.findByRole('navigation', { name: '个人设置导航' })
    const workspaceAnchor = within(navigation).getByRole('button', { name: '工作空间' })
    await user.click(workspaceAnchor)

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(workspaceAnchor).toHaveAttribute('aria-current', 'location')
    expect(window.location.hash).toBe('#settings-workspaces')
  })

  it('更换手机号需要当前值和新值分别验证，并提交双验证码', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockProfileApi()
    renderPage()

    await openAccountSettings(user)
    await user.click(await screen.findByRole('button', { name: '手机号' }))
    const currentDestination = await getContactInput('profile-phone-current-destination')
    const contactDialog = document.querySelector<HTMLElement>('.profile-contact-modal [role="dialog"]')
    expect(contactDialog).toHaveTextContent('当前联系方式')
    const contactModal = document.querySelector('.profile-contact-modal')
    expect(contactModal?.querySelector('.semi-modal')).toHaveClass('semi-modal-centered')
    expect(contactModal).toContainElement(contactDialog)
    const newDestination = await getContactInput('profile-phone-new-destination')
    expect(currentDestination).toHaveValue('13812345678')
    expect(currentDestination).toHaveAttribute('readonly')
    await user.type(newDestination, '13912345678')
    await user.click(screen.getByRole('button', { name: '发送当前验证码' }))
    await user.click(screen.getByRole('button', { name: '发送新验证码' }))
    const currentCode = await getContactInput('profile-phone-currentCode')
    const newCode = await getContactInput('profile-phone-newCode')
    await user.type(currentCode, '123456')
    await user.type(newCode, '654321')
    await user.click(screen.getByRole('button', { name: '保存联系方式' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => String(url).endsWith('/api/user/profile/phone') && options?.method === 'PUT')).toBe(true))
    const codeRequests = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/user/profile/contact/code'))
    expect(codeRequests).toHaveLength(2)
    expect(JSON.parse(String(codeRequests[0][1]?.body))).toEqual({ provider_code: 'phone', purpose: 'current', destination: '13812345678', country_code: '+86' })
    expect(JSON.parse(String(codeRequests[1][1]?.body))).toEqual({ provider_code: 'phone', purpose: 'new', destination: '13912345678', country_code: '+86' })
    const updateRequest = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith('/api/user/profile/phone') && options?.method === 'PUT')
    expect(JSON.parse(String(updateRequest?.[1]?.body))).toEqual({ current_destination: '13812345678', current_code: '123456', new_destination: '13912345678', new_code: '654321' })
    expect(await screen.findByText('139****5678')).toBeInTheDocument()
    expect(getVerifiedPhone(PROFILE.id)).toBe('13912345678')
  })

  it('弹窗修改昵称后立即同步个人中心页面和认证用户', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockProfileApi()
    const appStore = createAppStore()
    appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: authResult().user })

    render(
      <MemoryRouter initialEntries={['/console/settings']}>
        <Provider store={appStore}>
          <AppStoreProvider><PublicHeader /><SettingsPage /></AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    expect(await screen.findByText(`${PROFILE.display_name} 的个人空间`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '打开用户菜单' }))
    await user.click(screen.getByRole('button', { name: '账户设置' }))
    const dialog = await screen.findByRole('dialog', { name: '个人设置' })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: '昵称' })).toBeEnabled())
    await user.click(within(dialog).getByRole('button', { name: '昵称' }))
    const modalNameInput = within(dialog).getByRole('textbox', { name: '昵称' })
    await user.clear(modalNameInput)
    await user.type(modalNameInput, '同步昵称')
    await user.click(within(dialog).getByRole('button', { name: '保存更改' }))

    await waitFor(() => expect(screen.getByText('同步昵称 的个人空间')).toBeInTheDocument())
    expect(appStore.getState().auth.user?.display_name).toBe('同步昵称')
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/user/profile/nickname'))).toHaveLength(1)
  })

  it('更换手机号时提前拦截相同的新旧手机号', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockProfileApi()
    renderPage()

    await openAccountSettings(user)
    await user.click(await screen.findByRole('button', { name: '手机号' }))
    const currentDestination = await getContactInput('profile-phone-current-destination')
    const newDestination = await getContactInput('profile-phone-new-destination')
    expect(currentDestination).toHaveValue('13812345678')
    await user.type(newDestination, '13812345678')
    await user.click(screen.getByRole('button', { name: '发送新验证码' }))
    await user.click(screen.getByRole('button', { name: '保存联系方式' }))

    expect(await screen.findByText('新联系方式不能与当前联系方式相同')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/user/profile/contact/code'))).toBe(false)
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/user/profile/phone'))).toBe(false)
  })

  it('发送验证码前校验手机号格式', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockProfileApi()
    renderPage()

    await openAccountSettings(user)
    await user.click(await screen.findByRole('button', { name: '手机号' }))
    const newDestination = await getContactInput('profile-phone-new-destination')
    await user.type(newDestination, '12345')
    await user.click(screen.getByRole('button', { name: '发送新验证码' }))

    expect(await screen.findByText('请输入正确的中国大陆手机号')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/user/profile/contact/code'))).toBe(false)
  })

  it('关闭联系方式弹窗时清理验证码倒计时', async () => {
    const user = userEvent.setup()
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval')
    mockProfileApi()
    renderPage()

    await openAccountSettings(user)
    await user.click(await screen.findByRole('button', { name: '手机号' }))
    const currentDestination = await getContactInput('profile-phone-current-destination')
    expect(currentDestination).toHaveValue('13812345678')
    await user.click(screen.getByRole('button', { name: '发送当前验证码' }))
    expect(await screen.findByRole('button', { name: '60 秒后重试' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '取消' }))

    await waitFor(() => expect(clearIntervalSpy).toHaveBeenCalled())
  })

  it('手机号更新失败时保留输入并允许重新保存', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockProfileApi({ phoneFailures: 1 })
    renderPage()

    await openAccountSettings(user)
    await user.click(await screen.findByRole('button', { name: '手机号' }))
    const currentDestination = await getContactInput('profile-phone-current-destination')
    const newDestination = await getContactInput('profile-phone-new-destination')
    const currentCode = await getContactInput('profile-phone-currentCode')
    const newCode = await getContactInput('profile-phone-newCode')
    expect(currentDestination).toHaveValue('13812345678')
    await user.type(currentCode, '123456')
    await user.type(newDestination, '13912345678')
    await user.type(newCode, '654321')
    await user.click(screen.getByRole('button', { name: '保存联系方式' }))

    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/user/profile/phone'))).toHaveLength(1))
    expect(document.querySelector('.profile-contact-modal [role="dialog"]')).toBeInTheDocument()
    expect(currentDestination).toHaveValue('13812345678')
    expect(currentCode).toHaveValue('123456')
    expect(newDestination).toHaveValue('13912345678')
    expect(newCode).toHaveValue('654321')

    await user.click(screen.getByRole('button', { name: '保存联系方式' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/user/profile/phone'))).toHaveLength(2))
    expect(await screen.findByText('139****5678')).toBeInTheDocument()
  })

  it('绑定邮箱时只发送新邮箱验证码并提交新邮箱字段', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockProfileApi()
    renderPage()

    await openAccountSettings(user)
    await user.click(await screen.findByRole('button', { name: /绑定邮箱/ }))
    const newDestination = await getContactInput('profile-email-new-destination')
    expect(document.querySelector('.profile-contact-modal [role="dialog"]')).toHaveTextContent('绑定邮箱')
    expect(document.querySelector('#profile-email-current-destination')).toBeNull()
    const newCode = await getContactInput('profile-email-newCode')
    await user.type(newDestination, 'new@example.com')
    await user.click(screen.getByRole('button', { name: '发送新验证码' }))
    await user.type(newCode, '654321')
    await user.click(screen.getByRole('button', { name: '保存联系方式' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => String(url).endsWith('/api/user/profile/email') && options?.method === 'PUT')).toBe(true))
    const codeRequest = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/user/profile/contact/code'))
    expect(JSON.parse(String(codeRequest?.[1]?.body))).toEqual({ provider_code: 'email', purpose: 'new', destination: 'new@example.com' })
    const updateRequest = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith('/api/user/profile/email') && options?.method === 'PUT')
    expect(JSON.parse(String(updateRequest?.[1]?.body))).toEqual({ new_destination: 'new@example.com', new_code: '654321' })
    await waitFor(() => expect(document.querySelector('.profile-contact-modal [role="dialog"]')).not.toBeInTheDocument())
    expect(await screen.findByText('n***@example.com')).toBeInTheDocument()
  })

  it('更换邮箱时分别验证当前邮箱和新邮箱后提交双验证码', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockProfileApi({ emailBound: true })
    renderPage()

    await openAccountSettings(user)
    await user.click(await screen.findByRole('button', { name: /更换邮箱/ }))
    const currentDestination = await getContactInput('profile-email-current-destination')
    expect(document.querySelector('.profile-contact-modal [role="dialog"]')).toHaveTextContent('更换邮箱')
    const currentCode = await getContactInput('profile-email-currentCode')
    const newDestination = await getContactInput('profile-email-new-destination')
    const newCode = await getContactInput('profile-email-newCode')

    await user.type(currentDestination, 'old@example.com')
    await user.click(screen.getByRole('button', { name: '发送当前验证码' }))
    await user.type(currentCode, '123456')
    await user.type(newDestination, 'new@example.com')
    await user.click(screen.getByRole('button', { name: '发送新验证码' }))
    await user.type(newCode, '654321')
    await user.click(screen.getByRole('button', { name: '保存联系方式' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => String(url).endsWith('/api/user/profile/email') && options?.method === 'PUT')).toBe(true))
    const codeRequests = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/user/profile/contact/code'))
    expect(JSON.parse(String(codeRequests[0][1]?.body))).toEqual({ provider_code: 'email', purpose: 'current', destination: 'old@example.com' })
    expect(JSON.parse(String(codeRequests[1][1]?.body))).toEqual({ provider_code: 'email', purpose: 'new', destination: 'new@example.com' })
    const updateRequest = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith('/api/user/profile/email') && options?.method === 'PUT')
    expect(JSON.parse(String(updateRequest?.[1]?.body))).toEqual({ current_destination: 'old@example.com', current_code: '123456', new_destination: 'new@example.com', new_code: '654321' })
    await waitFor(() => expect(document.querySelector('.profile-contact-modal [role="dialog"]')).not.toBeInTheDocument())
  })

  it('邮箱保存失败时展示后端错误并保留全部输入用于重试', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockProfileApi({ emailBound: true, emailFailures: 1 })
    renderPage()

    await openAccountSettings(user)
    await user.click(await screen.findByRole('button', { name: /更换邮箱/ }))
    const currentDestination = await getContactInput('profile-email-current-destination')
    const currentCode = await getContactInput('profile-email-currentCode')
    const newDestination = await getContactInput('profile-email-new-destination')
    const newCode = await getContactInput('profile-email-newCode')
    await user.type(currentDestination, 'old@example.com')
    await user.type(currentCode, '123456')
    await user.type(newDestination, 'new@example.com')
    await user.type(newCode, '654321')
    const saveButton = screen.getByRole('button', { name: '保存联系方式' })
    await user.click(saveButton)

    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/user/profile/email'))).toHaveLength(1))
    expect(await screen.findByText('该邮箱已被其他账号绑定')).toBeInTheDocument()
    expect(document.querySelector('.profile-contact-modal [role="dialog"]')).toBeInTheDocument()
    expect(currentDestination).toHaveValue('old@example.com')
    expect(currentCode).toHaveValue('123456')
    expect(newDestination).toHaveValue('new@example.com')
    expect(newCode).toHaveValue('654321')
    expect(saveButton).toBeEnabled()

    await user.click(saveButton)
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/user/profile/email'))).toHaveLength(2))
    await waitFor(() => expect(document.querySelector('.profile-contact-modal [role="dialog"]')).not.toBeInTheDocument())
  })

  it('复制用户 ID 并保留参考页的工作空间与安全入口', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    const originalClipboard = navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const { fetchMock } = mockProfileApi()
    renderPage()

    await screen.findByRole('heading', { name: '工作空间' })
    const accountDialog = await openAccountSettings(user)
    await user.click(within(accountDialog).getByRole('button', { name: '复制用户 ID' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(PROFILE.id))
    await user.click(within(accountDialog).getByRole('button', { name: /关闭/ }))

    await user.click(screen.getByRole('button', { name: '进入注销流程' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/user/account-deletion/precheck'))).toBe(true))
    const securityDescription = await screen.findByText(/删除账户是永久操作/)
    const securityDialog = securityDescription.closest('[role="dialog"]') as HTMLElement
    expect(securityDialog).not.toBeNull()
    expect(securityDialog).toHaveTextContent('删除账户是永久操作')
    expect(securityDialog).toHaveTextContent('请在下方输入“DELETE”以继续')
    const securityModal = document.querySelector('.account-deletion-dialog')
    expect(securityModal?.querySelector('.semi-modal')).toHaveClass('semi-modal-centered')
    expect(securityModal).toContainElement(securityDialog)
    const confirmationInput = within(securityDialog).getByRole('textbox')
    const deleteButton = within(securityDialog).getByRole('button', { name: /^删除账户$/ })
    expect(deleteButton).toBeDisabled()
    await user.type(confirmationInput, 'delete')
    expect(deleteButton).toBeDisabled()
    await user.clear(confirmationInput)
    await user.type(confirmationInput, 'DELETE')
    expect(deleteButton).toBeEnabled()
    await user.click(within(securityDialog).getByRole('button', { name: '取消' }))
    await waitFor(() => expect(document.querySelector('.account-deletion-dialog')).not.toBeInTheDocument())
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard })
  })

  it('前置检查接口暂未部署时使用企业关系兼容判断并正常打开确认弹窗', async () => {
    const user = userEvent.setup()
    mockProfileApi({ deletionPrecheck404: true })
    renderPage()

    await user.click(await screen.findByRole('button', { name: '进入注销流程' }))
    expect(await screen.findByText(/检测到您的账号下存在企业/)).toBeInTheDocument()
  })

  it('创建企业空间入口跳转到企业创建页', async () => {
    const user = userEvent.setup()
    mockProfileApi()
    renderPage(true)

    await user.click(await screen.findByRole('button', { name: '创建企业空间' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(NEW_ENTERPRISE_CREATE_PATH))
  })

  it('企业空间隐藏企业账号信息并保留账户管理入口', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockProfileApi()
    renderPage(false, true)

    expect(await screen.findByRole('heading', { name: '个人设置' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '账户' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '个人资料' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '企业账号信息' })).not.toBeInTheDocument()
    expect(screen.getAllByText('示例企业')).toHaveLength(1)
    expect(screen.queryByText('ENT-001')).not.toBeInTheDocument()
    expect(screen.queryByText('01K0MEMBERPUBLICIDEXAMPLE1')).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '个人设置导航' })).toHaveTextContent('账户工作空间')
    expect(screen.queryByRole('heading', { name: '通知偏好' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '账号安全' })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/user/enterprise/01K0ENTERPRISEPUBLICIDEX01/context'))).toBe(true)

    const nicknameInput = await openNicknameEditor(user)
    await user.clear(nicknameInput)
    await user.type(nicknameInput, '企业空间中的新昵称')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => String(url).endsWith('/api/user/profile/nickname') && JSON.parse(String(options?.body)).display_name === '企业空间中的新昵称')).toBe(true))
  })
})
