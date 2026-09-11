import { describe, expect, it } from 'vitest'
import { createAppStore } from './index'
import { invalidateAuth, synchronizeAuthenticatedUser } from './auth-slice'
import { closePurchaseLogin, consumePurchaseIntent, requestPurchaseLogin } from './purchase-intent-slice'

const user = { id: 'buyer', display_name: '购买测试', avatar_url: '', locale: 'zh-CN', timezone: 'Asia/Shanghai', status: 'active' }

describe('跨登录重挂载的购买意图', () => {
  it('主动登录中的本地同步不丢失套餐，只在登录完成后生成用户绑定意图', () => {
    const store = createAppStore()
    store.dispatch(requestPurchaseLogin('real-plan'))
    store.dispatch({ type: 'auth/loginWithPhone/pending' })
    store.dispatch(synchronizeAuthenticatedUser(user))
    expect(store.getState().purchaseIntent.loginPlanID).toBe('real-plan')
    expect(store.getState().purchaseIntent.resume).toBeNull()
    store.dispatch({ type: 'auth/loginWithPhone/fulfilled', payload: user })
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
    store.dispatch({ type: 'auth/loginWithPhone/pending' })
    store.dispatch({ type: 'auth/loginWithPhone/rejected' })
    expect(store.getState().purchaseIntent.loginPlanID).toBe('real-plan')
    expect(store.getState().purchaseIntent.loginInFlight).toBe(false)
    store.dispatch(closePurchaseLogin())
    store.dispatch({ type: 'auth/loginWithPhone/fulfilled', payload: user })
    expect(store.getState().purchaseIntent.resume).toBeNull()
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
