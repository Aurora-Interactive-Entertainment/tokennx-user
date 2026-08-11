import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { limitDisplayNameLength } from '@/api/profile'
import { getEnterpriseContext, type EnterpriseContext } from '@/api/enterprise-console'
import { AppStoreProvider } from '@/data/app-state'
import { createAppStore } from '@/store'
import { synchronizeAuthenticatedUser } from '@/store/auth-slice'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import { activeNavKey, ConsoleLayout, consoleNavGroupsFor, DEFAULT_CONSOLE_PATH, isEnterpriseOwner, isEnterprisePermissionPath, LoginPanel, localizeConsoleLabel, normalizeLoginReturnPath, PublicFooter, PublicHeader, PUBLIC_LINKS } from './common'
import { NEW_ENTERPRISE_CREATE_PATH } from '@/api/enterprise-certification'
import i18n from '@/i18n'

vi.mock('@/api/enterprise-console', async () => {
  const actual = await vi.importActual<typeof import('@/api/enterprise-console')>('@/api/enterprise-console')
  return { ...actual, getEnterpriseContext: vi.fn() }
})

const getEnterpriseContextMock = vi.mocked(getEnterpriseContext)

// 中文：测试默认返回完整企业上下文，避免权限 mock 逃逸为不完整对象。
const DEFAULT_ENTERPRISE_CONTEXT: EnterpriseContext = {
  id: 'test-enterprise',
  name: '测试企业',
  code: 'TEST-001',
  member_id: 'test-member',
  role: 'member',
  roles: ['member'],
  permissions: [],
  capabilities: {
    can_manage_members: false,
    can_manage_roles: false,
    can_manage_tags: false,
    can_manage_models: false,
    can_manage_usage: false,
    can_view_models: false,
    can_view_usage: false,
    can_view_audit: false,
    can_view_analytics: false,
  },
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="common-location">{location.pathname}{location.search}</output>
}

beforeEach(() => {
  clearAuthTokens()
  vi.clearAllMocks()
  getEnterpriseContextMock.mockResolvedValue(DEFAULT_ENTERPRISE_CONTEXT)
})
afterEach(() => {
  vi.restoreAllMocks()
  clearAuthTokens()
})

describe('控制台导航路径匹配', () => {
  it('优先匹配最长路径并避免把控制台根路径误判为子页面', () => {
    expect(activeNavKey('/console/quickstart')).toBe('/console/quickstart')
    expect(activeNavKey('/console/models/deepseek-chat')).toBe('/console/models')
    expect(activeNavKey('/console/enterprise-records/detail')).toBe('/console/enterprise-records')
    expect(activeNavKey('/console/real-name')).toBe('/console/real-name')
    expect(activeNavKey('/console/enterprise-create')).toBe('/console/enterprise-create')
    expect(activeNavKey('/console/video')).toBe('/console/video')
    expect(activeNavKey('/console/invitations')).toBe('')
    expect(activeNavKey('/console')).toBe('')
  })

  it('展示侧栏入口、个人空间标识和全局客服入口', () => {
    render(
      <MemoryRouter initialEntries={['/console/quickstart']}>
        <Provider store={createAppStore()}>
          <AppStoreProvider>
            <ConsoleLayout><span>页面内容</span></ConsoleLayout>
          </AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    const navigation = screen.getByRole('navigation', { name: '控制台导航' })
    expect(navigation).toHaveTextContent('实名认证')
    expect(navigation).toHaveTextContent('调用记录')
    expect(navigation).not.toHaveTextContent('使用日志')
    expect(navigation).not.toHaveTextContent('企业管理')
    expect(navigation).toHaveTextContent('视频生成')
    expect(navigation).not.toHaveTextContent('邀请返现')
    expect(navigation).not.toHaveTextContent('认证送现金')
    expect(navigation).not.toHaveTextContent('文档中心')
    expect(navigation).not.toHaveTextContent('联系我们')
    expect(navigation).not.toHaveTextContent('在线客服')
    expect(screen.getByRole('link', { name: '实名认证' })).toHaveAttribute('href', '/console/real-name')
    expect(screen.getByRole('link', { name: '视频生成' })).toHaveAttribute('href', '/console/video')
    expect(screen.queryByRole('button', { name: /认证送现金/ })).toBeNull()
    expect(screen.getByRole('status', { name: '当前空间' })).toHaveTextContent('个人空间')
    expect(screen.getByRole('button', { name: '打开客服' })).toBeInTheDocument()
    expect(navigation.closest('.console-sidebar')).not.toHaveTextContent('han')
    expect(navigation.querySelectorAll('.console-nav-link .console-nav-icon')).toHaveLength(navigation.querySelectorAll('.console-nav-link').length)
  })

  it('Header 消息图标打开全局客服并默认切换到通知栏目', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/console/records']}>
        <Provider store={createAppStore()}>
          <AppStoreProvider><ConsoleLayout><span>页面内容</span></ConsoleLayout></AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '查看通知' }))
    const supportDialog = await screen.findByRole('dialog', { name: '联系客服' })
    expect(within(supportDialog).getByRole('tab', { name: /通知/ })).toHaveAttribute('aria-selected', 'true')
    expect(within(supportDialog).getByRole('tabpanel', { name: '通知' })).toBeInTheDocument()
  })

  it('企业空间只展示企业名并为完整名称保留悬浮提示', () => {
    const previousSnapshot = window.localStorage.getItem('token-nx:user-front:v1')
    const enterpriseName = '华东智能模型服务与研发企业空间'
    window.localStorage.setItem('token-nx:user-front:v1', JSON.stringify({
      nickname: 'han',
      activeWorkspaceId: 'ent-long',
      workspaces: [{ id: 'ent-long', name: enterpriseName, type: 'enterprise', role: 'owner' }],
    }))

    try {
      render(
        <MemoryRouter initialEntries={['/console/quickstart']}>
          <Provider store={createAppStore()}>
            <AppStoreProvider><ConsoleLayout><span>页面内容</span></ConsoleLayout></AppStoreProvider>
          </Provider>
        </MemoryRouter>,
      )

      const workspaceDisplay = screen.getByRole('status', { name: '当前空间' })
      expect(workspaceDisplay).toHaveAttribute('title', enterpriseName)
      expect(workspaceDisplay.querySelector('strong')).toHaveAttribute('title', enterpriseName)
      expect(workspaceDisplay.querySelector('strong')).toHaveTextContent(enterpriseName)
      expect(workspaceDisplay).not.toHaveTextContent('企业空间 · 所有者')
    } finally {
      if (previousSnapshot === null) {
        window.localStorage.removeItem('token-nx:user-front:v1')
      } else {
        window.localStorage.setItem('token-nx:user-front:v1', previousSnapshot)
      }
    }
  })

  it('企业治理入口位于企业设置末尾并保持企业管理顺序', () => {
    const previousSnapshot = window.localStorage.getItem('token-nx:user-front:v1')
    window.localStorage.setItem('token-nx:user-front:v1', JSON.stringify({
      activeWorkspaceId: 'ent-nav',
      workspaces: [{ id: 'ent-nav', name: '测试企业', type: 'enterprise', role: 'owner' }],
    }))

    try {
      render(
        <MemoryRouter initialEntries={['/console/enterprise-governance']}>
          <Provider store={createAppStore()}>
            <AppStoreProvider><ConsoleLayout><span>页面内容</span></ConsoleLayout></AppStoreProvider>
          </Provider>
        </MemoryRouter>,
      )

      const navigation = screen.getByRole('navigation', { name: '控制台导航' })
      const sections = Array.from(navigation.querySelectorAll('.console-nav-section'))
      const management = sections.find((section) => section.querySelector('.console-nav-section-title')?.textContent === '企业管理')
      const settings = sections.find((section) => section.querySelector('.console-nav-section-title')?.textContent === '企业设置')
      expect(management).not.toBeUndefined()
      expect(settings).not.toBeUndefined()
      expect(within(management as HTMLElement).getAllByRole('link').map((link) => link.textContent)).toEqual(['人员管理', '用量管理', '操作日志', '数据分析', '费用管理'])
      expect(within(management as HTMLElement).queryByRole('link', { name: '权限与标签' })).toBeNull()
      expect(within(settings as HTMLElement).getAllByRole('link').map((link) => link.textContent)).toEqual(['通用设置', '模型管理', '权限与标签'])
    } finally {
      if (previousSnapshot === null) {
        window.localStorage.removeItem('token-nx:user-front:v1')
      } else {
        window.localStorage.setItem('token-nx:user-front:v1', previousSnapshot)
      }
    }
  })

  it('企业成员只展示个人使用入口，并从用户菜单同步隐藏企业所有者入口', async () => {
    const previousSnapshot = window.localStorage.getItem('token-nx:user-front:v1')
    window.localStorage.setItem('token-nx:user-front:v1', JSON.stringify({
      activeWorkspaceId: 'ent-member',
      workspaces: [{ id: 'ent-member', name: '成员企业', type: 'enterprise', role: 'member' }],
    }))

    try {
      const appStore = createAppStore()
      appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: { id: 'user-member', display_name: '企业成员', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' } })
      render(
        <MemoryRouter initialEntries={['/console/quickstart']}>
          <Provider store={appStore}>
            <AppStoreProvider><ConsoleLayout><span>页面内容</span></ConsoleLayout></AppStoreProvider>
          </Provider>
        </MemoryRouter>,
      )

      const navigation = screen.getByRole('navigation', { name: '控制台导航' })
      expect(navigation).toHaveTextContent('快速接入')
      expect(navigation).toHaveTextContent('模型广场')
      expect(navigation).toHaveTextContent('智能对话')
      expect(navigation).toHaveTextContent('视频生成')
      expect(navigation).toHaveTextContent('用量统计')
      expect(navigation).toHaveTextContent('调用记录')
      expect(navigation).toHaveTextContent('账号信息')
      expect(navigation).toHaveTextContent('API 密钥管理')
      for (const label of ['企业管理', '人员管理', '用量管理', '操作日志', '数据分析', '企业设置', '通用设置', '模型管理', '权限与标签', '费用管理']) {
        expect(navigation).not.toHaveTextContent(label)
      }

      await userEvent.setup().click(screen.getByRole('button', { name: '打开用户菜单' }))
      const menu = screen.getByRole('menu', { name: '用户菜单' })
      expect(menu).toHaveTextContent('快速接入')
      expect(menu).toHaveTextContent('API 密钥管理')
      expect(menu).not.toHaveTextContent('企业管理')
      expect(menu).not.toHaveTextContent('费用管理')
    } finally {
      if (previousSnapshot === null) {
        window.localStorage.removeItem('token-nx:user-front:v1')
      } else {
        window.localStorage.setItem('token-nx:user-front:v1', previousSnapshot)
      }
    }
  })

  it('企业导航过滤器按角色组权限显示对应菜单并把费用归入企业管理', () => {
    expect(isEnterpriseOwner({ type: 'enterprise', role: 'owner' })).toBe(true)
    expect(isEnterpriseOwner({ type: 'enterprise', role: 'member' })).toBe(false)
    expect(isEnterpriseOwner({ type: 'personal', role: 'owner' })).toBe(false)
    expect(consoleNavGroupsFor({ type: 'enterprise', role: 'member' }).flatMap((group) => group.items).map((item) => item.label)).toEqual(['快速接入', '模型广场', '智能对话', '视频生成', '用量统计', '调用记录', '账号信息', 'API 密钥管理'])
    expect(consoleNavGroupsFor({ type: 'enterprise', role: 'member' }, ['usage.detail']).flatMap((group) => group.items).map((item) => item.label)).toContain('用量管理')
    expect(consoleNavGroupsFor({ type: 'enterprise', role: 'member' }, ['billing.view']).flatMap((group) => group.items).map((item) => item.label)).toContain('费用管理')
    expect(consoleNavGroupsFor({ type: 'enterprise', role: 'member' }, ['billing.view']).find((group) => group.key === 'enterprise-management')?.items.map((item) => item.label)).toContain('费用管理')
    expect(consoleNavGroupsFor({ type: 'enterprise', role: 'member' }, ['billing.view']).find((group) => group.key === 'account')?.items.map((item) => item.label)).not.toContain('费用管理')
    expect(consoleNavGroupsFor({ type: 'enterprise', role: 'member' }, ['tags.edit']).flatMap((group) => group.items).map((item) => item.label)).toContain('权限与标签')
    expect(consoleNavGroupsFor({ type: 'enterprise', role: 'owner' }).flatMap((group) => group.items).map((item) => item.label)).toContain('费用管理')
    expect(isEnterprisePermissionPath('/console/enterprise-settings')).toBe(true)
    expect(isEnterprisePermissionPath('/console/enterprise-records/detail')).toBe(true)
    expect(isEnterprisePermissionPath('/console/usage')).toBe(false)
  })

  it('企业成员直接打开所有者入口时回到快速接入', async () => {
    const previousSnapshot = window.localStorage.getItem('token-nx:user-front:v1')
    window.localStorage.setItem('token-nx:user-front:v1', JSON.stringify({
      activeWorkspaceId: 'ent-member-direct',
      workspaces: [{ id: 'ent-member-direct', name: '成员企业', type: 'enterprise', role: 'member' }],
    }))

    try {
      render(
        <MemoryRouter initialEntries={['/console/enterprise-usage']}>
          <Provider store={createAppStore()}>
            <AppStoreProvider><LocationProbe /><ConsoleLayout><span>页面内容</span></ConsoleLayout></AppStoreProvider>
          </Provider>
        </MemoryRouter>,
      )

      await waitFor(() => expect(screen.getByTestId('common-location')).toHaveTextContent('/console/quickstart'))
      expect(screen.getByRole('navigation', { name: '控制台导航' })).not.toHaveTextContent('企业管理')
    } finally {
      if (previousSnapshot === null) {
        window.localStorage.removeItem('token-nx:user-front:v1')
      } else {
        window.localStorage.setItem('token-nx:user-front:v1', previousSnapshot)
      }
    }
  })

  it('企业成员加载角色组权限后只展示对应企业菜单并允许受控路由', async () => {
    const previousSnapshot = window.localStorage.getItem('token-nx:user-front:v1')
    window.localStorage.setItem('token-nx:user-front:v1', JSON.stringify({
      activeWorkspaceId: 'ent-usage-role',
      workspaces: [{ id: 'ent-usage-role', name: '用量企业', type: 'enterprise', role: 'usage_manager' }],
    }))
    saveAuthTokens({ status: 'succeeded', binding_required: false, access_token: 'enterprise-access-token', refresh_token: 'enterprise-refresh-token', refresh_expires_at: Date.UTC(2099, 0, 1) })
    getEnterpriseContextMock.mockResolvedValue({ ...DEFAULT_ENTERPRISE_CONTEXT, permissions: ['usage.detail'] })

    try {
      render(
        <MemoryRouter initialEntries={['/console/enterprise-usage']}>
          <Provider store={createAppStore()}>
            <AppStoreProvider><LocationProbe /><ConsoleLayout><span>页面内容</span></ConsoleLayout></AppStoreProvider>
          </Provider>
        </MemoryRouter>,
      )

      await waitFor(() => expect(screen.getByRole('navigation', { name: '控制台导航' })).toHaveTextContent('用量管理'))
      const navigation = screen.getByRole('navigation', { name: '控制台导航' })
      expect(navigation).not.toHaveTextContent('人员管理')
      expect(navigation).not.toHaveTextContent('费用管理')
      expect(screen.getByTestId('common-location')).toHaveTextContent('/console/enterprise-usage')
    } finally {
      if (previousSnapshot === null) {
        window.localStorage.removeItem('token-nx:user-front:v1')
      } else {
        window.localStorage.setItem('token-nx:user-front:v1', previousSnapshot)
      }
    }
  })
})

describe('公共 Header 布局', () => {
  it('公共导航不再暴露已移除的信号首页', () => {
    expect(PUBLIC_LINKS.some((link) => link.path === '/signal')).toBe(false)
    expect(PUBLIC_LINKS.some((link) => link.labelKey === 'nav.signalHome')).toBe(false)
  })

  it('非首页路由也使用首页 Header 布局', () => {
    render(
      <MemoryRouter initialEntries={['/models']}>
        <Provider store={createAppStore()}>
          <AppStoreProvider><PublicHeader /></AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    expect(document.querySelector('.public-header')).toHaveClass('public-header--home')
  })

  it('通知红点与铃铛资源分离并由未读数量控制', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/']}>
        <Provider store={createAppStore()}>
          <AppStoreProvider><PublicHeader unreadNotificationCount={0} /></AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    const notificationButton = screen.getByRole('button', { name: '查看通知' })
    expect(notificationButton.querySelector('.header-notification-icon')).toBeInTheDocument()
    expect(notificationButton.querySelector('.header-notification-dot')).toBeNull()

    rerender(
      <MemoryRouter initialEntries={['/']}>
        <Provider store={createAppStore()}>
          <AppStoreProvider><PublicHeader unreadNotificationCount={2} /></AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: '查看通知' }).querySelectorAll('.header-notification-dot')).toHaveLength(1)
  })

  it('费用弹窗可通过眼睛按钮隐藏和恢复余额', async () => {
    const user = userEvent.setup()
    const appStore = createAppStore()
    appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: { id: 'user-1', display_name: '测试用户', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' } })

    render(
      <MemoryRouter initialEntries={['/']}>
        <Provider store={appStore}>
          <AppStoreProvider><PublicHeader /></AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    const navigation = screen.getByRole('navigation', { name: '公开导航' })
    await user.hover(within(navigation).getByRole('link', { name: '费用' }))
    const dialog = await screen.findByRole('dialog', { name: '账户余额' })
    expect(within(dialog).getByText('348.62')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: '隐藏余额' }))
    expect(within(dialog).getByText('*****')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '显示余额' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: '显示余额' }))
    expect(within(dialog).getByText('348.62')).toBeInTheDocument()
  })

  it('公开 Header 的模型、排名、应用和文档入口可点击，桌面和移动导航仅禁用私有化', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <Provider store={createAppStore()}>
          <AppStoreProvider><PublicHeader /></AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    const desktopNav = screen.getByRole('navigation', { name: '公开导航' })
    expect(within(desktopNav).getByRole('link', { name: '模型' })).toHaveAttribute('href', '/models')
    expect(within(desktopNav).getByRole('link', { name: '排名' })).toHaveAttribute('href', '/rankings')
    expect(within(desktopNav).getByRole('link', { name: '应用' })).toHaveAttribute('href', '/apps')
    expect(within(desktopNav).getByRole('link', { name: '文档' })).toHaveAttribute('href', '/docs')
    for (const label of ['私有化']) {
      expect(within(desktopNav).queryByRole('link', { name: label })).toBeNull()
      expect(within(desktopNav).getByText(label)).toHaveAttribute('aria-disabled', 'true')
    }

    await user.click(screen.getByRole('button', { name: '打开公开导航' }))
    const mobileNav = document.querySelector('.public-mobile-nav')
    expect(mobileNav).not.toBeNull()
    expect(within(mobileNav as HTMLElement).getByRole('link', { name: '模型' })).toHaveAttribute('href', '/models')
    expect(within(mobileNav as HTMLElement).getByRole('link', { name: '排名' })).toHaveAttribute('href', '/rankings')
    expect(within(mobileNav as HTMLElement).getByRole('link', { name: '应用' })).toHaveAttribute('href', '/apps')
    expect(within(mobileNav as HTMLElement).getByRole('link', { name: '文档' })).toHaveAttribute('href', '/docs')
    for (const label of ['私有化']) {
      expect(within(mobileNav as HTMLElement).queryByRole('link', { name: label })).toBeNull()
      expect(within(mobileNav as HTMLElement).getByText(label)).toHaveAttribute('aria-disabled', 'true')
    }
  })

  it('移动导航可通过外部点击和 Escape 收起', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <Provider store={createAppStore()}>
          <AppStoreProvider><PublicHeader /></AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    const menuButton = document.querySelector('.mobile-menu-button') as HTMLButtonElement
    const mobileNav = document.querySelector('.public-mobile-nav') as HTMLElement
    expect(menuButton.querySelector('.mobile-menu-icon-menu')).toBeInTheDocument()
    expect(menuButton.querySelector('.mobile-menu-icon-close')).toBeInTheDocument()
    await user.click(menuButton)
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    expect(mobileNav).not.toHaveAttribute('hidden')

    fireEvent.pointerDown(document.body)
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    expect(mobileNav).toHaveAttribute('hidden')

    await user.click(menuButton)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    expect(mobileNav).toHaveAttribute('hidden')
  })

  it('移动导航登录后展示用户身份和独立退出入口', async () => {
    const user = userEvent.setup()
    const appStore = createAppStore()
    appStore.dispatch(synchronizeAuthenticatedUser({
      id: 'mobile-user',
      display_name: '移动端用户',
      avatar_url: '',
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      status: 'active',
      phone_masked: '138****0000',
    }))

    render(
      <MemoryRouter initialEntries={['/']}>
        <Provider store={appStore}>
          <AppStoreProvider><PublicHeader /></AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    await user.click(document.querySelector('.mobile-menu-button') as HTMLButtonElement)

    expect(document.querySelector('.public-header')).toHaveClass('mobile-nav-open')
    expect(document.querySelector('.user-menu-trigger')).toHaveTextContent('移动端用户')
    expect(document.querySelector('.public-mobile-logout')).toHaveTextContent(i18n.t('nav.logout'))
  })

  it('移动导航通知按钮会收起导航并打开通知面板', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <Provider store={createAppStore()}>
          <AppStoreProvider>
            <PublicHeader unreadNotificationCount={2} />
            <PublicFooter />
          </AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    const menuButton = document.querySelector('.mobile-menu-button') as HTMLButtonElement
    const mobileNav = document.querySelector('.public-mobile-nav') as HTMLElement
    await user.click(menuButton)

    const notificationButton = within(mobileNav).getByRole('button', { name: i18n.t('nav.notifications') })
    expect(notificationButton.querySelector('.header-notification-icon')).toBeInTheDocument()
    expect(notificationButton.querySelector('.header-notification-dot')).toBeInTheDocument()

    await user.click(notificationButton)

    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    expect(mobileNav).toHaveAttribute('hidden')
    const supportDialog = await screen.findByRole('dialog', { name: i18n.t('support.dialogLabel') })
    expect(within(supportDialog).getByRole('tabpanel', { name: i18n.t('support.notificationsTab') })).toBeInTheDocument()
    expect(supportDialog.querySelector('.manuscript-support-tab.is-active')).toHaveAttribute('aria-selected', 'true')
  })

  it('关闭客服面板后会同步收起悬浮入口', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><PublicFooter /></MemoryRouter>)

    const widget = document.querySelector('.manuscript-support-widget') as HTMLElement
    const labelButton = document.querySelector('.manuscript-support-label-button') as HTMLButtonElement
    fireEvent.mouseEnter(widget)
    expect(widget).toHaveClass('is-hovered')

    await user.click(labelButton)
    const supportDialog = await screen.findByRole('dialog', { name: i18n.t('support.dialogLabel') })
    await user.click(within(supportDialog).getByRole('button', { name: i18n.t('support.closePanel') }))

    expect(widget).not.toHaveClass('is-hovered')
    expect(labelButton).toHaveAttribute('aria-hidden', 'true')
    expect(labelButton).toHaveAttribute('tabindex', '-1')
  })

  it('统一公共 Footer 分组支持展开、切换和收起', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><PublicFooter /></MemoryRouter>)

    const productToggle = screen.getByRole('button', { name: i18n.t('footer.product') })
    const docsToggle = screen.getByRole('button', { name: i18n.t('footer.docs') })
    expect(productToggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(productToggle)
    expect(productToggle).toHaveAttribute('aria-expanded', 'true')
    expect(productToggle.closest('.public-footer-nav-group')).toHaveClass('is-open')

    await user.click(docsToggle)
    expect(productToggle).toHaveAttribute('aria-expanded', 'false')
    expect(docsToggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(docsToggle)
    expect(docsToggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('Header 和用户菜单统一限制昵称展示长度', async () => {
    const user = userEvent.setup()
    const appStore = createAppStore()
    const longName = '超长昵称'.repeat(8)
    appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: { id: 'user-1', display_name: longName, avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' } })

    render(
      <MemoryRouter initialEntries={['/']}>
        <Provider store={appStore}>
          <AppStoreProvider><ConsoleLayout><span>页面内容</span></ConsoleLayout></AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    const expectedName = limitDisplayNameLength(longName)
    expect(screen.getByRole('button', { name: '打开用户菜单' })).toHaveTextContent(expectedName)
    expect(screen.getByRole('button', { name: '打开用户菜单' })).not.toHaveTextContent(longName)
    expect(screen.getByRole('status', { name: '当前空间' })).toHaveTextContent('个人空间')
    await user.click(screen.getByRole('button', { name: '打开用户菜单' }))
    const menu = screen.getByRole('menu', { name: '用户菜单' })
    expect(menu).toHaveTextContent(expectedName)
    expect(menu).not.toHaveTextContent(longName)
  })
})

describe('控制台模型展示本地化', () => {
  it('模型可用时间窗口使用当前语言资源', async () => {
    const previousLanguage = i18n.language
    await i18n.changeLanguage('en-US')
    try {
      expect(localizeConsoleLabel(i18n.t, '近 24 小时')).toBe('Last 24 hours')
    } finally {
      await i18n.changeLanguage(previousLanguage)
    }
  })
})

describe('登录验证码按钮', () => {
  it('发送验证码后立即显示加载并阻止重复请求', async () => {
    const user = userEvent.setup()
    let resolveRequest!: (response: Response) => void
    const pendingResponse = new Promise<Response>((resolve) => { resolveRequest = resolve })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValue(pendingResponse)

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Provider store={createAppStore()}>
          <AppStoreProvider><LoginPanel onSuccess={vi.fn()} /></AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('手机号'), '13800138000')
    const sendButton = screen.getByRole('button', { name: '获取验证码' })
    await user.click(sendButton)

    await waitFor(() => {
      expect(sendButton).toBeDisabled()
      expect(sendButton).toHaveAttribute('aria-busy', 'true')
      expect(sendButton).toHaveTextContent('发送中...')
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await user.click(sendButton)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveRequest(new Response(JSON.stringify({ code: 0, msg: 'success', data: { destination_masked: '138****8000', expires_at: '2099-01-01T00:05:00Z', retry_after_seconds: 10 } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    await waitFor(() => expect(screen.getByRole('button', { name: '60s 后重试' })).toBeDisabled())
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ destination: '13800138000', country_code: '+86' })
  })

  it('刷新后相同手机号继续冷却，切换其他手机号即可发送', async () => {
    const user = userEvent.setup()
    const cooldownKey = 'token-nx:auth:phone-code-cooldown:v1'
    window.localStorage.setItem(cooldownKey, JSON.stringify({ destination: '13800138000', countryCode: '+86', expiresAt: Date.now() + 60_000 }))
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Provider store={createAppStore()}>
          <AppStoreProvider><LoginPanel onSuccess={vi.fn()} /></AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )
    const phoneInput = screen.getByLabelText('手机号')
    await user.type(phoneInput, '13800138000')
    expect(screen.getByRole('button', { name: /s 后重试/ })).toBeDisabled()
    await user.clear(phoneInput)
    await user.type(phoneInput, '13900139000')
    expect(screen.getByRole('button', { name: '获取验证码' })).toBeEnabled()
    window.localStorage.removeItem(cooldownKey)
  })
})

describe('已登录用户菜单', () => {
  it('显示参考站的账号信息、分组入口和退出登录', async () => {
    const user = userEvent.setup()
    const appStore = createAppStore()
    appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: { id: 'user-1', display_name: '测试用户', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' } })

    render(
      <MemoryRouter initialEntries={['/console/quickstart']}>
        <Provider store={appStore}>
          <AppStoreProvider><PublicHeader /></AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '打开用户菜单' }))
    const menu = screen.getByRole('menu', { name: '用户菜单' })
    expect(menu).toHaveTextContent('测试用户')
    expect(menu).toHaveTextContent('137****7000')
    expect(menu).toHaveTextContent('当前空间 · 测试用户')
    expect(menu).toHaveTextContent('切换空间')
    expect(menu).toHaveTextContent('快速接入')
    expect(menu).toHaveTextContent('智能对话')
    expect(menu).toHaveTextContent('视频生成')
    expect(menu).toHaveTextContent('调用记录')
    expect(menu).not.toHaveTextContent('使用日志')
    expect(menu).toHaveTextContent('费用管理')
    expect(menu).toHaveTextContent('API 密钥管理')
    expect(menu).not.toHaveTextContent('邀请返现')
    expect(menu).not.toHaveTextContent('认证送现金')
    expect(menu).not.toHaveTextContent('文档中心')
    expect(menu).not.toHaveTextContent('联系我们')
    expect(menu).toHaveTextContent('退出登录')
  })

  it('点击用户菜单设置打开全局账户弹窗', async () => {
    const user = userEvent.setup()
    const appStore = createAppStore()
    appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: { id: 'user-1', display_name: '测试用户', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' } })

    render(
      <MemoryRouter initialEntries={['/']}>
        <Provider store={appStore}>
          <AppStoreProvider><PublicHeader /></AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    await user.hover(screen.getByRole('button', { name: '打开用户菜单' }))
    await user.click(screen.getByRole('button', { name: '账户设置' }))
    const dialog = await screen.findByRole('dialog', { name: '个人中心' })
    expect(dialog).toHaveTextContent('个人资料')
    expect(dialog).toHaveTextContent('账户')
    expect(dialog).toHaveTextContent('测试用户')
    expect(dialog.querySelectorAll('.account-settings-badges img')).toHaveLength(3)

    await user.click(within(dialog).getByRole('button', { name: '昵称' }))
    const nameInput = within(dialog).getByRole('textbox', { name: '昵称' })
    await user.clear(nameInput)
    await user.type(nameInput, '新的昵称')
    await user.click(within(dialog).getByText('头像'))
    expect(within(dialog).queryByRole('textbox', { name: '昵称' })).toBeNull()
    expect(dialog).toHaveTextContent('新的昵称')

    await user.click(within(dialog).getByRole('button', { name: '手机号' }))
    const phoneInput = within(dialog).getByRole('textbox', { name: '手机号' })
    await user.clear(phoneInput)
    await user.type(phoneInput, '13800138000{enter}')
    expect(within(dialog).queryByRole('textbox', { name: '手机号' })).toBeNull()
    expect(dialog).toHaveTextContent('13800138000')
  })

  it('登录没有指定返回地址时进入快速接入而不是总览', () => {
    expect(normalizeLoginReturnPath(undefined)).toBe(DEFAULT_CONSOLE_PATH)
    expect(normalizeLoginReturnPath(null)).toBe(DEFAULT_CONSOLE_PATH)
  })

  it('无企业时只显示当前用户和创建企业，并将选择菜单放到用户菜单左侧', async () => {
    const user = userEvent.setup()
    const appStore = createAppStore()
    saveAuthTokens({ status: 'succeeded', binding_required: false, access_token: 'workspace-access-token', refresh_token: 'workspace-refresh-token', refresh_expires_at: Date.UTC(2099, 0, 1) })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 0, msg: 'success', data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: { id: 'user-1', display_name: '测试用户', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' } })

    render(
      <MemoryRouter initialEntries={['/']}>
        <Provider store={appStore}>
          <AppStoreProvider><ConsoleLayout><><LocationProbe /><span>页面内容</span></></ConsoleLayout></AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: '打开用户菜单' }))
    await user.click(screen.getByRole('menuitem', { name: '切换空间' }))
    const workspaceMenu = screen.getByRole('menu', { name: '切换空间' })
    expect(workspaceMenu).toBeVisible()
    expect(workspaceMenu.parentElement).toBe(document.body)
    expect(workspaceMenu.style.top).not.toBe('')
    expect(workspaceMenu).toHaveTextContent('测试用户')
    expect(workspaceMenu).not.toHaveTextContent('NX Labs')
    expect(workspaceMenu).not.toHaveTextContent('云启科技')
    expect(workspaceMenu).toHaveTextContent('创建企业')
    expect(screen.getByRole('link', { name: '企业入驻' })).toHaveAttribute('href', NEW_ENTERPRISE_CREATE_PATH)

    await user.click(screen.getByRole('menuitem', { name: /创建企业/ }))
    await waitFor(() => expect(screen.getByTestId('common-location')).toHaveTextContent(NEW_ENTERPRISE_CREATE_PATH))
  })

  it('使用个人中心返回的企业关系并在选中后同步侧栏顶部', async () => {
    const user = userEvent.setup()
    const appStore = createAppStore()
    saveAuthTokens({ status: 'succeeded', binding_required: false, access_token: 'workspace-access-token', refresh_token: 'workspace-refresh-token', refresh_expires_at: Date.UTC(2099, 0, 1) })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      msg: 'success',
      data: [{
        id: 'membership-real',
        enterprise_id: 'enterprise-real',
        enterprise_name: '真实关联企业',
        enterprise_code: 'REAL-001',
        member_status: 'active',
        join_source: 'invite',
        roles: ['administrator'],
        owner: false,
        joined_at: '2026-07-24T08:00:00Z',
        version: 1,
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: { id: 'user-1', display_name: '测试用户', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' } })

    render(
      <MemoryRouter initialEntries={['/console/quickstart']}>
        <Provider store={appStore}>
          <AppStoreProvider><ConsoleLayout><span>页面内容</span></ConsoleLayout></AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('status', { name: '当前空间' })).toHaveTextContent('个人空间')
    await user.click(screen.getByRole('button', { name: '打开用户菜单' }))
    await user.click(screen.getByRole('menuitem', { name: '切换空间' }))
    const workspaceMenu = screen.getByRole('menu', { name: '切换空间' })
    expect(workspaceMenu).toHaveTextContent('真实关联企业')
    expect(workspaceMenu).not.toHaveTextContent('NX Labs')
    expect(workspaceMenu).not.toHaveTextContent('云启科技')

    await user.click(screen.getByRole('menuitem', { name: /真实关联企业/ }))
    expect(appStore.getState()).toBeDefined()
    expect(screen.getByRole('menu', { name: '用户菜单' })).toHaveTextContent('当前空间 · 真实关联企业')
    expect(screen.getByRole('menu', { name: '用户菜单' })).not.toHaveTextContent('人员管理')
    expect(screen.getByRole('status', { name: '当前空间' })).toHaveTextContent('真实关联企业')
    const enterpriseNavigation = screen.getByRole('navigation', { name: '控制台导航' })
    expect(enterpriseNavigation).toHaveTextContent('我的数据')
    expect(enterpriseNavigation).toHaveTextContent('调用记录')
    expect(enterpriseNavigation).not.toHaveTextContent('我的用量')
  })

  it('刷新后同步企业关系时保留已选择的企业空间', async () => {
    const appStore = createAppStore()
    saveAuthTokens({ status: 'succeeded', binding_required: false, access_token: 'workspace-access-token', refresh_token: 'workspace-refresh-token', refresh_expires_at: Date.UTC(2099, 0, 1) })
    window.localStorage.setItem('token-nx:user-front:v1', JSON.stringify({
      nickname: '测试用户',
      phone: '137****7000',
      avatar: 'H',
      activeWorkspaceId: 'enterprise-persisted',
      workspaces: [
        { id: 'personal', name: '个人空间', type: 'personal', role: 'owner' },
        { id: 'enterprise-persisted', name: '刷新后企业', type: 'enterprise', role: 'member' },
      ],
      apiKeys: [],
      usageRecords: [],
      playgroundSessions: [],
    }))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      msg: 'success',
      data: [{
        id: 'membership-persisted',
        enterprise_id: 'enterprise-persisted',
        enterprise_name: '刷新后企业',
        enterprise_code: 'PERSISTED-001',
        member_status: 'active',
        join_source: 'certification',
        roles: ['member'],
        owner: false,
        joined_at: '2026-07-30T08:00:00Z',
        version: 1,
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: { id: 'user-1', display_name: '测试用户', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' } })

    render(
      <MemoryRouter initialEntries={['/console/quickstart']}>
        <Provider store={appStore}>
          <AppStoreProvider><ConsoleLayout><span>页面内容</span></ConsoleLayout></AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('status', { name: '当前空间' })).toHaveTextContent('刷新后企业'))
    await userEvent.setup().click(screen.getByRole('button', { name: '打开用户菜单' }))
    expect(screen.getByRole('menu', { name: '用户菜单' })).toHaveTextContent('当前空间 · 刷新后企业')
    window.localStorage.removeItem('token-nx:user-front:v1')
  })

  it('退出登录后恢复未登录 Header', async () => {
    const user = userEvent.setup()
    const appStore = createAppStore()
    appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: { id: 'user-1', display_name: '测试用户', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' } })

    render(
      <MemoryRouter initialEntries={['/']}>
        <Provider store={appStore}>
          <AppStoreProvider><PublicHeader /></AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '打开用户菜单' }))
    await user.click(screen.getByRole('menuitem', { name: '退出登录' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument())
    expect(appStore.getState().auth.status).toBe('unauthenticated')
  })
})
