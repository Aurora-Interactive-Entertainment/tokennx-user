import Switch from '@douyinfe/semi-ui/lib/es/switch'
import { IconChevronDownStroked, IconClockStroked, IconFilterStroked } from '@douyinfe/semi-icons'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { CompatSelect as Select } from '@/components/semi-compat'
import type { NormalizedVideoOptions } from '@/utils/video-options'
import './video-parameter-controls.css'

const STANDARD_ASPECT_OPTIONS = ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16']
const STANDARD_RESOLUTION_OPTIONS = ['480p', '720p', '1080p']
const LEGACY_DURATION_TICKS = [2, 5, 10, 15, 20, 25, 30]

export interface VideoParameterControlsProps {
  options: NormalizedVideoOptions
  duration: number
  aspectRatio: string
  resolution: string
  disabled: boolean
  onDurationChange: (duration: number) => void
  onAspectRatioChange: (ratio: string) => void
  onResolutionChange: (resolution: string) => void
}

function durationTicks(minimum: number, maximum: number): number[] {
  if (minimum === maximum) return [minimum]
  // 刻度使用易读的整数间隔，同时始终保留接口规定的两个端点。
  const estimate = Math.max(1, (maximum - minimum) / 6)
  const magnitude = 10 ** Math.floor(Math.log10(estimate))
  const normalized = estimate / magnitude
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude
  const ticks = [minimum]
  for (let value = Math.ceil(minimum / step) * step; value < maximum; value += step) {
    // 非整档端点附近不再挤入一个刻度，例如 4–30 秒不紧贴起点再标 5。
    if (value - minimum >= (maximum - minimum) * .08 && maximum - value >= (maximum - minimum) * .08) ticks.push(value)
  }
  return [...ticks, maximum]
}

export function VideoParameterControls({ options, duration, aspectRatio, resolution, disabled, onDurationChange, onAspectRatioChange, onResolutionChange }: VideoParameterControlsProps) {
  const { t } = useTranslation()
  // 标准选项始终可见；后端未开放的能力用禁选表达，额外档位保留原始值。
  const ratios = [...new Set([...STANDARD_ASPECT_OPTIONS, ...options.ratios])]
  const resolutions = options.hasVideoOptions
    ? [...STANDARD_RESOLUTION_OPTIONS.map((resolution) => options.resolutions.find((value) => value.toLowerCase() === resolution) ?? resolution), ...options.resolutions.filter((value) => !STANDARD_RESOLUTION_OPTIONS.includes(value.toLowerCase()))]
    : STANDARD_RESOLUTION_OPTIONS.map((value) => value.toUpperCase())
  const { minDuration, maxDuration } = options
  const automatic = options.autoDuration && duration === -1
  const manualDuration = Math.max(minDuration, Math.min(maxDuration, automatic ? (options.defaultDuration > 0 ? options.defaultDuration : minDuration) : duration))
  const ticks = options.hasVideoOptions ? durationTicks(minDuration, maxDuration) : LEGACY_DURATION_TICKS
  const ratioLabel = (ratio: string): string => options.hasVideoOptions && ratio === 'adaptive' ? t('console.video.adaptiveRatio') : ratio
  const durationLabel = automatic ? t('console.video.autoDuration') : `${duration}${t('console.video.secondsShort')}`
  const aspectLabel = [ratioLabel(aspectRatio), resolution.toUpperCase()].filter(Boolean).join(' · ')
  const positionForDuration = (value: number): number => maxDuration === minDuration ? 0 : ((value - minDuration) / (maxDuration - minDuration)) * 100

  function commitDuration(value: string): number {
    const parsed = Number(value)
    const fallback = options.defaultDuration > 0 ? options.defaultDuration : minDuration
    const candidate = options.hasVideoOptions ? (value.trim() && Number.isFinite(parsed) ? parsed : fallback) : parsed || fallback
    const nextDuration = Math.max(minDuration, Math.min(maxDuration, Math.round(candidate)))
    onDurationChange(nextDuration)
    return nextDuration
  }

  return <>
    <div className="video-aspect-picker">
      <Select
        className="video-control-button video-aspect-trigger video-panel-select"
        value="settings"
        disabled={disabled}
        arrowIcon={<IconChevronDownStroked />}
        position="topLeft"
        dropdownClassName="video-aspect-select-dropdown video-aspect-options-dropdown"
        aria-label={t('console.video.aspectRatio')}
        renderSelectedItem={() => <><IconFilterStroked aria-hidden="true" /><span className="video-aspect-label"><span>{ratioLabel(aspectRatio)}</span>{resolution ? <><span className="video-aspect-separator"> · </span><span>{resolution.toUpperCase()}</span></> : null}</span></>}
        innerTopSlot={<div data-build-update-managed className="video-aspect-popover video-select-panel">
          {ratios.length ? <div className="video-aspect-section">
            <strong>{t('console.video.aspectRatio')}</strong>
            <div className="video-aspect-options">
              {ratios.map((ratio) => {
                const available = options.hasVideoOptions ? options.ratios.includes(ratio) : options.sizes.some((size) => size.aspect === ratio)
                const numericRatio = ratio.match(/^(\d+):(\d+)$/)
                const widthRatio = numericRatio ? Number(numericRatio[1]) / Number(numericRatio[2]) : 1
                return <button type="button" className={aspectRatio === ratio ? 'is-selected' : ''} aria-pressed={aspectRatio === ratio} key={ratio} onClick={() => onAspectRatioChange(ratio)} disabled={disabled || !available} title={!available ? t('console.video.optionUnavailable') : undefined}>
                  <span className={`video-ratio-icon ratio-${ratio.replace(':', '-')}`} style={options.hasVideoOptions && numericRatio && Number.isFinite(widthRatio) && widthRatio > 0 ? { width: widthRatio >= 1 ? 20 : 20 * widthRatio, height: widthRatio >= 1 ? 20 / widthRatio : 20 } : undefined} />
                  {ratioLabel(ratio)}
                </button>
              })}
            </div>
          </div> : null}
          {resolutions.length ? <div className="video-aspect-section">
            <strong>{t('console.video.resolution')}</strong>
            <div className="video-resolution-options">
              {resolutions.map((nextResolution) => {
                const available = options.hasVideoOptions ? options.resolutions.includes(nextResolution) : options.sizes.some((size) => size.aspect === aspectRatio && size.resolution === nextResolution)
                return <button type="button" className={resolution === nextResolution ? 'is-selected' : ''} aria-pressed={resolution === nextResolution} key={nextResolution} onClick={() => onResolutionChange(nextResolution)} disabled={disabled || !available} title={!available ? t('console.video.optionUnavailable') : undefined}>{nextResolution.toUpperCase()}</button>
              })}
            </div>
          </div> : null}
        </div>}
      >
        <Select.Option value="settings">{aspectLabel}</Select.Option>
      </Select>
    </div>
    <div className="video-duration-picker">
      <Select
        className="video-control-button video-duration-trigger video-panel-select"
        value="duration"
        disabled={disabled}
        arrowIcon={<IconChevronDownStroked />}
        position="topLeft"
        dropdownClassName="video-duration-select-dropdown video-duration-options-dropdown"
        aria-label={t('console.video.duration')}
        renderSelectedItem={() => <><IconClockStroked aria-hidden="true" /><span>{durationLabel}</span></>}
        innerTopSlot={<div data-build-update-managed className="video-duration-popover video-select-panel">
          <div className="video-duration-heading">
            <strong>{t('console.video.durationSelect')}</strong>
            {/* 自动开关与标题同行，不增加面板高度；协议中的自动值保持为 -1。 */}
            {options.autoDuration ? <label className="video-duration-auto"><span>{t('console.video.autoDuration')}</span><Switch size="small" checked={automatic} disabled={disabled} aria-label={t('console.video.autoDuration')} onChange={(checked) => onDurationChange(checked ? -1 : manualDuration)} /></label> : null}
          </div>
          <div className="video-duration-control">
            <div className={`video-duration-range${automatic ? ' is-automatic' : ''}`} style={{ '--video-duration-progress': `${positionForDuration(manualDuration)}%` } as CSSProperties}>
              <div className="video-duration-track-marks" aria-hidden="true">{ticks.filter((value) => value > minDuration && value < maxDuration).map((value) => <span key={value} style={{ left: `${positionForDuration(value)}%` }} />)}</div>
              <input type="range" min={minDuration} max={maxDuration} step="1" value={manualDuration} disabled={disabled || automatic || minDuration === maxDuration} onChange={(event) => onDurationChange(Number(event.target.value))} aria-label={t('console.video.duration')} />
            </div>
            <div className="video-duration-ticks">{ticks.map((value) => <span key={value} style={{ left: `${positionForDuration(value)}%` }}>{value}</span>)}</div>
          </div>
          <label className="video-duration-number">
            <input type="number" min={minDuration} max={maxDuration} step="1" key={duration} defaultValue={manualDuration} disabled={disabled || automatic || minDuration === maxDuration} onBlur={(event) => { event.currentTarget.value = String(commitDuration(event.currentTarget.value)) }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} aria-label={t('console.video.duration')} />
            <span>s</span>
          </label>
        </div>}
      >
        <Select.Option value="duration">{durationLabel}</Select.Option>
      </Select>
    </div>
  </>
}
