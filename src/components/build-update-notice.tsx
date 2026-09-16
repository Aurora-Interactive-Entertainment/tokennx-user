import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import './build-update-notice.css'

export function BuildUpdateNotice() {
  const { pathname, search } = useLocation()
  const { t } = useTranslation()
  const [version, setVersion] = useState('')
  const [dismissedVersion, setDismissedVersion] = useState('')

  useEffect(() => {
    const sync = () => setVersion(window.__TOKEN_NX_UPDATE_GUARD__?.pendingVersion ?? '')
    window.addEventListener('token-nx:update-available', sync)
    sync()
    return () => window.removeEventListener('token-nx:update-available', sync)
  }, [])

  useEffect(() => {
    // 站内跳转不会重新执行 HTML，统一通知守卫检查，包括页脚协议入口。
    void window.__TOKEN_NX_UPDATE_GUARD__?.routeChanged()
  }, [pathname, search])

  if (!version || dismissedVersion === version) return null
  return (
    <aside className="build-update-notice" aria-label={t('appUpdate.title')}>
      <div role="status">
        <strong>{t('appUpdate.title')}</strong>
        <p>{t('appUpdate.description')}</p>
      </div>
      <div className="build-update-notice__actions">
        <Button onClick={() => setDismissedVersion(version)}>{t('appUpdate.later')}</Button>
        <Button theme="solid" type="primary" onClick={() => window.__TOKEN_NX_UPDATE_GUARD__?.reload()}>
          {t('appUpdate.refresh')}
        </Button>
      </div>
    </aside>
  )
}
