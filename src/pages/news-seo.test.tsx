import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import i18n from '@/i18n'
import { getNewsDetail } from '@/api/news'
import { SeoManager } from '@/seo/site-seo'
import { NewsDetailPage } from './news'

vi.mock('@/components/common', () => ({ PublicLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('@/api/news', () => ({ getNewsDetail: vi.fn(), getNewsList: vi.fn(), resolveNewsContentImageUrl: vi.fn() }))

beforeEach(async () => { vi.resetAllMocks(); await i18n.changeLanguage('zh-CN') })

function renderArticle() {
  render(<MemoryRouter initialEntries={['/news/article']}><SeoManager /><Routes><Route path="/news/:id" element={<NewsDetailPage />} /></Routes></MemoryRouter>)
}

describe('资讯详情SEO', () => {
  it('真实正文完成后覆盖通用标题且允许索引', async () => {
    vi.mocked(getNewsDetail).mockResolvedValue({ id: 'article', title: '平台更新', description: '本次更新摘要', content: '公开内容', category: '', publish_date: 0 })
    renderArticle()
    await screen.findByRole('heading', { name: '平台更新' })
    await waitFor(() => expect(document.title).toBe('平台更新 - Token NX'))
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'index, follow')
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute('content', '本次更新摘要')
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toContain('/news/article/')
  })
  it('错误详情继续禁止索引并无canonical', async () => {
    vi.mocked(getNewsDetail).mockRejectedValue(new Error('not found'))
    renderArticle()
    await screen.findByRole('alert')
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
    expect(document.querySelector('link[rel="canonical"]')).toBeNull()
    expect(document.title).not.toContain('模型详情')
  })
})
