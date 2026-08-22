import i18n from '@/i18n'
import { ApiError, fetchJson, makeApiUrl } from './http'

export const PUBLIC_DOCS_TREE_PATH = '/api/docs/tree'
export const PUBLIC_DOCS_PATH = '/api/docs'
export const PUBLIC_DOCS_ASSET_PATH = '/api/docs/assets'

export type PublicDocsLocale = 'zh-CN' | 'en-US'
export type PublicDocsNodeType = 'directory' | 'document'

export interface PublicDocsNode {
  id: string
  parent_id: string
  type: PublicDocsNodeType
  slug: string
  title: string
}

export interface PublicDocument {
  id: string
  slug: string
  title: string
  content_markdown: string
  updated_at: number
}

const PUBLIC_OBJECT_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function invalidResponse(): ApiError {
  return new ApiError(i18n.t('api.http.unreadableResponse'), 502, 100003, null)
}

function parseNode(value: unknown): PublicDocsNode | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || !PUBLIC_OBJECT_ID_PATTERN.test(value.id)) return null
  if (typeof value.parent_id !== 'string') return null
  if (value.type !== 'directory' && value.type !== 'document') return null
  if (typeof value.slug !== 'string' || !value.slug.trim()) return null
  if (typeof value.title !== 'string' || !value.title.trim()) return null
  return {
    id: value.id,
    parent_id: value.parent_id,
    type: value.type,
    slug: value.slug,
    title: value.title,
  }
}

function parseTree(value: unknown): PublicDocsNode[] {
  if (!Array.isArray(value)) throw invalidResponse()
  return value.flatMap((item) => {
    const node = parseNode(item)
    return node ? [node] : []
  })
}

function parseDocument(value: unknown): PublicDocument {
  if (!isRecord(value)) throw invalidResponse()
  if (typeof value.id !== 'string' || !PUBLIC_OBJECT_ID_PATTERN.test(value.id)) throw invalidResponse()
  if (typeof value.slug !== 'string' || !value.slug.trim()) throw invalidResponse()
  if (typeof value.title !== 'string' || !value.title.trim()) throw invalidResponse()
  if (typeof value.content_markdown !== 'string') throw invalidResponse()
  if (typeof value.updated_at !== 'number' || !Number.isFinite(value.updated_at)) throw invalidResponse()
  return {
    id: value.id,
    slug: value.slug,
    title: value.title,
    content_markdown: value.content_markdown,
    updated_at: value.updated_at,
  }
}

export function publicDocumentHref(document: Pick<PublicDocsNode, 'id' | 'slug'>): string {
  return `/docs/${encodeURIComponent(document.id)}/${encodeURIComponent(document.slug)}`
}

export function getPublicDocumentAssetUrl(objectId: string): string | undefined {
  const normalizedObjectId = objectId.trim()
  if (!PUBLIC_OBJECT_ID_PATTERN.test(normalizedObjectId)) return undefined
  return makeApiUrl(`${PUBLIC_DOCS_ASSET_PATH}/${encodeURIComponent(normalizedObjectId)}`)
}

export async function getPublicDocsTree(locale: PublicDocsLocale, signal?: AbortSignal): Promise<PublicDocsNode[]> {
  const value = await fetchJson<unknown>(`${PUBLIC_DOCS_TREE_PATH}?locale=${encodeURIComponent(locale)}`, { signal })
  return parseTree(value)
}

export async function getPublicDocument(documentId: string, locale: PublicDocsLocale, signal?: AbortSignal): Promise<PublicDocument> {
  if (!PUBLIC_OBJECT_ID_PATTERN.test(documentId)) throw new ApiError(i18n.t('api.http.requestFailed'), 404, 0, null)
  const value = await fetchJson<unknown>(`${PUBLIC_DOCS_PATH}/${encodeURIComponent(documentId)}?locale=${encodeURIComponent(locale)}`, { signal })
  return parseDocument(value)
}
