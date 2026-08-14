import { fetchAuthenticatedJson } from './authenticated'
import { isApiError } from './http'
import i18n from '@/i18n'
import type { ApiTimestamp } from '@/utils/format'

const ENTERPRISE_CERTIFICATION_PATH = '/api/user/enterprise/certification'

// 中文：所有创建企业入口统一使用新建模式，避免历史认证记录覆盖新的企业申请表单。
export const ENTERPRISE_CREATE_PATH = '/console/enterprise-create'
export const NEW_ENTERPRISE_CREATE_PATH = `${ENTERPRISE_CREATE_PATH}?mode=new`

export const ENTERPRISE_NAME_MAX_LENGTH = 255
export const ENTERPRISE_CREDIT_CODE_LENGTH = 18
export const ENTERPRISE_LEGAL_REPRESENTATIVE_MAX_LENGTH = 128

export type EnterpriseApplicantType = 'legal_representative' | 'authorized_agent'

export interface EnterpriseCertification {
  id?: string
  status: 'unsubmitted' | 'approved' | string
  current_stage: string
  applicant_type?: EnterpriseApplicantType | string
  enterprise_id?: string
  enterprise_name?: string
  enterprise_code?: string
  enterprise_certification_status?: string
  credit_code_masked?: string
  legal_representative_masked?: string
  submitted_at?: ApiTimestamp | null
  completed_at?: ApiTimestamp | null
  created_at?: ApiTimestamp
  updated_at?: ApiTimestamp
  version?: number | string
}

export interface SubmitEnterpriseCertificationRequest {
  enterprise_name: string
  credit_code: string
  legal_representative: string
  applicant_type: EnterpriseApplicantType
  consent: boolean
}

export interface EnterpriseCertificationFormInput {
  enterpriseName: string
  creditCode: string
  legalRepresentative: string
  applicantType: EnterpriseApplicantType
  consent: boolean
}

export type EnterpriseCertificationField = 'enterpriseName' | 'creditCode' | 'legalRepresentative' | 'applicantType' | 'consent'
export type EnterpriseCertificationValidationErrors = Partial<Record<EnterpriseCertificationField, string>>

export function normalizeEnterpriseCreditCode(value: string): string {
  return value.trim().toUpperCase()
}

export function validateEnterpriseCertificationForm(input: EnterpriseCertificationFormInput): EnterpriseCertificationValidationErrors {
  const errors: EnterpriseCertificationValidationErrors = {}
  const enterpriseName = input.enterpriseName.trim()
  const creditCode = normalizeEnterpriseCreditCode(input.creditCode)
  const legalRepresentative = input.legalRepresentative.trim()
  if (!enterpriseName) errors.enterpriseName = i18n.t('console.enterpriseCreate.nameRequired')
  else if (Array.from(enterpriseName).length > ENTERPRISE_NAME_MAX_LENGTH) errors.enterpriseName = i18n.t('console.enterpriseCreate.nameTooLong', { count: ENTERPRISE_NAME_MAX_LENGTH })
  if (!creditCode) errors.creditCode = i18n.t('console.enterpriseCreate.creditCodeRequired')
  else if (creditCode.length !== ENTERPRISE_CREDIT_CODE_LENGTH || !/^[0-9A-Z]+$/.test(creditCode)) errors.creditCode = i18n.t('console.enterpriseCreate.creditCodeInvalid')
  if (!legalRepresentative) errors.legalRepresentative = i18n.t('console.enterpriseCreate.legalRepresentativeRequired')
  else if (Array.from(legalRepresentative).length > ENTERPRISE_LEGAL_REPRESENTATIVE_MAX_LENGTH) errors.legalRepresentative = i18n.t('console.enterpriseCreate.legalRepresentativeTooLong', { count: ENTERPRISE_LEGAL_REPRESENTATIVE_MAX_LENGTH })
  if (input.applicantType !== 'legal_representative' && input.applicantType !== 'authorized_agent') errors.applicantType = i18n.t('console.enterpriseCreate.applicantTypeRequired')
  if (!input.consent) errors.consent = i18n.t('console.enterpriseCreate.consentRequired')
  return errors
}

export function getEnterpriseCertification(accessToken: string): Promise<EnterpriseCertification> {
  return fetchAuthenticatedJson<EnterpriseCertification>(ENTERPRISE_CERTIFICATION_PATH, { accessToken })
}

export function submitEnterpriseCertification(accessToken: string, input: SubmitEnterpriseCertificationRequest): Promise<EnterpriseCertification> {
  return fetchAuthenticatedJson<EnterpriseCertification>(ENTERPRISE_CERTIFICATION_PATH, {
    method: 'POST',
    body: input,
    accessToken,
  })
}

export function getEnterpriseCertificationErrorMessage(error: unknown): string {
  if (!isApiError(error)) return i18n.t('console.enterpriseCreate.requestFailed')
  const messages: Record<number, string> = {
    100001: i18n.t('console.enterpriseCreate.invalidInput'),
    100002: i18n.t('console.enterpriseCreate.serviceUnavailable'),
    100004: i18n.t('console.enterpriseCreate.recordMissing'),
    100006: i18n.t('console.enterpriseCreate.stateChanged'),
    110001: i18n.t('console.enterpriseCreate.loginExpired'),
  }
  return messages[error.code] ?? error.message
}
