import { describe, it, expect } from 'vitest'
import { NewsListPage, NewsDetailPage } from './news'

describe('news pages', () => {
  it('should export NewsListPage component', () => {
    expect(NewsListPage).toBeDefined()
    expect(typeof NewsListPage).toBe('function')
  })

  it('should export NewsDetailPage component', () => {
    expect(NewsDetailPage).toBeDefined()
    expect(typeof NewsDetailPage).toBe('function')
  })
})
