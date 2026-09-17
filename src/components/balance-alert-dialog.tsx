import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Switch from '@douyinfe/semi-ui/lib/es/switch'
import Modal from '@/components/app-modal'
import { isAuthenticationFailure } from '@/api/http'
import { getAccessToken } from '@/auth/token-storage'
import { getNotificationPreferences, getProfileErrorMessage, getUserProfile, updateNotificationPreferences, type NotificationPreferences } from '@/api/profile'
import { appToast as Toast } from '@/components/app-toast'
import { CompatInput as Input } from '@/components/semi-compat'
import { RequestErrorPanel } from '@/components/request-error-panel'
import './balance-alert-dialog.css'

const NOTIFICATION_THRESHOLD_SCALE = 1_000_000_000

function thresholdNanoToYuan(value: string | number | undefined): string {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return '0.00'
  return (parsed / NOTIFICATION_THRESHOLD_SCALE).toFixed(2)
}

function thresholdYuanToNano(value: string): number | null {
  const parsed = Number(value.trim())
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * NOTIFICATION_THRESHOLD_SCALE)
}

// 余额提醒弹窗在费用页和充值管理页共享同一份通知偏好读写逻辑。
export function BalanceAlertDialog({ visible, onClose, onAuthFailure }: { visible: boolean; onClose: () => void; onAuthFailure: () => void }) {
  const { t } = useTranslation()
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [threshold, setThreshold] = useState('0.00')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const sessionVersion = useRef(0)
  const savingRequest = useRef(false)

  useEffect(() => {
    const version = ++sessionVersion.current
    if (!visible) return
    const accessToken = getAccessToken()
    if (!accessToken) { onAuthFailure(); return }
    // 每次打开都先废弃旧偏好，读取失败时不能把默认值或上次残留值写回。
    setPreferences(null)
    setEmail('')
    setLoadError('')
    setLoading(true)
    setSaving(false)
    savingRequest.current = false
    void Promise.allSettled([getNotificationPreferences(accessToken), getUserProfile(accessToken)]).then(([preferencesResult, profileResult]) => {
      if (version !== sessionVersion.current) return
      const failures = [preferencesResult, profileResult].filter((result) => result.status === 'rejected')
      if (failures.some((result) => isAuthenticationFailure(result.reason))) {
        onAuthFailure()
        return
      }
      if (preferencesResult.status === 'fulfilled') {
        const nextPreferences = preferencesResult.value
        const lowBalance = nextPreferences.items.find((item) => item.code === 'low_balance')
        if (lowBalance) {
          setPreferences(nextPreferences)
          setEnabled(lowBalance.enabled)
          setThreshold(thresholdNanoToYuan(lowBalance.threshold_amount_nano))
        } else {
          // 未返回此配置时无法确认可写值，按暂不可用处理，不推断为默认开启或零阈值。
          const message = t('console.billing.balanceAlertUnavailable')
          setLoadError(message)
          Toast.error(message)
        }
      } else {
        const message = getProfileErrorMessage(preferencesResult.reason)
        setLoadError(message)
        Toast.error(message)
      }
      if (profileResult.status === 'fulfilled') setEmail(profileResult.value.email.masked_identifier)
      else if (preferencesResult.status === 'fulfilled') Toast.error(getProfileErrorMessage(profileResult.reason))
    }).finally(() => { if (version === sessionVersion.current) setLoading(false) })
    return () => { sessionVersion.current++ }
  }, [onAuthFailure, reloadToken, visible])

  async function save(): Promise<void> {
    if (!visible || loading || !preferences || loadError || savingRequest.current) return
    const accessToken = getAccessToken()
    if (!accessToken) { onAuthFailure(); return }
    const thresholdNano = thresholdYuanToNano(threshold)
    if (thresholdNano === null) {
      Toast.error(t('console.billing.balanceAlertThresholdInvalid'))
      return
    }
    const version = sessionVersion.current
    savingRequest.current = true
    setSaving(true)
    try {
      const nextPreferences = await updateNotificationPreferences(accessToken, { low_balance: enabled }, { low_balance: thresholdNano })
      if (version !== sessionVersion.current) return
      setPreferences(nextPreferences)
      Toast.success(t('console.billing.balanceAlertSaved'))
      onClose()
    } catch (error: unknown) {
      if (version !== sessionVersion.current) return
      if (isAuthenticationFailure(error)) {
        onAuthFailure()
        return
      }
      Toast.error(getProfileErrorMessage(error))
    } finally {
      if (version === sessionVersion.current) {
        savingRequest.current = false
        setSaving(false)
      }
    }
  }

  function close(): void {
    if (savingRequest.current) return
    sessionVersion.current++
    onClose()
  }

  const lowBalancePreference = preferences?.items.find((item) => item.code === 'low_balance')
  return <Modal className="balance-alert-modal" visible={visible} title={t('console.billing.balanceAlertTitle')} onCancel={close} onOk={() => void save()} okText={t('console.common.save')} cancelText={t('console.common.cancel')} confirmLoading={saving} closeOnEsc={!saving} maskClosable={!saving} closable={!saving} okButtonProps={{ disabled: loading || !preferences || Boolean(loadError) || saving }} cancelButtonProps={{ disabled: saving }}>
    <div className="balance-alert-dialog-body">
      {loadError ? <RequestErrorPanel message={loadError} onRetry={() => setReloadToken((value) => value + 1)} retrying={loading} /> : null}
      <section className="balance-alert-section">
        <h3>{t('console.billing.balanceAlertLowTitle')}</h3>
        <p>{t('console.billing.balanceAlertLowDescription', { email: email || t('console.billing.balanceAlertEmailFallback') })}</p>
        <div className="balance-alert-switch-row"><Switch checked={enabled} disabled={loading || saving || !lowBalancePreference || lowBalancePreference.mandatory === true} onChange={setEnabled} aria-label={t('console.billing.balanceAlertLowTitle')} /><span>{enabled ? t('console.billing.balanceAlertEnabled') : t('console.billing.balanceAlertDisabled')}</span></div>
      </section>
      <section className="balance-alert-section balance-alert-threshold-section">
        <h3>{t('console.billing.balanceAlertThresholdTitle')}</h3>
        <p>{t('console.billing.balanceAlertThresholdDescription')}</p>
        <Input className="balance-alert-threshold-input" prefix="¥" value={threshold} disabled={loading || saving || !enabled || !lowBalancePreference || lowBalancePreference.threshold_supported === false} onChange={setThreshold} inputMode="decimal" aria-label={t('console.billing.balanceAlertThresholdTitle')} />
      </section>
    </div>
  </Modal>
}
