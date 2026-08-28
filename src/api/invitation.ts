import { fetchAuthenticatedJson } from "./authenticated";
import { fetchJson } from "./http";

export interface InvitationRecord {
  id: string;
  display_name: string;
  status: string;
  joined_at: number;
  reward_yuan?: string;
  source?: string;
}

export interface InvitationTrendPoint {
  date: string | number;
  effective_invites?: number;
  valid_invites?: number;
  invited_count?: number;
  visits?: number;
  visit_count?: number;
  reward_yuan?: number | string;
  reward_amount_yuan?: number | string;
  earnings_yuan?: number | string;
  reward_amount?: number | string;
}

export interface InvitationOverview {
  invite_code: string;
  invited_count: number;
  visit_count: number;
  total_reward_yuan: string;
  records: InvitationRecord[];
  wallet_balance_yuan?: string;
  month_invited_count?: number;
  month_reward_yuan?: string;
  today_invited_count?: number;
  today_reward_yuan?: string;
  trend?: InvitationTrendPoint[];
  trend_points?: InvitationTrendPoint[];
  daily_trend?: InvitationTrendPoint[];
}

export function getInvitationOverview(
  options: { accessToken?: string; signal?: AbortSignal } = {},
): Promise<InvitationOverview> {
  return fetchAuthenticatedJson<InvitationOverview>(
    "/api/user/invitation/overview",
    options,
  );
}

export function recordInvitationVisit(
  inviteCode: string,
): Promise<Record<string, never>> {
  return fetchJson<Record<string, never>>("/api/invitations/visit", {
    method: "POST",
    body: { invite_code: inviteCode.trim() },
  });
}
