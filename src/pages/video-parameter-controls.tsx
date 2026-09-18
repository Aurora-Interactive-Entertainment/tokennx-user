import Switch from '@douyinfe/semi-ui/lib/es/switch'
import { IconChevronDownStroked, IconClockStroked, IconFilterStroked } from '@douyinfe/semi-icons'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { CompatSelect as Select } from '@/components/semi-compat'
import { nearestAllowedVideoDuration, normalizeVideoOptions, type NormalizedVideoOptions } from '@/utils/video-options'
import './video-parameter-controls.css'

const STANDARD_ASPECT_OPTIONS = ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16']
const STANDARD_RESOLUTION_OPTIONS = ['480p', '720p', '1080p']

export interface VideoParameterControlsProps {
  options: NormalizedVideoOptions
  duration: number
  aspectRatio: string
  resolution: string
  size: string
  disabled: boolean
  onDurationChange: (duration: number) => void
  onAspectRatioChange: (ratio: string) => void
  onResolutionChange: (resolution: string) => void
  onSizeChange: (size: string) => void
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

export function VideoParameterControls({ options, duration, aspectRatio, resolution, size, disabled, onDurationChange, onAspectRatioChange, onResolutionChange, onSizeChange }: VideoParameterControlsProps) {
  const { t } = useTranslation()
  // 标准选项始终可见；后端未开放的能力用禁选表达，额外档位保留原始值。
  const ratios = [...new Set([...STANDARD_ASPECT_OPTIONS, ...options.ratios])]
  // 有分辨率档位时沿用原来的档位选择，完整像素表只用于校验，不能同时铺进按钮栏。
  const exactSizesOnly = options.hasParameterConfig && !options.parameterConfig?.video?.resolutions?.length && Boolean(options.parameterConfig?.video?.sizes?.length)
  const resolutions = options.hasVideoOptions
    ? [...STANDARD_RESOLUTION_OPTIONS.map((resolution) => options.resolutions.find((value) => value.toLowerCase() === resolution) ?? resolution), ...options.resolutions.filter((value) => !STANDARD_RESOLUTION_OPTIONS.includes(value.toLowerCase()))]
    : STANDARD_RESOLUTION_OPTIONS.map((value) => value.toUpperCase())
  const { minDuration, maxDuration } = options
  const automatic = options.autoDuration && duration === -1
  const manualDuration = nearestAllowedVideoDuration(duration > 0 ? duration : minDuration, options)
  const values = options.durationValues
  const ticks = values?.length ? (values.length <= 7 ? values : values.filter((_, index) => index === 0 || index === values.length - 1 || index % Math.ceil(values.length / 6) === 0)) : durationTicks(minDuration, maxDuration).filter((value) => options.durationStep > 0 && (value - minDuration) % options.durationStep === 0)
  const ratioLabel = (ratio: string): string => options.hasVideoOptions && ratio === 'adaptive' ? t('console.video.adaptiveRatio') : ratio
  const durationLabel = automatic ? t('console.video.autoDuration') : duration > 0 ? `${duration}${t('console.video.secondsShort')}` : t('console.video.duration')
  const aspectLabel = [ratioLabel(aspectRatio), size || resolution.toUpperCase()].filter(Boolean).join(' · ')
  const positionForDuration = (value: number): number => values?.length ? (values.length === 1 ? 0 : values.indexOf(value) / (values.length - 1) * 100) : maxDuration === minDuration ? 0 : ((value - minDuration) / (maxDuration - minDuration)) * 100

  function commitDuration(value: string): number {
    const parsed = Number(value)
    const fallback = options.defaultDuration > 0 ? options.defaultDuration : minDuration
    const candidate = options.hasVideoOptions ? (value.trim() && Number.isFinite(parsed) ? parsed : fallback) : parsed || fallback
    const nextDuration = nearestAllowedVideoDuration(Math.round(candidate), options)
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
        renderSelectedItem={() => <><IconFilterStroked aria-hidden="true" /><span className="video-aspect-label"><span>{aspectLabel || t('console.video.resolution')}</span></span></>}
        innerTopSlot={<div data-build-update-managed className="video-aspect-popover video-select-panel">
          {ratios.length ? <div className="video-aspect-section">
            <strong>{t('console.video.aspectRatio')}</strong>
            <div className="video-aspect-options">
              {ratios.map((ratio) => {
                const candidate = options.hasParameterConfig ? normalizeVideoOptions(undefined, options.parameterConfig, { ...options.selection, ratio }) : options
                const available = candidate.ratios.includes(ratio)
                const numericRatio = ratio.match(/^(\d+):(\d+)$/)
                const widthRatio = numericRatio ? Number(numericRatio[1]) / Number(numericRatio[2]) : 1
                return <button type="button" className={aspectRatio === ratio ? 'is-selected' : ''} aria-pressed={aspectRatio === ratio} key={ratio} onClick={() => onAspectRatioChange(ratio)} disabled={disabled || !available} title={!available ? t('console.video.optionUnavailable') : undefined}>
                  <span className={`video-ratio-icon ratio-${ratio.replace(':', '-')}`} style={options.hasVideoOptions && numericRatio && Number.isFinite(widthRatio) && widthRatio > 0 ? { width: widthRatio >= 1 ? 20 : 20 * widthRatio, height: widthRatio >= 1 ? 20 / widthRatio : 20 } : undefined} />
                  {ratioLabel(ratio)}
                </button>
              })}
            </div>
          </div> : null}
          {resolutions.length || exactSizesOnly ? <div className="video-aspect-section">
            <strong>{t('console.video.resolution')}</strong>
            <div className={`video-resolution-options${exactSizesOnly ? ' video-resolution-options--exact' : ''}`}>
              {!exactSizesOnly && resolutions.map((nextResolution) => {
                const candidate = options.hasParameterConfig ? normalizeVideoOptions(undefined, options.parameterConfig, { ...options.selection, resolution: nextResolution }) : options
                const available = candidate.resolutions.includes(nextResolution)
                return <button type="button" className={resolution === nextResolution ? 'is-selected' : ''} aria-pressed={resolution === nextResolution} key={nextResolution} onClick={() => onResolutionChange(nextResolution)} disabled={disabled || !available} title={!available ? t('console.video.optionUnavailable') : undefined}>{nextResolution.toUpperCase()}</button>
              })}
              {exactSizesOnly && options.sizes.map((option) => <button type="button" className={size === option.value ? 'is-selected' : ''} aria-pressed={size === option.value} key={option.value} onClick={() => onSizeChange(option.value)} disabled={disabled}>{option.value}</button>)}
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
            {options.autoDuration ? <label className="video-duration-auto"><span>{t('console.video.autoDuration')}</span><Switch size="small" checked={automatic} disabled={disabled || (options.autoOnly && automatic)} aria-label={t('console.video.autoDuration')} onChange={(checked) => onDurationChange(checked ? -1 : manualDuration)} /></label> : null}
          </div>
          {!options.autoOnly ? <><div className="video-duration-control">
            <div className={`video-duration-range${automatic ? ' is-automatic' : ''}`} style={{ '--video-duration-progress': `${positionForDuration(manualDuration)}%` } as CSSProperties}>
              <div className="video-duration-track-marks" aria-hidden="true">{ticks.filter((value) => value > minDuration && value < maxDuration).map((value) => <span key={value} style={{ left: `${positionForDuration(value)}%` }} />)}</div>
              <input type="range" min={values?.length ? 0 : minDuration} max={values?.length ? values.length - 1 : maxDuration} step={values?.length ? 1 : options.durationStep || 1} value={values?.length ? Math.max(0, values.indexOf(manualDuration)) : manualDuration} disabled={disabled || automatic || minDuration === maxDuration || !options.hasVideoOptions} onChange={(event) => onDurationChange(values?.length ? values[Number(event.target.value)] : nearestAllowedVideoDuration(Number(event.target.value), options))} aria-label={t('console.video.duration')} />
            </div>
            <div className="video-duration-ticks">{ticks.map((value) => <span key={value} style={{ left: `${positionForDuration(value)}%` }}>{value}</span>)}</div>
          </div>
          <label className="video-duration-number">
            <input type="number" min={minDuration} max={maxDuration} step={options.durationStep || 1} key={duration} defaultValue={duration > 0 ? manualDuration : ''} placeholder="—" disabled={disabled || automatic || !options.hasVideoOptions} onBlur={(event) => {
              if (event.currentTarget.value.trim()) event.currentTarget.value = String(commitDuration(event.currentTarget.value))
              // 允许省略时，清空要同步撤销已选秒数；否则恢复显示，避免空输入仍发送旧值。
              else if (options.omitDuration) onDurationChange(0)
              else event.currentTarget.value = duration > 0 ? String(manualDuration) : ''
            }} onChange={(event) => {
              // 时长只接受整数秒：粘贴等路径可能带入小数，只保留整数部分，不等失焦再静默改写。
              const sanitized = event.currentTarget.value.split(/[.,]/)[0]
              if (sanitized !== event.currentTarget.value) event.currentTarget.value = sanitized
            }} onKeyDown={(event) => {
              // 输入过程中就拦掉小数点、逗号和指数键，界面上不会先出现小数再被改写。
              if (['.', ',', 'e', 'E', '+', '-'].includes(event.key)) { event.preventDefault(); return }
              if (event.key === 'Enter') event.currentTarget.blur()
            }} aria-label={t('console.video.duration')} />
            <span>s</span>
          </label></> : null}
        </div>}
      >
        <Select.Option value="duration">{durationLabel}</Select.Option>
      </Select>
    </div>
  </>
}
