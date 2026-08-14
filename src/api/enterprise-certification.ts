import { fetchAuthenticatedJson } from './authenticated'
import { isApiError } from './http'
import i18n from '@/i18n'
import type { ApiTimestamp } from '@/utils/format'

const ENTERPRISE_CERTIFICATION_PATH = '/api/user/enterprise/certification'
const ENTERPRISE_CERTIFICATION_MATERIALS_PATH = `${ENTERPRISE_CERTIFICATION_PATH}/materials`
const ENTERPRISE_CERTIFICATION_FACE_PATH = `${ENTERPRISE_CERTIFICATION_PATH}/face`
const ENTERPRISE_CERTIFICATION_FACE_CONFIRM_PATH = `${ENTERPRISE_CERTIFICATION_FACE_PATH}/confirm`

// 中文：所有创建企业入口统一使用新建模式，避免历史认证记录覆盖新的企业申请表单。
export const ENTERPRISE_CREATE_PATH = '/console/enterprise-create'
export const NEW_ENTERPRISE_CREATE_PATH = `${ENTERPRISE_CREATE_PATH}?mode=new`

export const ENTERPRISE_NAME_MAX_LENGTH = 255
export const ENTERPRISE_CREDIT_CODE_LENGTH = 18
export const ENTERPRISE_LEGAL_REPRESENTATIVE_MAX_LENGTH = 128
export const ENTERPRISE_CONTACT_NAME_MAX_LENGTH = 128
export const ENTERPRISE_CONTACT_PHONE_MAX_LENGTH = 32
export const ENTERPRISE_LICENSE_MAX_BYTES = 5 * 1024 * 1024

export type EnterpriseApplicantType = 'legal_representative' | 'authorized_agent'
export type EnterpriseCertificationStatus = 'unsubmitted' | 'submitted' | 'checking' | 'supplement_required' | 'approved' | 'rejected' | 'cancelled'
export type EnterpriseCertificationStage = 'not_started' | 'face_verification_required' | 'face_verification' | 'face_retry_required' | 'manual_review' | 'supplement_required' | 'completed' | 'revoked'

export interface EnterpriseCertification {
  id?: string
  status: EnterpriseCertificationStatus | string
  current_stage: EnterpriseCertificationStage | string
  applicant_type?: EnterpriseApplicantType | string
  verification_method?: 'legal_representative' | 'authorization_letter' | string
  face_url?: string
  enterprise_id?: string
  enterprise_name?: string
  enterprise_code?: string
  enterprise_certification_status?: string
  credit_code_masked?: string
  legal_representative_masked?: string
  contact_name?: string
  contact_phone_masked?: string
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
  legal_representative_id: string
  contact_name: string
  contact_phone: string
  applicant_type: 'legal_representative'
  license_url: string
  consent: true
}

export interface EnterpriseCertificationFormInput {
  enterpriseName: string
  creditCode: string
  legalRepresentative: string
  legalRepresentativeId: string
  contactName: string
  contactPhone: string
  licenseUrl: string
  consent: boolean
}

export interface EnterpriseMaterialRecognition {
  credit_code?: string
  enterprise_name?: string
  legal_representative?: string
  enterprise_type?: string
  address?: string
  registered_capital?: string
  business_scope?: string
  operating_period?: string
  composing_form?: string
  established_date?: string
  registration_date?: string
  registration_authority?: string
  warning_codes?: number[]
  warning_messages?: string[]
  duplication?: number
  angle?: number
  has_national_emblem?: boolean
  has_qr_code?: boolean
  has_seal?: boolean
  title?: string
  serial_number?: string
  electronic?: boolean
  important?: string
}

export interface EnterpriseMaterialUploadResult {
  resource_url: string
  file_name: string
  mime_type: string
  size_bytes: number
  recognition?: EnterpriseMaterialRecognition
}

export type EnterpriseCertificationField = 'enterpriseName' | 'creditCode' | 'legalRepresentative' | 'legalRepresentativeId' | 'contactName' | 'contactPhone' | 'licenseUrl' | 'consent'
export type EnterpriseCertificationValidationErrors = Partial<Record<EnterpriseCertificationField, string>>

export function normalizeEnterpriseCreditCode(value: string): string {
  return value.trim().toUpperCase()
}

export function validateEnterpriseCertificationForm(input: EnterpriseCertificationFormInput): EnterpriseCertificationValidationErrors {
  const errors: EnterpriseCertificationValidationErrors = {}
  const enterpriseName = input.enterpriseName.trim()
  const creditCode = normalizeEnterpriseCreditCode(input.creditCode)
  const legalRepresentative = input.legalRepresentative.trim()
  const legalRepresentativeId = input.legalRepresentativeId.trim()
  const contactName = input.contactName.trim()
  const contactPhone = input.contactPhone.trim()
  if (!enterpriseName) errors.enterpriseName = i18n.t('console.enterpriseCreate.nameRequired')
  else if (Array.from(enterpriseName).length > ENTERPRISE_NAME_MAX_LENGTH) errors.enterpriseName = i18n.t('console.enterpriseCreate.nameTooLong', { count: ENTERPRISE_NAME_MAX_LENGTH })
  if (!creditCode) errors.creditCode = i18n.t('console.enterpriseCreate.creditCodeRequired')
  else if (creditCode.length !== ENTERPRISE_CREDIT_CODE_LENGTH || !/^[0-9A-Z]+$/.test(creditCode)) errors.creditCode = i18n.t('console.enterpriseCreate.creditCodeInvalid')
  if (!legalRepresentative) errors.legalRepresentative = i18n.t('console.enterpriseCreate.legalRepresentativeRequired')
  else if (Array.from(legalRepresentative).length > ENTERPRISE_LEGAL_REPRESENTATIVE_MAX_LENGTH) errors.legalRepresentative = i18n.t('console.enterpriseCreate.legalRepresentativeTooLong', { count: ENTERPRISE_LEGAL_REPRESENTATIVE_MAX_LENGTH })
  if (!legalRepresentativeId) errors.legalRepresentativeId = i18n.t('console.enterpriseCreate.legalRepresentativeIdRequired')
  else if (!/^\d{17}[\dXx]$/.test(legalRepresentativeId)) errors.legalRepresentativeId = i18n.t('console.enterpriseCreate.legalRepresentativeIdInvalid')
  if (!contactName) errors.contactName = i18n.t('console.enterpriseCreate.contactNameRequired')
  else if (Array.from(contactName).length > ENTERPRISE_CONTACT_NAME_MAX_LENGTH) errors.contactName = i18n.t('console.enterpriseCreate.contactNameTooLong', { count: ENTERPRISE_CONTACT_NAME_MAX_LENGTH })
  if (!contactPhone) errors.contactPhone = i18n.t('console.enterpriseCreate.contactPhoneRequired')
  else if (contactPhone.length > ENTERPRISE_CONTACT_PHONE_MAX_LENGTH || (!/^1[3-9]\d{9}$/.test(contactPhone) && !/^0\d{2,3}-?\d{7,8}(?:-\d{1,6})?$/.test(contactPhone))) errors.contactPhone = i18n.t('console.enterpriseCreate.contactPhoneInvalid')
  if (!input.licenseUrl) errors.licenseUrl = i18n.t('console.enterpriseCreate.licenseRequired')
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

export function uploadEnterpriseCertificationMaterial(accessToken: string, file: File): Promise<EnterpriseMaterialUploadResult> {
  const body = new FormData()
  body.append('material_type', 'business_license')
  body.append('file', file)
  return fetchAuthenticatedJson<EnterpriseMaterialUploadResult>(ENTERPRISE_CERTIFICATION_MATERIALS_PATH, {
    method: 'POST',
    body,
    accessToken,
  })
}

export function startEnterpriseFaceVerification(accessToken: string, returnUrl: string): Promise<EnterpriseCertification> {
  return fetchAuthenticatedJson<EnterpriseCertification>(ENTERPRISE_CERTIFICATION_FACE_PATH, {
    method: 'POST',
    body: { return_url: returnUrl },
    accessToken,
  })
}

export function confirmEnterpriseFaceVerification(accessToken: string): Promise<EnterpriseCertification> {
  return fetchAuthenticatedJson<EnterpriseCertification>(ENTERPRISE_CERTIFICATION_FACE_CONFIRM_PATH, {
    method: 'POST',
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
