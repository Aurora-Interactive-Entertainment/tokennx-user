import { describe, expect, it } from 'vitest'
import { createAppStore } from './index'
import { invalidateAuth, loginWithEmail, loginWithPhone, synchronizeAuthenticatedUser } from './auth-slice'
import { closePurchaseLogin, consumePurchaseIntent, requestPurchaseLogin } from './purchase-intent-slice'

const user = { id: 'buyer', display_name: '购买测试', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' }
const phoneLogin = { destination: '13800138000', code: '123456' }
const emailLogin = { destination: 'buyer@example.com', code: '123456' }

describe('跨登录重挂载的购买意图', () => {
  it('主动登录中的本地同步不丢失套餐，只在登录完成后生成用户绑定意图', () => {
    const store = createAppStore()
    store.dispatch(requestPurchaseLogin('real-plan'))
    store.dispatch(loginWithPhone.pending('phone-login', phoneLogin))
    store.dispatch(synchronizeAuthenticatedUser(user))
    expect(store.getState().purchaseIntent.loginPlanID).toBe('real-plan')
    expect(store.getState().purchaseIntent.resume).toBeNull()
    store.dispatch(loginWithPhone.fulfilled(user, 'phone-login', phoneLogin))
    expect(store.getState().purchaseIntent.resume).toEqual({ planID: 'real-plan', userID: user.id })
    // 旧登录组件关闭回调不得取消已经交接给新页面的意图。
    store.dispatch(closePurchaseLogin())
    expect(store.getState().purchaseIntent.resume?.planID).toBe('real-plan')
    store.dispatch(consumePurchaseIntent())
    expect(store.getState().purchaseIntent.resume).toBeNull()
  })

  it('登录失败保留重试入口，取消后后续登录不能自动购买', () => {
    const store = createAppStore()
    store.dispatch(requestPurchaseLogin('real-plan'))
    store.dispatch(loginWithPhone.pending('phone-login', phoneLogin))
    store.dispatch(loginWithPhone.rejected(new Error('验证码错误'), 'phone-login', phoneLogin))
    expect(store.getState().purchaseIntent.loginPlanID).toBe('real-plan')
    expect(store.getState().purchaseIntent.loginInFlight).toBe(false)
    expect(store.getState().purchaseIntent.loginRequestId).toBeUndefined()
    store.dispatch(closePurchaseLogin())
    store.dispatch({ type: 'auth/loginWithPhone/fulfilled', payload: user })
    expect(store.getState().purchaseIntent.resume).toBeNull()
  })

  it('旧登录失败不能中断新登录的购买接续', () => {
    const store = createAppStore()
    store.dispatch(requestPurchaseLogin('real-plan'))
    store.dispatch(loginWithPhone.pending('old-login', phoneLogin))
    store.dispatch(loginWithEmail.pending('current-login', emailLogin))
    store.dispatch(loginWithPhone.rejected(new Error('旧验证码错误'), 'old-login', phoneLogin))
    expect(store.getState().purchaseIntent).toMatchObject({ loginInFlight: true, loginRequestId: 'current-login', loginPlanID: 'real-plan' })
    // 与令牌保存一致：先同步登录用户，随后才提交登录成功结果。
    store.dispatch(synchronizeAuthenticatedUser(user))
    store.dispatch(loginWithEmail.fulfilled(user, 'current-login', emailLogin))
    expect(store.getState().purchaseIntent).toMatchObject({ loginInFlight: false, resume: { planID: 'real-plan', userID: user.id } })
    expect(store.getState().purchaseIntent.loginRequestId).toBeUndefined()
  })

  it('会话失效清理登录标识，旧失败不能结束重新发起的登录', () => {
    const store = createAppStore()
    store.dispatch(loginWithPhone.pending('old-login', phoneLogin))
    store.dispatch(invalidateAuth())
    expect(store.getState().purchaseIntent.loginRequestId).toBeUndefined()
    store.dispatch(requestPurchaseLogin('new-plan'))
    store.dispatch(loginWithEmail.pending('current-login', emailLogin))
    store.dispatch(loginWithPhone.rejected(new Error('旧验证码错误'), 'old-login', phoneLogin))
    expect(store.getState().purchaseIntent).toMatchObject({ loginInFlight: true, loginRequestId: 'current-login', loginPlanID: 'new-plan' })
  })

  it('其他标签页换号与会话失效清除旧意图', () => {
    const store = createAppStore()
    store.dispatch(requestPurchaseLogin('real-plan'))
    store.dispatch(synchronizeAuthenticatedUser(user))
    expect(store.getState().purchaseIntent.loginPlanID).toBeNull()
    store.dispatch(requestPurchaseLogin('real-plan'))
    store.dispatch({ type: 'auth/loginWithPhone/fulfilled', payload: user })
    store.dispatch(synchronizeAuthenticatedUser({ ...user, id: 'another-buyer' }))
    expect(store.getState().purchaseIntent.resume).toBeNull()
    store.dispatch(requestPurchaseLogin('real-plan'))
    store.dispatch(invalidateAuth())
    expect(store.getState().purchaseIntent.loginPlanID).toBeNull()
  })
})
