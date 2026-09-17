import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import i18n from '@/i18n'
import { getPublicModelMarket, type PublicModelMarket } from '@/api/public-model-market'
import { ModelsPublicPage } from './public'

vi.mock('@/api/public-model-market', () => ({ getPublicModelMarket: vi.fn() }))
vi.mock('@/components/common', () => ({
  PublicLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  ModelLogo: () => <span />,
  LoginRequiredAction: ({ children, returnPath }: { children: ReactNode; returnPath: string }) => <a href={returnPath}>{children}</a>,
  LoginPanel: () => null, ManuscriptSupportWidget: () => null, requestSupportWidget: vi.fn(),
}))

const catalog: PublicModelMarket = {
  version: '1', carousels: [],
  topics: [{ id: 'text', status: 'active', sort_order: 0, name: '文本模型', model_ids: ['live-model'], models: [{ id: 'live-model', alias: 'live-model', name: 'Live model', company: 'Example', modality: 'text', description: '接口返回的说明', prices: [
    { meter_code: 'cache_read_token', meter_kind: 'cache_read_token', unit: 'token', currency: 'CNY', unit_quantity: 1000000, unit_price_yuan: '1.6' },
    { meter_code: 'input_token', meter_kind: 'input', unit: 'token', currency: 'CNY', unit_quantity: 1000, unit_price_yuan: '0.002', tier_no: 1, lower_bound: 0 },
    { meter_code: 'output_token', meter_kind: 'output', unit: 'token', currency: 'USD', unit_quantity: 1000000, unit_price_yuan: '4.0001', tier_no: 1, lower_bound: 0 },
    { meter_kind: 'video', unit: 'second', currency: 'CNY', unit_quantity: 1, unit_price_yuan: '0.000001' },
  ], template_pricing_timezone: 'Asia/Shanghai', template_pricing_periods: [{
    key: 'default', name: '默认原价', default: true, weekday_mask: 127, start_minute: 0, end_minute: 1440,
    rules: [
      { kind: 'token', meter_code: 'input_token', tier_no: 1, lower_bound: 0, unit_quantity: 1000, unit_price_yuan: '0.003', rounding_mode: 'up' },
      { kind: 'token', meter_code: 'output_token', tier_no: 1, lower_bound: 0, unit_quantity: 1000000, unit_price_yuan: '9.500000000000', rounding_mode: 'up' },
    ],
  }], template_prices: [{
    meter_type: 'output_token', meter_unit: 'token', tier_no: 1, tier_condition_meter: '', tier_lower_bound: '0', tier_upper_bound: '',
    currency: 'USD', unit_quantity: 1000000, unit_price: '6.500000000000', price_type_description: '', discount_description: '',
    discount_validity: '', limited_free: false, source_url: '', captured_on: '',
  }] }] }],
}

beforeEach(async () => { vi.resetAllMocks(); await i18n.changeLanguage('zh-CN') })
afterEach(async () => { await i18n.changeLanguage('zh-CN') })
const renderCatalog = () => render(<MemoryRouter><ModelsPublicPage /></MemoryRouter>)

describe('公开模型真实数据与计费单位', () => {
  it('加载与失败不展示示例价格，失败后可以重试真实目录', async () => {
    let reject!: (error: Error) => void
    vi.mocked(getPublicModelMarket).mockImplementationOnce(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise }))
    renderCatalog()
    expect(screen.getByRole('status')).toHaveTextContent('正在加载模型目录')
    expect(document.querySelector('.models-showcase-card')).toBeNull()
    await act(async () => reject(new Error('offline')))
    expect(await screen.findByRole('alert')).toHaveTextContent('模型目录加载失败')
    expect(screen.queryByText('DeepSeek V3')).toBeNull()
    vi.mocked(getPublicModelMarket).mockResolvedValueOnce(catalog)
    await userEvent.click(screen.getByRole('button', { name: '重新加载' }))
    expect(await screen.findByText('Live model')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('卡片只展示接口输入输出原价和现价，保留数量、币种并过滤额外计费项', async () => {
    vi.mocked(getPublicModelMarket).mockResolvedValue(catalog)
    renderCatalog()
    const card = (await screen.findByText('Live model')).closest('article')!
    expect(within(card).getByText('输入 / 1000 token')).toBeInTheDocument()
    expect(within(card).getByText('输出 / M Tokens')).toBeInTheDocument()
    const input = within(card).getByText('输入 / 1000 token').closest('div')!
    const output = within(card).getByText('输出 / M Tokens').closest('div')!
    expect(input.querySelector('del')).toHaveTextContent('¥0.003')
    expect(input.querySelector('strong')).toHaveTextContent('¥0.002')
    expect(output.querySelector('del')).toHaveTextContent('¥9.5')
    expect(output.querySelector('strong')).toHaveTextContent('USD4.0001')
    expect(card.querySelectorAll('dt')).toHaveLength(2)
    expect(card).not.toHaveTextContent('缓存命中')
    expect(card).not.toHaveTextContent('使用价格 / second')
    expect(card).not.toHaveTextContent('¥0.000001')
  })

  it('空目录展示空状态而非示例模型', async () => {
    vi.mocked(getPublicModelMarket).mockResolvedValue({ version: '1', carousels: [], topics: [] })
    renderCatalog()
    expect(await screen.findByText('暂无公开模型')).toBeInTheDocument()
    expect(document.querySelector('.models-showcase-card')).toBeNull()
    expect(screen.queryByText('Deepseek V4 Pro')).toBeNull()
  })

  it('切语言重新请求并取消旧语言请求', async () => {
    vi.mocked(getPublicModelMarket).mockResolvedValue(catalog)
    renderCatalog()
    await screen.findByText('Live model')
    const firstSignal = vi.mocked(getPublicModelMarket).mock.calls[0][0]
    await act(async () => { await i18n.changeLanguage('en-US') })
    await waitFor(() => expect(getPublicModelMarket).toHaveBeenCalledTimes(2))
    expect(firstSignal?.aborted).toBe(true)
    expect(await screen.findByText('Input / 1000 token')).toBeInTheDocument()
  })
})
