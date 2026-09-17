import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingPaymentIntent } from './pending-payment-intent'

const auth = vi.hoisted(() => ({ userID: 'user-a' as string | null }))
vi.mock('@/auth/token-storage', () => ({ getAccessTokenUserId: () => auth.userID }))

let api: typeof import('./pending-payment-intent')
const personal = { account_type: 'personal' as const }
const intent: PendingPaymentIntent = {
  id: 'intent-a', createKey: 'create-a', payKey: 'pay-a', channel: 'wechat', orderID: null, amountYuan: '100',
}

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()
  window.sessionStorage.clear()
  auth.userID = 'user-a'
  api = await import('./pending-payment-intent')
})

describe('待付意图隔离与生命周期', () => {
  it('创建前保存原幂等键与金额，获得订单ID后保存，重新加载模块仍可恢复', async () => {
    const scope = api.paymentIntentScope(personal, 'recharge')
    api.writePendingPaymentIntent(scope, intent)
    expect(api.readPendingPaymentIntent(scope)).toEqual(intent)
    api.writePendingPaymentIntent(scope, { ...intent, orderID: 'order-a' })
    vi.resetModules()
    const reloaded = await import('./pending-payment-intent')
    expect(reloaded.readPendingPaymentIntent(scope)).toEqual({ ...intent, orderID: 'order-a' })
    expect(reloaded.readPendingPaymentIntent(scope)?.amountYuan).toBe('100')
    expect(JSON.parse(window.sessionStorage.getItem(scope!)!)).toEqual({ ...intent, orderID: 'order-a' })
  })

  it('账号、主体、业务类型和套餐ID形成不同scope', () => {
    const scopes = [
      api.paymentIntentScope(personal, 'recharge'),
      api.paymentIntentScope({ account_type: 'enterprise', enterprise_id: 'enterprise-a' }, 'recharge'),
      api.paymentIntentScope({ account_type: 'enterprise', enterprise_id: 'enterprise-b' }, 'recharge'),
      api.paymentIntentScope(personal, 'plan', 'plan-a'),
      api.paymentIntentScope(personal, 'plan', 'plan-b'),
    ]
    auth.userID = 'user-b'
    scopes.push(api.paymentIntentScope(personal, 'recharge'))
    expect(new Set(scopes).size).toBe(6)
    expect(scopes.every(Boolean)).toBe(true)
  })

  it('切换账号后持有旧scope也不能读、写或清理旧账号意图', () => {
    const scopeA = api.paymentIntentScope(personal, 'recharge')
    api.writePendingPaymentIntent(scopeA, intent)
    auth.userID = 'user-b'
    expect(api.readPendingPaymentIntent(scopeA)).toBeNull()
    api.writePendingPaymentIntent(scopeA, { ...intent, orderID: 'wrong-order' })
    api.clearPendingPaymentIntent(scopeA, intent.id)
    const scopeB = api.paymentIntentScope(personal, 'recharge')
    expect(api.readPendingPaymentIntent(scopeB)).toBeNull()
    auth.userID = 'user-a'
    expect(api.readPendingPaymentIntent(scopeA)).toEqual(intent)
  })

  it('只允许同id更新，旧会话不能覆盖或删除新意图', () => {
    const scope = api.paymentIntentScope(personal, 'recharge')
    api.writePendingPaymentIntent(scope, intent)
    api.writePendingPaymentIntent(scope, { ...intent, id: 'intent-b', createKey: 'create-b' })
    expect(api.readPendingPaymentIntent(scope)?.id).toBe(intent.id)
    api.clearPendingPaymentIntent(scope, intent.id)
    const next = { ...intent, id: 'intent-b', createKey: 'create-b' }
    api.writePendingPaymentIntent(scope, next)
    api.clearPendingPaymentIntent(scope, intent.id)
    api.writePendingPaymentIntent(scope, intent)
    expect(api.readPendingPaymentIntent(scope)).toEqual(next)
  })

  it('读取返回副本，外部修改不能改变待恢复键；没有时间淘汰未知订单', () => {
    const scope = api.paymentIntentScope(personal, 'recharge')
    api.writePendingPaymentIntent(scope, intent)
    const read = api.readPendingPaymentIntent(scope)!
    read.createKey = 'changed-outside'
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 365 * 86400_000)
    expect(api.readPendingPaymentIntent(scope)).toEqual(intent)
  })

  it('套餐意图可在下单前不带金额，下单后保存已验证的金额快照', () => {
    const scope = api.paymentIntentScope(personal, 'plan', 'plan-a')
    const { amountYuan: _amount, ...planIntent } = intent
    api.writePendingPaymentIntent(scope, planIntent)
    expect(api.readPendingPaymentIntent(scope)).toEqual(planIntent)
    api.writePendingPaymentIntent(scope, { ...planIntent, amountYuan: '23.99', orderID: 'plan-order' })
    expect(api.readPendingPaymentIntent(scope)?.amountYuan).toBe('23.99')
  })

  it('未知身份、缺少企业/套餐ID及null scope都安全跳过', () => {
    expect(api.paymentIntentScope({ account_type: 'enterprise' }, 'recharge')).toBeNull()
    expect(api.paymentIntentScope(personal, 'plan')).toBeNull()
    auth.userID = null
    expect(api.paymentIntentScope(personal, 'recharge')).toBeNull()
    expect(() => {
      api.writePendingPaymentIntent(null, intent)
      api.clearPendingPaymentIntent(null, intent.id)
    }).not.toThrow()
    expect(api.readPendingPaymentIntent(null)).toBeNull()
    expect(window.sessionStorage.length).toBe(0)
  })
})

describe('不信任的存储与浏览器存储降级', () => {
  it.each([
    'not-json', 'null', '[]', '{}',
    JSON.stringify({ ...intent, accessToken: '不能存储' }),
    JSON.stringify({ ...intent, qr: '不能存储' }),
    JSON.stringify({ ...intent, channel: 'unknown' }),
    JSON.stringify({ ...intent, createKey: 'bad\nheader' }),
    JSON.stringify({ ...intent, orderID: 123 }),
    JSON.stringify({ ...intent, amountYuan: '-1' }),
    JSON.stringify({ ...intent, amountYuan: '1e2' }),
    JSON.stringify({ ...intent, amountYuan: '1.001' }),
    JSON.stringify({ ...intent, amountYuan: '0.00' }),
    JSON.stringify({ ...intent, amountYuan: undefined }),
  ])('拒绝坏数据与白名单以外字段：%s', (raw) => {
    const scope = api.paymentIntentScope(personal, 'recharge')!
    window.sessionStorage.setItem(scope, raw)
    expect(api.readPendingPaymentIntent(scope)).toBeNull()
  })

  it('拒绝写入附带令牌、二维码或表单的对象', () => {
    const scope = api.paymentIntentScope(personal, 'recharge')!
    for (const extras of [{ token: 'secret' }, { qr: 'qr' }, { form: '<form>' }]) {
      api.writePendingPaymentIntent(scope, { ...intent, ...extras })
      expect(window.sessionStorage.getItem(scope)).toBeNull()
    }
  })

  it('sessionStorage getter不可访问时可在内存恢复，并仍然按账号隔离', () => {
    const scope = api.paymentIntentScope(personal, 'recharge')
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new DOMException('禁止存储', 'SecurityError') })
    api.writePendingPaymentIntent(scope, intent)
    expect(api.readPendingPaymentIntent(scope)).toEqual(intent)
    auth.userID = 'user-b'
    expect(api.readPendingPaymentIntent(scope)).toBeNull()
    auth.userID = 'user-a'
    api.clearPendingPaymentIntent(scope, intent.id)
    expect(api.readPendingPaymentIntent(scope)).toBeNull()
  })

  it('配额写入失败使用新内存快照，清理失败不会复活旧存储订单', () => {
    const scope = api.paymentIntentScope(personal, 'recharge')!
    api.writePendingPaymentIntent(scope, intent)
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('已满', 'QuotaExceededError') })
    api.writePendingPaymentIntent(scope, { ...intent, orderID: 'known-order' })
    expect(api.readPendingPaymentIntent(scope)?.orderID).toBe('known-order')
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('禁止清理', 'SecurityError') })
    api.clearPendingPaymentIntent(scope, intent.id)
    expect(api.readPendingPaymentIntent(scope)).toBeNull()
    expect(JSON.parse(window.sessionStorage.getItem(scope)!).orderID).toBeNull()
    set.mockRestore()
    remove.mockRestore()
    api.writePendingPaymentIntent(scope, { ...intent, id: 'new-intent' })
    expect(api.readPendingPaymentIntent(scope)?.id).toBe('new-intent')
    expect(JSON.parse(window.sessionStorage.getItem(scope)!).id).toBe('new-intent')
  })
})
