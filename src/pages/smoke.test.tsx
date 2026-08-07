import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { Provider } from 'react-redux'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { AppStoreProvider } from '@/data/app-state'
import { createAppStore } from '@/store'
import { clearAuthTokens, getAccessToken } from '@/auth/token-storage'
import i18n from '@/i18n'
import { setThemeMode } from '@/theme'
import { AppLoadingScreen, LoginDialog, LoginRequiredAction } from '@/components/common'
import { MOCK_SUPPORT_REPLY_DELAY_MS } from '@/components/support-chat'
import { HomePage, LoginPage, ModelsPublicPage } from './public'

function apiResponse(data: unknown, status = 200, code = 0, msg = 'success'): Response {
  return new Response(JSON.stringify({ code, msg, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const authUser = {
  id: 'user-1',
  display_name: '测试用户',
  avatar_url: '',
  locale: 'zh-CN',
  timezone: 'Asia/Shanghai',
  status: 'active',
}

const authResult = {
  status: 'succeeded',
  binding_required: false,
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  access_expires_at: Date.UTC(2099, 0, 1, 0, 15),
  refresh_expires_at: Date.UTC(2099, 1, 1),
  user: authUser,
}

function renderLogin(returnPath: string) {
  return render(
    <MemoryRouter initialEntries={[`/login?return=${returnPath}`]}>
      <Provider store={createAppStore()}>
        <AppStoreProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<div>首页</div>} />
            <Route path="/console" element={<div>控制台首页</div>} />
            <Route path="/about" element={<div>关于页面</div>} />
          </Routes>
        </AppStoreProvider>
      </Provider>
    </MemoryRouter>,
  )
}

function LoginDialogHarness() {
  const [open, setOpen] = useState(true)
  return open ? <LoginDialog open={open} onClose={() => setOpen(false)} onSuccess={() => undefined} /> : <div>登录弹窗已关闭</div>
}

describe('页面主链冒烟场景', () => {
  beforeEach(() => window.localStorage.clear())
  beforeEach(() => window.sessionStorage.clear())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    void i18n.changeLanguage('zh-CN')
    setThemeMode('system')
  })

  it('公开首页严格展示手稿中的七段结构', () => {
    render(<MemoryRouter><Provider store={createAppStore()}><AppStoreProvider><HomePage /></AppStoreProvider></Provider></MemoryRouter>)
    expect(document.querySelector('.public-header')).toHaveClass('public-header--home')
    expect(document.querySelectorAll('.public-header .public-nav a.active')).toHaveLength(0)
    expect(document.querySelector('.header-trial-badge strong')).toHaveTextContent('7天试用')
    expect(document.querySelector('.header-trial-badge em')).toHaveTextContent('免费')
    expect(screen.getByText('7天试用')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看通知' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /一键接入百种模型/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '优惠模型' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '推广与资讯' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '合作伙伴' })).toBeInTheDocument()
    expect(document.querySelectorAll('.manuscript-feature-card.manuscript-skeleton-card')).toHaveLength(3)
    expect(document.querySelectorAll('.manuscript-price-card.manuscript-skeleton-card')).toHaveLength(3)
    expect(document.querySelector('.manuscript-promotion-skeleton-reward')).toBeInTheDocument()
    expect(document.querySelectorAll('.manuscript-partner-skeleton-row')).toHaveLength(2)
    expect(document.querySelectorAll('.manuscript-feature-card')).toHaveLength(3)
    expect(document.querySelector('.manuscript-silk-canvas')).toBeInstanceOf(HTMLCanvasElement)
    expect(document.querySelector('.manuscript-wave-bank')).toBeNull()
    expect(document.querySelectorAll('.manuscript-model-mosaic .model-logo')).toHaveLength(0)
    expect(document.querySelectorAll('.manuscript-model-mosaic-row')).toHaveLength(0)
    expect(document.querySelectorAll('.manuscript-model-mosaic-row.is-offset')).toHaveLength(0)
    expect(document.querySelectorAll('.manuscript-feature-copy h3')).toHaveLength(0)
    const featureActions = document.querySelectorAll('.manuscript-feature-copy > a')
    expect(featureActions).toHaveLength(0)
    expect(document.querySelectorAll('.manuscript-price-card')).toHaveLength(3)
    expect(document.querySelector('.manuscript-pricing')).not.toHaveTextContent('Claude Opus 4.8')
    expect(document.querySelectorAll('.semi-skeleton-active')).not.toHaveLength(0)
    expect(document.querySelectorAll('.semi-skeleton-image')).not.toHaveLength(0)
    expect(document.querySelectorAll('.semi-skeleton-title')).not.toHaveLength(0)
    expect(document.querySelectorAll('.semi-skeleton-paragraph')).not.toHaveLength(0)
    const rewardCard = document.querySelector('.manuscript-reward-card')
    expect(rewardCard).toHaveClass('manuscript-skeleton-card')
    expect(document.querySelector('.manuscript-ad-slot')).toBeNull()
    expect(document.querySelectorAll('.manuscript-news-card')).toHaveLength(2)
    expect(document.querySelectorAll('.manuscript-partner-row')).toHaveLength(0)
    expect(document.querySelectorAll('.manuscript-partner-grid a')).toHaveLength(0)
    expect(screen.queryByRole('heading', { name: '快速接入' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '接入流程' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '服务状态' })).not.toBeInTheDocument()
    expect(screen.getByText('安顺佳云灵犀智能科技有限公司')).toBeInTheDocument()
    expect(screen.getByAltText('Token NX 微信公众号临时二维码')).toBeInTheDocument()
  })

  it('首页登录按钮打开右侧登录面板并支持关闭', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Provider store={createAppStore()}><AppStoreProvider><HomePage /></AppStoreProvider></Provider></MemoryRouter>)

    await user.click(screen.getByRole('button', { name: '登录' }))
    const dialog = screen.getByRole('dialog', { name: '登录 Token NX' })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveClass('is-open')
    expect(dialog.parentElement).toBe(document.body)
    expect(document.querySelector('.login-drawer-backdrop')?.parentElement).toBe(document.body)
    expect(document.querySelector('.login-drawer-backdrop')).not.toHaveClass('is-closing')
    expect(document.body.style.overflow).toBe('hidden')
    expect(dialog.querySelector('.login-panel-logo')).not.toBeNull()
    expect(dialog.querySelector('.login-drawer-toolbar')).toBeNull()

    expect(dialog.querySelector('.login-drawer-close')).toBeNull()
    await user.click(document.querySelector<HTMLButtonElement>('.login-drawer-backdrop')!)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '登录 Token NX' })).not.toBeInTheDocument())
    expect(document.body.style.overflow).toBe('')
  })

  it('需要登录的公开入口复用登录弹窗并返回目标页面', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/auth/phone/code')) return apiResponse({ destination_masked: '138****8000', expires_at: '2099-01-01T00:05:00Z', retry_after_seconds: 60 })
      if (url.endsWith('/api/auth/phone/login')) return apiResponse(authResult)
      throw new Error(`unexpected request: ${url}`)
    })

    render(
      <MemoryRouter initialEntries={['/models']}>
        <Provider store={createAppStore()}>
          <AppStoreProvider>
            <LoginRequiredAction returnPath="/about">登录后继续</LoginRequiredAction>
            <Routes><Route path="/models" element={<div>模型目录</div>} /><Route path="/about" element={<div>关于页面</div>} /></Routes>
          </AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('link', { name: '登录后继续' }))
    expect(screen.getByRole('dialog', { name: '登录 Token NX' })).toHaveClass('is-open')
    await user.type(screen.getByLabelText('手机号'), '13800138000')
    await user.click(screen.getByRole('button', { name: '获取验证码' }))
    expect(await screen.findByText('验证码已发送至 138****8000')).toBeInTheDocument()
    await user.type(screen.getByLabelText('验证码'), '482915')
    await user.click(screen.getByRole('checkbox', { name: /我已阅读并同意/ }))
    await user.click(screen.getByRole('button', { name: '登录 / 注册' }))

    expect(await screen.findByText('关于页面')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '登录 Token NX' })).not.toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('首页客服浮窗打开聊天页面并支持点击空白关闭', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Provider store={createAppStore()}><AppStoreProvider><HomePage /></AppStoreProvider></Provider></MemoryRouter>)

    await user.click(screen.getByRole('button', { name: '打开客服' }))
    const supportDialog = await screen.findByRole('dialog', { name: '联系客服' })
    expect(supportDialog).toHaveTextContent('Token NX 客服')
    expect(supportDialog).toHaveTextContent('客服在线')
    expect(screen.getByRole('textbox', { name: '输入消息' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '关闭客服' })).toBeInTheDocument()
    await user.click(document.body)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '联系客服' })).not.toBeInTheDocument())
  })

  it('登录页也保留固定客服入口', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Provider store={createAppStore()}>
          <AppStoreProvider><LoginPage /></AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: '打开客服' })).toBeInTheDocument()
  })

  it('客服聊天支持输入并只由 mock 客服自动回复', () => {
    vi.useFakeTimers()
    render(<MemoryRouter><Provider store={createAppStore()}><AppStoreProvider><HomePage /></AppStoreProvider></Provider></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: '打开客服' }))
    const input = screen.getByRole('textbox', { name: '输入消息' })
    fireEvent.change(input, { target: { value: '价格怎么查看' } })
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }))

    expect(screen.getByText('价格怎么查看')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '客服正在输入' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送消息' })).toBeDisabled()

    act(() => {
      vi.advanceTimersByTime(MOCK_SUPPORT_REPLY_DELAY_MS)
    })

    expect(screen.queryByRole('status', { name: '客服正在输入' })).not.toBeInTheDocument()
    expect(screen.getByText(/价格页/)).toBeInTheDocument()
    expect(input).toHaveValue('')
  })

  it('加载层只显示主题感知的品牌 Logo 呼吸灯', () => {
    render(<AppLoadingScreen label="正在加载" />)

    expect(screen.getByRole('status', { name: '正在加载' })).toBeInTheDocument()
    expect(document.querySelector('.app-loading-screen__logo-shell .brand-logo-image')).toBeInTheDocument()
    expect(document.querySelector('.app-loading-screen__mark')).toBeNull()
    expect(document.querySelector('.app-loading-screen__bar')).toBeNull()
  })

  it('首页优惠模型加载失败时持续显示 active 骨架', () => {
    render(<MemoryRouter><Provider store={createAppStore()}><AppStoreProvider><HomePage /></AppStoreProvider></Provider></MemoryRouter>)
    expect(document.querySelectorAll('.manuscript-price-card.manuscript-skeleton-card')).toHaveLength(3)
    expect(document.querySelectorAll('.manuscript-price-grid .semi-skeleton-active')).toHaveLength(3)
    expect(document.querySelectorAll('.manuscript-price-grid .semi-skeleton-image')).not.toHaveLength(0)
    expect(document.querySelectorAll('.manuscript-price-grid .semi-skeleton-title')).not.toHaveLength(0)
    expect(document.querySelectorAll('.manuscript-price-grid .semi-skeleton-paragraph')).not.toHaveLength(0)
    expect(document.querySelectorAll('.manuscript-price-availability-bar')).toHaveLength(0)
  })

  it('首页计分板先显示零值并每分钟轮询接口更新翻页', async () => {
    vi.useFakeTimers()
    let statsRequestCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (!String(input).endsWith('/api/homepage/stats')) throw new Error('offline')
      statsRequestCount += 1
      return apiResponse(statsRequestCount === 1
        ? { token_total: 11_820_495, api_call_total: 800 }
        : { token_total: 12_999_999, api_call_total: 900 })
    })
    render(<MemoryRouter><Provider store={createAppStore()}><AppStoreProvider><HomePage /></AppStoreProvider></Provider></MemoryRouter>)

    const tokenStat = screen.getByRole('listitem', { name: /Token处理量/ })
    const apiStat = screen.getByRole('listitem', { name: /API调用次数/ })
    expect(tokenStat.querySelector('.manuscript-scoreboard-unit')).toHaveTextContent('Token处理量（百万）')
    expect(apiStat.querySelector('.manuscript-scoreboard-unit')).toHaveTextContent('API调用次数')
    expect(apiStat.querySelector('.manuscript-scoreboard-unit')).not.toHaveTextContent('万')
    expect(tokenStat).toHaveAttribute('aria-label', 'Token处理量（百万） 00000000')
    expect(apiStat).toHaveAttribute('aria-label', 'API调用次数 00000000')
    const tokenDigits = [...tokenStat.querySelectorAll<HTMLElement>('.manuscript-scoreboard-digit')]
    expect(tokenDigits[0]).toHaveAttribute('style', '--scoreboard-delay: 490ms;')
    expect(tokenDigits[tokenDigits.length - 1]).toHaveAttribute('style', '--scoreboard-delay: 0ms;')

    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(statsRequestCount).toBe(1)
    act(() => { vi.advanceTimersByTime(1_600) })
    expect(tokenStat).toHaveAttribute('aria-label', 'Token处理量（百万） 00000011')
    expect(apiStat).toHaveAttribute('aria-label', 'API调用次数 00000800')
    expect(tokenDigits.map((digit) => digit.dataset.digit).join('')).toBe('00000011')
    expect([...apiStat.querySelectorAll<HTMLElement>('.manuscript-scoreboard-digit')].map((digit) => digit.dataset.digit).join('')).toBe('00000800')
    expect(tokenDigits[6].querySelector('.manuscript-scoreboard-face--base-top b')).toHaveTextContent('0')
    expect(tokenDigits[6].querySelector('.manuscript-scoreboard-face--next-top b')).toHaveTextContent('1')
    expect(tokenDigits[tokenDigits.length - 1].querySelector('.manuscript-scoreboard-face--base-top b')).toHaveTextContent('0')
    expect(tokenDigits[tokenDigits.length - 1].querySelector('.manuscript-scoreboard-face--next-top b')).toHaveTextContent('1')

    await act(async () => { await vi.advanceTimersByTimeAsync(58_399) })
    expect(statsRequestCount).toBe(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(statsRequestCount).toBe(2)
    act(() => { vi.advanceTimersByTime(1_600) })
    expect(tokenStat).toHaveAttribute('aria-label', 'Token处理量（百万） 00000012')
    expect(apiStat).toHaveAttribute('aria-label', 'API调用次数 00000900')
    expect(tokenDigits.map((digit) => digit.dataset.digit).join('')).toBe('00000012')
  })

  it('首页两组计分板的初次接口数据翻牌完成后才通知应用结束加载', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (!String(input).endsWith('/api/homepage/stats')) throw new Error('offline')
      return apiResponse({ token_total: 11_820_495, api_call_total: 800 })
    })
    const onInitialScoreboardReady = vi.fn()
    render(<MemoryRouter><Provider store={createAppStore()}><AppStoreProvider><HomePage onInitialScoreboardReady={onInitialScoreboardReady} /></AppStoreProvider></Provider></MemoryRouter>)

    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    act(() => { vi.advanceTimersByTime(1_600) })
    expect(onInitialScoreboardReady).not.toHaveBeenCalled()

    const bottomFlaps = [...document.querySelectorAll<HTMLElement>('.manuscript-scoreboard-flap--bottom')]
    expect(bottomFlaps).toHaveLength(16)
    bottomFlaps.forEach((flap) => fireEvent(flap, new Event('webkitAnimationEnd', { bubbles: true })))
    expect(onInitialScoreboardReady).toHaveBeenCalledTimes(1)
  })

  it('公开首页可以切换英文并保持语言入口', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Provider store={createAppStore()}><AppStoreProvider><HomePage /></AppStoreProvider></Provider></MemoryRouter>)
    const languageButton = screen.getByRole('button', { name: '切换语言' })
    expect(languageButton).not.toHaveClass('is-english')
    expect(languageButton.querySelector('.language-switcher-option--en')).toHaveTextContent('EN')
    expect(languageButton.querySelector('.language-switcher-option--zh')).toHaveTextContent('中')
    expect(languageButton.querySelector('.language-switcher-thumb')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '切换语言' }))
    expect(await screen.findByRole('heading', { name: /Connect to 100\+ models/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Featured models' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explore models' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Switch language' })).toBeInTheDocument()
    expect(languageButton).toHaveClass('is-english')
    expect(languageButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('主题按钮按跟随系统、亮色、暗色循环并同步根节点主题', async () => {
    const user = userEvent.setup()
    setThemeMode('system')
    render(<MemoryRouter><Provider store={createAppStore()}><AppStoreProvider><HomePage /></AppStoreProvider></Provider></MemoryRouter>)
    const themeButton = screen.getByRole('button', { name: '切换主题 · 跟随系统' })
    expect(themeButton.querySelector('.semi-icon-desktop')).toBeInTheDocument()
    await user.click(themeButton)
    expect(screen.getByRole('button', { name: '切换主题 · 亮色主题' }).querySelector('.semi-icon-sun_stroked')).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    await user.click(screen.getByRole('button', { name: '切换主题 · 亮色主题' }))
    expect(screen.getByRole('button', { name: '切换主题 · 暗色主题' })).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    await user.click(screen.getByRole('button', { name: '切换主题 · 暗色主题' }))
    expect(screen.getByRole('button', { name: '切换主题 · 跟随系统' })).toBeInTheDocument()
  })

  it('手机号登录未同意协议时保持可交互并阻止提交', async () => {
    const user = userEvent.setup()
    renderLogin('/about')
    const loginButton = screen.getByRole('button', { name: '登录 / 注册' })
    expect(loginButton).toBeEnabled()
    await user.click(loginButton)
    expect(screen.getByRole('status')).toHaveTextContent('请先勾选并同意用户协议和隐私政策')
    await user.click(screen.getByRole('checkbox', { name: /我已阅读并同意/ }))
    expect(loginButton).toBeEnabled()
  })

  it('模型目录可以通过搜索收敛结果', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Provider store={createAppStore()}><AppStoreProvider><ModelsPublicPage /></AppStoreProvider></Provider></MemoryRouter>)
    expect(document.querySelector('.public-models-results-head')).toHaveTextContent('18 个模型')
    const search = screen.getByRole('searchbox', { name: '搜索模型' })
    await user.type(search, 'DeepSeek')
    expect(document.querySelector('.public-models-results-head')).toHaveTextContent('1 个模型')
    expect(screen.getByRole('link', { name: 'DeepSeek V3' })).toBeInTheDocument()
  })

  it('模型目录可以按类型筛选并清除筛选', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Provider store={createAppStore()}><AppStoreProvider><ModelsPublicPage /></AppStoreProvider></Provider></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: /图像\s*3/ }))
    expect(screen.getByRole('heading', { name: '可用模型' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('3 个模型')
    await user.click(screen.getByRole('button', { name: '清除筛选' }))
    expect(screen.getByRole('status')).toHaveTextContent('18 个模型')
  })

  it('登录页默认只显示手机号登录并校验号码格式', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse({ destination_masked: '+1 415****2671', expires_at: '2099-01-01T00:05:00Z', retry_after_seconds: 5 }))

    renderLogin('/about')
    expect(screen.getByRole('heading', { name: '手机号登录' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '国家或地区区号' })).toHaveValue('+86')
    expect(document.querySelector('.phone-prefix-value')).toHaveTextContent('+86')
    expect(document.querySelector('.phone-prefix-value')).not.toHaveTextContent('中国')
    expect(document.querySelector('.code-input-wrapper')).toContainElement(screen.getByLabelText('验证码'))
    expect(document.querySelector('.code-input-wrapper')).toContainElement(screen.getByRole('button', { name: '获取验证码' }))
    expect(screen.getByRole('button', { name: '使用微信登录' }).querySelector('img')).toHaveAttribute('src', expect.stringContaining('wechat.png'))
    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '获取验证码' }))
    expect(screen.getByRole('status')).toHaveTextContent('请输入正确的手机号')
    await user.type(screen.getByLabelText('手机号'), '12345678901')
    await user.click(screen.getByRole('button', { name: '获取验证码' }))
    expect(fetchMock).not.toHaveBeenCalled()
    await user.clear(screen.getByLabelText('手机号'))
    await user.selectOptions(screen.getByRole('combobox', { name: '国家或地区区号' }), '+1')
    await user.type(screen.getByLabelText('手机号'), '4155552671')
    await user.click(screen.getByRole('button', { name: '获取验证码' }))
    expect(await screen.findByText('验证码已发送至 +1 415****2671')).toBeInTheDocument()
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ destination: '4155552671', country_code: '+1' })
  })

  it('登录页手机号登录仍会调用短信验证码和登录接口', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/auth/phone/code')) return apiResponse({ destination_masked: '138****8000', expires_at: '2099-01-01T00:05:00Z', retry_after_seconds: 60 })
      if (url.endsWith('/api/auth/phone/login')) return apiResponse(authResult)
      throw new Error(`unexpected request: ${url}`)
    })

    renderLogin('/about')
    await user.type(screen.getByLabelText('手机号'), '13800138000')
    await user.click(screen.getByRole('button', { name: '获取验证码' }))
    expect(await screen.findByText('验证码已发送至 138****8000')).toBeInTheDocument()
    await user.type(screen.getByLabelText('验证码'), '482915')
    await user.click(screen.getByRole('checkbox', { name: /我已阅读并同意/ }))
    await user.click(screen.getByRole('button', { name: '登录 / 注册' }))
    expect(await screen.findByText('关于页面')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ destination: '13800138000', country_code: '+86' })
  })

  it('登录验证失败后清理会话并返回首页', async () => {
    const user = userEvent.setup()
    clearAuthTokens()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/auth/phone/login')) return apiResponse(null, 401, 110001, '认证信息无效')
      throw new Error(`unexpected request: ${url}`)
    })

    renderLogin('/about')
    await user.type(screen.getByLabelText('手机号'), '13800138000')
    await user.type(screen.getByLabelText('验证码'), '482915')
    await user.click(screen.getByRole('checkbox', { name: /我已阅读并同意/ }))
    await user.click(screen.getByRole('button', { name: '登录 / 注册' }))

    expect(await screen.findByText('首页')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getAccessToken()).toBeNull()
  })

  it('登录弹窗认证失败后关闭弹窗并返回首页', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/auth/phone/login')) return apiResponse(null, 401, 110001, '认证信息无效')
      throw new Error(`unexpected request: ${url}`)
    })

    render(<MemoryRouter initialEntries={['/']}><Provider store={createAppStore()}><AppStoreProvider><LoginDialogHarness /></AppStoreProvider></Provider></MemoryRouter>)
    await user.type(screen.getByLabelText('手机号'), '13800138000')
    await user.type(screen.getByLabelText('验证码'), '482915')
    await user.click(screen.getByRole('checkbox', { name: /我已阅读并同意/ }))
    await user.click(screen.getByRole('button', { name: '登录 / 注册' }))

    expect(await screen.findByText('登录弹窗已关闭')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('微信扫码成功后会轮询状态并续接到控制台', async () => {
    const user = userEvent.setup()
    const openMock = vi.spyOn(window, 'open').mockReturnValue(null)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/auth/wechat/qr')) return apiResponse({ state: 'wechat-state', authorize_url: 'https://open.weixin.qq.com/connect/qrconnect?state=wechat-state', expires_at: '2099-01-01T00:05:00Z' })
      if (url.includes('/api/auth/wechat/status?state=wechat-state')) return apiResponse({ status: 'ready', result: authResult })
      throw new Error(`unexpected request: ${url}`)
    })

    renderLogin('/console')
    await user.click(screen.getByRole('button', { name: '使用微信登录' }))
    expect(screen.queryByText(/本地演示|演示验证码|模拟扫码|占位二维码|演示占位/)).not.toBeInTheDocument()
    expect(await screen.findByText('控制台首页')).toBeInTheDocument()
    expect(openMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('微信二维码接口返回无法识别的响应时展示红色错误并允许重试', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not-json', { status: 200, headers: { 'Content-Type': 'application/json' } }))

    renderLogin('/console')
    await user.click(screen.getByRole('button', { name: '使用微信登录' }))

    const errorStatus = await screen.findByText('服务返回了无法识别的响应')
    expect(errorStatus).toHaveClass('wechat-status', 'is-error')
    expect(screen.getByRole('button', { name: '重新获取二维码' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '返回手机号登录' })).toBeEnabled()
  })

  it('首次微信登录会先绑定手机号再进入控制台', async () => {
    const user = userEvent.setup()
    const bindingResult = { ...authResult, access_token: 'binding-access', refresh_token: 'binding-refresh' }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/auth/wechat/qr')) return apiResponse({ state: 'binding-state', authorize_url: 'https://open.weixin.qq.com/connect/qrconnect?state=binding-state', expires_at: '2099-01-01T00:05:00Z' })
      if (url.includes('/api/auth/wechat/status?state=binding-state')) return apiResponse({ status: 'ready', result: { status: 'pending_binding', binding_required: true, binding_ticket: 'binding-ticket' } })
      if (url.endsWith('/api/auth/bind-phone/code')) return apiResponse({ destination_masked: '139****0000', expires_at: '2099-01-01T00:05:00Z', retry_after_seconds: 60 })
      if (url.endsWith('/api/auth/bind-phone')) return apiResponse(bindingResult)
      throw new Error(`unexpected request: ${url}`)
    })

    renderLogin('/console')
    await user.click(screen.getByRole('button', { name: '使用微信登录' }))
    expect(await screen.findByRole('heading', { name: '绑定手机号' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('手机号'), '13900139000')
    await user.click(screen.getByRole('button', { name: '获取验证码' }))
    expect(await screen.findByText('验证码已发送至 139****0000')).toBeInTheDocument()
    await user.type(screen.getByLabelText('验证码'), '731204')
    await user.click(screen.getByRole('checkbox', { name: /我已阅读并同意/ }))
    await user.click(screen.getByRole('button', { name: '绑定并登录' }))
    expect(await screen.findByText('控制台首页')).toBeInTheDocument()
  })
})
