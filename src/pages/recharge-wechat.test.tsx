import '@/i18n'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
import type { AuthResult } from '@/api/auth'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import { AppStoreProvider } from '@/data/app-state'
import { createAppStore } from '@/store'
import { RechargePage } from './recharge'

vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn().mockResolvedValue(undefined) } }))

const QR_VALUE = 'weixin://wxpay/bizpayurl?pr=EXAMPLE01%2Babc&sign=A%2FB+Z'
const ORDER = {
  id: 'wechat-order-1', order_no: 'WECHAT-ORDER-1', order_type: 'recharge',
  status: 'paying', currency: 'CNY', amount_cent: '10000', amount_yuan: '100.00', paid_at: null,
}
const AUTH = {
  status: 'succeeded', binding_required: false,
  access_token: 'wechat-test-token', refresh_token: 'wechat-test-refresh',
  access_expires_at: Date.UTC(2099, 0, 1), refresh_expires_at: Date.UTC(2099, 1, 1),
  user: { id: 'wechat-test-user', display_name: '测试用户', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' },
} satisfies AuthResult

function response(data: unknown, code = 0, status = 200) {
  return new Response(JSON.stringify({ code, msg: code ? '' : 'success', data }), {
    status, headers: { 'Content-Type': 'application/json' },
  })
}

function paymentResponse(extra: Record<string, unknown> = {}) {
  return response({ order: ORDER, transaction: { id: 'wechat-attempt-1', payment_product: 'wechat_native' }, qrcode_url: QR_VALUE, form_html: '', ...extra })
}

// 使用真实 API 封装和页面，只替换网络与 canvas，覆盖请求参数到到账刷新整条链路。
function mockBackend(options: {
  create?: () => Promise<Response> | Response
  pay?: (orderID: string, init?: RequestInit) => Promise<Response> | Response
  query?: (orderID: string) => Promise<Response> | Response
  close?: () => Promise<Response> | Response
} = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input), window.location.origin).pathname
    if (path === '/api/user/billing/wallet') return response({ wallet: { total_available_yuan: '0', paid_available_yuan: '0', debt_yuan: '0' }, bonus_grants: [] })
    if (path === '/api/user/payment/orders' && init?.method === 'POST') return options.create?.() ?? response({ ...ORDER, status: 'pending' })
    const match = path.match(/^\/api\/user\/payment\/orders\/([^/]+)(?:\/(pay|close))?$/)
    if (match?.[2] === 'pay') return options.pay?.(match[1], init) ?? paymentResponse()
    if (match?.[2] === 'close') return options.close?.() ?? response({ ...ORDER, id: match[1], status: 'closed' })
    if (match) return options.query?.(match[1]) ?? response({ ...ORDER, id: match[1] })
    throw new Error(`Unexpected request: ${path}`)
  })
}

function callsFor(mock: ReturnType<typeof mockBackend>, suffix: string) {
  return mock.mock.calls.filter(([input]) => new URL(String(input), window.location.origin).pathname.endsWith(suffix))
}

async function mountPage(type: 'personal' | 'enterprise' = 'personal') {
  window.localStorage.setItem('token-nx:user-front:v1', JSON.stringify({
    activeWorkspaceId: 'wechat-workspace',
    workspaces: [{ id: 'wechat-workspace', name: '支付测试空间', type, role: 'owner' }],
  }))
  let view!: ReturnType<typeof render>
  await act(async () => {
    view = render(<MemoryRouter initialEntries={['/console/recharge']}><Provider store={createAppStore()}><AppStoreProvider><RechargePage /></AppStoreProvider></Provider></MemoryRouter>)
  })
  await click('微信')
  return view
}

async function click(name: string | RegExp) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

describe('充值管理微信支付回归', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(QRCode.toCanvas).mockClear()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    window.localStorage.clear()
    window.sessionStorage.clear()
    clearAuthTokens({ force: true, broadcast: false })
    saveAuthTokens(AUTH)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it.each(['personal', 'enterprise'] as const)('%s 微信扫码全链路携带正确主体、原始金额和幂等键', async (type) => {
    const amountOrder = { ...ORDER, amount_cent: '1001', amount_yuan: '10.01' }
    const fetchMock = mockBackend({
      create: () => response({ ...amountOrder, status: 'pending' }),
      pay: () => paymentResponse({ order: amountOrder }),
      query: () => response(amountOrder),
    })
    await mountPage(type)
    await act(async () => { fireEvent.focus(screen.getByRole('textbox', { name: '其他金额' })); fireEvent.change(screen.getByRole('textbox', { name: '其他金额' }), { target: { value: '10.01' } }) })
    await click('立即充值')

    expect(JSON.parse(String(callsFor(fetchMock, '/orders')[0][1]?.body))).toEqual({ amount_yuan: '10.01' })
    const pay = callsFor(fetchMock, '/pay')[0]
    expect(JSON.parse(String(pay[1]?.body))).toEqual({ scene: 'pc', channel: 'wechat' })
    for (const [input, init] of fetchMock.mock.calls) {
      const url = new URL(String(input), window.location.origin)
      expect(url.searchParams.get('account_type')).toBe(type)
      expect(url.searchParams.get('enterprise_id')).toBe(type === 'enterprise' ? 'wechat-workspace' : null)
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer wechat-test-token')
      if (init?.method === 'POST') expect(new Headers(init.headers).get('Idempotency-Key')).toMatch(/^[\x20-\x7e]{1,128}$/)
    }
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('¥10.01')
    expect(dialog).toHaveTextContent('请使用微信扫描二维码完成支付')
    expect(dialog).not.toHaveTextContent('支付宝')
    expect(QRCode.toCanvas).toHaveBeenCalledWith(within(dialog).getByLabelText('微信支付二维码'), QR_VALUE, expect.any(Object))
    expect(dialog.querySelector('iframe')).toBeNull()
  })

  it('定时及手动查单复用同一订单，仅 paid 且 paid_at 非空后刷新余额并停止轮询', async () => {
    let status = 'paying'
    let paidAt: number | null = null
    const fetchMock = mockBackend({ query: () => response({ ...ORDER, status, paid_at: paidAt }) })
    await mountPage()
    await click('立即充值')
    expect(callsFor(fetchMock, `/${ORDER.id}`)).toHaveLength(1)
    await advance(2000)
    expect(callsFor(fetchMock, `/${ORDER.id}`)).toHaveLength(2)
    status = 'paid'
    await click(/刷新支付状态/)
    expect(screen.queryByText('充值已到账')).toBeNull()
    expect(screen.queryByLabelText('微信支付二维码')).toBeNull()
    expect(callsFor(fetchMock, '/wallet')).toHaveLength(1)
    paidAt = Date.now()
    await advance(2000)
    expect(screen.getByText('充值已到账')).toBeInTheDocument()
    expect(screen.queryByLabelText('微信支付二维码')).toBeNull()
    expect(callsFor(fetchMock, '/wallet')).toHaveLength(2)
    const queryCount = callsFor(fetchMock, `/${ORDER.id}`).length
    await advance(10000)
    expect(callsFor(fetchMock, `/${ORDER.id}`)).toHaveLength(queryCount)
    expect(callsFor(fetchMock, '/orders')).toHaveLength(1)
    expect(callsFor(fetchMock, '/pay')).toHaveLength(1)
  })

  it.each(['closed', 'expired', 'exception'])('%s 终态隐藏二维码并停止轮询，不显示到账', async (status) => {
    const fetchMock = mockBackend({ query: () => response({ ...ORDER, status }) })
    await mountPage()
    await click('立即充值')
    expect(screen.queryByLabelText('微信支付二维码')).toBeNull()
    expect(screen.queryByText('充值已到账')).toBeNull()
    await advance(10000)
    expect(callsFor(fetchMock, `/${ORDER.id}`)).toHaveLength(1)
  })

  it('订单与渠道较早的到期时间使二维码失效，但仍查单确认是否已到账', async () => {
    const expires = Date.now() + 1000
    const fetchMock = mockBackend({ pay: () => paymentResponse({ order: { ...ORDER, expires_at: expires + 10_000 }, transaction: { expires_at: expires } }) })
    await mountPage()
    await click('立即充值')
    expect(screen.getByLabelText('微信支付二维码')).toBeInTheDocument()
    await advance(1000)
    expect(screen.queryByLabelText('微信支付二维码')).toBeNull()
    expect(screen.getByText('支付订单已过期')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /刷新支付状态/ })).toBeEnabled()
    expect(callsFor(fetchMock, '/orders')).toHaveLength(1)
    expect(callsFor(fetchMock, `/${ORDER.id}`).length).toBeGreaterThan(1)
  })

  it('关闭弹窗中止进行中的查单，迟到的到账响应不能重新打开弹窗', async () => {
    let resolveQuery!: (value: Response) => void
    const fetchMock = mockBackend({ query: () => new Promise((resolve) => { resolveQuery = resolve }) })
    await mountPage()
    await click('立即充值')
    const signal = callsFor(fetchMock, `/${ORDER.id}`)[0][1]?.signal
    await act(async () => { fireEvent.click(document.querySelector('.payment-qr-dialog .semi-modal-close')!) })
    expect(signal?.aborted).toBe(true)
    expect(callsFor(fetchMock, '/close')).toHaveLength(1)
    await act(async () => { resolveQuery(response({ ...ORDER, status: 'paid', paid_at: Date.now() })) })
    await advance(10000)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('充值已到账')).toBeNull()
    expect(callsFor(fetchMock, `/${ORDER.id}`)).toHaveLength(1)
    const firstKey = new Headers(callsFor(fetchMock, '/pay')[0][1]?.headers).get('Idempotency-Key')
    await click('立即充值')
    expect(callsFor(fetchMock, '/orders')).toHaveLength(2)
    expect(new Headers(callsFor(fetchMock, '/pay')[1][1]?.headers).get('Idempotency-Key')).not.toBe(firstKey)
  })

  it('查单网络失败后退避重试，五分钟后停止自动查询，手动刷新可恢复', async () => {
    const fetchMock = mockBackend({ query: () => { throw new Error('offline') } })
    await mountPage()
    await click('立即充值')
    expect(callsFor(fetchMock, `/${ORDER.id}`)).toHaveLength(1)
    await advance(2000)
    expect(callsFor(fetchMock, `/${ORDER.id}`)).toHaveLength(2)
    await advance(3999)
    expect(callsFor(fetchMock, `/${ORDER.id}`)).toHaveLength(2)
    await advance(1)
    expect(callsFor(fetchMock, `/${ORDER.id}`)).toHaveLength(3)
    await advance(310000)
    const count = callsFor(fetchMock, `/${ORDER.id}`).length
    await advance(10000)
    expect(callsFor(fetchMock, `/${ORDER.id}`)).toHaveLength(count)
    await click(/刷新支付状态/)
    expect(callsFor(fetchMock, `/${ORDER.id}`)).toHaveLength(count + 1)
  })

  it('渠道不可用后重试保留幂等键，切换渠道同时更换订单及支付幂等键', async () => {
    const fetchMock = mockBackend({ pay: () => response({}, 170007, 503) })
    await mountPage()
    await click('立即充值')
    expect(screen.getByText('支付渠道暂不可用，请稍后重试')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    await click('立即充值')
    await click('支付宝支付')
    await click('立即充值')
    const payments = callsFor(fetchMock, '/pay')
    expect(payments).toHaveLength(3)
    const keys = payments.map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'))
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[1])
    expect(JSON.parse(String(payments[2][1]?.body))).toEqual({ scene: 'pc', channel: 'alipay' })
    const orders = callsFor(fetchMock, '/orders')
    expect(orders).toHaveLength(2)
    expect(new Headers(orders[0][1]?.headers).get('Idempotency-Key')).not.toBe(new Headers(orders[1][1]?.headers).get('Idempotency-Key'))
  })

  it.each(['personal', 'enterprise'] as const)('%s 支付宝失败后切微信使用新订单，往返切换不复用旧渠道订单', async (type) => {
    let sequence = 0
    const fetchMock = mockBackend({
      create: () => response({ ...ORDER, id: `switch-order-${++sequence}`, status: 'pending' }),
      pay: (id, init) => {
        if (JSON.parse(String(init?.body)).channel !== 'wechat') return response({}, 0, 503)
        return paymentResponse({ order: { ...ORDER, id } })
      },
    })
    await mountPage(type)
    await click('支付宝支付')
    expect(callsFor(fetchMock, '/orders')).toHaveLength(0)
    await click('立即充值')
    await click('支付宝支付')
    await click('立即充值')
    await click('微信')
    await click('立即充值')
    expect(screen.getByRole('dialog')).toHaveTextContent('微信扫描二维码')
    await act(async () => { fireEvent.click(document.querySelector('.payment-qr-dialog .semi-modal-close')!) })
    await click('支付宝支付')
    await click('立即充值')

    const payments = callsFor(fetchMock, '/pay')
    expect(payments.map(([input]) => new URL(String(input), window.location.origin).pathname)).toEqual([
      '/api/user/payment/orders/switch-order-1/pay',
      '/api/user/payment/orders/switch-order-1/pay',
      '/api/user/payment/orders/switch-order-2/pay',
      '/api/user/payment/orders/switch-order-3/pay',
    ])
    expect(payments.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      { scene: 'pc', channel: 'alipay' }, { scene: 'pc', channel: 'alipay' },
      { scene: 'pc', channel: 'wechat' }, { scene: 'pc', channel: 'alipay' },
    ])
    for (const [input] of payments) expect(new URL(String(input), window.location.origin).searchParams.get('account_type')).toBe(type)
  })

  it('支付宝弹窗关单失败后切微信，不再查询或支付旧订单', async () => {
    let sequence = 0
    const fetchMock = mockBackend({
      create: () => response({ ...ORDER, id: `close-order-${++sequence}`, status: 'pending' }),
      pay: (id, init) => paymentResponse({
        order: { ...ORDER, id },
        ...(JSON.parse(String(init?.body)).channel === 'wechat' ? {} : { qr_code: 'https://qr.alipay.com/close-test' }),
      }),
      close: () => response({}, 0, 503),
    })
    await mountPage()
    await click('支付宝支付')
    await click('立即充值')
    expect(screen.getByLabelText('支付宝支付二维码')).toBeInTheDocument()
    await act(async () => { fireEvent.click(document.querySelector('.payment-qr-dialog .semi-modal-close')!) })
    const oldQueries = callsFor(fetchMock, '/close-order-1').length
    await click('微信')
    await click('立即充值')
    expect(screen.getByLabelText('微信支付二维码')).toBeInTheDocument()
    expect(screen.queryByLabelText('支付宝支付二维码')).toBeNull()
    expect(callsFor(fetchMock, '/close-order-1')).toHaveLength(oldQueries)
    expect(callsFor(fetchMock, '/close-order-1/pay')).toHaveLength(1)
    expect(callsFor(fetchMock, '/close-order-2/pay')).toHaveLength(1)
  })

  it('关单请求进行中锁定渠道和提交，卸载后中止关单且忽略迟到响应', async () => {
    let resolveClose!: (value: Response) => void
    const fetchMock = mockBackend({ close: () => new Promise((resolve) => { resolveClose = resolve }) })
    const view = await mountPage()
    await click('立即充值')
    await act(async () => { fireEvent.click(document.querySelector('.payment-qr-dialog .semi-modal-close')!) })
    expect(screen.getByRole('button', { name: '支付宝支付' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '立即充值' })).toBeDisabled()
    const signal = callsFor(fetchMock, '/close')[0][1]?.signal
    view.unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => { resolveClose(response({ ...ORDER, status: 'closed' })) })
    expect(callsFor(fetchMock, '/orders')).toHaveLength(1)
    expect(callsFor(fetchMock, '/wallet')).toHaveLength(1)
  })

  it('创建订单进行中按钮保持主题色但禁止重复提交和切换渠道', async () => {
    let resolveCreate!: (value: Response) => void
    const fetchMock = mockBackend({ create: () => new Promise((resolve) => { resolveCreate = resolve }) })
    const view = await mountPage()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '立即充值' })) })
    const button = screen.getByRole('button', { name: '立即充值' })
    expect(button).toBeDisabled()
    expect(button).toHaveClass('is-loading')
    expect(button).toHaveClass('semi-button-primary-disabled')
    expect(screen.getByRole('button', { name: '微信' })).toBeDisabled()
    await act(async () => { resolveCreate(response({ ...ORDER, status: 'pending' })) })
    view.unmount()
    expect(callsFor(fetchMock, '/orders')).toHaveLength(1)
  })

  it.each(['closed', 'expired'])('重试查到旧订单为 %s 时重新下单，不再支付终态订单', async (status) => {
    let sequence = 0
    const fetchMock = mockBackend({
      create: () => response({ ...ORDER, id: `retry-order-${++sequence}`, status: 'pending' }),
      pay: (id) => id === 'retry-order-1' ? response({}, 0, 503) : paymentResponse({ order: { ...ORDER, id } }),
      query: (id) => response({ ...ORDER, id, status: id === 'retry-order-1' ? status : 'paying' }),
    })
    await mountPage()
    await click('立即充值')
    await click('立即充值')
    expect(callsFor(fetchMock, '/orders')).toHaveLength(2)
    expect(callsFor(fetchMock, '/retry-order-1/pay')).toHaveLength(1)
    expect(callsFor(fetchMock, '/retry-order-2/pay')).toHaveLength(1)
  })

  it.each([null, Date.now()])('重试查到旧订单已支付（paid_at=%s），不再调用支付或重复下单', async (paid_at) => {
    const fetchMock = mockBackend({
      pay: () => response({}, 0, 503),
      query: () => response({ ...ORDER, status: 'paid', paid_at }),
    })
    await mountPage()
    await click('立即充值')
    await click('立即充值')
    expect(callsFor(fetchMock, '/orders')).toHaveLength(1)
    expect(callsFor(fetchMock, '/pay')).toHaveLength(1)
    expect(screen.queryByLabelText('微信支付二维码')).toBeNull()
    if (paid_at) expect(screen.getByText('充值已到账')).toBeInTheDocument()
    else expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it.each([undefined, '', '   ', 123])('微信缺失或无效二维码 %s 时拒绝使用其他支付载体', async (qrcode_url) => {
    mockBackend({ pay: () => paymentResponse({ qrcode_url, form_html: '<form action="https://openapi.alipay.com/gateway.do"></form>', transaction: { payment_url: 'https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=EXAMPLE01' } }) })
    await mountPage()
    await click('立即充值')
    expect(screen.getByText('微信支付二维码无效，请重新发起支付')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(QRCode.toCanvas).not.toHaveBeenCalled()
  })

  it('响应已确认到账且不含二维码时直接刷新余额，不误报载体错误', async () => {
    const fetchMock = mockBackend({ pay: () => paymentResponse({ order: { ...ORDER, status: 'paid', paid_at: Date.now() }, qrcode_url: undefined }) })
    await mountPage()
    await click('立即充值')
    expect(screen.getByText('充值已到账')).toBeInTheDocument()
    expect(callsFor(fetchMock, '/wallet')).toHaveLength(2)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('创建请求进行中锁定金额和渠道，重复点击只创建一次，卸载后不继续支付', async () => {
    let resolveCreate!: (value: Response) => void
    const fetchMock = mockBackend({ create: () => new Promise((resolve) => { resolveCreate = resolve }) })
    const view = await mountPage()
    await act(async () => {
      const button = screen.getByRole('button', { name: '立即充值' })
      fireEvent.click(button)
      fireEvent.click(button)
    })
    expect(screen.getByRole('button', { name: '200 元' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '支付宝支付' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: '其他金额' })).toBeDisabled()
    expect(callsFor(fetchMock, '/orders')).toHaveLength(1)
    view.unmount()
    expect(callsFor(fetchMock, '/orders')[0][1]?.signal?.aborted).toBe(true)
    await act(async () => { resolveCreate(response({ ...ORDER, status: 'pending' })) })
    expect(callsFor(fetchMock, '/pay')).toHaveLength(0)
  })
})
