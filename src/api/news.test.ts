import { afterEach, describe, it, expect, vi } from 'vitest'
import { getNewsList, getNewsDetail, type NewsArticle, type NewsDetail } from './news'

describe('news api', () => {
  afterEach(() => vi.restoreAllMocks())

  it('should export getNewsList function', () => {
    expect(typeof getNewsList).toBe('function')
  })

  it('should export getNewsDetail function', () => {
    expect(typeof getNewsDetail).toBe('function')
  })

  it('should have correct NewsArticle type structure', () => {
    const article: NewsArticle = {
      id: 'test-id',
      title: 'Test Title',
      category: 'Test Category',
      description: 'Test Description',
      publish_date: Date.now(),
    }
    expect(article.id).toBe('test-id')
    expect(article.title).toBe('Test Title')
  })

  it('should have correct NewsDetail type structure', () => {
    const detail: NewsDetail = {
      id: 'test-id',
      title: 'Test Title',
      category: 'Test Category',
      description: 'Test Description',
      publish_date: Date.now(),
      content: '# Test Content',
    }
    expect(detail.content).toBe('# Test Content')
  })

  it('loads the paginated protocol and normalizes list fields', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      msg: 'success',
      data: {
        items: [{ id: 'news-1', title: '产品更新', summary: '摘要', cover_url: 'https://cdn.example/cover.png', tags: ['产品动态'], published_at: '2026-08-19T00:00:00Z', pinned: true }],
        page: 2,
        page_size: 20,
        total: 41,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(getNewsList(2, 20, 'en-US', undefined, { keyword: '更新', tag: '产品动态' })).resolves.toMatchObject({
      page: 2,
      page_size: 20,
      total: 41,
      has_more: true,
      items: [{ id: 'news-1', category: '产品动态', description: '摘要', cover_image: 'https://cdn.example/cover.png', publish_date: '2026-08-19T00:00:00Z' }],
    })
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/news?page=2&page_size=20&locale=en-US&keyword=%E6%9B%B4%E6%96%B0&tag=%E4%BA%A7%E5%93%81%E5%8A%A8%E6%80%81'), expect.objectContaining({ credentials: 'omit' }))
  })

  it('loads markdown content from the detail endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      msg: 'success',
      data: { id: 'news-1', title: '产品更新', summary: '摘要', tags: ['产品动态'], published_at: '2026-08-19T00:00:00Z', content: '# 正文' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(getNewsDetail('news-1', 'zh-CN')).resolves.toMatchObject({ content: '# 正文', category: '产品动态' })
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/news/news-1?locale=zh-CN'), expect.objectContaining({ credentials: 'omit' }))
  })
})
