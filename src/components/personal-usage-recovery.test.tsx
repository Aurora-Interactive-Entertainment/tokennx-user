import '@/i18n'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PersonalTokenHeatmap } from './personal-token-heatmap'
import { PersonalUsageTrendChart } from './personal-usage-trend-chart'
import { PersonalUsageDistributionPies } from './personal-usage-distribution-pies'
import { PersonalUsageManagement } from './personal-usage-management'
import { getDailyTokenUsage, getUsageFilters, getUsageModels, getUsageRecords, getUsageSummary, getUsageTrend, type UsageTrendResponse } from '@/api/personal-usage'

vi.mock('@/api/personal-usage', async (original) => ({ ...await original<object>(), getDailyTokenUsage: vi.fn(), getUsageFilters: vi.fn(), getUsageModels: vi.fn(), getUsageRecords: vi.fn(), getUsageSummary: vi.fn(), getUsageTrend: vi.fn() }))
vi.mock('@/components/app-toast', () => ({ appToast: { error: vi.fn() } }))

const context = { account_type: 'personal' as const }
const dateRange = [new Date(2026, 8, 1), new Date(2026, 8, 2)]
const emptyTrend: UsageTrendResponse = {
  period: { range: 'custom', start_at: 1, end_at: 2, label: '' }, granularity: 'day', x_axis: { type: 'category', boundary_gap: false, data: [] }, y_axis: { type: 'value' }, series: [], can_view_billing: true, metric: 'tokens', buckets: [], model_distribution: [], tool_distribution: [], api_key_distribution: [],
}

beforeEach(() => vi.clearAllMocks())

describe('个人用量错误恢复', () => {
  it('热力图加载失败可以重试并恢复图表', async () => {
    vi.mocked(getDailyTokenUsage).mockRejectedValueOnce(new Error('每日用量暂不可用')).mockResolvedValueOnce({ account: { id: 'personal', name: '个人', type: 'personal' }, start_at: 1, end_at: 2, items: [] })
    const user = userEvent.setup()
    render(<PersonalTokenHeatmap context={context} />)
    await user.click(await screen.findByRole('button', { name: '重试' }))
    expect(await screen.findByRole('grid')).toBeInTheDocument()
    expect(getDailyTokenUsage).toHaveBeenCalledTimes(2)
  })

  it('趋势请求失败可以原地重试', async () => {
    vi.mocked(getUsageTrend).mockRejectedValueOnce(new Error('趋势暂不可用')).mockResolvedValueOnce(emptyTrend)
    const user = userEvent.setup()
    render(<PersonalUsageTrendChart context={context} dateRange={dateRange} />)
    await user.click(await screen.findByRole('button', { name: '重试' }))
    await waitFor(() => expect(getUsageTrend).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('分布图共享失败只保留一个重试入口，并重新读取两个统计口径', async () => {
    vi.mocked(getUsageTrend).mockRejectedValueOnce(new Error('分布暂不可用')).mockResolvedValue(emptyTrend)
    const user = userEvent.setup()
    render(<PersonalUsageDistributionPies context={context} dateRange={dateRange} />)
    await screen.findByRole('button', { name: '重试' })
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(getUsageTrend).toHaveBeenCalledTimes(4))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('筛选目录、摘要和明细分别失败后均可独立重试', async () => {
    vi.mocked(getUsageFilters).mockRejectedValueOnce(new Error('筛选目录暂不可用')).mockResolvedValue({ can_filter_members: false, models: [], api_keys: [], statuses: [], members: [] })
    vi.mocked(getUsageSummary).mockRejectedValue(new Error('摘要暂不可用'))
    vi.mocked(getUsageModels).mockResolvedValue({ can_view_billing: true, items: [], page: 1, page_size: 10, total: 0 })
    vi.mocked(getUsageRecords).mockRejectedValue(new Error('明细暂不可用'))
    const user = userEvent.setup()
    render(<PersonalUsageManagement context={context} onApiKeyChange={() => undefined} />)
    // 摘要和明细在目录首次请求时已开始；目录恢复后应能继续处理各自失败。
    await user.click(await screen.findByRole('button', { name: '重试' }))
    const summaryError = (await screen.findByText('摘要暂不可用')).closest('[role="alert"]') as HTMLElement
    const recordsError = (await screen.findByText('明细暂不可用')).closest('[role="alert"]') as HTMLElement
    vi.mocked(getUsageSummary).mockResolvedValue({ can_view_billing: true, metrics: { request_count: 0, input_tokens: 0, output_tokens: 0, total_cost_yuan: '0', average_latency_ms: null, success_rate: null } })
    vi.mocked(getUsageRecords).mockResolvedValue({ account: { id: 'personal', name: '个人', type: 'personal' }, can_filter_members: false, can_view_billing: true, filters: { models: [], api_keys: [], members: [] }, items: [], page: 1, page_size: 10, total: 0 })
    await user.click(within(summaryError).getByRole('button', { name: '重试' }))
    await user.click(within(recordsError).getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(getUsageFilters).toHaveBeenCalledTimes(2)
  })
})
