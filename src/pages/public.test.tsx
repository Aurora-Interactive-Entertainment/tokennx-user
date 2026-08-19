import '@/i18n'
import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppStoreProvider } from '@/data/app-state'
import { createAppStore } from '@/store'
import i18n from '@/i18n'
import { AboutPage, AppsPage, DocsPage, HomePage, LegalPage, ModelDetailPage, ModelsPublicPage, PricingPage, RankingsPage, StatusPage } from './public'

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

function renderPage(page: ReactNode, initialEntry: string): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Provider store={createAppStore()}>
        <AppStoreProvider>{page}</AppStoreProvider>
      </Provider>
    </MemoryRouter>,
  )
}

const DOCS_ROOT_ID = '01K00000000000000000000000'
const DOCS_DOCUMENT_ID = '01K00000000000000000000001'
const API_DOCS_ROOT_ID = '01K00000000000000000000002'
const API_DOCS_DIRECTORY_ID = '01K00000000000000000000003'
const API_DOCS_DOCUMENT_ID = '01K00000000000000000000004'

function renderDocsPage(initialEntry = '/docs'): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Provider store={createAppStore()}>
        <AppStoreProvider>
          <LocationProbe />
          <Routes>
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/docs/:publicId/:slug?" element={<DocsPage />} />
          </Routes>
        </AppStoreProvider>
      </Provider>
    </MemoryRouter>,
  )
}

function mockPublicDocs(markdown = '# 快速开始\n\n## 使用 Token NX API\n\n正文'): void {
  vi.mocked(globalThis.fetch).mockImplementation(async (input) => {
    const url = String(input)
    if (url.includes('/api/docs/tree')) return new Response(JSON.stringify({
      code: 0,
      msg: 'success',
      data: [
        { id: DOCS_ROOT_ID, parent_id: '', type: 'directory', slug: 'guide', title: '文档' },
        { id: DOCS_DOCUMENT_ID, parent_id: DOCS_ROOT_ID, type: 'document', slug: 'quick-start', title: '快速开始' },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (url.includes(`/api/docs/${DOCS_DOCUMENT_ID}`)) return new Response(JSON.stringify({
      code: 0,
      msg: 'success',
      data: { id: DOCS_DOCUMENT_ID, slug: 'quick-start', title: '快速开始', content_markdown: markdown, updated_at: 1786406400000 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify({ code: 0, msg: 'success', data: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
}

function mockRankings(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.includes('/api/homepage/model-usage/leaderboard')) return new Response(JSON.stringify({
      code: 0,
      msg: 'success',
      data: {
        period: url.includes('period=month') ? 'month' : 'day',
        started_at: Date.UTC(2026, 7, 13),
        ended_at: Date.UTC(2026, 7, 13, 8),
        previous_from: Date.UTC(2026, 7, 12),
        previous_to: Date.UTC(2026, 7, 13),
        items: [
          { rank: 1, code: 'model-a', name: '模型 A', total_tokens: 120000, request_count: 32, previous_tokens: 100000, change_rate: 20 },
          { rank: 2, code: 'model-b', name: '模型 B', total_tokens: 80000, request_count: 24, previous_tokens: 0, change_rate: null },
          { rank: 3, code: 'model-c', name: '模型 C', total_tokens: 40000, request_count: 12, previous_tokens: 50000, change_rate: -20 },
        ],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (url.includes('/api/homepage/model-usage/recent')) return new Response(JSON.stringify({
      code: 0,
      msg: 'success',
      data: {
        weeks: ['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30', '2026-04-06'],
        items: [
          { rank: 1, code: 'model-a', name: '模型 A', total_tokens: 120000, request_count: 32, weekly_usage: [{ week_start: 1773014400000, total_tokens: 50000, request_count: 12 }, { week_start: 1775433600000, total_tokens: 70000, request_count: 20 }] },
          { rank: 2, code: 'model-b', name: '模型 B', total_tokens: 80000, request_count: 24, weekly_usage: [{ week_start: 1773014400000, total_tokens: 30000, request_count: 10 }, { week_start: 1775433600000, total_tokens: 50000, request_count: 14 }] },
        ],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify({ code: 0, msg: 'success', data: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
}

describe('公开模型页面', () => {
  beforeEach(() => {
    void i18n.changeLanguage('zh-CN')
    window.localStorage.clear()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      msg: 'success',
      data: { cards: [], promotion_models: [], ad_slots: [], news: [], partners: [] },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  })

  afterEach(() => vi.restoreAllMocks())

  it.each([
    ['模型页', '/models', <ModelsPublicPage />],
    ['排名页', '/rankings', <RankingsPage />],
    ['应用页', '/apps', <AppsPage />],
    ['文档页', '/docs', <DocsPage />],
    ['价格页', '/pricing', <PricingPage />],
    ['状态页', '/status', <StatusPage />],
    ['关于页', '/about', <AboutPage />],
    ['法律页', '/terms', <LegalPage kind="terms" />],
  ])('%s 复用首页统一页脚结构', (_name, path, page) => {
    renderPage(page, path)

    expect(document.querySelectorAll('.public-footer')).toHaveLength(1)
    expect(document.querySelector('.public-footer')).toHaveClass('public-footer--manuscript')
    expect(document.querySelectorAll('.manuscript-footer-nav .public-footer-nav-group')).toHaveLength(4)
    expect(document.querySelector('.public-footer-nav-group--extra')).toBeNull()
    expect(document.querySelectorAll('.manuscript-footer-qr-row .public-footer-qr')).toHaveLength(2)
  })

  it('模型目录和首页促销模型链接使用模型别名', () => {
    renderPage(<ModelsPublicPage />, '/models')

    expect(screen.getByRole('link', { name: 'DeepSeek V3' })).toHaveAttribute('href', '/models/deepseek-public')
    expect(screen.queryByText('deepseek-chat')).toBeNull()
  })

  it('模型详情显示别名，并将在线测试和 API 接入跳转参数规范为别名', () => {
    render(
      <MemoryRouter initialEntries={['/models/deepseek-chat']}>
        <Provider store={createAppStore()}>
          <AppStoreProvider>
            <LocationProbe />
            <Routes><Route path="/models/:modelId" element={<ModelDetailPage />} /></Routes>
          </AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    expect(screen.getByText('模型别名：deepseek-public')).toBeInTheDocument()
    expect(screen.queryByText('deepseek-chat')).toBeNull()
    expect(screen.getByRole('link', { name: '登录后在线测试' })).toHaveAttribute('href', '/login?return=%2Fconsole%2Fplayground%3Fmodel%3Ddeepseek-public')
    expect(screen.getByRole('link', { name: '登录后 API 接入' })).toHaveAttribute('href', '/login?return=%2Fconsole%2Fapi-keys%3Fmodel%3Ddeepseek-public')

    return waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/models/deepseek-public'))
  })

  it('公开文档示例使用模型别名', () => {
    mockPublicDocs('# 快速开始\n\n## 使用 Token NX API\n\n正文')
    renderDocsPage(`/docs/${DOCS_DOCUMENT_ID}/old-slug`)

    return waitFor(() => {
      expect(screen.getAllByRole('link', { name: '文档' }).find((link) => link.classList.contains('is-active'))).toBeInTheDocument()
      expect(screen.getAllByRole('link', { name: '快速开始' }).find((link) => link.classList.contains('is-active'))).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '快速开始' })).toBeInTheDocument()
      expect(screen.getByRole('complementary', { name: '本页目录' })).toHaveTextContent('使用 Token NX API')
      expect(screen.getByTestId('location')).toHaveTextContent(`/docs/${DOCS_DOCUMENT_ID}/quick-start`)
    })
  })

  it('可以切换到多级子目录下的文档', async () => {
    const user = userEvent.setup()
    vi.mocked(globalThis.fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/api/docs/tree')) return new Response(JSON.stringify({
        code: 0,
        msg: 'success',
        data: [
          { id: DOCS_ROOT_ID, parent_id: '', type: 'directory', slug: 'guide', title: '使用指南' },
          { id: API_DOCS_ROOT_ID, parent_id: '', type: 'directory', slug: 'api', title: 'API 文档' },
          { id: DOCS_DOCUMENT_ID, parent_id: DOCS_ROOT_ID, type: 'document', slug: 'quick-start', title: '开始使用' },
          { id: API_DOCS_DIRECTORY_ID, parent_id: API_DOCS_ROOT_ID, type: 'directory', slug: 'api-directory', title: 'API 子目录' },
          { id: API_DOCS_DOCUMENT_ID, parent_id: API_DOCS_DIRECTORY_ID, type: 'document', slug: 'api-document', title: 'API 接口' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      const isApiDocument = url.includes(`/api/docs/${API_DOCS_DOCUMENT_ID}`)
      return new Response(JSON.stringify({
        code: 0,
        msg: 'success',
        data: isApiDocument
          ? { id: API_DOCS_DOCUMENT_ID, slug: 'api-document', title: 'API 接口', content_markdown: '# API 接口\n\n正文', updated_at: 1786406400000 }
          : { id: DOCS_DOCUMENT_ID, slug: 'quick-start', title: '开始使用', content_markdown: '# 开始使用\n\n正文', updated_at: 1786406400000 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    renderDocsPage(`/docs/${DOCS_DOCUMENT_ID}/quick-start`)

    const apiDocsLink = await screen.findByRole('link', { name: 'API 文档' })
    expect(apiDocsLink).toHaveAttribute('href', `/docs/${API_DOCS_DOCUMENT_ID}/api-document`)
    await user.click(apiDocsLink)

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(`/docs/${API_DOCS_DOCUMENT_ID}/api-document`)
      expect(apiDocsLink).toHaveClass('is-active')
      expect(document.querySelector('.docs-sidebar-directory')).not.toBeNull()
      expect(document.querySelector('.docs-sidebar-document.is-active')).not.toBeNull()
      expect(screen.getByRole('heading', { name: 'API 接口' })).toBeInTheDocument()
    })

    const apiDirectory = screen.getByRole('button', { name: '收起 API 子目录' })
    expect(apiDirectory).toHaveAttribute('aria-expanded', 'true')
    await user.click(apiDirectory)
    expect(screen.getByRole('button', { name: '展开 API 子目录' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('应用页使用接口返回的智能体内容和每周趋势', async () => {
    const tools = [
      { id: 'tool-codex', rank: 1, name: 'Codex', description: 'OpenAI Codex 命令行和桌面客户端', logo_url: 'https://cdn.example.com/codex.png', request_count: 21, total_tokens: 3200000 },
      { id: 'tool-claude', rank: 2, name: 'Claude Code', description: 'Anthropic Claude Code 命令行客户端', logo_url: 'https://cdn.example.com/claude.png', request_count: 18, total_tokens: 2400000 },
      { id: 'tool-gemini', rank: 3, name: 'Gemini CLI', description: 'Google Gemini 命令行客户端', logo_url: 'https://cdn.example.com/gemini.png', request_count: 13, total_tokens: 1800000 },
      { id: 'tool-workbody', rank: 4, name: 'workbody', description: '腾讯 code agent', logo_url: 'https://cdn.example.com/workbody.png', request_count: 8, total_tokens: 900000 },
      { id: 'tool-trae', rank: 5, name: 'trae', description: '字节跳动 code agent', logo_url: 'https://cdn.example.com/trae.png', request_count: 5, total_tokens: 400000 },
    ]
    vi.mocked(globalThis.fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/api/homepage/tool-usage/leaderboard')) return new Response(JSON.stringify({ code: 0, msg: 'success', data: { period: url.includes('period=year') ? 'year' : 'day', items: tools } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.includes('/api/homepage/tool-usage/clients')) return new Response(JSON.stringify({
        code: 0,
        msg: 'success',
        data: {
          started_at: Date.UTC(2026, 6, 27),
          ended_at: Date.UTC(2026, 7, 10),
          weeks: ['2026-07-27', '2026-08-03', '2026-08-10'],
          items: tools.slice(0, 2).map((item) => ({ ...item, total_count: item.request_count, weekly_usage: [
            { week_start: Date.UTC(2026, 6, 27), request_count: 3, total_tokens: 300000 },
            { week_start: Date.UTC(2026, 7, 3), request_count: 4, total_tokens: 400000 },
            { week_start: Date.UTC(2026, 7, 10), request_count: 5, total_tokens: 500000 },
          ] })),
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({ code: 0, msg: 'success', data: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    renderPage(<AppsPage />, '/apps')

    expect(screen.getByRole('heading', { name: '最受欢迎的 AI 工具排名' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Token NX 平台智能体客户端整体使用情况' })).toBeInTheDocument()
    await waitFor(() => expect(document.querySelectorAll('.apps-popular-card')).toHaveLength(4))
    expect(document.querySelectorAll('.apps-ranking-row')).toHaveLength(5)
    expect(screen.getAllByText('Codex')).toHaveLength(2)
    expect(screen.getAllByText('OpenAI Codex 命令行和桌面客户端')).toHaveLength(2)
    expect(document.querySelector('.apps-popular-card img')).toHaveAttribute('src', 'https://cdn.example.com/codex.png')
    expect(screen.queryByText('Hermes Agent')).toBeNull()
    expect(screen.getByRole('img', { name: '过去 6 个月智能体客户端每周 Token 使用量堆叠柱状图' })).toBeInTheDocument()
    const periodSelect = screen.getByRole('combobox', { name: '排行榜时间范围' })
    expect(periodSelect).toHaveAttribute('aria-expanded', 'false')
    expect(periodSelect).toHaveTextContent('今天')
  })

  it('排名页展示接口返回的完整榜单并默认查询今天', async () => {
    const fetchMock = mockRankings()
    renderPage(<RankingsPage />, '/rankings')

    expect(screen.getByRole('heading', { name: 'TOP10 模型排名' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '大模型排行榜' })).toBeInTheDocument()
    expect(await screen.findByLabelText('图表图例')).toBeInTheDocument()
    await waitFor(() => expect(document.querySelectorAll('.ranking-model-row')).toHaveLength(3))
    expect(screen.getByText('↑ 20.00%')).toHaveClass('is-up')
    expect(screen.getByText('↓ 20.00%')).toHaveClass('is-down')
    expect(screen.getByText('暂无对比数据')).toHaveClass('is-flat')
    const periodSelect = screen.getByRole('combobox', { name: '查询周期' })
    expect(periodSelect).toHaveAttribute('aria-expanded', 'false')
    expect(periodSelect).toHaveTextContent('今天')
    expect(screen.queryByText('热门话题')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /展示更多/ })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some((call: unknown[]) => String(call[0]).includes('period=day'))).toBe(true)
  })

  it('应用页切换英文后翻译标题、说明、筛选器和排行内容', async () => {
    await i18n.changeLanguage('en-US')
    renderPage(<AppsPage />, '/apps')

    expect(screen.getByRole('heading', { name: 'Most Popular AI Tools' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Overall Token NX Agent Client Usage' })).toBeInTheDocument()
    const periodSelect = screen.getByRole('combobox', { name: 'Leaderboard time range' })
    expect(periodSelect).toHaveAttribute('aria-expanded', 'false')
    expect(periodSelect).toHaveTextContent('Today')
    expect(screen.queryByText('Hermes Agent')).toBeNull()
  })

  it('排名页切换英文后翻译页签、目录、标题和筛选器', async () => {
    await i18n.changeLanguage('en-US')
    mockRankings()
    renderPage(<RankingsPage />, '/rankings')

    expect(screen.getByRole('navigation', { name: 'Model types' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Rankings navigation' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Top 10 Model Rankings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Large Model Leaderboard' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Chart legend')).toBeInTheDocument()
    const periodSelect = screen.getByRole('combobox', { name: 'Query period' })
    expect(periodSelect).toHaveAttribute('aria-expanded', 'false')
    expect(periodSelect).toHaveTextContent('Today')
  })

  it('文档页切换英文后翻译产品导航、目录和正文固定文案', async () => {
    await i18n.changeLanguage('en-US')
    mockPublicDocs('# Quickstart\n\n## Using the API\n\nEnglish content')
    renderDocsPage(`/docs/${DOCS_DOCUMENT_ID}/quick-start`)

    expect(screen.getByRole('navigation', { name: 'Documentation categories' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Documentation navigation' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Quickstart' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'On this page navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy page' })).toBeInTheDocument()
  })

  it('首页促销模型链接不使用内部模型 code', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      code: 0,
      msg: 'success',
      data: {
        cards: [],
        promotion_models: [{ id: 'promotion-alias', kind: 'promotion_model', status: 'active', sort_order: 1, pinned: false, model_id: 'claude-sonnet-4', data: { discount_kind: 'half', translations: { 'zh-CN': { title: 'Claude Opus 4.8' } } } }],
        ad_slots: [],
        news: [],
        partners: [],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderPage(<HomePage />, '/')

    const promotionLinks = await screen.findAllByRole('link', { name: /Claude Opus 4\.8/ })
    expect(promotionLinks).toHaveLength(1)
    promotionLinks.forEach((link) => expect(link).toHaveAttribute('href', '/models/claude-public'))
  })

  it('首页接口成功返回空编排时使用默认优惠模型兜底', async () => {
    renderPage(<HomePage />, '/')

    expect(document.querySelector('.manuscript-feature-grid')).toHaveAttribute('aria-busy', 'true')
    expect(document.querySelectorAll('.manuscript-feature-card.manuscript-skeleton-card')).toHaveLength(3)
    expect(screen.queryByText('Claude Opus 4.8')).toBeNull()
    await waitFor(() => expect(document.querySelector('.manuscript-feature-grid')).not.toHaveAttribute('aria-busy'))
    expect(document.querySelectorAll('.manuscript-feature-card')).toHaveLength(0)
    expect(document.querySelectorAll('.manuscript-price-card')).toHaveLength(3)
    expect(document.querySelector('.manuscript-ad-slot')).toBeNull()
    expect(document.querySelector('.manuscript-partner-row')).toBeNull()
    expect(screen.getAllByText('Claude Opus 4.8')).toHaveLength(3)
  })

  it('首页优先渲染后台生效的卡片、优惠模型、广告位、置顶新闻和合作伙伴', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      code: 0,
      msg: 'success',
      data: {
        cards: [{ id: 'card-1', kind: 'card', status: 'active', sort_order: 1, pinned: false, data: { translations: { 'zh-CN': { title: '后台能力卡片', description: '后台描述', action_text: '进入能力', image_object_id: '01J00000000000000000000001', link_url: '/models' } } } }],
        promotion_models: [{
          id: 'promotion-1',
          kind: 'promotion_model',
          status: 'active',
          sort_order: 1,
          pinned: false,
          data: { discount_kind: 'custom', translations: { 'zh-CN': { title: '后台优惠模型' } } },
          model: {
            id: 'managed-model-1',
            alias: 'managed-model',
            name: 'managed-model',
            company: 'Managed AI',
            logo_url: 'https://cdn.example.com/managed-model.png',
            modality: 'text',
            prices: [
              { meter_kind: 'input_token', unit_price_yuan: '1.000000000000', unit_quantity: 1_000_000 },
              { meter_kind: 'output_token', unit_price_yuan: '6.000000000000', unit_quantity: 1_000_000 },
            ],
            availability: {
              rate: 80,
              hourly: [
                { hour_start: 1786946400000, rate: 0, sample_count: 1, success_count: 0 },
                { hour_start: 1786950000000, rate: 79, sample_count: 100, success_count: 79 },
                { hour_start: 1786953600000, rate: 80, sample_count: 100, success_count: 80 },
              ],
            },
          },
        }],
        ad_slots: [{ id: 'ad-1', kind: 'ad_slot', status: 'active', sort_order: 1, pinned: false, data: { translations: { 'zh-CN': { title: '后台广告位', image_object_id: '01J00000000000000000000002', link_url: '/pricing' } } } }],
        news: [
          { id: 'news-1', kind: 'news', status: 'active', sort_order: 1, pinned: false, updated_at: '2026-08-02T00:00:00Z', data: { translations: { 'zh-CN': { title: '未固定动态', summary: '不应优先展示' } } } },
          { id: 'news-2', kind: 'news', status: 'active', sort_order: 2, pinned: true, updated_at: '2026-08-03T00:00:00Z', data: { translations: { 'zh-CN': { title: '固定动态', summary: '后台新闻摘要' } } } },
        ],
        partners: [{ id: 'partner-1', kind: 'partner', status: 'active', sort_order: 1, pinned: false, data: { translations: { 'zh-CN': { name: '后台伙伴', logo_object_id: '01J00000000000000000000003', link_url: '/models' } } } }],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderPage(<HomePage />, '/')

    expect(document.querySelectorAll('.manuscript-feature-card.manuscript-skeleton-card')).toHaveLength(3)
    expect(document.querySelectorAll('.manuscript-price-card.manuscript-skeleton-card')).toHaveLength(3)
    expect(document.querySelector('.manuscript-promotion-skeleton-reward')).toBeInTheDocument()
    expect(document.querySelectorAll('.manuscript-partner-skeleton-row')).toHaveLength(2)
    expect(screen.queryByText('后台能力卡片')).toBeNull()
    await waitFor(() => expect(screen.getByText('后台能力卡片')).toBeInTheDocument())
    expect(document.querySelector('.manuscript-skeleton-card')).toBeNull()
    expect(screen.getByText('后台优惠模型')).toBeInTheDocument()
    expect(screen.getByText('后台优惠模型').closest('a')).toHaveAttribute('href', '/models/managed-model')
    const promotionCard = screen.getByText('后台优惠模型').closest('.manuscript-price-card')
    expect(promotionCard).toHaveTextContent('Managed AI')
    expect(promotionCard?.querySelector('.manuscript-price-model-logo img')).toHaveAttribute('src', 'https://cdn.example.com/managed-model.png')
    const promotionPrices = Array.from(promotionCard?.querySelectorAll('.manuscript-price-values strong') ?? []).map((element) => element.textContent)
    expect(promotionPrices[0]).toMatch(/^1/)
    expect(promotionPrices[1]).toMatch(/^6/)
    const availabilityBars = promotionCard?.querySelectorAll('.model-availability-bar') ?? []
    expect(availabilityBars).toHaveLength(3)
    expect(availabilityBars[0]).toHaveClass('is-danger')
    expect(availabilityBars[1]).toHaveClass('is-warning')
    expect(availabilityBars[2]).toHaveClass('is-healthy')
    expect(screen.getByText('固定动态')).toBeInTheDocument()
    expect(screen.getByText('固定动态').closest('a')).toHaveAttribute('href', '/news/news-2')
    expect(screen.queryByText('未固定动态')).toBeNull()
    expect(screen.getAllByText('后台伙伴').length).toBeGreaterThan(0)
    expect(document.querySelector('.manuscript-feature-image')).toHaveAttribute('src', '/api/homepage/assets/01J00000000000000000000001')
    expect(document.querySelector('.manuscript-feature-image')).toHaveAttribute('loading', 'eager')
    expect(document.querySelector('.manuscript-feature-image')).toHaveAttribute('fetchpriority', 'high')
    expect(screen.getByRole('img', { name: '后台广告位' })).toHaveAttribute('src', '/api/homepage/assets/01J00000000000000000000002')
    expect(document.querySelector('.manuscript-partner-image')).toHaveAttribute('src', '/api/homepage/assets/01J00000000000000000000003')
    expect(document.querySelectorAll('.manuscript-partner-row')).toHaveLength(1)
    expect(document.querySelector('.manuscript-partner-row')).toHaveClass('is-static', 'is-compact')
    expect(document.querySelectorAll('.manuscript-partner-grid a[data-copy="primary"]')).toHaveLength(1)
    expect(document.querySelector('.manuscript-partner-grid a[data-copy="duplicate"]')).toBeNull()
  })

  it('首页内容接口失败时停止骨架并允许重新加载', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('offline'))
    renderPage(<HomePage />, '/')

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('首页内容加载失败，请稍后重试'))
    expect(document.querySelector('.manuscript-feature-grid')).not.toHaveAttribute('aria-busy')
    expect(document.querySelectorAll('.manuscript-feature-card.manuscript-skeleton-card')).toHaveLength(0)
    expect(document.querySelectorAll('.semi-skeleton-active')).toHaveLength(0)
    expect(screen.getByRole('button', { name: '重新加载' })).toBeInTheDocument()
    expect(screen.queryByText('一个账户，统一访问所有顶级AI模型')).toBeNull()
    expect(screen.queryByText('后台能力卡片')).toBeNull()
  })

  it('英文环境渲染公开模型目录和模型动态字段', async () => {
    await i18n.changeLanguage('en-US')
    renderPage(<ModelsPublicPage />, '/models')

    expect(screen.getByRole('heading', { name: 'Deepseek V4 Pro' })).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'Featured model carousel' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(5)
    expect(screen.getByRole('heading', { name: 'Text generation' })).toBeInTheDocument()
    expect(screen.getAllByText('Input / M Tokens').length).toBeGreaterThan(0)
    expect(screen.queryByText('模型目录')).toBeNull()
  })

  it('英文环境渲染模型详情和价格摘要', async () => {
    await i18n.changeLanguage('en-US')
    render(
      <MemoryRouter initialEntries={['/models/dall-e-public']}>
        <Provider store={createAppStore()}>
          <AppStoreProvider>
            <Routes><Route path="/models/:modelId" element={<ModelDetailPage />} /></Routes>
          </AppStoreProvider>
        </Provider>
      </MemoryRouter>,
    )

    expect(screen.getByText('Model alias: dall-e-public')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Price comparison' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in for API access' })).toBeInTheDocument()
    expect(screen.getAllByText('Standard').length).toBeGreaterThan(0)
  })

  it('logo-only partners remain visible', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      code: 0,
      msg: 'success',
      data: {
        cards: [], promotion_models: [], ad_slots: [], news: [],
        partners: [{ id: 'logo-only-partner', kind: 'partner', status: 'active', sort_order: 1, pinned: false, data: { translations: { 'zh-CN': { logo_url: 'https://cdn.example.com/partner.png' } } } }],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderPage(<HomePage />, '/')
    await waitFor(() => expect(document.querySelector('.manuscript-partner-image')).toHaveAttribute('src', 'https://cdn.example.com/partner.png'))
  })
})
