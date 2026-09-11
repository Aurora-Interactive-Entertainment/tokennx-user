import { act, render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SubscriptionUsageCard } from './subscription-usage-card'

afterEach(() => { cleanup(); vi.useRealTimers() })

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
