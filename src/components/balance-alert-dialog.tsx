import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Switch from '@douyinfe/semi-ui/lib/es/switch'
import Modal from '@/components/app-modal'
import { isAuthenticationFailure } from '@/api/http'
import { getAccessToken } from '@/auth/token-storage'
import { getNotificationPreferences, getProfileErrorMessage, getUserProfile, updateNotificationPreferences, type NotificationPreferences } from '@/api/profile'
import { appToast as Toast } from '@/components/app-toast'
import { CompatInput as Input } from '@/components/semi-compat'
import './balance-alert-dialog.css'

const NOTIFICATION_THRESHOLD_SCALE = 1_000_000_000

function thresholdNanoToYuan(value: number | undefined): string {
  if (!Number.isFinite(value) || value === undefined) return '0.00'
  return (value / NOTIFICATION_THRESHOLD_SCALE).toFixed(2)
}

function thresholdYuanToNano(value: string): number | null {
  const parsed = Number(value.trim())
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * NOTIFICATION_THRESHOLD_SCALE)
}

// 中文：余额提醒弹窗在费用页和充值管理页共享同一份通知偏好读写逻辑。
export function BalanceAlertDialog({ visible, onClose, onAuthFailure }: { visible: boolean; onClose: () => void; onAuthFailure: () => void }) {
  const { t } = useTranslation()
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [threshold, setThreshold] = useState('0.00')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!visible) return
    const accessToken = getAccessToken()
    if (!accessToken) return
    setLoading(true)
    void Promise.allSettled([getNotificationPreferences(accessToken), getUserProfile(accessToken)]).then(([preferencesResult, profileResult]) => {
      if (preferencesResult.status === 'fulfilled') {
        const nextPreferences = preferencesResult.value
        setPreferences(nextPreferences)
        const lowBalance = nextPreferences.items.find((item) => item.code === 'low_balance')
        if (lowBalance) {
          setEnabled(lowBalance.enabled)
          setThreshold(thresholdNanoToYuan(lowBalance.threshold_amount_nano))
        }
      } else if (isAuthenticationFailure(preferencesResult.reason)) {
        onAuthFailure()
        return
      } else {
        Toast.error(getProfileErrorMessage(preferencesResult.reason))
      }
      if (profileResult.status === 'fulfilled') setEmail(profileResult.value.email.masked_identifier)
    }).finally(() => setLoading(false))
  }, [onAuthFailure, visible])

  async function save(): Promise<void> {
    const accessToken = getAccessToken()
    const thresholdNano = thresholdYuanToNano(threshold)
    if (!accessToken || thresholdNano === null) {
      Toast.error(t('console.billing.balanceAlertThresholdInvalid'))
      return
    }
    setSaving(true)
    try {
      const nextPreferences = await updateNotificationPreferences(accessToken, { low_balance: enabled }, { low_balance: thresholdNano })
      setPreferences(nextPreferences)
      Toast.success(t('console.billing.balanceAlertSaved'))
      onClose()
    } catch (error: unknown) {
      if (isAuthenticationFailure(error)) {
        onAuthFailure()
        return
      }
      Toast.error(getProfileErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const lowBalancePreference = preferences?.items.find((item) => item.code === 'low_balance')
  return <Modal className="balance-alert-modal" visible={visible} title={t('console.billing.balanceAlertTitle')} onCancel={onClose} onOk={() => void save()} okText={t('console.common.save')} cancelText={t('console.common.cancel')} confirmLoading={saving}>
    <div className="balance-alert-dialog-body">
      <section className="balance-alert-section">
        <h3>{t('console.billing.balanceAlertLowTitle')}</h3>
        <p>{t('console.billing.balanceAlertLowDescription', { email: email || t('console.billing.balanceAlertEmailFallback') })}</p>
        <div className="balance-alert-switch-row"><Switch checked={enabled} disabled={loading || saving || lowBalancePreference?.mandatory === true} onChange={setEnabled} aria-label={t('console.billing.balanceAlertLowTitle')} /><span>{enabled ? t('console.billing.balanceAlertEnabled') : t('console.billing.balanceAlertDisabled')}</span></div>
      </section>
      <section className="balance-alert-section balance-alert-threshold-section">
        <h3>{t('console.billing.balanceAlertThresholdTitle')}</h3>
        <p>{t('console.billing.balanceAlertThresholdDescription')}</p>
        <Input className="balance-alert-threshold-input" prefix="¥" value={threshold} disabled={loading || saving || !enabled || lowBalancePreference?.threshold_supported === false} onChange={setThreshold} inputMode="decimal" aria-label={t('console.billing.balanceAlertThresholdTitle')} />
      </section>
    </div>
  </Modal>
}
