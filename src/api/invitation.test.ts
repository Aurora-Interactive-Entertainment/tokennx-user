import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveAuthTokens, clearAuthTokens } from '@/auth/token-storage'
import { getInvitationOverview, recordInvitationVisit } from './invitation'

function response(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, msg: 'success', data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('邀请返现接口', () => {
  beforeEach(() => { vi.restoreAllMocks(); clearAuthTokens() })

  it('读取邀请概览时携带访问令牌', async () => {
    saveAuthTokens({ status: 'succeeded', binding_required: false, access_token: 'invite-token', refresh_token: 'refresh', access_expires_at: Date.UTC(2099, 0, 1), refresh_expires_at: Date.UTC(2099, 1, 1) })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ invite_code: 'code-1', invited_count: 0, visit_count: 0, total_reward_yuan: '0', records: [] }))
    await getInvitationOverview()
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/user/invitation/overview')
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer invite-token')
  })

  it('公开访问接口提交邀请码且不携带令牌', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({}))
    await recordInvitationVisit(' code-1 ')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/invitations/visit')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ invite_code: 'code-1' })
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization')).toBe(false)
  })
})
