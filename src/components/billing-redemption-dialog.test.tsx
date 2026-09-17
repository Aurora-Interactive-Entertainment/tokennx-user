import '@/i18n'
import { act, fireEvent, render, screen } from '@testing-library/react'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { BillingRedemptionDialog } from './billing-redemption-dialog'

it('未修改的无效兑换码每次点击提交都提供一次提示', () => {
  vi.useFakeTimers()
  const error = vi.spyOn(Toast, 'error').mockImplementation(() => '')
  try {
    render(<BillingRedemptionDialog visible onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }))
    // 模拟首条提示消失后再次提交，同时越过 Semi 按钮自身的防抖窗口。
    act(() => vi.advanceTimersByTime(4000))
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }))
    expect(error).toHaveBeenCalledTimes(2)
    expect(error).toHaveBeenLastCalledWith(i18n.t('console.billing.redeemCodeInvalid'))
  } finally {
    error.mockRestore()
    vi.useRealTimers()
  }
})
