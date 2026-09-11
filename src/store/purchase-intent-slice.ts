import { createSlice, isAnyOf, type PayloadAction } from '@reduxjs/toolkit'
import { completeBinding, completeWechatLogin, invalidateAuth, loginWithEmail, loginWithPhone, logoutAuth, synchronizeAuthenticatedUser } from './auth-slice'

// 登录会重新挂载页面，只在当前应用内暂存套餐 ID；价格与购买资格必须重新查询。
const purchaseIntentSlice = createSlice({
  name: 'purchaseIntent',
  initialState: { loginPlanID: null as string | null, loginInFlight: false, resume: null as { planID: string; userID: string } | null },
  reducers: {
    requestPurchaseLogin(state, action: PayloadAction<string>) {
      state.loginPlanID = action.payload
      state.resume = null
    },
    closePurchaseLogin(state) { state.loginPlanID = null },
    consumePurchaseIntent(state) { state.resume = null },
  },
  extraReducers: builder => {
    builder.addCase(synchronizeAuthenticatedUser, (state, action) => {
      // 本标签页保存令牌时也会广播同步事件；主动登录尚未完成时不能清掉购买意图。
      if (!state.loginInFlight) state.loginPlanID = null
      if (state.resume?.userID !== action.payload.id) state.resume = null
    })
    builder.addMatcher(isAnyOf(loginWithEmail.pending, loginWithPhone.pending, completeWechatLogin.pending, completeBinding.pending), state => {
      state.loginInFlight = true
    })
    builder.addMatcher(isAnyOf(loginWithEmail.rejected, loginWithPhone.rejected, completeWechatLogin.rejected, completeBinding.rejected), state => {
      state.loginInFlight = false
    })
    builder.addMatcher(isAnyOf(loginWithEmail.fulfilled, loginWithPhone.fulfilled, completeWechatLogin.fulfilled, completeBinding.fulfilled), (state, action) => {
      if (state.loginPlanID) state.resume = { planID: state.loginPlanID, userID: action.payload.id }
      state.loginPlanID = null
      state.loginInFlight = false
    })
    builder.addMatcher(isAnyOf(invalidateAuth, logoutAuth.fulfilled, logoutAuth.rejected), state => {
      // 登出、会话失效或其他标签页换号都不能继承上一个购买意图。
      state.loginPlanID = null
      state.resume = null
      state.loginInFlight = false
    })
  },
})

export const { requestPurchaseLogin, closePurchaseLogin, consumePurchaseIntent } = purchaseIntentSlice.actions
export default purchaseIntentSlice.reducer
