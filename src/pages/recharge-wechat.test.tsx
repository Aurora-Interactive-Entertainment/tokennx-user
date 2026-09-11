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
  pay?: () => Promise<Response> | Response
  query?: () => Promise<Response> | Response
} = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input), window.location.origin).pathname
    if (path === '/api/user/billing/wallet') return response({ wallet: { total_available_yuan: '0', paid_available_yuan: '0', debt_yuan: '0' }, bonus_grants: [] })
    if (path === '/api/user/payment/orders' && init?.method === 'POST') return options.create?.() ?? response({ ...ORDER, status: 'pending' })
    if (path === `/api/user/payment/orders/${ORDER.id}/pay`) return options.pay?.() ?? paymentResponse()
    if (path === `/api/user/payment/orders/${ORDER.id}/close`) return response({ ...ORDER, status: 'closed' })
    if (path === `/api/user/payment/orders/${ORDER.id}`) return options.query?.() ?? response(ORDER)
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

  it('渠道不可用后重试保留幂等键，切换支付宝仅更换支付幂等键', async () => {
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
    expect(JSON.parse(String(payments[2][1]?.body))).toEqual({ scene: 'pc' })
    expect(callsFor(fetchMock, '/orders')).toHaveLength(1)
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
