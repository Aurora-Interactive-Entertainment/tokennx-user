import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Tooltip from '@douyinfe/semi-ui/lib/es/tooltip'
import { apiTimeToDate, type ApiTimestamp } from '@/utils/format'

export type SubscriptionUsage = {
  name: string
  quota_mode?: 'token_quota' | 'request_quota'
  total_tokens?: string | number | null
  used_tokens?: string | number | null
  remaining_tokens?: string | number | null
  total_requests?: string | number | null
  used_requests?: string | number | null
  remaining_requests?: string | number | null
  expires_at?: ApiTimestamp | null
}

type ExactCount = { digits: bigint; scale: number }

// 额度按十进制字符串解析，避免把大整数或带小数的 Token 额度转换成浮点数。
function exactCount(value: string | number | null | undefined): ExactCount | null {
  if (value == null) return null
  const raw = String(value).trim()
  const match = /^(\d+)(?:\.(\d+))?$/.exec(raw)
  if (!match) return null
  const fraction = match[2] ?? ''
  return { digits: BigInt(`${match[1]}${fraction}`), scale: fraction.length }
}

function alignCount(value: ExactCount, scale: number): bigint {
  return value.digits * 10n ** BigInt(scale - value.scale)
}

function subtractCount(left: ExactCount, right: ExactCount): ExactCount {
  const scale = Math.max(left.scale, right.scale)
  return { digits: alignCount(left, scale) > alignCount(right, scale) ? alignCount(left, scale) - alignCount(right, scale) : 0n, scale }
}

function formatCount(value: ExactCount | null, locale: string): string {
  if (!value) return '—'
  const raw = value.digits.toString().padStart(value.scale + 1, '0')
  const integer = raw.slice(0, raw.length - value.scale) || '0'
  const fraction = value.scale ? raw.slice(-value.scale).replace(/0+$/, '') : ''
  const grouped = BigInt(integer).toLocaleString(locale)
  return fraction ? `${grouped}.${fraction}` : grouped
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

  const isRequestQuota = model.quota_mode === 'request_quota'
  const total = exactCount(isRequestQuota ? model.total_requests : model.total_tokens)
  const used = exactCount(isRequestQuota ? model.used_requests : model.used_tokens)
  const reportedRemaining = exactCount(isRequestQuota ? model.remaining_requests : model.remaining_tokens)
  const remaining = reportedRemaining ?? (total && used ? subtractCount(total, used) : null)
  // 服务端剩余额度已经扣除了冻结额度，用总量减余量计算进度可覆盖进行中的请求。
  const consumed = total && reportedRemaining
    ? subtractCount(total, reportedRemaining)
    : used ?? (total && remaining ? subtractCount(total, remaining) : null)
  const totalAligned = total && consumed ? alignCount(total, Math.max(total.scale, consumed.scale)) : null
  const consumedAligned = total && consumed ? alignCount(consumed, Math.max(total.scale, consumed.scale)) : null
  const percent = totalAligned != null && consumedAligned != null
    ? (totalAligned > 0n ? Math.min(100, Number(consumedAligned * 10000n / totalAligned) / 100) : 0)
    : null
  const formatTokens = (value: ExactCount | null) => formatCount(value, i18n.language)
  const remainingLabel = isRequestQuota
    ? t('console.subscriptionPage.remainingRequests', { count: formatTokens(remaining) })
    : t('console.subscriptionPage.remainingTokens', { tokens: formatTokens(remaining) })
  const seconds = expiresAt == null ? null : Math.max(0, Math.ceil((expiresAt - now) / 1000))
  const countdown = seconds == null ? '—' : seconds === 0 ? t('console.subscriptionPage.expired') : t('console.subscriptionPage.countdown', {
    days: Math.floor(seconds / 86400),
    time: [Math.floor(seconds % 86400 / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map((value) => String(value).padStart(2, '0')).join(':'),
  })

  return <article className="subscription-model-card">
    <h3>{model.name}</h3>
    <p>{t(isRequestQuota ? 'console.subscriptionPage.totalRequests' : 'console.subscriptionPage.totalTokens')}：{formatTokens(total)}</p>
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
