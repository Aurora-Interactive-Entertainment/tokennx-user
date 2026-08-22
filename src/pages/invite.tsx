import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { IconShieldStroked } from '@douyinfe/semi-icons'
import { PublicLayout } from '@/components/common'
import { recordInvitationVisit } from '@/api/invitation'

export function InviteLandingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inviteCode = searchParams.get('invite_code')?.trim() ?? ''
  const [error, setError] = useState('')

  async function visit(): Promise<void> {
    if (!inviteCode) { setError(t('console.join.missingToken')); return }
    setError('')
    try {
      await recordInvitationVisit(inviteCode)
      navigate(`/?invite_code=${encodeURIComponent(inviteCode)}`, { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('console.join.openFailed'))
    }
  }

  useEffect(() => { void visit() }, [inviteCode])
  return <PublicLayout mainClassName="public-page public-invitation-page"><div className="public-invitation-shell"><section className="public-invitation-empty" role={error ? 'alert' : 'status'}><IconShieldStroked aria-hidden="true" /><div><strong>{error || t('console.join.loading')}</strong>{error ? <button className="btn btn-primary" type="button" onClick={() => { void visit() }}>{t('console.common.retry')}</button> : null}</div></section></div></PublicLayout>
}
