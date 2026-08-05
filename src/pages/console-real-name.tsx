import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Button } from '@douyinfe/semi-ui'
import { BannerNotice, PageTitle } from '@/components/common'
import { CompatInput as Input } from '@/components/semi-compat'
import { getAccessToken } from '@/auth/token-storage'
import { isAuthenticationFailure } from '@/api/http'
import { getRealNameErrorMessage, getRealNameProfile, submitRealName, type RealNameProfile, type SubmitRealNameRequest } from '@/api/real-name'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'
import i18n from '@/i18n'

const REAL_NAME_NAME_MAX_LENGTH = 30
const REAL_NAME_ID_NUMBER_MIN_LENGTH = 6
const REAL_NAME_ID_NUMBER_MAX_LENGTH = 20

export const REAL_NAME_ID_TYPES = [
  { value: 'id-card', labelKey: 'console.realName.mainlandId' },
  { value: 'hk-macao-pass', labelKey: 'console.realName.hkMacaoPass' },
  { value: 'taiwan-pass', labelKey: 'console.realName.taiwanPass' },
  { value: 'hk-macao-residence', labelKey: 'console.realName.hkMacaoResidence' },
  { value: 'taiwan-residence', labelKey: 'console.realName.taiwanResidence' },
  { value: 'foreign-permit', labelKey: 'console.realName.foreignPermit' },
  { value: 'other', labelKey: 'console.realName.otherId' },
] as const

export interface RealNameFormInput {
  name: string
  idType: string
  idNumber: string
  consent: boolean
}

export type RealNameField = 'name' | 'idNumber' | 'consent'
export type RealNameValidationErrors = Partial<Record<RealNameField, string>>

// 中文：前端只做交互前校验，敏感字段的最终校验和保护由后端统一完成。
export function validateRealNameForm(input: RealNameFormInput): RealNameValidationErrors {
  const errors: RealNameValidationErrors = {}
  const name = input.name.trim()
  const idNumber = input.idNumber.trim()
  if (!name) errors.name = i18n.t('console.realName.nameRequired')
  else if (Array.from(name).length > REAL_NAME_NAME_MAX_LENGTH) errors.name = i18n.t('console.realName.nameTooLong', { count: REAL_NAME_NAME_MAX_LENGTH })
  if (!idNumber) errors.idNumber = i18n.t('console.realName.numberRequired')
  else if (idNumber.length < REAL_NAME_ID_NUMBER_MIN_LENGTH || idNumber.length > REAL_NAME_ID_NUMBER_MAX_LENGTH || !/^[0-9A-Za-z-]+$/.test(idNumber)) errors.idNumber = i18n.t('console.realName.numberInvalid')
  if (!input.consent) errors.consent = i18n.t('console.realName.consentRequired')
  return errors
}

function isVerified(profile: RealNameProfile | null): boolean {
  return profile?.status === 'verified'
}

function realNameVerificationLabel(profile: RealNameProfile): string {
  return profile.verification_level === 'test' ? i18n.t('console.realName.testVerification') : i18n.t('console.realName.identityVerification')
}

export function RealNamePage() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<RealNameProfile | null>(null)
  const [name, setName] = useState('')
  const [idType, setIDType] = useState<string>(REAL_NAME_ID_TYPES[0].value)
  const [idNumber, setIDNumber] = useState('')
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<RealNameValidationErrors>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const invalidateSession = useCallback((): void => {
    dispatch(invalidateAuth())
    navigate('/', { replace: true })
  }, [dispatch, navigate])

  const loadProfile = useCallback(async (): Promise<void> => {
    const accessToken = getAccessToken()
    if (!accessToken) {
      invalidateSession()
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      setProfile(await getRealNameProfile(accessToken))
    } catch (requestError) {
      if (isAuthenticationFailure(requestError)) {
        invalidateSession()
      } else {
        setError(getRealNameErrorMessage(requestError))
      }
    } finally {
      setLoading(false)
    }
  }, [invalidateSession])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const nextErrors = validateRealNameForm({ name, idType, idNumber, consent })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    const accessToken = getAccessToken()
    if (!accessToken) {
      invalidateSession()
      return
    }
    const request: SubmitRealNameRequest = { name: name.trim(), id_type: idType, id_number: idNumber.trim(), consent }
    setSubmitting(true)
    setError('')
    void submitRealName(accessToken, request).then((nextProfile) => {
      setProfile(nextProfile)
    }).catch((requestError: unknown) => {
      if (isAuthenticationFailure(requestError)) {
        invalidateSession()
        return
      }
      setError(getRealNameErrorMessage(requestError))
    }).finally(() => {
      setSubmitting(false)
    })
  }

  if (loading && !profile) {
    return <div className="page-stack real-name-console-page">
      <PageTitle title={t('console.realName.title')} description={t('console.realName.pageDescription')} />
      <div className="profile-state-panel" role="status">{t('console.realName.loading')}</div>
    </div>
  }

  const verified = isVerified(profile)
  return <div className="page-stack real-name-console-page">
    <PageTitle title={t('console.realName.title')} description={t('console.realName.pageDescription')} />
    {error ? <BannerNotice tone="warning"><div className="profile-error-content"><strong>{error}</strong><Button theme="outline" size="small" loading={loading} disabled={loading} onClick={() => { void loadProfile() }}>{t('console.realName.refresh')}</Button></div></BannerNotice> : null}
    <section className="real-name-card" aria-labelledby="real-name-title">
      <BannerNotice tone={verified ? 'success' : 'warning'}>
        <strong id="real-name-title">{verified ? t('console.realName.completed') : t('console.realName.personalOnly')}</strong>
        <span>{verified ? t('console.realName.completedHint') : t('console.realName.legalHint')}</span>
      </BannerNotice>
      {verified && profile ? <div className="real-name-status" aria-label={t('console.realName.title')}>
        <div className="real-name-status-row"><span>{t('console.realName.verificationMethod')}</span><strong>{t('console.realName.currentMethod', { method: realNameVerificationLabel(profile) })}</strong></div>
        <div className="real-name-status-row"><span>{t('console.realName.idNumber')}</span><strong>{profile.masked_id_number || t('console.realName.protected')}</strong></div>
      </div> : null}
      <form className="real-name-form" onSubmit={submit} noValidate>
        <label className="real-name-field" htmlFor="real-name">
          <span>{t('console.realName.realName')}</span>
          <Input id="real-name" value={name} onChange={setName} maxLength={REAL_NAME_NAME_MAX_LENGTH} placeholder={t('console.realName.realNamePlaceholder')} aria-invalid={Boolean(errors.name)} />
          {errors.name ? <span className="field-error" role="alert">{errors.name}</span> : null}
        </label>
        <label className="real-name-field" htmlFor="real-name-type">
          <span>{t('console.realName.idType')}</span>
          <select className="source-input real-name-select" id="real-name-type" value={idType} onChange={(event) => setIDType(event.target.value)}>
            {REAL_NAME_ID_TYPES.map((item) => <option value={item.value} key={item.value}>{t(item.labelKey)}</option>)}
          </select>
        </label>
        <label className="real-name-field" htmlFor="real-name-number">
          <span>{t('console.realName.idNumber')}</span>
          <Input id="real-name-number" value={idNumber} onChange={setIDNumber} maxLength={REAL_NAME_ID_NUMBER_MAX_LENGTH} placeholder={t('console.realName.idNumberPlaceholder')} aria-invalid={Boolean(errors.idNumber)} />
          {errors.idNumber ? <span className="field-error" role="alert">{errors.idNumber}</span> : null}
        </label>
        <label className="real-name-consent" htmlFor="real-name-consent">
          <input id="real-name-consent" type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); if (event.target.checked) setErrors((previous) => ({ ...previous, consent: undefined })) }} />
          <span>{t('console.realName.consent')}</span>
        </label>
        {errors.consent ? <span className="field-error" role="alert">{errors.consent}</span> : null}
        <Button className="real-name-submit" htmlType="submit" theme="solid" type="primary" loading={submitting} disabled={!consent || submitting}>{verified ? t('console.realName.update') : t('console.realName.submit')}</Button>
      </form>
      <p className="real-name-demo-note">{t('console.realName.demoNote')}</p>
    </section>
  </div>
}
