import { useEffect, useRef, useState } from 'react'
import Button from '@douyinfe/semi-ui/lib/es/button'
import { Form, type FormApi } from '@douyinfe/semi-ui/lib/es/form'
import AppModal from './app-modal'
import { getProfileErrorMessage, isValidContactDestination, isValidVerificationCode, PROFILE_DEFAULT_RETRY_SECONDS, PROFILE_VERIFICATION_CODE_LENGTH, sendProfileContactCode, updateProfileContact } from '@/api/profile'
import { getAccessToken } from '@/auth/token-storage'
import { isAuthenticationFailure } from '@/api/http'
import { useTranslation } from 'react-i18next'
import { appToast } from './app-toast'
import './bind-email-dialog.css'

type BindEmailDialogProps = { visible: boolean; onClose: () => void; onAuthFailure: () => void; onBound: () => void }
type BindEmailFormValues = { email: string; code: string }

/** 中文：绑定邮箱弹窗复用 Semi Form 的必填标记、错误样式和统一 AppModal 行为。 */
export function BindEmailDialog({ visible, onClose, onAuthFailure, onBound }: BindEmailDialogProps) {
  const { t } = useTranslation()
  const [retryAfter, setRetryAfter] = useState(0)
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const sendingRef = useRef(false)
  const formApiRef = useRef<FormApi<BindEmailFormValues> | null>(null)

  useEffect(() => { if (visible) { formApiRef.current?.reset(); setRetryAfter(0); setSending(false); setSaving(false); setError('') } }, [visible])
  useEffect(() => { if (!visible || retryAfter <= 0) return; const timer = window.setInterval(() => setRetryAfter((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer) }, [retryAfter, visible])
  useEffect(() => { if (error) appToast.error(error) }, [error])

  async function readEmail(): Promise<string | null> {
    const formApi = formApiRef.current
    if (!formApi) return null
    try { await formApi.validate(['email']); const email = String(formApi.getValue('email') ?? '').trim(); return isValidContactDestination('email', email) ? email : null } catch { return null }
  }

  async function sendCode(): Promise<void> {
    if (sendingRef.current || saving || retryAfter > 0) return
    const email = await readEmail()
    if (!email) return
    const accessToken = getAccessToken()
    if (!accessToken) { onAuthFailure(); return }
    sendingRef.current = true; setSending(true); setError('')
    try { await sendProfileContactCode(accessToken, { provider_code: 'email', purpose: 'new', destination: email }); setRetryAfter(PROFILE_DEFAULT_RETRY_SECONDS); appToast.success(t('bindEmail.codeSent')) }
    catch (requestError) { if (isAuthenticationFailure(requestError)) onAuthFailure(); else setError(getProfileErrorMessage(requestError)) }
    finally { sendingRef.current = false; setSending(false) }
  }

  async function bindEmail(): Promise<void> {
    const formApi = formApiRef.current
    if (!formApi) return
    let values: BindEmailFormValues
    try { values = await formApi.validate() as BindEmailFormValues } catch { return }
    const email = values.email.trim(); const code = values.code.trim()
    if (!isValidContactDestination('email', email) || !isValidVerificationCode(code)) return
    const accessToken = getAccessToken()
    if (!accessToken) { onAuthFailure(); return }
    setSaving(true); setError('')
    try { await updateProfileContact(accessToken, 'email', { new_destination: email, new_code: code }); appToast.success(t('bindEmail.bound')); onBound(); onClose() }
    catch (requestError) { if (isAuthenticationFailure(requestError)) onAuthFailure(); else setError(getProfileErrorMessage(requestError)) }
    finally { setSaving(false) }
  }

  return <AppModal className="bind-email-modal" visible={visible} title={t('bindEmail.title')} width={560} maskClosable={!saving} closable={!saving} footer={<div className="bind-email-footer"><Button theme="outline" type="tertiary" disabled={saving} onClick={onClose}>{t('bindEmail.later')}</Button><Button theme="solid" type="primary" loading={saving} disabled={saving} onClick={() => { void bindEmail() }}>{t('bindEmail.bind')}</Button></div>} onCancel={onClose}>
    <Form<BindEmailFormValues> className="bind-email-content" labelPosition="top" initValues={{ email: '', code: '' }} showValidateIcon={false} getFormApi={(formApi) => { formApiRef.current = formApi }}>
      <p>{t('bindEmail.description')}</p>
      <Form.Input field="email" label={t('bindEmail.email')} type="email" autoComplete="email" placeholder={t('bindEmail.emailPlaceholder')} rules={[{ required: true, message: t('bindEmail.emailInvalid') }, { validator: (_rule, value) => !String(value ?? '').trim() || isValidContactDestination('email', String(value)) ? true : new Error(t('bindEmail.emailInvalid')) }]} disabled={saving} />
      <div className="bind-email-code-row"><Form.Input field="code" label={t('bindEmail.code')} placeholder={t('bindEmail.codePlaceholder')} inputMode="numeric" maxLength={PROFILE_VERIFICATION_CODE_LENGTH} rules={[{ required: true, message: t('bindEmail.codeInvalid') }, { pattern: new RegExp(`^[0-9]{${PROFILE_VERIFICATION_CODE_LENGTH}}$`), message: t('bindEmail.codeInvalid') }]} disabled={saving} /><Button className="bind-email-send-code" theme="outline" loading={sending} disabled={sending || saving || retryAfter > 0} onClick={() => { void sendCode() }}>{retryAfter > 0 ? t('bindEmail.retryAfter', { seconds: retryAfter }) : t('bindEmail.sendCode')}</Button></div>
    </Form>
  </AppModal>
}
