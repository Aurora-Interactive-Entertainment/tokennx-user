import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPublicDocument, getPublicDocumentAssetUrl, getPublicDocsTree, publicDocumentHref } from './public-docs'

const DIRECTORY_ID = '01K00000000000000000000000'
const DOCUMENT_ID = '01K00000000000000000000001'

afterEach(() => vi.restoreAllMocks())

describe('public documentation API', () => {
  it('loads the flat public tree without authentication', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      msg: 'success',
      data: [
        { id: DIRECTORY_ID, parent_id: '', type: 'directory', slug: 'guide', title: '使用指南' },
        { id: DOCUMENT_ID, parent_id: DIRECTORY_ID, type: 'document', slug: 'quick-start', title: '快速开始' },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(getPublicDocsTree('zh-CN')).resolves.toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/docs/tree?locale=zh-CN'), expect.objectContaining({ credentials: 'omit' }))
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).has('Authorization')).toBe(false)
  })

  it('loads markdown and builds canonical document and asset URLs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      msg: 'success',
      data: { id: DOCUMENT_ID, slug: 'quick-start', title: '快速开始', content_markdown: '# 快速开始', updated_at: 1786406400000 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(getPublicDocument(DOCUMENT_ID, 'zh-CN')).resolves.toMatchObject({ slug: 'quick-start', content_markdown: '# 快速开始' })
    expect(publicDocumentHref({ id: DOCUMENT_ID, slug: 'quick-start' })).toBe(`/docs/${DOCUMENT_ID}/quick-start`)
    expect(getPublicDocumentAssetUrl(DOCUMENT_ID)).toContain(`/api/docs/assets/${DOCUMENT_ID}`)
    expect(getPublicDocumentAssetUrl('invalid')).toBeUndefined()
  })
})
