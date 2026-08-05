import { fetchAuthenticatedJson } from './authenticated'
import { isApiError } from './http'
import type { ApiTimeValue } from '@/utils/format'
import i18n from '@/i18n'

const REAL_NAME_PATH = '/api/user/real-name'

export type RealNameStatus = 'unverified' | 'verified' | string

export interface RealNameProfile {
  id?: string
  id_type?: string
  verification_level?: string
  status: RealNameStatus
  masked_id_number?: string
  verified_at?: ApiTimeValue | null
}

export interface SubmitRealNameRequest {
  name: string
  id_type: string
  id_number: string
  consent: boolean
}

export function getRealNameProfile(accessToken: string): Promise<RealNameProfile> {
  return fetchAuthenticatedJson<RealNameProfile>(REAL_NAME_PATH, { accessToken })
}

export function submitRealName(accessToken: string, request: SubmitRealNameRequest): Promise<RealNameProfile> {
  return fetchAuthenticatedJson<RealNameProfile>(REAL_NAME_PATH, {
    method: 'POST',
    body: request,
    accessToken,
  })
}

export function getRealNameErrorMessage(error: unknown): string {
	if (!isApiError(error)) return i18n.t('api.realName.requestFailed')
	const messageKeys: Record<number, string> = {
		100001: 'api.realName.invalidInput',
		100002: 'api.realName.unavailable',
		100006: 'api.realName.stateChanged',
		110001: 'api.realName.sessionExpired',
	}
	return messageKeys[error.code] ? i18n.t(messageKeys[error.code]) : error.message
}
