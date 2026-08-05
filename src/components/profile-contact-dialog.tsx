import { useEffect, useState } from 'react'
import { Button, Input, Modal, Toast } from '@douyinfe/semi-ui'
import {
  getProfileErrorMessage,
  isValidContactDestination,
  isValidVerificationCode,
  PROFILE_DEFAULT_RETRY_SECONDS,
  PROFILE_VERIFICATION_CODE_LENGTH,
  sendProfileContactCode,
  updateProfileContact,
  type ContactProvider,
  type ProfileContact,
  type UserProfile,
} from '@/api/profile'
import { isAuthenticationFailure } from '@/api/http'
import { useTranslation } from 'react-i18next'

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
  destinationMasked: string
}

type ContactCodeStates = Record<ContactPurpose, ContactCodeState>
type ContactErrors = Partial<Record<ContactField, string>>

interface ProfileContactDialogProps {
  visible: boolean
  provider: ContactProvider
  currentContact: ProfileContact
  accessToken: string | null
  locale: string
  onAuthFailure: () => void
  onCancel: () => void
  onSaved: (profile: UserProfile) => void
}

function initialValues(): ContactFormValues {
  return { currentDestination: '', currentCode: '', newDestination: '', newCode: '' }
}

function initialCodeStates(): ContactCodeStates {
  return {
    current: { loading: false, retryAfter: 0, destinationMasked: '' },
    new: { loading: false, retryAfter: 0, destinationMasked: '' },
  }
}

function destinationField(purpose: ContactPurpose): 'currentDestination' | 'newDestination' {
  return purpose === 'current' ? 'currentDestination' : 'newDestination'
}

function codeField(purpose: ContactPurpose): 'currentCode' | 'newCode' {
  return purpose === 'current' ? 'currentCode' : 'newCode'
}

export function ProfileContactDialog(props: ProfileContactDialogProps) {
  const { t } = useTranslation()
  const [values, setValues] = useState<ContactFormValues>(initialValues)
  const [codeStates, setCodeStates] = useState<ContactCodeStates>(initialCodeStates)
  const [errors, setErrors] = useState<ContactErrors>({})
  const [saving, setSaving] = useState(false)

  const isBound = props.currentContact.bound
  const providerLabel = props.provider === 'phone' ? t('profile.contact.phone') : t('profile.contact.email')
  const title = props.provider === 'phone'
    ? t(isBound ? 'profile.contact.dialogPhoneChange' : 'profile.contact.dialogPhoneBind')
    : t(isBound ? 'profile.contact.dialogEmailChange' : 'profile.contact.dialogEmailBind')

  useEffect(() => {
    if (!props.visible) return
    setValues(initialValues())
    setCodeStates(initialCodeStates())
    setErrors({})
    setSaving(false)
  }, [props.visible, props.provider, props.currentContact.bound])

  useEffect(() => {
    if (!props.visible || CONTACT_PURPOSES.every((purpose) => codeStates[purpose].retryAfter <= 0)) return
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
  }, [codeStates, props.visible])

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
    if (!isValidVerificationCode(values.newCode)) nextErrors.newCode = t('profile.contact.codeInvalid', { count: PROFILE_VERIFICATION_CODE_LENGTH })
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function sendCode(purpose: ContactPurpose): Promise<void> {
    const field = destinationField(purpose)
    const error = contactDestinationError(values[field])
    if (error) {
      setErrors((previous) => ({ ...previous, [field]: error }))
      return
    }
    if (!props.accessToken) {
      props.onAuthFailure()
      return
    }
    setCodeStates((previous) => ({ ...previous, [purpose]: { ...previous[purpose], loading: true } }))
    try {
      const result = await sendProfileContactCode(props.accessToken, {
        provider_code: props.provider,
        purpose,
        destination: values[field].trim(),
        locale: props.locale,
      })
      const retryAfter = Number.isFinite(result.retry_after_seconds) && result.retry_after_seconds > 0
        ? Math.ceil(result.retry_after_seconds)
        : PROFILE_DEFAULT_RETRY_SECONDS
      setCodeStates((previous) => ({
        ...previous,
        [purpose]: { loading: false, retryAfter, destinationMasked: result.destination_masked },
      }))
      Toast.success(t('profile.contact.codeSent', { destination: result.destination_masked }))
    } catch (error) {
      if (isAuthenticationFailure(error)) props.onAuthFailure()
      else Toast.error(getProfileErrorMessage(error))
      setCodeStates((previous) => ({ ...previous, [purpose]: { ...previous[purpose], loading: false } }))
    }
  }

  async function saveContact(): Promise<void> {
    if (!validateForm()) return
    if (!props.accessToken) {
      props.onAuthFailure()
      return
    }
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
      Toast.success(t('profile.contact.saved'))
      props.onSaved(profile)
    } catch (error) {
      if (isAuthenticationFailure(error)) props.onAuthFailure()
      else Toast.error(getProfileErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  function renderCodeControl(purpose: ContactPurpose): React.ReactNode {
    const field = codeField(purpose)
    const state = codeStates[purpose]
    const label = purpose === 'current' ? t('profile.contact.currentCode') : t('profile.contact.newCode')
    const sendLabel = purpose === 'current' ? t('profile.contact.sendCurrent') : t('profile.contact.sendNew')
    const destinationMasked = state.destinationMasked ? ` · ${state.destinationMasked}` : ''
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
          disabled={state.loading || state.retryAfter > 0}
          onClick={() => { void sendCode(purpose) }}
        >
          {state.retryAfter > 0 ? t('profile.contact.retryAfter', { seconds: state.retryAfter }) : sendLabel}
        </Button>
        {destinationMasked ? <span className="profile-code-destination">{destinationMasked}</span> : null}
      </div>
    )
  }

  return (
    <Modal
      title={title}
      visible={props.visible}
      width={560}
      maskClosable={!saving}
      closable={!saving}
      footer={
        <div className="profile-dialog-footer">
          <Button className="profile-secondary-button" theme="outline" disabled={saving} onClick={props.onCancel}>{t('profile.contact.cancel')}</Button>
          <Button className="profile-primary-button" theme="solid" type="primary" loading={saving} onClick={() => { void saveContact() }}>{t('profile.contact.save')}</Button>
        </div>
      }
      onCancel={props.onCancel}
    >
      <div className="profile-contact-dialog">
        <p className="profile-dialog-intro">{providerLabel}</p>
        {isBound ? (
          <section className="profile-dialog-group">
            <label className="profile-field" htmlFor={`profile-${props.provider}-current-destination`}>
              <span>{t('profile.contact.currentDestination')}</span>
              <Input
                id={`profile-${props.provider}-current-destination`}
                value={values.currentDestination}
                onChange={(value) => updateValue('currentDestination', value)}
                placeholder={t('profile.contact.currentDestinationPlaceholder')}
                aria-invalid={Boolean(errors.currentDestination)}
                aria-describedby={errors.currentDestination ? `profile-${props.provider}-current-destination-error` : undefined}
              />
              {errors.currentDestination ? <small className="profile-field-error" id={`profile-${props.provider}-current-destination-error`}>{errors.currentDestination}</small> : <small>{t('profile.contact.currentDestinationHint')}</small>}
            </label>
            {renderCodeControl('current')}
          </section>
        ) : null}
        <section className="profile-dialog-group">
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
