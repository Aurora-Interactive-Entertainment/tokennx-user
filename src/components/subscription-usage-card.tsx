import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
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

// 箭头离气泡圆角至少留出一段距离，避免贴边时尖角被圆角切掉。
const TIP_ARROW_INSET = 8

type TipMetrics = { width: number; innerWidth: number }

/** 悬浮提示的水平位置：气泡跟随鼠标，贴边时停靠并把箭头平移到鼠标所在处。 */
function tipPlacement(cursor: number, barWidth: number, tip: TipMetrics) {
  const half = tip.width / 2
  const center = tip.width >= barWidth
    ? barWidth / 2
    : Math.min(Math.max(cursor, half), barWidth - half)
  // 箭头相对气泡的内边距框定位，半宽要按内容宽度算，尖角才正对鼠标。
  const arrowHalf = tip.innerWidth / 2
  const arrowMax = Math.max(TIP_ARROW_INSET, tip.innerWidth - TIP_ARROW_INSET)
  return { center, arrow: Math.min(Math.max(cursor - center + arrowHalf, TIP_ARROW_INSET), arrowMax) }
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
  const progressRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  // 悬停位置记录为进度条内的横向坐标，气泡和箭头都按这个坐标跟随鼠标。
  const [hover, setHover] = useState<{ cursor: number; barWidth: number } | null>(null)
  const [tipMetrics, setTipMetrics] = useState<TipMetrics>({ width: 0, innerWidth: 0 })

  useLayoutEffect(() => {
    const tip = tipRef.current
    if (!hover || !tip) return
    // 布局阶段量出气泡宽度，贴边收拢才能和最终渲染的宽度一致。
    const width = tip.offsetWidth
    const innerWidth = tip.clientWidth
    setTipMetrics((current) => (current.width === width && current.innerWidth === innerWidth ? current : { width, innerWidth }))
  }, [hover, remainingLabel])

  const seconds = expiresAt == null ? null : Math.max(0, Math.ceil((expiresAt - now) / 1000))
  const countdown = seconds == null ? '—' : seconds === 0 ? t('console.subscriptionPage.expired') : t('console.subscriptionPage.countdown', {
    days: Math.floor(seconds / 86400),
    time: [Math.floor(seconds % 86400 / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map((value) => String(value).padStart(2, '0')).join(':'),
  })

  const placement = hover ? tipPlacement(hover.cursor, hover.barWidth, tipMetrics) : null

  function trackCursor(event: ReactPointerEvent<HTMLDivElement>) {
    // 触摸抬手必定触发 pointerleave，跟随提示在触屏上只会闪一下，直接不跟随。
    if (event.pointerType === 'touch') return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return
    setHover({ cursor: Math.min(Math.max(event.clientX - rect.left, 0), rect.width), barWidth: rect.width })
  }

  // 键盘聚焦没有鼠标坐标，按已用比例落点，保证提示依然可读。
  function focusCursor() {
    const rect = progressRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    setHover({ cursor: (rect.width * (percent ?? 0)) / 100, barWidth: rect.width })
  }

  function hideTip() {
    setHover(null)
  }

  return <article className="subscription-model-card">
    <h3>{model.name}</h3>
    <p>{isRequestQuota
      ? t('console.subscriptionPage.totalRequests', { count: formatTokens(total) })
      : t('console.subscriptionPage.totalTokens', { tokens: formatTokens(total) })}</p>
    <div
      className="subscription-progress"
      role="progressbar"
      tabIndex={0}
      ref={progressRef}
      aria-label={remainingLabel}
      aria-valuetext={remainingLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      onPointerMove={trackCursor}
      onPointerLeave={hideTip}
      onPointerCancel={hideTip}
      onFocus={focusCursor}
      onBlur={hideTip}
    >
      <span className="subscription-progress-fill" style={{ width: `${percent ?? 0}%` }} />
      {placement && (
        <span
          className="app-follow-tooltip subscription-progress-tip"
          aria-hidden="true"
          ref={tipRef}
          style={{
            transform: `translateX(calc(${placement.center}px - 50%))`,
            '--follow-tip-arrow': `${placement.arrow}px`,
          } as CSSProperties}
        >{remainingLabel}</span>
      )}
    </div>
    <div className="subscription-model-card-footer">
      <small>{t('console.subscriptionPage.usagePercent', { percent: percent == null ? '—' : percent.toFixed(2) })}</small>
      <small className="subscription-model-expiry">{t('console.subscriptionPage.expiresIn', { time: countdown })}</small>
    </div>
  </article>
}
