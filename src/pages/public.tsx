import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { TFunction } from 'i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import Skeleton from '@douyinfe/semi-ui/lib/es/skeleton'
import { IconChevronDown, IconCopyStroked, IconFile } from '@douyinfe/semi-icons'
import { LoginPanel, LoginRequiredAction, ManuscriptSupportWidget, PublicLayout, ModelLogo, normalizeLoginReturnPath } from '@/components/common'
import modelCardArt from '@/assets/figma-home/model-card-art.png'
import promoModelLogo from '@/assets/figma-home/promo-model-logo.svg'
import promoRewardAvatars from '@/assets/figma-home/promo-reward-avatars.png'
import promoBannerArt from '@/assets/figma-home/promo-banner.png'
import promoArticleArt from '@/assets/figma-home/promo-article.png'
import hermesAgentImage from '@/assets/figma-apps/hermes-agent.png'
import mimoXiaomiImage from '@/assets/figma-ranking/mimo-xiaomi.png'
import { ModelPriceSummary } from '@/components/money'
import { getPublicHomepage, getPublicHomepageAssetURL, getPublicHomepageStats, type HomepageDiscountKind, type HomepageEntry, type HomepagePromotionModel, type HomepageTranslation, type PublicHomepage } from '@/api/homepage'
import { filterModels, findModel, modelAlias, modelRouteKey, MODEL_CATALOG, MODALITY_LABELS, type ModelModality, type ModelPrice, type ModelRecord } from '@/data/models'
import { getAccessToken } from '@/auth/token-storage'
import { useAppSelector } from '@/store/hooks'
import { QUICKSTART_API_BASE_URL, quickstartCodeSample } from '@/utils/quickstart'
import { useTranslation } from 'react-i18next'

function formatPublicPrice(price: ModelPrice): ReactNode {
  return <ModelPriceSummary price={price} />
}

// 中文：公开页面的模型链接只使用面向用户的别名，旧模型 code 仅由查找逻辑兼容。
function modelPublicHref(model: { id: string; alias?: string }): string | undefined {
  const routeKey = modelRouteKey(model)
  return routeKey ? `/models/${encodeURIComponent(routeKey)}` : undefined
}

const MODEL_FOOTER_LINKS = [
  { label: 'footer.docs', path: '/docs' },
  { label: 'footer.status', path: '/status' },
  { label: 'footer.terms', path: '/terms' },
  { label: 'footer.privacy', path: '/privacy' },
]

const HOME_MODEL_MOSAIC_COLUMNS = 6
const HOME_REWARD_STATS = [
  { value: '00', unit: '元', labelKey: 'rewardPending' },
  { value: '00', unit: '人', labelKey: 'rewardApproved' },
  { value: '00', unit: '次', labelKey: 'rewardRejected' },
] as const
type HomePartner = { name: string; logoMarkup?: string; logoUrl?: string; href?: string; logoKind: 'wordmark' | 'mark' | 'css' }
const PUBLIC_COMPANY_KEYS: Record<string, string> = {
  阿里云: 'aliyun',
  百川智能: 'baichuan',
  零一万物: 'yi',
  月之暗面: 'moonshot',
  智谱AI: 'zhipu',
  字节跳动: 'bytedance',
  Anthropic: 'anthropic',
  DeepSeek: 'deepseek',
  Google: 'google',
  Meta: 'meta',
  Midjourney: 'midjourney',
  'Mistral AI': 'mistral',
  OpenAI: 'openai',
  'Stability AI': 'stability',
}
const PUBLIC_CAPABILITY_KEYS: Record<string, string> = {
  对话: 'conversation',
  代码: 'code',
  推理: 'reasoning',
  分析: 'analysis',
  视觉: 'vision',
  音频: 'audio',
  长文本: 'longText',
  创作: 'creation',
  图像生成: 'imageGeneration',
  风格化: 'stylization',
  视频生成: 'videoGeneration',
  语音合成: 'speechSynthesis',
  高清: 'hd',
}
const HOME_PARTNER_NAME_KEYS: Record<string, string> = {
  KIMI: 'kimi',
  'Z.ai': 'zai',
  Qwen: 'qwen',
  ERNIE: 'ernie',
  豆包大模型: 'doubao',
  KwaiKAT: 'kwaikat',
  'Cherry Studio': 'cherryStudio',
  Dify: 'dify',
  Obsidian: 'obsidian',
  mastra: 'mastra',
  OOMOL: 'oomol',
  CAMEL: 'camel',
  Scietrain: 'scietrain',
  MetaGPT: 'metagpt',
}
const HOME_AVAILABILITY_BAR_COUNT = 24
const HOME_AVAILABILITY_RATE_DECIMAL_PLACES = 2
const HOME_AVAILABILITY_SEGMENT_OFFSETS = [-0.05, 0.02, 0.01, -0.03, 0.04, -0.01, 0, 0.03, -0.02, -0.04, 0.05, -0.01, -0.03, 0.02, 0.01, -0.02, 0.04, -0.03, 0, -0.01, 0.03, -0.04, 0.02, 0.02] as const
const HOME_MODEL_MOSAIC_COUNT = 18
const HOME_SCOREBOARD_ANIMATION_DURATION = 1_600
const HOME_SCOREBOARD_DIGIT_COUNT = 8
const HOME_SCOREBOARD_INITIAL_DIGITS = '0'.repeat(HOME_SCOREBOARD_DIGIT_COUNT)
const HOME_SCOREBOARD_MAX_VALUE = 10 ** HOME_SCOREBOARD_DIGIT_COUNT - 1
const HOME_SCOREBOARD_DIGIT_DELAY = 70
const HOME_SCOREBOARD_METRIC_COUNT = 2
const HOME_STATS_POLL_INTERVAL = 60_000

function publicCompanyLabel(t: TFunction, company: string): string {
  const key = PUBLIC_COMPANY_KEYS[company]
  return key ? t(`public.companies.${key}`, { defaultValue: company }) : company
}

function publicCapabilityLabel(t: TFunction, capability: string): string {
  const key = PUBLIC_CAPABILITY_KEYS[capability]
  return key ? t(`public.modelCapabilities.${key}`, { defaultValue: capability }) : capability
}

function publicModalityLabel(t: TFunction, modality: ModelModality): string {
  return t(`public.modalities.${modality}`, { defaultValue: MODALITY_LABELS[modality] })
}

function publicModelDescription(t: TFunction, modelId: string, description: string): string {
  return t(`public.modelDescriptions.${modelId}`, { defaultValue: description })
}

function homepageLocale(language: string): 'zh-CN' | 'en-US' {
  return language.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
}

function homepageTranslation(entry: HomepageEntry, language: string): HomepageTranslation {
  const locale = homepageLocale(language)
  return entry.data.translations?.[locale] ?? entry.data.translations?.['zh-CN'] ?? entry.data.translations?.['en-US'] ?? {}
}

function homepageHref(value: string | undefined, fallback: string): string {
  const normalized = value?.trim() ?? ''
  if (/^https?:\/\//i.test(normalized)) return normalized
  if (normalized.startsWith('/') && !normalized.startsWith('//')) return normalized
  return fallback
}

function homepageDate(value: number | string | undefined, language: string): string {
  if (value === undefined) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(homepageLocale(language), { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function homepagePrice(value: string | number | undefined): string {
  const normalized = typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(8)
    : typeof value === 'string' && value.trim()
      ? value.trim()
      : '--'
  if (!/^[-+]?\d+\.\d+$/.test(normalized)) return normalized
  return normalized.replace(/0+$/, '').replace(/\.$/, '')
}

function homepageMediaURL(objectID: string | undefined, fallbackURL: string | undefined): string | undefined {
  return getPublicHomepageAssetURL(objectID) ?? (fallbackURL?.trim() || undefined)
}

// 中文：用固定偏移生成可重复的 mock 分段数据，让每个条纹既有独立成功率又与卡片汇总值保持一致。
function formatHomeAvailabilityRate(summaryRate: string, segmentIndex: number, itemIndex: number): string {
  const parsedSummaryRate = Number.parseFloat(summaryRate)
  if (!Number.isFinite(parsedSummaryRate)) return summaryRate

  const offsetIndex = (segmentIndex + itemIndex * 7) % HOME_AVAILABILITY_SEGMENT_OFFSETS.length
  const segmentRate = Math.min(100, Math.max(0, parsedSummaryRate + HOME_AVAILABILITY_SEGMENT_OFFSETS[offsetIndex]))
  return `${segmentRate.toFixed(HOME_AVAILABILITY_RATE_DECIMAL_PLACES)}%`
}

function useHomeMetrics(): { tokenVolume: number; apiCalls: number; initialRequestFinished: boolean } {
  const [metrics, setMetrics] = useState({ tokenVolume: 0, apiCalls: 0 })
  const [initialRequestFinished, setInitialRequestFinished] = useState(false)

  useEffect(() => {
    let mounted = true
    let requestInFlight = false

    const refresh = async (): Promise<void> => {
      if (requestInFlight) return
      requestInFlight = true
      try {
        const value = await getPublicHomepageStats()
        if (mounted) setMetrics(value)
      } catch {
        // Keep the last successful values. Before the first response the scoreboards remain at zero.
      } finally {
        requestInFlight = false
        if (mounted) setInitialRequestFinished(true)
      }
    }

    void refresh()
    const interval = window.setInterval(() => {
      if (!document.hidden) void refresh()
    }, HOME_STATS_POLL_INTERVAL)
    const handleVisibilityChange = (): void => {
      if (!document.hidden) void refresh()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      mounted = false
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return { ...metrics, initialRequestFinished }
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function useScoreboardValue(targetValue: number): number {
  const target = Number.isFinite(targetValue) ? targetValue : 0
  const [value, setValue] = useState(0)
  const valueRef = useRef(0)

  useEffect(() => {
    const startValue = valueRef.current
    if (startValue === target) return undefined

    if (prefersReducedMotion()) {
      valueRef.current = target
      setValue(target)
      return undefined
    }

    // 中文：只在目标值落定时更新整组数字，按位翻页交给 CSS 延迟，避免每帧重挂载数字节点。
    const timeout = window.setTimeout(() => {
      valueRef.current = target
      setValue(target)
    }, HOME_SCOREBOARD_ANIMATION_DURATION)

    return () => window.clearTimeout(timeout)
  }, [target])

  return value
}

function formatScoreboardValue(value: number): string {
  const normalizedValue = Math.min(HOME_SCOREBOARD_MAX_VALUE, Math.max(0, Math.round(value)))
  return String(normalizedValue).padStart(HOME_SCOREBOARD_DIGIT_COUNT, '0')
}

type ScoreboardFlipState = { fromDigit: string; toDigit: string; version: number }
type ScoreboardInitialFlipTracker = { target: string | null; pendingIndexes: Set<number>; completedIndexes: Set<number>; notified: boolean }

function ManuscriptScoreboardDigit({ metricId, index, digit, onFlipComplete }: { metricId: string; index: number; digit: string; onFlipComplete?: (index: number) => void }) {
  const [flipState, setFlipState] = useState<ScoreboardFlipState>(() => ({ fromDigit: digit, toDigit: digit, version: 0 }))
  const reportedFlipVersionRef = useRef(0)
  const { fromDigit, toDigit, version } = flipState

  useLayoutEffect(() => {
    setFlipState((current) => {
      if (current.toDigit === digit) return current

      // 中文：在浏览器绘制前锁定上一轮终值，确保每次都从旧数字翻到新数字。
      return { fromDigit: current.toDigit, toDigit: digit, version: current.version + 1 }
    })
  }, [digit])

  useEffect(() => {
    if (version <= 0 || !onFlipComplete || !prefersReducedMotion() || reportedFlipVersionRef.current === version) return
    reportedFlipVersionRef.current = version
    onFlipComplete(index)
  }, [index, onFlipComplete, version])

  function handleAnimationEnd(): void {
    if (version <= 0 || reportedFlipVersionRef.current === version) return
    reportedFlipVersionRef.current = version
    onFlipComplete?.(index)
  }

  return (
    <i className="manuscript-scoreboard-digit" data-digit={toDigit} style={{ '--scoreboard-delay': `${(HOME_SCOREBOARD_DIGIT_COUNT - index - 1) * HOME_SCOREBOARD_DIGIT_DELAY}ms` } as CSSProperties}>
      <span className={`manuscript-scoreboard-flip${version > 0 ? ' is-flipping' : ''}`} key={`${metricId}-${index}-${version}`}>
        <span className="manuscript-scoreboard-face manuscript-scoreboard-face--base-top"><b>{fromDigit}</b></span>
        <span className="manuscript-scoreboard-face manuscript-scoreboard-face--base-bottom"><b>{fromDigit}</b></span>
        <span className="manuscript-scoreboard-face manuscript-scoreboard-face--next-top"><b>{toDigit}</b></span>
        <span className="manuscript-scoreboard-flap manuscript-scoreboard-flap--top"><b>{fromDigit}</b></span>
        <span className="manuscript-scoreboard-flap manuscript-scoreboard-flap--bottom" onAnimationEnd={handleAnimationEnd}><b>{toDigit}</b></span>
      </span>
    </i>
  )
}

function ManuscriptScoreboard({ metricId, unit, value, onInitialFlipComplete }: { metricId: string; unit: string; value: number; onInitialFlipComplete?: () => void }) {
  const formattedValue = formatScoreboardValue(value)
  const initialFlipTrackerRef = useRef<ScoreboardInitialFlipTracker>({ target: null, pendingIndexes: new Set(), completedIndexes: new Set(), notified: false })

  useLayoutEffect(() => {
    const tracker = initialFlipTrackerRef.current
    if (tracker.target !== null || formattedValue === HOME_SCOREBOARD_INITIAL_DIGITS) return

    tracker.target = formattedValue
    formattedValue.split('').forEach((digit, index) => {
      if (digit !== HOME_SCOREBOARD_INITIAL_DIGITS[index]) tracker.pendingIndexes.add(index)
    })
    if (tracker.pendingIndexes.size === 0) {
      tracker.notified = true
      onInitialFlipComplete?.()
    }
  }, [formattedValue, onInitialFlipComplete])

  const handleDigitFlipComplete = useCallback((index: number): void => {
    const tracker = initialFlipTrackerRef.current
    if (tracker.notified || !tracker.pendingIndexes.has(index)) return

    tracker.completedIndexes.add(index)
    if (tracker.completedIndexes.size !== tracker.pendingIndexes.size) return
    tracker.notified = true
    onInitialFlipComplete?.()
  }, [onInitialFlipComplete])

  return (
    <div className="manuscript-digital-stat" role="listitem" aria-label={`${unit} ${formattedValue}`}>
      <div className="manuscript-scoreboard" aria-live="polite" aria-atomic="true">
        <div className="manuscript-scoreboard-content">
          <span className="manuscript-scoreboard-unit" aria-hidden="true">{unit}</span>
          <span className="public-sr-only">{formattedValue}</span>
          <div className="manuscript-scoreboard-value" aria-hidden="true">
            {formattedValue.split('').map((digit, index) => <ManuscriptScoreboardDigit key={`${metricId}-${index}`} metricId={metricId} index={index} digit={digit} onFlipComplete={handleDigitFlipComplete} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

type HomeSilkRibbon = {
  y: number
  amplitude: number
  frequency: number
  speed: number
  phase: number
  opacity: number
  gradient?: CanvasGradient
}

function HomeSilkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d', { alpha: true, desynchronized: true })
    if (!canvas || !context || typeof context.createLinearGradient !== 'function') return undefined

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const compactViewport = window.matchMedia?.('(max-width: 768px)').matches ?? false
    const performanceMode = document.documentElement.dataset.performance
    const litePerformance = performanceMode === 'lite'
    const balancedPerformance = performanceMode === 'balanced' || compactViewport
    const canAnimate = !reducedMotion
    const targetFrameInterval = 1000 / (litePerformance ? 20 : balancedPerformance ? 30 : 60)
    const scrollingFrameInterval = 1000 / (litePerformance ? 12 : balancedPerformance ? 15 : 20)
    let width = 0
    let height = 0
    let tick = 0
    let animationFrame = 0
    let lastDrawTime = 0
    let isVisible = true
    let isScrolling = false
    let scrollEndTimer: number | undefined
    let ribbons: HomeSilkRibbon[] = []

    const createRibbons = (): void => {
      ribbons = Array.from({ length: litePerformance ? 8 : balancedPerformance ? 16 : 22 }, () => {
        const amplitude = 50 + Math.random() * 120
        const verticalPadding = Math.min(height / 2, amplitude + 36)
        const opacity = .05 + Math.random() * .18
        const gradient = context.createLinearGradient(0, 0, width, 0)
        gradient.addColorStop(0, 'rgba(20,70,255,0)')
        gradient.addColorStop(.45, `rgba(70,130,255,${opacity})`)
        gradient.addColorStop(.7, `rgba(20,90,255,${opacity})`)
        gradient.addColorStop(1, 'rgba(20,70,255,0)')

        return {
          y: verticalPadding + Math.random() * Math.max(0, height - verticalPadding * 2),
          amplitude,
          frequency: .002 + Math.random() * .004,
          speed: .3 + Math.random() * .7,
          phase: Math.random() * Math.PI * 2,
          opacity,
          gradient,
        }
      })
    }

    const resize = (): void => {
      const bounds = canvas.getBoundingClientRect()
      width = Math.max(1, bounds.width)
      height = Math.max(1, bounds.height)
      const pixelRatio = Math.min(window.devicePixelRatio || 1, litePerformance ? 1 : balancedPerformance ? 1.5 : 2)
      canvas.width = Math.round(width * pixelRatio)
      canvas.height = Math.round(height * pixelRatio)
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      createRibbons()
    }

    const draw = (): void => {
      context.clearRect(0, 0, width, height)
      tick += 1

      context.shadowBlur = isScrolling || litePerformance ? 0 : balancedPerformance ? 10 : 18
      context.shadowColor = 'rgba(40,100,255,.8)'
      context.lineWidth = 1.3
      const drawStep = isScrolling
        ? litePerformance ? 24 : balancedPerformance ? 20 : 16
        : litePerformance ? 16 : balancedPerformance ? 12 : 8

      ribbons.forEach((ribbon, index) => {
        context.beginPath()
        for (let x = 0; x <= width; x += drawStep) {
          const wave = Math.sin(x * ribbon.frequency - tick * .01 * ribbon.speed - ribbon.phase) * ribbon.amplitude
          const y = ribbon.y + wave + Math.sin(tick * .005 + index) * 30
          if (x === 0) context.moveTo(x, y)
          else context.lineTo(x, y)
        }

        context.strokeStyle = ribbon.gradient ?? 'rgba(40,100,255,.14)'
        context.stroke()
      })
    }

    const animate = (time: number): void => {
      if (document.hidden || !isVisible) {
        animationFrame = 0
        return
      }
      const frameInterval = isScrolling ? scrollingFrameInterval : targetFrameInterval
      if (time - lastDrawTime >= frameInterval) {
        draw()
        lastDrawTime = time
      }
      animationFrame = window.requestAnimationFrame(animate)
    }

    const start = (): void => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = 0
      if (document.hidden || !canAnimate || !isVisible) {
        draw()
        return
      }
      animationFrame = window.requestAnimationFrame(animate)
    }

    const handleVisibilityChange = (): void => start()
    const handleScroll = (): void => {
      if (!isScrolling) {
        isScrolling = true
        lastDrawTime = 0
      }
      if (scrollEndTimer !== undefined) window.clearTimeout(scrollEndTimer)
      scrollEndTimer = window.setTimeout(() => {
        isScrolling = false
        lastDrawTime = 0
      }, 140)
    }
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      resize()
      if (reducedMotion) draw()
    })
    const intersectionObserver = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      isVisible = entry?.isIntersecting ?? true
      start()
    }, { rootMargin: '160px 0px' })

    resize()
    start()
    resizeObserver?.observe(canvas)
    intersectionObserver?.observe(canvas)
    if (!resizeObserver) window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('wheel', handleScroll, { passive: true })
    window.addEventListener('touchmove', handleScroll, { passive: true })

    return () => {
      window.cancelAnimationFrame(animationFrame)
      if (scrollEndTimer !== undefined) window.clearTimeout(scrollEndTimer)
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      if (!resizeObserver) window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('wheel', handleScroll)
      window.removeEventListener('touchmove', handleScroll)
    }
  }, [])

  return <canvas ref={canvasRef} className="manuscript-silk-canvas" aria-hidden="true" />
}

function HomeModelMosaic() {
  const models = MODEL_CATALOG.slice(0, HOME_MODEL_MOSAIC_COUNT)
  const rows = Array.from({ length: Math.ceil(models.length / HOME_MODEL_MOSAIC_COLUMNS) }, (_, rowIndex) => models.slice(rowIndex * HOME_MODEL_MOSAIC_COLUMNS, (rowIndex + 1) * HOME_MODEL_MOSAIC_COLUMNS))
  return <div className="manuscript-model-mosaic" aria-hidden="true">{rows.map((row, rowIndex) => <div className={`manuscript-model-mosaic-row${rowIndex % 2 === 1 ? ' is-offset' : ''}`} key={`model-mosaic-row-${rowIndex}`}>{row.map((model) => <ModelLogo key={model.id} model={model} size="small" />)}</div>)}</div>
}

function HomeFeatureArtwork({ priority = false }: { priority?: boolean }) {
  return <>
    <img className="manuscript-feature-image" src={modelCardArt} alt="" aria-hidden="true" loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async" width={416} height={106} />
    {/* Retain the previous mosaic fallback in the DOM for compatibility with existing consumers. */}
    <div className="manuscript-feature-mosaic-legacy" aria-hidden="true"><HomeModelMosaic /></div>
  </>
}

function HomePartnerLogo({ partner }: { partner: HomePartner }) {
  if (partner.logoUrl) {
    return <img className="manuscript-partner-image" src={partner.logoUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" width={112} height={64} />
  }
  if (partner.logoMarkup) {
    const logoClassName = `manuscript-partner-logo${partner.logoKind === 'mark' ? ' manuscript-partner-logo--mark' : ''}`
    return <span className={logoClassName} aria-hidden="true" dangerouslySetInnerHTML={{ __html: partner.logoMarkup }} />
  }
  const cssLogoName = partner.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return <span className={`manuscript-partner-css-logo manuscript-partner-css-logo--${cssLogoName}`} aria-hidden="true"><i className="manuscript-partner-css-logo-mark"><b /><b /><b /></i></span>
}

// 中文：每条轨道复制一份品牌序列，循环位移到半程时正好衔接下一份内容，保证滚动不会跳帧。
function HomePartnerRow({ partners, rowIndex }: { partners: HomePartner[]; rowIndex: number }) {
  const { t } = useTranslation()
  const rowRef = useRef<HTMLDivElement>(null)
  const primarySequenceRef = useRef<HTMLDivElement>(null)
  const [shouldScroll, setShouldScroll] = useState(partners.length >= 6)
  const direction = rowIndex === 0 ? 'is-forward' : 'is-reverse'

  useLayoutEffect(() => {
    const updateOverflow = (): void => {
      const rowWidth = rowRef.current?.clientWidth ?? 0
      const sequenceWidth = primarySequenceRef.current?.scrollWidth ?? 0
      if (partners.length <= 2) {
        setShouldScroll(false)
        return
      }
      if (rowWidth === 0) {
        setShouldScroll(partners.length >= 6)
        return
      }
      const fadeAllowance = Math.min(160, rowWidth * .12)
      setShouldScroll(sequenceWidth > rowWidth - fadeAllowance)
    }

    updateOverflow()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateOverflow)
      return () => window.removeEventListener('resize', updateOverflow)
    }
    const observer = new ResizeObserver(updateOverflow)
    if (rowRef.current) observer.observe(rowRef.current)
    if (primarySequenceRef.current) observer.observe(primarySequenceRef.current)
    return () => observer.disconnect()
  }, [partners.length])

  const renderSequence = (isDuplicate: boolean) => (
    <div className="manuscript-partner-sequence" ref={isDuplicate ? undefined : primarySequenceRef} aria-hidden={isDuplicate || undefined} data-sequence={isDuplicate ? 'duplicate' : 'primary'}>
      {partners.map((partner, partnerIndex) => {
        const partnerName = t(`public.home.partnerNames.${HOME_PARTNER_NAME_KEYS[partner.name]}`, { defaultValue: partner.name })
        const href = homepageHref(partner.href, '/models')
        // Partner artwork is the source of truth; keep the name available to assistive
        // technology without rendering it beside the logo.
        const content = <><HomePartnerLogo partner={partner} /><span className="public-sr-only">{partnerName}</span></>
        const linkProps = {
          className: 'manuscript-partner-item',
          'aria-label': `${partnerName} ${t('common.browseModels')}`,
          'aria-hidden': isDuplicate,
          tabIndex: isDuplicate ? -1 : undefined,
          'data-copy': isDuplicate ? 'duplicate' : 'primary',
        }
        const partnerKey = `${rowIndex}-${isDuplicate ? 'duplicate' : 'primary'}-${partner.name}-${partnerIndex}`
        return href.startsWith('/')
          ? <Link key={partnerKey} {...linkProps} to={href}>{content}</Link>
          : <a key={partnerKey} {...linkProps} href={href} target="_blank" rel="noopener noreferrer">{content}</a>
      })}
    </div>
  )

  const rowClassName = `manuscript-partner-row ${shouldScroll ? 'is-scrolling' : 'is-static'}${partners.length <= 2 ? ' is-compact' : ''}`
  return <div className={rowClassName} data-row={rowIndex + 1} ref={rowRef}>
    <div className={`manuscript-partner-track ${shouldScroll ? direction : 'is-static'}`}>
      {renderSequence(false)}
      {shouldScroll ? renderSequence(true) : null}
    </div>
  </div>
}

function ManagedFeatureCard({ entry, index }: { entry: HomepageEntry; index: number }) {
  const { t, i18n } = useTranslation()
  const content = homepageTranslation(entry, i18n.language)
  const href = homepageHref(content.link_url, '/models')
  const action = content.action_text?.trim() || t(`home.rebuild.featureCards.${index % 3}.action`)
  const imageURL = homepageMediaURL(content.image_object_id, content.image_url)
  return <article className="manuscript-feature-card">
    <div className="manuscript-feature-visual">{imageURL ? <img className="manuscript-feature-image" src={imageURL} alt="" aria-hidden="true" loading={index === 0 ? 'eager' : 'lazy'} fetchPriority={index === 0 ? 'high' : 'auto'} decoding="async" width={416} height={106} /> : <HomeFeatureArtwork priority={index === 0} />}<span>{index === 0 ? t('home.rebuild.featureModelsCount') : t('home.rebuild.featuresTitle')}</span></div>
    <div className="manuscript-feature-copy">
      <h3>{content.title || t('home.rebuild.featuresTitle')}</h3>
      <p>{content.description || ''}</p>
      {href.startsWith('/') ? <Link className="manuscript-feature-action" to={href}>{action}</Link> : <a className="manuscript-feature-action" href={href} target="_blank" rel="noopener noreferrer">{action}</a>}
    </div>
  </article>
}

function ManagedNewsCard({ entry, index }: { entry: HomepageEntry; index: number }) {
  const { t, i18n } = useTranslation()
  const content = homepageTranslation(entry, i18n.language)
  const href = homepageHref(content.link_url, '/docs')
  const card = <><div className="manuscript-news-copy"><h3>{content.title || t('home.rebuild.news.0.title')}</h3><p>{content.summary || ''}</p><small>{homepageDate(entry.updated_at, i18n.language)} <b className="manuscript-news-new">{t('public.home.newBadge')}</b></small></div><div className={`manuscript-news-art manuscript-news-art--${index % 2}`} aria-hidden="true"><img className="manuscript-news-art-image" src={promoArticleArt} alt="" loading="lazy" decoding="async" width={850} height={333} /></div></>
  return href.startsWith('/') ? <Link className="manuscript-news-card" to={href}>{card}</Link> : <a className="manuscript-news-card" href={href} target="_blank" rel="noopener noreferrer">{card}</a>
}

function ManagedAdSlots({ entries }: { entries: HomepageEntry[] }) {
  const { t, i18n } = useTranslation()
  return <div className="manuscript-ad-slots">{entries.map((entry) => {
    const content = homepageTranslation(entry, i18n.language)
    const href = homepageHref(content.link_url, '/models')
    const imageURL = homepageMediaURL(content.image_object_id, content.image_url)
    const ad = <img src={imageURL || promoBannerArt} alt={content.title || t('home.rebuild.adSlot')} loading="lazy" decoding="async" width={850} height={193} />
    return href.startsWith('/') ? <Link className="manuscript-ad-slot" key={entry.id} to={href}>{ad}</Link> : <a className="manuscript-ad-slot" key={entry.id} href={href} target="_blank" rel="noopener noreferrer">{ad}</a>
  })}</div>
}

type HomePromotionRouteModel = Pick<ModelRecord, 'id' | 'alias'>
type HomePromotionItem = { id: string; model: HomePromotionRouteModel; name: string; company: string; discountKind: HomepageDiscountKind; input: string; output: string; availability: string }

function homepageModelPrice(model: HomepagePromotionModel, meterKind: 'input_token' | 'output_token'): string {
  const price = model.prices.find((item) => item.meter_kind === meterKind)
  if (!price) return '--'
  const unitPrice = typeof price.unit_price_yuan === 'number' ? price.unit_price_yuan : Number(price.unit_price_yuan)
  if (!Number.isFinite(unitPrice)) return '--'
  return homepagePrice(unitPrice * (1_000_000 / price.unit_quantity))
}

function managedPromotionItems(homepage: PublicHomepage | null, language: string): HomePromotionItem[] {
  if (!homepage?.promotion_models.length) return []
  return homepage.promotion_models.flatMap((entry): HomePromotionItem[] => {
    const content = homepageTranslation(entry, language)
    if (entry.model) {
      return [{
        id: entry.id,
        model: entry.model,
        name: content.title?.trim() || entry.model.name,
        company: entry.model.company,
        discountKind: entry.data.discount_kind ?? 'half',
        input: homepageModelPrice(entry.model, 'input_token'),
        output: homepageModelPrice(entry.model, 'output_token'),
        availability: entry.model.availability ? `${entry.model.availability.rate.toFixed(2)}%` : '--',
      }]
    }
    const model = findModel(entry.model_id)
    if (!model) return []
    return [{
      id: entry.id,
      model,
      name: content.title?.trim() || model.name,
      company: model.company,
      discountKind: entry.data.discount_kind ?? 'half',
      input: homepagePrice(model.tokenNxPrice.inputRaw ?? model.tokenNxPrice.input),
      output: homepagePrice(model.tokenNxPrice.outputRaw ?? model.tokenNxPrice.output),
      availability: `${model.availability.rate.toFixed(2)}%`,
    }]
  })
}

function managedPartners(homepage: PublicHomepage | null, language: string): HomePartner[] {
  if (!homepage?.partners.length) return []
  return homepage.partners.flatMap((entry) => {
    const content = homepageTranslation(entry, language)
    const logoURL = homepageMediaURL(content.logo_object_id, content.logo_url)
    if (!logoURL) return []
    const name = content.name?.trim() || content.title?.trim() || entry.id
    return [{ name, logoUrl: logoURL, href: content.link_url, logoKind: 'wordmark' as const }]
  })
}

type HomepageLoadStatus = 'loading' | 'ready' | 'error'

function HomeFeatureSkeletons() {
  return <>
    {Array.from({ length: 3 }, (_, index) => <Skeleton active loading className="manuscript-skeleton-host" key={`feature-skeleton-${index}`} placeholder={<article className="manuscript-feature-card manuscript-skeleton-card" aria-hidden="true">
      <Skeleton.Image className="manuscript-feature-skeleton-visual" />
      <div className="manuscript-feature-skeleton-copy"><Skeleton.Title className="manuscript-skeleton-title" /><Skeleton.Paragraph className="manuscript-skeleton-paragraph" rows={2} /><Skeleton.Button className="manuscript-skeleton-action" /></div>
    </article>} />)}
  </>
}

function HomePriceSkeletons() {
  return <>
    {Array.from({ length: 3 }, (_, index) => <Skeleton active loading className="manuscript-skeleton-host" key={`price-skeleton-${index}`} placeholder={<article className="manuscript-price-card manuscript-skeleton-card" aria-hidden="true">
      <div className="manuscript-price-skeleton-head">
        <Skeleton.Image className="manuscript-price-skeleton-logo" />
        <div className="manuscript-price-skeleton-name"><Skeleton.Title className="manuscript-skeleton-title" /><Skeleton.Paragraph className="manuscript-skeleton-paragraph" rows={1} /></div>
        <Skeleton.Button className="manuscript-price-skeleton-badge" />
      </div>
      <div className="manuscript-price-skeleton-divider" />
      <div className="manuscript-price-skeleton-values"><div><Skeleton.Paragraph className="manuscript-skeleton-paragraph" rows={1} /><Skeleton.Title className="manuscript-skeleton-value" /></div><div><Skeleton.Paragraph className="manuscript-skeleton-paragraph" rows={1} /><Skeleton.Title className="manuscript-skeleton-value" /></div></div>
      <div className="manuscript-price-skeleton-availability"><Skeleton.Paragraph className="manuscript-skeleton-paragraph" rows={1} /><Skeleton.Image className="manuscript-price-skeleton-bars" /></div>
    </article>} />)}
  </>
}

function HomePromotionSkeleton() {
  return <>
    <Skeleton active loading className="manuscript-skeleton-host" placeholder={<article className="manuscript-reward-card manuscript-skeleton-card manuscript-promotion-skeleton-reward" aria-hidden="true">
      <Skeleton.Title className="manuscript-skeleton-title" /><Skeleton.Paragraph className="manuscript-skeleton-paragraph" rows={2} />
      <Skeleton.Image className="manuscript-promotion-skeleton-art" /><Skeleton.Button className="manuscript-promotion-skeleton-login" />
      <div className="manuscript-promotion-skeleton-stats">{Array.from({ length: 3 }, (_, index) => <Skeleton.Title key={`reward-stat-skeleton-${index}`} />)}</div>
    </article>} />
    <Skeleton active loading className="manuscript-skeleton-host" placeholder={<div className="manuscript-news-column manuscript-promotion-skeleton-news" aria-hidden="true">
      <Skeleton.Image className="manuscript-promotion-skeleton-banner" />
      <div className="manuscript-news-grid">{Array.from({ length: 2 }, (_, index) => <div className="manuscript-news-card manuscript-skeleton-card" key={`news-skeleton-${index}`}><div className="manuscript-news-skeleton-copy"><Skeleton.Title className="manuscript-skeleton-title" /><Skeleton.Paragraph className="manuscript-skeleton-paragraph" rows={3} /></div><Skeleton.Image className="manuscript-news-skeleton-art" /></div>)}</div>
    </div>} />
  </>
}

function HomePartnerSkeleton() {
  return <Skeleton active loading className="manuscript-skeleton-host" placeholder={<div>{Array.from({ length: 2 }, (_, rowIndex) => <div className="manuscript-partner-skeleton-row" aria-hidden="true" key={`partner-row-skeleton-${rowIndex}`}>
    {Array.from({ length: 6 }, (_, itemIndex) => <div className="manuscript-partner-skeleton-item" key={`partner-skeleton-${rowIndex}-${itemIndex}`}><Skeleton.Image className="manuscript-partner-skeleton-logo" /><Skeleton.Title className="manuscript-partner-skeleton-name" /></div>)}
  </div>)}</div>} />
}

export function HomePage({ onInitialScoreboardReady }: { onInitialScoreboardReady?: () => void } = {}) {
  const { t, i18n } = useTranslation()
  const authStatus = useAppSelector((state) => state.auth.status)
  const [homepage, setHomepage] = useState<PublicHomepage | null>(null)
  const [homepageStatus, setHomepageStatus] = useState<HomepageLoadStatus>('loading')
  const completedScoreboardsRef = useRef(new Set<string>())
  const homepageRequestIdRef = useRef(0)
  const initialAuthStatusRef = useRef(authStatus)
  const previousAuthStatusRef = useRef(authStatus)

  useEffect(() => {
    const litePerformance = /MicroMessenger/i.test(navigator.userAgent) || (window.matchMedia?.('(pointer: coarse)').matches ?? false) || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4)
    if (!litePerformance) return undefined
    document.documentElement.dataset.performance = 'lite'
    return () => {
      if (document.documentElement.dataset.performance === 'lite') delete document.documentElement.dataset.performance
    }
  }, [])

  const handleScoreboardReady = useCallback((metricId: string): void => {
    if (!onInitialScoreboardReady || completedScoreboardsRef.current.has(metricId)) return
    completedScoreboardsRef.current.add(metricId)
    if (completedScoreboardsRef.current.size === HOME_SCOREBOARD_METRIC_COUNT) onInitialScoreboardReady()
  }, [onInitialScoreboardReady])
  const handleTokenScoreboardReady = useCallback(() => handleScoreboardReady('token-volume'), [handleScoreboardReady])
  const handleApiScoreboardReady = useCallback(() => handleScoreboardReady('api-calls'), [handleScoreboardReady])
  const isHomepageLoading = homepageStatus === 'loading' && homepage === null
  const isHomepageError = homepageStatus === 'error' && homepage === null
  const managedCards = homepage?.cards ?? []
  const promotionItems = useMemo(() => {
    return managedPromotionItems(homepage, i18n.language)
  }, [homepage, i18n.language])
  const managedNews = useMemo(() => {
    const news = homepage?.news ?? []
    const pinned = news.filter((entry) => entry.pinned)
    return (pinned.length ? pinned : news).slice(0, 2)
  }, [homepage])
  const managedPartnerItems = useMemo(() => managedPartners(homepage, i18n.language), [homepage, i18n.language])
  const partnerItems = managedPartnerItems
  const partnerRows = useMemo(() => {
    if (!partnerItems.length) return []
    if (partnerItems.length < 12) return [partnerItems]
    const splitIndex = Math.ceil(partnerItems.length / 2)
    return [partnerItems.slice(0, splitIndex), partnerItems.slice(splitIndex)]
  }, [partnerItems])

  const refreshHomepage = useCallback((accessToken?: string): void => {
    const requestId = ++homepageRequestIdRef.current
    setHomepageStatus('loading')
    getPublicHomepage(accessToken).then((value) => {
      if (requestId !== homepageRequestIdRef.current) return
      setHomepage(value)
      setHomepageStatus('ready')
    }).catch(() => {
      if (requestId === homepageRequestIdRef.current) setHomepageStatus('error')
      // 中文：公开内容接口失败时保留已编排的默认首页，避免运营接口故障影响首页首屏。
    })
  }, [])

  useEffect(() => {
    refreshHomepage(initialAuthStatusRef.current === 'authenticated' ? getAccessToken() ?? undefined : undefined)
    return () => { homepageRequestIdRef.current += 1 }
  }, [refreshHomepage])

  useEffect(() => {
    const previousStatus = previousAuthStatusRef.current
    previousAuthStatusRef.current = authStatus
    if (authStatus === 'authenticated' && previousStatus !== 'authenticated') {
      refreshHomepage(getAccessToken() ?? undefined)
    } else if (authStatus === 'unauthenticated' && previousStatus === 'authenticated') {
      refreshHomepage()
    }
  }, [authStatus, refreshHomepage])

  const homeMetrics = useHomeMetrics()
  const animatedTokenVolume = useScoreboardValue(homeMetrics.tokenVolume)
  const animatedApiCalls = useScoreboardValue(homeMetrics.apiCalls)

  useEffect(() => {
    if (!homeMetrics.initialRequestFinished) return
    if (homeMetrics.tokenVolume === 0) handleTokenScoreboardReady()
    if (homeMetrics.apiCalls === 0) handleApiScoreboardReady()
  }, [handleApiScoreboardReady, handleTokenScoreboardReady, homeMetrics.apiCalls, homeMetrics.initialRequestFinished, homeMetrics.tokenVolume])

  return (
    <PublicLayout mainClassName="home-page home-page--manuscript">
      <div className="manuscript-home-shell">
        <section className="manuscript-hero" aria-labelledby="homeTitle">
          <div className="manuscript-hero-copy">
            <h1 id="homeTitle"><span>{t('home.rebuild.heroTitle')}</span><strong>{t('home.rebuild.heroSubtitle')}</strong></h1>
            <div className="manuscript-hero-actions">
              <LoginRequiredAction className="btn btn-primary" returnPath="/console/quickstart"><span>{t('home.rebuild.primaryCta')}</span></LoginRequiredAction>
              <Link className="btn btn-secondary manuscript-model-button" to="/models" aria-label={t('home.rebuild.secondaryCta')}><span>{t('home.rebuild.secondaryCta')}</span></Link>
            </div>
            <div className="manuscript-digital-stats" role="list" aria-label={t('home.overview')}>
              <ManuscriptScoreboard metricId="token-volume" unit={t('home.rebuild.tokenVolumeUnit')} value={animatedTokenVolume} onInitialFlipComplete={handleTokenScoreboardReady} />
              <ManuscriptScoreboard metricId="api-calls" unit={t('home.rebuild.apiCallsUnit')} value={animatedApiCalls} onInitialFlipComplete={handleApiScoreboardReady} />
            </div>
          </div>
        </section>

        {isHomepageError ? <div className="manuscript-home-error" role="alert">
          <span>{t('home.rebuild.loadFailed')}</span>
          <button type="button" onClick={() => refreshHomepage(authStatus === 'authenticated' ? getAccessToken() ?? undefined : undefined)}>{t('home.rebuild.retry')}</button>
        </div> : null}

        <section className="manuscript-section manuscript-features" aria-labelledby="homeFeaturesTitle">
          <div className="manuscript-wave-field" aria-hidden="true"><HomeSilkCanvas /></div>
          <h2 className="public-sr-only" id="homeFeaturesTitle">{t('home.rebuild.featuresTitle')}</h2>
          <div className="manuscript-feature-grid" role={isHomepageLoading ? 'status' : undefined} aria-busy={isHomepageLoading || undefined}>
            {isHomepageLoading ? <><span className="public-sr-only">正在加载首页功能</span><HomeFeatureSkeletons /></> : managedCards.map((entry, index) => <ManagedFeatureCard key={entry.id} entry={entry} index={index} />)}
          </div>
        </section>

        <section className="manuscript-section manuscript-pricing" aria-labelledby="homePricingTitle">
          <div className="manuscript-section-heading"><div><h2 id="homePricingTitle">{t('home.pricing.manuscriptTitle')}</h2><p>{t('home.pricing.manuscriptSubtitle')}</p></div></div>
          <div className="manuscript-price-grid" role={isHomepageLoading ? 'status' : undefined} aria-busy={isHomepageLoading || undefined}>{isHomepageLoading ? <><span className="public-sr-only">正在加载优惠模型</span><HomePriceSkeletons /></> : promotionItems.map((item, itemIndex) => <article className={`manuscript-price-card${item.input.length > 5 || item.output.length > 5 ? ' has-long-price' : ''}`} key={item.id}>
            <span className="manuscript-price-card-kicker">{t('home.pricing.manuscriptSubtitle')}</span>
            <div className="manuscript-price-card-head"><Link className="manuscript-price-model" to={modelPublicHref(item.model) ?? '/models'}><span className="manuscript-price-model-logo"><img src={promoModelLogo} alt="" aria-hidden="true" loading="lazy" decoding="async" width={30} height={24} /></span><span><strong>{item.name}</strong><small>{t('home.rebuild.providedBy', { company: item.company })}</small></span></Link><span className={`manuscript-price-badge${item.discountKind === 'free' ? ' is-equal' : ''}`}>{t(`public.home.discount${item.discountKind === 'free' ? 'Free' : item.discountKind === 'custom' ? 'Custom' : 'Half'}`)}</span></div>
            <div className="manuscript-price-divider" />
            <div className="manuscript-price-values"><div><span>{t('home.rebuild.inputPrice')}</span><strong>{item.input}<small>{t('public.home.priceUnit')}</small></strong></div><div><span>{t('home.rebuild.outputPrice')}</span><strong>{item.output}<small>{t('public.home.priceUnit')}</small></strong></div></div>
            <div className="manuscript-price-availability"><span>{t('home.rebuild.availability')}</span><div>{Array.from({ length: HOME_AVAILABILITY_BAR_COUNT }, (_, index) => {
              const rate = formatHomeAvailabilityRate(item.availability, index, itemIndex)
              const rateLabel = t('home.rebuild.availabilitySegment', { index: index + 1, rate })
              const offset = HOME_AVAILABILITY_SEGMENT_OFFSETS[(index + itemIndex * 7) % HOME_AVAILABILITY_SEGMENT_OFFSETS.length]
              const segmentKind = offset <= -0.03 ? 'is-danger' : offset >= 0.04 ? 'is-warning' : 'is-up'
              return <i className={`manuscript-price-availability-bar ${segmentKind}`} key={index} role="img" tabIndex={0} data-rate={rate} data-tooltip={rateLabel} aria-label={rateLabel} title={rateLabel} />
            })}</div></div>
          </article>)}</div>
        </section>

        <section className="manuscript-section manuscript-promotion" aria-labelledby="homePromotionTitle">
          <div className="manuscript-section-heading"><div><h2 id="homePromotionTitle">{t('home.rebuild.promotionTitle')}</h2><p>{t('home.rebuild.manuscriptPromotionDescription')}</p></div></div>
          <div className="manuscript-promotion-grid" role={isHomepageLoading ? 'status' : undefined} aria-busy={isHomepageLoading || undefined}>{isHomepageLoading ? <><span className="public-sr-only">正在加载推广与资讯</span><HomePromotionSkeleton /></> : <><article className="manuscript-reward-card"><h3>{t('home.rebuild.rewardTitle')}</h3><p>{t('home.rebuild.rewardDescription')}</p><div className="manuscript-reward-marks" aria-hidden="true"><img src={promoRewardAvatars} alt="" loading="lazy" decoding="async" width={327} height={68} /></div><div className="manuscript-reward-login"><span>{t('home.rebuild.rewardLoginHint')}</span><LoginRequiredAction returnPath="/console/invitations">{t('home.rebuild.rewardLoginAction')}</LoginRequiredAction></div><div className="manuscript-reward-stats">{HOME_REWARD_STATS.map(({ value, unit, labelKey }) => <span key={labelKey}><strong className={value.length > 2 ? 'is-long' : undefined}>{value}<em>{unit}</em></strong><small>{t(`home.rebuild.${labelKey}`)}</small></span>)}</div></article><div className="manuscript-news-column">
            {homepage?.ad_slots.length ? <ManagedAdSlots entries={homepage.ad_slots} /> : null}
            <div className="manuscript-news-grid">{managedNews.map((entry, index) => <ManagedNewsCard entry={entry} index={index} key={entry.id} />)}</div>
          </div></>}</div>
        </section>

        <section className="manuscript-section manuscript-partners" aria-labelledby="homePartnersTitle">
          <div className="manuscript-section-heading"><div><h2 id="homePartnersTitle">{t('home.rebuild.partnersTitle')}</h2><p>{t('home.rebuild.partnersDescription')}</p></div></div>
          <div className="manuscript-partner-grid" aria-label={t('home.rebuild.partnersTitle')} role={isHomepageLoading ? 'status' : undefined} aria-busy={isHomepageLoading || undefined}>{isHomepageLoading ? <><span className="public-sr-only">正在加载合作伙伴</span><HomePartnerSkeleton /></> : partnerRows.map((row, rowIndex) => <HomePartnerRow key={`partner-row-${rowIndex}`} partners={row} rowIndex={rowIndex} />)}</div>
        </section>
      </div>
    </PublicLayout>
  )
}

export function ModelsPublicPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [company, setCompany] = useState(searchParams.get('company') ?? '')
  const [modality, setModality] = useState<ModelModality | 'all'>('all')
  const models = useMemo(() => filterModels(query, modality).filter((model) => !company || model.company === company), [company, modality, query])
  const companyOptions = Object.keys(PUBLIC_COMPANY_KEYS)
  const modalityCounts = Object.fromEntries((Object.keys(MODALITY_LABELS) as ModelModality[]).map((key) => [key, MODEL_CATALOG.filter((model) => model.modality === key).length])) as Record<ModelModality, number>

  function syncFilters(nextQuery: string, nextCompany: string): void {
    const nextParams = new URLSearchParams()
    if (nextQuery) nextParams.set('q', nextQuery)
    if (nextCompany) nextParams.set('company', nextCompany)
    setSearchParams(nextParams)
  }

  function updateSearch(value: string): void {
    setQuery(value)
    syncFilters(value, company)
  }

  function updateCompany(value: string): void {
    setCompany(value)
    syncFilters(query, value)
  }

  function clearFilters(): void {
    setQuery('')
    setCompany('')
    setModality('all')
    setSearchParams({})
  }

  return (
    <PublicLayout mainClassName="public-models-page" footerLabel="public.footer.catalogLabel" footerLinks={MODEL_FOOTER_LINKS}>
      <header className="public-models-head">
        <div>
          <p className="public-models-kicker">{t('public.models.kicker')}</p>
          <h1>{t('public.models.title')}</h1>
          <p className="public-models-lead">{t('public.models.lead')}</p>
          <p className="public-models-price-note">{t('public.models.priceNote')}</p>
        </div>
        <div className="public-models-head-meta" aria-label={t('public.models.catalogInfo')}><span className="badge">{t('public.models.catalogCount', { count: MODEL_CATALOG.length })}</span><Link to="/pricing">{t('public.models.viewPricing')}</Link></div>
      </header>

      <section className="public-models-filter" aria-labelledby="filterTitle">
        <h2 className="public-sr-only" id="filterTitle">{t('public.models.filterTitle')}</h2>
        <form onSubmit={(event) => event.preventDefault()} role="search">
          <div className="public-models-filter-grid">
            <div className="public-models-search-field"><label htmlFor="modelSearch">{t('public.models.searchLabel')}</label><div className="public-models-search-control"><input className="input" id="modelSearch" type="search" value={query} onChange={(event) => updateSearch(event.target.value)} autoComplete="off" placeholder={t('public.models.searchPlaceholder')} /><button className="btn btn-secondary" type="submit">{t('public.models.searchButton')}</button></div></div>
            <div className="public-models-company-field"><label htmlFor="companyFilter">{t('public.models.companyLabel')}</label><select className="input" id="companyFilter" value={company} onChange={(event) => updateCompany(event.target.value)}><option value="">{t('public.models.allCompanies')}</option>{companyOptions.map((option) => <option key={option} value={option}>{publicCompanyLabel(t, option)}</option>)}</select></div>
          </div>
          <div className="public-models-filter-row">
            <div className="public-models-modality" role="group" aria-label={t('public.models.modalityLabel')}>
              <button className="public-models-modality-button" type="button" aria-pressed={modality === 'all'} onClick={() => setModality('all')}><span>{t('public.models.allModalities')}</span><span className="public-models-modality-count">{MODEL_CATALOG.length}</span></button>
              {(Object.keys(MODALITY_LABELS) as ModelModality[]).map((key) => <button className="public-models-modality-button" key={key} type="button" aria-pressed={modality === key} onClick={() => setModality(key)}><span>{publicModalityLabel(t, key)}</span><span className="public-models-modality-count">{modalityCounts[key]}</span></button>)}
            </div>
            <button className="public-models-clear" type="button" hidden={!query && !company && modality === 'all'} onClick={clearFilters}>{t('public.models.clearFilters')}</button>
          </div>
        </form>
      </section>

      <section className="public-models-results" aria-labelledby="resultsTitle">
        <div className="public-models-results-head"><h2 id="resultsTitle">{t('public.models.resultTitle')}</h2><output aria-live="polite">{t('public.models.resultCount', { count: models.length })}</output></div>
        {models.length ? <div className="public-models-grid">{models.map((model) => <article className="public-model-card" key={model.id}>
          <div className="public-model-card-head"><ModelLogo model={model} className="public-model-logo" /><div className="public-model-identity"><h2><Link to={modelPublicHref(model) ?? '/models'}>{model.name}</Link></h2><span>{publicCompanyLabel(t, model.company)}</span></div><span className="badge">{publicModalityLabel(t, model.modality)}</span></div>
          <ul className="public-model-capabilities" aria-label={t('public.models.capabilitiesLabel')}>{model.capabilities.slice(0, 3).map((capability) => <li key={capability}>{publicCapabilityLabel(t, capability)}</li>)}</ul>
          <p className="public-model-specs">{model.context ? t('public.models.context', { value: model.context }) : publicModelDescription(t, model.id, model.description)}</p>
          <dl className="public-model-prices"><div><dt>{t('public.models.tokenNxPrice')}</dt><dd className="public-models-price-highlight"><ModelPriceSummary price={model.tokenNxPrice} /></dd></div><div><dt>{t('public.models.officialPrice')}</dt><dd>{formatPublicPrice(model.officialPrice)}</dd></div></dl>
          <div className="public-model-card-actions"><Link className="btn btn-primary btn-sm" to={modelPublicHref(model) ?? '/models'}>{t('public.models.viewDetails')}</Link></div>
        </article>)}</div> : <div className="public-models-empty"><h2>{t('public.models.noMatchTitle')}</h2><p>{t('public.models.noMatchHint')}</p><button className="btn btn-secondary" type="button" onClick={clearFilters}>{t('public.models.clearFilters')}</button></div>}
      </section>
    </PublicLayout>
  )
}

export function ModelDetailPage() {
  const { t } = useTranslation()
  const { modelId } = useParams()
  const navigate = useNavigate()
  const model = findModel(modelId)
  const routeKey = model ? modelRouteKey(model) : undefined
  const displayAlias = model ? modelAlias(model) || t('console.common.modelAliasUnset') : ''
  const modelQuery = routeKey ? encodeURIComponent(routeKey) : ''

  useEffect(() => {
    if (!model || !routeKey || modelId === routeKey) return
    // 中文：旧模型 code 仅用于兼容历史链接，进入页面后立即规范化为模型别名。
    navigate(`/models/${encodeURIComponent(routeKey)}`, { replace: true })
  }, [model, modelId, navigate, routeKey])

  if (!model) return <PublicLayout mainClassName="public-model-detail"><div className="public-model-missing"><h1>{t('public.modelDetail.missingTitle')}</h1><p>{t('public.modelDetail.missingHint')}</p><Link className="btn btn-primary" to="/models">{t('public.modelDetail.backCatalog')}</Link></div></PublicLayout>

  return (
    <PublicLayout mainClassName="public-model-detail" footerLabel="public.footer.catalogLabel" footerLinks={[{ label: 'footer.models', path: '/models' }, ...MODEL_FOOTER_LINKS]}>
      <Link className="public-model-back" to="/models">← {t('public.modelDetail.backCatalog')}</Link>
      <section className="public-model-hero" aria-labelledby="modelTitle">
        <div>
          <div className="public-model-detail-identity"><ModelLogo model={model} className="public-model-detail-logo" /><div><p className="public-model-detail-kicker">{publicCompanyLabel(t, model.company)}</p><h1 id="modelTitle">{model.name}</h1><p className="public-model-detail-id">{t('public.modelDetail.alias', { alias: displayAlias })}</p></div></div>
          <div className="public-model-detail-meta"><span className="badge">{publicModalityLabel(t, model.modality)}</span>{model.context ? <span className="badge">{t('public.modelDetail.context', { value: model.context })}</span> : null}<span className="badge">{t('public.models.capabilityCount', { count: model.capabilities.length })}</span></div>
        </div>
        <div className="public-model-detail-actions"><LoginRequiredAction className="btn btn-secondary" returnPath={'/console/playground?model=' + modelQuery}>{t('public.modelDetail.onlineTest')}</LoginRequiredAction><LoginRequiredAction className="btn btn-primary" returnPath={'/console/api-keys?model=' + modelQuery}>{t('public.modelDetail.apiAccess')}</LoginRequiredAction></div>
      </section>

      <div className="public-model-detail-grid">
        <div>
          <section className="public-model-detail-section" aria-labelledby="capabilitiesTitle"><h2 id="capabilitiesTitle">{t('public.modelDetail.capabilitiesTitle')}</h2><div className="public-model-detail-capabilities">{model.capabilities.map((capability) => <span className="badge" key={capability}>{publicCapabilityLabel(t, capability)}</span>)}</div><p>{t('public.modelDetail.contextWindow', { value: model.context ?? t('public.modelDetail.byParameter') })}</p></section>
          <section className="public-model-detail-section" aria-labelledby="pricingTitle"><h2 id="pricingTitle">{t('public.modelDetail.pricingTitle')}</h2><div className="public-table-wrap"><table className="public-model-detail-prices"><tbody><tr><th scope="row">{t('public.models.officialPrice')}</th><td>{formatPublicPrice(model.officialPrice)}</td></tr><tr><th scope="row">{t('public.models.tokenNxPrice')}</th><td><strong><ModelPriceSummary price={model.tokenNxPrice} /></strong></td></tr></tbody></table></div><p className="public-model-price-note">{t('public.modelDetail.priceNote')}</p></section>
          <section className="public-model-detail-section" aria-labelledby="boundaryTitle"><h2 id="boundaryTitle">{t('public.modelDetail.boundaryTitle')}</h2><p>{t('public.modelDetail.boundaryText')}</p></section>
        </div>
        <aside className="public-model-connect" aria-labelledby="connectTitle"><h2 id="connectTitle">{t('public.modelDetail.accessTitle')}</h2><dl><div><dt>{t('public.modelDetail.baseUrl')}</dt><dd><code>{QUICKSTART_API_BASE_URL}</code></dd></div><div><dt>{t('public.modelDetail.aliasLabel')}</dt><dd><code>{displayAlias}</code></dd></div><div><dt>{t('public.modelDetail.defaultProtocol')}</dt><dd>{t('public.modelDetail.protocolValue')}</dd></div></dl><p>{t('public.modelDetail.accessHint')}</p><LoginRequiredAction className="btn btn-primary" returnPath={'/console/api-keys?model=' + modelQuery}>{t('public.modelDetail.createApiKey')}</LoginRequiredAction></aside>
      </div>
    </PublicLayout>
  )
}

const RANKING_SERIES_COLORS = ['#f476b7', '#c6a4ff', '#3981ec', '#ddd784', '#ebb849', '#f47154', '#b86bbd', '#d64f25', '#678032', '#e7834f'] as const
const RANKING_USAGE_POINTS = Array.from({ length: 46 }, (_, index) => {
  const base = index < 18 ? 8 + Math.sin(index / 3) * 3 : 8 + (index - 17) * 3.1
  const surge = index > 31 ? (index - 31) * 2.6 : 0
  const peak = index > 41 ? (index % 2 === 0 ? 24 : 9) : 0
  const total = Math.max(6, base + surge + peak)
  return RANKING_SERIES_COLORS.map((_, seriesIndex) => Math.max(1.5, total * (.11 + ((seriesIndex * 7 + index) % 5) * .018)))
})

const RANKING_MODELS = Array.from({ length: 10 }, (_, index) => ({
  id: `mimo-ranking-${index + 1}`,
  name: 'MiMo-V2.5',
  provider: 'by xiaomi',
  tokens: index < 8 ? '8.9T tokens' : `${(8.7 - (index - 8) * .3).toFixed(1)}T tokens`,
  trend: index === 8 ? '↑4%' : '↓9%',
}))

export function RankingsPage() {
  const { t } = useTranslation()
  const [rankingRange, setRankingRange] = useState('week')
  const [rangeMenuOpen, setRangeMenuOpen] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const visibleModels = showAll ? RANKING_MODELS : RANKING_MODELS.slice(0, 8)
  const rankingModalities = [
    ['text', 'T'], ['image', '▧'], ['embedding', '⌘'], ['rerank', '⇅'], ['video', '▣'], ['speech', '♙'], ['transcription', '♩'],
  ] as const
  const rankingRanges = ['today', 'week', 'month', 'popular'] as const

  return (
    <PublicLayout mainClassName="rankings-page--manuscript">
      <nav className="ranking-modality-nav" aria-label={t('public.rankings.modalityLabel')}>
        <div className="ranking-modality-nav-inner">
          {rankingModalities.map(([key, icon], index) => <button className={index === 0 ? 'is-active' : ''} type="button" key={key}><span aria-hidden="true">{icon}</span>{t(`public.rankings.modalities.${key}`)}</button>)}
        </div>
      </nav>

      <div className="ranking-shell">
        <aside className="ranking-sidebar" aria-label={t('public.rankings.pageNavLabel')}>
          <a className="is-active" href="#top-models"><span aria-hidden="true">▥</span>{t('public.rankings.topModelsNav')}</a>
          <a href="#model-ranking"><span aria-hidden="true">♧</span>{t('public.rankings.leaderboardNav')}</a>
        </aside>

        <main className="ranking-content">
          <section id="top-models" className="ranking-top-section">
            <header><h1>{t('public.rankings.topTitle')}</h1><p>{t('public.rankings.topDescription')}</p></header>
            <div className="ranking-chart-layout">
              <div className="ranking-chart" role="img" aria-label={t('public.rankings.chartLabel')}>
                <div className="ranking-chart-y-axis" aria-hidden="true"><span>80T</span><span>60T</span><span>40T</span><span>20T</span></div>
                <div className="ranking-chart-plot" aria-hidden="true">
                  <i className="ranking-grid-line" /><i className="ranking-grid-line" /><i className="ranking-grid-line" /><i className="ranking-grid-line" />
                  <div className="ranking-chart-bars">{RANKING_USAGE_POINTS.map((segments, pointIndex) => <span className="ranking-chart-bar" key={pointIndex}>{segments.map((height, seriesIndex) => <i key={seriesIndex} style={{ height: `${height}px`, backgroundColor: RANKING_SERIES_COLORS[seriesIndex] }} />)}</span>)}</div>
                </div>
                <div className="ranking-chart-x-axis" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <span key={index}>{t(`public.rankings.dates.${index}`)}</span>)}</div>
              </div>

              <aside className="ranking-legend" aria-label={t('public.rankings.legendLabel')}>
                <time dateTime="2026-07-13">{t('public.rankings.legendDate')}</time>
                <div className="ranking-legend-list">{RANKING_SERIES_COLORS.map((color, index) => <span className={index === 1 ? 'is-active' : ''} key={color}><i style={{ backgroundColor: color }} /><strong>{t('public.rankings.other')}</strong><em>19T</em></span>)}</div>
                <div className="ranking-legend-total"><strong>{t('public.rankings.all')}</strong><em>19T</em></div>
              </aside>
            </div>
          </section>

          <section id="model-ranking" className="ranking-list-section">
            <div className="ranking-list-head"><div><h2>{t('public.rankings.leaderboardTitle')}</h2><p>{t('public.rankings.leaderboardDescription')}</p></div>
              <div className="ranking-filters">
                <button type="button">{t('public.rankings.comparisonRange')} <span aria-hidden="true">⌄</span></button>
                <button type="button" aria-haspopup="menu" aria-expanded={rangeMenuOpen} onClick={() => setRangeMenuOpen((open) => !open)}>{t(`public.rankings.ranges.${rankingRange}`)}<span aria-hidden="true">⌄</span></button>
                {rangeMenuOpen ? <div className="ranking-range-menu" role="menu">{rankingRanges.map((value) => <button className={rankingRange === value ? 'is-active' : ''} type="button" role="menuitemradio" aria-checked={rankingRange === value} key={value} onClick={() => { setRankingRange(value); setRangeMenuOpen(false) }}><span aria-hidden="true">{rankingRange === value ? '✓' : ''}</span>{t(`public.rankings.ranges.${value}`)}</button>)}</div> : null}
              </div>
            </div>

            <div className="ranking-model-list" aria-live="polite">{visibleModels.map((model, index) => <article className="ranking-model-row" key={model.id}>
              <span className="ranking-model-number">{index + 1}.</span>
              <span className="ranking-model-logo"><img src={mimoXiaomiImage} alt="" /></span>
              <div className="ranking-model-name"><strong>{model.name}</strong><span>{model.provider}</span></div>
              <div className="ranking-model-metric"><strong>{model.tokens}</strong><span className={model.trend.startsWith('↑') ? 'is-up' : ''}>{model.trend}</span></div>
            </article>)}</div>
            <button className="ranking-show-more" type="button" aria-expanded={showAll} onClick={() => setShowAll((shown) => !shown)}>{t(showAll ? 'public.rankings.collapse' : 'public.rankings.showMore')} <span aria-hidden="true">{showAll ? '⌃' : '⌄'}</span></button>
          </section>
        </main>
      </div>
    </PublicLayout>
  )
}

const APPS_POPULAR_ITEMS = [
  { id: 'hermes-agent-1' },
  { id: 'hermes-agent-2' },
  { id: 'hermes-agent-3' },
  { id: 'hermes-agent-4' },
] as const

const APPS_USAGE_POINTS = Array.from({ length: 48 }, (_, index) => {
  const early = index < 18 ? 28 + Math.sin(index / 3) * 10 : 0
  const ramp = index >= 18 && index < 29 ? (index - 17) * 10 : 0
  const late = index >= 29 ? 76 + Math.sin(index / 2.4) * 22 + (index > 40 ? 34 : 0) : 0
  const total = Math.max(18, early + ramp + late)
  return [total * .18, total * .16, total * .27, total * .31, total * .08]
})

const APPS_RANKING_ITEMS = Array.from({ length: 12 }, (_, index) => ({
  id: `hermes-ranking-${index + 1}`,
  tokenBillions: index < 3 ? 9700 : Math.max(41, 92 - index * 4) * 100,
}))

export function AppsPage() {
  const { t } = useTranslation()
  const [timeRange, setTimeRange] = useState('today')
  const activeRangeLabel = t(`public.apps.ranges.${timeRange}`)

  return (
    <PublicLayout mainClassName="apps-page--manuscript">
      <div className="apps-shell">
        <header className="apps-page-head">
          <h1>{t('public.apps.title')}</h1>
          <p>{t('public.apps.description')}</p>
        </header>

        <section className="apps-popular-grid" aria-label={t('public.apps.popularLabel')}>
          {APPS_POPULAR_ITEMS.map((item) => <article className="apps-popular-card" key={item.id}>
            <div className="apps-popular-title"><h2>{t('public.apps.agentName')}</h2><span className="apps-agent-logo"><img src={hermesAgentImage} alt="" /></span></div>
            <p>{t('public.apps.agentSummary')}</p>
            <strong>{t('public.apps.popularTokens')}</strong>
          </article>)}
        </section>

        <section className="apps-chart-panel" aria-labelledby="appsChartTitle">
          <div className="apps-chart-heading"><h2 id="appsChartTitle">{t('public.apps.chartTitle')}</h2><span>{t('public.apps.pastThirtyDays')}</span></div>
          <div className="apps-chart" role="img" aria-label={t('public.apps.chartLabel')}>
            <div className="apps-chart-y-axis" aria-hidden="true"><span>1.6T</span><span>1.2T</span><span>800B</span><span>400B</span></div>
            <div className="apps-chart-plot">
              <span className="apps-chart-grid-line" /><span className="apps-chart-grid-line" /><span className="apps-chart-grid-line" /><span className="apps-chart-grid-line" />
              <div className="apps-chart-bars" aria-hidden="true">{APPS_USAGE_POINTS.map((segments, pointIndex) => <span className="apps-chart-bar" key={pointIndex}>{segments.map((height, segmentIndex) => <i key={segmentIndex} style={{ height: `${height}px` }} />)}</span>)}</div>
            </div>
            <div className="apps-chart-x-axis" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <span key={index}>{t(`public.apps.dates.${index}`)}</span>)}</div>
          </div>
        </section>

        <div className="apps-ranking-filter">
          <label className="public-sr-only" htmlFor="apps-time-range">{t('public.apps.rangeLabel')}</label>
          <select id="apps-time-range" value={timeRange} onChange={(event) => setTimeRange(event.target.value)}>
            <option value="today">{t('public.apps.ranges.today')}</option>
            <option value="week">{t('public.apps.ranges.week')}</option>
            <option value="month">{t('public.apps.ranges.month')}</option>
          </select>
        </div>

        <section className="apps-ranking-list" aria-label={t('public.apps.rankingLabel', { range: activeRangeLabel })}>
          {APPS_RANKING_ITEMS.map((item, index) => <article className="apps-ranking-row" key={item.id}>
            <span className="apps-ranking-number">{index + 1}.</span>
            <i className="apps-ranking-dot" aria-hidden="true" />
            <span className="apps-agent-logo apps-agent-logo--small"><img src={hermesAgentImage} alt="" /></span>
            <div><h2>{t('public.apps.agentName')}</h2><p>{t('public.apps.agentDescription')}</p></div>
            <strong>{t('public.apps.rankingTokens', { count: item.tokenBillions })}</strong>
          </article>)}
        </section>
      </div>
    </PublicLayout>
  )
}

export function DocsPage() {
  const { t } = useTranslation()
  const code = quickstartCodeSample({ protocol: 'openai', language: 'curl', modelAlias: 'deepseek-public' })
  const [copied, setCopied] = useState<'code' | 'page' | 'mcp' | null>(null)
  const [copyMenuOpen, setCopyMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('overview')

  const sidebarItems = [
    ['overview', 'overview'],
    ['quickstart', 'quickstart'],
    ['batch', 'batch'],
    ['original', 'original'],
    ['models', 'models'],
    ['mcp', 'mcp'],
    ['servers', 'servers'],
    ['providers', 'providers'],
    ['parameters', 'parameters'],
    ['privacy', 'privacy'],
    ['troubleshooting', 'troubleshooting'],
    ['principles', 'principles'],
    ['authentication', 'authentication'],
    ['api-keys', 'apiKeys'],
    ['byok', 'byok'],
    ['rate-limits', 'rateLimits'],
    ['uptime', 'uptime'],
    ['limits', 'limits'],
  ] as const

  const markdownPage = `# ${t('public.docs.manuscript.quickstart')}\n\n${t('public.docs.manuscript.quickstartSubtitle')}\n\n${code}`

  async function copyText(value: string, type: 'code' | 'page' | 'mcp'): Promise<void> {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(type)
      Toast.success(t(type === 'code' ? 'public.docs.manuscript.copyCodeSuccess' : type === 'page' ? 'public.docs.manuscript.copyPageSuccess' : 'public.docs.manuscript.copyMcpSuccess'))
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      Toast.error(t('public.docs.manuscript.copyUnsupported'))
    }
  }

  return (
    <PublicLayout mainClassName="docs-page--manuscript">
      <nav className="docs-product-nav" aria-label={t('public.docs.manuscript.productNavLabel')}>
        <div className="docs-product-nav-inner">
          <Link className="is-active" to="/docs"><span aria-hidden="true">▣</span>{t('public.docs.manuscript.productNav.docs')}</Link>
          <button type="button"><span aria-hidden="true">⌘</span>{t('public.docs.manuscript.productNav.apiReference')}</button>
          <button type="button"><span aria-hidden="true">&lt;/&gt;</span>{t('public.docs.manuscript.productNav.clientSdk')}</button>
          <button type="button"><span aria-hidden="true">◇</span>{t('public.docs.manuscript.productNav.agentSdk')}</button>
          <button type="button"><span aria-hidden="true">✣</span>{t('public.docs.manuscript.productNav.recipes')}</button>
        </div>
      </nav>

      <div className="docs-shell">
        <aside className="docs-sidebar" aria-label={t('public.docs.manuscript.sidebarLabel')}>
          <nav>
            {sidebarItems.map(([id, labelKey]) => <a className={activeSection === id ? 'is-active' : ''} href={`#${id}`} key={id} onClick={() => setActiveSection(id)}><span aria-hidden="true">◇</span>{t(`public.docs.manuscript.sidebar.${labelKey}`)}</a>)}
          </nav>
        </aside>

        <article className="docs-article">
          <div className="docs-article-toolbar">
            <div className="docs-copy-control">
              <button type="button" aria-expanded={copyMenuOpen} aria-haspopup="menu" onClick={() => setCopyMenuOpen((open) => !open)}><IconCopyStroked aria-hidden="true" /><span>{t('public.docs.manuscript.copyPage')}</span><IconChevronDown aria-hidden="true" /></button>
              {copyMenuOpen ? <div className="docs-copy-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => void copyText(markdownPage, 'page')}><span><IconCopyStroked aria-hidden="true" /></span><strong>{t('public.docs.manuscript.copyPage')}</strong><small>{t('public.docs.manuscript.copyPageDescription')}</small></button>
                <a role="menuitem" href="data:text/plain;charset=utf-8,%23%20Token%20NX%20Quickstart" target="_blank" rel="noreferrer"><span><IconFile aria-hidden="true" /></span><strong>{t('public.docs.manuscript.viewMarkdown')}</strong><small>{t('public.docs.manuscript.viewMarkdownDescription')}</small></a>
                <button type="button" role="menuitem" onClick={() => void copyText(`${QUICKSTART_API_BASE_URL}/mcp`, 'mcp')}><span>&lt;/&gt;</span><strong>{t('public.docs.manuscript.copyMcp')}</strong><small>{t('public.docs.manuscript.copyMcpDescription')}</small></button>
                <a role="menuitem" href="https://cursor.com" target="_blank" rel="noreferrer"><span>C</span><strong>{t('public.docs.manuscript.connectCursor')}</strong><small>{t('public.docs.manuscript.connectCursorDescription')}</small></a>
                <a role="menuitem" href="https://code.visualstudio.com" target="_blank" rel="noreferrer"><span>V</span><strong>{t('public.docs.manuscript.connectVsCode')}</strong><small>{t('public.docs.manuscript.connectVsCodeDescription')}</small></a>
              </div> : null}
            </div>
          </div>

          <header id="overview" className="docs-article-head">
            <span>{t('public.docs.manuscript.overview')}</span>
            <h1>{t('public.docs.manuscript.quickstart')}</h1>
            <p>{t('public.docs.manuscript.quickstartSubtitle')}</p>
          </header>

          <section id="quickstart" className="docs-section">
            <p>{t('public.docs.manuscript.introduction')}</p>
            <p>{t('public.docs.manuscript.integrationOptions')}</p>
            <div className="docs-method-table" role="table" aria-label={t('public.docs.manuscript.methodComparison')}>
              <div role="row"><strong role="columnheader">{t('public.docs.manuscript.method')}</strong><strong role="columnheader">{t('public.docs.manuscript.bestFor')}</strong></div>
              <div role="row"><a href="#openrouter-api" role="cell">API</a><span role="cell">{t('public.docs.manuscript.apiBestFor')}</span></div>
              <div role="row"><a href="#client-sdk" role="cell">{t('public.docs.manuscript.productNav.clientSdk')}</a><span role="cell">{t('public.docs.manuscript.clientSdkBestFor')}</span></div>
              <div role="row"><a href="#proxy-sdk" role="cell">{t('public.docs.manuscript.productNav.agentSdk')}</a><span role="cell">{t('public.docs.manuscript.agentSdkBestFor')}</span></div>
            </div>
          </section>

          <section id="openrouter-api" className="docs-section docs-api-section">
            <div className="docs-code-block">
              <div className="docs-code-head"><span>cURL</span><button type="button" aria-label={t('public.docs.manuscript.copyCurl')} title={t('public.docs.manuscript.copyCurl')} onClick={() => void copyText(code, 'code')}><IconCopyStroked aria-hidden="true" /></button></div>
              <pre><code>{code}</code></pre>
            </div>
            <div className="docs-note"><strong>{t('public.docs.manuscript.tip')}</strong><span>{t('public.docs.manuscript.routingTip')}</span></div>
            <p>{t('public.docs.manuscript.routingDescription')}</p>
          </section>

          <section id="client-sdk" className="docs-section">
            <h2>{t('public.docs.manuscript.thirdPartyTitle')}</h2>
            <p>{t('public.docs.manuscript.thirdPartyDescription')}</p>
          </section>

          <section id="proxy-sdk" className="docs-section">
            <h2>{t('public.docs.manuscript.assistantTitle')}</h2>
            <p>{t('public.docs.manuscript.assistantDescription')}</p>
            <div className="docs-mcp-url"><code>{QUICKSTART_API_BASE_URL}/mcp</code><button type="button" aria-label={t('public.docs.manuscript.copyMcp')} title={t('public.docs.manuscript.copyMcp')} onClick={() => void copyText(`${QUICKSTART_API_BASE_URL}/mcp`, 'mcp')}><IconCopyStroked aria-hidden="true" /></button></div>
            <p>{t('public.docs.manuscript.assistantGuidePrefix')} <a href="#mcp">{t('public.docs.manuscript.mcpGuide')}</a>{t('public.docs.manuscript.assistantGuideSuffix')}</p>
          </section>

          <Link id="batch" className="docs-next-link" to="/docs#batch">{t('public.docs.manuscript.nextBatch')} <span aria-hidden="true">-&gt;</span></Link>
          <span className="docs-copy-status" aria-live="polite">{copied ? t(copied === 'code' ? 'public.docs.manuscript.copyCodeSuccess' : copied === 'page' ? 'public.docs.manuscript.copyPageSuccess' : 'public.docs.manuscript.copyMcpSuccess') : ''}</span>
        </article>

        <aside className="docs-on-page" aria-label={t('public.docs.manuscript.onPageLabel')}>
          <strong>{t('public.docs.manuscript.onPageTitle')}</strong>
          <a className="is-active" href="#openrouter-api">{t('public.docs.manuscript.onPage.api')}</a>
          <a href="#client-sdk">{t('public.docs.manuscript.onPage.clientSdk')}</a>
          <a href="#proxy-sdk">{t('public.docs.manuscript.onPage.agentSdk')}</a>
          <a href="#openai-sdk">{t('public.docs.manuscript.onPage.openaiSdk')}</a>
          <a href="#third-party-sdk">{t('public.docs.manuscript.onPage.thirdPartySdk')}</a>
          <a href="#ai-assistant">{t('public.docs.manuscript.onPage.aiAssistant')}</a>
        </aside>
      </div>
    </PublicLayout>
  )
}

export function PricingPage() {
  const { t } = useTranslation()
  return (
    <PublicLayout mainClassName="public-page" footerLabel="public.pricing.footerLabel" footerLinks={[{ label: 'footer.docs', path: '/docs' }, { label: 'footer.terms', path: '/terms' }]}>
      <header className="public-page-head"><h1>{t('public.pricing.title')}</h1><p>{t('public.pricing.description')}</p><div className="public-actions"><Link className="btn btn-primary" to="/models">{t('public.pricing.viewCapabilities')}</Link><LoginRequiredAction className="btn btn-secondary" returnPath="/console/quickstart">{t('public.pricing.startIntegration')}</LoginRequiredAction></div></header>
      <section className="public-section"><div className="public-table-wrap"><table className="public-table"><thead><tr><th>{t('public.pricing.model')}</th><th>{t('public.pricing.type')}</th><th>{t('public.pricing.officialPrice')}</th><th>{t('public.pricing.tokenNxPrice')}</th></tr></thead><tbody>{MODEL_CATALOG.map((model) => <tr key={model.id}><td>{model.name}</td><td>{publicModalityLabel(t, model.modality)}</td><td>{formatPublicPrice(model.officialPrice)}</td><td><ModelPriceSummary price={model.tokenNxPrice} /></td></tr>)}</tbody></table></div></section>
      <section className="public-section"><h2>{t('public.pricing.localCostTitle')}</h2><div className="public-grid"><div className="public-grid-item"><h3>{t('public.pricing.textModel')}</h3><p>{t('public.pricing.textModelDescription')}</p></div><div className="public-grid-item"><h3>{t('public.pricing.generationModel')}</h3><p>{t('public.pricing.generationModelDescription')}</p></div><div className="public-grid-item"><h3>{t('public.pricing.failedRequest')}</h3><p>{t('public.pricing.failedRequestDescription')}</p></div></div></section>
    </PublicLayout>
  )
}

export function StatusPage() {
  const { t } = useTranslation()
  const platformKeys = ['openai', 'claude', 'console', 'billing'] as const
  return (
    <PublicLayout mainClassName="public-page" footerLabel="public.status.footerLabel" footerLinks={[{ label: 'footer.docs', path: '/docs' }, { label: 'footer.about', path: '/about' }]}>
      <header className="public-page-head"><h1>{t('public.status.title')}</h1><p>{t('public.status.description')}</p></header>
      <section className="public-section"><div className="callout"><strong>{t('public.status.calloutTitle')}</strong><span>{t('public.status.calloutText')}</span></div></section>
      <section className="public-section" aria-labelledby="modelStatusTitle"><h2 id="modelStatusTitle">{t('public.status.modelTitle')}</h2><p>{t('public.status.modelDescription')}</p><div>{MODEL_CATALOG.map((model) => <div className="status-row" key={model.id}><span className="status-identity"><strong>{model.name}</strong><span>{publicCompanyLabel(t, model.company)}</span></span><span className="badge">{t('public.status.monitoringUnavailable')}</span></div>)}</div></section>
      <section className="public-section"><h2>{t('public.status.platformTitle')}</h2>{platformKeys.map((key) => <div className="status-row" key={key}><span>{t(`public.status.platform.${key}`)}</span><span className="badge">{t('public.status.monitoringUnavailable')}</span></div>)}</section>
      <section className="public-section"><h2>{t('public.status.incidentTitle')}</h2><p>{t('public.status.incidentDescription')}</p><div className="public-actions"><LoginRequiredAction className="btn btn-primary" returnPath="/console/records">{t('public.status.viewRecords')}</LoginRequiredAction><Link className="btn btn-secondary" to="/docs">{t('public.status.viewErrors')}</Link></div></section>
    </PublicLayout>
  )
}

export function AboutPage() {
  const { t } = useTranslation()
  return <PublicLayout mainClassName="public-page"><header className="public-page-head"><h1>{t('public.about.title')}</h1><p>{t('public.about.description')}</p></header><section className="public-section"><h2>{t('public.about.boundaryTitle')}</h2><div className="public-grid"><div className="public-grid-item"><h3>{t('public.about.catalogTitle')}</h3><p>{t('public.about.catalogDescription')}</p></div><div className="public-grid-item"><h3>{t('public.about.requestTitle')}</h3><p>{t('public.about.requestDescription')}</p></div><div className="public-grid-item"><h3>{t('public.about.upstreamTitle')}</h3><p>{t('public.about.upstreamDescription')}</p></div></div></section><section className="public-section"><h2>{t('public.about.stageTitle')}</h2><p>{t('public.about.stageDescription')}</p><div className="public-actions"><Link className="btn btn-primary" to="/models">{t('public.about.browseModels')}</Link><Link className="btn btn-secondary" to="/docs">{t('public.about.viewDocs')}</Link></div></section></PublicLayout>
}

export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const { t } = useTranslation()
  const isTerms = kind === 'terms'
  const sectionKeys = isTerms ? ['account', 'pricing', 'pending'] as const : ['records', 'console', 'pending'] as const
  const resourceKey = isTerms ? 'terms' : 'privacy'
  return <PublicLayout mainClassName="public-page"><header className="public-page-head"><h1>{t(`public.legal.${resourceKey}.title`)}</h1><p>{t(`public.legal.${resourceKey}.intro`)}</p></header>{sectionKeys.map((sectionKey) => <section className="public-section" key={sectionKey}><h2>{t(`public.legal.${resourceKey}.sections.${sectionKey}.title`)}</h2><p>{t(`public.legal.${resourceKey}.sections.${sectionKey}.text`)}</p></section>)}</PublicLayout>
}

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnPath = normalizeLoginReturnPath(searchParams.get('return'))
  // 中文：登录页没有公共页脚，仍然需要保留全局客服入口。
  return <div className="login-page"><div className="login-card"><LoginPanel onSuccess={() => navigate(returnPath)} /></div><ManuscriptSupportWidget /></div>
}
