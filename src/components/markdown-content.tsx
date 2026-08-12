import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

interface MarkdownContentProps {
  content: string
  className?: string
  resolveImageUrl?: (url: string) => string | undefined
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

export function MarkdownContent({ content, className, resolveImageUrl }: MarkdownContentProps) {
  const rootClassName = className ? `markdown-content ${className}` : 'markdown-content'
  const normalizedContent = normalizeMalformedTableImages(content)
  return (
    <div className={rootClassName}>
      {/* 中文：不启用原始 HTML 解析，模型返回的标签只能作为 Markdown 文本处理。 */}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={resolveImageUrl ? {
          img: ({ src, alt }) => {
            const resolvedSrc = typeof src === 'string' ? resolveImageUrl(src) : undefined
            return resolvedSrc ? <img src={resolvedSrc} alt={alt ?? ''} loading="lazy" /> : null
          },
        } : undefined}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  )
}
