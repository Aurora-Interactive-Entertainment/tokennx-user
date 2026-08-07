import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { getCurrentUser, loginByEmail, loginByPhone, logout, requestWechatQr as requestWechatQrRequest, sendBindingPhoneCode, sendEmailCode, sendPhoneCode, bindWechatPhone, type AuthResult, type AuthUser, type DeviceInfo, type EmailCodeResult, type PhoneCodeResult, type WechatQrResult, type WechatStatusResult, getWechatStatus } from '@/api/auth'
import { AUTH_INVALID_CODE, isApiError } from '@/api/http'
import { clearAuthTokens, getAccessToken, getDeviceId, getDeviceName, readRefreshToken, saveAuthTokens } from '@/auth/token-storage'
import { refreshAuthSession, withAuthSessionLock } from '@/auth/refresh-coordinator'

export interface AuthOperationError {
  message: string
  code: number
  status: number
}

export interface AuthState {
  status: 'unknown' | 'loading' | 'unauthenticated' | 'authenticated'
  user: AuthUser | null
  error: AuthOperationError | null
}

const initialState: AuthState = {
  status: 'unknown',
  user: null,
  error: null,
}

type ThunkConfig = { rejectValue: AuthOperationError }

function deviceInfo(): DeviceInfo {
  return { device_id: getDeviceId(), device_name: getDeviceName() }
}

export function authError(error: unknown): AuthOperationError {
  if (!isApiError(error)) return { message: '认证请求失败，请稍后重试', code: 0, status: 0 }
  const messages: Record<number, string> = {
    100001: '请求参数无效，请检查输入内容',
    100004: '登录状态已过期，请重新登录',
    100006: '认证状态发生冲突，请重新操作',
    100007: '认证服务暂时不可用，请稍后重试',
    [AUTH_INVALID_CODE]: '邮箱、手机号或验证码错误，请重新确认',
    110002: '该微信账号需要先绑定手机号',
    110003: '手机号已绑定其他账号，暂时无法继续',
    110004: '验证码发送过于频繁，请稍后再试',
  }
  return { message: messages[error.code] ?? error.message, code: error.code, status: error.status }
}

function completeAuth(result: AuthResult): AuthUser {
  if (result.status !== 'succeeded' || result.binding_required || !result.user) throw new Error('认证尚未完成')
  saveAuthTokens(result)
  return result.user
}

export const hydrateAuth = createAsyncThunk<AuthUser | null>('auth/hydrate', async () => {
  const refreshToken = readRefreshToken()
  if (!refreshToken) return null
  try {
    const result = await refreshAuthSession(refreshToken)
    if (result.status !== 'succeeded' || result.binding_required || !result.user) throw new Error('认证尚未完成')
    const user = result.user
    const access = getAccessToken()
    return access ? await getCurrentUser(access) : user
  } catch {
    clearAuthTokens({ expectedRefreshToken: refreshToken })
    return null
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

export const loginWithEmail = createAsyncThunk<AuthUser, { destination: string; code: string }, ThunkConfig>('auth/loginWithEmail', async ({ destination, code }, { rejectWithValue }) => {
  try {
    return completeAuth(await loginByEmail(destination, code, deviceInfo()))
  } catch (error) {
    return rejectWithValue(authError(error))
  }
})

export const loginWithPhone = createAsyncThunk<AuthUser, { destination: string; code: string }, ThunkConfig>('auth/loginWithPhone', async ({ destination, code }, { rejectWithValue }) => {
  try {
    return completeAuth(await loginByPhone(destination, code))
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

export const requestWechatQr = createAsyncThunk<WechatQrResult, void, ThunkConfig>('auth/requestWechatQr', async (_, { rejectWithValue }) => {
  try {
    return await requestWechatQrApi()
  } catch (error) {
    return rejectWithValue(authError(error))
  }
})

export const pollWechatStatus = createAsyncThunk<WechatStatusResult, { state: string }, ThunkConfig>('auth/pollWechatStatus', async ({ state }, { rejectWithValue }) => {
  try {
    return await getWechatStatus(state)
  } catch (error) {
    return rejectWithValue(authError(error))
  }
})

export const requestBindingCode = createAsyncThunk<PhoneCodeResult, { bindingTicket: string; phone: string }, ThunkConfig>('auth/requestBindingCode', async ({ bindingTicket, phone }, { rejectWithValue }) => {
  try {
    return await sendBindingPhoneCode(bindingTicket, phone)
  } catch (error) {
    return rejectWithValue(authError(error))
  }
})

export const completeBinding = createAsyncThunk<AuthUser, { bindingTicket: string; phone: string; code: string }, ThunkConfig>('auth/completeBinding', async ({ bindingTicket, phone, code }, { rejectWithValue }) => {
  try {
    return completeAuth(await bindWechatPhone(bindingTicket, phone, code, deviceInfo()))
  } catch (error) {
    return rejectWithValue(authError(error))
  }
})

export const logoutAuth = createAsyncThunk<void, void, ThunkConfig>('auth/logout', async (_, { rejectWithValue }) => {
  try {
    await withAuthSessionLock(async () => {
      const accessToken = getAccessToken()
      if (accessToken) await logout(accessToken)
      clearAuthTokens({ force: true })
    })
  } catch (error) {
    clearAuthTokens({ force: true })
    return rejectWithValue(authError(error))
  }
})

async function requestWechatQrApi(): Promise<WechatQrResult> {
  return requestWechatQrRequest()
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearAuthError(state) {
      state.error = null
    },
    // 中文：令牌验证失败时清除前端认证状态，由调用方回到公开首页。
    invalidateAuth(state) {
      state.status = 'unauthenticated'
      state.user = null
      state.error = null
    },
    // 中文：其他标签页完成登录或刷新后，及时同步当前页面的用户状态。
    synchronizeAuthenticatedUser(state, action: PayloadAction<AuthUser>) {
      state.status = 'authenticated'
      state.user = action.payload
      state.error = null
    },
    // 中文：个人中心保存资料后立即同步 Header，避免刷新前继续展示旧账号信息。
    updateAuthenticatedUser(state, action: PayloadAction<AuthUser>) {
      if (state.status === 'authenticated') state.user = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(hydrateAuth.pending, (state) => { state.status = 'loading'; state.error = null })
      .addCase(hydrateAuth.fulfilled, (state, action) => { state.status = action.payload ? 'authenticated' : 'unauthenticated'; state.user = action.payload; state.error = null })
      .addCase(loginWithEmail.pending, (state) => { state.status = 'loading'; state.error = null })
      .addCase(loginWithEmail.fulfilled, (state, action) => { state.status = 'authenticated'; state.user = action.payload; state.error = null })
      .addCase(loginWithEmail.rejected, (state, action) => { state.status = 'unauthenticated'; state.user = null; state.error = action.payload ?? { message: '邮箱登录失败', code: 0, status: 0 } })
      .addCase(loginWithPhone.pending, (state) => { state.status = 'loading'; state.error = null })
      .addCase(loginWithPhone.fulfilled, (state, action) => { state.status = 'authenticated'; state.user = action.payload; state.error = null })
      .addCase(loginWithPhone.rejected, (state, action) => { state.status = 'unauthenticated'; state.user = null; state.error = action.payload ?? { message: '手机号登录失败', code: 0, status: 0 } })
      .addCase(completeWechatLogin.pending, (state) => { state.status = 'loading'; state.error = null })
      .addCase(completeWechatLogin.fulfilled, (state, action) => { state.status = 'authenticated'; state.user = action.payload; state.error = null })
      .addCase(completeWechatLogin.rejected, (state, action) => { state.status = 'unauthenticated'; state.user = null; state.error = action.payload ?? { message: '微信登录失败', code: 0, status: 0 } })
      .addCase(completeBinding.pending, (state) => { state.status = 'loading'; state.error = null })
      .addCase(completeBinding.fulfilled, (state, action) => { state.status = 'authenticated'; state.user = action.payload; state.error = null })
      .addCase(completeBinding.rejected, (state, action) => { state.status = 'unauthenticated'; state.user = null; state.error = action.payload ?? { message: '手机号绑定失败', code: 0, status: 0 } })
      .addCase(logoutAuth.fulfilled, (state) => { state.status = 'unauthenticated'; state.user = null; state.error = null })
      .addCase(logoutAuth.rejected, (state, action) => { state.status = 'unauthenticated'; state.user = null; state.error = action.payload ?? null })
  },
})

export const { clearAuthError, invalidateAuth, synchronizeAuthenticatedUser, updateAuthenticatedUser } = authSlice.actions
export default authSlice.reducer
