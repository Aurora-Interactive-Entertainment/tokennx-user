import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { TFunction } from 'i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import Skeleton from '@douyinfe/semi-ui/lib/es/skeleton'
import { IconBookOpenStroked, IconChevronDown, IconCopyStroked, IconFile } from '@douyinfe/semi-icons'
import { LoginPanel, LoginRequiredAction, ManuscriptSupportWidget, PublicLayout, ModelLogo, normalizeLoginReturnPath, requestSupportWidget } from '@/components/common'
import modelCardArt from '@/assets/figma-home/model-card-art.png'
import promoModelLogo from '@/assets/figma-home/promo-model-logo.svg'
import promoBannerArt from '@/assets/figma-home/promo-banner.png'
import promoArticleArt from '@/assets/figma-home/promo-article.png'
import '@/mobile-home.css'
import '@/docs-page.css'
import { ModelPriceSummary } from '@/components/money'
import { ModelAvailability } from '@/components/model-availability'
import { MarkdownContent } from '@/components/markdown-content'
import { CompatSelect as Select } from '@/components/semi-compat'
import { getPublicHomepage, getPublicHomepageAssetURL, getPublicHomepageMediaURL, getPublicHomepageStats, type HomepageDiscountKind, type HomepageEntry, type HomepagePromotionModel, type HomepageTranslation, type PublicHomepage } from '@/api/homepage'
import { getModelUsageLeaderboard, getRecentModelUsage, type ModelUsageLeaderboard, type RecentModelUsage } from '@/api/model-rankings'
import { getToolUsageClients, getToolUsageLeaderboard, type ToolUsageClients, type ToolUsageLeaderboard } from '@/api/tool-usage'
import { getPublicDocument, getPublicDocumentAssetUrl, getPublicDocsTree, publicDocumentHref, type PublicDocument, type PublicDocsLocale, type PublicDocsNode } from '@/api/public-docs'
import { getPublicModelMarket, type PublicMarketModel, type PublicMarketTopic, type PublicModelMarket } from '@/api/public-model-market'
import { isApiError } from '@/api/http'
import { findModel, findModelInList, modelAlias, modelRouteKey, MODEL_CATALOG, MODALITY_LABELS, type ModelAvailabilityHour, type ModelModality, type ModelPrice, type ModelRecord } from '@/data/models'
import { getAccessToken } from '@/auth/token-storage'
import { useAppSelector } from '@/store/hooks'
import { QUICKSTART_API_BASE_URL, quickstartCodeSample } from '@/utils/quickstart'
import { useTranslation } from 'react-i18next'
import { formatRankingTokens, RankingRecentUsageChart } from '@/components/ranking-usage-chart'
import { formatToolUsageTokens, ToolUsageClientsChart } from '@/components/tool-usage-chart'
import { apiTimeToDate } from '@/utils/format'
import { ModelsShowcase, type ModelsShowcaseGroup } from '@/components/public-models-showcase'
import { HomeRewardStat } from '@/components/home-reward-stat'

function formatPublicPrice(price: ModelPrice): ReactNode {
  return <ModelPriceSummary price={price} />
}

// 中文：公开页面的模型链接只使用面向用户的别名，旧模型 code 仅由查找逻辑兼容。
function modelPublicHref(model: { id: string; alias?: string }): string | undefined {
  const routeKey = modelRouteKey(model)
  return routeKey ? `/models/${encodeURIComponent(routeKey)}` : undefined
}

const HOME_MODEL_MOSAIC_COLUMNS = 6
const HOME_REWARD_STATS = [
  { value: '00', unitKey: 'rewardPendingUnit', labelKey: 'rewardPending' },
  { value: '00', unitKey: 'rewardApprovedUnit', labelKey: 'rewardApproved' },
  { value: '00', unitKey: 'rewardRejectedUnit', labelKey: 'rewardRejected' },
] as const
const HOME_REWARD_AVATAR_COUNT = 6
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

function homepageNavigationHref(value: string): string {
  try {
    return new URL(value, window.location.origin).toString()
  } catch {
    return value
  }
}

function homepageDate(value: number | undefined, language: string): string {
  if (value === undefined) return ''
  const date = apiTimeToDate(value)
  if (!date) return ''
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

function homepageMediaURL(objectID: string | undefined, fallbackURL: unknown): string | undefined {
  return getPublicHomepageAssetURL(objectID) ?? getPublicHomepageMediaURL(fallbackURL)
}

function homepageString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized || undefined
}

// 首页运营条目在不同版本接口中可能把图片放在翻译字段或条目根字段，统一从接口数据解析。
function homepageEntryMediaURL(entry: HomepageEntry, language: string): string | undefined {
  const locale = homepageLocale(language)
  const localizedContent = entry.data.translations?.[locale]
  const fallbackLocale = locale === 'en-US' ? 'zh-CN' : 'en-US'
  const fallbackContent = entry.data.translations?.[fallbackLocale]
  const rootData = entry.data
  const rootObjectID = homepageString(rootData.image_object_id)
  const rootImageURL = homepageString(rootData.image_url) ?? homepageString(rootData.cover_url)
  return homepageMediaURL(
    homepageString(localizedContent?.image_object_id) ?? homepageString(fallbackContent?.image_object_id) ?? rootObjectID,
    homepageString(localizedContent?.image_url)
      ?? homepageString(localizedContent?.cover_url)
      ?? homepageString(fallbackContent?.image_url)
      ?? homepageString(fallbackContent?.cover_url)
      ?? rootImageURL,
  )
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
  const featureIndex = index % 3
  const title = t(`home.rebuild.featureCards.${featureIndex}.title`)
  const description = t(`home.rebuild.featureCards.${featureIndex}.description`)
  const action = t(`home.rebuild.featureCards.${featureIndex}.action`)
  const imageURL = homepageMediaURL(content.image_object_id, content.image_url)
  const configuredPath = content.link_url?.trim()
  // 中文：有后台目标时走统一登录态动作；旧数据缺少链接时保留兼容入口。
  const actionElement = featureIndex === 0
    ? <a className="manuscript-feature-action" href={homepageNavigationHref('/models')}>{action}</a>
    : configuredPath
      ? <LoginRequiredAction className="manuscript-feature-action" returnPath={configuredPath}>{action}</LoginRequiredAction>
      : <a className="manuscript-feature-action" href={homepageNavigationHref(featureIndex === 1 ? '/models' : '/pricing')}>{action}</a>
  return <article className="manuscript-feature-card">
    <div className="manuscript-feature-visual">{imageURL ? <img className="manuscript-feature-image" src={imageURL} alt="" aria-hidden="true" loading={index === 0 ? 'eager' : 'lazy'} fetchPriority={index === 0 ? 'high' : 'auto'} decoding="async" width={416} height={106} /> : <HomeFeatureArtwork priority={index === 0} />}<span>{index === 0 ? t('home.rebuild.featureModelsCount') : t('home.rebuild.featuresTitle')}</span></div>
    <div className="manuscript-feature-copy">
      <h3>{title}</h3>
      <p>{description}</p>
      {actionElement}
    </div>
  </article>
}

function ManagedNewsCard({ entry, newsIndex }: { entry: HomepageEntry; newsIndex: number }) {
  const { t, i18n } = useTranslation()
  // 中文：资讯卡固定进入对应文章详情，忽略后台遗留的文档链接，避免离开文章阅读页。
  const href = `/news/${encodeURIComponent(entry.id)}`
  const title = t(`home.rebuild.news.${newsIndex}.title`)
  const description = t(`home.rebuild.news.${newsIndex}.description`)
  const coverURL = homepageEntryMediaURL(entry, i18n.language)
  const card = <><div className="manuscript-news-copy"><h3 title={title}>{title}</h3><p title={description}>{description}</p><small>{homepageDate(entry.updated_at, i18n.language)} <b className="manuscript-news-new">{t('public.home.newBadge')}</b></small></div><div className={`manuscript-news-art manuscript-news-art--${newsIndex}`} aria-hidden="true"><img className="manuscript-news-art-image" src={coverURL || promoArticleArt} alt="" loading="lazy" decoding="async" width={850} height={333} onError={(event) => {
    if (event.currentTarget.getAttribute('src') !== promoArticleArt) event.currentTarget.src = promoArticleArt
    // 中文：封面失效时回退到本地默认图，避免卡片出现破图。
    if (event.currentTarget.getAttribute('src') !== promoArticleArt) event.currentTarget.src = promoArticleArt
  }} /></div></>
  return <Link className="manuscript-news-card" to={href}>{card}</Link>
}

function ManagedAdSlots({ entries }: { entries: HomepageEntry[] }) {
  const { t, i18n } = useTranslation()
  return <div className="manuscript-ad-slots">{entries.map((entry) => {
    const content = homepageTranslation(entry, i18n.language)
    const imageURL = homepageEntryMediaURL(entry, i18n.language)
    const ad = <img src={imageURL || promoBannerArt} alt={content.title || t('home.rebuild.adSlot')} loading="lazy" decoding="async" width={850} height={193} />
    // 中文：推广广告统一承接邀请活动，未登录时由公共登录弹窗完成后续跳转。
    return <LoginRequiredAction className="manuscript-ad-slot" key={entry.id} returnPath="/console/invitations">{ad}</LoginRequiredAction>
  })}</div>
}

type HomePromotionRouteModel = Pick<ModelRecord, 'id' | 'alias'>
type HomePromotionItem = { id: string; model: HomePromotionRouteModel; name: string; company: string; logoUrl?: string; discountKind: HomepageDiscountKind; input: string; output: string; availability?: number; hourly: ModelAvailabilityHour[] }

const HOME_DEFAULT_PROMOTION_MODEL = findModel('claude-sonnet-4') ?? MODEL_CATALOG[0]
const HOME_DEFAULT_PROMOTION_ITEMS: HomePromotionItem[] = [
  { id: 'claude-opus-promo-1', model: HOME_DEFAULT_PROMOTION_MODEL, name: 'Claude Opus 4.8', company: 'Anthropic', discountKind: 'half', input: '0.1', output: '0.1', availability: HOME_DEFAULT_PROMOTION_MODEL.availability.rate, hourly: HOME_DEFAULT_PROMOTION_MODEL.availability.hourly ?? [] },
  { id: 'claude-opus-promo-2', model: HOME_DEFAULT_PROMOTION_MODEL, name: 'Claude Opus 4.8', company: 'Anthropic', discountKind: 'free', input: '0.1', output: '0.1', availability: HOME_DEFAULT_PROMOTION_MODEL.availability.rate, hourly: HOME_DEFAULT_PROMOTION_MODEL.availability.hourly ?? [] },
  { id: 'claude-opus-promo-3', model: HOME_DEFAULT_PROMOTION_MODEL, name: 'Claude Opus 4.8', company: 'Anthropic', discountKind: 'half', input: '0.1', output: '0.1', availability: HOME_DEFAULT_PROMOTION_MODEL.availability.rate, hourly: HOME_DEFAULT_PROMOTION_MODEL.availability.hourly ?? [] },
]

function homepageModelPrice(model: HomepagePromotionModel, meterKind: 'input_token' | 'output_token'): string {
  const price = model.prices.find((item) => item.meter_kind === meterKind)
  if (!price) return '--'
  const unitPrice = typeof price.unit_price_yuan === 'number' ? price.unit_price_yuan : Number(price.unit_price_yuan)
  if (!Number.isFinite(unitPrice)) return '--'
  return homepagePrice(unitPrice * (1_000_000 / price.unit_quantity))
}

function managedPromotionItems(homepage: PublicHomepage | null, language: string): HomePromotionItem[] {
  if (!homepage?.promotion_models.length) return HOME_DEFAULT_PROMOTION_ITEMS
  const managedItems = homepage.promotion_models.flatMap((entry): HomePromotionItem[] => {
    const content = homepageTranslation(entry, language)
    if (entry.model) {
      return [{
        id: entry.id,
        model: entry.model,
        // 优惠模型卡片名称和厂商以接口嵌套 model 为准，避免被活动翻译标题覆盖。
        name: entry.model.name,
        company: entry.model.company,
        logoUrl: entry.model.logo_url,
        discountKind: entry.data.discount_kind ?? 'half',
        input: homepageModelPrice(entry.model, 'input_token'),
        output: homepageModelPrice(entry.model, 'output_token'),
        availability: entry.model.availability?.rate,
        hourly: (entry.model.availability?.hourly ?? []).map((point) => ({
          hourStart: point.hour_start,
          rate: point.rate,
          ...(point.sample_count !== undefined ? { sampleCount: point.sample_count } : {}),
          ...(point.success_count !== undefined ? { successCount: point.success_count } : {}),
        })),
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
      availability: model.availability.rate,
      hourly: model.availability.hourly ?? [],
    }]
  })
  return managedItems.length ? managedItems : HOME_DEFAULT_PROMOTION_ITEMS
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

function SplitTextReveal({ text, as = 'span', delayOffset = 0 }: { text: string; as?: 'span' | 'strong'; delayOffset?: number }) {
  const Tag = as
  return (
    <Tag className="manuscript-hero-split" aria-label={text}>
      {Array.from(text).map((character, index) => (
        <span
          className="manuscript-hero-split-char"
          aria-hidden="true"
          key={`${character}-${index}`}
          style={{ '--hero-char-index': index + delayOffset } as CSSProperties}
        >
          {character === ' ' ? '\u00a0' : character}
        </span>
      ))}
    </Tag>
  )
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
  const homepageLanguageRef = useRef(i18n.language)

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
  // 资讯文案为 i18n 固定内容、封面图来自接口条目；按接口翻译标题匹配文案槽位，
  // 避免接口排序与 i18n 顺序不一致时文案与封面错配；未匹配条目按顺序回填剩余槽位。
  const managedNewsSlots = useMemo(() => {
    const titles = [t('home.rebuild.news.0.title'), t('home.rebuild.news.1.title')]
    const matched = managedNews.map((entry) => {
      const title = homepageTranslation(entry, i18n.language).title?.trim() ?? ''
      return title ? titles.indexOf(title) : -1
    })
    const used = new Set(matched.filter((slot) => slot >= 0))
    let next = 0
    return matched.map((slot) => {
      if (slot >= 0) return slot
      while (used.has(next)) next += 1
      used.add(next)
      return next
    })
  }, [managedNews, i18n.language, t])
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

  useEffect(() => {
    if (homepageLanguageRef.current === i18n.language) return
    homepageLanguageRef.current = i18n.language
    refreshHomepage(authStatus === 'authenticated' ? getAccessToken() ?? undefined : undefined)
  }, [authStatus, i18n.language, refreshHomepage])

  const homeMetrics = useHomeMetrics()
  const animatedTokenVolume = useScoreboardValue(homeMetrics.tokenVolume)
  const animatedApiCalls = useScoreboardValue(homeMetrics.apiCalls)
  const heroTitle = t('home.rebuild.heroTitle')
  const heroSubtitle = t('home.rebuild.heroSubtitle')

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
            <h1 id="homeTitle"><SplitTextReveal text={heroTitle} /><SplitTextReveal as="strong" text={heroSubtitle} delayOffset={Array.from(heroTitle).length} /></h1>
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
            {isHomepageLoading ? <><span className="public-sr-only">{t('home.rebuild.loadingFeatures')}</span><HomeFeatureSkeletons /></> : managedCards.map((entry, index) => <ManagedFeatureCard key={entry.id} entry={entry} index={index} />)}
          </div>
        </section>

        <section className="manuscript-section manuscript-pricing" aria-labelledby="homePricingTitle">
          <div className="manuscript-section-heading manuscript-section-heading--title-only"><div><h2 id="homePricingTitle">{t('home.pricing.manuscriptTitle')}</h2><p>{t('home.pricing.latestModels')}</p></div></div>
          <div className="manuscript-price-grid" role={isHomepageLoading ? 'status' : undefined} aria-busy={isHomepageLoading || undefined}>{isHomepageLoading ? <><span className="public-sr-only">{t('home.rebuild.loadingModels')}</span><HomePriceSkeletons /></> : promotionItems.map((item) => <article className={`manuscript-price-card${item.input.length > 5 || item.output.length > 5 ? ' has-long-price' : ''}`} key={item.id}>
            <div className="manuscript-price-card-head"><Link className="manuscript-price-model" to={modelPublicHref(item.model) ?? '/models'}><span className="manuscript-price-model-logo"><img src={item.logoUrl || promoModelLogo} alt="" aria-hidden="true" loading="lazy" decoding="async" width={30} height={24} /></span><span><strong>{item.name}</strong><small>{t('home.rebuild.providedBy', { company: item.company })}</small></span></Link><span className={`manuscript-price-badge${item.discountKind === 'free' ? ' is-equal' : ''}`}>{t(`public.home.discount${item.discountKind === 'free' ? 'Free' : item.discountKind === 'custom' ? 'Custom' : 'Half'}`)}</span></div>
            <div className="manuscript-price-divider" />
            <div className="manuscript-price-values"><div><span>{t('home.rebuild.inputPrice')}</span><strong><small>¥</small>{item.input}<small>{t('public.home.priceUnit')}</small></strong></div><div><span>{t('home.rebuild.outputPrice')}</span><strong><small>¥</small>{item.output}<small>{t('public.home.priceUnit')}</small></strong></div></div>
            <ModelAvailability className="manuscript-price-availability" hourly={item.hourly} summaryRate={item.availability} label={t('home.rebuild.availability')} />
          </article>)}</div>
        </section>

        <section className="manuscript-section manuscript-promotion" aria-labelledby="homePromotionTitle">
          <div className="manuscript-section-heading"><div><h2 id="homePromotionTitle">{t('home.rebuild.promotionTitle')}</h2><p>{t('home.rebuild.manuscriptPromotionDescription')}</p></div></div>
          <div className="manuscript-promotion-grid" role={isHomepageLoading ? 'status' : undefined} aria-busy={isHomepageLoading || undefined}>{isHomepageLoading ? <><span className="public-sr-only">{t('home.rebuild.loadingPromotions')}</span><HomePromotionSkeleton /></> : <><article className="manuscript-reward-card"><h3>{t('home.rebuild.rewardTitle')}</h3><p>{t('home.rebuild.rewardDescription')}</p><div className="manuscript-reward-marks" aria-hidden="true">{Array.from({ length: HOME_REWARD_AVATAR_COUNT }, (_, index) => <span className="manuscript-reward-avatar" aria-hidden="true" key={`reward-avatar-${index}`} />)}</div><div className="manuscript-reward-login"><span>{t('home.rebuild.rewardLoginHint')}</span><LoginRequiredAction returnPath="/console/invitations">{t('home.rebuild.rewardLoginAction')}</LoginRequiredAction></div><div className="manuscript-reward-stats">{HOME_REWARD_STATS.map(({ value, unitKey, labelKey }) => <HomeRewardStat value={value} unit={t(`home.rebuild.${unitKey}`)} label={t(`home.rebuild.${labelKey}`)} key={labelKey} />)}</div></article><div className="manuscript-news-column">
            {homepage?.ad_slots.length ? <ManagedAdSlots entries={homepage.ad_slots} /> : null}
            <div className="manuscript-news-grid">{managedNews.map((entry, index) => <ManagedNewsCard entry={entry} newsIndex={managedNewsSlots[index] ?? index % 2} key={entry.id} />)}</div>
          </div></>}</div>
        </section>

        <section className="manuscript-section manuscript-partners" aria-labelledby="homePartnersTitle">
          <div className="manuscript-section-heading"><div><h2 id="homePartnersTitle">{t('home.rebuild.partnersTitle')}</h2><p>{t('home.rebuild.partnersDescription')}</p></div></div>
          <div className="manuscript-partner-grid" aria-label={t('home.rebuild.partnersTitle')} role={isHomepageLoading ? 'status' : undefined} aria-busy={isHomepageLoading || undefined}>{isHomepageLoading ? <><span className="public-sr-only">{t('home.rebuild.loadingPartners')}</span><HomePartnerSkeleton /></> : partnerRows.map((row, rowIndex) => <HomePartnerRow key={`partner-row-${rowIndex}`} partners={row} rowIndex={rowIndex} />)}</div>
        </section>
      </div>
    </PublicLayout>
  )
}

function publicMarketModelToRecord(model: PublicMarketModel): ModelRecord {
  const input = model.prices.find((price) => price.meter_kind.toLowerCase().includes('input'))
  const output = model.prices.find((price) => price.meter_kind.toLowerCase().includes('output'))
  const numeric = (value: string | undefined) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined }
  const modality = (['text', 'image', 'video', 'audio', 'multimodal', 'embedding', 'rerank', 'speech', 'transcription'].includes(model.modality) ? model.modality : 'other') as ModelModality
  const price = { input: numeric(input?.unit_price_yuan), inputRaw: input?.unit_price_yuan, output: numeric(output?.unit_price_yuan), outputRaw: output?.unit_price_yuan, unit: input?.unit || output?.unit || '1M tokens' }
  return {
    id: model.id,
    alias: model.alias || model.id,
    name: model.name,
    company: model.company,
    ...(model.icon_url ? { iconUrl: model.icon_url } : {}),
    modality,
    capabilities: [],
    description: model.description || '',
    officialPrice: { ...price },
    tokenNxPrice: { ...price },
    labels: [MODALITY_LABELS[modality] ?? modality],
    availability: { rate: 0, window: '暂无数据' },
    providerCount: 0,
    throughput: { value: 0, unit: '暂无数据' },
  }
}

function fallbackShowcaseGroups(): ModelsShowcaseGroup[] {
  return [
    { id: 'text', titleKey: 'public.models.groups.textTitle', descriptionKey: 'public.models.groups.textDescription', models: MODEL_CATALOG.slice(0, 3) },
    { id: 'video', titleKey: 'public.models.groups.videoTitle', descriptionKey: 'public.models.groups.videoDescription', models: MODEL_CATALOG.slice(3, 6) },
    { id: 'image', titleKey: 'public.models.groups.imageTitle', descriptionKey: 'public.models.groups.imageDescription', models: MODEL_CATALOG.slice(6, 9) },
  ]
}

function publicMarketTopicTitleKey(topic: PublicMarketTopic): string | undefined {
  const topicName = `${topic.id} ${topic.name} ${topic.name_en ?? ''}`.toLowerCase()
  if (/文本|text/.test(topicName)) return 'public.models.groups.textTitle'
  if (/图片|图像|image/.test(topicName)) return 'public.models.groups.imageTitle'
  if (/视频|video/.test(topicName)) return 'public.models.groups.videoTitle'
  return undefined
}

export function ModelsPublicPage() {
  const { i18n } = useTranslation()
  const [market, setMarket] = useState<PublicModelMarket | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void getPublicModelMarket(controller.signal).then(setMarket).catch(() => setMarket(null))
    return () => controller.abort()
  }, [])
  const groups = useMemo<ModelsShowcaseGroup[]>(() => {
    if (!market?.topics.length) {
      const fallback = fallbackShowcaseGroups()
      if (market?.carousels.length) fallback[0].carousels = market.carousels
      return fallback
    }
    const english = (i18n.resolvedLanguage ?? i18n.language).toLowerCase().startsWith('en')
    const modelById = new Map<string, PublicMarketModel>()
    market.carousels.forEach((carousel) => { if (carousel.model) modelById.set(carousel.model.id, carousel.model) })
    market.topics.forEach((topic) => topic.models?.forEach((model) => modelById.set(model.id, model)))
    const mappedGroups = market.topics.map((topic, index) => {
      const titleKey = publicMarketTopicTitleKey(topic)
      return {
        id: topic.id,
        ...(titleKey ? { titleKey } : { title: english ? topic.name_en || topic.name : topic.name }),
        description: '',
        models: (topic.models ?? topic.model_ids?.flatMap((id) => { const model = modelById.get(id); return model ? [model] : [] }) ?? []).map(publicMarketModelToRecord),
        carousels: index === 0 ? market.carousels : [],
      }
    }).filter((group) => group.models.length > 0)
    if (mappedGroups.length) return mappedGroups
    const fallback = fallbackShowcaseGroups()
    fallback[0].carousels = market.carousels
    return fallback
  }, [i18n.language, i18n.resolvedLanguage, market])
  return (
    <PublicLayout mainClassName="public-models-page">
      <ModelsShowcase groups={groups} />
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
    <PublicLayout mainClassName="public-model-detail">
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

function RankingModelLogo({ code, name }: { code: string; name: string }) {
  const matchedModel = findModelInList(MODEL_CATALOG, code)
  return matchedModel
    ? <ModelLogo model={matchedModel} className="ranking-model-logo" />
    : <span className="ranking-model-logo ranking-model-logo-fallback" aria-hidden="true">{name.trim().slice(0, 1).toUpperCase()}</span>
}

export function RankingsPage() {
  const { t } = useTranslation()
  const [leaderboard, setLeaderboard] = useState<ModelUsageLeaderboard | null>(null)
  const [recentUsage, setRecentUsage] = useState<RecentModelUsage | null>(null)
  const [leaderboardLoading, setLeaderboardLoading] = useState(true)
  const [recentLoading, setRecentLoading] = useState(true)
  const [leaderboardError, setLeaderboardError] = useState('')
  const [recentError, setRecentError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setLeaderboardLoading(true)
    setLeaderboardError('')
    getModelUsageLeaderboard('day', controller.signal).then(setLeaderboard).catch((reason: unknown) => {
      if (!controller.signal.aborted) setLeaderboardError(reason instanceof Error ? reason.message : t('public.rankings.loadFailed'))
    }).finally(() => { if (!controller.signal.aborted) setLeaderboardLoading(false) })
    return () => controller.abort()
  }, [t])

  useEffect(() => {
    const controller = new AbortController()
    setRecentLoading(true)
    setRecentError('')
    getRecentModelUsage(controller.signal).then(setRecentUsage).catch((reason: unknown) => {
      if (!controller.signal.aborted) setRecentError(reason instanceof Error ? reason.message : t('public.rankings.loadFailed'))
    }).finally(() => { if (!controller.signal.aborted) setRecentLoading(false) })
    return () => controller.abort()
  }, [t])

  function trendLabel(changeRate: number | null): string {
    if (changeRate === null) return t('public.rankings.noComparison')
    if (changeRate === 0) return '0.00%'
    return `${changeRate > 0 ? '↑' : '↓'} ${Math.abs(changeRate).toFixed(2)}%`
  }

  function trendClass(changeRate: number | null): string {
    if (changeRate === null || changeRate === 0) return 'is-flat'
    return changeRate > 0 ? 'is-up' : 'is-down'
  }

  return (
    <PublicLayout mainClassName="rankings-page--manuscript">
      <div className="ranking-shell">
        <aside className="ranking-sidebar" aria-label={t('public.rankings.pageNavLabel')}>
          <a className="is-active" href="#top-models"><span aria-hidden="true">▥</span>{t('public.rankings.topModelsNav')}</a>
        </aside>

        <main className="ranking-content">
          <section id="top-models" className="ranking-top-section">
            <header><h1>{t('public.rankings.topTitle')}</h1><p>{t('public.rankings.topDescription')}</p></header>
            <div className="ranking-chart-layout">{recentLoading && !recentUsage ? <div className="ranking-data-state" role="status">{t('public.rankings.loading')}</div> : recentError && !recentUsage ? <div className="ranking-data-state is-error" role="alert">{recentError}</div> : recentUsage && recentUsage.weeks.length && recentUsage.items.length ? <RankingRecentUsageChart data={recentUsage} /> : <div className="ranking-data-state">{t('public.rankings.empty')}</div>}</div>
          </section>

          <section id="model-ranking" className="ranking-list-section">
            <div className="ranking-list-head"><div><h2>{t('public.rankings.leaderboardTitle')}</h2><p>{t('public.rankings.leaderboardDescription')}</p></div></div>

            <div className="ranking-model-list" aria-live="polite">{leaderboardLoading && !leaderboard ? <div className="ranking-data-state" role="status">{t('public.rankings.loading')}</div> : leaderboardError && !leaderboard ? <div className="ranking-data-state is-error" role="alert">{leaderboardError}</div> : leaderboard?.items.length ? leaderboard.items.map((model) => <article className="ranking-model-row" key={model.code}>
              <span className="ranking-model-number">{model.rank}.</span>
              <RankingModelLogo code={model.code} name={model.name} />
              <div className="ranking-model-name"><strong>{model.name}</strong><span>{t('public.rankings.architectureHint')}</span></div>
              <div className="ranking-model-metric"><strong>{formatRankingTokens(model.total_tokens)} tokens</strong><span className={trendClass(model.change_rate)}>{trendLabel(model.change_rate)}</span></div>
            </article>) : <div className="ranking-data-state">{t('public.rankings.empty')}</div>}</div>
          </section>
        </main>
      </div>
    </PublicLayout>
  )
}

const APPS_PERIODS = ['today', 'week', 'month', 'year'] as const

function ToolUsageLogo({ logoUrl, name, small = false }: { logoUrl?: string; name: string; small?: boolean }) {
  return <span className={`apps-agent-logo${small ? ' apps-agent-logo--small' : ''}`}>
    {logoUrl ? <img src={logoUrl} alt="" loading="lazy" decoding="async" /> : <span aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>}
  </span>
}

export function AppsPage() {
  const { t } = useTranslation()
  const [timeRange, setTimeRange] = useState<(typeof APPS_PERIODS)[number]>('today')
  const [leaderboard, setLeaderboard] = useState<ToolUsageLeaderboard | null>(null)
  const [yearLeaderboard, setYearLeaderboard] = useState<ToolUsageLeaderboard | null>(null)
  const [clients, setClients] = useState<ToolUsageClients | null>(null)
  const [loadError, setLoadError] = useState('')
  const activeRangeLabel = t(`public.apps.ranges.${timeRange}`)

  useEffect(() => {
    const controller = new AbortController()
    setLoadError('')
    getToolUsageLeaderboard(timeRange === 'today' ? 'day' : timeRange, controller.signal).then(setLeaderboard).catch((reason: unknown) => { if (!controller.signal.aborted) setLoadError(reason instanceof Error ? reason.message : t('public.apps.loadFailed')) })
    return () => controller.abort()
  }, [t, timeRange])

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([getToolUsageLeaderboard('year', controller.signal), getToolUsageClients(controller.signal)]).then(([year, recent]) => { setYearLeaderboard(year); setClients(recent) }).catch((reason: unknown) => { if (!controller.signal.aborted) setLoadError(reason instanceof Error ? reason.message : t('public.apps.loadFailed')) })
    return () => controller.abort()
  }, [t])

  const popularItems = (yearLeaderboard?.items ?? []).slice(0, 4)
  const rankingItems = (leaderboard?.items ?? []).slice(0, 20)

  return (
    <PublicLayout mainClassName="apps-page--manuscript">
      <div className="apps-shell">
        <header className="apps-page-head">
          <h1>{t('public.apps.title')}</h1>
          <p>{t('public.apps.description')}</p>
        </header>

        <section className="apps-popular-grid" aria-label={t('public.apps.popularLabel')}>
          {popularItems.map((item) => <article className="apps-popular-card" key={item.id}>
            <div className="apps-popular-title"><h2>{item.name}</h2><ToolUsageLogo logoUrl={item.logo_url} name={item.name} /></div>
            <p>{item.description}</p>
            <strong>{t('public.apps.tokenCount', { count: formatToolUsageTokens(item.total_tokens) })}</strong>
          </article>)}
          {!yearLeaderboard ? <div className="apps-grid-state" role="status">{loadError || t('public.apps.loading')}</div> : !popularItems.length ? <div className="apps-grid-state">{t('public.apps.empty')}</div> : null}
        </section>

        <section className="apps-chart-panel" aria-labelledby="appsChartTitle">
          <div className="apps-chart-heading"><h2 id="appsChartTitle">{t('public.apps.chartTitle')}</h2><span>{t('public.apps.pastSixMonths')}</span></div>
          {clients?.weeks.length && clients.items.length ? <ToolUsageClientsChart data={clients} /> : <div className="apps-chart-state" role="status">{clients ? t('public.apps.empty') : loadError || t('public.apps.loading')}</div>}
        </section>

        <div className="apps-ranking-filter">
          <span className="public-sr-only" id="apps-time-range-label">{t('public.apps.rangeLabel')}</span>
          <Select className="apps-range-select" size="large" value={timeRange} onChange={(value) => setTimeRange(String(value) as (typeof APPS_PERIODS)[number])} aria-labelledby="apps-time-range-label">
            {APPS_PERIODS.map((period) => <Select.Option value={period} key={period}>{t(`public.apps.ranges.${period}`)}</Select.Option>)}
          </Select>
        </div>

        <section className="apps-ranking-list" aria-label={t('public.apps.rankingLabel', { range: activeRangeLabel })}>
          {rankingItems.map((item) => <article className="apps-ranking-row" key={item.id}>
            <span className="apps-ranking-number">{item.rank}.</span>
            <ToolUsageLogo logoUrl={item.logo_url} name={item.name} small />
            <div><h2>{item.name}</h2><p>{item.description}</p></div>
            <strong>{t('public.apps.tokenCount', { count: formatToolUsageTokens(item.total_tokens) })}</strong>
          </article>)}
          {!leaderboard ? <div className="apps-list-state" role="status">{loadError || t('public.apps.loading')}</div> : !rankingItems.length ? <div className="apps-list-state">{t('public.apps.empty')}</div> : null}
        </section>
      </div>
    </PublicLayout>
  )
}

function LegacyDocsPage() {
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

interface DocsHeading {
  id: string
  text: string
  level: number
}

interface DocsHeadingNode extends DocsHeading {
  children: DocsHeadingNode[]
}

function docsLocale(language: string): PublicDocsLocale {
  return language.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
}

function documentDescendants(rootId: string, nodes: PublicDocsNode[]): PublicDocsNode[] {
  const descendantIds = new Set([rootId])
  let changed = true
  while (changed) {
    changed = false
    nodes.forEach((node) => {
      if (descendantIds.has(node.parent_id) && !descendantIds.has(node.id)) {
        descendantIds.add(node.id)
        changed = true
      }
    })
  }
  return nodes.filter((node) => node.type === 'document' && descendantIds.has(node.parent_id))
}

function buildDocsChildrenMap(nodes: PublicDocsNode[]): Map<string, PublicDocsNode[]> {
  return nodes.reduce((childrenByParent, node) => {
    const siblings = childrenByParent.get(node.parent_id) ?? []
    siblings.push(node)
    childrenByParent.set(node.parent_id, siblings)
    return childrenByParent
  }, new Map<string, PublicDocsNode[]>())
}

function docsDirectoryAncestors(nodes: PublicDocsNode[], nodeId: string): string[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const ancestors: string[] = []
  let current = nodesById.get(nodeId)
  while (current?.parent_id) {
    const parent = nodesById.get(current.parent_id)
    if (!parent) break
    if (parent.type === 'directory') ancestors.unshift(parent.id)
    current = parent
  }
  return ancestors
}

const publicDocumentCache = new Map<string, PublicDocument>()
const publicDocumentRequests = new Map<string, Promise<PublicDocument>>()

function publicDocumentCacheKey(documentId: string, locale: PublicDocsLocale): string {
  return `${locale}:${documentId}`
}

function loadPublicDocument(documentId: string, locale: PublicDocsLocale, signal?: AbortSignal): Promise<PublicDocument> {
  // Tests should always observe their mocked response instead of sharing module state.
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')) {
    return getPublicDocument(documentId, locale, signal)
  }

  const key = publicDocumentCacheKey(documentId, locale)
  const cached = publicDocumentCache.get(key)
  if (cached) return Promise.resolve(cached)

  const pending = publicDocumentRequests.get(key)
  if (pending) return pending

  const request = getPublicDocument(documentId, locale)
    .then((document) => {
      publicDocumentCache.set(key, document)
      return document
    })
    .finally(() => {
      publicDocumentRequests.delete(key)
    })
  publicDocumentRequests.set(key, request)
  return request
}

function prefetchPublicDocument(documentId: string, locale: PublicDocsLocale): void {
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')) return
  void loadPublicDocument(documentId, locale).catch(() => undefined)
}

function DocsSidebarNodes({ childrenByParent, parentId, selectedId, expandedDirectories, labels, onToggle, onPrefetch, depth = 0 }: {
  childrenByParent: Map<string, PublicDocsNode[]>
  parentId: string
  selectedId?: string
  expandedDirectories: Set<string>
  labels: { collapse: string; expand: string }
  onToggle: (directoryId: string) => void
  onPrefetch?: (node: PublicDocsNode) => void
  depth?: number
}) {
  return (childrenByParent.get(parentId) ?? []).map((node) => {
    const depthStyle = { '--docs-sidebar-indent': `${depth * 18}px` } as CSSProperties
    if (node.type === 'document') {
      const prefetch = () => onPrefetch?.(node)
      return <Link className={`docs-sidebar-node docs-sidebar-document${selectedId === node.id ? ' is-active' : ''}`} style={depthStyle} to={publicDocumentHref(node)} key={node.id} onMouseEnter={prefetch} onFocus={prefetch}><span>{node.title}</span></Link>
    }
    const expanded = expandedDirectories.has(node.id)
    const actionLabel = `${expanded ? labels.collapse : labels.expand} ${node.title}`
    return <div className="docs-sidebar-group" key={node.id}>
      <button className={`docs-sidebar-node docs-sidebar-directory${expanded ? '' : ' is-collapsed'}`} style={depthStyle} type="button" aria-expanded={expanded} aria-label={actionLabel} onClick={() => onToggle(node.id)}><span>{node.title}</span></button>
      <div className={`docs-sidebar-children${expanded ? '' : ' is-collapsed'}`} aria-hidden={!expanded} inert={expanded ? undefined : true}><div className="docs-sidebar-children-inner"><DocsSidebarNodes childrenByParent={childrenByParent} parentId={node.id} selectedId={selectedId} expandedDirectories={expandedDirectories} labels={labels} onToggle={onToggle} onPrefetch={onPrefetch} depth={depth + 1} /></div></div>
    </div>
  })
}

function headingAnchor(text: string, index: number): string {
  const normalized = text.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  return `docs-${normalized || 'section'}-${index + 1}`
}

function buildDocsHeadingTree(headings: DocsHeading[]): DocsHeadingNode[] {
  const roots: DocsHeadingNode[] = []
  const stack: DocsHeadingNode[] = []

  headings.forEach((heading) => {
    const node: DocsHeadingNode = { ...heading, children: [] }
    while (stack.length && (stack[stack.length - 1]?.level ?? 0) >= node.level) stack.pop()
    const parent = stack[stack.length - 1]
    if (parent) parent.children.push(node)
    else roots.push(node)
    stack.push(node)
  })

  return roots
}

function collapsibleDocsHeadingIds(nodes: DocsHeadingNode[]): string[] {
  return nodes.flatMap((node) => [
    ...(node.children.length ? [node.id] : []),
    ...collapsibleDocsHeadingIds(node.children),
  ])
}

function docsHeadingAncestors(nodes: DocsHeadingNode[], targetId: string, ancestors: string[] = []): string[] | null {
  for (const node of nodes) {
    if (node.id === targetId) return ancestors
    const nested = docsHeadingAncestors(node.children, targetId, [...ancestors, node.id])
    if (nested) return nested
  }
  return null
}

function DocsTocNodes({ nodes, activeHeading, collapsedHeadings, labels, onToggle }: {
  nodes: DocsHeadingNode[]
  activeHeading: string
  collapsedHeadings: Set<string>
  labels: { collapse: string; expand: string }
  onToggle: (headingId: string) => void
}) {
  return nodes.map((node) => {
    const hasChildren = node.children.length > 0
    const collapsed = hasChildren && collapsedHeadings.has(node.id)
    const actionLabel = `${collapsed ? labels.expand : labels.collapse} ${node.text}`
    return <div className="docs-toc-item" key={node.id}>
      <div className="docs-toc-row" style={{ '--docs-toc-depth': Math.max(0, node.level - 1) } as CSSProperties}>
        {hasChildren ? <button className={collapsed ? 'is-collapsed' : ''} type="button" aria-expanded={!collapsed} aria-label={actionLabel} title={actionLabel} onClick={() => onToggle(node.id)} /> : <span className="docs-toc-spacer" aria-hidden="true" />}
        <a className={activeHeading === node.id ? 'is-active' : ''} href={`#${node.id}`}>{node.text}</a>
      </div>
      {hasChildren ? <div className={`docs-toc-children${collapsed ? ' is-collapsed' : ''}`} aria-hidden={collapsed} inert={collapsed ? true : undefined}><div className="docs-toc-children-inner"><DocsTocNodes nodes={node.children} activeHeading={activeHeading} collapsedHeadings={collapsedHeadings} labels={labels} onToggle={onToggle} /></div></div> : null}
    </div>
  })
}

function resolveDocsImageUrl(url: string): string | undefined {
  const normalized = url.trim()
  if (/^https:\/\//i.test(normalized)) return normalized
  const objectId = normalized.replace(/^\/?api\/docs\/assets\//, '').replace(/^docs-asset:/, '')
  return getPublicDocumentAssetUrl(objectId)
}

export function DocsPage() {
  const { t, i18n } = useTranslation()
  const { publicId, slug } = useParams()
  const navigate = useNavigate()
  const articleRef = useRef<HTMLElement>(null)
  const locale = docsLocale(i18n.resolvedLanguage ?? i18n.language)
  const [tree, setTree] = useState<PublicDocsNode[]>([])
  const [currentDocument, setCurrentDocument] = useState<PublicDocument | null>(null)
  const [treeLoading, setTreeLoading] = useState(true)
  const [documentLoading, setDocumentLoading] = useState(false)
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null)
  const [headings, setHeadings] = useState<DocsHeading[]>([])
  const [activeHeading, setActiveHeading] = useState('')
  const [collapsedHeadings, setCollapsedHeadings] = useState<Set<string>>(() => new Set())
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set())
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const rootNodes = useMemo(() => tree.filter((node) => !node.parent_id), [tree])
  const childrenByParent = useMemo(() => buildDocsChildrenMap(tree), [tree])
  const selectedNode = useMemo(() => tree.find((node) => node.type === 'document' && node.id === publicId), [publicId, tree])
  const activeRoot = useMemo(() => {
    if (selectedNode) return rootNodes.find((root) => documentDescendants(root.id, tree).some((node) => node.id === selectedNode.id)) ?? rootNodes[0]
    return rootNodes[0]
  }, [rootNodes, selectedNode, tree])
  const isFlatSidebar = useMemo(() => {
    if (!activeRoot) return false
    const children = childrenByParent.get(activeRoot.id) ?? []
    return children.length > 0 && children.every((node) => node.type === 'document')
  }, [activeRoot, childrenByParent])
  const headingTree = useMemo(() => buildDocsHeadingTree(headings), [headings])
  const prefetchDocument = useCallback((node: PublicDocsNode) => {
    if (node.type === 'document') prefetchPublicDocument(node.id, locale)
  }, [locale])

  useEffect(() => {
    const controller = new AbortController()
    setTreeLoading(true)
    setError(null)
    void getPublicDocsTree(locale, controller.signal).then((nodes) => {
      setTree(nodes)
      setTreeLoading(false)
    }).catch((caught) => {
      if (controller.signal.aborted) return
      setTree([])
      setCurrentDocument(null)
      setTreeLoading(false)
      setError({ message: caught instanceof Error ? caught.message : t('api.http.requestFailed'), requestId: isApiError(caught) ? caught.requestId : null })
    })
    return () => controller.abort()
  }, [locale, t])

  useEffect(() => {
    if (treeLoading || error || !tree.length) return
    if (!publicId) {
      const firstDocument = rootNodes.flatMap((root) => documentDescendants(root.id, tree))[0]
      if (firstDocument) navigate(publicDocumentHref(firstDocument), { replace: true })
      return
    }
    if (!selectedNode) {
      setCurrentDocument(null)
      setError({ message: t('public.docs.manuscript.documentNotFound'), requestId: null })
    }
  }, [error, locale, navigate, publicId, rootNodes, selectedNode, t, tree, treeLoading])

  useEffect(() => {
    if (!selectedNode) return
    const controller = new AbortController()
    setDocumentLoading(true)
    setError(null)
    void loadPublicDocument(selectedNode.id, locale, controller.signal).then((document) => {
      if (controller.signal.aborted) return
      setCurrentDocument(document)
      setDocumentLoading(false)
      if (!navigator.userAgent.includes('jsdom')) window.scrollTo({ top: 0, behavior: 'auto' })
    }).catch((caught) => {
      if (controller.signal.aborted) return
      setDocumentLoading(false)
      setCurrentDocument(null)
      setHeadings([])
      setError({ message: caught instanceof Error ? caught.message : t('api.http.requestFailed'), requestId: isApiError(caught) ? caught.requestId : null })
    })
    return () => controller.abort()
  }, [locale, selectedNode, t])

  useEffect(() => {
    if (currentDocument && currentDocument.id === publicId && slug !== currentDocument.slug) navigate(publicDocumentHref(currentDocument), { replace: true })
  }, [currentDocument, navigate, publicId, slug])

  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [publicId])

  useEffect(() => {
    const nextExpanded = new Set(selectedNode ? docsDirectoryAncestors(tree, selectedNode.id) : [])
    if (activeRoot) {
      const rootChildren = childrenByParent.get(activeRoot.id) ?? []
      rootChildren.forEach((node) => {
        if (node.type === 'directory') nextExpanded.add(node.id)
      })
    }
    setExpandedDirectories(nextExpanded)
  }, [activeRoot, childrenByParent, selectedNode, tree])

  useLayoutEffect(() => {
    const root = articleRef.current
    if (!root || !currentDocument) return
    const elements = Array.from(root.querySelectorAll<HTMLElement>('.docs-markdown h1, .docs-markdown h2, .docs-markdown h3, .docs-markdown h4'))
    const nextHeadings = elements.map((element, index) => {
      const id = headingAnchor(element.textContent ?? '', index)
      element.id = id
      return { id, text: element.textContent?.trim() || currentDocument.title, level: Number(element.tagName.slice(1)) }
    })
    setHeadings(nextHeadings)
    setActiveHeading(nextHeadings[0]?.id ?? '')
  }, [currentDocument])

  useEffect(() => {
    if (!headings.length) return
    const updateActiveHeading = () => {
      const current = headings.reduce((active, heading) => {
        const element = document.getElementById(heading.id)
        return element && element.getBoundingClientRect().top <= 176 ? heading.id : active
      }, headings[0]?.id ?? '')
      setActiveHeading(current)
    }
    updateActiveHeading()
    window.addEventListener('scroll', updateActiveHeading, { passive: true })
    return () => window.removeEventListener('scroll', updateActiveHeading)
  }, [headings])

  useEffect(() => {
    const collapsibleIds = collapsibleDocsHeadingIds(headingTree)
    if (headings.length <= 18) {
      setCollapsedHeadings(new Set())
      return
    }
    setCollapsedHeadings(new Set(collapsibleIds.filter((id) => id !== headingTree[0]?.id)))
  }, [headingTree, headings.length])

  useEffect(() => {
    if (!activeHeading) return
    const ancestors = docsHeadingAncestors(headingTree, activeHeading)
    if (!ancestors?.length) return
    setCollapsedHeadings((current) => {
      if (!ancestors.some((id) => current.has(id))) return current
      const next = new Set(current)
      ancestors.forEach((id) => next.delete(id))
      return next
    })
  }, [activeHeading, headingTree])

  const toggleHeading = useCallback((headingId: string) => {
    setCollapsedHeadings((current) => {
      const next = new Set(current)
      if (next.has(headingId)) next.delete(headingId)
      else next.add(headingId)
      return next
    })
  }, [])

  const toggleDirectory = useCallback((directoryId: string) => {
    setExpandedDirectories((current) => {
      const next = new Set(current)
      if (next.has(directoryId)) next.delete(directoryId)
      else next.add(directoryId)
      return next
    })
  }, [])

  async function copyMarkdown(): Promise<void> {
    if (!currentDocument) return
    try {
      await navigator.clipboard.writeText(currentDocument.content_markdown)
      Toast.success({ content: t('public.docs.manuscript.copyPageSuccess'), className: 'docs-copy-toast', duration: 2 })
    } catch {
      Toast.error({ content: t('public.docs.manuscript.copyUnsupported'), className: 'docs-copy-toast', duration: 3 })
    }
  }

  const loading = treeLoading || documentLoading
  return (
    <PublicLayout mainClassName="docs-page--manuscript">
      <nav className="docs-product-nav" aria-label={t('public.docs.manuscript.productNavLabel')}>
        <div className="docs-product-nav-inner">
          {rootNodes.map((root) => {
            const firstDocument = documentDescendants(root.id, tree)[0]
            return firstDocument ? <Link className={activeRoot?.id === root.id ? 'is-active' : ''} to={publicDocumentHref(firstDocument)} key={root.id}><IconBookOpenStroked aria-hidden="true" />{root.title}</Link> : null
          })}
        </div>
      </nav>

      <div className="docs-shell" aria-busy={loading || undefined}>
        <aside className={`docs-sidebar${isFlatSidebar ? ' docs-sidebar--flat' : ''}${mobileSidebarOpen ? ' is-mobile-open' : ''}`} aria-label={t('public.docs.manuscript.sidebarLabel')} onClick={(event) => { if ((event.target as Element).closest('a')) setMobileSidebarOpen(false) }}>
          <button className="docs-mobile-sidebar-toggle" type="button" aria-expanded={mobileSidebarOpen} aria-label={`${mobileSidebarOpen ? t('public.docs.manuscript.collapse') : t('public.docs.manuscript.expand')} ${t('public.docs.manuscript.sidebarLabel')}`} onClick={() => setMobileSidebarOpen((open) => !open)}>
            <span>{selectedNode?.title ?? t('public.docs.manuscript.sidebarLabel')}</span><IconChevronDown aria-hidden="true" />
          </button>
          <nav>{activeRoot ? <DocsSidebarNodes childrenByParent={childrenByParent} parentId={activeRoot.id} selectedId={selectedNode?.id} expandedDirectories={expandedDirectories} labels={{ collapse: t('public.docs.manuscript.collapse'), expand: t('public.docs.manuscript.expand') }} onToggle={toggleDirectory} onPrefetch={prefetchDocument} /> : null}</nav>
        </aside>

        <article className="docs-article" ref={articleRef}>
          {currentDocument ? <div className="docs-article-toolbar docs-article-toolbar--desktop-copy"><button className="docs-copy-page" type="button" onClick={() => void copyMarkdown()}><IconCopyStroked aria-hidden="true" />{t('public.docs.manuscript.copyPage')}</button></div> : null}
          {currentDocument ? <div className="docs-article-toolbar docs-article-toolbar--mobile-copy"><button className="docs-copy-page" type="button" onClick={() => void copyMarkdown()}><IconCopyStroked aria-hidden="true" />{t('public.docs.manuscript.copyPage')}</button></div> : null}
          {loading && !currentDocument ? <div className="docs-state" role="status"><Skeleton placeholder={<><Skeleton.Title /><Skeleton.Paragraph rows={8} /></>} loading /></div> : null}
          {!loading && error ? <div className="docs-state docs-state--error" role="alert"><h1>{t('public.docs.manuscript.loadFailed')}</h1><p>{error.message}</p>{error.requestId ? <code>{t('public.docs.manuscript.requestIdPrefix')}{error.requestId}</code> : null}</div> : null}
          {!loading && !error && !currentDocument && !tree.length ? <div className="docs-state"><h1>{t('public.docs.manuscript.noDocuments')}</h1></div> : null}
          {currentDocument ? <MarkdownContent className="docs-markdown" content={currentDocument.content_markdown} enhancedCodeBlocks resolveImageUrl={resolveDocsImageUrl} /> : null}
        </article>

        <aside className={`docs-on-page${currentDocument ? ' docs-on-page--with-copy' : ''}`} aria-label={t('public.docs.manuscript.onPageLabel')} style={{ '--docs-toc-depth': Math.max(0, (headingTree[0]?.level ?? 1) - 1) } as CSSProperties}>
          <strong>{t('public.docs.manuscript.onPageTitle')}</strong>
          <div className="docs-on-page-scroll"><DocsTocNodes nodes={headingTree} activeHeading={activeHeading} collapsedHeadings={collapsedHeadings} labels={{ collapse: t('public.docs.manuscript.tocCollapse'), expand: t('public.docs.manuscript.tocExpand') }} onToggle={toggleHeading} /></div>
        </aside>
      </div>
    </PublicLayout>
  )
}

export function PricingPage() {
  const { t } = useTranslation()
  return (
    <PublicLayout mainClassName="public-page">
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
    <PublicLayout mainClassName="public-page">
      <header className="public-page-head"><h1>{t('public.status.title')}</h1><p>{t('public.status.description')}</p></header>
      <section className="public-section"><div className="callout"><strong>{t('public.status.calloutTitle')}</strong><span>{t('public.status.calloutText')}</span></div></section>
      <section className="public-section" aria-labelledby="modelStatusTitle"><h2 id="modelStatusTitle">{t('public.status.modelTitle')}</h2><p>{t('public.status.modelDescription')}</p><div>{MODEL_CATALOG.map((model) => <div className="status-row" key={model.id}><span className="status-identity"><strong>{model.name}</strong><span>{publicCompanyLabel(t, model.company)}</span></span><span className="badge">{t('public.status.monitoringUnavailable')}</span></div>)}</div></section>
      <section className="public-section"><h2>{t('public.status.platformTitle')}</h2>{platformKeys.map((key) => <div className="status-row" key={key}><span>{t(`public.status.platform.${key}`)}</span><span className="badge">{t('public.status.monitoringUnavailable')}</span></div>)}</section>
      <section className="public-section"><h2>{t('public.status.incidentTitle')}</h2><p>{t('public.status.incidentDescription')}</p><div className="public-actions"><Link className="btn btn-secondary" to="/docs">{t('public.status.viewErrors')}</Link></div></section>
    </PublicLayout>
  )
}

export function AboutPage() {
  const { t } = useTranslation()
  return <PublicLayout mainClassName="public-page"><header className="public-page-head"><h1>{t('public.about.title')}</h1><p>{t('public.about.description')}</p></header><section className="public-section"><h2>{t('public.about.boundaryTitle')}</h2><div className="public-grid"><div className="public-grid-item"><h3>{t('public.about.catalogTitle')}</h3><p>{t('public.about.catalogDescription')}</p></div><div className="public-grid-item"><h3>{t('public.about.requestTitle')}</h3><p>{t('public.about.requestDescription')}</p></div><div className="public-grid-item"><h3>{t('public.about.upstreamTitle')}</h3><p>{t('public.about.upstreamDescription')}</p></div></div></section><section className="public-section"><h2>{t('public.about.stageTitle')}</h2><p>{t('public.about.stageDescription')}</p><div className="public-actions"><Link className="btn btn-primary" to="/models">{t('public.about.browseModels')}</Link><Link className="btn btn-secondary" to="/docs">{t('public.about.viewDocs')}</Link></div></section></PublicLayout>
}

export function ContactPage() {
  const { t, i18n } = useTranslation()
  const prefix = i18n.resolvedLanguage?.startsWith('en') ? '/en' : ''
  return <PublicLayout mainClassName="public-page"><header className="public-page-head"><h1>{t('public.contact.title')}</h1><p>{t('public.contact.description')}</p></header><section className="public-section"><div className="public-grid"><div className="public-grid-item"><h2>{t('public.contact.supportTitle')}</h2><p>{t('public.contact.supportDescription')}</p><button className="btn btn-primary" type="button" onClick={() => requestSupportWidget('contact')}>{t('public.contact.supportAction')}</button></div><div className="public-grid-item"><h2>{t('public.contact.businessTitle')}</h2><p>{t('public.contact.businessDescription')}</p><a className="btn btn-secondary" href={`mailto:${t('public.contact.businessEmail')}`}>{t('public.contact.businessEmail')}</a></div><div className="public-grid-item"><h2>{t('public.contact.legalTitle')}</h2><p>{t('public.contact.legalDescription')}</p><div className="public-actions"><Link className="btn btn-secondary" to={`${prefix}/terms`}>{t('footer.terms')}</Link><Link className="btn btn-secondary" to={`${prefix}/privacy`}>{t('footer.privacy')}</Link></div></div></div></section></PublicLayout>
}

export function QuickstartPublicPage() {
  const { t, i18n } = useTranslation()
  const docsPath = i18n.resolvedLanguage?.startsWith('en') ? '/en/docs' : '/docs'
  return <PublicLayout mainClassName="public-page">
    <header className="public-page-head">
      <h1>{t('public.quickstart.title')}</h1>
      <p>{t('public.quickstart.description')}</p>
      <div className="public-actions">
        <LoginRequiredAction className="btn btn-primary" returnPath="/console/quickstart">{t('public.quickstart.startAction')}</LoginRequiredAction>
        <Link className="btn btn-secondary" to={docsPath}>{t('public.quickstart.docsAction')}</Link>
      </div>
    </header>
    <section className="public-section">
      <div className="public-grid">
        <div className="public-grid-item"><h2>{t('public.quickstart.stepKey')}</h2><p>{t('public.quickstart.stepKeyDescription')}</p></div>
        <div className="public-grid-item"><h2>{t('public.quickstart.stepEndpoint')}</h2><p>{t('public.quickstart.stepEndpointDescription')}</p></div>
        <div className="public-grid-item"><h2>{t('public.quickstart.stepRequest')}</h2><p>{t('public.quickstart.stepRequestDescription')}</p></div>
      </div>
    </section>
  </PublicLayout>
}

export { LegalPage } from './legal'

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnPath = normalizeLoginReturnPath(searchParams.get('return'))
  // 中文：登录页没有公共页脚，仍然需要保留全局客服入口。
  return <div className="login-page"><div className="login-card"><LoginPanel onSuccess={() => navigate(returnPath)} /></div><ManuscriptSupportWidget /></div>
}
