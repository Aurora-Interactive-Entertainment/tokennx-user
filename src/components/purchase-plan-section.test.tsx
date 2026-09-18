import { render, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { ProductPlanSummary } from '@/api/product-plans'
import { userPlanFixture } from '@/test/product-plan-fixtures'
import PurchasePlanSection from './purchase-plan-section'

// display_name 是套餐版本，group_name 是模型名，两者必须能区分开才能验证上下顺序。
const plan: ProductPlanSummary = { ...userPlanFixture, display_name: 'v4.1-flash', group_name: 'deepseek-v4.1-flash' }

function renderSection(plans: ProductPlanSummary[] = [plan]) {
  return render(
    <PurchasePlanSection
      plans={plans}
      loading={false}
      error=""
      selectingPlanID={null}
      onRetry={vi.fn()}
      onSelect={vi.fn()}
    />,
  )
}

beforeEach(async () => { await i18n.changeLanguage('zh-CN') })

describe('套餐卡片标题与副标题的顺序', () => {
  it('主标题展示模型名，副标题展示套餐版本', () => {
    const view = renderSection()
    const card = view.container.querySelector<HTMLElement>('.purchase-plan-card')
    expect(card).not.toBeNull()

    const heading = within(card!).getByRole('heading')
    expect(heading).toHaveTextContent('deepseek-v4.1-flash')
    expect(heading.querySelector('.purchase-plan-name')).toHaveTextContent('deepseek-v4.1-flash')
    expect(card!.querySelector('strong')).toHaveTextContent('v4.1-flash')
  })

  it('截断提示跟随主标题，拿到的是完整的模型名', () => {
    const view = renderSection()
    const name = view.container.querySelector('.purchase-plan-name')
    expect(name).toHaveAttribute('title', 'deepseek-v4.1-flash')
  })

  it('筛选标签仍按模型名分组，不随标题顺序变化', () => {
    const view = renderSection([plan, { ...plan, id: 'plan-glm', display_name: '5.2', group_name: 'glm5.2' }])
    const tabs = within(view.container.querySelector<HTMLElement>('.purchase-plan-tabs')!).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([expect.stringContaining('全部'), 'deepseek-v4.1-flash', 'glm5.2'])
  })
})
