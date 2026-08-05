import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { IconArrowRight, IconCheckCircleStroked, IconSend, IconShieldStroked, IconUserGroup } from '@douyinfe/semi-icons'
import { LoginPanel, PublicLayout } from '@/components/common'
import { getAccessToken } from '@/auth/token-storage'
import { useAppSelector } from '@/store/hooks'
import { getInvitationPreview, getEnterpriseErrorMessage, getEnterpriseRequestId, submitInvitationJoin, type EnterpriseInvitationPreview } from '@/api/enterprise-console'
import { isApiError } from '@/api/http'
import i18n from '@/i18n'
import { formatEnterpriseNumber, formatEnterpriseTime, invitationStatusLabel } from './enterprise-console-shared'

type InvitationPageError = {
  message: string
  requestId: string | null
}

const INVITATION_INVALID_ERROR_CODE = 140007
const INVITATION_REQUEST_MESSAGE_MAX_LENGTH = 1000

function invitationStatusClass(status: string): string {
  if (status === 'active') return 'is-active'
  if (status === 'expired' || status === 'exhausted') return 'is-expired'
  if (status === 'revoked' || status === 'disabled') return 'is-revoked'
  return 'is-unknown'
}

function invitationStatusDescription(status: string): string {
  if (status === 'expired') return i18n.t('console.join.expiredHint')
  if (status === 'exhausted') return i18n.t('console.join.exhaustedHint')
  if (status === 'revoked' || status === 'disabled') return i18n.t('console.join.revokedHint')
  return i18n.t('console.join.statusUnavailable')
}

function invitationError(reason: unknown): InvitationPageError {
  if (isApiError(reason) && reason.code === INVITATION_INVALID_ERROR_CODE) {
    return { message: i18n.t('console.join.invalid'), requestId: reason.requestId }
  }
  return { message: getEnterpriseErrorMessage(reason), requestId: getEnterpriseRequestId(reason) }
}

function InvitationFacts({ preview }: { preview: EnterpriseInvitationPreview }) {
  const { t } = useTranslation()
  return <dl className="public-invitation-facts"><div><dt>{t('console.join.inviteRole')}</dt><dd>{preview.role_name || preview.role || t('console.join.enterpriseMember')}</dd></div><div><dt>{t('console.join.inviter')}</dt><dd>{preview.inviter_name || t('console.join.enterpriseMember')}</dd></div><div><dt>{t('console.join.validUntil')}</dt><dd>{preview.expires_at ? formatEnterpriseTime(preview.expires_at) : t('console.join.forever')}</dd></div><div><dt>{t('console.join.uses')}</dt><dd>{formatEnterpriseNumber(preview.used_count)} / {formatEnterpriseNumber(preview.max_uses)}</dd></div></dl>
}

function InvitationStatusPanel({ preview }: { preview: EnterpriseInvitationPreview }) {
  const { t } = useTranslation()
  const title = preview.already_member ? t('console.join.alreadyMember') : preview.pending_request ? t('console.join.requestSubmitted') : invitationStatusLabel(preview.status)
  const description = preview.already_member
    ? t('console.join.alreadyMemberHint')
    : preview.pending_request
      ? t('console.join.requestSubmittedHint')
      : invitationStatusDescription(preview.status)
  return <section className={`public-invitation-status-panel ${preview.already_member || preview.pending_request ? 'is-success' : invitationStatusClass(preview.status)}`} role="status"><IconCheckCircleStroked aria-hidden="true" /><div><strong>{title}</strong><p>{description}</p></div></section>
}

function InvitationJoinForm({ token, preview, onSubmitted }: { token: string; preview: EnterpriseInvitationPreview; onSubmitted: () => void }) {
  const { t } = useTranslation()
  const [requestMessage, setRequestMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<InvitationPageError | null>(null)

  async function submit(): Promise<void> {
    if (submitting || preview.status !== 'active' || preview.already_member || preview.pending_request) return
    setSubmitting(true)
    setError(null)
    try {
      await submitInvitationJoin({ token, request_message: requestMessage.trim() }, { accessToken: getAccessToken() ?? undefined })
      onSubmitted()
    } catch (reason: unknown) {
      setError(invitationError(reason))
    } finally {
      setSubmitting(false)
    }
  }

  return <section className="public-invitation-action-panel" aria-labelledby="invitationJoinTitle"><div className="public-invitation-section-heading"><span className="public-invitation-section-icon"><IconSend aria-hidden="true" /></span><div><h2 id="invitationJoinTitle">{t('console.join.applyJoin')}</h2><p>{t('console.join.applyJoinHint')}</p></div></div><label className="public-invitation-message-field" htmlFor="invitation-message"><span>{t('console.join.requestMessage')}</span><textarea id="invitation-message" value={requestMessage} maxLength={INVITATION_REQUEST_MESSAGE_MAX_LENGTH} rows={5} placeholder={t('console.join.requestMessagePlaceholder')} onChange={(event) => setRequestMessage(event.target.value)} /></label>{error ? <div className="public-invitation-inline-error" role="alert"><span>{error.message}</span>{error.requestId ? <small>{t('console.common.requestIdValue', { requestId: error.requestId })}</small> : null}</div> : null}<button className="btn btn-primary public-invitation-submit" type="button" disabled={submitting} onClick={() => { void submit() }}>{submitting ? t('console.join.submitting') : t('console.join.submit')}<IconArrowRight aria-hidden="true" /></button></section>
}

export function JoinPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const authStatus = useAppSelector((state) => state.auth.status)
  const token = useMemo(() => searchParams.get('token')?.trim() ?? '', [searchParams])
  const [preview, setPreview] = useState<EnterpriseInvitationPreview | null>(null)
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState<InvitationPageError | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const handleLoginSuccess = useCallback(() => undefined, [])

  useEffect(() => {
    if (!token) {
      setPreview(null)
      setLoading(false)
      setError(null)
      return undefined
    }
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    getInvitationPreview(token, { accessToken: getAccessToken() ?? undefined, signal: controller.signal }).then((result) => {
      if (!active) return
      setPreview(result)
      setSubmitted(false)
    }).catch((reason: unknown) => {
      if (!active || controller.signal.aborted) return
      setPreview(null)
      setError(invitationError(reason))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [authStatus, token])

  function markSubmitted(): void {
    setSubmitted(true)
    setPreview((current) => current ? { ...current, pending_request: true } : current)
  }

  const displayPreview = preview
  return <PublicLayout mainClassName="public-page public-invitation-page"><div className="public-invitation-shell"><header className="public-page-head"><h1>{t('console.join.title')}</h1><p>{t('console.join.description')}</p></header>{!token ? <section className="public-invitation-empty" role="alert"><IconShieldStroked aria-hidden="true" /><div><strong>{t('console.join.missingToken')}</strong><p>{t('console.join.missingTokenHint')}</p></div></section> : loading ? <section className="public-invitation-loading" role="status"><span className="records-loading-spinner" />{t('console.join.loading')}</section> : error ? <section className="public-invitation-empty" role="alert"><IconShieldStroked aria-hidden="true" /><div><strong>{t('console.join.openFailed')}</strong><p>{error.message}</p>{error.requestId ? <small>{t('console.common.requestIdValue', { requestId: error.requestId })}</small> : null}</div></section> : displayPreview ? <div className="public-invitation-grid"><section className="public-invitation-overview" aria-labelledby="invitationOverviewTitle"><div className="public-invitation-enterprise"><span className="public-invitation-enterprise-icon"><IconUserGroup aria-hidden="true" /></span><div><span>{t('console.join.enterpriseWorkspace')}</span><h2 id="invitationOverviewTitle">{displayPreview.enterprise_name || t('console.join.unnamedEnterprise')}</h2><small>{displayPreview.enterprise_code || displayPreview.enterprise_id}</small></div></div><InvitationFacts preview={displayPreview} /><div className="public-invitation-note"><IconShieldStroked aria-hidden="true" /><span>{t('console.join.privacyHint')}</span></div></section>{authStatus === 'authenticated' ? displayPreview.status === 'active' && !displayPreview.already_member && !displayPreview.pending_request && !submitted ? <InvitationJoinForm token={token} preview={displayPreview} onSubmitted={markSubmitted} /> : <InvitationStatusPanel preview={displayPreview} /> : <section className="public-invitation-auth-panel" aria-labelledby="invitationLoginTitle"><div className="public-invitation-section-heading"><span className="public-invitation-section-icon"><IconShieldStroked aria-hidden="true" /></span><div><h2 id="invitationLoginTitle">{t('console.join.loginContinue')}</h2><p>{t('console.join.loginContinueHint')}</p></div></div><LoginPanel onSuccess={handleLoginSuccess} /></section>}</div> : null}</div></PublicLayout>
}
