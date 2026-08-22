import { useEffect, useRef, useState } from 'react'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Input from '@douyinfe/semi-ui/lib/es/input'
import Modal from '@/components/app-modal'
import {
  getProfileErrorMessage,
  isValidContactDestination,
  isValidVerificationCode,
  PROFILE_DEFAULT_RETRY_SECONDS,
  PROFILE_PHONE_COUNTRY_CODE,
  PROFILE_VERIFICATION_CODE_LENGTH,
  sendProfileContactCode,
  updateProfileContact,
  type ContactProvider,
  type ProfileContact,
  type UserProfile,
} from '@/api/profile'
import { isApiError, isAuthenticationFailure } from '@/api/http'
import { saveVerifiedPhone } from '@/auth/token-storage'
import { useTranslation } from 'react-i18next'
import { appToast } from './app-toast'
import './profile-contact-dialog.css'

const COUNTDOWN_INTERVAL_MS = 1000
const CONTACT_PURPOSES = ['current', 'new'] as const
type ContactPurpose = typeof CONTACT_PURPOSES[number]
type ContactField = 'currentDestination' | 'currentCode' | 'newDestination' | 'newCode'

interface ContactFormValues {
  currentDestination: string
  currentCode: string
  newDestination: string
  newCode: string
}

interface ContactCodeState {
  loading: boolean
  retryAfter: number
}

type ContactCodeStates = Record<ContactPurpose, ContactCodeState>
type ContactErrors = Partial<Record<ContactField, string>>

interface ProfileContactDialogProps {
  visible: boolean
  provider: ContactProvider
  currentContact: ProfileContact
  currentDestination?: string
  accessToken: string | null
  onAuthFailure: () => void
  onCancel: () => void
  onSaved: (profile: UserProfile) => void
}

function initialValues(currentDestination = ''): ContactFormValues {
  return { currentDestination, currentCode: '', newDestination: '', newCode: '' }
}

function initialCodeStates(): ContactCodeStates {
  return {
    current: { loading: false, retryAfter: 0 },
    new: { loading: false, retryAfter: 0 },
  }
}

function destinationField(purpose: ContactPurpose): 'currentDestination' | 'newDestination' {
  return purpose === 'current' ? 'currentDestination' : 'newDestination'
}

function codeField(purpose: ContactPurpose): 'currentCode' | 'newCode' {
  return purpose === 'current' ? 'currentCode' : 'newCode'
}

function contactRequestErrorMessage(error: unknown): string {
  return isApiError(error) && error.message ? error.message : getProfileErrorMessage(error)
}

function getContactModalContainer(): HTMLElement {
  return document.body
}

export function ProfileContactDialog(props: ProfileContactDialogProps) {
  const { t } = useTranslation()
  const [values, setValues] = useState<ContactFormValues>(() => initialValues(props.currentDestination))
  const [codeStates, setCodeStates] = useState<ContactCodeStates>(initialCodeStates)
  const [errors, setErrors] = useState<ContactErrors>({})
  const [saving, setSaving] = useState(false)
  const sendingCode = useRef<Record<ContactPurpose, boolean>>({ current: false, new: false })
  const savingContact = useRef(false)

  const isBound = props.currentContact.bound
  const providerLabel = props.provider === 'phone' ? t('profile.contact.phone') : t('profile.contact.email')
  const title = props.provider === 'phone'
    ? t(isBound ? 'profile.contact.dialogPhoneChange' : 'profile.contact.dialogPhoneBind')
    : t(isBound ? 'profile.contact.dialogEmailChange' : 'profile.contact.dialogEmailBind')

  useEffect(() => {
    if (!props.visible) return
    setValues(initialValues(props.currentDestination))
    setCodeStates(initialCodeStates())
    setErrors({})
    setSaving(false)
    sendingCode.current = { current: false, new: false }
    savingContact.current = false
  }, [props.visible, props.provider, props.currentContact.bound, props.currentDestination])

  const hasActiveCountdown = CONTACT_PURPOSES.some((purpose) => codeStates[purpose].retryAfter > 0)

  useEffect(() => {
    if (!props.visible || !hasActiveCountdown) return
    const timer = window.setInterval(() => {
      setCodeStates((previous) => {
        const next = { ...previous }
        for (const purpose of CONTACT_PURPOSES) {
          const state = previous[purpose]
          next[purpose] = { ...state, retryAfter: Math.max(0, state.retryAfter - 1) }
        }
        return next
      })
    }, COUNTDOWN_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [hasActiveCountdown, props.visible])

  function updateValue(field: keyof ContactFormValues, value: string): void {
    setValues((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => {
      if (!previous[field]) return previous
      const next = { ...previous }
      delete next[field]
      return next
    })
  }

  function contactDestinationError(value: string): string | undefined {
    if (!value.trim()) return t('profile.contact.destinationRequired')
    if (isValidContactDestination(props.provider, value)) return undefined
    return props.provider === 'phone' ? t('profile.contact.phoneInvalid') : t('profile.contact.emailInvalid')
  }

  function validateForm(): boolean {
    const nextErrors: ContactErrors = {}
    if (isBound) {
      const currentDestinationError = contactDestinationError(values.currentDestination)
      if (currentDestinationError) nextErrors.currentDestination = currentDestinationError
      if (!isValidVerificationCode(values.currentCode)) nextErrors.currentCode = t('profile.contact.codeInvalid', { count: PROFILE_VERIFICATION_CODE_LENGTH })
    }
    const newDestinationError = contactDestinationError(values.newDestination)
    if (newDestinationError) nextErrors.newDestination = newDestinationError
    if (isBound && values.currentDestination.trim() && values.currentDestination.trim() === values.newDestination.trim()) nextErrors.newDestination = t('profile.contact.sameDestination')
    if (!isValidVerificationCode(values.newCode)) nextErrors.newCode = t('profile.contact.codeInvalid', { count: PROFILE_VERIFICATION_CODE_LENGTH })
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function sendCode(purpose: ContactPurpose): Promise<void> {
    if (sendingCode.current[purpose] || codeStates[purpose].retryAfter > 0) return
    const field = destinationField(purpose)
    const error = contactDestinationError(values[field])
    if (error) {
      setErrors((previous) => ({ ...previous, [field]: error }))
      return
    }
    if (purpose === 'new' && isBound && values.currentDestination.trim() === values.newDestination.trim()) {
      setErrors((previous) => ({ ...previous, newDestination: t('profile.contact.sameDestination') }))
      return
    }
    if (!props.accessToken) {
      props.onAuthFailure()
      return
    }
    sendingCode.current[purpose] = true
    setCodeStates((previous) => ({ ...previous, [purpose]: { ...previous[purpose], loading: true } }))
    try {
      await sendProfileContactCode(props.accessToken, {
        provider_code: props.provider,
        purpose,
        destination: values[field].trim(),
        ...(props.provider === 'phone' ? { country_code: PROFILE_PHONE_COUNTRY_CODE } : {}),
      })
      setCodeStates((previous) => ({
        ...previous,
        [purpose]: { loading: false, retryAfter: PROFILE_DEFAULT_RETRY_SECONDS },
      }))
      appToast.success(t('profile.contact.codeSent'))
    } catch (error) {
      if (isAuthenticationFailure(error)) props.onAuthFailure()
      else appToast.error(contactRequestErrorMessage(error))
      setCodeStates((previous) => ({ ...previous, [purpose]: { ...previous[purpose], loading: false } }))
    } finally {
      sendingCode.current[purpose] = false
    }
  }

  async function saveContact(): Promise<void> {
    if (savingContact.current) return
    if (!validateForm()) return
    if (!props.accessToken) {
      props.onAuthFailure()
      return
    }
    savingContact.current = true
    setSaving(true)
    try {
      const request = isBound
        ? {
          current_destination: values.currentDestination.trim(),
          current_code: values.currentCode.trim(),
          new_destination: values.newDestination.trim(),
          new_code: values.newCode.trim(),
        }
        : { new_destination: values.newDestination.trim(), new_code: values.newCode.trim() }
      const profile = await updateProfileContact(props.accessToken, props.provider, request)
      if (props.provider === 'phone') saveVerifiedPhone(profile.id, values.newDestination)
      appToast.success(t('profile.contact.saved'))
      props.onSaved(profile)
    } catch (error) {
      if (isAuthenticationFailure(error)) props.onAuthFailure()
      else appToast.error(contactRequestErrorMessage(error))
    } finally {
      savingContact.current = false
      setSaving(false)
    }
  }

  function renderCodeControl(purpose: ContactPurpose): React.ReactNode {
    const field = codeField(purpose)
    const state = codeStates[purpose]
    const label = purpose === 'current' ? t('profile.contact.currentCode') : t('profile.contact.newCode')
    const sendLabel = purpose === 'current' ? t('profile.contact.sendCurrent') : t('profile.contact.sendNew')
    return (
      <div className="profile-contact-code-row">
        <label className="profile-field profile-field--code" htmlFor={`profile-${props.provider}-${field}`}>
          <span>{label}</span>
          <Input
            id={`profile-${props.provider}-${field}`}
            value={values[field]}
            onChange={(value) => updateValue(field, value)}
            maxLength={PROFILE_VERIFICATION_CODE_LENGTH}
            inputMode="numeric"
            aria-invalid={Boolean(errors[field])}
            aria-describedby={errors[field] ? `profile-${props.provider}-${field}-error` : undefined}
          />
          {errors[field] ? <small className="profile-field-error" id={`profile-${props.provider}-${field}-error`}>{errors[field]}</small> : null}
        </label>
        <Button
          className="profile-code-button profile-secondary-button"
          theme="outline"
          size="small"
          loading={state.loading}
          disabled={state.loading || state.retryAfter > 0 || (purpose === 'current' && props.provider === 'phone' && !values.currentDestination)}
          onClick={() => { void sendCode(purpose) }}
        >
          {state.retryAfter > 0 ? t('profile.contact.retryAfter', { seconds: state.retryAfter }) : sendLabel}
        </Button>
      </div>
    )
  }

  return (
    <Modal
      className="profile-contact-modal"
      centered
      title={title}
      visible={props.visible}
      width={528}
      zIndex={1400}
      getPopupContainer={getContactModalContainer}
      maskClosable={!saving}
      closable={!saving}
      footer={
        <div className="profile-dialog-footer">
          <Button className="profile-secondary-button" theme="outline" disabled={saving} onClick={props.onCancel}>{t('profile.contact.cancel')}</Button>
          <Button className="profile-primary-button" theme="solid" type="primary" loading={saving} disabled={saving} onClick={() => { void saveContact() }}>{t('profile.contact.save')}</Button>
        </div>
      }
      onCancel={props.onCancel}
    >
      <div className={`profile-contact-dialog profile-contact-dialog--${props.provider} ${isBound ? 'is-bound' : 'is-unbound'}`}>
        {isBound ? (
          <section className="profile-dialog-group profile-dialog-group--current">
            <label className="profile-field" htmlFor={`profile-${props.provider}-current-destination`}>
              <span>{t('profile.contact.currentDestination')}</span>
              <Input
                id={`profile-${props.provider}-current-destination`}
                value={values.currentDestination}
                onChange={(value) => updateValue('currentDestination', value)}
                readonly={props.provider === 'phone'}
                placeholder={t('profile.contact.currentDestinationPlaceholder')}
                aria-invalid={Boolean(errors.currentDestination)}
                aria-describedby={errors.currentDestination ? `profile-${props.provider}-current-destination-error` : undefined}
              />
              {errors.currentDestination ? <small className="profile-field-error" id={`profile-${props.provider}-current-destination-error`}>{errors.currentDestination}</small> : <small>{t('profile.contact.currentDestinationHint')}</small>}
            </label>
            {renderCodeControl('current')}
          </section>
        ) : (
          <section className="profile-dialog-group profile-dialog-group--status">
            <label className="profile-field" htmlFor={`profile-${props.provider}-unbound-status`}>
              <span>{providerLabel}</span>
              <Input
                id={`profile-${props.provider}-unbound-status`}
                value={t(props.provider === 'email' ? 'profile.contact.unboundEmail' : 'profile.contact.unbound')}
                readonly
              />
            </label>
          </section>
        )}
        <section className="profile-dialog-group profile-dialog-group--new">
          <label className="profile-field" htmlFor={`profile-${props.provider}-new-destination`}>
            <span>{t('profile.contact.newDestination')}</span>
            <Input
              id={`profile-${props.provider}-new-destination`}
              value={values.newDestination}
              onChange={(value) => updateValue('newDestination', value)}
              placeholder={t(props.provider === 'phone' ? 'profile.contact.newDestinationPlaceholderPhone' : 'profile.contact.newDestinationPlaceholderEmail')}
              aria-invalid={Boolean(errors.newDestination)}
              aria-describedby={errors.newDestination ? `profile-${props.provider}-new-destination-error` : undefined}
            />
            {errors.newDestination ? <small className="profile-field-error" id={`profile-${props.provider}-new-destination-error`}>{errors.newDestination}</small> : null}
          </label>
          {renderCodeControl('new')}
        </section>
        <p className="profile-dialog-hint">{t('profile.contact.verificationHint')}</p>
      </div>
    </Modal>
  )
}
