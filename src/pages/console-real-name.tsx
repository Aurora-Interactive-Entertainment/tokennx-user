import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Modal from '@douyinfe/semi-ui/lib/es/modal'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import QRCode from 'qrcode'
import { BannerNotice, PageTitle } from '@/components/common'
import { CompatInput as Input, CompatSelect as Select } from '@/components/semi-compat'
import { getAccessToken } from '@/auth/token-storage'
import { isApiError, isAuthenticationFailure } from '@/api/http'
import { confirmRealName, getRealNameErrorMessage, getRealNameProfile, isRealNameConflict, submitRealName, type RealNameProfile, type SubmitRealNameRequest } from '@/api/real-name'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import i18n from '@/i18n'

const REAL_NAME_NAME_MAX_LENGTH = 30
const REAL_NAME_ID_NUMBER_LENGTH = 18
const QR_VALIDITY_MS = 5 * 60_000
const REAL_NAME_SESSION_KEY = 'token-nx:user-front:real-name-session'

export const REAL_NAME_ID_TYPES = [
  { value: 'id-card', labelKey: 'console.realName.mainlandId' },
] as const

export interface RealNameFormInput { name: string; idType: string; idNumber: string; consent: boolean }
export type RealNameField = 'name' | 'idNumber' | 'consent'
export type RealNameValidationErrors = Partial<Record<RealNameField, string>>

interface StoredRealNameSession {
  user_id: string
  id: string
  certify_url: string
  expires_at: number
  qr_expires_at: number
}

export function validateRealNameForm(input: RealNameFormInput): RealNameValidationErrors {
  const errors: RealNameValidationErrors = {}
  const name = input.name.trim()
  const idNumber = input.idNumber.trim()
  if (!name) errors.name = i18n.t('console.realName.nameRequired')
  else if (Array.from(name).length > REAL_NAME_NAME_MAX_LENGTH) errors.name = i18n.t('console.realName.nameTooLong', { count: REAL_NAME_NAME_MAX_LENGTH })
  if (!idNumber) errors.idNumber = i18n.t('console.realName.numberRequired')
  else if (!/^\d{17}[\dXx]$/.test(idNumber)) errors.idNumber = i18n.t('console.realName.numberInvalid')
  if (!input.consent) errors.consent = i18n.t('console.realName.consentRequired')
  return errors
}

function isVerified(profile: RealNameProfile | null): boolean { return profile?.status === 'verified' }
function realNameVerificationLabel(profile: RealNameProfile): string { return profile.verification_level === 'test' ? i18n.t('console.realName.testVerification') : i18n.t('console.realName.identityVerification') }
function isMobileDevice(): boolean { return typeof window !== 'undefined' && window.matchMedia?.('(max-width: 700px)').matches }
function isRealNameLoginExpired(error: unknown): boolean { return isApiError(error) ? error.status === 401 : isAuthenticationFailure(error) }
function timeValueToMilliseconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function readStoredSession(userId: string): StoredRealNameSession | null {
  try {
    const raw = window.sessionStorage.getItem(REAL_NAME_SESSION_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<StoredRealNameSession>
    if (value.user_id !== userId || typeof value.id !== 'string' || !value.id.trim() || typeof value.certify_url !== 'string' || !value.certify_url.trim()) {
      clearStoredSession()
      return null
    }
    if (typeof value.expires_at !== 'number' || !Number.isFinite(value.expires_at) || typeof value.qr_expires_at !== 'number' || !Number.isFinite(value.qr_expires_at)) return null
    return value as StoredRealNameSession
  } catch {
    return null
  }
}

function clearStoredSession(): void {
  try { window.sessionStorage.removeItem(REAL_NAME_SESSION_KEY) } catch { /* Storage may be unavailable. */ }
}

function saveStoredSession(userId: string, receipt: RealNameProfile, qrExpiresAt: number): void {
  const id = receipt.id?.trim()
  const certifyUrl = receipt.certify_url?.trim()
  if (!id || !certifyUrl) return
  const serverExpiresAt = timeValueToMilliseconds(receipt.expires_at) ?? qrExpiresAt
  try {
    window.sessionStorage.setItem(REAL_NAME_SESSION_KEY, JSON.stringify({ user_id: userId, id, certify_url: certifyUrl, expires_at: serverExpiresAt, qr_expires_at: qrExpiresAt } satisfies StoredRealNameSession))
  } catch { /* The active in-memory session remains usable. */ }
}

export function RealNamePage() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const userId = useAppSelector((state) => state.auth.user?.id ?? '')
  const navigate = useNavigate()
  const [profile, setProfile] = useState<RealNameProfile | null>(null)
  const [name, setName] = useState('')
  const [idType, setIDType] = useState<string>(REAL_NAME_ID_TYPES[0].value)
  const [idNumber, setIDNumber] = useState('')
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<RealNameValidationErrors>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [refreshingQr, setRefreshingQr] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<RealNameProfile | null>(null)
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null)
  const [clock, setClock] = useState(() => Date.now())
  const qrCanvas = useRef<HTMLCanvasElement>(null)
  const submitLocked = useRef(false)
  const refreshLocked = useRef(false)
  const confirmRequest = useRef<{ sessionId: string; promise: Promise<RealNameProfile> } | null>(null)
  const restoredSessionPending = useRef<string | null>(null)
  const submittedRequest = useRef<SubmitRealNameRequest | null>(null)

  const invalidateSession = useCallback(() => {
    clearStoredSession()
    dispatch(invalidateAuth())
    navigate('/', { replace: true })
  }, [dispatch, navigate])

  const closeVerification = useCallback(() => {
    clearStoredSession()
    setReceipt(null)
    setQrExpiresAt(null)
    submittedRequest.current = null
  }, [])

  const applyReceipt = useCallback((next: RealNameProfile) => {
    const serverExpiresAt = timeValueToMilliseconds(next.expires_at)
    const fiveMinutesFromNow = Date.now() + QR_VALIDITY_MS
    const nextQrExpiresAt = serverExpiresAt === null ? fiveMinutesFromNow : Math.min(serverExpiresAt, fiveMinutesFromNow)
    setReceipt(next)
    setQrExpiresAt(nextQrExpiresAt)
    setClock(Date.now())
    if (userId) saveStoredSession(userId, next, nextQrExpiresAt)
  }, [userId])

  const loadProfile = useCallback(async () => {
    const token = getAccessToken()
    if (!token) { invalidateSession(); setLoading(false); return }
    setLoading(true)
    setError('')
    try {
      const next = await getRealNameProfile(token)
      setProfile(next)
      if (next.status === 'verified') {
        closeVerification()
      } else {
        const stored = userId ? readStoredSession(userId) : null
        if (stored) {
          const sessionExpiresAt = Math.min(stored.expires_at, stored.qr_expires_at)
          restoredSessionPending.current = stored.id
          setReceipt({ id: stored.id, certify_url: stored.certify_url, expires_at: stored.expires_at, status: 'unverified' })
          setQrExpiresAt(sessionExpiresAt)
          setClock(Date.now())
        }
      }
    } catch (requestError) {
      if (isRealNameLoginExpired(requestError)) invalidateSession()
      else setError(getRealNameErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [closeVerification, invalidateSession, userId])

  const finishVerified = useCallback(async (verifiedProfile: RealNameProfile, showFeedback = true) => {
    closeVerification()
    setProfile(verifiedProfile)
    if (showFeedback) Toast.success(t('console.realName.verifiedSuccess'))
    const token = getAccessToken()
    if (!token) return
    try {
      const refreshed = await getRealNameProfile(token)
      if (refreshed.status === 'verified') setProfile(refreshed)
    } catch (requestError) {
      if (isRealNameLoginExpired(requestError)) invalidateSession()
    }
  }, [closeVerification, invalidateSession, t])

  const requestConfirmation = useCallback((token: string, sessionId: string): Promise<RealNameProfile> => {
    const active = confirmRequest.current
    if (active?.sessionId === sessionId) return active.promise
    const promise = confirmRealName(token, sessionId).finally(() => {
      if (confirmRequest.current?.promise === promise) confirmRequest.current = null
    })
    confirmRequest.current = { sessionId, promise }
    return promise
  }, [])

  const confirmSilently = useCallback(async (sessionId: string) => {
    const token = getAccessToken()
    if (!token) { invalidateSession(); return }
    try {
      const next = await requestConfirmation(token, sessionId)
      if (next.status === 'verified') await finishVerified(next, false)
    } catch (requestError) {
      if (isRealNameLoginExpired(requestError)) invalidateSession()
      else if (isApiError(requestError) && (requestError.code === 110021 || requestError.code === 110022)) clearStoredSession()
      else if (isRealNameConflict(requestError)) {
        try {
          const current = await getRealNameProfile(token)
          if (current.status === 'verified') await finishVerified(current, false)
        } catch (queryError) {
          if (isRealNameLoginExpired(queryError)) invalidateSession()
        }
      }
    }
  }, [finishVerified, invalidateSession, requestConfirmation])

  const cancelVerification = useCallback(() => {
    const sessionId = receipt?.id?.trim()
    if (sessionId) void confirmSilently(sessionId)
    closeVerification()
  }, [closeVerification, confirmSilently, receipt])

  const queryFinalStatus = useCallback(async (token: string) => {
    const current = await getRealNameProfile(token)
    if (current.status === 'verified') {
      await finishVerified(current)
      return true
    }
    Toast.warning(t('console.realName.resultPending'))
    return false
  }, [finishVerified, t])

  useEffect(() => { void loadProfile() }, [loadProfile])
  useEffect(() => {
    const sessionId = restoredSessionPending.current
    if (!sessionId || receipt?.id !== sessionId) return
    restoredSessionPending.current = null
    void confirmSilently(sessionId)
  }, [confirmSilently, receipt])
  useEffect(() => {
    if (!receipt || qrExpiresAt === null || clock >= qrExpiresAt) return
    const timer = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [clock, qrExpiresAt, receipt])
  useEffect(() => {
    if (!receipt?.certify_url || !qrCanvas.current || isMobileDevice()) return
    void QRCode.toCanvas(qrCanvas.current, receipt.certify_url, { width: 240, margin: 2 }).catch(() => Toast.error(t('console.realName.qrFailed')))
  }, [receipt, t])

  async function startVerification(request: SubmitRealNameRequest, retryConflict = true): Promise<void> {
    const token = getAccessToken()
    if (!token) { invalidateSession(); return }
    try {
      const next = await submitRealName(token, request)
      if (next.status === 'verified') { await finishVerified(next); return }
      if (!next.id?.trim() || !next.certify_url?.trim()) throw new Error(t('console.realName.sessionMissing'))
      submittedRequest.current = request
      applyReceipt(next)
      if (isMobileDevice()) {
        try { window.location.assign(next.certify_url) } catch { Toast.error(t('console.realName.openFailed')) }
      }
    } catch (requestError) {
      if (isRealNameLoginExpired(requestError)) invalidateSession()
      else if (retryConflict && isRealNameConflict(requestError)) await startVerification(request, false)
      else Toast.error(getRealNameErrorMessage(requestError))
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || submitLocked.current) return
    const nextErrors = validateRealNameForm({ name, idType, idNumber, consent })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    submitLocked.current = true
    setSubmitting(true)
    setError('')
    const request: SubmitRealNameRequest = { name: name.trim(), id_type: 'id-card', id_number: idNumber.trim(), consent: true, return_url: `${window.location.origin}/console/real-name` }
    try { await startVerification(request) } finally { submitLocked.current = false; setSubmitting(false) }
  }

  async function confirmVerification() {
    if (confirming) return
    const token = getAccessToken()
    if (!token) { invalidateSession(); return }
    const sessionId = receipt?.id?.trim()
    if (!sessionId) { closeVerification(); Toast.error(t('console.realName.sessionMissing')); return }
    if (qrExpiresAt !== null && Date.now() >= qrExpiresAt) { setClock(Date.now()); Toast.warning(t('console.realName.qrExpiredHint')); return }
    setConfirming(true)
    try {
      const next = await requestConfirmation(token, sessionId)
      if (next.status === 'verified') await finishVerified(next)
      else Toast.warning(t('console.realName.resultPending'))
    } catch (requestError) {
      if (isRealNameLoginExpired(requestError)) invalidateSession()
      else if (isApiError(requestError) && (requestError.code === 110021 || requestError.code === 110022)) {
        closeVerification()
        Toast.error(t(requestError.code === 110022 ? 'console.realName.expired' : 'console.realName.sessionMissing'))
      } else if (isRealNameConflict(requestError)) {
        try { await queryFinalStatus(token) } catch (queryError) { Toast.error(getRealNameErrorMessage(queryError)) }
      } else Toast.error(getRealNameErrorMessage(requestError))
    } finally {
      setConfirming(false)
    }
  }

  async function refreshQrCode() {
    if (refreshingQr || refreshLocked.current) return
    const request = submittedRequest.current
    if (!request) {
      closeVerification()
      Toast.warning(t('console.realName.refillToRefresh'))
      return
    }
    refreshLocked.current = true
    setRefreshingQr(true)
    try { await startVerification(request) } finally { refreshLocked.current = false; setRefreshingQr(false) }
  }

  if (loading && !profile) return <div className="page-stack real-name-console-page"><PageTitle title={t('console.realName.title')} description={t('console.realName.pageDescription')} /><div className="profile-state-panel" role="status">{t('console.realName.loading')}</div></div>
  const verified = isVerified(profile)
  const qrExpired = Boolean(receipt && qrExpiresAt !== null && clock >= qrExpiresAt)

  return <div className="page-stack real-name-console-page"><PageTitle title={t('console.realName.title')} description={t('console.realName.pageDescription')} />
    {error ? <BannerNotice tone="warning"><div className="profile-error-content"><strong>{error}</strong><Button theme="outline" size="small" loading={loading} disabled={loading} onClick={() => { setError(''); void loadProfile() }}>{t('console.realName.refresh')}</Button></div></BannerNotice> : null}
    <section className={`real-name-card${verified ? ' real-name-card--verified' : ''}`} aria-labelledby="real-name-title"><BannerNotice tone={verified ? 'success' : 'warning'}><strong id="real-name-title">{verified ? t('console.realName.completed') : t('console.realName.personalOnly')}</strong><span>{verified ? t('console.realName.completedHint') : t('console.realName.legalHint')}</span></BannerNotice>
      {verified && profile ? <div className="real-name-status" aria-label={t('console.realName.title')}><div className="real-name-status-row"><span>{t('console.realName.verificationMethod')}</span><strong>{t('console.realName.currentMethod', { method: realNameVerificationLabel(profile) })}</strong></div><div className="real-name-status-row"><span>{t('console.realName.idNumber')}</span><strong>{profile.masked_id_number || t('console.realName.protected')}</strong></div></div> : null}
      {!verified ? <><form className="real-name-form" onSubmit={submit} noValidate><label className="real-name-field" htmlFor="real-name"><span>{t('console.realName.realName')}</span><Input id="real-name" value={name} onChange={(value) => { setName(value); if (errors.name) setErrors((previous) => ({ ...previous, name: undefined })) }} size="large" maxLength={REAL_NAME_NAME_MAX_LENGTH} placeholder={t('console.realName.realNamePlaceholder')} validateStatus={errors.name ? 'error' : 'default'} aria-invalid={Boolean(errors.name)} />{errors.name ? <span className="field-error" role="alert">{errors.name}</span> : null}</label><label className="real-name-field" htmlFor="real-name-type"><span>{t('console.realName.idType')}</span><Select id="real-name-type" value={idType} onChange={(value) => setIDType(String(value))} size="large" block aria-label={t('console.realName.idType')}>{REAL_NAME_ID_TYPES.map((item) => <Select.Option value={item.value} key={item.value}>{t(item.labelKey)}</Select.Option>)}</Select></label><label className="real-name-field" htmlFor="real-name-number"><span>{t('console.realName.idNumber')}</span><Input id="real-name-number" value={idNumber} onChange={(value) => { setIDNumber(value); if (errors.idNumber) setErrors((previous) => ({ ...previous, idNumber: undefined })) }} size="large" maxLength={REAL_NAME_ID_NUMBER_LENGTH} placeholder={t('console.realName.idNumberPlaceholder')} validateStatus={errors.idNumber ? 'error' : 'default'} aria-invalid={Boolean(errors.idNumber)} />{errors.idNumber ? <span className="field-error" role="alert">{errors.idNumber}</span> : null}</label><label className="real-name-consent" htmlFor="real-name-consent"><input id="real-name-consent" type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); if (event.target.checked) setErrors((previous) => ({ ...previous, consent: undefined })) }} /><span>{t('console.realName.consent')}</span></label>{errors.consent ? <span className="field-error" role="alert">{errors.consent}</span> : null}<Button className="real-name-submit" htmlType="submit" theme="solid" type="primary" loading={submitting} disabled={!consent || submitting}>{t('console.realName.submit')}</Button></form><p className="real-name-demo-note">{t('console.realName.demoNote')}</p></> : null}
    </section>
    <Modal className="real-name-verification-modal" title={t('console.realName.pending')} visible={Boolean(receipt)} onCancel={cancelVerification} footer={null} width="420px"><div className="real-name-verification-dialog" aria-busy={confirming || refreshingQr}>{receipt?.certify_url && !isMobileDevice() ? <><div className={`real-name-qr-frame${qrExpired ? ' is-expired' : ''}`}><canvas ref={qrCanvas} aria-label={t('console.realName.scanAlipay')} />{qrExpired ? <div className="real-name-qr-expired-overlay"><span>{t('console.realName.qrExpired')}</span><Button className="real-name-dialog-primary-action" theme="borderless" loading={refreshingQr} disabled={refreshingQr} onClick={() => { void refreshQrCode() }}>{t('console.realName.refreshQr')}</Button></div> : null}</div><strong>{qrExpired ? t('console.realName.qrExpiredHint') : t('console.realName.scanAlipay')}</strong></> : receipt?.certify_url ? <Button theme="solid" type="primary" disabled={qrExpired} onClick={() => { try { window.location.assign(receipt.certify_url as string) } catch { Toast.error(t('console.realName.openFailed')) } }}>{t('console.realName.openAlipay')}</Button> : null}{!qrExpired ? <div className="real-name-waiting"><span className="records-loading-spinner" />{t('console.realName.awaitingCompletion')}</div> : null}<Button theme="outline" loading={confirming} disabled={confirming || refreshingQr || qrExpired} onClick={() => { void confirmVerification() }}>{t('console.realName.confirm')}</Button>{qrExpired && isMobileDevice() ? <Button className="real-name-dialog-primary-action" theme="borderless" loading={refreshingQr} disabled={refreshingQr} onClick={() => { void refreshQrCode() }}>{t('console.realName.refreshQr')}</Button> : null}<Button className="real-name-dialog-primary-action" theme="borderless" disabled={confirming || refreshingQr} onClick={cancelVerification}>{t('console.realName.cancel')}</Button></div></Modal>
  </div>
}
