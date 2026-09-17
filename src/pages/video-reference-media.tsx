import { useEffect, useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import Tooltip from '@douyinfe/semi-ui/lib/es/tooltip'
import { IconAlertTriangle, IconChevronUpDown, IconClose, IconImage, IconPlus, IconTick, IconVideo, IconVolume2 } from '@douyinfe/semi-icons'
import Modal from '@/components/app-modal'
import { CompatInput as Input } from '@/components/semi-compat'
import type { VideoReference } from '@/api/video-runtime'
import type { NormalizedVideoOptions } from '@/utils/video-options'
import './video-reference-media.css'

type MediaType = VideoReference['type']
type Props = {
  value: VideoReference[]
  options: NormalizedVideoOptions
  mode: 'reference' | 'first-last'
  disabled: boolean
  onChange: (value: VideoReference[]) => void
  onDraftChange: (dirty: boolean) => void
}
const MEDIA_TYPES: MediaType[] = ['image', 'video', 'audio']
const MEDIA_ROLES = { image: 'reference_image', video: 'reference_video', audio: 'reference_audio' } as const
const MEDIA_ICONS = { image: IconImage, video: IconVideo, audio: IconVolume2 }
const splitUrls = (value: string): string[] => [...new Set(value.split(/\r?\n/).map((url) => url.trim()).filter(Boolean))]
const draftFrom = (value: VideoReference[]): Record<MediaType, string> => ({
  image: value.filter((item) => item.type === 'image').map((item) => item.url).join('\n'),
  video: value.filter((item) => item.type === 'video').map((item) => item.url).join('\n'),
  audio: value.filter((item) => item.type === 'audio').map((item) => item.url).join('\n'),
})

function isRemoteUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password
  } catch { return false }
}

export function VideoReferenceMedia({ value, options, mode, disabled, onChange, onDraftChange }: Props) {
  const { t } = useTranslation()
  const tabId = useId()
  const [visible, setVisible] = useState(false)
  const [drafts, setDrafts] = useState(() => draftFrom(value))
  const [activeType, setActiveType] = useState<MediaType>('image')
  const [firstFrame, setFirstFrame] = useState('')
  const [lastFrame, setLastFrame] = useState('')
  const [error, setError] = useState('')
  const [privacyHovered, setPrivacyHovered] = useState(false)
  const [privacyFocused, setPrivacyFocused] = useState(false)
  // 尚未接入原生素材协议的旧模型继续只开放单图，避免出现可选却无法提交的类型。
  const nativeMedia = options.hasVideoOptions && options.family === 'seedance'
  const limits = { image: nativeMedia ? options.maxImages : Math.min(1, options.maxImages), video: nativeMedia ? options.maxVideos : 0, audio: nativeMedia ? options.maxAudios : 0 }
  const mediaLabel = (type: MediaType): string => t(`console.video.mediaTypes.${type}`)
  const savedType = value[0]?.type
  const savedFirst = value.find((item) => item.role === 'first_frame')?.url ?? ''
  const savedLast = value.find((item) => item.role === 'last_frame')?.url ?? ''
  const savedDrafts = draftFrom(value)
  const supportsLastFrame = options.hasVideoOptions && options.family === 'seedance' && options.maxImages >= 2
  const title = t(mode === 'first-last' ? 'console.video.firstLastFrame' : 'console.video.referenceMedia')
  const count = splitUrls(drafts[activeType]).length
  const maximum = limits[activeType]
  const dirty = visible && (mode === 'first-last'
    ? firstFrame !== savedFirst || lastFrame !== savedLast
    : MEDIA_TYPES.some((type) => drafts[type] !== savedDrafts[type]) || Boolean(value.length && activeType !== savedType))
  const SavedIcon = savedType ? MEDIA_ICONS[savedType] : IconPlus
  const savedSummary = savedType ? `${mediaLabel(savedType)} · ${value.length}` : ''

  // 各标签的未确认草稿独立保留；取消不会更改已应用素材。
  useEffect(() => { onDraftChange(dirty); return () => onDraftChange(false) }, [dirty, onDraftChange])

  function openDialog(): void {
    setDrafts(draftFrom(value))
    setActiveType(savedType ?? MEDIA_TYPES.find((type) => limits[type] > 0) ?? 'image')
    setFirstFrame(savedFirst)
    setLastFrame(savedLast)
    setError('')
    setPrivacyHovered(false)
    setPrivacyFocused(false)
    setVisible(true)
  }

  function selectType(type: MediaType): void { setActiveType(type); setError('') }

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const available = MEDIA_TYPES.filter((type) => limits[type] > 0)
    const index = available.indexOf(activeType)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + available.length) % available.length
    if (!available[next]) return
    selectType(available[next])
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    buttons?.[next]?.focus()
  }

  function confirmMedia(): void {
    if (disabled) return
    // 仅把当前标签映射到请求，其他类型的临时草稿绝不合并提交。
    const next: VideoReference[] = mode === 'first-last' ? [
      ...(firstFrame.trim() ? [{ type: 'image' as const, url: firstFrame.trim(), role: 'first_frame' as const }] : []),
      ...(supportsLastFrame && lastFrame.trim() ? [{ type: 'image' as const, url: lastFrame.trim(), role: 'last_frame' as const }] : []),
    ] : splitUrls(drafts[activeType]).map((url) => ({ type: activeType, url, role: MEDIA_ROLES[activeType] }))
    const type = mode === 'first-last' ? 'image' : activeType
    if (next.length > limits[type]) { setError(t('console.video.mediaLimitExceeded', { type: mediaLabel(type), count: limits[type] })); return }
    if (next.some((item) => !isRemoteUrl(item.url))) { setError(t('console.video.referenceUrlInvalid')); return }
    if (next.some((item) => item.role === 'last_frame') && !next.some((item) => item.role === 'first_frame')) { setError(t('console.video.firstFrameRequired')); return }
    onChange(next)
    setVisible(false)
    Toast.success(next.length ? t('console.video.mediaSaved', { type: mediaLabel(type), count: next.length }) : t('console.video.mediaCleared'))
  }

  const frameButton = (frame: 'first' | 'last') => <button className={`video-reference-upload-card video-frame-upload-card video-frame-upload-card--${frame}`} type="button" aria-label={t(frame === 'first' ? 'console.video.firstFrameUrlLabel' : 'console.video.lastFrameUrlLabel')} onClick={openDialog} disabled={disabled || options.maxImages === 0 || (frame === 'last' && !supportsLastFrame)} title={frame === 'last' && !supportsLastFrame ? t('console.video.optionUnavailable') : undefined}>
    <span className="video-reference-upload-plus" aria-hidden="true">{(frame === 'first' ? savedFirst : savedLast) ? <IconTick /> : <IconPlus />}</span>
    <span>{t(frame === 'first' ? 'console.video.firstFrameUrlLabel' : 'console.video.lastFrameUrlLabel').replace(/ URL$/, '')}</span>
  </button>
  const selectionHint = value.length && count === 0 ? t('console.video.mediaWillClear')
    : savedType && activeType !== savedType ? t('console.video.mediaWillReplace', { next: mediaLabel(activeType), previous: mediaLabel(savedType) })
      : t('console.video.mediaSingleTypeHint')
  // 校验与普通说明共用提示位置，超限即时说明原因，避免红框下仍显示无关文案。
  const feedbackError = mode === 'reference' && count > maximum
    ? t('console.video.mediaLimitExceeded', { type: mediaLabel(activeType), count: maximum }) : error
  const feedbackHint = mode === 'first-last'
    ? t('console.video.referenceUrlCountHint', { count: Math.min(supportsLastFrame ? 2 : 1, options.maxImages) }) : selectionHint

  return <div className="video-reference-image-control">
    {mode === 'first-last' ? <div className="video-frame-upload-group">
      {frameButton('first')}
      <button className="video-frame-upload-separator" type="button" aria-label={t('console.video.swapFrames')} disabled={disabled || !supportsLastFrame || !savedFirst || !savedLast} onClick={() => onChange([{ type: 'image', url: savedLast, role: 'first_frame' }, { type: 'image', url: savedFirst, role: 'last_frame' }])}><IconChevronUpDown aria-hidden="true" /></button>
      {frameButton('last')}
    </div> : <div className={`video-reference-card-wrap${value.length ? ' has-media' : ''}`}>
      <button className="video-reference-upload-card" type="button" aria-label={value.length ? t('console.video.editMedia', { summary: savedSummary }) : `${t('console.video.referenceMedia')} · ${t('console.video.addMedia')}`} title={value.length ? t('console.video.editMedia', { summary: savedSummary }) : undefined} onClick={openDialog} disabled={disabled || !MEDIA_TYPES.some((type) => limits[type] > 0)}>
        <span className="video-reference-upload-plus" aria-hidden="true"><SavedIcon /></span>
        <span role="status">{savedSummary || t('console.video.referenceMedia')}</span>
      </button>
      {value.length > 0 ? <button className="video-reference-clear" type="button" aria-label={t('console.video.clearMedia')} title={t('console.video.clearMedia')} disabled={disabled} onClick={() => { onChange([]); Toast.success(t('console.video.mediaCleared')) }}><IconClose /></button> : null}
    </div>}
    <Modal width={560} title={<span className="video-reference-dialog-title"><span>{title}</span>
      <Tooltip className="app-info-tooltip video-reference-privacy-tooltip" content={t('console.video.referencePrivacyHint')} position="top" trigger="custom" visible={visible && (privacyHovered || privacyFocused)}>
        <button type="button" className="video-reference-privacy" aria-label={t('console.video.referencePrivacyLabel')} onMouseEnter={() => setPrivacyHovered(true)} onMouseLeave={() => setPrivacyHovered(false)} onFocus={() => setPrivacyFocused(true)} onBlur={() => setPrivacyFocused(false)} onClick={() => setPrivacyFocused(true)}><span aria-hidden="true">!</span></button>
      </Tooltip>
    </span>} visible={visible} onCancel={() => setVisible(false)} onOk={confirmMedia} okButtonProps={{ disabled: disabled || (mode === 'reference' && maximum === 0) }} okText={t('console.common.finish')} cancelText={t('console.common.cancel')}>
      <div data-build-update-managed className="video-reference-dialog video-reference-urls-dialog">
        {mode === 'first-last' ? <>
          <Input value={firstFrame} onChange={(value) => { setFirstFrame(value); setError('') }} placeholder={t('console.video.firstFrameUrlPlaceholder')} aria-label={t('console.video.firstFrameUrlLabel')} disabled={disabled} />
          <Input value={lastFrame} onChange={(value) => { setLastFrame(value); setError('') }} placeholder={t('console.video.lastFrameUrlPlaceholder')} aria-label={t('console.video.lastFrameUrlLabel')} disabled={disabled || !supportsLastFrame} />
        </> : <>
          <div className="video-reference-tabs" role="tablist" aria-label={t('console.video.mediaTypeLabel')}>
            {MEDIA_TYPES.map((type) => <button key={type} type="button" role="tab" id={`${tabId}-${type}`} aria-label={mediaLabel(type)} aria-selected={activeType === type} aria-controls={`${tabId}-panel`} tabIndex={activeType === type ? 0 : -1} disabled={disabled || limits[type] === 0} title={limits[type] === 0 ? t('console.video.optionUnavailable') : undefined} onClick={() => selectType(type)} onKeyDown={navigateTabs}>
              <span>{mediaLabel(type)}</span><span className="video-reference-tab-count">{splitUrls(drafts[type]).length} / {limits[type]}</span>
            </button>)}
          </div>
          <div id={`${tabId}-panel`} role="tabpanel" aria-labelledby={`${tabId}-${activeType}`} className={`video-reference-url-editor${feedbackError ? ' has-error' : ''}`}>
            <textarea value={drafts[activeType]} onChange={(event) => { setDrafts({ ...drafts, [activeType]: event.target.value }); setError('') }} rows={5} placeholder={t(`console.video.mediaPlaceholders.${activeType}`)} aria-label={t(activeType === 'image' ? 'console.video.referenceUrlLabel' : `console.video.mediaUrlLabels.${activeType}`)} aria-invalid={Boolean(feedbackError)} aria-describedby={`${tabId}-hint`} disabled={disabled || maximum === 0} />
            <div className="video-reference-editor-footer"><span className={`video-reference-editor-count${count > maximum ? ' is-over-limit' : ''}`} aria-live="polite">{count} / {maximum}</span></div>
          </div>
        </>}
        <div id={`${tabId}-hint`} className={`video-reference-feedback${feedbackError ? ' is-error' : ''}`} role={feedbackError ? 'alert' : undefined}>
          {feedbackError ? <IconAlertTriangle aria-hidden="true" /> : null}
          <span>{feedbackError || feedbackHint}</span>
        </div>
      </div>
    </Modal>
  </div>
}
