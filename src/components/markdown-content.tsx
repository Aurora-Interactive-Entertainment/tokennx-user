import ReactMarkdown from 'react-markdown'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { defaultSchema } from 'hast-util-sanitize'
import rehypeSanitize from 'rehype-sanitize'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import { MarkdownCodeBlock, type MarkdownCodeVariant } from './markdown-code-block'
import '@/docs-markdown.css'

interface MarkdownContentProps {
  content: string
  className?: string
  enhancedCodeBlocks?: boolean
  /** News content may contain trusted Markdown-rendered HTML fragments. */
  allowHtml?: boolean
  resolveImageUrl?: (url: string) => string | undefined
}

interface MarkdownAstNode {
  type: string
  lang?: string | null
  value?: string
  children?: MarkdownAstNode[]
  data?: { hName?: string; hProperties?: Record<string, string> }
  properties?: Record<string, unknown>
}

const enhancedMarkdownSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'docs-code-group'],
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-/]],
    'docs-code-group': ['dataVariants'],
  },
}

function groupAdjacentCodeVariants(node: MarkdownAstNode): void {
  if (!node.children?.length) return
  const grouped: MarkdownAstNode[] = []

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index]
    if (!child) continue
    if (child.type !== 'code' || !child.lang) {
      groupAdjacentCodeVariants(child)
      grouped.push(child)
      continue
    }

    const variants: MarkdownCodeVariant[] = [{ language: child.lang, code: child.value ?? '' }]
    let cursor = index + 1
    while (cursor < node.children.length) {
      const candidate = node.children[cursor]
      if (!candidate || candidate.type !== 'code' || !candidate.lang || variants.some((variant) => variant.language === candidate.lang)) break
      variants.push({ language: candidate.lang, code: candidate.value ?? '' })
      cursor += 1
    }

    if (variants.length === 1) {
      grouped.push(child)
      continue
    }

    grouped.push({
      type: 'codeGroup',
      data: {
        hName: 'docs-code-group',
        hProperties: { dataVariants: encodeURIComponent(JSON.stringify(variants)) },
      },
    })
    index = cursor - 1
  }

  node.children = grouped
}

function remarkCodeGroups() {
  return (tree: MarkdownAstNode) => { groupAdjacentCodeVariants(tree) }
}

function readCodeVariants(value: unknown): MarkdownCodeVariant[] {
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is MarkdownCodeVariant => Boolean(item && typeof item === 'object' && typeof (item as MarkdownCodeVariant).code === 'string' && typeof (item as MarkdownCodeVariant).language === 'string')) : []
  } catch {
    return []
  }
}

function readMarkdownNodeText(node?: MarkdownAstNode): string {
  if (!node) return ''
  if (typeof node.value === 'string') return node.value
  return node.children?.map((child) => readMarkdownNodeText(child)).join('') ?? ''
}

function normalizeMalformedTableImages(content: string): string {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const normalized: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const match = line.match(/^(\s*\|(?:\s*:?-{3,}:?\s*\|)+)(!\[[^\]]*\]\([^\n]+\))\s*$/)
    if (!match) {
      normalized.push(line)
      continue
    }

    normalized.push(match[1] ?? '')
    while (index + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[index + 1] ?? '')) {
      index += 1
      normalized.push(lines[index] ?? '')
    }
    normalized.push('', match[2] ?? '', '')
  }

  return normalized.join('\n')
}

function isGfmTable(value: string): boolean {
  const lines = value.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean)
  return lines.length >= 2
    && /^\|.*\|$/.test(lines[0] ?? '')
    && /^\|(?:\s*:?-{1,}:?\s*\|)+$/.test(lines[1] ?? '')
}

function normalizeHtmlCodeBlocks(content: string): string {
  if (typeof DOMParser === 'undefined' || !/<pre[\s>]/i.test(content)) return content
  const parsed = new DOMParser().parseFromString(content, 'text/html')
  let changed = false

  for (const pre of parsed.body.querySelectorAll('pre')) {
    const code = pre.querySelector('code')
    if (!code) continue
    const language = code.className.match(/(?:^|\s)language-([^\s]+)/)?.[1] ?? 'text'
    const value = (code.textContent ?? '').replace(/\r\n?/g, '\n').replace(/^\n|\n$/g, '')
    const fence = value.includes('~~~') ? '````' : '~~~'
    // 中文：富文本 HTML 中带空行的 pre/code 会被 Markdown 拆段，先恢复为一个标准围栏代码块。
    pre.replaceWith(parsed.createTextNode(`\n\n${fence}${language}\n${value}\n${fence}\n\n`))
    changed = true
  }

  return changed ? parsed.body.innerHTML : content
}

function normalizeHtmlWrappedMarkdownTables(content: string): string {
  if (typeof DOMParser === 'undefined' || !/<p[\s>]/i.test(content)) return content
  const parsed = new DOMParser().parseFromString(content, 'text/html')
  let changed = false

  for (const paragraph of parsed.body.querySelectorAll('p')) {
    const value = paragraph.textContent?.trim() ?? ''
    if (!isGfmTable(value)) continue
    // 中文：富文本接口可能把 Markdown 表格包进 p 标签，拆回文本后交给 GFM 正常生成 table。
    paragraph.replaceWith(parsed.createTextNode(`\n\n${value}\n\n`))
    changed = true
  }

  return changed ? parsed.body.innerHTML : content
}

function MarkdownImage({ src, alt, resolveImageUrl }: { src?: string; alt?: string; resolveImageUrl?: (url: string) => string | undefined }) {
  const { t } = useTranslation()
  const resolvedSrc = typeof src === 'string' ? (resolveImageUrl ? resolveImageUrl(src) : src) : undefined
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)

  if (!resolvedSrc || failedSrc === resolvedSrc) return null
  const isLoaded = loadedSrc === resolvedSrc
  return (
    <span className={`markdown-image-frame${isLoaded ? ' is-loaded' : ''}`} aria-busy={!isLoaded || undefined}>
      {!isLoaded ? <span className="markdown-image-loading" role="status" aria-label={t('public.docs.manuscript.imageLoading')}><span className="markdown-image-loading-ring" aria-hidden="true" /></span> : null}
      <img
        className={`markdown-image${isLoaded ? ' is-loaded' : ' markdown-image--loading'}`}
        src={resolvedSrc}
        alt={alt ?? ''}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoadedSrc(resolvedSrc)}
        onError={() => setFailedSrc(resolvedSrc)}
      />
    </span>
  )
}

export function MarkdownContent({ content, className, enhancedCodeBlocks = false, allowHtml = false, resolveImageUrl }: MarkdownContentProps) {
  const rootClassName = className ? `markdown-content ${className}` : 'markdown-content'
  const normalizedContent = normalizeMalformedTableImages(allowHtml ? normalizeHtmlWrappedMarkdownTables(normalizeHtmlCodeBlocks(content)) : content)
  const components = {
    img: ({ src, alt }: { src?: string; alt?: string }) => <MarkdownImage src={src} alt={alt} resolveImageUrl={resolveImageUrl} />,
    ...(enhancedCodeBlocks ? {
      pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
      code: ({ className: codeClassName, children, node }: { className?: string; children?: React.ReactNode; node?: MarkdownAstNode }) => {
        // 中文：从 Markdown AST 读取原始文本，避免多段 HTML 代码被转成逗号和 [object Object]。
        const rawCode = readMarkdownNodeText(node) || String(children ?? '')
        const language = codeClassName?.match(/language-([^\s]+)/)?.[1] ?? 'text'
        const isBlock = Boolean(codeClassName) || rawCode.endsWith('\n')
        return isBlock ? <MarkdownCodeBlock variants={[{ language, code: rawCode.replace(/\n$/, '') }]} /> : <code className={codeClassName}>{children}</code>
      },
      'docs-code-group': ({ node }: { node?: MarkdownAstNode }) => <MarkdownCodeBlock variants={readCodeVariants(node?.properties?.dataVariants)} />,
    } : {}),
  }
  const rehypePlugins = allowHtml
    ? enhancedCodeBlocks ? [rehypeRaw, [rehypeSanitize, enhancedMarkdownSchema]] : [rehypeRaw, rehypeSanitize]
    : enhancedCodeBlocks ? [[rehypeSanitize, enhancedMarkdownSchema]] : [rehypeSanitize]
  return (
    <div className={rootClassName}>
      {/* Keep raw HTML disabled by default; the news API opts in for its rendered Markdown fragments. */}
      <ReactMarkdown
        remarkPlugins={enhancedCodeBlocks ? [remarkGfm, remarkCodeGroups] : [remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  )
}
