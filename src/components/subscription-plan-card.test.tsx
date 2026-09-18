import { render, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { userPlanFixture } from '@/test/product-plan-fixtures'
import { SubscriptionPlanCard } from './subscription-plan-card'

// 与购买页套餐列表保持同一顺序：主标题模型名，副标题套餐版本。
const plan = { ...userPlanFixture, display_name: 'v4.1-flash', group_name: 'deepseek-v4.1-flash' }

beforeEach(async () => { await i18n.changeLanguage('zh-CN') })

describe('套餐弹窗卡片标题与副标题的顺序', () => {
  it('主标题展示模型名，副标题展示套餐版本', () => {
    const view = render(<SubscriptionPlanCard plan={plan} index={0} onSelect={vi.fn()} />)
    const card = view.container.querySelector<HTMLElement>('.purchase-subscription-plan')
    expect(card).not.toBeNull()

    const heading = within(card!).getByRole('heading')
    expect(heading.querySelector('.purchase-subscription-plan-name')).toHaveTextContent('deepseek-v4.1-flash')
    expect(card!.querySelector('strong')).toHaveTextContent('v4.1-flash')
  })
})
