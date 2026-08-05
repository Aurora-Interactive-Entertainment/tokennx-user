import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MoneyText } from './money'

describe('金额展示组件', () => {
  it('显示三位小数并在悬停提示中只显示后端原始金额', () => {
    const { container } = render(<MoneyText value="1.23456" />)
    const amount = container.querySelector('[data-money-value]')

    expect(amount).toHaveTextContent('¥1.235')
    expect(amount).toHaveAttribute('title', '¥1.23456')
  })

  it('支持收支方向和隐藏货币符号', () => {
    const { container, rerender } = render(<MoneyText value="12.5" direction="income" />)
    const amount = container.querySelector('[data-money-value]')
    expect(amount).toHaveTextContent('+¥12.500')
    expect(amount).toHaveAttribute('title', '+¥12.5')

    rerender(<MoneyText value="0.1256" withCurrency={false} />)
    expect(container.querySelector('[data-money-value]')).toHaveTextContent('0.126')
    expect(container.querySelector('[data-money-value]')).toHaveAttribute('title', '0.1256')
  })
})
