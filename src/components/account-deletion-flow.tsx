import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Modal from '@/components/app-modal'
import { isApiError, isAuthenticationFailure } from '@/api/http'
import { getAccessToken, getVerifiedPhone, clearAuthTokens } from '@/auth/token-storage'
import {
  getAccountDeletionPrecheck,
  getProfileEnterprises,
  getProfileErrorMessage,
  isValidContactDestination,
  isValidVerificationCode,
  requestAccountDeletion,
  sendProfileContactCode,
  type AccountDeletionPrecheck,
  type ContactProvider,
  type EnterpriseMembership,
  type UserProfile,
} from '@/api/profile'
import { appToast } from '@/components/app-toast'
import { PROFILE_DEFAULT_RETRY_SECONDS, PROFILE_PHONE_COUNTRY_CODE } from '@/api/profile'
import { AccountDeletionDialog } from './account-deletion-dialog'
import './account-deletion-flow.css'

type AccountDeletionFlowProps = {
  visible: boolean
  profile: UserProfile | null
  enterprises: EnterpriseMembership[]
  onClose: () => void
  onAuthFailure: () => void
  onHandleEnterprise: (enterpriseID: string) => void
  onSuccess: () => void
  t: TFunction
}

type FlowStep = 'checking' | 'confirm' | 'enterprise' | 'contact'

function getEnterpriseCode(name: string, memberships: EnterpriseMembership[]): string {
  return memberships.find((item) => item.enterprise_name === name)?.enterprise_code || ''
}

export function AccountDeletionFlow({ visible, profile, enterprises, onClose, onAuthFailure, onHandleEnterprise, onSuccess, t }: AccountDeletionFlowProps) {
  const [step, setStep] = useState<FlowStep>('checking')
  const [precheck, setPrecheck] = useState<AccountDeletionPrecheck | null>(null)
  const [ownerMemberships, setOwnerMemberships] = useState<EnterpriseMembership[]>(enterprises)
  const [checking, setChecking] = useState(false)
  const [provider, setProvider] = useState<ContactProvider>('phone')
  const [destination, setDestination] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [retryAfter, setRetryAfter] = useState(0)
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const phoneBound = Boolean(profile?.phone.bound)
  const emailBound = Boolean(profile?.email.bound)
  const availableProviders = useMemo<ContactProvider[]>(() => [
    ...(phoneBound ? ['phone' as const] : []),
    ...(emailBound ? ['email' as const] : []),
  ], [emailBound, phoneBound])

  const checkBeforeDeletion = useCallback(async (): Promise<void> => {
    const accessToken = getAccessToken()
    if (!accessToken) {
      onAuthFailure()
      return
    }
    setChecking(true)
    try {
      let membershipResult: EnterpriseMembership[] | null = null
      let result: AccountDeletionPrecheck
      try {
        result = await getAccountDeletionPrecheck(accessToken)
      } catch (error) {
        // 中文：部分旧版后端尚未发布 precheck 路由，使用企业关系接口完成同等阻断判断，避免用户被 404 卡死。
        if (!isApiError(error) || error.status !== 404) throw error
        membershipResult = await getProfileEnterprises(accessToken).catch(() => enterprises)
        const ownerEnterprises = membershipResult.filter((item) => item.owner && item.member_status !== 'closed').map((item) => item.enterprise_name)
        result = {
          can_request: ownerEnterprises.length === 0,
          owner_enterprises: ownerEnterprises,
          member_count: membershipResult.length,
          balance_policy: 'paid_balance_non_refundable',
        }
        setOwnerMemberships(membershipResult.filter((item) => item.owner))
      }
      // 中文：检查通过后再读取企业关系，用于展示企业统一社会信用代码；失败时不阻断注销主流程。
      if (!membershipResult) membershipResult = await getProfileEnterprises(accessToken).catch(() => enterprises)
      setOwnerMemberships(membershipResult.filter((item) => item.owner))
      setPrecheck(result)
      if (result.owner_enterprises.length > 0) setStep('enterprise')
      else if (result.can_request) setStep('confirm')
      else appToast.error(t('api.profile.accountDeletionConflict'))
    } catch (error: unknown) {
      if (isAuthenticationFailure(error)) onAuthFailure()
      else appToast.error(getProfileErrorMessage(error))
    } finally {
      setChecking(false)
    }
  }, [enterprises, onAuthFailure, t])

  useEffect(() => {
    if (!visible) return
    setStep('checking')
    setPrecheck(null)
    setChecking(false)
    setCode('')
    setCodeSent(false)
    setRetryAfter(0)
    setSubmitting(false)
    const savedPhone = profile?.id ? getVerifiedPhone(profile.id) : null
    setProvider(savedPhone && phoneBound ? 'phone' : availableProviders[0] ?? 'phone')
    setDestination(savedPhone && phoneBound ? savedPhone : '')
    void checkBeforeDeletion()
  }, [availableProviders, checkBeforeDeletion, phoneBound, profile?.id, visible])

  useEffect(() => {
    if (retryAfter <= 0) return
    const timer = window.setInterval(() => setRetryAfter((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [retryAfter])

  function closeFlow(): void {
    if (checking || sending || submitting) return
    setStep('checking')
    onClose()
  }

  async function sendCode(): Promise<void> {
    const accessToken = getAccessToken()
    const normalizedDestination = destination.trim()
    if (!accessToken) return onAuthFailure()
    if (!isValidContactDestination(provider, normalizedDestination)) {
      appToast.error(provider === 'phone' ? t('profile.contact.phoneInvalid') : t('profile.contact.emailInvalid'))
      return
    }
    if (sending || retryAfter > 0) return
    setSending(true)
    try {
      await sendProfileContactCode(accessToken, {
        provider_code: provider,
        purpose: 'current',
        destination: normalizedDestination,
        ...(provider === 'phone' ? { country_code: PROFILE_PHONE_COUNTRY_CODE } : {}),
      })
      setCodeSent(true)
      setRetryAfter(PROFILE_DEFAULT_RETRY_SECONDS)
      appToast.success(t('profile.security.deleteContactCodeSent'))
    } catch (error: unknown) {
      if (isAuthenticationFailure(error)) onAuthFailure()
      else appToast.error(getProfileErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  async function submitDeletion(): Promise<void> {
    const accessToken = getAccessToken()
    if (!accessToken) return onAuthFailure()
    if (!isValidContactDestination(provider, destination) || !isValidVerificationCode(code)) {
      appToast.error(t('profile.security.deleteContactCodeInvalid'))
      return
    }
    setSubmitting(true)
    try {
      await requestAccountDeletion(accessToken, { confirm: true, provider_code: provider, destination: destination.trim(), code: code.trim() })
      // 中文：只有服务端返回成功后才清理令牌，避免网络超时造成不可重试的误判。
      clearAuthTokens({ force: true })
      appToast.success(t('profile.security.deleteSuccess'))
      onSuccess()
    } catch (error: unknown) {
      if (isAuthenticationFailure(error)) onAuthFailure()
      else appToast.error(getProfileErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const enterpriseNames = precheck?.owner_enterprises ?? []
  const contactLabel = provider === 'phone' ? t('profile.security.deleteContactProviderPhone') : t('profile.security.deleteContactProviderEmail')
  if (!visible) return null

  // 中文：每次只挂载当前步骤的一个弹窗，避免旧弹窗退出动画与新弹窗进入动画叠加造成抖动。
  // 中文：前置检查期间不再显示中间加载弹窗，避免从账户设置弹窗切换时产生闪烁。
  if (step === 'checking') return null

  if (step === 'confirm') return <AccountDeletionDialog
    visible
    onCancel={closeFlow}
    onConfirm={() => setStep('contact')}
    title={t('profile.security.deleteDialogTitle')}
    description={t('profile.security.deleteDialogDescription')}
    consequences={[
      t('profile.security.deleteDialogApiKeys'),
      t('profile.security.deleteDialogSessions'),
      t('profile.security.deleteDialogBalance'),
      t('profile.security.deleteDialogSubscription'),
      t('profile.security.deleteDialogCooldown'),
    ]}
    confirmationLabel={t('profile.security.deleteDialogConfirmation')}
    confirmationPlaceholder={t('profile.security.deleteDialogPlaceholder')}
    confirmText={t('profile.security.deleteDialogConfirm')}
    cancelText={t('profile.security.dialogCancel')}
  />

  if (step === 'enterprise') return <Modal className="account-deletion-enterprise-dialog" zIndex={2000} getPopupContainer={() => document.body} visible title={t('profile.security.deletePrecheckTitle')} aria-label={t('profile.security.deletePrecheckTitle')} onCancel={closeFlow} footer={<div className="account-deletion-enterprise-footer"><Button theme="solid" type="tertiary" className="account-deletion-enterprise-cancel" onClick={closeFlow}>{t('profile.security.deletePrecheckCancel')}</Button><Button theme="solid" type="primary" onClick={() => onHandleEnterprise(ownerMemberships.find((item) => item.enterprise_name === enterpriseNames[0])?.enterprise_id ?? '')}>{t('profile.security.deletePrecheckHandle')}</Button></div>}>
    <div className="account-deletion-enterprise-body">
      <p className="account-deletion-enterprise-warning"><span aria-hidden="true">!</span>{t('profile.security.deletePrecheckDescription')}</p>
      <h3>{t('profile.security.deletePrecheckEnterprises', { count: enterpriseNames.length })}</h3>
      <div className="account-deletion-enterprise-list">
        {enterpriseNames.map((name) => {
          const membership = ownerMemberships.find((item) => item.enterprise_name === name)
          return <div className="account-deletion-enterprise-item" key={`${name}-${membership?.enterprise_id ?? ''}`}><span className="account-deletion-enterprise-avatar">{name.slice(0, 1)}</span><div><strong>{name}</strong><small>{t('profile.security.deletePrecheckEnterpriseCode', { code: getEnterpriseCode(name, ownerMemberships) || '--' })}</small></div></div>
        })}
      </div>
    </div>
  </Modal>

  return <Modal className="account-deletion-contact-dialog" zIndex={2000} getPopupContainer={() => document.body} visible title={t('profile.security.deleteContactTitle')} aria-label={t('profile.security.deleteContactTitle')} onCancel={closeFlow} onOk={() => void submitDeletion()} okText={t('profile.security.deleteContactSubmit')} cancelText={t('profile.security.deletePrecheckCancel')} confirmLoading={submitting}>
      <div className="account-deletion-contact-body">
        <p>{t('profile.security.deleteContactDescription')}</p>
        {availableProviders.length > 1 ? <div className="account-deletion-provider-switch" role="tablist" aria-label={t('profile.security.deleteContactTitle')}>
          {availableProviders.map((item) => <button type="button" role="tab" aria-selected={provider === item} className={provider === item ? 'is-active' : ''} key={item} onClick={() => { setProvider(item); setDestination(''); setCode(''); setCodeSent(false) }}>{item === 'phone' ? t('profile.security.deleteContactProviderPhone') : t('profile.security.deleteContactProviderEmail')}</button>)}
        </div> : null}
        <label>{contactLabel}<input value={destination} disabled={sending || submitting} onChange={(event) => setDestination(event.target.value)} autoComplete="off" inputMode={provider === 'phone' ? 'tel' : 'email'} /></label>
        <div className="account-deletion-code-row"><label>{t('profile.security.deleteContactCode')}<input value={code} disabled={!codeSent || submitting} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder={t('profile.security.deleteContactCodePlaceholder')} /></label><Button theme="outline" size="small" loading={sending} disabled={sending || submitting || retryAfter > 0} onClick={() => void sendCode()}>{retryAfter > 0 ? t('profile.security.deleteContactResend', { seconds: retryAfter }) : t('profile.security.deleteContactSend')}</Button></div>
        {codeSent ? <p className="account-deletion-contact-sent">{t('profile.security.deleteContactDestination', { destination: destination.trim() })}</p> : null}
      </div>
  </Modal>
}
