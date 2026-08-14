import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/http'
import type { UsageSummaryResponse } from '@/api/usage-records'
import { AppStoreProvider } from '@/data/app-state'
import { createAppStore } from '@/store'
import { UsagePage } from './usage'

const { getUsageSummaryMock } = vi.hoisted(() => ({ getUsageSummaryMock: vi.fn() }))

vi.mock('@/api/usage-records', async () => {
  const actual = await vi.importActual<typeof import('@/api/usage-records')>('@/api/usage-records')
  return { ...actual, getUsageSummary: getUsageSummaryMock }
})

vi.mock('@/components/usage-charts', () => ({
  UsageTrendChart: ({ metric }: { metric: string }) => <div data-testid="usage-trend-metric">{metric}</div>,
  UsageDistributionChart: ({ tone }: { tone: string }) => <div data-testid={`usage-distribution-${tone}`} />,
}))

function makeSummary(): UsageSummaryResponse {
  return {
    account: { id: 'account-personal', type: 'personal', name: '个人空间' },
    can_filter_members: false,
    can_view_billing: true,
    filters: {
      api_keys: [{ id: 'key-1', name: '生产密钥', source: 'api' }],
      models: [{ code: 'gpt-test', alias: 'gpt-public', name: '测试模型', vendor: '测试厂商' }],
      members: [],
    },
    period: { range: '7d', start_at: Date.parse('2026-07-18T00:00:00Z'), end_at: Date.parse('2026-07-24T23:59:59Z'), label: '最近 7 天' },
    metrics: {
      request_count: 12,
      success_count: 11,
      error_count: 1,
      cancelled_count: 0,
      input_tokens: 5360,
      output_tokens: 2360,
      cached_tokens: 320,
      total_cost_yuan: '49.450000000',
      average_latency_ms: 658,
      success_rate: 91.7,
    },
    trend: [{ date: '2026-07-23', request_count: 4, success_count: 4, error_count: 0, cancelled_count: 0, input_tokens: 1200, output_tokens: 600, cached_tokens: 40, cost_yuan: '10.000000000', average_latency_ms: 600 }],
    models: [{ code: 'gpt-test', alias: 'gpt-public', name: '测试模型', requests: 12, input_tokens: 5360, output_tokens: 2360, cached_tokens: 320, cost_yuan: '49.450000000', average_latency_ms: 658 }],
    api_keys: [{ id: 'key-1', name: '生产密钥', requests: 12, input_tokens: 5360, output_tokens: 2360, cached_tokens: 320, cost_yuan: '49.450000000', average_latency_ms: 658 }],
    sources: [{ name: 'API 调用', requests: 12, input_tokens: 5360, output_tokens: 2360, cached_tokens: 320, cost_yuan: '49.450000000', average_latency_ms: 658 }],
    model_rows: [{ model_code: 'gpt-test', model_alias: 'gpt-public', model_name: '测试模型', vendor: '测试厂商', requests: 12, input_tokens: 5360, output_tokens: 2360, cached_tokens: 320, cost_yuan: '49.450000000', average_latency_ms: 658 }],
    page: 1,
    page_size: 20,
    total_models: 1,
  }
}

function renderPage() {
  return render(<MemoryRouter initialEntries={['/console/usage']}><Provider store={createAppStore()}><AppStoreProvider><UsagePage /></AppStoreProvider></Provider></MemoryRouter>)
}

function renderEnterprisePage() {
  window.localStorage.setItem('token-nx:user-front:v1', JSON.stringify({
    activeWorkspaceId: 'enterprise-1',
    workspaces: [{ id: 'enterprise-1', name: '示例企业', type: 'enterprise', role: 'owner' }],
  }))
  return render(<MemoryRouter initialEntries={['/console/enterprise-usage']}><Provider store={createAppStore()}><AppStoreProvider><UsagePage enterprise /></AppStoreProvider></Provider></MemoryRouter>)
}

describe('用户用量统计页面', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.removeItem('token-nx:user-front:v1')
    getUsageSummaryMock.mockResolvedValue(makeSummary())
  })

  it('加载真实摘要数据，展示指标、图表入口和模型明细', async () => {
    const user = userEvent.setup()
    renderPage()

    expect((await screen.findAllByText('¥49.450')).length).toBeGreaterThanOrEqual(2)
    expect((await screen.findAllByTitle('¥49.450000000')).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('12 次')).toBeInTheDocument()
    expect(await screen.findByText('测试模型')).toBeInTheDocument()
    expect(screen.getByTestId('usage-distribution-model')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看调用记录' })).toHaveAttribute('href', '/console/records?model=gpt-public')
    expect(getUsageSummaryMock).toHaveBeenCalledWith(expect.objectContaining({ account_type: 'personal' }), expect.objectContaining({ range: '7d', source: 'all' }))

    await user.click(screen.getByRole('button', { name: '费用' }))
    expect(screen.getByTestId('usage-trend-metric')).toHaveTextContent('cost')
    await user.selectOptions(screen.getByLabelText('模型'), 'gpt-public')
    await waitFor(() => expect(getUsageSummaryMock).toHaveBeenCalledWith(expect.objectContaining({ account_type: 'personal' }), expect.objectContaining({ model: 'gpt-public' })))
  })

  it('支持自定义日期筛选并展示接口错误与请求编号', async () => {
    const user = userEvent.setup()
    getUsageSummaryMock.mockRejectedValueOnce(new ApiError('summary failed', 503, 100002, 'summary-request-id'))
    renderPage()

    expect((await screen.findAllByText('用量统计服务暂时不可用，请稍后重试')).length).toBeGreaterThanOrEqual(1)
    expect((await screen.findAllByText('请求 ID：summary-request-id')).length).toBeGreaterThanOrEqual(1)
    await user.click(screen.getByRole('button', { name: '自定义' }))
    expect(screen.getByLabelText('开始日期')).toBeInTheDocument()
    expect(screen.getByLabelText('结束日期')).toBeInTheDocument()
  })

  it('企业路由使用真实企业上下文并展示成员筛选', async () => {
    const enterpriseSummary = makeSummary()
    enterpriseSummary.account = { id: 'account-enterprise', type: 'enterprise', name: '示例企业' }
    enterpriseSummary.can_filter_members = true
    enterpriseSummary.filters.members = [{ id: 'member-1', name: '企业成员' }]
    getUsageSummaryMock.mockResolvedValueOnce(enterpriseSummary)
    renderEnterprisePage()

    expect(await screen.findByText('企业用量管理')).toBeInTheDocument()
    expect(screen.getByLabelText('成员')).toBeInTheDocument()
    expect(getUsageSummaryMock).toHaveBeenCalledWith(expect.objectContaining({ account_type: 'enterprise', enterprise_id: 'enterprise-1' }), expect.objectContaining({ range: '7d', source: 'all' }))
  })

  it('个人空间直接打开企业路由时不请求个人用量数据', () => {
    render(<MemoryRouter initialEntries={['/console/enterprise-usage']}><Provider store={createAppStore()}><AppStoreProvider><UsagePage enterprise /></AppStoreProvider></Provider></MemoryRouter>)

    expect(screen.getByText('请先切换到企业空间，再查看企业用量统计。')).toBeInTheDocument()
    expect(getUsageSummaryMock).not.toHaveBeenCalled()
  })
})
