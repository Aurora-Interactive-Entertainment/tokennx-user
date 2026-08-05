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
})
