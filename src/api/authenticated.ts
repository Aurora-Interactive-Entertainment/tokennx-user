import { clearAuthTokens, getAccessToken, readRefreshToken } from '@/auth/token-storage'
import { refreshAuthSession, type AuthenticatedSession } from '@/auth/refresh-coordinator'
import { AUTH_INVALID_CODE, AUTH_UNAUTHORIZED_STATUS, ApiError, fetchJson, fetchResponse, isAuthenticationFailure, type FetchJsonOptions } from './http'
import i18n from '@/i18n'

function refreshAccessToken(refreshToken: string): Promise<AuthenticatedSession> {
  // 中文：刷新协调器同时负责当前标签页合并和跨标签页互斥，避免轮换令牌被重复消费。
  return refreshAuthSession(refreshToken)
}

async function fetchAuthenticated<T>(path: string, options: FetchJsonOptions, request: (accessToken: string) => Promise<T>): Promise<T> {
	const accessToken = options.accessToken ?? getAccessToken()
  if (!accessToken) {
    clearAuthTokens()
		throw new ApiError(i18n.t('api.auth.sessionExpired'), AUTH_UNAUTHORIZED_STATUS, AUTH_INVALID_CODE, null)
	}

	try {
		return await request(accessToken)
	} catch (error) {
	    if (!isAuthenticationFailure(error)) throw error

    // 中文：其他标签页可能已经完成刷新，先重试同步到内存中的新访问令牌，避免再次轮换刷新令牌。
    const synchronizedAccessToken = getAccessToken()
    if (synchronizedAccessToken && synchronizedAccessToken !== accessToken) {
      try {
        return await request(synchronizedAccessToken)
      } catch (synchronizedError) {
        if (!isAuthenticationFailure(synchronizedError)) throw synchronizedError
      }
    }

	    const refreshToken = readRefreshToken()
    if (!refreshToken) {
      clearAuthTokens()
      throw error
    }

    // 中文：认证失败只自动刷新一次，刷新失败或重试仍认证失败才清理会话。
    let refreshed: AuthenticatedSession
    try {
      refreshed = await refreshAccessToken(refreshToken)
    } catch (refreshError) {
      // A transient refresh failure is not proof that the session is expired.
      const refreshExpired = isAuthenticationFailure(refreshError)
      if (refreshExpired) clearAuthTokens({ expectedRefreshToken: refreshToken })
      if (!refreshExpired) throw refreshError
      throw error
	}

	try {
		return await request(refreshed.access_token)
		} catch (retryError) {
			if (isAuthenticationFailure(retryError)) clearAuthTokens({ expectedRefreshToken: refreshed.refresh_token })
			throw retryError
		}
	}
}

export function fetchAuthenticatedJson<T>(path: string, options: FetchJsonOptions = {}): Promise<T> {
	return fetchAuthenticated(path, options, (accessToken) => fetchJson<T>(path, { ...options, accessToken }))
}

// 中文：二进制接口复用同一套令牌刷新和并发刷新控制。
export function fetchAuthenticatedResponse(path: string, options: FetchJsonOptions = {}): Promise<Response> {
	return fetchAuthenticated(path, options, (accessToken) => fetchResponse(path, { ...options, accessToken }))
}
