import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import type { PublicMarketPrice } from '@/api/public-model-market'
import { PublicModelPrices } from './public-model-prices'

const basePrice: PublicMarketPrice = { meter_kind: 'output_token', unit: 'token', currency: 'CNY', unit_quantity: 1_000_000, unit_price_yuan: '12.000000000000' }

beforeEach(async () => { await i18n.changeLanguage('zh-CN') })
afterEach(async () => { await i18n.changeLanguage('zh-CN') })

describe('公开模型价格规格', () => {
  it('显示缓存命中和缓存创建价格，切换语言同步更新标签', async () => {
    render(<PublicModelPrices prices={[{ ...basePrice, meter_kind: 'cache_read_token' }, { ...basePrice, meter_kind: 'cache_creation_token' }]} />)
    expect(screen.getByText('缓存命中价格 / M Tokens')).toBeInTheDocument()
    expect(screen.getByText('缓存创建价格 / M Tokens')).toBeInTheDocument()
    await act(async () => { await i18n.changeLanguage('en-US') })
    expect(screen.getByText('Cache-hit price / M Tokens')).toBeInTheDocument()
    expect(screen.getByText('Cache-creation price / M Tokens')).toBeInTheDocument()
  })

  it('相同输出计费项按真实分辨率和是否输入视频区分', async () => {
    render(<PublicModelPrices prices={[
      { ...basePrice, conditions: { resolution: '720p', video_input: 'false' } },
      { ...basePrice, unit_price_yuan: '18.000000000000', conditions: { resolution: '720p', video_input: 'true' } },
    ]} />)
    expect(screen.getAllByText('分辨率: 720p')).toHaveLength(2)
    expect(screen.getByText('不含视频输入').closest('div')).toHaveTextContent('¥12')
    expect(screen.getByText('包含视频输入').closest('div')).toHaveTextContent('¥18')
    expect(screen.queryByText(/价格档位/)).toBeNull()
    await act(async () => { await i18n.changeLanguage('en-US') })
    expect(screen.getByText('Without video input')).toBeInTheDocument()
    expect(screen.getByText('With video input')).toBeInTheDocument()
    expect(screen.getAllByText('Resolution: 720p')).toHaveLength(2)
  })

  it('接受布尔输入条件，未知值和条件原样可读且不推测语义', () => {
    render(<PublicModelPrices prices={[
      { ...basePrice, conditions: { video_input: false, fps: 24, modes: ['standard', 'fast'], video_mode: '<script>other</script>' } },
      { ...basePrice, conditions: { video_input: 'optional', range: { min: 1, max: 10 } } },
    ]} />)
    expect(screen.getByText('不含视频输入')).toBeInTheDocument()
    expect(screen.getByText('fps: 24')).toBeInTheDocument()
    expect(screen.getByText('modes: ["standard","fast"]')).toBeInTheDocument()
    expect(screen.getByText('video_mode: <script>other</script>')).toBeInTheDocument()
    expect(screen.getByText('video_input: optional')).toBeInTheDocument()
    expect(screen.getByText('range: {"min":1,"max":10}')).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
  })

  it('缺少可区分条件的多个报价明确标注不同档位且不虚构阈值', () => {
    render(<PublicModelPrices prices={[basePrice, { ...basePrice, unit_price_yuan: '18' }]} />)
    expect(screen.getByText('价格档位 1').closest('div')).toHaveTextContent('¥12')
    expect(screen.getByText('价格档位 2').closest('div')).toHaveTextContent('¥18')
  })

  it('保留正常计费单位、币种和精度 title，移除不必要尾零', () => {
    render(<PublicModelPrices prices={[
      { ...basePrice, meter_kind: 'input_token', unit_quantity: 1000, unit_price_yuan: '0.002000000000' },
      { ...basePrice, currency: 'USD', unit_price_yuan: '4.000100000000' },
      { ...basePrice, meter_kind: 'video', unit: 'second', unit_quantity: 1, unit_price_yuan: '0.000001000000' },
    ]} />)
    expect(screen.getByText('输入 / 1000 token')).toBeInTheDocument()
    expect(screen.getByText('使用价格 / second')).toBeInTheDocument()
    expect(screen.getByTitle('¥ 0.002000000000 / 1000 token')).toHaveTextContent('¥0.002')
    expect(screen.getByTitle('USD 4.000100000000 / M Tokens')).toHaveTextContent('USD4.0001')
    expect(screen.getByTitle('¥ 0.000001000000 / second')).toHaveTextContent('¥0.000001')
  })

  it('无报价或非法分母继续展示不可用状态', () => {
    const { rerender } = render(<PublicModelPrices prices={[]} />)
    expect(screen.getByText(i18n.t('public.priceSummary.pending'))).toBeInTheDocument()
    rerender(<PublicModelPrices prices={[{ ...basePrice, unit_quantity: 0 }]} />)
    expect(screen.getByText('--')).toBeInTheDocument()
    expect(screen.queryByTitle(/CNY|¥/)).toBeNull()
  })
})
