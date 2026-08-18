import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import Tooltip from '@douyinfe/semi-ui/lib/es/tooltip'
import type { ModelAvailabilityHour } from '@/data/models'
import '@/model-availability.css'

function clampRate(rate: number): number {
  return Math.min(100, Math.max(0, rate))
}

function availabilityKind(rate: number): 'is-danger' | 'is-warning' | 'is-healthy' {
  if (rate === 0) return 'is-danger'
  if (rate < 80) return 'is-warning'
  return 'is-healthy'
}

function formatHourRange(hourStart: number, language: string): string {
  const start = new Date(hourStart)
  const end = new Date(hourStart + 60 * 60 * 1000)
  const options: Intl.DateTimeFormatOptions = { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
  const formatter = new Intl.DateTimeFormat(language, options)
  return `${formatter.format(start)} - ${formatter.format(end)}`
}

export function ModelAvailability({
  hourly,
  summaryRate,
  label,
  className = '',
}: {
  hourly?: ModelAvailabilityHour[]
  summaryRate?: number
  label?: ReactNode
  className?: string
}) {
  const { t, i18n } = useTranslation()
  const points = (hourly ?? []).filter((point) => Number.isFinite(point.hourStart) && Number.isFinite(point.rate))
  if (!points.length) return null

  return <div className={`model-availability ${className}`.trim()}>
    {label !== undefined || summaryRate !== undefined ? <div className="model-availability-heading">
      {label !== undefined ? <span>{label}</span> : <span className="model-availability-heading-label">{t('home.rebuild.availability')}</span>}
      {summaryRate !== undefined ? <strong>{clampRate(summaryRate).toFixed(2)}%</strong> : null}
    </div> : null}
    <div className="model-availability-bars">
      {points.map((point, index) => {
        const rate = clampRate(point.rate)
        const rateLabel = t('home.rebuild.availabilityHour', { time: formatHourRange(point.hourStart, i18n.language), rate: `${rate.toFixed(2)}%` })
        return <Tooltip
          autoAdjustOverflow
          className="model-availability-tooltip"
          content={rateLabel}
          key={`${point.hourStart}-${index}`}
          position="top"
          showArrow={false}
        >
          <i
            className={`model-availability-bar ${availabilityKind(rate)}`}
            role="img"
            tabIndex={0}
            aria-label={rateLabel}
          />
        </Tooltip>
      })}
    </div>
  </div>
}
