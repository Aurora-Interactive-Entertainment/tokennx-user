import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
})
