import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResult } from '@/api/auth'
import { clearAuthTokens, getAccessToken, readRefreshToken, saveAuthTokens, subscribeAuthTokenChanges } from '@/auth/token-storage'
import { completeBinding, completeWechatLogin, invalidateAuth, loginWithEmail, loginWithPhone, logoutAuth, synchronizeAuthenticatedUser } from './auth-slice'
import { createAppStore } from './index'
import { requestPurchaseLogin } from './purchase-intent-slice'

function result(userId = 'new-user'): AuthResult {
  return {
    status: 'succeeded', binding_required: false,
    access_token: 'new-access', refresh_token: 'new-refresh',
    access_expires_at: Date.UTC(2099, 0, 1), refresh_expires_at: Date.UTC(2099, 1, 1),
    user: { id: userId, display_name: '新登录资料', avatar_url: '' },
  }
}

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data, code: status === 200 ? 0 : 160005, msg: status === 200 ? 'success' : '验证码错误' }), {
    status, headers: { 'Content-Type': 'application/json' },
  })
}

// 保留真实 thunk、令牌广播及 reducer，只控制网络返回顺序。
function deferredResponse() {
  let finish!: (value: Response) => void
  const promise = new Promise<Response>(resolve => { finish = resolve })
  return { promise, finish }
}

const channels = ['phone', 'email', 'binding'] as const
type Channel = typeof channels[number]

function startLogin(store: ReturnType<typeof createAppStore>, channel: Channel) {
  if (channel === 'email') return store.dispatch(loginWithEmail({ destination: 'test@example.com', code: '123456' }))
  if (channel === 'binding') return store.dispatch(completeBinding({ bindingTicket: 'ticket', phone: '13800138000', code: '123456' }))
  return store.dispatch(loginWithPhone({ destination: '13800138000', code: '123456' }))
}

function synchronizeTokens(store: ReturnType<typeof createAppStore>) {
  return subscribeAuthTokenChanges(change => {
    if (change.type === 'signed-out') store.dispatch(invalidateAuth())
    else if (change.user) store.dispatch(synchronizeAuthenticatedUser(change.user, change.isRefresh === true))
  })
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  clearAuthTokens({ force: true })
})
afterEach(() => { vi.restoreAllMocks() })

describe.each(channels)('%s 登录失败归属', channel => {
  it.each(['same-user', 'new-user'])('新会话 %s 已同步后，旧失败不覆盖用户或令牌', async userId => {
    saveAuthTokens({ ...result('same-user'), access_token: 'old-access', refresh_token: 'old-refresh' })
    const store = createAppStore()
    store.dispatch(synchronizeAuthenticatedUser(result('same-user').user!))
    const unsubscribe = synchronizeTokens(store)
    const pending = deferredResponse()
    vi.spyOn(globalThis, 'fetch').mockReturnValue(pending.promise)
    try {
      const request = startLogin(store, channel)
      saveAuthTokens(result(userId))
      const synchronized = store.getState().auth
      pending.finish(response(null, 401))
      await request
      expect(store.getState().auth).toEqual(synchronized)
      expect(store.getState().auth).toMatchObject({ status: 'authenticated', user: result(userId).user, error: null })
      expect(getAccessToken()).toBe('new-access')
      expect(readRefreshToken()).toBe('new-refresh')
    } finally { unsubscribe() }
  })

  it('旧失败不打断更新的登录，也不丢失该次登录的购买意图', async () => {
    const store = createAppStore()
    const unsubscribe = synchronizeTokens(store)
    const first = deferredResponse()
    const second = deferredResponse()
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    try {
      store.dispatch(requestPurchaseLogin('selected-plan'))
      const oldRequest = startLogin(store, channel)
      const currentRequest = startLogin(store, channel)
      const loading = store.getState().auth
      first.finish(response(null, 401))
      await oldRequest
      expect(store.getState().auth).toEqual(loading)
      expect(store.getState().purchaseIntent.loginInFlight).toBe(true)
      second.finish(response(result()))
      await currentRequest.unwrap()
      expect(store.getState().auth).toMatchObject({ status: 'authenticated', user: result().user, loginSequence: 1, error: null })
      expect(store.getState().purchaseIntent.resume).toEqual({ planID: 'selected-plan', userID: 'new-user' })
    } finally { unsubscribe() }
  })

  it.each(['invalidate', 'logout'])('%s 后旧失败不重新写入认证错误', async action => {
    const store = createAppStore()
    const pending = deferredResponse()
    vi.spyOn(globalThis, 'fetch').mockReturnValue(pending.promise)
    const request = startLogin(store, channel)
    if (action === 'logout') await store.dispatch(logoutAuth())
    else store.dispatch(invalidateAuth())
    const signedOut = store.getState().auth
    pending.finish(response(null, 401))
    await request
    expect(store.getState().auth).toEqual(signedOut)
    expect(getAccessToken()).toBeNull()
    expect(readRefreshToken()).toBeNull()
  })

  it('当前请求失败仍返回验证码错误并允许重试成功', async () => {
    const store = createAppStore()
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(null, 401)).mockResolvedValueOnce(response(result()))
    await expect(startLogin(store, channel).unwrap()).rejects.toMatchObject({ message: '验证码错误', code: 160005 })
    expect(store.getState().auth).toMatchObject({ status: 'unauthenticated', user: null, error: { message: '验证码错误' } })
    await startLogin(store, channel).unwrap()
    expect(store.getState().auth).toMatchObject({ status: 'authenticated', user: result().user, error: null, loginSequence: 1 })
  })
})

it('微信结果失败不能覆盖紧接着同步的新会话', async () => {
  const store = createAppStore()
  const unsubscribe = synchronizeTokens(store)
  try {
    const pending = store.dispatch(completeWechatLogin({ status: 'pending_binding', binding_required: true }))
    saveAuthTokens(result())
    const synchronized = store.getState().auth
    await pending
    expect(store.getState().auth).toEqual(synchronized)
    expect(getAccessToken()).toBe('new-access')
  } finally { unsubscribe() }
})

it('正常微信登录的本地同步仍计入主动登录并恢复购买', async () => {
  const store = createAppStore()
  const unsubscribe = synchronizeTokens(store)
  try {
    store.dispatch(requestPurchaseLogin('wechat-plan'))
    await store.dispatch(completeWechatLogin(result())).unwrap()
    expect(store.getState().auth).toMatchObject({ status: 'authenticated', user: result().user, loginSequence: 1 })
    expect(store.getState().purchaseIntent.resume).toEqual({ planID: 'wechat-plan', userID: 'new-user' })
  } finally { unsubscribe() }
})
