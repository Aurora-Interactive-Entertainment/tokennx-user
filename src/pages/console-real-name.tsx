import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Modal from '@douyinfe/semi-ui/lib/es/modal'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import QRCode from 'qrcode'
import { BannerNotice, PageTitle } from '@/components/common'
import { CompatInput as Input } from '@/components/semi-compat'
import { getAccessToken } from '@/auth/token-storage'
import { isApiError, isAuthenticationFailure } from '@/api/http'
import { confirmRealName, getRealNameErrorMessage, getRealNameProfile, isRealNameConflict, submitRealName, type RealNameProfile, type SubmitRealNameRequest } from '@/api/real-name'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'
import i18n from '@/i18n'

const REAL_NAME_NAME_MAX_LENGTH = 30
const REAL_NAME_ID_NUMBER_MIN_LENGTH = 6
const REAL_NAME_ID_NUMBER_MAX_LENGTH = 20
const POLL_INTERVAL_MS = 15_000
const MAX_NETWORK_RETRIES = 3

export const REAL_NAME_ID_TYPES = [
  { value: 'id-card', labelKey: 'console.realName.mainlandId' }, { value: 'hk-macao-pass', labelKey: 'console.realName.hkMacaoPass' },
  { value: 'taiwan-pass', labelKey: 'console.realName.taiwanPass' }, { value: 'hk-macao-residence', labelKey: 'console.realName.hkMacaoResidence' },
  { value: 'taiwan-residence', labelKey: 'console.realName.taiwanResidence' }, { value: 'foreign-permit', labelKey: 'console.realName.foreignPermit' }, { value: 'other', labelKey: 'console.realName.otherId' },
] as const

export interface RealNameFormInput { name: string; idType: string; idNumber: string; consent: boolean }
export type RealNameField = 'name' | 'idNumber' | 'consent'
export type RealNameValidationErrors = Partial<Record<RealNameField, string>>

export function validateRealNameForm(input: RealNameFormInput): RealNameValidationErrors {
  const errors: RealNameValidationErrors = {}; const name = input.name.trim(); const idNumber = input.idNumber.trim()
  if (!name) errors.name = i18n.t('console.realName.nameRequired')
  else if (Array.from(name).length > REAL_NAME_NAME_MAX_LENGTH) errors.name = i18n.t('console.realName.nameTooLong', { count: REAL_NAME_NAME_MAX_LENGTH })
  if (!idNumber) errors.idNumber = i18n.t('console.realName.numberRequired')
  else if (idNumber.length < REAL_NAME_ID_NUMBER_MIN_LENGTH || idNumber.length > REAL_NAME_ID_NUMBER_MAX_LENGTH || !/^[0-9A-Za-z-]+$/.test(idNumber)) errors.idNumber = i18n.t('console.realName.numberInvalid')
  if (!input.consent) errors.consent = i18n.t('console.realName.consentRequired')
  return errors
}

function isVerified(profile: RealNameProfile | null): boolean { return profile?.status === 'verified' }
function realNameVerificationLabel(profile: RealNameProfile): string { return profile.verification_level === 'test' ? i18n.t('console.realName.testVerification') : i18n.t('console.realName.identityVerification') }
function isMobileDevice(): boolean { return typeof window !== 'undefined' && window.matchMedia?.('(max-width: 700px)').matches }
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

export function RealNamePage() {
  const { t } = useTranslation(); const dispatch = useAppDispatch(); const navigate = useNavigate()
  const [profile, setProfile] = useState<RealNameProfile | null>(null); const [name, setName] = useState(''); const [idType, setIDType] = useState<string>(REAL_NAME_ID_TYPES[0].value); const [idNumber, setIDNumber] = useState(''); const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<RealNameValidationErrors>({}); const [loading, setLoading] = useState(true); const [submitting, setSubmitting] = useState(false); const [confirming, setConfirming] = useState(false); const [error, setError] = useState(''); const [receipt, setReceipt] = useState<RealNameProfile | null>(null); const [verificationState, setVerificationState] = useState<'idle' | 'waiting' | 'verified' | 'failed' | 'expired'>('idle'); const [retrying, setRetrying] = useState(false)
  const pollTimer = useRef<number | undefined>(undefined); const stopped = useRef(false); const qrCanvas = useRef<HTMLCanvasElement>(null)
  const submitLocked = useRef(false); const expiresAt = useRef<number | null>(null)

  const invalidateSession = useCallback(() => { dispatch(invalidateAuth()); navigate('/', { replace: true }) }, [dispatch, navigate])
  const loadProfile = useCallback(async () => {
    const token = getAccessToken(); if (!token) { invalidateSession(); setLoading(false); return }
    setLoading(true); setError('')
    try { setProfile(await getRealNameProfile(token)) } catch (requestError) { if (isAuthenticationFailure(requestError)) invalidateSession(); else setError(getRealNameErrorMessage(requestError)) } finally { setLoading(false) }
  }, [invalidateSession])

  const stopPolling = useCallback(() => { stopped.current = true; if (pollTimer.current !== undefined) window.clearTimeout(pollTimer.current); pollTimer.current = undefined }, [])
  const finishVerified = useCallback((verifiedProfile: RealNameProfile) => { stopPolling(); setVerificationState('verified'); setProfile(verifiedProfile); setReceipt(null); Toast.success(t('console.common.success')) }, [stopPolling, t])
  const handleStatus = useCallback(async (next: RealNameProfile) => {
    if (next.status === 'verified') { finishVerified(next); return true }
    if (next.failure_code === 110022 || next.status === 'expired') { stopPolling(); setVerificationState('expired'); setReceipt(null); Toast.error(t('console.realName.expired')); return true }
    if (next.failure_code === 110023 || next.status === 'failed' || next.status === 'rejected') { stopPolling(); setVerificationState('failed'); setReceipt(null); Toast.error(t('console.realName.faceFailed')); return true }
    const nextExpiresAt = timeValueToMilliseconds(next.expires_at)
    if (nextExpiresAt !== null && nextExpiresAt <= Date.now()) { stopPolling(); setVerificationState('expired'); setReceipt(null); Toast.error(t('console.realName.expired')); return true }
    return false
  }, [finishVerified, stopPolling, t])

  const pollOnce = useCallback(async (sessionId: string, attempt = 0): Promise<void> => {
    if (stopped.current) return; const token = getAccessToken(); if (!token) { invalidateSession(); return }
    if (expiresAt.current !== null && expiresAt.current <= Date.now()) { stopPolling(); setVerificationState('expired'); setReceipt(null); Toast.error(t('console.realName.expired')); return }
    try { setRetrying(false); const next = await confirmRealName(token, sessionId); if (await handleStatus(next)) return; pollTimer.current = window.setTimeout(() => { void pollOnce(sessionId) }, POLL_INTERVAL_MS) }
    catch (e) {
      if (isAuthenticationFailure(e)) { invalidateSession(); return }
      if (isApiError(e) && (e.code === 110022 || e.code === 110023)) { stopPolling(); setVerificationState(e.code === 110022 ? 'expired' : 'failed'); setReceipt(null); Toast.error(t(e.code === 110022 ? 'console.realName.expired' : 'console.realName.faceFailed')); return }
      if (isRealNameConflict(e)) {
        try {
          const next = await getRealNameProfile(token)
          if (await handleStatus(next)) return
          pollTimer.current = window.setTimeout(() => { void pollOnce(sessionId) }, POLL_INTERVAL_MS)
          return
        } catch { /* retry below */ }
      }
      if (attempt < MAX_NETWORK_RETRIES) { setRetrying(true); pollTimer.current = window.setTimeout(() => { void pollOnce(sessionId, attempt + 1) }, Math.min(5000 * (attempt + 1), POLL_INTERVAL_MS)) }
      else { Toast.error(getRealNameErrorMessage(e)); pollTimer.current = window.setTimeout(() => { void pollOnce(sessionId) }, POLL_INTERVAL_MS) }
    }
  }, [handleStatus, invalidateSession, stopPolling, t])

  useEffect(() => () => stopPolling(), [stopPolling])
  useEffect(() => { void loadProfile() }, [loadProfile])
  useEffect(() => {
    if (!receipt?.certify_url || !qrCanvas.current || isMobileDevice()) return
    void QRCode.toCanvas(qrCanvas.current, receipt.certify_url, { width: 240, margin: 2 }).catch(() => Toast.error(t('console.realName.qrFailed')))
  }, [receipt, t])
  useEffect(() => { if (!receipt?.id) return; stopped.current = false; void pollOnce(receipt.id); return stopPolling }, [receipt, pollOnce, stopPolling])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting || submitLocked.current) return
    const nextErrors = validateRealNameForm({ name, idType, idNumber, consent }); setErrors(nextErrors); if (Object.keys(nextErrors).length) return
    const token = getAccessToken(); if (!token) { invalidateSession(); return }
    submitLocked.current = true; setSubmitting(true); setError(''); stopped.current = false
    const request: SubmitRealNameRequest = { name: name.trim(), id_type: idType, id_number: idNumber.trim(), consent: true, return_url: window.location.href }
    try {
      const next = await submitRealName(token, request)
      if (await handleStatus(next)) return
      expiresAt.current = timeValueToMilliseconds(next.expires_at); setVerificationState('waiting'); setReceipt(next)
      if (isMobileDevice() && next.certify_url) { try { window.location.assign(next.certify_url) } catch { Toast.error(t('console.realName.openFailed')) } }
    } catch (e) {
      if (isAuthenticationFailure(e)) invalidateSession(); else if (isApiError(e) && (e.code === 110022 || e.code === 110023)) { setVerificationState(e.code === 110022 ? 'expired' : 'failed'); setReceipt(null); Toast.error(t(e.code === 110022 ? 'console.realName.expired' : 'console.realName.faceFailed')) } else if (isRealNameConflict(e)) { try { const current = await getRealNameProfile(token); if (!await handleStatus(current)) Toast.warning(getRealNameErrorMessage(e)) } catch (queryError) { Toast.error(getRealNameErrorMessage(queryError)) } } else Toast.error(getRealNameErrorMessage(e))
    } finally { submitLocked.current = false; setSubmitting(false) }
  }

  async function confirmVerification() {
    if (confirming) return
    const token = getAccessToken(); if (!token) { invalidateSession(); return }
    const sessionId = receipt?.id?.trim()
    if (!sessionId) { stopPolling(); setReceipt(null); Toast.error(t('console.realName.sessionMissing')); return }
    setConfirming(true)
    try { const next = await confirmRealName(token, sessionId); if (!await handleStatus(next)) Toast.warning(t('console.realName.faceRequired')) }
    catch (e) {
      if (isAuthenticationFailure(e)) invalidateSession()
      else if (isApiError(e) && (e.code === 110022 || e.code === 110023)) { stopPolling(); setVerificationState(e.code === 110022 ? 'expired' : 'failed'); setReceipt(null); Toast.error(t(e.code === 110022 ? 'console.realName.expired' : 'console.realName.faceFailed')) }
      else if (isRealNameConflict(e)) { try { const current = await getRealNameProfile(token); if (current.status === 'verified') finishVerified(current); else Toast.warning(t('console.realName.faceRequired')) } catch (queryError) { Toast.error(getRealNameErrorMessage(queryError)) } }
      else Toast.error(getRealNameErrorMessage(e))
    }
    finally { setConfirming(false) }
  }
  if (loading && !profile) return <div className="page-stack real-name-console-page"><PageTitle title={t('console.realName.title')} description={t('console.realName.pageDescription')} /><div className="profile-state-panel" role="status">{t('console.realName.loading')}</div></div>
  const verified = isVerified(profile)
  return <div className="page-stack real-name-console-page"><PageTitle title={t('console.realName.title')} description={t('console.realName.pageDescription')} />
    {error ? <BannerNotice tone="warning"><div className="profile-error-content"><strong>{error}</strong><Button theme="outline" size="small" loading={loading} disabled={loading} onClick={() => { setError(''); void loadProfile() }}>{t('console.realName.refresh')}</Button></div></BannerNotice> : null}
    <section className="real-name-card" aria-labelledby="real-name-title"><BannerNotice tone={verified ? 'success' : 'warning'}><strong id="real-name-title">{verified ? t('console.realName.completed') : t('console.realName.personalOnly')}</strong><span>{verified ? t('console.realName.completedHint') : t('console.realName.legalHint')}</span></BannerNotice>
      {verified && profile ? <div className="real-name-status" aria-label={t('console.realName.title')}><div className="real-name-status-row"><span>{t('console.realName.verificationMethod')}</span><strong>{t('console.realName.currentMethod', { method: realNameVerificationLabel(profile) })}</strong></div><div className="real-name-status-row"><span>{t('console.realName.idNumber')}</span><strong>{profile.masked_id_number || t('console.realName.protected')}</strong></div></div> : null}
      <form className="real-name-form" onSubmit={submit} noValidate><label className="real-name-field" htmlFor="real-name"><span>{t('console.realName.realName')}</span><Input id="real-name" value={name} onChange={setName} maxLength={REAL_NAME_NAME_MAX_LENGTH} placeholder={t('console.realName.realNamePlaceholder')} aria-invalid={Boolean(errors.name)} />{errors.name ? <span className="field-error" role="alert">{errors.name}</span> : null}</label><label className="real-name-field" htmlFor="real-name-type"><span>{t('console.realName.idType')}</span><select className="source-input real-name-select" id="real-name-type" value={idType} onChange={(event) => setIDType(event.target.value)}>{REAL_NAME_ID_TYPES.map((item) => <option value={item.value} key={item.value}>{t(item.labelKey)}</option>)}</select></label><label className="real-name-field" htmlFor="real-name-number"><span>{t('console.realName.idNumber')}</span><Input id="real-name-number" value={idNumber} onChange={setIDNumber} maxLength={REAL_NAME_ID_NUMBER_MAX_LENGTH} placeholder={t('console.realName.idNumberPlaceholder')} aria-invalid={Boolean(errors.idNumber)} />{errors.idNumber ? <span className="field-error" role="alert">{errors.idNumber}</span> : null}</label><label className="real-name-consent" htmlFor="real-name-consent"><input id="real-name-consent" type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); if (event.target.checked) setErrors((previous) => ({ ...previous, consent: undefined })) }} /><span>{t('console.realName.consent')}</span></label>{errors.consent ? <span className="field-error" role="alert">{errors.consent}</span> : null}<Button className="real-name-submit" htmlType="submit" theme="solid" type="primary" loading={submitting} disabled={!consent || submitting}>{verified ? t('console.realName.update') : t('console.realName.submit')}</Button></form><p className="real-name-demo-note">{t('console.realName.demoNote')}</p>
    </section>
    <Modal className="real-name-verification-modal" title={t('console.realName.pending')} visible={Boolean(receipt)} onCancel={() => { stopPolling(); setReceipt(null) }} footer={null} width="420px"><div className="real-name-verification-dialog" aria-busy="true">{receipt?.certify_url && !isMobileDevice() ? <><canvas ref={qrCanvas} aria-label={t('console.realName.scanAlipay')} /><strong>{t('console.realName.scanAlipay')}</strong></> : receipt?.certify_url ? <Button theme="solid" type="primary" onClick={() => { try { window.location.assign(receipt.certify_url as string) } catch { Toast.error(t('console.realName.openFailed')) } }}>{t('console.realName.openAlipay')}</Button> : null}<div className="real-name-waiting"><span className="records-loading-spinner" />{retrying ? t('console.realName.networkRetry') : t('console.realName.certifying')}</div><Button theme="outline" loading={confirming} disabled={confirming} onClick={() => { void confirmVerification() }}>{t('console.realName.confirm')}</Button><Button theme="borderless" disabled={confirming} onClick={() => { stopPolling(); setReceipt(null) }}>{t('console.realName.cancel')}</Button></div></Modal>
  </div>
}
