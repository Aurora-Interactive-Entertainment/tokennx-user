import '@/i18n'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResult } from '@/api/auth'
import type { BillingAnalysisResponse, BillingInvoiceItem, BillingInvoiceResponse } from '@/api/billing'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import { AppStoreProvider, useAppStore } from '@/data/app-state'
import { createAppStore } from '@/store'
import i18n from '@/i18n'
import { BillingPage, billingContextForWorkspace, billingContextKey, ledgerKindLabel, statementKindLabel, validateInvoiceForm } from './billing'

const AUTH_RESULT: AuthResult = {
  status: 'succeeded',
  binding_required: false,
  access_token: 'billing-access-token',
  refresh_token: 'billing-refresh-token',
  access_expires_at: Date.UTC(2099, 0, 1, 0, 15),
  refresh_expires_at: Date.UTC(2099, 1, 1),
  user: {
    id: 'user-1',
    display_name: '账务用户',
    avatar_url: '',
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    status: 'active',
  },
}

function apiResponse(data: unknown, status = 200, code = 0, msg = 'success', requestId = 'billing-request-id'): Response {
  return new Response(JSON.stringify({ code, msg, data }), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
  })
}

function makeAnalysis(enterprise = false, walletOverrides: Partial<BillingAnalysisResponse['wallet']> = {}): BillingAnalysisResponse {
  const accountType = enterprise ? 'enterprise' : 'personal'
  const accountName = enterprise ? '真实关联企业' : '本地演示工作区'
  return {
    account: { id: enterprise ? 'enterprise-account' : 'personal-account', type: accountType, name: accountName },
    wallet: {
      currency: 'CNY',
      status: 'active',
      paid_available_yuan: enterprise ? '200.000000000' : '100.000000000',
      bonus_available_yuan: '10.000000000',
      total_available_yuan: enterprise ? '210.000000000' : '110.000000000',
      debt_yuan: '0.000000000',
      total_balance_yuan: enterprise ? '210.000000000' : '110.000000000',
      ...walletOverrides,
    },
    period: { value: '2026-07', label: '2026年7月', start: Date.parse('2026-07-01T00:00:00Z'), end: Date.parse('2026-08-01T00:00:00Z') },
    filters: {
      periods: [
        { value: '2026-07', label: '2026年7月' },
        { value: '2026-06', label: '2026年6月' },
      ],
      api_keys: [{ id: 'key-public-1', name: '主密钥', masked_key: 'sk-test...1234', status: 'active' }],
      models: [{ code: 'gpt-test', alias: 'gpt-public', name: '测试模型', vendor: '测试厂商' }],
    },
    metrics: {
      total_cost_yuan: '49.450000000',
      input_cost_yuan: '20.000000000',
      output_cost_yuan: '29.450000000',
      average_request_cost_yuan: '4.120000000',
      average_million_token_yuan: '12.345000000',
      billable_amount_yuan: '50.00',
      request_count: '12',
      input_tokens: '5360000',
      output_tokens: '2360000',
      image_count: '2',
      audio_count: '1',
      video_count: '3',
      image_cost_yuan: '0.300000000',
      audio_cost_yuan: '0.400000000',
      video_cost_yuan: '0.500000000',
    },
    ledger: {
      items: [
        {
          id: 'ledger-usage',
          occurred_at: Date.parse('2026-07-23T08:30:00Z'),
          kind: 'model_consume',
          channel: 'OpenAI 渠道',
          description: '模型消费',
          amount_yuan: '4.120000000',
          direction: 'expense',
          balance_after_yuan: '105.880000000',
          api_key_id: 'key-public-1',
          model_code: 'gpt-test',
          model_alias: 'gpt-public',
          request_id: 'request-usage-1',
        },
        {
          id: 'ledger-recharge',
          occurred_at: Date.parse('2026-07-22T08:30:00Z'),
          kind: 'recharge',
          channel: '充值',
          description: '充值到账',
          amount_yuan: '50.000000000',
          direction: 'income',
          balance_after_yuan: '',
          request_id: 'ORDER-1',
        },
        {
          id: 'ledger-reward',
          occurred_at: Date.parse('2026-07-21T08:30:00Z'),
          kind: 'reward',
          channel: '赠送',
          description: '奖励发放: 注册奖励',
          amount_yuan: '10.000000000',
          direction: 'income',
          balance_after_yuan: '110.000000000',
          request_id: 'reward-event-1',
        },
      ],
      page: 1,
      page_size: 20,
      total: 3,
    },
  }
}

function makeInvoice(overrides: Partial<BillingInvoiceItem> = {}): BillingInvoiceItem {
  return {
    id: 'invoice-1',
    request_no: 'INV-202607230001',
    amount_yuan: '20.00',
    status: 'submitted',
    status_label: '开票中',
    title_masked: '本地演示工作区',
    submitted_at: Date.parse('2026-07-23T08:30:00Z'),
    completed_at: null,
    invoice_type: 'normal',
    file_type: '',
    download_url: '',
    ...overrides,
  }
}

function makeInvoices(item: BillingInvoiceItem = makeInvoice()): BillingInvoiceResponse {
  return {
    account: { id: 'personal-account', type: 'personal', name: '本地演示工作区' },
    available_amount_yuan: '50.00',
    issued_amount_yuan: '100.00',
    pending_amount_yuan: '20.00',
    issued_count: 1,
    pending_count: 1,
    history: { items: [item], page: 1, page_size: 20, total: 1 },
  }
}

function WorkspaceControl() {
  const store = useAppStore()
  return <button type="button" onClick={() => {
    store.replaceEnterpriseWorkspaces([{ id: 'enterprise-real', name: '真实关联企业', type: 'enterprise', role: 'member' }])
    store.switchWorkspace('enterprise-real')
  }}>切换到企业空间</button>
}

function renderBilling(config: { analysisError?: boolean; invoiceError?: boolean; requestId?: string; paymentReturnOrderID?: string; paymentStatus?: string; tab?: string; invoice?: BillingInvoiceItem; analysisWallet?: Partial<BillingAnalysisResponse['wallet']>; paymentFormHTML?: string } = {}) {
  const appStore = createAppStore()
  appStore.dispatch({ type: 'auth/loginWithEmail/fulfilled', payload: AUTH_RESULT.user })
    const analysis = makeAnalysis(false, config.analysisWallet)
  const invoices = makeInvoices(config.invoice)
  let postInput: { body: string; headers: Headers } | null = null
  let paymentOrderInput: { body: string; headers: Headers } | null = null
  let paymentStartInput: { body: string; headers: Headers } | null = null
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, requestOptions) => {
    const url = new URL(String(input), window.location.origin)
    if (url.pathname === '/api/auth/refresh') return apiResponse({ ...AUTH_RESULT, access_token: 'refreshed-access-token', refresh_token: 'rotated-refresh-token' })
    if (url.pathname === '/api/user/billing/analysis') {
      if (config.analysisError) return apiResponse({}, 403, 120001, '无权限', 'analysis-denied')
      return apiResponse(url.searchParams.get('account_type') === 'enterprise' ? makeAnalysis(true) : analysis)
    }
    if (url.pathname === '/api/user/payment/orders' && requestOptions?.method === 'POST') {
      paymentOrderInput = { body: String(requestOptions.body), headers: new Headers(requestOptions.headers) }
      return apiResponse({ id: 'payment-order-1', order_no: 'PAY-202608040001', status: 'pending', amount_yuan: '500.00' })
    }
    if (url.pathname === '/api/user/payment/orders/payment-order-1/pay' && requestOptions?.method === 'POST') {
      paymentStartInput = { body: String(requestOptions.body), headers: new Headers(requestOptions.headers) }
      return apiResponse({ order: { id: 'payment-order-1', order_no: 'PAY-202608040001', status: 'paying' }, transaction: { id: 'payment-transaction-1' }, form_html: config.paymentFormHTML ?? '<form action="https://openapi.alipay.com/gateway.do" method="POST"><input name="sign" value="payment-signature"></form>' })
    }
    if (url.pathname === '/api/user/payment/orders/payment-order-1') {
      return apiResponse({ id: 'payment-order-1', order_no: 'PAY-202608040001', status: config.paymentStatus ?? 'paid' })
    }
    if (url.pathname === '/api/user/billing/invoices' && requestOptions?.method === 'POST') {
      postInput = { body: String(requestOptions.body), headers: new Headers(requestOptions.headers) }
      return apiResponse(makeInvoice({ status: 'submitted', status_label: '开票中' }))
    }
    if (url.pathname.endsWith('/download')) return new Response('invoice-bytes', { status: 200, headers: { 'Content-Type': 'application/pdf' } })
    if (url.pathname === '/api/user/billing/invoices') {
      if (config.invoiceError) return apiResponse({}, 503, 100002, '费用管理服务暂时不可用', 'invoice-unavailable')
      return apiResponse(invoices)
    }
    throw new Error(`unexpected request: ${url.pathname}`)
  })
  const query = new URLSearchParams()
  if (config.requestId) query.set('request', config.requestId)
  if (config.paymentReturnOrderID) query.set('order_id', config.paymentReturnOrderID)
  if (config.tab) query.set('tab', config.tab)
  const path = query.toString() ? `/console/billing?${query.toString()}` : '/console/billing'
  const view = render(<MemoryRouter initialEntries={[path]}><Provider store={appStore}><AppStoreProvider><WorkspaceControl /><BillingPage /></AppStoreProvider></Provider></MemoryRouter>)
  return { ...view, appStore, fetchMock, getPostInput: () => postInput, getPaymentOrderInput: () => paymentOrderInput, getPaymentStartInput: () => paymentStartInput }
}

describe('用户费用管理页面', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN')
    vi.restoreAllMocks()
    window.localStorage.clear()
    clearAuthTokens()
    saveAuthTokens(AUTH_RESULT)
  })

  afterEach(async () => {
    await i18n.changeLanguage('zh-CN')
  })

  it('展示参考页的费用分析结构并按当前个人账务主体请求', async () => {
    const { fetchMock } = renderBilling()
    expect(await screen.findByRole('heading', { name: '费用分析' })).toBeInTheDocument()
    expect(screen.getByText('本期总费用')).toBeInTheDocument()
    expect(screen.getByText('平均每百万 Token 费用')).toBeInTheDocument()
    expect(screen.getByText('图片数量')).toBeInTheDocument()
    expect(screen.getByText('2 张')).toBeInTheDocument()
    const imageCost = screen.getByTitle('¥0.300000000')
    expect(imageCost).toHaveTextContent('¥0.300')
    expect(screen.getByText('账本明细')).toBeInTheDocument()
    const ledgerRegion = screen.getByRole('region', { name: '账本明细表' })
    expect(within(ledgerRegion).getAllByText('模型消费').length).toBeGreaterThan(0)
    expect(within(ledgerRegion).getAllByText('充值').length).toBeGreaterThan(0)
    expect(within(ledgerRegion).getAllByText('赠送').length).toBeGreaterThan(0)
    expect(within(ledgerRegion).getByText('奖励发放: 注册奖励')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '查看请求' }).some((link) => link.getAttribute('href') === '/console/records?request=request-usage-1')).toBe(true)

    const analysisCall = fetchMock.mock.calls.find(([input]) => new URL(String(input), window.location.origin).pathname.endsWith('/analysis'))
    expect(analysisCall).toBeDefined()
    const analysisURL = new URL(String(analysisCall?.[0]), window.location.origin)
    expect(analysisURL.searchParams.get('account_type')).toBe('personal')
    expect(analysisURL.searchParams.get('source')).toBe('all')
    expect(analysisURL.searchParams.get('page_size')).toBe('20')
    expect(new Headers(analysisCall?.[1]?.headers).get('X-Request-ID')).toBeTruthy()
  })

  it('套餐入口查询参数会直接打开订阅与资源包页签', () => {
    renderBilling({ tab: 'subscription' })

    expect(screen.getByRole('tab', { name: '订阅与资源包' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: '在线订阅暂未开放' })).toBeInTheDocument()
  })

  it('使用账面余额展示，不因预授权释放回升可用余额', async () => {
    renderBilling({ analysisWallet: { paid_available_yuan: '99.999733000', bonus_available_yuan: '0.000000000', total_available_yuan: '99.999733000', total_balance_yuan: '100.000000000' } })
    expect((await screen.findAllByText('账户余额')).length).toBeGreaterThan(0)
    expect(screen.getByText('¥100.000')).toBeInTheDocument()
    expect(screen.getByTitle('¥100.000000000')).toBeInTheDocument()
    expect(screen.queryByText('¥99.999733')).toBeNull()
  })

  it('支持筛选、Tab 键盘切换、电脑网站支付宝扫码充值和订阅空状态', async () => {
    const user = userEvent.setup()
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
      this.setAttribute('data-payment-test', 'submitted')
    })
    const { fetchMock } = renderBilling({ paymentStatus: 'paying' })
    await screen.findByRole('heading', { name: '费用分析' })
    await user.click(screen.getByRole('combobox', { name: 'API 密钥' }))
    fireEvent.click(await screen.findByRole('option', { name: /主密钥/ }))
    await user.click(await screen.findByRole('combobox', { name: '模型' }))
    fireEvent.click(await screen.findByRole('option', { name: /测试模型/ }))
    await user.click(await screen.findByRole('combobox', { name: '账期' }))
    fireEvent.click(await screen.findByRole('option', { name: /2026年6月/ }))
    await user.click(await screen.findByRole('combobox', { name: '消费类型' }))
    fireEvent.click(await screen.findByRole('option', { name: /充值/ }))
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([input]) => new URL(String(input), window.location.origin)).filter((url) => url.pathname.endsWith('/analysis'))
      expect(calls.map((url) => Object.fromEntries(url.searchParams))).toContainEqual(expect.objectContaining({ api_key_id: 'key-public-1', model: 'gpt-public', period: '2026-06', source: 'recharge' }))
    })

    await user.click(screen.getByRole('tab', { name: '充值' }))
    expect(screen.getByText('快捷填写金额')).toBeInTheDocument()
    expect(screen.getByText('支付宝扫码充值')).toBeInTheDocument()
    expect(screen.queryByLabelText('支付方式')).toBeNull()
    await user.click(screen.getByRole('button', { name: '¥500.000' }))
    await user.click(screen.getByRole('button', { name: '支付宝支付' }))
    await waitFor(() => expect(submit).toHaveBeenCalledOnce())
    const paymentFrame = await screen.findByTitle('支付宝支付二维码')
    const paymentForm = document.querySelector<HTMLFormElement>('form[data-payment-test]')
    expect(paymentForm).not.toBeNull()
    expect(paymentForm).toHaveAttribute('target', paymentFrame.getAttribute('name') ?? '')
    expect(paymentFrame).toHaveAttribute('name', expect.stringMatching(/^alipay-payment-/))
    const paymentOrderCall = fetchMock.mock.calls.find(([input, options]) => new URL(String(input), window.location.origin).pathname === '/api/user/payment/orders' && options?.method === 'POST')
    expect(paymentOrderCall).toBeDefined()
    expect(JSON.parse(String(paymentOrderCall?.[1]?.body))).toMatchObject({ amount_yuan: '500' })
    expect(new Headers(paymentOrderCall?.[1]?.headers).get('Idempotency-Key')).toBeTruthy()
    const paymentStartCall = fetchMock.mock.calls.find(([input, options]) => new URL(String(input), window.location.origin).pathname.endsWith('/pay') && options?.method === 'POST')
    expect(JSON.parse(String(paymentStartCall?.[1]?.body))).toEqual({ scene: 'pc' })
    expect(new Headers(paymentStartCall?.[1]?.headers).get('Idempotency-Key')).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: '订阅与资源包' }))
    expect(screen.getByText('在线订阅暂未开放')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '费用' }))
    screen.getByRole('tab', { name: '费用' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: '充值' })).toHaveAttribute('aria-selected', 'true')
  })

  it('支付回跳只按服务端订单状态确认到账', async () => {
    const { fetchMock } = renderBilling({ paymentReturnOrderID: 'payment-order-1', paymentStatus: 'paid' })
    expect(await screen.findByText('充值已到账')).toBeInTheDocument()
    expect(screen.getByText('订单号：PAY-202608040001')).toBeInTheDocument()
    const queryCall = fetchMock.mock.calls.find(([input, options]) => new URL(String(input), window.location.origin).pathname === '/api/user/payment/orders/payment-order-1' && !options?.method)
    expect(queryCall).toBeDefined()
  })

  it('企业空间禁用个人支付宝充值入口', async () => {
    const user = userEvent.setup()
    const { fetchMock } = renderBilling()
    await user.click(screen.getByRole('button', { name: '切换到企业空间' }))
    await waitFor(() => {
      const enterpriseAnalysisCall = fetchMock.mock.calls.find(([input]) => {
        const url = new URL(String(input), window.location.origin)
        return url.pathname === '/api/user/billing/analysis' && url.searchParams.get('account_type') === 'enterprise'
      })
      expect(enterpriseAnalysisCall).toBeDefined()
    })
    await user.click(screen.getByRole('tab', { name: '充值' }))
    expect(screen.getByText('当前企业空间暂不支持个人支付宝充值，请切换到个人空间。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '支付宝支付' })).toBeDisabled()
    expect(fetchMock.mock.calls.some(([input]) => new URL(String(input), window.location.origin).pathname === '/api/user/payment/orders')).toBe(false)
  })

  it('支持请求聚焦和账本 CSV 导出', async () => {
    const user = userEvent.setup()
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:billing')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    renderBilling({ requestId: 'request-usage-1' })
    const requestFocus = (await screen.findByText('请求 request-usage-1')).closest('.request-focus')
    expect(requestFocus).not.toBeNull()
    expect(within(requestFocus as HTMLElement).getByTitle('¥4.120000000')).toHaveTextContent('¥4.120')
    expect(screen.getAllByRole('row')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: /导出 CSV/ }))
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:billing')
    const csvBlob = createObjectURL.mock.calls[0]?.[0] as Blob
    const csv = await csvBlob.text()
    expect(csv).toContain('"-¥4.120000000"')
    expect(csv).toContain('"¥105.880000000"')
  })

  it('展示发票概览、FAQ 和历史，并完成三步申请提交', async () => {
    const user = userEvent.setup()
    const { fetchMock, getPostInput } = renderBilling()
    await screen.findByRole('heading', { name: '费用分析' })
    await user.click(screen.getByRole('tab', { name: '发票' }))
    expect(await screen.findByText('常见开票问题')).toBeInTheDocument()
    expect(screen.getByText('本地演示数据：以下金额与历史不代表真实开票资格、已开具记录或税务结果。')).toBeInTheDocument()
    expect(screen.getByText('开票历史记录')).toBeInTheDocument()
    expect(screen.getAllByText('开票中').length).toBeGreaterThan(0)
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(2)
    await user.click(screen.getByRole('button', { name: /常见开票问题/ }))
    expect(screen.getByText('数电发票将在申请提交后 24 小时内处理，并发送到接收邮箱。发票抬头和税号提交后如需修改，需要重新申请。')).not.toBeVisible()
    await user.click(screen.getByRole('button', { name: '立即开票' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByDisplayValue('50.00')).toBeInTheDocument()
	await user.clear(within(dialog).getByLabelText(/发票抬头/))
	await user.type(within(dialog).getByLabelText(/发票抬头/), '本地演示工作区')
	await user.type(within(dialog).getByLabelText(/接收邮箱/), 'billing@example.com')
    await user.click(within(dialog).getByRole('button', { name: '确认开票' }))
    expect(within(dialog).getByText('请核对发票信息，提交后如需修改需要重新申请。')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '再核对一下' }))
    await user.click(within(dialog).getByRole('button', { name: '确认开票' }))
    await user.click(within(dialog).getByRole('button', { name: '确认提交' }))
    expect(await within(dialog).findByText('开票申请提交成功')).toBeInTheDocument()
    expect(getPostInput()).not.toBeNull()
	expect(JSON.parse(getPostInput()?.body ?? '{}')).toMatchObject({ amount_yuan: '50.00', title: '本地演示工作区', taxpayer_type: 'personal', email: 'billing@example.com', project_name: '*生产生活服务*云服务费' })
    expect(getPostInput()?.headers.get('Idempotency-Key')).toBeTruthy()
    expect(fetchMock.mock.calls.some(([input, options]) => new URL(String(input), window.location.origin).pathname.endsWith('/invoices') && options?.method === 'POST')).toBe(true)
    await user.click(within(dialog).getByRole('button', { name: '确定' }))
    await waitFor(() => expect(screen.queryByRole('dialog')?.className).toContain('animate-hide'))
  })

  it('通过认证请求下载已开具发票', async () => {
    const user = userEvent.setup()
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:invoice')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const invoice = makeInvoice({ status: 'issued', status_label: '已开票', file_type: 'pdf', download_url: '/api/user/billing/invoices/file-1/download?account_type=personal' })
    const { fetchMock } = renderBilling({ invoice })
    await screen.findByRole('heading', { name: '费用分析' })
    await user.click(screen.getByRole('tab', { name: '发票' }))
    await user.click(await screen.findByRole('link', { name: '查看' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => new URL(String(input), window.location.origin).pathname.endsWith('/download'))).toBe(true))
    const downloadCall = fetchMock.mock.calls.find(([input]) => new URL(String(input), window.location.origin).pathname.endsWith('/download'))
    expect(new Headers(downloadCall?.[1]?.headers).get('Authorization')).toBe('Bearer billing-access-token')
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:invoice')
  })

	it('企业抬头缺少税号时阻止进入确认页', async () => {
		const user = userEvent.setup()
		const { fetchMock } = renderBilling()
		await screen.findByRole('heading', { name: '费用分析' })
		await user.click(screen.getByRole('tab', { name: '发票' }))
		await user.click(await screen.findByRole('button', { name: '立即开票' }))
		const dialog = screen.getByRole('dialog')
		await user.selectOptions(within(dialog).getByLabelText('抬头类型'), 'enterprise')
		await user.click(within(dialog).getByRole('button', { name: '确认开票' }))
		expect(within(dialog).getByText('企业抬头必须填写纳税人识别号')).toBeInTheDocument()
		expect(within(dialog).queryByText('请核对发票信息，提交后如需修改需要重新申请。')).not.toBeInTheDocument()
		expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
	})

	it('企业账务服务失败时展示服务错误和请求 ID', async () => {
		const user = userEvent.setup()
		const { fetchMock } = renderBilling({ invoiceError: true })
    await user.click(screen.getByRole('button', { name: '切换到企业空间' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) => new URL(String(input), window.location.origin).pathname.endsWith('/analysis')).length).toBeGreaterThan(1))
    await user.click(screen.getByRole('tab', { name: '发票' }))
    expect(await screen.findByText(/账务服务暂时不可用/)).toBeInTheDocument()
    expect(screen.getByText('请求 ID：invoice-unavailable')).toBeInTheDocument()
  })

  it('费用分析权限失败时显示可重试提示', async () => {
    const user = userEvent.setup()
    const { fetchMock } = renderBilling({ analysisError: true })
    expect(await screen.findByText('当前工作空间没有账务查看权限')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /重新加载/ }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) => new URL(String(input), window.location.origin).pathname.endsWith('/analysis')).length).toBeGreaterThan(1))
  })

  it('英文账单使用英文状态、数量单位和发票项目名', async () => {
    const user = userEvent.setup()
    await i18n.changeLanguage('en-US')
    const invoice = makeInvoice({ status: 'submitted', status_label: '开票中' })
    renderBilling({ invoice })

    expect(await screen.findByRole('heading', { name: 'Cost analysis' })).toBeInTheDocument()
    expect(screen.getByText('2 images')).toBeInTheDocument()
    expect(screen.getByText('1 items')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Invoices' }))
    expect(await screen.findByText('Submitted')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Invoice now' }))
    expect(within(screen.getByRole('dialog')).getByDisplayValue('*Production and daily services* cloud service fee')).toBeInTheDocument()
  })
})

describe('费用页纯函数', () => {
	it('校验发票金额、邮箱和企业抬头必填字段', () => {
		expect(validateInvoiceForm({ amount_yuan: '50.001', title: '', tax_identifier: '', taxpayer_type: 'enterprise', email: 'bad', project_name: '', invoice_type: 'normal' }, '50.00')).toMatchObject({ amount_yuan: '请输入大于 0 且最多保留两位小数的金额', title: '请输入发票抬头', tax_identifier: '企业抬头必须填写纳税人识别号', email: '请输入有效的接收邮箱' })
		expect(validateInvoiceForm({ amount_yuan: '50.00', title: '个人抬头', tax_identifier: '', taxpayer_type: 'personal', email: 'billing@example.com', project_name: '*生产生活服务*云服务费', invoice_type: 'normal' }, '50.00')).toEqual({})
	})

	it('正确生成个人和企业账务上下文', () => {
    expect(billingContextForWorkspace({ id: 'personal', type: 'personal' })).toEqual({ account_type: 'personal' })
    expect(billingContextForWorkspace({ id: 'enterprise-1', type: 'enterprise' })).toEqual({ account_type: 'enterprise', enterprise_id: 'enterprise-1' })
    expect(billingContextKey({ account_type: 'personal' })).toBe('personal')
    expect(billingContextKey({ account_type: 'enterprise', enterprise_id: 'enterprise-1' })).toBe('enterprise:enterprise-1')
  })

  it('根据稳定字段区分流水类型', () => {
    const line = { line_type: 'reward_grant', source_type: 'reward', title: '奖励到账', description: '注册奖励到账' } as const
    expect(statementKindLabel(line)).toBe('奖励到账')
    expect(statementKindLabel({ ...line, line_type: 'usage_consume', source_type: 'usage', title: '模型消费', description: '模型调用消费' })).toBe('消费')
    expect(statementKindLabel({ ...line, line_type: 'reward_expired', title: '调整', description: '过期' })).toBe('奖励过期')
    expect(statementKindLabel({ ...line, line_type: 'reward_revoke_partial', title: '调整', description: '部分撤销' })).toBe('部分撤销')
    expect(statementKindLabel({ ...line, line_type: 'reward_revoke_full', title: '调整', description: '全部撤销' })).toBe('全部撤销')
    expect(statementKindLabel({ ...line, line_type: 'other', source_type: 'other', title: '其他', description: '' })).toBe('其他')
  })

  it('按账本类型展示赠送记录', () => {
    expect(ledgerKindLabel('reward')).toBe('赠送')
    expect(ledgerKindLabel('recharge')).toBe('充值')
    expect(ledgerKindLabel('model_consume')).toBe('模型消费')
  })
})
