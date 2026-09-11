import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Tooltip from '@douyinfe/semi-ui/lib/es/tooltip'
import { apiTimeToDate, type ApiTimestamp } from '@/utils/format'

export type SubscriptionUsage = {
  name: string
  total_tokens?: string | number | null
  used_tokens?: string | number | null
  remaining_tokens?: string | number | null
  expires_at?: ApiTimestamp | null
}

// Token 数按整数解析，缺失或非法值不当作零；字符串大整数保持原有精度。
function tokenCount(value: string | number | null | undefined): bigint | null {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) return null
  if (value == null || !/^\d+$/.test(String(value).trim())) return null
  return BigInt(String(value).trim())
}

export function SubscriptionUsageCard({ model }: { model: SubscriptionUsage }) {
  const { t, i18n } = useTranslation()
  const [now, setNow] = useState(Date.now)
  const expiresAt = apiTimeToDate(model.expires_at)?.getTime()
  useEffect(() => {
    if (expiresAt == null) return
    setNow(Date.now())
    // 按绝对过期时间计算，避免后台标签页计时器延迟导致倒计时累计偏差。
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [expiresAt])

  const total = tokenCount(model.total_tokens)
  const used = tokenCount(model.used_tokens)
  const reportedRemaining = tokenCount(model.remaining_tokens)
  const remaining = reportedRemaining ?? (total != null && used != null ? (total > used ? total - used : 0n) : null)
  const consumed = used ?? (total != null && remaining != null ? (total > remaining ? total - remaining : 0n) : null)
  const percent = total != null && consumed != null
    ? (total > 0n ? Math.min(100, Number(consumed * 10000n / total) / 100) : 0)
    : null
  const formatTokens = (value: bigint | null) => value == null ? '—' : value.toLocaleString(i18n.language)
  const remainingLabel = t('console.subscriptionPage.remainingTokens', { tokens: formatTokens(remaining) })
  const seconds = expiresAt == null ? null : Math.max(0, Math.ceil((expiresAt - now) / 1000))
  const countdown = seconds == null ? '—' : seconds === 0 ? t('console.subscriptionPage.expired') : t('console.subscriptionPage.countdown', {
    days: Math.floor(seconds / 86400),
    time: [Math.floor(seconds % 86400 / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map((value) => String(value).padStart(2, '0')).join(':'),
  })

  return <article className="subscription-model-card">
    <h3>{model.name}</h3>
    <p>{t('console.subscriptionPage.totalTokens')}：{formatTokens(total)}</p>
    <Tooltip content={remainingLabel}>
      <div className="subscription-progress" role="progressbar" tabIndex={0} aria-label={remainingLabel} aria-valuetext={remainingLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}>
        <span style={{ width: `${percent ?? 0}%` }} />
      </div>
    </Tooltip>
    <div className="subscription-model-card-footer">
      <small>{t('console.subscriptionPage.usagePercent', { percent: percent == null ? '—' : percent.toFixed(2) })}</small>
      <small className="subscription-model-expiry">{t('console.subscriptionPage.expiresIn', { time: countdown })}</small>
    </div>
  </article>
}
