import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { useUserModels } from '@/data/user-models'
import { QuickstartGuide } from './quickstart-guide'

vi.mock('@/data/user-models', () => ({ useUserModels: vi.fn() }))

describe('快速接入无数据状态', () => {
  it('空列表保留标题、空状态和可用的重试入口', () => {
    const refresh = vi.fn()
    vi.mocked(useUserModels).mockReturnValue({ models: [], activities: [], total: null, page: null, pageSize: null, loading: false, error: '', refresh })
    render(<MemoryRouter><QuickstartGuide /></MemoryRouter>)
    expect(screen.getByText('几分钟内完成接入')).toBeVisible()
    expect(screen.getByText('暂无可用模型')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
    expect(refresh).toHaveBeenCalledOnce()
  })
  it('请求失败显示错误面板，不再返回空容器', () => {
    vi.mocked(useUserModels).mockReturnValue({ models: [], activities: [], total: null, page: null, pageSize: null, loading: false, error: '服务暂不可用', refresh: vi.fn() })
    render(<MemoryRouter><QuickstartGuide /></MemoryRouter>)
    expect(screen.getByText('模型加载失败')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('服务暂不可用')
  })
})
