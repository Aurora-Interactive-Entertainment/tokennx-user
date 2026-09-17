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
    { meter_kind: 'input', unit: 'token', currency: 'CNY', unit_quantity: 1000, unit_price_yuan: '0.002' },
    { meter_kind: 'output', unit: 'token', currency: 'USD', unit_quantity: 1000000, unit_price_yuan: '4.0001' },
    { meter_kind: 'video', unit: 'second', currency: 'CNY', unit_quantity: 1, unit_price_yuan: '0.000001' },
  ] }] }],
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

  it('保留原始数量、币种和按秒价格，不误标每百万', async () => {
    vi.mocked(getPublicModelMarket).mockResolvedValue(catalog)
    renderCatalog()
    const card = (await screen.findByText('Live model')).closest('article')!
    expect(within(card).getByText('输入 / 1000 token')).toBeInTheDocument()
    expect(within(card).getByText('输出 / M Tokens')).toBeInTheDocument()
    expect(card).toHaveTextContent('¥0.002')
    expect(card).toHaveTextContent('USD4.0001')
    expect(card).toHaveTextContent('使用价格 / second')
    expect(card).toHaveTextContent('¥0.000001')
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
