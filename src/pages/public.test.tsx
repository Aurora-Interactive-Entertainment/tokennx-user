import '@/i18n'
import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppStoreProvider } from '@/data/app-state'
import { createAppStore } from '@/store'
import i18n from '@/i18n'
import { DocsPage, HomePage, ModelDetailPage, ModelsPublicPage } from './public'

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
    renderPage(<DocsPage />, '/docs')

    expect(screen.getByText(/"model":"deepseek-public"/)).toBeInTheDocument()
    expect(screen.queryByText(/deepseek-chat/)).toBeNull()
  })

  it('首页促销模型链接不使用内部模型 code', () => {
    renderPage(<HomePage />, '/')

    const promotionLinks = screen.getAllByRole('link', { name: /Claude Opus 4\.8/ })
    expect(promotionLinks).toHaveLength(3)
    promotionLinks.forEach((link) => expect(link).toHaveAttribute('href', '/models/claude-public'))
  })

  it('首页优先渲染后台生效的卡片、优惠模型、广告位、置顶新闻和合作伙伴', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      code: 0,
      msg: 'success',
      data: {
        cards: [{ id: 'card-1', kind: 'card', status: 'active', sort_order: 1, pinned: false, data: { translations: { 'zh-CN': { title: '后台能力卡片', description: '后台描述', action_text: '进入能力', image_object_id: '01J00000000000000000000001', link_url: '/models' } } } }],
        promotion_models: [{ id: 'promotion-1', kind: 'promotion_model', status: 'active', sort_order: 1, pinned: false, model_id: 'deepseek-public', data: { discount_kind: 'custom', translations: { 'zh-CN': { title: '后台优惠模型' } } } }],
        ad_slots: [{ id: 'ad-1', kind: 'ad_slot', status: 'active', sort_order: 1, pinned: false, data: { translations: { 'zh-CN': { title: '后台广告位', image_object_id: '01J00000000000000000000002', link_url: '/pricing' } } } }],
        news: [
          { id: 'news-1', kind: 'news', status: 'active', sort_order: 1, pinned: false, updated_at: '2026-08-02T00:00:00Z', data: { translations: { 'zh-CN': { title: '未固定动态', summary: '不应优先展示' } } } },
          { id: 'news-2', kind: 'news', status: 'active', sort_order: 2, pinned: true, updated_at: '2026-08-03T00:00:00Z', data: { translations: { 'zh-CN': { title: '固定动态', summary: '后台新闻摘要' } } } },
        ],
        partners: [{ id: 'partner-1', kind: 'partner', status: 'active', sort_order: 1, pinned: false, data: { translations: { 'zh-CN': { name: '后台伙伴', logo_object_id: '01J00000000000000000000003', link_url: '/models' } } } }],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderPage(<HomePage />, '/')

    await waitFor(() => expect(screen.getByText('后台能力卡片')).toBeInTheDocument())
    expect(screen.getByText('后台优惠模型')).toBeInTheDocument()
    expect(screen.getByText('固定动态')).toBeInTheDocument()
    expect(screen.queryByText('未固定动态')).toBeNull()
    expect(screen.getAllByText('后台伙伴').length).toBeGreaterThan(0)
    expect(document.querySelector('.manuscript-feature-image')).toHaveAttribute('src', '/api/homepage/assets/01J00000000000000000000001')
    expect(screen.getByRole('img', { name: '后台广告位' })).toHaveAttribute('src', '/api/homepage/assets/01J00000000000000000000002')
    expect(document.querySelector('.manuscript-partner-image')).toHaveAttribute('src', '/api/homepage/assets/01J00000000000000000000003')
  })

  it('首页内容接口失败时保留默认静态卡片', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('offline'))
    renderPage(<HomePage />, '/')

    await waitFor(() => expect(screen.getByText('一个账户，统一访问所有顶级AI模型')).toBeInTheDocument())
    expect(screen.queryByText('后台能力卡片')).toBeNull()
  })

  it('英文环境渲染公开模型目录和模型动态字段', async () => {
    await i18n.changeLanguage('en-US')
    renderPage(<ModelsPublicPage />, '/models')

    expect(screen.getByRole('heading', { name: 'Choose a model by capability and use case' })).toBeInTheDocument()
    expect(screen.getByLabelText('Search models')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
    expect(screen.getAllByText('Conversation').length).toBeGreaterThan(0)
    expect(screen.getByText('Context 64K')).toBeInTheDocument()
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
})
