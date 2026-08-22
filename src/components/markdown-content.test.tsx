import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { MarkdownContent } from './markdown-content'

describe('模型回复 Markdown 渲染', () => {
  it('支持标题、列表和 GFM 表格', () => {
    render(<MarkdownContent content={'# 结果\n\n- 第一项\n\n| 字段 | 值 |\n| --- | --- |\n| 状态 | 正常 |'} />)

    expect(screen.getByRole('heading', { name: '结果' })).toBeInTheDocument()
    expect(screen.getByText('第一项')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '正常' })).toBeInTheDocument()
  })

  it('不会把模型返回的原始 HTML 注入页面', () => {
    const { container } = render(<MarkdownContent content={'<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)" />'} />)

    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders sanitized news HTML and resolves images supplied by the backend', () => {
    const content = '<h2>概述</h2><blockquote><p>产品入门</p></blockquote><p><img src="/api/homepage/assets/01M0EXCSCSZ3Q6PG39HAGEY36J" alt="正文图片" onerror="alert(1)" /></p><p>Token NX 是一个模型 API 聚合平台。</p><p>| 维度 | 使用 Token NX |\n|-|-|\n| API 格式 | 统一接口规范 |</p>'
    const { container } = render(<MarkdownContent content={content} allowHtml resolveImageUrl={(url) => new URL(url, 'http://localhost:5174').toString()} />)

    expect(screen.getByRole('heading', { name: '概述' })).toBeInTheDocument()
    expect(screen.getByText('产品入门')).toBeInTheDocument()
    expect(screen.getByText('Token NX 是一个模型 API 聚合平台。')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '统一接口规范' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '正文图片' })).toHaveAttribute('src', 'http://localhost:5174/api/homepage/assets/01M0EXCSCSZ3Q6PG39HAGEY36J')
    expect(container.querySelector('img')).not.toHaveAttribute('onerror')
  })

  it('allows callers to resolve trusted markdown image URLs', () => {
    render(<MarkdownContent content="![diagram](01K00000000000000000000001)" resolveImageUrl={(url) => `/api/docs/assets/${url}`} />)

    const image = screen.getByRole('img', { name: 'diagram' })
    expect(image).toHaveAttribute('src', '/api/docs/assets/01K00000000000000000000001')
    expect(image).toHaveClass('markdown-image--loading')
    expect(screen.getByRole('status', { name: '图片加载中' })).toBeInTheDocument()
    expect(image.closest('.markdown-image-frame')).toHaveAttribute('aria-busy', 'true')

    fireEvent.load(image)

    expect(image).not.toHaveClass('markdown-image--loading')
    expect(screen.queryByRole('status', { name: '图片加载中' })).not.toBeInTheDocument()
    expect(image.closest('.markdown-image-frame')).toHaveClass('is-loaded')
  })

  it('removes markdown images when the resolved asset fails to load', () => {
    render(<MarkdownContent content="![missing diagram](missing.png)" resolveImageUrl={(url) => `/api/docs/assets/${url}`} />)

    fireEvent.error(screen.getByRole('img', { name: 'missing diagram' }))

    expect(screen.queryByRole('img', { name: 'missing diagram' })).not.toBeInTheDocument()
  })

  it('repairs an image appended to a GFM table delimiter', () => {
    const content = [
      '| 接口 | 文档 |',
      "| --- | --- |![output.png](/api/docs/assets/01KZQVP2SVX2ZCRXQVQ4Q6TKES 'output.png')",
      '| `POST /api/auth/email/code` | [发送邮箱验证码](发送邮箱验证码.md) |',
      '| `POST /api/auth/email/login` | [邮箱验证码登录](邮箱验证码登录.md) |',
    ].join('\n')

    render(<MarkdownContent content={content} resolveImageUrl={(url) => url} />)

    expect(screen.getByRole('columnheader', { name: '接口' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'POST /api/auth/email/code' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '发送邮箱验证码' })).toHaveAttribute('href', encodeURI('发送邮箱验证码.md'))
    expect(screen.getByRole('img', { name: 'output.png' })).toHaveAttribute('src', '/api/docs/assets/01KZQVP2SVX2ZCRXQVQ4Q6TKES')
  })

  it('renders adjacent fenced code samples as a highlighted language switcher with line numbers', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<MarkdownContent enhancedCodeBlocks content={'```python\nprint("hello")\n```\n\n```typescript\nconsole.log("hello")\n```'} />)

    expect(screen.getByRole('tab', { name: 'Python' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('1', { selector: '.markdown-code-reader-line-number' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'TypeScript' }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('console.log("hello")')
    await user.click(screen.getByRole('button', { name: '复制代码' }))
    expect(writeText).toHaveBeenCalledWith('console.log("hello")')
  })

  it('preserves the language of a single fenced code sample', () => {
    render(<MarkdownContent enhancedCodeBlocks content={'```json\n{"status":"ok"}\n```'} />)

    expect(screen.getByText('JSON', { selector: '.markdown-code-reader-language' })).toBeInTheDocument()
    expect(document.querySelector('.markdown-code-reader pre')).toHaveClass('language-json')
  })

  it('applies syntax tokens to shell code', () => {
    const { container } = render(<MarkdownContent enhancedCodeBlocks content={'```bash\ncurl https://example.com -H "Accept: application/json"\n```'} />)

    expect(container.querySelector('.markdown-code-reader .token.function')).toHaveTextContent('curl')
    expect(container.querySelectorAll('.markdown-code-reader .token').length).toBeGreaterThan(1)
  })

  it('infers syntax highlighting and language labels for untyped shell code', () => {
    const { container } = render(<MarkdownContent enhancedCodeBlocks content={'<pre><code>curl https://api.tokennx.com/v1/models\n</code></pre>'} allowHtml />)

    expect(screen.getByText('Shell', { selector: '.markdown-code-reader-language' })).toBeInTheDocument()
    expect(container.querySelector('.markdown-code-reader .token.function')).toHaveTextContent('curl')
  })

  it('highlights untyped Python SDK calls that begin with an assignment', () => {
    const content = '<pre><code>response = client.chat.completions.create(\n  model="deepseek-chat",\n  max_tokens=1024\n)\n</code></pre>'
    const { container } = render(<MarkdownContent enhancedCodeBlocks content={content} allowHtml />)

    expect(screen.getByText('Python', { selector: '.markdown-code-reader-language' })).toBeInTheDocument()
    expect(container.querySelector('.markdown-code-reader pre')).toHaveClass('language-python')
    expect(container.querySelector('.markdown-code-reader .token.string')).toHaveTextContent('"deepseek-chat"')
    expect(container.querySelector('.markdown-code-reader .token.number')).toHaveTextContent('1024')
  })

  it('keeps multi-paragraph HTML code in one highlighted block without stringifying React nodes', () => {
    const content = '<p>| 字段 | 值 |\n|-|-|\n| 状态 | 正常 |</p><pre><code>from openai import OpenAI\n\nclient = OpenAI(api_key="nx-...")\n\nresponse = client.chat.completions.create(\n  model="deepseek-chat"\n)\n</code></pre>'
    const { container } = render(<MarkdownContent enhancedCodeBlocks content={content} allowHtml />)

    expect(screen.getByRole('cell', { name: '正常' })).toBeInTheDocument()
    expect(container.querySelectorAll('.markdown-code-reader')).toHaveLength(1)
    expect(container.querySelector('.markdown-code-reader')).toHaveTextContent('response = client.chat.completions.create(')
    expect(container.querySelector('.markdown-code-reader')).not.toHaveTextContent('[object Object]')
    expect(container.querySelector('.markdown-code-reader pre')).toHaveClass('language-python')
  })

  it('adds semantic color to generic URLs and authorization headers', () => {
    const { container } = render(<MarkdownContent enhancedCodeBlocks content={'```text\nAuthorization: Bearer 你的API密钥 at https://api.tokennx.com/v1\n```'} />)

    expect(screen.getByText('Text', { selector: '.markdown-code-reader-language' })).toBeInTheDocument()
    expect(container.querySelector('.markdown-code-reader pre')).toHaveClass('language-nxconfig')
    expect(container.querySelector('.markdown-code-reader .token.property')).toHaveTextContent('Authorization')
    expect(container.querySelector('.markdown-code-reader .token.url')).toHaveTextContent('https://api.tokennx.com/v1')
  })
})
