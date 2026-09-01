import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Modal from '@/components/app-modal'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { IconAlertTriangle, IconArrowRight, IconCheckCircleStroked, IconDeleteStroked, IconFile, IconRefresh, IconUserGroup, IconUserStroked } from '@douyinfe/semi-icons'
import QRCode from 'qrcode'
import { BannerNotice, PageTitle, workspacesFromMemberships } from '@/components/common'
import { CompatInput as Input } from '@/components/semi-compat'
import { getAccessToken } from '@/auth/token-storage'
import {
  ENTERPRISE_CONTACT_NAME_MAX_LENGTH,
  ENTERPRISE_CONTACT_PHONE_MAX_LENGTH,
  ENTERPRISE_CREDIT_CODE_LENGTH,
  ENTERPRISE_LEGAL_REPRESENTATIVE_MAX_LENGTH,
  ENTERPRISE_LICENSE_MAX_BYTES,
  ENTERPRISE_NAME_MAX_LENGTH,
  confirmEnterpriseFaceVerification,
  getEnterpriseCertification,
  getEnterpriseCertificationErrorMessage,
  normalizeEnterpriseCreditCode,
  startEnterpriseFaceVerification,
  submitEnterpriseCertification,
  uploadEnterpriseCertificationMaterial,
  validateEnterpriseCertificationForm,
  type EnterpriseCertification,
  type EnterpriseCertificationField,
  type EnterpriseCertificationValidationErrors,
  type EnterpriseMaterialUploadResult,
} from '@/api/enterprise-certification'
import { getProfileEnterprises } from '@/api/profile'
import { isApiError, isAuthenticationFailure } from '@/api/http'
import { useAppStore } from '@/data/app-state'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'
import './enterprise-create.css'

type EnterpriseStep = 1 | 2 | 3 | 4
const FACE_CONFIRM_POLL_INTERVAL_MS = 3_000

interface CertificationFormState {
  enterpriseName: string
  creditCode: string
  legalRepresentative: string
  legalRepresentativeId: string
  contactName: string
  contactPhone: string
}

interface FaceConfirmationNotice {
  title: string
  message: string
}

const EMPTY_FORM: CertificationFormState = {
  enterpriseName: '',
  creditCode: '',
  legalRepresentative: '',
  legalRepresentativeId: '',
  contactName: '',
  contactPhone: '',
}

function isMobileDevice(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(max-width: 700px)').matches)
}

function stepFromCertification(certification: EnterpriseCertification | null, applicantSelected: boolean): EnterpriseStep {
  if (!certification || certification.current_stage === 'not_started') return applicantSelected ? 2 : 1
  if (certification.current_stage === 'face_verification_required' || certification.current_stage === 'face_verification' || certification.current_stage === 'face_retry_required') return 3
  return 4
}

function EnterpriseStepper({ step }: { step: EnterpriseStep }) {
  const { t } = useTranslation()
  const labels = [t('console.enterpriseCreate.stepIdentity'), t('console.enterpriseCreate.stepLicense'), t('console.enterpriseCreate.stepFace'), t('console.enterpriseCreate.stepResult')]
  return <ol className="enterprise-certification-stepper" aria-label={t('console.enterpriseCreate.stepsLabel')}>
    {labels.map((label, index) => {
      const number = index + 1
      const className = number < step ? 'is-done' : number === step ? 'is-current' : ''
      return <li className={className} aria-current={number === step ? 'step' : undefined} key={label}><span>{number < step ? <IconCheckCircleStroked aria-hidden="true" /> : number}</span><strong>{label}</strong></li>
    })}
  </ol>
}

function IdentityStep({ onSelect }: { onSelect: () => void }) {
  const { t } = useTranslation()
  return <section className="enterprise-certification-panel enterprise-identity-panel" aria-labelledby="enterpriseIdentityTitle">
    <div className="enterprise-panel-heading"><h2 id="enterpriseIdentityTitle">{t('console.enterpriseCreate.identityTitle')}</h2><p>{t('console.enterpriseCreate.identityHint')}</p></div>
    <div className="enterprise-identity-options">
      <button className="enterprise-identity-option" type="button" onClick={onSelect}>
        <span className="enterprise-identity-icon"><IconUserStroked aria-hidden="true" /></span>
        <span><strong>{t('console.enterpriseCreate.legalRepresentativeApplicant')}</strong><small>{t('console.enterpriseCreate.legalRepresentativeOptionHint')}</small></span>
        <IconArrowRight aria-hidden="true" />
      </button>
      <button className="enterprise-identity-option" type="button" disabled>
        <span className="enterprise-identity-icon"><IconUserGroup aria-hidden="true" /></span>
        <span><strong>{t('console.enterpriseCreate.authorizedAgent')}</strong><small>{t('console.enterpriseCreate.authorizedAgentOptionHint')}</small></span>
        <span className="enterprise-disabled-label">{t('console.enterpriseCreate.unavailable')}</span>
      </button>
    </div>
    <p className="enterprise-panel-note">{t('console.enterpriseCreate.identityNote')}</p>
  </section>
}

interface LicenseStepProps {
  file: File | null
  previewUrl: string
  material: EnterpriseMaterialUploadResult | null
  form: CertificationFormState
  errors: EnterpriseCertificationValidationErrors
  uploadError: string
  uploading: boolean
  submitting: boolean
  onBack: () => void
  onChooseFile: (event: ChangeEvent<HTMLInputElement>) => void
  onRemoveFile: () => void
  onChange: (field: keyof CertificationFormState, value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  consent: boolean
  onConsentChange: (checked: boolean) => void
}

function LicenseStep(props: LicenseStepProps) {
  const { t } = useTranslation()
  const fileInput = useRef<HTMLInputElement>(null)
  const showForm = Boolean(props.material)
  return <section className="enterprise-certification-panel" aria-labelledby="enterpriseLicenseTitle">
    <div className="enterprise-panel-heading"><h2 id="enterpriseLicenseTitle">{t('console.enterpriseCreate.licenseTitle')}</h2><p>{t('console.enterpriseCreate.licenseHint')}</p></div>
    <input ref={fileInput} className="enterprise-file-input" type="file" accept="image/png,image/jpeg" aria-label={t('console.enterpriseCreate.chooseFile')} onChange={props.onChooseFile} />
    <div className={`enterprise-license-dropzone${props.uploading ? ' is-uploading' : ''}`}>
      <IconFile aria-hidden="true" />
      <strong>{props.uploading ? t('console.enterpriseCreate.uploading') : t('console.enterpriseCreate.addLicense')}</strong>
      <span>{t('console.enterpriseCreate.licenseRules')}</span>
      <Button theme="outline" loading={props.uploading} disabled={props.uploading} onClick={() => fileInput.current?.click()}>{props.file ? t('console.enterpriseCreate.replaceFile') : t('console.enterpriseCreate.chooseFile')}</Button>
    </div>
    {props.uploadError ? <span className="field-error enterprise-upload-error" role="alert">{props.uploadError}</span> : null}
    {props.file ? <div className="enterprise-license-file">
      <span className="enterprise-license-preview">{props.previewUrl ? <img src={props.previewUrl} alt={t('console.enterpriseCreate.licensePreview')} /> : <IconFile aria-hidden="true" />}</span>
      <span className="enterprise-license-file-copy"><strong>{props.file.name}</strong><small>{t('console.enterpriseCreate.fileMeta', { type: props.file.type || t('console.enterpriseCreate.unknownFileType'), size: (props.file.size / 1024).toFixed(1) })}</small></span>
      <Button theme="outline" size="small" disabled={props.uploading} onClick={() => fileInput.current?.click()}>{t('console.enterpriseCreate.replaceFile')}</Button>
      <Button theme="outline" size="small" type="danger" icon={<IconDeleteStroked />} disabled={props.uploading} aria-label={t('console.enterpriseCreate.removeFile')} title={t('console.enterpriseCreate.removeFile')} onClick={props.onRemoveFile} />
    </div> : null}
    {props.uploading && props.file ? <EnterpriseRecognitionLoading /> : showForm ? <form className="enterprise-certification-form" onSubmit={props.onSubmit} noValidate>
      <div className="enterprise-form-grid">
        <EnterpriseField id="enterprise-name" label={t('console.enterpriseCreate.enterpriseName')} value={props.form.enterpriseName} error={props.errors.enterpriseName} maxLength={ENTERPRISE_NAME_MAX_LENGTH} placeholder={t('console.enterpriseCreate.namePlaceholder')} onChange={(value) => props.onChange('enterpriseName', value)} />
        <EnterpriseField id="enterprise-credit-code" label={t('console.enterpriseCreate.creditCode')} value={props.form.creditCode} error={props.errors.creditCode} maxLength={ENTERPRISE_CREDIT_CODE_LENGTH} placeholder={t('console.enterpriseCreate.creditCodePlaceholder')} onChange={(value) => props.onChange('creditCode', normalizeEnterpriseCreditCode(value))} />
        <EnterpriseField id="enterprise-legal-representative" label={t('console.enterpriseCreate.legalRepresentative')} value={props.form.legalRepresentative} error={props.errors.legalRepresentative} maxLength={ENTERPRISE_LEGAL_REPRESENTATIVE_MAX_LENGTH} placeholder={t('console.enterpriseCreate.legalRepresentativePlaceholder')} onChange={(value) => props.onChange('legalRepresentative', value)} />
        <EnterpriseField id="enterprise-legal-representative-id" label={t('console.enterpriseCreate.legalRepresentativeId')} value={props.form.legalRepresentativeId} error={props.errors.legalRepresentativeId} maxLength={18} placeholder={t('console.enterpriseCreate.legalRepresentativeIdPlaceholder')} hint={t('console.enterpriseCreate.legalRepresentativeIdHint')} onChange={(value) => props.onChange('legalRepresentativeId', value.toUpperCase())} />
        <EnterpriseField id="enterprise-contact-name" label={t('console.enterpriseCreate.contactName')} value={props.form.contactName} error={props.errors.contactName} maxLength={ENTERPRISE_CONTACT_NAME_MAX_LENGTH} placeholder={t('console.enterpriseCreate.contactNamePlaceholder')} onChange={(value) => props.onChange('contactName', value)} />
        <EnterpriseField id="enterprise-contact-phone" label={t('console.enterpriseCreate.contactPhone')} value={props.form.contactPhone} error={props.errors.contactPhone} maxLength={ENTERPRISE_CONTACT_PHONE_MAX_LENGTH} placeholder={t('console.enterpriseCreate.contactPhonePlaceholder')} onChange={(value) => props.onChange('contactPhone', value)} />
      </div>
      <label className="enterprise-certification-consent" htmlFor="enterprise-certification-consent"><input id="enterprise-certification-consent" type="checkbox" checked={props.consent} onChange={(event) => props.onConsentChange(event.target.checked)} /><span>{t('console.enterpriseCreate.consent')}</span></label>
      {props.errors.consent ? <span className="field-error" role="alert">{props.errors.consent}</span> : null}
      <div className="enterprise-certification-actions"><Button theme="outline" type="tertiary" onClick={props.onBack}>{t('console.enterpriseCreate.back')}</Button><Button htmlType="submit" theme="solid" type="primary" loading={props.submitting} disabled={props.submitting}>{t('console.enterpriseCreate.confirmContinue')}</Button></div>
    </form> : <div className="enterprise-certification-actions"><Button theme="outline" type="tertiary" onClick={props.onBack}>{t('console.enterpriseCreate.back')}</Button></div>}
  </section>
}

function EnterpriseRecognitionLoading() {
  const { t } = useTranslation()
  return <div className="enterprise-recognition-loading" role="status" aria-live="polite">
    <div className="enterprise-recognition-loading-head"><span className="console-loading-spinner" aria-hidden="true" /><div><strong>{t('console.enterpriseCreate.recognitionLoading')}</strong><span>{t('console.enterpriseCreate.recognitionLoadingHint')}</span></div></div>
    <div className="enterprise-recognition-skeleton-grid" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <div className="enterprise-recognition-skeleton-field" key={index}><i /><b /></div>)}</div>
    <div className="enterprise-recognition-skeleton-consent" aria-hidden="true"><i /><span /></div>
    <div className="enterprise-recognition-skeleton-actions" aria-hidden="true"><i /><i /></div>
  </div>
}

interface EnterpriseFieldProps {
  id: string
  label: string
  value: string
  error?: string
  hint?: string
  maxLength: number
  placeholder: string
  onChange: (value: string) => void
}

function EnterpriseField({ id, label, value, error, hint, maxLength, placeholder, onChange }: EnterpriseFieldProps) {
  return <label className="enterprise-certification-field" htmlFor={id}><span>{label} *</span><Input id={id} value={value} maxLength={maxLength} placeholder={placeholder} validateStatus={error ? 'error' : 'default'} aria-invalid={Boolean(error)} onChange={onChange} />{hint ? <small>{hint}</small> : null}{error ? <span className="field-error" role="alert">{error}</span> : null}</label>
}

interface FaceStepProps {
  certification: EnterpriseCertification
  consent: boolean
  consentError: string
  loading: boolean
  onConsentChange: (checked: boolean) => void
  onStart: () => void
}

function FaceStep({ certification, consent, consentError, loading, onConsentChange, onStart }: FaceStepProps) {
  const { t } = useTranslation()
  const noData = t('console.enterpriseCreate.noData')
  return <section className="enterprise-certification-panel" aria-labelledby="enterpriseFaceTitle">
    <div className="enterprise-panel-heading"><h2 id="enterpriseFaceTitle">{t('console.enterpriseCreate.faceTitle')}</h2><p>{t('console.enterpriseCreate.faceHint')}</p></div>
    <div className="enterprise-face-summary"><div><span>{t('console.enterpriseCreate.enterpriseName')}</span><strong>{certification.enterprise_name || noData}</strong></div><div><span>{t('console.enterpriseCreate.creditCode')}</span><strong>{certification.credit_code_masked || noData}</strong></div><div><span>{t('console.enterpriseCreate.applicantType')}</span><strong>{t('console.enterpriseCreate.legalRepresentativeApplicant')}</strong></div></div>
    <div className="enterprise-face-card"><h3>{t('console.enterpriseCreate.faceCardTitle')}</h3><p>{t('console.enterpriseCreate.faceCardHint')}</p><ul><li>{t('console.enterpriseCreate.faceRuleSelf')}</li><li>{t('console.enterpriseCreate.faceRuleId')}</li><li>{t('console.enterpriseCreate.faceRuleLight')}</li><li>{t('console.enterpriseCreate.faceRuleReturn')}</li></ul>
      <label className="enterprise-certification-consent" htmlFor="enterprise-face-consent"><input id="enterprise-face-consent" type="checkbox" checked={consent} onChange={(event) => onConsentChange(event.target.checked)} /><span>{t('console.enterpriseCreate.faceConsent')}</span></label>
      {consentError ? <div className="enterprise-face-consent-error" role="alert"><strong>{t('console.enterpriseCreate.authorizationRequired')}</strong><span>{consentError}</span></div> : null}
      <div className="enterprise-face-actions"><Button theme="solid" type="primary" loading={loading} disabled={loading} onClick={onStart}>{certification.current_stage === 'face_retry_required' ? t('console.enterpriseCreate.restartFace') : t('console.enterpriseCreate.getFaceQr')}</Button><Button theme="outline" disabled>{t('console.enterpriseCreate.switchAgent')}</Button></div>
    </div>
  </section>
}

function ResultStep({ certification, loading, workspaceError, onRefresh }: { certification: EnterpriseCertification; loading: boolean; workspaceError: string; onRefresh: () => void }) {
  const { t } = useTranslation()
  const completed = certification.current_stage === 'completed'
  const noData = t('console.enterpriseCreate.noData')
  let title = t('console.enterpriseCreate.pendingResultTitle')
  let hint = t('console.enterpriseCreate.pendingResultHint')
  if (completed) { title = t('console.enterpriseCreate.approvedTitle'); hint = t('console.enterpriseCreate.approvedHint') }
  else if (certification.current_stage === 'supplement_required') { title = t('console.enterpriseCreate.supplementTitle'); hint = t('console.enterpriseCreate.supplementHint') }
  else if (certification.current_stage === 'revoked') { title = t('console.enterpriseCreate.revokedTitle'); hint = t('console.enterpriseCreate.revokedHint') }
  else if (certification.status === 'rejected' || certification.status === 'cancelled') { title = t('console.enterpriseCreate.failedTitle'); hint = t('console.enterpriseCreate.failedHint') }
  return <section className={`enterprise-certification-panel enterprise-result-panel${completed ? ' is-success' : ''}`} aria-live="polite">
    <span className="enterprise-result-icon">{completed ? <IconCheckCircleStroked aria-hidden="true" /> : <IconAlertTriangle aria-hidden="true" />}</span>
    <h2>{title}</h2><p>{hint}</p>
    {workspaceError ? <BannerNotice tone="warning">{workspaceError}</BannerNotice> : null}
    {completed ? <div className="enterprise-result-details" aria-label={t('console.enterpriseCreate.resultLabel')}><div><span>{t('console.enterpriseCreate.enterpriseName')}</span><strong>{certification.enterprise_name || noData}</strong></div><div><span>{t('console.enterpriseCreate.creditCode')}</span><strong>{certification.credit_code_masked || noData}</strong></div><div><span>{t('console.enterpriseCreate.legalRepresentative')}</span><strong>{certification.legal_representative_masked || noData}</strong></div></div> : <Button theme="outline" icon={<IconRefresh />} loading={loading} disabled={loading} onClick={onRefresh}>{t('console.enterpriseCreate.refreshStatus')}</Button>}
  </section>
}

function EnterpriseFaceModal({ visible, faceUrl, confirming, notice, onConfirm, onCancel }: { visible: boolean; faceUrl: string; confirming: boolean; notice: FaceConfirmationNotice | null; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const qrCanvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!visible || !faceUrl || !qrCanvas.current || isMobileDevice()) return
    void QRCode.toCanvas(qrCanvas.current, faceUrl, { width: 240, margin: 2 }).catch(() => Toast.error(t('console.enterpriseCreate.qrFailed')))
  }, [faceUrl, t, visible])
  return <Modal className="real-name-verification-modal" title={t('console.enterpriseCreate.faceModalTitle')} visible={visible} onCancel={onCancel} footer={null} width="420px"><div className="real-name-verification-dialog" aria-busy={confirming}>{faceUrl && !isMobileDevice() ? <><div className="real-name-qr-frame"><canvas ref={qrCanvas} aria-label={t('console.enterpriseCreate.scanAlipay')} /></div><strong>{t('console.enterpriseCreate.scanAlipay')}</strong></> : faceUrl ? <Button theme="solid" type="primary" onClick={() => { try { window.location.assign(faceUrl) } catch { Toast.error(t('console.enterpriseCreate.openFailed')) } }}>{t('console.enterpriseCreate.openAlipay')}</Button> : null}<div className="real-name-waiting"><span className="console-loading-spinner" />{t('console.enterpriseCreate.awaitingFace')}</div>{notice ? <div className="enterprise-face-confirm-error" role="alert"><strong>{notice.title}</strong><span>{notice.message}</span></div> : null}<Button theme="outline" loading={confirming} disabled={confirming} onClick={onConfirm}>{t('console.enterpriseCreate.faceCompleted')}</Button><Button className="real-name-dialog-primary-action" theme="borderless" disabled={confirming} onClick={onCancel}>{t('console.enterpriseCreate.closeFace')}</Button></div></Modal>
}

export function EnterpriseCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { replaceEnterpriseWorkspaces } = useAppStore()
  const [certification, setCertification] = useState<EnterpriseCertification | null>(null)
  const [applicantSelected, setApplicantSelected] = useState(false)
  const [form, setForm] = useState<CertificationFormState>(EMPTY_FORM)
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<EnterpriseCertificationValidationErrors>({})
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [material, setMaterial] = useState<EnterpriseMaterialUploadResult | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [faceConsent, setFaceConsent] = useState(false)
  const [faceConsentError, setFaceConsentError] = useState('')
  const [startingFace, setStartingFace] = useState(false)
  const [confirmingFace, setConfirmingFace] = useState(false)
  const [faceModalVisible, setFaceModalVisible] = useState(false)
  const [faceUrl, setFaceUrl] = useState('')
  const [faceConfirmNotice, setFaceConfirmNotice] = useState<FaceConfirmationNotice | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [workspaceRefreshError, setWorkspaceRefreshError] = useState('')
  const refreshedEnterpriseId = useRef<string | null>(null)
  const faceConfirmRequest = useRef<Promise<EnterpriseCertification> | null>(null)
  const firstStatusLoaded = useRef(false)
  const [completedOnEntry, setCompletedOnEntry] = useState(false)

  const invalidateSession = useCallback(() => {
    dispatch(invalidateAuth())
    navigate('/', { replace: true })
  }, [dispatch, navigate])

  const loadCertification = useCallback(async (preserveError = false) => {
    const accessToken = getAccessToken()
    if (!accessToken) { invalidateSession(); setLoading(false); return }
    setLoading(true)
    if (!preserveError) setErrorMessage('')
    try {
      const result = await getEnterpriseCertification(accessToken)
      if (!firstStatusLoaded.current) {
        firstStatusLoaded.current = true
        setCompletedOnEntry(result.current_stage === 'completed')
      }
      setCertification(result)
      if (result.face_url) setFaceUrl(result.face_url)
    } catch (error: unknown) {
      if (isAuthenticationFailure(error)) invalidateSession()
      else setErrorMessage(getEnterpriseCertificationErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [invalidateSession])

  const refreshEnterpriseWorkspaces = useCallback(async (accessToken: string) => {
    setWorkspaceRefreshError('')
    try {
      const memberships = await getProfileEnterprises(accessToken)
      replaceEnterpriseWorkspaces(workspacesFromMemberships(memberships))
    } catch (error: unknown) {
      if (isAuthenticationFailure(error)) invalidateSession()
      else setWorkspaceRefreshError(t('console.enterpriseCreate.workspaceRefreshError'))
    }
  }, [invalidateSession, replaceEnterpriseWorkspaces, t])

  useEffect(() => { void loadCertification() }, [loadCertification])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])
  useEffect(() => {
    if (certification?.current_stage !== 'completed' || !certification.enterprise_id || refreshedEnterpriseId.current === certification.enterprise_id) return
    const accessToken = getAccessToken()
    if (!accessToken) { invalidateSession(); return }
    refreshedEnterpriseId.current = certification.enterprise_id
    void refreshEnterpriseWorkspaces(accessToken)
  }, [certification, invalidateSession, refreshEnterpriseWorkspaces])

  function clearError(field: EnterpriseCertificationField): void {
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  function changeForm(field: keyof CertificationFormState, value: string): void {
    setForm((previous) => ({ ...previous, [field]: value }))
    clearError(field)
  }

  function removeFile(): void {
    setFile(null)
    setPreviewUrl('')
    setMaterial(null)
    setUploadError('')
    clearError('licenseUrl')
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const nextFile = event.target.files?.[0]
    event.target.value = ''
    if (!nextFile) return
    if (!['image/png', 'image/jpeg'].includes(nextFile.type)) { setUploadError(t('console.enterpriseCreate.licenseTypeInvalid')); return }
    if (nextFile.size > ENTERPRISE_LICENSE_MAX_BYTES) { setUploadError(t('console.enterpriseCreate.licenseTooLarge')); return }
    const accessToken = getAccessToken()
    if (!accessToken) { invalidateSession(); return }
    setFile(nextFile)
    setPreviewUrl(URL.createObjectURL(nextFile))
    setMaterial(null)
    setUploadError('')
    setUploading(true)
    try {
      const result = await uploadEnterpriseCertificationMaterial(accessToken, nextFile)
      setMaterial(result)
      setForm((previous) => ({
        ...previous,
        enterpriseName: result.recognition?.enterprise_name ?? '',
        creditCode: normalizeEnterpriseCreditCode(result.recognition?.credit_code ?? ''),
        legalRepresentative: result.recognition?.legal_representative ?? '',
      }))
      clearError('licenseUrl')
    } catch (error: unknown) {
      if (isAuthenticationFailure(error)) invalidateSession()
      else setUploadError(getEnterpriseCertificationErrorMessage(error))
    } finally {
      setUploading(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const nextErrors = validateEnterpriseCertificationForm({ ...form, licenseUrl: material?.resource_url ?? '', consent })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    const accessToken = getAccessToken()
    if (!accessToken) { invalidateSession(); return }
    setSubmitting(true)
    setErrorMessage('')
    try {
      const result = await submitEnterpriseCertification(accessToken, {
        enterprise_name: form.enterpriseName.trim(),
        credit_code: normalizeEnterpriseCreditCode(form.creditCode),
        legal_representative: form.legalRepresentative.trim(),
        legal_representative_id: form.legalRepresentativeId.trim().toUpperCase(),
        contact_name: form.contactName.trim(),
        contact_phone: form.contactPhone.trim(),
        applicant_type: 'legal_representative',
        license_url: material?.resource_url ?? '',
        consent: true,
      })
      setCertification(result)
      if (result.face_url) setFaceUrl(result.face_url)
    } catch (error: unknown) {
      if (isAuthenticationFailure(error)) invalidateSession()
      else setErrorMessage(getEnterpriseCertificationErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  async function startFace(): Promise<void> {
    if (!faceConsent) { setFaceConsentError(t('console.enterpriseCreate.faceConsentRequired')); return }
    if (!certification) return
    setFaceConfirmNotice(null)
    if (certification.current_stage === 'face_verification' && (certification.face_url || faceUrl)) { setFaceModalVisible(true); return }
    const accessToken = getAccessToken()
    if (!accessToken) { invalidateSession(); return }
    setStartingFace(true)
    setErrorMessage('')
    try {
      const result = await startEnterpriseFaceVerification(accessToken, `${window.location.origin}/console/enterprise-create`)
      setCertification(result)
      setFaceUrl(result.face_url ?? '')
      if (result.face_url) setFaceModalVisible(true)
      else setErrorMessage(t('console.enterpriseCreate.faceUrlMissing'))
    } catch (error: unknown) {
      if (isAuthenticationFailure(error)) invalidateSession()
      else setErrorMessage(getEnterpriseCertificationErrorMessage(error))
    } finally {
      setStartingFace(false)
    }
  }

  const requestFaceConfirmation = useCallback((accessToken: string): Promise<EnterpriseCertification> => {
    if (faceConfirmRequest.current) return faceConfirmRequest.current
    const request = confirmEnterpriseFaceVerification(accessToken).finally(() => {
      if (faceConfirmRequest.current === request) faceConfirmRequest.current = null
    })
    faceConfirmRequest.current = request
    return request
  }, [])

  const applyFaceConfirmation = useCallback((result: EnterpriseCertification): boolean => {
    setCertification(result)
    if (result.status !== 'approved' && result.current_stage !== 'completed') return false
    setFaceConfirmNotice(null)
    setFaceModalVisible(false)
    return true
  }, [])

  const confirmFace = useCallback(async (): Promise<void> => {
    const accessToken = getAccessToken()
    if (!accessToken) { invalidateSession(); return }
    setConfirmingFace(true)
    setFaceConfirmNotice(null)
    setErrorMessage('')
    try {
      const result = await requestFaceConfirmation(accessToken)
      if (!applyFaceConfirmation(result)) {
        // 中文：手动确认时告知用户尚未扫脸，后台轮询仍保持静默。
        setFaceConfirmNotice({ title: t('console.enterpriseCreate.faceConfirmPendingTitle'), message: t('console.enterpriseCreate.faceConfirmPendingMessage') })
      }
    } catch (error: unknown) {
      if (isAuthenticationFailure(error)) invalidateSession()
      else setFaceConfirmNotice({ title: t('console.enterpriseCreate.faceConfirmFailedTitle'), message: isApiError(error) && error.message.trim() ? error.message : getEnterpriseCertificationErrorMessage(error) })
    } finally {
      setConfirmingFace(false)
    }
  }, [applyFaceConfirmation, invalidateSession, requestFaceConfirmation, t])

  useEffect(() => {
    if (!faceModalVisible) return

    let cancelled = false
    let timer: number | undefined

    const pollFaceConfirmation = async (): Promise<void> => {
      const accessToken = getAccessToken()
      if (!accessToken) {
        if (!cancelled) invalidateSession()
        return
      }

      try {
        const result = await requestFaceConfirmation(accessToken)
        if (cancelled) return
        if (applyFaceConfirmation(result)) return
      } catch (error: unknown) {
        if (cancelled) return
        if (isAuthenticationFailure(error)) {
          invalidateSession()
          return
        }
        // 中文：后台确认失败通常表示用户尚未刷脸，静默等待下一轮，避免持续展示错误。
      }

      timer = window.setTimeout(() => { void pollFaceConfirmation() }, FACE_CONFIRM_POLL_INTERVAL_MS)
    }

    // 中文：首次确认延迟一个轮询周期，避免弹窗打开时与发起核身请求并发。
    timer = window.setTimeout(() => { void pollFaceConfirmation() }, FACE_CONFIRM_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [applyFaceConfirmation, faceModalVisible, invalidateSession, requestFaceConfirmation])

  if (loading && !certification) return <div className="page-stack enterprise-create-page"><PageTitle title={t('console.enterpriseCreate.title')} description={t('console.enterpriseCreate.description')} /><div className="profile-state-panel" role="status">{t('console.enterpriseCreate.loading')}</div></div>

  const step = stepFromCertification(certification, applicantSelected)
  return <div className="page-stack enterprise-create-page">
    <PageTitle title={t('console.enterpriseCreate.title')} description={t('console.enterpriseCreate.description')} />
    {errorMessage ? <BannerNotice tone="warning"><div className="enterprise-request-error"><span>{errorMessage}</span><Button theme="borderless" size="small" icon={<IconRefresh />} loading={loading} disabled={loading} onClick={() => { void loadCertification() }}>{t('console.enterpriseCreate.reload')}</Button></div></BannerNotice> : null}
    <div className={`enterprise-certification-shell${completedOnEntry ? ' is-standalone-result' : ''}`}>
      {!completedOnEntry ? <EnterpriseStepper step={step} /> : null}
      {step === 1 ? <IdentityStep onSelect={() => setApplicantSelected(true)} /> : null}
      {step === 2 ? <LicenseStep file={file} previewUrl={previewUrl} material={material} form={form} errors={errors} uploadError={uploadError} uploading={uploading} submitting={submitting} consent={consent} onBack={() => setApplicantSelected(false)} onChooseFile={(event) => { void chooseFile(event) }} onRemoveFile={removeFile} onChange={changeForm} onConsentChange={(checked) => { setConsent(checked); if (checked) clearError('consent') }} onSubmit={(event) => { void submit(event) }} /> : null}
      {step === 3 && certification ? <FaceStep certification={certification} consent={faceConsent} consentError={faceConsentError} loading={startingFace} onConsentChange={(checked) => { setFaceConsent(checked); if (checked) setFaceConsentError('') }} onStart={() => { void startFace() }} /> : null}
      {step === 4 && certification ? <ResultStep certification={certification} loading={loading} workspaceError={workspaceRefreshError} onRefresh={() => { void loadCertification() }} /> : null}
    </div>
    <EnterpriseFaceModal visible={faceModalVisible} faceUrl={faceUrl} confirming={confirmingFace} notice={faceConfirmNotice} onConfirm={() => { void confirmFace() }} onCancel={() => { setFaceModalVisible(false); setFaceConfirmNotice(null) }} />
  </div>
}
