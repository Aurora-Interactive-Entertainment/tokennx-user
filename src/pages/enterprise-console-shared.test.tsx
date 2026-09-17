import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EnterpriseError } from './enterprise-console-shared'

vi.mock('@/components/app-toast', () => ({ appToast: { error: vi.fn() } }))

describe('企业持久错误状态', () => {
  it('保留错误原因、请求 ID 和可用的重试按钮', () => {
    const retry = vi.fn()
    render(<EnterpriseError message="加载失败" requestId="request-test" onRetry={retry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('加载失败')
    expect(screen.getByRole('alert')).toHaveTextContent('request-test')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('没有请求 ID 时仍允许重试', () => {
    const retry = vi.fn()
    render(<EnterpriseError message="网络暂不可用" requestId={null} onRetry={retry} />)
    expect(screen.getByRole('alert')).not.toHaveTextContent('请求 ID')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(retry).toHaveBeenCalledOnce()
  })
})
