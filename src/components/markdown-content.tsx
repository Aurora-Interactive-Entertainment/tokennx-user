import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

interface MarkdownContentProps {
  content: string
  className?: string
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  const rootClassName = className ? `markdown-content ${className}` : 'markdown-content'
  return (
    <div className={rootClassName}>
      {/* 中文：不启用原始 HTML 解析，模型返回的标签只能作为 Markdown 文本处理。 */}
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
