import { fetchAuthenticatedJson } from './authenticated'
import { fetchJson } from './http'

export interface InvitationRecord {
  id: string
  display_name: string
  status: string
  joined_at: number
}

export interface InvitationOverview {
  invite_code: string
  invited_count: number
  visit_count: number
  total_reward_yuan: string
  records: InvitationRecord[]
}

export function getInvitationOverview(options: { accessToken?: string; signal?: AbortSignal } = {}): Promise<InvitationOverview> {
  return fetchAuthenticatedJson<InvitationOverview>('/api/user/invitation/overview', options)
}

export function recordInvitationVisit(inviteCode: string): Promise<Record<string, never>> {
  return fetchJson<Record<string, never>>('/api/invitations/visit', {
    method: 'POST',
    body: { invite_code: inviteCode.trim() },
  })
}
