import ReactMarkdown from 'react-markdown'
import { defaultSchema } from 'hast-util-sanitize'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { MarkdownCodeBlock, type MarkdownCodeVariant } from './markdown-code-block'

interface MarkdownContentProps {
  content: string
  className?: string
  enhancedCodeBlocks?: boolean
  resolveImageUrl?: (url: string) => string | undefined
}

interface MarkdownAstNode {
  type: string
  lang?: string | null
  value?: string
  children?: MarkdownAstNode[]
  data?: { hName?: string; hProperties?: Record<string, string> }
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

export function MarkdownContent({ content, className, enhancedCodeBlocks = false, resolveImageUrl }: MarkdownContentProps) {
  const rootClassName = className ? `markdown-content ${className}` : 'markdown-content'
  const normalizedContent = normalizeMalformedTableImages(content)
  const components = {
    ...(resolveImageUrl ? {
      img: ({ src, alt }: { src?: string; alt?: string }) => {
        const resolvedSrc = typeof src === 'string' ? resolveImageUrl(src) : undefined
        return resolvedSrc ? <img src={resolvedSrc} alt={alt ?? ''} loading="lazy" /> : null
      },
    } : {}),
    ...(enhancedCodeBlocks ? {
      pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
      code: ({ className: codeClassName, children }: { className?: string; children?: React.ReactNode }) => {
        const rawCode = String(children ?? '')
        const language = codeClassName?.match(/language-([^\s]+)/)?.[1] ?? 'text'
        const isBlock = Boolean(codeClassName) || rawCode.endsWith('\n')
        return isBlock ? <MarkdownCodeBlock variants={[{ language, code: rawCode.replace(/\n$/, '') }]} /> : <code className={codeClassName}>{children}</code>
      },
      'docs-code-group': ({ node }: { node?: { properties?: Record<string, unknown> } }) => <MarkdownCodeBlock variants={readCodeVariants(node?.properties?.dataVariants)} />,
    } : {}),
  }
  return (
    <div className={rootClassName}>
      {/* 中文：不启用原始 HTML 解析，模型返回的标签只能作为 Markdown 文本处理。 */}
      <ReactMarkdown
        remarkPlugins={enhancedCodeBlocks ? [remarkGfm, remarkCodeGroups] : [remarkGfm]}
        rehypePlugins={enhancedCodeBlocks ? [[rehypeSanitize, enhancedMarkdownSchema]] : [rehypeSanitize]}
        components={components}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  )
}
