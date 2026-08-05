import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResult } from '@/api/auth'
import { clearAuthTokens, getAccessToken, readRefreshToken, saveAuthTokens } from './token-storage'
import { refreshAuthSession, withAuthSessionLock } from './refresh-coordinator'

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
    saveAuthTokens(authResult('new-access', 'new-refresh'))
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await expect(refreshAuthSession('old-refresh')).resolves.toMatchObject({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
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
})
