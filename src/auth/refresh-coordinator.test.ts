import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResult } from '@/api/auth'
import { clearAuthTokens, getAccessToken, readRefreshToken, saveAuthTokens } from './token-storage'
import { refreshAuthSession, withAuthSessionLock } from './refresh-coordinator'
import * as tokenStorage from './token-storage'

function apiResponse(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, msg: 'success', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function authResult(accessToken: string, refreshToken: string): AuthResult {
  return {
    status: 'succeeded',
    binding_required: false,
    access_token: accessToken,
    refresh_token: refreshToken,
    access_expires_at: Date.UTC(2099, 0, 1, 0, 15),
    refresh_expires_at: Date.UTC(2099, 1, 1),
    user: {
      id: 'user-1',
      display_name: '测试用户',
      avatar_url: '',
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      status: 'active',
    },
  }
}

describe('跨标签刷新协调器', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    clearAuthTokens()
  })

  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('刷新响应返回期间会话变化时不覆盖新标签页会话', async () => {
    saveAuthTokens(authResult('old-access', 'old-refresh'))
    let resolveRefresh: ((response: Response) => void) | undefined
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (String(input).endsWith('/api/auth/refresh')) {
        return new Promise<Response>((resolve) => {
          resolveRefresh = resolve
        })
      }
      throw new Error(`unexpected request: ${String(input)}`)
    })

    const pending = refreshAuthSession('old-refresh')
    await Promise.resolve()
    saveAuthTokens(authResult('new-access', 'new-refresh'))
    resolveRefresh?.(apiResponse(authResult('refreshed-access', 'rotated-refresh')))

    await expect(pending).rejects.toThrow('认证会话在刷新期间发生变化')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(getAccessToken()).toBe('new-access')
    expect(readRefreshToken()).toBe('new-refresh')
  })

  it('发现其他标签页已经完成刷新时直接采用新访问令牌', async () => {
    saveAuthTokens(authResult('old-access', 'old-refresh'))
    saveAuthTokens({ ...authResult('new-access', 'new-refresh'), promt_required: true })
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await expect(refreshAuthSession('old-refresh')).resolves.toMatchObject({
      access_token: 'new-access',
      access_expires_at: Date.UTC(2099, 0, 1, 0, 15),
      refresh_token: 'new-refresh',
      promt_required: true,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('同一标签页的认证操作会等待当前降级锁释放', async () => {
    const order: string[] = []
    let releaseFirst: (() => void) | undefined
    const first = withAuthSessionLock(async () => {
      order.push('first-start')
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      order.push('first-end')
    })

    await Promise.resolve()
    const second = withAuthSessionLock(async () => {
      order.push('second')
    })

    await Promise.resolve()
    expect(order).toEqual(['first-start'])

    releaseFirst?.()
    await Promise.all([first, second])
    expect(order).toEqual(['first-start', 'first-end', 'second'])
  })

  it('共享刷新令牌已变化但访问令牌广播尚未到达时，确实等待同步而不重复轮换', async () => {
    vi.useFakeTimers()
    saveAuthTokens(authResult('old-access', 'old-refresh'))
    const original = tokenStorage.getAuthSessionSnapshot()!
    let snapshot: tokenStorage.AuthSessionSnapshot = { ...original, refreshToken: 'synced-refresh', accessToken: null, user: undefined }
    vi.spyOn(tokenStorage, 'getAuthSessionSnapshot').mockImplementation(() => snapshot)
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const pending = refreshAuthSession('old-refresh')
    await vi.advanceTimersByTimeAsync(500)
    expect(fetchMock).not.toHaveBeenCalled()

    snapshot = { ...snapshot, accessToken: 'synced-access', user: original.user }
    await vi.advanceTimersByTimeAsync(25)
    await expect(pending).resolves.toMatchObject({ access_token: 'synced-access', refresh_token: 'synced-refresh' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('等待访问令牌广播超时后仅用最新刷新令牌恢复一次', async () => {
    vi.useFakeTimers()
    saveAuthTokens(authResult('old-access', 'old-refresh'))
    const original = tokenStorage.getAuthSessionSnapshot()!
    const snapshot: tokenStorage.AuthSessionSnapshot = { ...original, refreshToken: 'synced-refresh', accessToken: null, user: undefined }
    vi.spyOn(tokenStorage, 'getAuthSessionSnapshot').mockReturnValue(snapshot)
    const saveMock = vi.spyOn(tokenStorage, 'saveAuthTokens').mockReturnValue(true)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse(authResult('latest-access', 'latest-refresh')))
    const pending = refreshAuthSession('old-refresh')
    await vi.advanceTimersByTimeAsync(1_999)
    expect(fetchMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toMatchObject({ access_token: 'latest-access', refresh_token: 'latest-refresh' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ refresh_token: 'synced-refresh' })
    expect(saveMock).toHaveBeenCalledWith(expect.anything(), { expectedRefreshToken: 'synced-refresh', expectedRevision: snapshot.revision })
  })
})
