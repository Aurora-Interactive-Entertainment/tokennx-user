import { clearAuthTokens, getAccessToken, getAccessTokenUserId, getAuthSessionSnapshot, readRefreshToken } from '@/auth/token-storage'
import { refreshAuthSession, type AuthenticatedSession } from '@/auth/refresh-coordinator'
import { AUTH_INVALID_CODE, AUTH_UNAUTHORIZED_STATUS, ApiError, fetchJson, fetchResponse, isHttpUnauthorized, preserveAuthSession, type FetchJsonOptions } from './http'
import i18n from '@/i18n'

function throwIfAborted(signal?: AbortSignal | null): void {
  if (!signal?.aborted) return
  throw signal.reason ?? new DOMException('请求已取消', 'AbortError')
}

// Runtime 只把尚未成功接收响应的 HTTP 阶段放入此函数，不能重放已开始生成的正文流。
export async function withAuthenticatedSession<T>(options: Pick<FetchJsonOptions, 'accessToken' | 'signal'>, request: (accessToken: string) => Promise<T>): Promise<T> {
  throwIfAborted(options.signal)
  const initialSession = getAuthSessionSnapshot()
  let accessToken = options.accessToken ?? getAccessToken()
  const requestUserId = getAccessTokenUserId(accessToken)
  // 刷新响应可以省略 user；只信任当前会话持有的令牌，未知来源的旧显式令牌不能借此换号重试。
  const requestSessionId = initialSession && (!accessToken || accessToken === initialSession.accessToken || (requestUserId && requestUserId === initialSession.user?.id))
    ? initialSession.sessionId
    : undefined
  const assertSameAccount = (): void => {
    const current = getAuthSessionSnapshot()
    const matches = requestSessionId
      ? current?.sessionId === requestSessionId && (!requestUserId || !current.user || current.user.id === requestUserId)
      : Boolean(requestUserId && getAccessTokenUserId() === requestUserId)
    if (!matches) throw new DOMException(i18n.t('api.auth.sessionConflict'), 'AbortError')
  }

  const restoreSession = async (refreshToken: string): Promise<AuthenticatedSession> => {
    try {
      // 协调器合并同标签请求并锁住跨标签轮换，不能由页面各自刷新。
      const restored = await refreshAuthSession(refreshToken)
      throwIfAborted(options.signal)
      assertSameAccount()
      return restored
    } catch (error) {
      throwIfAborted(options.signal)
      assertSameAccount()
      if (isHttpUnauthorized(error)) {
        // 只有刷新端明确拒绝，才允许删除它对应的长期会话；网络和服务故障保留重试入口。
        clearAuthTokens({ expectedRefreshToken: refreshToken })
        // 等待期间其他标签页可能已换成更新的令牌，旧失败不能再让业务页面退出新会话。
        if (readRefreshToken()) preserveAuthSession(error)
      }
      throw error
    }
  }

  let restoredBeforeRequest = false
  if (!accessToken) {
    const refreshToken = readRefreshToken()
    if (!refreshToken) throw new ApiError(i18n.t('api.auth.sessionExpired'), AUTH_UNAUTHORIZED_STATUS, AUTH_INVALID_CODE, null)
    accessToken = (await restoreSession(refreshToken)).access_token
    restoredBeforeRequest = true
  }

  try {
    return await request(accessToken)
  } catch (error) {
    if (!isHttpUnauthorized(error)) throw error
    throwIfAborted(options.signal)
    assertSameAccount()
    // 刚恢复的访问令牌仍被某个接口拒绝，属于该请求失败，不能继续轮换或清除有效刷新令牌。
    if (restoredBeforeRequest) {
      preserveAuthSession(error)
      throw error
    }

    const synchronizedAccessToken = getAccessToken()
    if (synchronizedAccessToken && synchronizedAccessToken !== accessToken) {
      try {
        throwIfAborted(options.signal)
        return await request(synchronizedAccessToken)
      } catch (synchronizedError) {
        if (!isHttpUnauthorized(synchronizedError)) throw synchronizedError
        assertSameAccount()
      }
    }

    const refreshToken = readRefreshToken()
    if (!refreshToken) throw error
    throwIfAborted(options.signal)
    const refreshed = await restoreSession(refreshToken)
    try {
      throwIfAborted(options.signal)
      assertSameAccount()
      return await request(refreshed.access_token)
    } catch (retryError) {
      assertSameAccount()
      if (isHttpUnauthorized(retryError)) preserveAuthSession(retryError)
      throw retryError
    }
  }
}

export function fetchAuthenticatedJson<T>(path: string, options: FetchJsonOptions = {}): Promise<T> {
  return withAuthenticatedSession(options, (accessToken) => fetchJson<T>(path, { ...options, accessToken }))
}

// 二进制接口复用同一套令牌刷新和并发刷新控制。
export function fetchAuthenticatedResponse(path: string, options: FetchJsonOptions = {}): Promise<Response> {
  return withAuthenticatedSession(options, (accessToken) => fetchResponse(path, { ...options, accessToken }))
}
