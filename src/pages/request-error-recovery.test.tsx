import '@/i18n'
import type { ReactNode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { ApiError } from '@/api/http'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppsPage, DocsPage, RankingsPage } from './public'
import { NewsDetailPage, NewsListPage } from './news'
import { getToolUsageClients, getToolUsageLeaderboard } from '@/api/tool-usage'
import { getModelUsageLeaderboard, getRecentModelUsage } from '@/api/model-rankings'
import { getPublicDocsTree, getPublicDocument } from '@/api/public-docs'
import { getNewsDetail, getNewsList } from '@/api/news'
import { appToast } from '@/components/app-toast'

// 保留真实页面的请求和恢复流程，只隔离页壳、消息渲染及下拉控件动画。
vi.mock('@/components/common', () => ({ PublicLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('@/components/app-toast', () => ({ appToast: { error: vi.fn() } }))
vi.mock('@/components/semi-compat', () => ({
  CompatSelect: Object.assign(({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: ReactNode }) => <select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>, {
    Option: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
  }),
}))
vi.mock('@/api/tool-usage', () => ({ getToolUsageLeaderboard: vi.fn(), getToolUsageClients: vi.fn() }))
vi.mock('@/api/model-rankings', () => ({ getModelUsageLeaderboard: vi.fn(), getRecentModelUsage: vi.fn() }))
vi.mock('@/api/public-docs', async (original) => ({ ...await original<object>(), getPublicDocsTree: vi.fn(), getPublicDocument: vi.fn() }))
vi.mock('@/api/news', async (original) => ({ ...await original<object>(), getNewsList: vi.fn(), getNewsDetail: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getToolUsageClients).mockResolvedValue({ weeks: [], items: [] })
})

const newsArticle = { id: 'recovered-news', title: '恢复后的资讯', category: '', description: '接口已恢复', publish_date: 1780000000000 }

function DocsLocationProbe() {
  return <output data-testid="docs-path">{useLocation().pathname}</output>
}

describe('页面请求失败恢复', () => {
  it.each(['missing', 'renamed', '404', 'guide'])('快速接入文档 %s 时回到使用指南，普通文档错误逻辑不受影响', async (mode) => {
    const toolId = '01K00000000000000000000011'
    const guideId = '01K00000000000000000000012'
    vi.mocked(getPublicDocsTree).mockResolvedValue([
      { id: 'api', parent_id: '', type: 'directory', slug: 'api-documentation', title: 'API 文档' },
      { id: 'api-doc', parent_id: 'api', type: 'document', slug: 'api-overview', title: 'API 概览' },
      { id: 'guide', parent_id: '', type: 'directory', slug: 'usage-guide', title: '使用指南' },
      { id: guideId, parent_id: 'guide', type: 'document', slug: 'intro', title: '指南首页' },
      ...(mode === 'missing' ? [] : [{ id: toolId, parent_id: 'guide', type: 'document' as const, slug: mode === 'renamed' ? 'new-tool' : 'tool', title: '工具' }]),
    ])
    vi.mocked(getPublicDocument).mockImplementation(async (id) => {
      if (id === toolId) throw new ApiError('文档不存在', 404, 0, null)
      return { id, slug: 'intro', title: '指南首页', content_markdown: '# 使用指南内容' }
    })
    render(<MemoryRouter initialEntries={[{ pathname: mode === 'guide' ? '/docs' : `/docs/${toolId}/tool`, state: { quickstartUsageGuide: true } }]}><DocsLocationProbe /><Routes><Route path="/docs/:publicId?/:slug?" element={<DocsPage />} /></Routes></MemoryRouter>)
    await waitFor(() => expect(screen.getByTestId('docs-path')).toHaveTextContent(`/docs/${guideId}/intro`))
    expect(await screen.findByRole('heading', { name: '使用指南内容' })).toBeInTheDocument()
    expect(appToast.error).not.toHaveBeenCalled()
    if (mode !== '404') expect(getPublicDocument).not.toHaveBeenCalledWith(toolId, expect.anything(), expect.anything())
  })
  it('应用榜周期请求失败后不冒用旧榜单，重试仅重新加载当前周期', async () => {
    let weekAttempts = 0
    vi.mocked(getToolUsageLeaderboard).mockImplementation(async (period) => {
      if (period === 'week' && ++weekAttempts === 1) throw new Error('本周统计暂不可用')
      return { period, items: period === 'year' ? [] : [{ id: period, rank: 1, name: period === 'day' ? '今天的工具' : '本周的工具', description: '', request_count: 1, total_tokens: 123 }] }
    })
    const user = userEvent.setup()
    render(<MemoryRouter><AppsPage /></MemoryRouter>)
    await screen.findByText('今天的工具')
    await user.selectOptions(screen.getByRole('combobox'), 'week')
    const ranking = screen.getByRole('region', { name: '本周 AI 工具排行榜' })
    const retry = await within(ranking).findByRole('button', { name: '重试' })
    expect(within(ranking).queryByText('今天的工具')).not.toBeInTheDocument()
    expect(ranking).toHaveTextContent('本周统计暂不可用')
    await user.click(retry)
    expect(await within(ranking).findByText('本周的工具')).toBeInTheDocument()
    expect(getToolUsageClients).toHaveBeenCalledTimes(1)
    expect(appToast.error).toHaveBeenCalledTimes(1)
  })

  it('模型排行榜请求失败可单独重试，不把异常展示成暂无数据', async () => {
    vi.mocked(getModelUsageLeaderboard).mockRejectedValueOnce(new Error('模型榜单暂不可用')).mockResolvedValueOnce({ period: 'day', started_at: 1780000000000, ended_at: 1780086400000, previous_from: 1779913600000, previous_to: 1780000000000, items: [] })
    vi.mocked(getRecentModelUsage).mockResolvedValue({ items: [], weeks: [] })
    const user = userEvent.setup()
    render(<MemoryRouter><RankingsPage /></MemoryRouter>)
    const retry = await screen.findByRole('button', { name: '重试' })
    expect(retry.closest('[role="alert"]')).toHaveTextContent('模型榜单暂不可用')
    await user.click(retry)
    await waitFor(() => expect(getModelUsageLeaderboard).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument()
    expect(getRecentModelUsage).toHaveBeenCalledTimes(1)
  })

  it('文档目录和正文分别失败时均可恢复，正文重试不重复读取目录', async () => {
    const documentId = '01K00000000000000000000001'
    vi.mocked(getPublicDocsTree).mockRejectedValueOnce(new Error('文档目录暂不可用')).mockResolvedValueOnce([
      { id: 'root', parent_id: '', type: 'directory', slug: 'guide', title: '指南' },
      { id: documentId, parent_id: 'root', type: 'document', slug: 'recovery', title: '恢复文档' },
    ])
    vi.mocked(getPublicDocument).mockRejectedValueOnce(new Error('文档正文暂不可用')).mockResolvedValueOnce({ id: documentId, slug: 'recovery', title: '恢复文档', content_markdown: '# 文档加载完成' })
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={[`/docs/${documentId}/recovery`]}><Routes><Route path="/docs/:publicId/:slug" element={<DocsPage />} /></Routes></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('文档正文暂不可用'))
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('heading', { name: '文档加载完成' })).toBeInTheDocument()
    expect(getPublicDocsTree).toHaveBeenCalledTimes(2)
    expect(getPublicDocument).toHaveBeenCalledTimes(2)
  })

  it('资讯列表加载失败保留原因，并允许原地重试', async () => {
    vi.mocked(getNewsList).mockRejectedValueOnce(new Error('资讯列表暂不可用')).mockResolvedValueOnce({ items: [newsArticle], page: 1, page_size: 20, total: 1, has_more: false })
    const user = userEvent.setup()
    render(<MemoryRouter><NewsListPage /></MemoryRouter>)
    const retry = await screen.findByRole('button', { name: '重试' })
    expect(retry.closest('[role="alert"]')).toHaveTextContent('资讯列表暂不可用')
    await user.click(retry)
    expect(await screen.findByRole('heading', { name: newsArticle.title })).toBeInTheDocument()
    expect(getNewsList).toHaveBeenCalledTimes(2)
  })

  it('资讯详情服务异常可重试恢复正文', async () => {
    vi.mocked(getNewsDetail).mockRejectedValueOnce(new Error('资讯正文暂不可用')).mockResolvedValueOnce({ ...newsArticle, content: '恢复成功的正文' })
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/news/recovered-news']}><Routes><Route path="/news/:id" element={<NewsDetailPage />} /></Routes></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '重试' }))
    expect(await screen.findByText('恢复成功的正文')).toBeInTheDocument()
  })
})
