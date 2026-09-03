import { useEffect, useRef, useState } from 'react'
import Button from '@douyinfe/semi-ui/lib/es/button'
import AppModal from './app-modal'
import { CompatInput as Input } from './semi-compat'
import {
  getProfileErrorMessage,
  isValidContactDestination,
  isValidVerificationCode,
  PROFILE_DEFAULT_RETRY_SECONDS,
  PROFILE_VERIFICATION_CODE_LENGTH,
  sendProfileContactCode,
  updateProfileContact,
} from '@/api/profile'
import { getAccessToken } from '@/auth/token-storage'
import { isAuthenticationFailure } from '@/api/http'
import { useTranslation } from 'react-i18next'
import { appToast } from './app-toast'
import './bind-email-dialog.css'

type BindEmailDialogProps = {
  visible: boolean
  onClose: () => void
  onAuthFailure: () => void
  onBound: () => void
}

/** 中文：首次登录绑定邮箱弹窗，复用个人资料接口和统一 AppModal 行为。 */
export function BindEmailDialog({ visible, onClose, onAuthFailure, onBound }: BindEmailDialogProps) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [retryAfter, setRetryAfter] = useState(0)
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const sendingRef = useRef(false)

  useEffect(() => {
    if (!visible) return
    setEmail(''); setCode(''); setRetryAfter(0); setSending(false); setSaving(false); setError('')
  }, [visible])

  useEffect(() => {
    if (!visible || retryAfter <= 0) return
    const timer = window.setInterval(() => setRetryAfter((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [retryAfter, visible])

  function validateEmail(): boolean {
    if (!isValidContactDestination('email', email)) { setError(t('bindEmail.emailInvalid')); return false }
    return true
  }

  async function sendCode(): Promise<void> {
    if (sendingRef.current || retryAfter > 0 || !validateEmail()) return
    const accessToken = getAccessToken()
    if (!accessToken) { onAuthFailure(); return }
    sendingRef.current = true; setSending(true); setError('')
    try {
      await sendProfileContactCode(accessToken, { provider_code: 'email', purpose: 'new', destination: email.trim() })
      setRetryAfter(PROFILE_DEFAULT_RETRY_SECONDS)
      appToast.success(t('bindEmail.codeSent'))
    } catch (requestError) {
      if (isAuthenticationFailure(requestError)) onAuthFailure()
      else setError(getProfileErrorMessage(requestError))
    } finally { sendingRef.current = false; setSending(false) }
  }

  async function bindEmail(): Promise<void> {
    if (!validateEmail()) return
    if (!isValidVerificationCode(code)) { setError(t('bindEmail.codeInvalid')); return }
    const accessToken = getAccessToken()
    if (!accessToken) { onAuthFailure(); return }
    setSaving(true); setError('')
    try {
      await updateProfileContact(accessToken, 'email', { new_destination: email.trim(), new_code: code.trim() })
      appToast.success(t('bindEmail.bound'))
      onBound(); onClose()
    } catch (requestError) {
      if (isAuthenticationFailure(requestError)) onAuthFailure()
      else setError(getProfileErrorMessage(requestError))
    } finally { setSaving(false) }
  }

  return <AppModal
    className="bind-email-modal"
    visible={visible}
    title={t('bindEmail.title')}
    width={560}
    maskClosable={!saving}
    closable={!saving}
    footer={<div className="bind-email-footer">
      <Button theme="outline" type="tertiary" disabled={saving} onClick={onClose}>{t('bindEmail.later')}</Button>
      <Button theme="solid" type="primary" loading={saving} disabled={saving} onClick={() => { void bindEmail() }}>{t('bindEmail.bind')}</Button>
    </div>}
    onCancel={onClose}
  >
    <div className="bind-email-content">
      <p>{t('bindEmail.description')}</p>
      <label htmlFor="bind-email-destination">{t('bindEmail.email')}</label>
      <Input id="bind-email-destination" value={email} onChange={setEmail} placeholder={t('bindEmail.emailPlaceholder')} type="email" autoComplete="email" aria-invalid={Boolean(error)} />
      <div className="bind-email-code-row">
        <Input id="bind-email-code" value={code} onChange={(value) => setCode(value.replace(/\D/g, '').slice(0, PROFILE_VERIFICATION_CODE_LENGTH))} placeholder={t('bindEmail.codePlaceholder')} inputMode="numeric" maxLength={PROFILE_VERIFICATION_CODE_LENGTH} aria-label={t('bindEmail.code')} />
        <Button theme="outline" loading={sending} disabled={sending || retryAfter > 0} onClick={() => { void sendCode() }}>{retryAfter > 0 ? t('bindEmail.retryAfter', { seconds: retryAfter }) : t('bindEmail.sendCode')}</Button>
      </div>
      {error ? <p className="bind-email-error" role="alert">{error}</p> : null}
    </div>
  </AppModal>
}
