import { act, render, screen, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SubscriptionUsageCard } from './subscription-usage-card'

afterEach(() => { cleanup(); vi.useRealTimers() })

// jsdom 不做布局，进度条与气泡的尺寸都由用例直接给出。
const BAR_RECT = { left: 100, top: 200, width: 400, height: 10, right: 500, bottom: 210, x: 100, y: 200, toJSON: () => ({}) } as DOMRect

function stubBarRect(progress: HTMLElement) {
  progress.getBoundingClientRect = () => BAR_RECT
  return progress
}

function tipOf(progress: HTMLElement) {
  return progress.querySelector('.subscription-progress-tip') as HTMLElement | null
}

it('从套餐总量和用量计算精确余量，并在到期后停止显示正倒计时', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-11T00:00:00Z'))
  render(<SubscriptionUsageCard model={{ name: 'Test plan', total_tokens: '1000000', used_tokens: '250000', expires_at: Date.now() + 2000 }} />)
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '剩余 token：750,000')
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
  expect(screen.getByText('过期倒计时：0天 00:00:02')).toBeVisible()
  act(() => vi.advanceTimersByTime(2000))
  expect(screen.getByText('过期倒计时：已过期')).toBeVisible()
})

it('缺失数据不伪装为零，并保留大整数余量精度', () => {
  render(<SubscriptionUsageCard model={{ name: 'Test plan', remaining_tokens: '9007199254740993' }} />)
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '剩余 token：9,007,199,254,740,993')
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
  expect(screen.getByText('当前套餐token总量：—')).toBeVisible()
  expect(screen.getByText('过期倒计时：—')).toBeVisible()
})

it('按请求次数模式展示额度，并保留 Token 小数精度', () => {
  render(<SubscriptionUsageCard model={{ name: 'Request plan', quota_mode: 'request_quota', total_requests: '100', used_requests: '25', remaining_requests: '75' }} />)
  expect(screen.getByText('当前套餐请求次数总量：100')).toBeVisible()
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '剩余请求次数：75')
  cleanup()
  render(<SubscriptionUsageCard model={{ name: 'Decimal plan', total_tokens: '1000.500000000', remaining_tokens: '999.25' }} />)
  expect(screen.getByText('当前套餐token总量：1,000.5')).toBeVisible()
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '剩余 token：999.25')
})

it('提示跟随鼠标，气泡贴边后箭头仍指向鼠标', () => {
  render(<SubscriptionUsageCard model={{ name: 'Test plan', total_tokens: '1000', used_tokens: '400' }} />)
  const progress = stubBarRect(screen.getByRole('progressbar'))

  // 尚未量到气泡宽度时先按鼠标位置渲染，布局阶段量到宽度后再收拢。
  fireEvent.pointerMove(progress, { clientX: 300 })
  const tip = tipOf(progress)
  expect(tip).toHaveTextContent('剩余 token：600')
  expect(tip?.style.transform).toBe('translateX(calc(200px - 50%))')

  // 气泡贴到左边界停靠，箭头平移到 9px 处，尖角仍落在鼠标所在的 10px。
  Object.defineProperty(tip, 'offsetWidth', { configurable: true, value: 150 })
  Object.defineProperty(tip, 'clientWidth', { configurable: true, value: 148 })
  fireEvent.pointerMove(progress, { clientX: 110 })
  expect(tip?.style.transform).toBe('translateX(calc(75px - 50%))')
  expect(tip?.style.getPropertyValue('--follow-tip-arrow')).toBe('9px')

  fireEvent.pointerOut(progress, { relatedTarget: document.body })
  expect(tipOf(progress)).toBeNull()
})

it('触屏不跟随鼠标，键盘聚焦时仍展示提示', () => {
  render(<SubscriptionUsageCard model={{ name: 'Test plan', total_tokens: '1000', used_tokens: '400' }} />)
  const progress = stubBarRect(screen.getByRole('progressbar'))

  fireEvent.pointerMove(progress, { clientX: 300, pointerType: 'touch' })
  expect(tipOf(progress)).toBeNull()

  act(() => { progress.focus() })
  expect(tipOf(progress)?.style.transform).toBe('translateX(calc(160px - 50%))')

  act(() => { progress.blur() })
  expect(tipOf(progress)).toBeNull()
})
