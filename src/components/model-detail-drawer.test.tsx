import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { UserModelDetail, UserModelItem, UserModelPrice, UserModelPricingPeriod } from '@/api/user-models'
import { userModelToRecord } from '@/data/models'
import { ModelDetailDrawer } from './model-detail-drawer'

// 保留真实抽屉内容和定价组件，仅跳过弹层动画与无关的全站公共组件依赖。
vi.mock('@douyinfe/semi-ui/lib/es/sideSheet', () => ({
  default: ({ children, visible }: { children: ReactNode; visible: boolean }) => visible ? <div>{children}</div> : null,
}))
vi.mock('./common', () => ({
  localizeConsoleLabel: (_t: unknown, value: string) => value,
  ModelLogo: () => null,
}))

const listPrice: UserModelPrice = {
  meter_code: 'custom_usage', meter_kind: 'usage', unit: 'second', currency: 'CNY',
  unit_quantity: 1, unit_price_yuan: '2', tier_no: 0,
}

const listPeriod: UserModelPricingPeriod = {
  key: 'list-period', name: '目录夜间价', default: false, weekday_mask: 127, start_minute: 0, end_minute: 480,
  rules: [{ kind: 'usage', meter_code: 'custom_usage', tier_no: 0, lower_bound: 0, unit_quantity: 1, unit_price_yuan: '2', rounding_mode: 'half_up' }],
}

const baseModel: UserModelItem = {
  id: 'pricing-model', alias: 'pricing-public', name: '分时定价模型', company: '测试厂商', modality: 'text',
  billing_mode: 'hybrid', description: '测试模型', capabilities: [], provider_count: 1, prices: [listPrice],
}

function withDefaultPeriod(period: UserModelPricingPeriod): UserModelPricingPeriod[] {
  return [period, {
    ...period, key: `${period.key}-default`, name: '默认报价', default: true,
    weekday_mask: 127, start_minute: 0, end_minute: 1440,
  }]
}

const model = userModelToRecord({
  ...baseModel, pricing_periods: withDefaultPeriod(listPeriod), pricing_timezone: 'Asia/Shanghai', current_period_key: listPeriod.key,
})

function detailWith(overrides: Partial<UserModelItem> = {}): UserModelDetail {
  return {
    model: { ...baseModel, ...overrides },
    tags: [],
    specifications: { input_modalities: ['text'], output_modalities: ['text'], capability_limits: {} },
    metrics: {
      activity: { unit: 'requests', points: [] },
      throughput: { unit: 'tokens/s', statistic: 'average', points: [] },
      first_token_latency: { unit: 'ms', statistic: 'average', points: [] },
      availability: { rate: 100, success_requests: 0, valid_requests: 0 },
      cumulative_usage: { value: '0', unit: 'token' },
    },
  }
}

function drawer(detail: UserModelDetail | null) {
  return <MemoryRouter><ModelDetailDrawer model={model} detail={detail} loading={!detail} error="" visible onClose={() => undefined} /></MemoryRouter>
}

function pricingPanel(container: HTMLElement): HTMLElement {
  const panel = container.querySelector<HTMLElement>('.model-time-pricing')
  expect(panel).not.toBeNull()
  return panel!
}

beforeEach(async () => { await i18n.changeLanguage('zh-CN') })

describe('模型详情分时定价数据一致性', () => {
  it('详情到达后整组采用详情时段、当前状态和计量单位', () => {
    const view = render(drawer(null))
    expect(pricingPanel(view.container)).toHaveTextContent('目录夜间价')

    const detailPeriod = {
      ...listPeriod, key: 'detail-period', name: '详情日间价', start_minute: 480, end_minute: 1200,
      rules: [{ ...listPeriod.rules[0], unit_price_yuan: '0.000001' }],
    }
    view.rerender(drawer(detailWith({
      pricing_periods: withDefaultPeriod(detailPeriod), pricing_timezone: 'America/New_York', current_period_key: detailPeriod.key,
      prices: [{ ...listPrice, unit: 'image', unit_price_yuan: '0.000001' }],
    })))

    const panel = pricingPanel(view.container)
    expect(panel).toHaveTextContent('详情日间价')
    expect(panel).toHaveTextContent('08:00–20:00')
    expect(panel).toHaveTextContent('¥0.000001')
    expect(panel).toHaveTextContent(`1 ${i18n.t('console.timePricing.images')}`)
    expect(panel).not.toHaveTextContent('Asia/Shanghai')
    expect(panel).not.toHaveTextContent(`1 ${i18n.t('console.timePricing.seconds')}`)
    expect(screen.queryByText('目录夜间价')).toBeNull()
    expect(within(panel).getByText('详情日间价').closest('section')).toHaveClass('is-current')
  })

  it('旧详情缺少时段字段时完整保留目录定价，不混入详情单位', () => {
    const view = render(drawer(detailWith({ prices: [{ ...listPrice, unit: 'image', unit_price_yuan: '99' }] })))
    const panel = pricingPanel(view.container)
    expect(panel).toHaveTextContent('目录夜间价')
    expect(panel).toHaveTextContent('00:00–08:00')
    expect(panel).toHaveTextContent('¥2')
    expect(panel).toHaveTextContent(`1 ${i18n.t('console.timePricing.seconds')}`)
    expect(panel).not.toHaveTextContent(`1 ${i18n.t('console.timePricing.images')}`)
    expect(within(panel).getByText('目录夜间价').closest('section')).toHaveClass('is-current')
  })

  it('详情显式返回空时段数组后移除已显示的目录峰谷价', () => {
    const view = render(drawer(null))
    expect(pricingPanel(view.container)).toHaveTextContent('目录夜间价')
    view.rerender(drawer(detailWith({ pricing_periods: [], pricing_timezone: '', current_period_key: '' })))
    expect(view.container.querySelector('.model-time-pricing')).toBeNull()
    expect(screen.queryByText('目录夜间价')).toBeNull()
  })

  it('详情仅有一种定价时移除峰谷价，保留上方价格信息', () => {
    const view = render(drawer(null))
    expect(pricingPanel(view.container)).toHaveTextContent('目录夜间价')
    view.rerender(drawer(detailWith({
      pricing_periods: [{ ...listPeriod, default: true, start_minute: 0, end_minute: 1440 }],
      pricing_timezone: 'UTC', current_period_key: listPeriod.key,
    })))
    expect(view.container.querySelector('.model-time-pricing')).toBeNull()
    expect(screen.getByRole('region', { name: '价格信息' })).toBeInTheDocument()
    expect(view.container.querySelectorAll('.model-detail-price-card')).toHaveLength(4)
  })

  it('详情时段存在但同组字段为空时不借用目录时区、当前标记或价格单位', () => {
    const view = render(drawer(detailWith({
      pricing_periods: withDefaultPeriod({ ...listPeriod, name: '详情独立规则' }),
      pricing_timezone: '', current_period_key: '', prices: null,
    })))
    const panel = pricingPanel(view.container)
    expect(panel).toHaveTextContent('详情独立规则')
    expect(panel).toHaveTextContent(`1 ${i18n.t('console.timePricing.units')}`)
    expect(panel).not.toHaveTextContent('Asia/Shanghai')
    expect(panel).not.toHaveTextContent(`1 ${i18n.t('console.timePricing.seconds')}`)
    expect(within(panel).queryByText(i18n.t('console.timePricing.current'))).toBeNull()
    expect(panel.querySelector('.is-current')).toBeNull()
  })
})
