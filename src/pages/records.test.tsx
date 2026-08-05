import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppStoreProvider } from '@/data/app-state'
import { createAppStore } from '@/store'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import i18n from '@/i18n'
import type { UsageRecordItem } from '@/api/usage-records'
import { RecordsPage } from './records'

const RECORD_ID = 'event-record-1'
const REQUEST_ID = 'request-record-1'

const RECORD: UsageRecordItem = {
  id: RECORD_ID,
  request_id: REQUEST_ID,
  event_type: 'request.completed',
  occurred_at: '2026-07-23T08:30:00.150Z',
  model_code: 'gpt-test',
  model_alias: 'gpt-public',
  model_name: '测试模型',
  client_platform: 'codex',
  status: 'success',
  source: 'api',
  api_key_id: 'key-record-1',
  api_key_name: '测试密钥',
  member_id: 'user-record-1',
  member_name: '测试用户',
  input_tokens: 100,
  output_tokens: 40,
  cached_tokens: 25,
  cache_hit_rate: 25,
  latency_ms: 150,
  first_token_ms: 60,
  stream: true,
  relay_format: 'openai',
  cost_yuan: '1.500000000',
  status_code: 200,
  error_code: '',
  error_message: '',
  channel: '测试渠道',
  task_id: '',
  task_status: '',
  task_reason: '',
}

function responseData(items = [RECORD], total = items.length) {
  return {
    account: { id: 'account-records', type: 'personal', name: '个人空间' },
    can_filter_members: false,
    can_view_billing: true,
    filters: {
      api_keys: [{ id: 'key-record-1', name: '测试密钥', source: 'api' }],
      models: [{ code: 'gpt-test', alias: 'gpt-public', name: '测试模型', vendor: '测试厂商' }],
      members: [],
    },
    items,
    page: 1,
    page_size: 20,
    total,
  }
}

function apiResponse(data: unknown, status = 200, code = 0, requestId = 'records-page-request'): Response {
  return new Response(JSON.stringify({ code, msg: status === 200 ? 'success' : '服务暂时不可用', data }), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
  })
}

function renderRecords(initialEntry = '/console/records') {
  saveAuthTokens({ status: 'succeeded', binding_required: false, access_token: 'records-access-token', refresh_token: 'records-refresh-token', refresh_expires_at: Date.UTC(2099, 0, 1) })
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Provider store={createAppStore()}>
        <AppStoreProvider><RecordsPage /></AppStoreProvider>
      </Provider>
    </MemoryRouter>,
  )
}

describe('调用记录页面', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN')
    vi.restoreAllMocks()
    clearAuthTokens()
    window.localStorage.clear()
  })

  afterEach(async () => {
    await i18n.changeLanguage('zh-CN')
  })

  // 中文：验证账单和密钥页面的深链可以直接打开对应调用详情，并保留复制入口。
  it('支持请求深链、详情弹窗和请求 ID 复制', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse(responseData()))
    renderRecords(`/console/records?request=${REQUEST_ID}`)

    expect(await screen.findByRole('heading', { name: /调用详情/ })).toBeInTheDocument()
    expect(screen.getAllByText('¥1.500').length).toBe(2)
    expect(screen.getAllByTitle('¥1.500000000').length).toBe(2)
    expect(screen.getByText('调用正文未保存')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^关闭$/ }))
    await user.click(screen.getByRole('button', { name: `复制请求 ID ${REQUEST_ID}` }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(REQUEST_ID))
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes(`request_id=${REQUEST_ID}`))).toBe(true)
    expect(screen.getByText('Codex')).toBeInTheDocument()
  })

  // 中文：筛选条件应触发新的服务端查询，而不是只在当前页做本地过滤。
  it('按状态筛选并把条件同步到接口查询', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse(responseData()))
    renderRecords()

    await screen.findByText(REQUEST_ID)
    await user.selectOptions(screen.getByRole('combobox', { name: '状态' }), 'error')

    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes('status=error'))).toBe(true))
  })

  // 中文：后端返回毫秒时间戳时，页面显示和 time 语义值都不能直接暴露原始数字。
  it('将毫秒时间戳转换为可读时间和 ISO 语义值', async () => {
    const timestamp = Date.parse('2026-07-23T08:30:00.150Z')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse(responseData([{ ...RECORD, occurred_at: timestamp }])))
    renderRecords()

    await screen.findByText(REQUEST_ID)
    const time = document.querySelector('time')
    expect(time).not.toBeNull()
    expect(time).toHaveAttribute('dateTime', new Date(timestamp).toISOString())
    expect(time).not.toHaveTextContent(String(timestamp))
  })

  // 中文：服务端故障必须显示可恢复的错误状态，并保留请求编号供排障。
  it('服务端失败时展示错误恢复入口', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse({}, 503, 100002, 'records-unavailable'))
    renderRecords()

    const errorText = await screen.findByText(/调用记录服务暂时不可用/)
    const alert = errorText.closest('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert).toHaveTextContent('调用记录服务暂时不可用')
    expect(alert).toHaveTextContent('records-unavailable')
    expect(screen.getAllByRole('button', { name: /重新加载/ }).length).toBeGreaterThan(0)
  })

  it('英文记录使用翻译后的异步任务和耗时单位', async () => {
    await i18n.changeLanguage('en-US')
    const taskRecord = { ...RECORD, relay_format: 'task' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse(responseData([taskRecord])))
    renderRecords(`/console/records?request=${REQUEST_ID}`)

    expect(await screen.findByRole('heading', { name: /Request details/ })).toBeInTheDocument()
    expect(screen.getByText('Async task')).toBeInTheDocument()
    expect(screen.getAllByText('0.15s').length).toBeGreaterThan(0)
    expect(screen.getAllByText('0.06s').length).toBeGreaterThan(0)
  })
})
