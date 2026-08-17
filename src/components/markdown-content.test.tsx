import { render, screen } from '@testing-library/react'
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
  it('allows callers to resolve trusted markdown image URLs', () => {
    render(<MarkdownContent content="![diagram](01K00000000000000000000001)" resolveImageUrl={(url) => `/api/docs/assets/${url}`} />)

    expect(screen.getByRole('img', { name: 'diagram' })).toHaveAttribute('src', '/api/docs/assets/01K00000000000000000000001')
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
})
