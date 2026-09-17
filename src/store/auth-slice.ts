import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { getCurrentUser, loginByEmail, loginByPhone, logout, sendBindingPhoneCode, sendEmailCode, sendPhoneCode, bindWechatPhone, type AuthResult, type AuthUser, type EmailCodeResult, type PhoneCodeResult } from '@/api/auth'
import { AUTH_INVALID_CODE, isApiError } from '@/api/http'
import { withAuthenticatedSession } from '@/api/authenticated'
import { clearAuthTokens, getAccessToken, getAuthSessionSnapshot, readRefreshToken, saveAuthTokens, updateAuthSessionUser } from '@/auth/token-storage'
import { withAuthSessionLock } from '@/auth/refresh-coordinator'
import i18n from '@/i18n'

export interface AuthOperationError {
  message: string
  code: number
  status: number
}

export interface AuthState {
  status: 'unknown' | 'loading' | 'restore-failed' | 'unauthenticated' | 'authenticated'
  user: AuthUser | null
  error: AuthOperationError | null
  /** 记录本标签页主动登录次数，用于区分登录成功与后台会话刷新。 */
  loginSequence: number
  /** 只允许当前登录请求提交失败，避免迟到错误覆盖新会话或新的登录。 */
  loginRequestId?: string
  /** 只允许当前恢复请求提交，退出或主动登录后作废。 */
  hydrationRequestId?: string
  /** 后台恢复失败单独保存，不覆盖登录表单错误，也不伪造退出状态。 */
  hydrationError?: AuthOperationError | null
  logoutRequestId?: string
}

const initialState: AuthState = {
  status: 'unknown',
  user: null,
  error: null,
  loginSequence: 0,
}

type ThunkConfig = { rejectValue: AuthOperationError }

export function authError(error: unknown): AuthOperationError {
  if (!isApiError(error)) return { message: i18n.t('api.auth.requestFailed'), code: 0, status: 0 }
  if (error.apiMessage) return { message: error.apiMessage, code: error.code, status: error.status }
  const messages: Record<number, string> = {
    100001: i18n.t('api.auth.invalidInput'),
    100004: i18n.t('api.auth.sessionExpired'),
    100006: i18n.t('api.auth.sessionConflict'),
    100007: i18n.t('api.auth.unavailable'),
    [AUTH_INVALID_CODE]: i18n.t('api.auth.invalidCode'),
    // 灰度期间兼容旧认证服务错误码，新部署统一使用 160xxx。
    110001: i18n.t('api.auth.invalidCode'),
    160002: i18n.t('api.auth.bindingRequired'),
    160003: i18n.t('api.auth.phoneAlreadyBound'),
    160004: i18n.t('api.auth.codeTooFrequent'),
    160005: i18n.t('login.invalidVerificationCode'),
    160006: i18n.t('login.invalidBindingTicket'),
    160007: i18n.t('login.wechatExpired'),
    160008: i18n.t('login.accountUnavailable'),
    120003: i18n.t('login.originNotAllowed'),
    110002: i18n.t('api.auth.bindingRequired'),
    110003: i18n.t('api.auth.phoneAlreadyBound'),
    110004: i18n.t('api.auth.codeTooFrequent'),
  }
  return { message: messages[error.code] ?? (error.message || i18n.t('api.auth.requestFailed')), code: error.code, status: error.status }
}

function completeAuth(result: AuthResult): AuthUser {
  if (result.status !== 'succeeded' || result.binding_required || !result.user) throw new Error(i18n.t('api.auth.incomplete'))
  // 首次登录标记位于认证响应顶层，登录成功后下沉到用户状态供控制台统一触发引导。
  const user = result.promt_required === undefined ? result.user : { ...result.user, promt_required: result.promt_required }
  saveAuthTokens({ ...result, user })
  return user
}

export const hydrateAuth = createAsyncThunk<AuthUser | null, void, { rejectValue: 'session-changed' | { error: AuthOperationError; user: AuthUser | null } }>('auth/hydrate', async (_, { rejectWithValue }) => {
  if (!readRefreshToken()) return null
  const requestedSession = getAuthSessionSnapshot()
  if (!requestedSession) return null
  let accessToVerify = requestedSession.accessToken
  let responseAccessToken: string | null = null
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      // 页面重建先复用现有访问令牌；缺少令牌或 /me 返回 401 时由统一管道续期。
      const currentUser = await withAuthenticatedSession({ accessToken: accessToVerify ?? undefined }, async access => {
        responseAccessToken = access
        return getCurrentUser(access)
      })
      const currentSession = getAuthSessionSnapshot()
      // 同账号重新登录也属于新会话，迟到的 /me 不能覆盖新登录的身份。
      if (!currentSession || currentSession.sessionId !== requestedSession.sessionId) return rejectWithValue('session-changed')
      if (currentSession.accessToken !== responseAccessToken) {
        // 其他标签页续期时保留最新已验证身份；未带用户则仅补查一次新令牌，不能无限追逐轮换。
        if (currentSession.user) return currentSession.user
        if (attempt === 0 && currentSession.accessToken) {
          accessToVerify = currentSession.accessToken
          continue
        }
        return rejectWithValue('session-changed')
      }
      if (!currentUser?.id || (currentSession.user && currentUser.id !== currentSession.user.id)) throw new Error(i18n.t('api.auth.incomplete'))
      const promtRequired = currentSession.promtRequired ?? currentSession.user?.promt_required
      const user = promtRequired === undefined
        ? currentUser
        : { ...currentUser, promt_required: promtRequired }
      // 刷新接口可以省略 user，只有 /me 验证成功后才为当前访问令牌登记用户归属。
      if (!responseAccessToken || !updateAuthSessionUser(user, responseAccessToken)) return rejectWithValue('session-changed')
      return user
    }
    return rejectWithValue('session-changed')
  } catch (error) {
    const currentSession = getAuthSessionSnapshot()
    // 只有统一认证流程确认长期会话失效并清除后，才恢复为未登录。
    if (!currentSession) return null
    if (currentSession.sessionId !== requestedSession.sessionId) return rejectWithValue('session-changed')
    // /me、网络或服务临时失败均保留已验证身份，不能把业务 401 当成刷新令牌失效。
    return rejectWithValue({ error: authError(error), user: currentSession.user ?? requestedSession.user ?? null })
  }
})

export const requestPhoneCode = createAsyncThunk<PhoneCodeResult, { destination: string; countryCode?: string }, ThunkConfig>('auth/requestPhoneCode', async ({ destination, countryCode = '+86' }, { rejectWithValue }) => {
  try {
    return await sendPhoneCode(destination, countryCode)
  } catch (error) {
    return rejectWithValue(authError(error))
  }
})

export const requestEmailCode = createAsyncThunk<EmailCodeResult, { destination: string }, ThunkConfig>('auth/requestEmailCode', async ({ destination }, { rejectWithValue }) => {
  try {
    return await sendEmailCode(destination)
  } catch (error) {
    return rejectWithValue(authError(error))
  }
})

export const loginWithEmail = createAsyncThunk<AuthUser, { destination: string; code: string; inviteCode?: string }, ThunkConfig>('auth/loginWithEmail', async ({ destination, code, inviteCode }, { rejectWithValue }) => {
  try {
    return completeAuth(await loginByEmail(destination, code, inviteCode))
  } catch (error) {
    return rejectWithValue(authError(error))
  }
})

export const loginWithPhone = createAsyncThunk<AuthUser, { destination: string; code: string; inviteCode?: string }, ThunkConfig>('auth/loginWithPhone', async ({ destination, code, inviteCode }, { rejectWithValue }) => {
  try {
    return completeAuth(await loginByPhone(destination, code, inviteCode))
  } catch (error) {
    return rejectWithValue(authError(error))
  }
})

export const completeWechatLogin = createAsyncThunk<AuthUser, AuthResult, ThunkConfig>('auth/completeWechatLogin', async (result, { rejectWithValue }) => {
  try {
    return completeAuth(result)
  } catch (error) {
    return rejectWithValue(authError(error))
  }
})

export const requestBindingCode = createAsyncThunk<PhoneCodeResult, { bindingTicket: string; phone: string; countryCode?: string }, ThunkConfig>('auth/requestBindingCode', async ({ bindingTicket, phone, countryCode = '+86' }, { rejectWithValue }) => {
  try {
    return await sendBindingPhoneCode(bindingTicket, phone, countryCode)
  } catch (error) {
    return rejectWithValue(authError(error))
  }
})

export const completeBinding = createAsyncThunk<AuthUser, { bindingTicket: string; phone: string; code: string; inviteCode?: string }, ThunkConfig>('auth/completeBinding', async ({ bindingTicket, phone, code, inviteCode }, { rejectWithValue }) => {
  try {
    return completeAuth(await bindWechatPhone(bindingTicket, phone, code, inviteCode))
  } catch (error) {
    return rejectWithValue(authError(error))
  }
})

export const logoutAuth = createAsyncThunk<boolean, void, ThunkConfig>('auth/logout', async (_, { rejectWithValue }) => {
  const requestedSession = getAuthSessionSnapshot()
  const requestedAccessToken = getAccessToken()
  // 自动轮换仍属于原会话；同账号重新登录也会获得新 sessionId，不能被旧退出请求清除。
  const ownsSession = (): boolean => {
    const current = getAuthSessionSnapshot()
    return requestedSession
      ? current?.sessionId === requestedSession.sessionId
      : !current && getAccessToken() === requestedAccessToken
  }
  const clearRequestedSession = (): void => {
    const current = getAuthSessionSnapshot()
    clearAuthTokens(current ? { expectedRefreshToken: current.refreshToken } : { force: true })
  }
  try {
    return await withAuthSessionLock(async () => {
      if (!ownsSession()) return false
      // 等待中的刷新可能已经完成，必须使用该会话轮换后的最新访问令牌。
      const currentAccessToken = getAuthSessionSnapshot()?.accessToken ?? getAccessToken()
      if (currentAccessToken) await logout(currentAccessToken)
      if (!ownsSession()) return false
      clearRequestedSession()
      return true
    })
  } catch (error) {
    if (!ownsSession()) return false
    clearRequestedSession()
    return rejectWithValue(authError(error))
  }
})

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearAuthError(state) {
      state.error = null
    },
    // 令牌验证失败时清除前端认证状态，由调用方回到公开首页。
    invalidateAuth(state) {
      state.loginRequestId = undefined
      state.hydrationRequestId = undefined
      state.hydrationError = null
      state.logoutRequestId = undefined
      state.status = 'unauthenticated'
      state.user = null
      state.error = null
    },
    // 其他标签页完成登录或刷新后，及时同步当前页面的用户状态。
    synchronizeAuthenticatedUser: {
      reducer(state, action: PayloadAction<AuthUser, string, { isRefresh: boolean }>) {
        // 已同步的身份优先于旧登录错误；本地保存令牌的同步不影响随后 fulfilled 的成功交接。
        state.loginRequestId = undefined
        if (state.user && state.user.id !== action.payload.id) state.hydrationRequestId = undefined
        state.hydrationError = null
        // 自动刷新不取消已经点击的退出；主动登录同步会废弃旧退出的状态提交。
        if (!action.meta?.isRefresh) state.logoutRequestId = undefined
        state.status = 'authenticated'
        state.user = action.payload
        state.error = null
      },
      prepare(user: AuthUser, isRefresh = false) { return { payload: user, meta: { isRefresh } } },
    },
    // 个人中心保存资料后立即同步 Header，避免刷新前继续展示旧账号信息。
    updateAuthenticatedUser(state, action: PayloadAction<AuthUser>) {
      if (state.status === 'authenticated') state.user = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(hydrateAuth.pending, (state, action) => { state.hydrationRequestId = action.meta.requestId; if (!state.user) state.status = 'loading'; state.error = null })
      .addCase(hydrateAuth.fulfilled, (state, action) => {
        if (state.hydrationRequestId !== action.meta.requestId) return
        state.hydrationRequestId = undefined
        state.hydrationError = null
        state.status = action.payload ? 'authenticated' : 'unauthenticated'; state.user = action.payload; state.error = null
      })
      .addCase(hydrateAuth.rejected, (state, action) => {
        if (state.hydrationRequestId !== action.meta.requestId) return
        state.hydrationRequestId = undefined
        if (action.payload && action.payload !== 'session-changed') {
          state.user = action.payload.user
          state.status = state.user ? 'authenticated' : 'restore-failed'
          state.hydrationError = action.payload.error
        } else if (state.status === 'loading') {
          state.status = 'restore-failed'
          state.hydrationError = { message: i18n.t('api.auth.requestFailed'), code: 0, status: 0 }
        }
      })
      .addCase(loginWithEmail.pending, (state, action) => { state.loginRequestId = action.meta.requestId; state.hydrationRequestId = undefined; state.hydrationError = null; state.logoutRequestId = undefined; state.status = 'loading'; state.error = null })
      .addCase(loginWithEmail.fulfilled, (state, action) => { state.loginRequestId = undefined; state.status = 'authenticated'; state.user = action.payload; state.error = null; state.loginSequence += 1 })
      .addCase(loginWithEmail.rejected, (state, action) => {
        if (state.loginRequestId !== action.meta.requestId) return
        state.loginRequestId = undefined
        state.status = 'unauthenticated'; state.user = null; state.error = action.payload ?? { message: i18n.t('api.auth.emailLoginFailed'), code: 0, status: 0 }
      })
      .addCase(loginWithPhone.pending, (state, action) => { state.loginRequestId = action.meta.requestId; state.hydrationRequestId = undefined; state.hydrationError = null; state.logoutRequestId = undefined; state.status = 'loading'; state.error = null })
      .addCase(loginWithPhone.fulfilled, (state, action) => { state.loginRequestId = undefined; state.status = 'authenticated'; state.user = action.payload; state.error = null; state.loginSequence += 1 })
      .addCase(loginWithPhone.rejected, (state, action) => {
        if (state.loginRequestId !== action.meta.requestId) return
        state.loginRequestId = undefined
        state.status = 'unauthenticated'; state.user = null; state.error = action.payload ?? { message: i18n.t('api.auth.phoneLoginFailed'), code: 0, status: 0 }
      })
      .addCase(completeWechatLogin.pending, (state, action) => { state.loginRequestId = action.meta.requestId; state.hydrationRequestId = undefined; state.hydrationError = null; state.logoutRequestId = undefined; state.status = 'loading'; state.error = null })
      .addCase(completeWechatLogin.fulfilled, (state, action) => { state.loginRequestId = undefined; state.status = 'authenticated'; state.user = action.payload; state.error = null; state.loginSequence += 1 })
      .addCase(completeWechatLogin.rejected, (state, action) => {
        if (state.loginRequestId !== action.meta.requestId) return
        state.loginRequestId = undefined
        state.status = 'unauthenticated'; state.user = null; state.error = action.payload ?? { message: i18n.t('api.auth.wechatLoginFailed'), code: 0, status: 0 }
      })
      .addCase(completeBinding.pending, (state, action) => { state.loginRequestId = action.meta.requestId; state.hydrationRequestId = undefined; state.hydrationError = null; state.logoutRequestId = undefined; state.status = 'loading'; state.error = null })
      .addCase(completeBinding.fulfilled, (state, action) => { state.loginRequestId = undefined; state.status = 'authenticated'; state.user = action.payload; state.error = null; state.loginSequence += 1 })
      .addCase(completeBinding.rejected, (state, action) => {
        if (state.loginRequestId !== action.meta.requestId) return
        state.loginRequestId = undefined
        state.status = 'unauthenticated'; state.user = null; state.error = action.payload ?? { message: i18n.t('api.auth.phoneBindingFailed'), code: 0, status: 0 }
      })
      .addCase(logoutAuth.pending, (state, action) => { state.loginRequestId = undefined; state.hydrationRequestId = undefined; state.logoutRequestId = action.meta.requestId })
      .addCase(logoutAuth.fulfilled, (state, action) => {
        if (state.logoutRequestId !== action.meta.requestId) return
        state.logoutRequestId = undefined
        if (!action.payload) return
        state.status = 'unauthenticated'; state.user = null; state.error = null; state.hydrationError = null
      })
      .addCase(logoutAuth.rejected, (state, action) => {
        if (state.logoutRequestId !== action.meta.requestId) return
        state.logoutRequestId = undefined
        state.status = 'unauthenticated'; state.user = null; state.error = action.payload ?? null; state.hydrationError = null
      })
  },
})

export const { clearAuthError, invalidateAuth, synchronizeAuthenticatedUser, updateAuthenticatedUser } = authSlice.actions
export default authSlice.reducer
