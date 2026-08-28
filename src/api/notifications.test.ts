import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import { getNotifications, markAllNotificationsRead, markNotificationRead } from './notifications'

function response(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, msg: 'success', data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

type FetchSpy = { mock: { calls: Array<[string | URL | Request, RequestInit?]> } }

function lastRequest(fetchMock: FetchSpy): { url: string; options: RequestInit | undefined } {
  const [url, options] = fetchMock.mock.calls.at(-1) ?? []
  return { url: String(url), options }
}

describe('站内通知 API 封装', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    clearAuthTokens()
    saveAuthTokens({
      status: 'succeeded',
      binding_required: false,
      access_token: 'notification-test-token',
      refresh_token: 'notification-test-refresh',
      refresh_expires_at: Date.UTC(2099, 1, 1),
    })
  })

  it('按文档查询通知列表并规范化查询参数', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ items: [], unread_count: 0 }))
    await getNotifications({ limit: 120, unread_only: true })
    expect(lastRequest(fetchMock).url).toBe('/api/user/notifications?limit=100&unread_only=1')
  })

  it('使用 PATCH 标记单条通知已读，使用 POST 标记全部已读', async () => {
    // 中文：每次请求都返回新的 Response，避免前一次读取响应体后被二次消费。
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response({ read: true }))
    await markNotificationRead('notice/1')
    expect(lastRequest(fetchMock).url).toBe('/api/user/notifications/notice%2F1/read')
    expect(lastRequest(fetchMock).options?.method).toBe('PATCH')
    await markAllNotificationsRead()
    expect(lastRequest(fetchMock).url).toBe('/api/user/notifications/read-all')
    expect(lastRequest(fetchMock).options?.method).toBe('POST')
  })
})
