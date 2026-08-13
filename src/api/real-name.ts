import { fetchAuthenticatedJson } from './authenticated'
import { isApiError } from './http'
import type { ApiTimeValue } from '@/utils/format'
import i18n from '@/i18n'

const REAL_NAME_PATH = '/api/user/real-name'

export type RealNameStatus = 'unverified' | 'waiting' | 'verified' | 'failed' | 'expired' | string

export interface RealNameProfile {
  id?: string
  id_type?: string
  verification_level?: string
  status: RealNameStatus
  masked_id_number?: string
  verified_at?: ApiTimeValue | null
  certify_url?: string | null
  certify_id?: string | null
  bill_id?: string | null
  expires_at?: ApiTimeValue | null
  failure_code?: number | null
}

export interface SubmitRealNameRequest {
  name: string
  id_type: string
  id_number: string
  consent: boolean
  return_url?: string
}

export interface ConfirmRealNameRequest {
  session_id: string
}

export function getRealNameProfile(accessToken: string): Promise<RealNameProfile> {
  return fetchAuthenticatedJson<RealNameProfile>(REAL_NAME_PATH, { method: 'GET', accessToken })
}

export function submitRealName(accessToken: string, request: SubmitRealNameRequest): Promise<RealNameProfile> {
  return fetchAuthenticatedJson<RealNameProfile>(REAL_NAME_PATH, {
    method: 'POST',
    body: request,
    accessToken,
  })
}

export function confirmRealName(accessToken: string, sessionId: string): Promise<RealNameProfile> {
  return fetchAuthenticatedJson<RealNameProfile>(`${REAL_NAME_PATH}/confirm`, {
    method: 'POST',
    body: { session_id: sessionId.trim() } satisfies ConfirmRealNameRequest,
    accessToken,
  })
}

export function isRealNameConflict(error: unknown): boolean {
  return isApiError(error) && (error.status === 409 || error.code === 100006)
}

export function getRealNameErrorMessage(error: unknown): string {
	if (!isApiError(error)) return i18n.t('api.realName.requestFailed')
	const messageKeys: Record<number, string> = {
		100001: 'api.realName.invalidInput',
		100002: 'api.realName.unavailable',
		100006: 'api.realName.stateChanged',
		110001: 'api.realName.sessionExpired',
		110022: 'api.realName.expired',
		110023: 'api.realName.faceFailed',
		110020: 'api.realName.unavailable',
		110021: 'api.realName.requestFailed',
	}
	return messageKeys[error.code] ? i18n.t(messageKeys[error.code]) : error.message
}
