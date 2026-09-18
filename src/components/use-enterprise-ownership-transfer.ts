import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isApiError } from '@/api/http'
import { getAccessToken } from '@/auth/token-storage'
import { getUserProfile, isValidContactDestination, isValidVerificationCode, type ContactProvider, type UserProfile } from '@/api/profile'
import { sendEnterpriseOwnershipTransferCode, transferEnterpriseOwnership, type EnterpriseContext, type EnterpriseMember, type EnterpriseOwnershipTransferInput, type EnterpriseOwnershipTransferResult } from '@/api/enterprise-console'
import { useEnterpriseErrorHandler } from '@/pages/enterprise-console-shared'
import { appToast } from './app-toast'

export type EnterpriseOwnershipTransferProps = {
  /** 弹窗可见性由外层控制，关闭时保留实例交给 Semi 播放退场动效。 */
  visible: boolean
  context: EnterpriseContext
  members: EnterpriseMember[]
  /** 卡片预取的当前用户资料；缺失时弹窗自行读取。 */
  initialProfile?: UserProfile | null
  onClose: () => void
  onTransferred: (result: EnterpriseOwnershipTransferResult) => void
  onRefresh: () => Promise<void>
}

type SentCode = { provider: ContactProvider; destination: string }
type Attempt = { fingerprint: string; key: string; input: EnterpriseOwnershipTransferInput }

export function useEnterpriseOwnershipTransfer({ visible, context, members, initialProfile, onTransferred, onRefresh }: EnterpriseOwnershipTransferProps) {
  const { t } = useTranslation()
  const handleError = useEnterpriseErrorHandler()
  const [profile, setProfile] = useState<UserProfile | null>(initialProfile ?? null)
  const [profileLoading, setProfileLoading] = useState(!initialProfile)
  const [profileRevision, setProfileRevision] = useState(0)
  // 预取资料已知手机未绑定时直接落到邮箱，与接口返回后的默认项保持一致。
  const [provider, setProvider] = useState<ContactProvider>(initialProfile && !initialProfile.phone.bound ? 'email' : 'phone')
  const [destination, setDestination] = useState('')
  const [code, setCode] = useState('')
  const [targetId, setTargetId] = useState('')
  const [validatedFields, setValidatedFields] = useState({ target: false, contact: false, code: false })
  const [sentCode, setSentCode] = useState<SentCode | null>(null)
  const [retryAt, setRetryAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [refreshNeeded, setRefreshNeeded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const sendingRef = useRef(false)
  const savingRef = useRef(false)
  const lastSubmitAt = useRef<number | null>(null)
  const attemptRef = useRef<Attempt | null>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  // 弹窗关闭只为播放退场动效而保留实例，因此每次打开都要手动回到初始表单，避免残留上一轮的目标与验证码。
  useEffect(() => {
    if (!visible) return
    setTargetId(''); setDestination(''); setCode(''); setSentCode(null)
    setValidatedFields({ target: false, contact: false, code: false })
    setRetryAt(0); setRefreshNeeded(false)
    attemptRef.current = null; lastSubmitAt.current = null
  }, [visible])

  const reportError = (reason: unknown, prefix = '') => {
    const result = handleError(reason)
    if (result && alive.current) appToast.error(`${prefix}${result.message}${result.requestId ? ` (${result.requestId})` : ''}`)
  }
  useEffect(() => {
    // 已由卡片预取资料时直接复用，避免弹窗首帧把确认按钮渲染成禁用态再跳变为可用。
    if (!profileRevision && initialProfile) return
    let active = true
    setProfileLoading(true)
    getUserProfile(getAccessToken() ?? '').then((result) => {
      if (!active) return
      setProfile(result)
      setProvider(result.phone.bound ? 'phone' : 'email')
    }).catch((reason: unknown) => {
      if (!active) return
      const failure = handleError(reason)
      if (failure) appToast.error(failure.message)
    }).finally(() => { if (active) setProfileLoading(false) })
    return () => { active = false }
  }, [handleError, initialProfile, profileRevision])
  useEffect(() => {
    if (!retryAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [retryAt])

  const targets = members.filter((member) => member.status === 'active' && member.id !== context.member_id && member.role !== 'owner' && !member.roles.includes('owner'))
  const target = targets.find((member) => member.id === targetId)
  const canTransfer = context.capabilities.can_transfer_ownership === true && (context.role === 'owner' || context.roles.includes('owner'))
  const retryAfter = Math.max(0, Math.ceil((retryAt - now) / 1000))
  const bound = Boolean(profile?.[provider].bound)
  const busy = saving || sending || refreshing
  const contactValid = isValidContactDestination(provider, destination.trim())
  const targetError = validatedFields.target && !target ? t('console.ownershipTransfer.targetRequired') : ''
  const contactError = validatedFields.contact && !contactValid
    ? t(`console.ownershipTransfer.${destination.trim() ? 'contactInvalid' : 'contactRequired'}`, { provider: t(`console.ownershipTransfer.${provider}`) })
    : ''
  const codeValid = isValidVerificationCode(code.trim())
  const codeSent = sentCode?.provider === provider && sentCode.destination === destination.trim()
  const codeError = !validatedFields.code ? '' : !code.trim() ? t('console.ownershipTransfer.codeRequired')
    : !codeValid ? t('console.ownershipTransfer.codeInvalid') : !codeSent ? t('console.ownershipTransfer.codeNotSent') : ''

  // 必填字段采用与新建密钥一致的就地校验，接口反馈仍使用顶部提示。
  function validateField(field: 'target' | 'contact' | 'code') {
    setValidatedFields((previous) => ({ ...previous, [field]: true }))
  }

  function changeContact(nextProvider: ContactProvider, value = '') {
    setValidatedFields((previous) => ({ ...previous, contact: nextProvider === provider && previous.contact, code: false }))
    setProvider(nextProvider); setDestination(value); setCode(''); setSentCode(null)
  }

  async function sendCode() {
    if (sendingRef.current || savingRef.current || retryAt > Date.now() || !canTransfer || !bound) return
    const contact = destination.trim()
    validateField('contact')
    if (!contactValid) return
    sendingRef.current = true; setSending(true); setSentCode(null); setCode('')
    setValidatedFields((previous) => ({ ...previous, code: false }))
    try {
      const result = await sendEnterpriseOwnershipTransferCode({ enterprise_id: context.id }, provider === 'phone'
        ? { provider_code: provider, destination: contact, country_code: '+86' }
        : { provider_code: provider, destination: contact })
      if (!alive.current) return
      setSentCode({ provider, destination: contact })
      // 操作反馈统一使用顶部提示，避免发码或校验结果撑高弹窗。
      appToast.success(t('console.ownershipTransfer.sentTo', { destination: result.destination_masked }))
      setNow(Date.now()); setRetryAt(Date.now() + Math.max(0, result.retry_after_seconds) * 1000)
    } catch (reason) {
      if (!alive.current) return
      if (isApiError(reason) && reason.status === 429) { setNow(Date.now()); setRetryAt(Date.now() + 60_000) }
      reportError(reason)
    } finally { sendingRef.current = false; if (alive.current) setSending(false) }
  }

  function prepareTransfer(): Attempt | null {
    if (!canTransfer || !bound) return null
    if (refreshNeeded) { appToast.error(t('console.ownershipTransfer.refreshRequired')); return null }
    // 当前表单就是最终确认入口，三个必填字段一次校验后直接提交。
    setValidatedFields({ target: true, contact: true, code: true })
    if (!target || !contactValid || !codeValid || !codeSent) return null
    // 版本始终保留原始整数精度，缺少并发保护信息时禁止提交。
    const versions = [context.enterprise_version, context.member_version, target.version]
    if (versions.some((version) => (typeof version === 'number' && !Number.isSafeInteger(version)) || !/^[1-9]\d*$/.test(String(version ?? '')))) {
      setRefreshNeeded(true); appToast.error(t('console.ownershipTransfer.versionMissing')); return null
    }
    // 验证码有效性由最终转让接口校验，不因本机时钟偏差或时间字段格式误拦截。
    const input: EnterpriseOwnershipTransferInput = {
      provider_code: provider, destination: destination.trim(), code: code.trim(), target_member_id: target.id,
      enterprise_expected_version: String(context.enterprise_version), current_owner_expected_version: String(context.member_version),
      target_expected_version: String(target.version), confirm: true,
    }
    const fingerprint = JSON.stringify([context.id, input])
    // 网络错误后的相同提交复用幂等键，表单或版本发生变化才生成新键。
    if (attemptRef.current?.fingerprint !== fingerprint) {
      attemptRef.current = { fingerprint, input, key: `ownership-${crypto.randomUUID()}` }
    }
    return attemptRef.current
  }

  async function refresh() {
    if (refreshing) return
    setRefreshing(true)
    try { await onRefresh(); if (alive.current) setRefreshNeeded(false) }
    catch (reason) { reportError(reason) }
    finally { if (alive.current) setRefreshing(false) }
  }

  async function submit() {
    if (savingRef.current || sendingRef.current || busy) return
    const attempt = prepareTransfer()
    if (!attempt) return
    // 首次点击立即提交，800ms 内忽略连点；请求未结束时仍由 savingRef 持续锁定。
    const submittedAt = performance.now()
    if (lastSubmitAt.current !== null && submittedAt - lastSubmitAt.current < 800) return
    lastSubmitAt.current = submittedAt
    savingRef.current = true; setSaving(true)
    let result: EnterpriseOwnershipTransferResult
    try {
      result = await transferEnterpriseOwnership({ enterprise_id: context.id }, attempt.input, attempt.key)
    } catch (reason) {
      if (!alive.current) return
      reportError(reason, isApiError(reason) && reason.status === 409 ? `${t('console.ownershipTransfer.conflict')} ` : '')
      if (isApiError(reason) && (reason.status === 409 || reason.status === 403)) {
        attemptRef.current = null; setRefreshNeeded(true)
        await refresh()
      } else if (isApiError(reason) && [160005, 161001, 161002].includes(reason.code)) {
        attemptRef.current = null; setCode(''); setSentCode(null)
      }
      savingRef.current = false; if (alive.current) setSaving(false)
      return
    }
    // 成功与后续刷新分开处理；刷新失败不能把已完成的转让变成可再次提交的失败。
    onTransferred(result)
  }

  return {
    profile, profileLoading, reloadProfile: () => setProfileRevision((value) => value + 1),
    provider, destination, code, setCode, targetId, setTargetId, targets, canTransfer,
    retryAfter, sending, saving, busy, refreshNeeded, refreshing,
    changeContact, sendCode, submit, refresh,
    targetError, contactError, codeError, validateField,
  }
}
