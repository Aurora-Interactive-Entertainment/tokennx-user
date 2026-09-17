import '@/i18n'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import { AppStoreProvider } from '@/data/app-state'
import { createAppStore } from '@/store'
import { RechargePage } from './recharge'

vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn().mockResolvedValue(undefined) } }))
const ORDER = { id: 'recovery-order', order_no: 'RECOVERY-ORDER', order_type: 'recharge', status: 'paying', currency: 'CNY', amount_cent: '10000', amount_yuan: '100.00', paid_at: null }
const AUTH = { status: 'succeeded', binding_required: false, access_token: 'recovery-token', refresh_token: 'recovery-refresh', access_expires_at: Date.UTC(2099, 0, 1), refresh_expires_at: Date.UTC(2099, 1, 1), user: { id: 'recovery-user', display_name: '测试用户', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' } } as const
function response(data: unknown, code = 0, status = 200) { return new Response(JSON.stringify({ code, msg: code ? 'mock failure' : 'success', data }), { status, headers: { 'Content-Type': 'application/json' } }) }
const payment = (order: Record<string, unknown> = ORDER) => ({ order, qrcode_url: 'weixin://wxpay/bizpayurl?pr=LOCAL_ONLY', qr_code: 'https://qr.alipay.com/local-only' })
function backend(options: { create?: (init?: RequestInit) => Response; pay?: (id: string) => Response; query?: (id: string) => Response; close?: (id: string) => Response } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input), window.location.origin).pathname
    if (path === '/api/user/billing/wallet') return response({ wallet: { total_available_yuan: '10', paid_available_yuan: '10', debt_yuan: '0' }, bonus_grants: [] })
    if (path === '/api/user/billing/statements') return response({ items: [], total: 0, page: 1, page_size: 10 })
    if (path === '/api/user/payment/orders' && init?.method === 'POST') return options.create?.(init) ?? response({ ...ORDER, status: 'pending' })
    const match = path.match(/^\/api\/user\/payment\/orders\/([^/]+)(?:\/(pay|close))?$/)
    if (match?.[2] === 'pay') return options.pay?.(match[1]) ?? response(payment())
    if (match?.[2] === 'close') return options.close?.(match[1]) ?? response({ ...ORDER, id: match[1], status: 'closed' })
    if (match) return options.query?.(match[1]) ?? response({ ...ORDER, id: match[1] })
    throw new Error(`Unmocked request blocked: ${path}`)
  })
}
function calls(mock: ReturnType<typeof backend>, suffix: string) { return mock.mock.calls.filter(([input]) => new URL(String(input), window.location.origin).pathname.endsWith(suffix)) }
function requestKey(call: ReturnType<typeof backend>['mock']['calls'][number]) { return new Headers(call[1]?.headers).get('Idempotency-Key') }
async function click(name: string | RegExp) { await act(async () => { fireEvent.click(screen.getByRole('button', { name })) }) }
async function mount(path = '/console/recharge') {
  let view!: ReturnType<typeof render>
  await act(async () => { view = render(<MemoryRouter initialEntries={[path]}><Provider store={createAppStore()}><AppStoreProvider><RechargePage /></AppStoreProvider></Provider></MemoryRouter>) })
  return view
}
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

describe('充值意图恢复与支付回跳', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    localStorage.clear(); sessionStorage.clear()
    clearAuthTokens({ force: true, broadcast: false }); saveAuthTokens(AUTH)
  })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('pay失败后切渠道先确认旧单；关单失败保留原渠道与创建意图', async () => {
    let canClose = false
    const fetch = backend({ pay: () => { throw new Error('response lost') }, close: () => { if (!canClose) throw new Error('offline'); return response({ ...ORDER, status: 'closed' }) } })
    await mount(); await click('微信'); await click('立即充值'); await click('支付宝支付')
    expect(calls(fetch, '/recovery-order')).toHaveLength(1)
    expect(calls(fetch, '/close')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '微信' })).toHaveAttribute('aria-pressed', 'true')
    expect(calls(fetch, '/orders')).toHaveLength(1)
    canClose = true
    await click('支付宝支付'); await click('立即充值')
    expect(calls(fetch, '/orders')).toHaveLength(2)
    expect(requestKey(calls(fetch, '/orders')[0])).not.toBe(requestKey(calls(fetch, '/orders')[1]))
    expect(JSON.parse(String(calls(fetch, '/pay')[1][1]?.body)).channel).toBe('alipay')
  })

  it('未知创建结果改金额须原键原金额重放，无法确认时不能丢单', async () => {
    let recover = false
    const fetch = backend({ create: (init) => { if (!recover) throw new Error('response lost'); const amount = JSON.parse(String(init?.body)).amount_yuan; return response({ ...ORDER, status: 'pending', amount_yuan: amount, amount_cent: String(Number(amount) * 100) }) }, pay: () => { throw new Error('stop before carrier') } })
    await mount(); await click('立即充值'); await click('200 元')
    expect(calls(fetch, '/orders')).toHaveLength(2)
    expect(requestKey(calls(fetch, '/orders')[0])).toBe(requestKey(calls(fetch, '/orders')[1]))
    expect(JSON.parse(String(calls(fetch, '/orders')[1][1]?.body))).toEqual({ amount_yuan: '100' })
    expect(screen.getByRole('button', { name: '100 元' })).toHaveAttribute('aria-pressed', 'true')
    recover = true
    await click('200 元')
    expect(calls(fetch, '/close')).toHaveLength(1)
    await click('立即充值')
    expect(JSON.parse(String(calls(fetch, '/orders')[3][1]?.body))).toEqual({ amount_yuan: '200' })
    expect(requestKey(calls(fetch, '/orders')[3])).not.toBe(requestKey(calls(fetch, '/orders')[0]))
  })

  it('已知待付单卸载重挂恢复原渠道与订单，不创建第二单', async () => {
    const fetch = backend()
    const view = await mount(); await click('微信'); await click('立即充值')
    const payKey = requestKey(calls(fetch, '/pay')[0])
    view.unmount()
    await mount()
    expect(screen.getByRole('button', { name: '微信' })).toHaveAttribute('aria-pressed', 'true')
    expect(calls(fetch, '/pay')).toHaveLength(1)
    await click('立即充值')
    expect(calls(fetch, '/orders')).toHaveLength(1)
    expect(calls(fetch, '/pay')).toHaveLength(2)
    expect(requestKey(calls(fetch, '/pay')[1])).toBe(payKey)
    expect(screen.getByLabelText('微信支付二维码')).toBeInTheDocument()
  })

  it('创建响应丢失后重挂保留自定义金额文本与幂等键，只有用户继续才重放', async () => {
    let first = true
    const custom = { ...ORDER, amount_yuan: '10.01', amount_cent: '1001' }
    const fetch = backend({ create: () => { if (first) { first = false; throw new Error('response lost') } return response({ ...custom, status: 'pending' }) }, pay: () => response(payment(custom)), query: () => response(custom) })
    const view = await mount(); await click('微信')
    await act(async () => { const input = screen.getByRole('textbox', { name: '其他金额' }); fireEvent.focus(input); fireEvent.change(input, { target: { value: '10.01' } }) })
    await click('立即充值'); view.unmount(); await mount()
    expect(screen.getByRole('textbox', { name: '其他金额' })).toHaveValue('10.01')
    expect(calls(fetch, '/orders')).toHaveLength(1)
    await click('立即充值')
    expect(requestKey(calls(fetch, '/orders')[1])).toBe(requestKey(calls(fetch, '/orders')[0]))
    expect(calls(fetch, '/orders').map(([, init]) => JSON.parse(String(init?.body)).amount_yuan)).toEqual(['10.01', '10.01'])
    expect(screen.getByRole('dialog')).toHaveTextContent('¥10.01')
  })

  it('另一账号不恢复前一账号意图，原账号仍可恢复自己的订单', async () => {
    const fetch = backend()
    const first = await mount(); await click('立即充值'); first.unmount()
    clearAuthTokens({ force: true, broadcast: false })
    saveAuthTokens({ ...AUTH, access_token: 'other-token', refresh_token: 'other-refresh', user: { ...AUTH.user, id: 'other-user' } })
    const other = await mount(); await click('立即充值'); other.unmount()
    expect(calls(fetch, '/orders')).toHaveLength(2)
    clearAuthTokens({ force: true, broadcast: false }); saveAuthTokens(AUTH)
    await mount(); await click('立即充值')
    expect(calls(fetch, '/orders')).toHaveLength(2)
    expect(requestKey(calls(fetch, '/pay')[2])).toBe(requestKey(calls(fetch, '/pay')[0]))
  })

  it('同主体两个已挂载入口提交时采用已有意图，不绕过存储约束新建订单', async () => {
    const fetch = backend({ pay: () => { throw new Error('response lost') } })
    const first = await mount()
    const second = await mount()
    await act(async () => { fireEvent.click(within(first.container).getByRole('button', { name: '微信' })) })
    await act(async () => { fireEvent.click(within(first.container).getByRole('button', { name: '立即充值' })) })
    await act(async () => { fireEvent.click(within(second.container).getByRole('button', { name: '立即充值' })) })
    expect(calls(fetch, '/orders')).toHaveLength(1)
    expect(calls(fetch, '/recovery-order')).toHaveLength(1)
    expect(calls(fetch, '/pay')).toHaveLength(2)
    expect(requestKey(calls(fetch, '/pay')[1])).toBe(requestKey(calls(fetch, '/pay')[0]))
    expect(within(second.container).getByRole('button', { name: '微信' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('pay直接已到账即使携带载体也刷新钱包和历史，不再展示付款码', async () => {
    const fetch = backend({ pay: () => response(payment({ ...ORDER, status: 'paid', paid_at: Date.now() })) })
    await mount(); await click('微信'); await click('立即充值')
    expect(screen.getByText('充值已到账')).toBeInTheDocument()
    expect(calls(fetch, '/wallet')).toHaveLength(2)
    expect(calls(fetch, '/statements')).toHaveLength(2)
    expect(screen.queryByLabelText('微信支付二维码')).toBeNull()
  })

  it('另一入口的原订单过期后重建仍采用它的金额渠道，不使用旧界面闭包', async () => {
    let sequence = 0
    const original = { ...ORDER, amount_yuan: '200.00', amount_cent: '20000' }
    const fetch = backend({ create: () => response({ ...original, id: `shared-${++sequence}`, status: 'pending' }), pay: () => { throw new Error('response lost') }, query: (id) => response({ ...original, id, status: 'expired' }) })
    const first = await mount()
    const second = await mount()
    for (const name of ['200 元', '微信', '立即充值']) await act(async () => { fireEvent.click(within(first.container).getByRole('button', { name })) })
    await act(async () => { fireEvent.click(within(second.container).getByRole('button', { name: '立即充值' })) })
    expect(calls(fetch, '/orders')).toHaveLength(2)
    expect(JSON.parse(String(calls(fetch, '/orders')[1][1]?.body))).toEqual({ amount_yuan: '200' })
    expect(JSON.parse(String(calls(fetch, '/pay')[1][1]?.body)).channel).toBe('wechat')
    expect(within(second.container).getByRole('button', { name: '200 元' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(second.container).getByRole('button', { name: '微信' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('pay已支付未入账无载体继续查单，入账后仅刷新一次', async () => {
    let settled = false
    const unpaid = { ...ORDER, status: 'paid', paid_at: null }
    const fetch = backend({ pay: () => response({ order: unpaid }), query: () => response({ ...unpaid, paid_at: settled ? Date.now() : null }) })
    await mount(); await click('微信'); await click('立即充值')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText('微信支付二维码无效，请重新发起支付')).toBeNull()
    expect(calls(fetch, '/recovery-order')).toHaveLength(1)
    settled = true; await advance(2000)
    expect(screen.getByText('充值已到账')).toBeInTheDocument()
    expect(calls(fetch, '/wallet')).toHaveLength(2)
    await advance(10_000)
    expect(calls(fetch, '/wallet')).toHaveLength(2)
  })

  it.each(['pending', 'paying', 'paid'])('回跳%s未入账继续确认到账，并刷新钱包历史', async (status) => {
    let settled = false
    const fetch = backend({ query: () => response({ ...ORDER, status: settled ? 'paid' : status, paid_at: settled ? Date.now() : null }) })
    await mount('/console/recharge?order_id=recovery-order')
    expect(screen.getByRole('button', { name: /刷新支付状态/ })).toBeInTheDocument()
    settled = true; await advance(2000)
    expect(screen.getByText('充值已到账')).toBeInTheDocument()
    expect(calls(fetch, '/wallet')).toHaveLength(2)
    expect(calls(fetch, '/statements')).toHaveLength(2)
    expect(calls(fetch, '/orders')).toHaveLength(0)
  })

  it('回跳短暂错误有持久重试入口，手动恢复仍查询原订单', async () => {
    let failed = true
    const fetch = backend({ query: () => { if (failed) throw new Error('offline'); return response({ ...ORDER, status: 'paid', paid_at: Date.now() }) } })
    const view = await mount('/console/recharge?order_id=recovery-order')
    expect(within(view.container).getByRole('alert')).toBeInTheDocument()
    failed = false; await click('重试')
    expect(screen.getByText('充值已到账')).toBeInTheDocument()
    expect(calls(fetch, '/recovery-order')).toHaveLength(2)
    expect(calls(fetch, '/orders')).toHaveLength(0)
  })

  it('回跳五分钟后停止自动查单，手动重试重新确认', async () => {
    const fetch = backend()
    await mount('/console/recharge?order_id=recovery-order'); await advance(300_000)
    const count = calls(fetch, '/recovery-order').length
    await advance(30_000)
    expect(calls(fetch, '/recovery-order')).toHaveLength(count)
    await click('重试')
    expect(calls(fetch, '/recovery-order')).toHaveLength(count + 1)
  })

  it('pay错配响应不展示二维码，后续仍查询原订单', async () => {
    const fetch = backend({ pay: () => response(payment({ ...ORDER, id: 'wrong-order', amount_yuan: '1.00', amount_cent: '100' })) })
    await mount(); await click('微信'); await click('立即充值')
    expect(screen.queryByLabelText('微信支付二维码')).toBeNull()
    await click('立即充值')
    expect(calls(fetch, '/orders')).toHaveLength(1)
    expect(calls(fetch, '/recovery-order')).toHaveLength(1)
    expect(calls(fetch, '/wrong-order')).toHaveLength(0)
  })

  it('exception停止自动轮询但仍可手动查单确认到账，不另建订单', async () => {
    let settled = false
    const fetch = backend({ query: () => response({ ...ORDER, status: settled ? 'paid' : 'exception', paid_at: settled ? Date.now() : null }) })
    await mount(); await click('微信'); await click('立即充值')
    await advance(10_000)
    expect(calls(fetch, '/recovery-order')).toHaveLength(1)
    settled = true; await click(/刷新支付状态/)
    expect(calls(fetch, '/recovery-order')).toHaveLength(2)
    expect(screen.getByText('充值已到账')).toBeInTheDocument()
    expect(calls(fetch, '/orders')).toHaveLength(1)
    expect(calls(fetch, '/wallet')).toHaveLength(2)
  })

  it('回跳exception保留显式查单入口，不支付或创建新订单', async () => {
    let settled = false
    const fetch = backend({ query: () => response({ ...ORDER, status: settled ? 'paid' : 'exception', paid_at: settled ? Date.now() : null }) })
    await mount('/console/recharge?order_id=recovery-order'); await advance(10_000)
    expect(calls(fetch, '/recovery-order')).toHaveLength(1)
    settled = true; await click(/刷新支付状态/)
    expect(screen.getByText('充值已到账')).toBeInTheDocument()
    expect(calls(fetch, '/recovery-order')).toHaveLength(2)
    expect(calls(fetch, '/orders')).toHaveLength(0)
    expect(calls(fetch, '/pay')).toHaveLength(0)
  })
})
