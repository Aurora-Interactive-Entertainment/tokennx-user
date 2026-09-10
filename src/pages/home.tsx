import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import Skeleton from '@douyinfe/semi-ui/lib/es/skeleton'
import { LoginRequiredAction, PublicLayout, ModelLogo } from '@/components/common'
import modelCardArt from '@/assets/figma-home/model-card-art.png'
import promoModelLogo from '@/assets/figma-home/promo-model-logo.svg'
import promoBannerArt from '@/assets/figma-home/promo-banner.png'
import promoArticleArt from '@/assets/figma-home/promo-article.png'
import '@/mobile-home.css'
import { ModelAvailability } from '@/components/model-availability'
import { getPublicHomepage, getPublicHomepageAssetURL, getPublicHomepageMediaURL, getPublicHomepageStats, type HomepageDiscountKind, type HomepageEntry, type HomepagePromotionModel, type HomepageTranslation, type PublicHomepage } from '@/api/homepage'
import { findModel, modelRouteKey, MODEL_CATALOG, type ModelAvailabilityHour, type ModelRecord } from '@/data/models'
import { getAccessToken } from '@/auth/token-storage'
import { useAppSelector } from '@/store/hooks'
import { apiTimeToDate } from '@/utils/format'
import { HomeRewardStat } from '@/components/home-reward-stat'
import { HomeLiquidMetalQuickstartAction } from '@/components/home-liquid-metal-quickstart-action'
import { appToast } from '@/components/app-toast'

// 首页独立为路由入口，避免首屏下载文档 Markdown、排行榜图表及其他公开页面依赖。
// 公开页面的模型链接只使用面向用户的别名，旧模型 code 仅由查找逻辑兼容。
function modelPublicHref(model: { id: string; alias?: string }): string | undefined {
  const routeKey = modelRouteKey(model)
  return routeKey ? `/models/${encodeURIComponent(routeKey)}` : undefined
}

const HOME_MODEL_MOSAIC_COLUMNS = 6
const HOME_REWARD_STAT_KEYS = [
  { unitKey: 'rewardPendingUnit', labelKey: 'rewardPending' },
  { unitKey: 'rewardApprovedUnit', labelKey: 'rewardApproved' },
  { unitKey: 'rewardRejectedUnit', labelKey: 'rewardRejected' },
] as const
const HOME_REWARD_AVATAR_COUNT = 6

function formatHomepageReward(value: string): string {
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : '0.00'
}
type HomePartner = { name: string; logoMarkup?: string; logoUrl?: string; href?: string; logoKind: 'wordmark' | 'mark' | 'css' }
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
    const controller = new AbortController()

    const refresh = async (): Promise<void> => {
      if (requestInFlight) return
      requestInFlight = true
      try {
        const value = await getPublicHomepageStats(controller.signal)
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
      controller.abort()
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

    // 只在目标值落定时更新整组数字，按位翻页交给 CSS 延迟，避免每帧重挂载数字节点。
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

      // 在浏览器绘制前锁定上一轮终值，确保每次都从旧数字翻到新数字。
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

// 每条轨道复制一份品牌序列，循环位移到半程时正好衔接下一份内容，保证滚动不会跳帧。
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
  // 有后台目标时走统一登录态动作；旧数据缺少链接时保留兼容入口。
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
  // 资讯卡固定进入对应文章详情，忽略后台遗留的文档链接，避免离开文章阅读页。
  const href = `/news/${encodeURIComponent(entry.id)}`
  const title = t(`home.rebuild.news.${newsIndex}.title`)
  const description = t(`home.rebuild.news.${newsIndex}.description`)
  const coverURL = homepageEntryMediaURL(entry, i18n.language)
  const card = <><div className="manuscript-news-copy"><h3 title={title}>{title}</h3><p title={description}>{description}</p><small>{homepageDate(entry.updated_at, i18n.language)} <b className="manuscript-news-new">{t('public.home.newBadge')}</b></small></div><div className={`manuscript-news-art manuscript-news-art--${newsIndex}`} aria-hidden="true"><img className="manuscript-news-art-image" src={coverURL || promoArticleArt} alt="" loading="lazy" decoding="async" width={850} height={333} onError={(event) => {
    if (event.currentTarget.getAttribute('src') !== promoArticleArt) event.currentTarget.src = promoArticleArt
    // 封面失效时回退到本地默认图，避免卡片出现破图。
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
    // 推广广告统一承接邀请活动，未登录时由公共登录弹窗完成后续跳转。
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
  // 新版价格契约使用 input/output，兼容旧服务的 input_token/output_token 命名。
  const aliases = meterKind === 'input_token'
    ? new Set(['input', 'input_token', 'text_input'])
    : new Set(['output', 'output_token', 'text_output'])
  const price = model.prices.find((item) => aliases.has(item.meter_kind.trim().toLowerCase()))
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
  const homepageRequestControllerRef = useRef<AbortController | null>(null)
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
  const promotionUsernames = homepage?.promotion.usernames ?? []
  const rewardValues = [
    formatHomepageReward(homepage?.promotion.total_reward_yuan ?? '0'),
    String(homepage?.promotion.invited_count ?? 0),
    String(homepage?.promotion.visit_count ?? 0),
  ]
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
    homepageRequestControllerRef.current?.abort()
    const controller = new AbortController()
    homepageRequestControllerRef.current = controller
    setHomepageStatus('loading')
    getPublicHomepage(accessToken, controller.signal).then((value) => {
      if (requestId !== homepageRequestIdRef.current) return
      setHomepage(value)
      setHomepageStatus('ready')
    }).catch(() => {
      if (requestId === homepageRequestIdRef.current) setHomepageStatus('error')
      // 公开内容接口失败时保留已编排的默认首页，避免运营接口故障影响首页首屏。
    }).finally(() => {
      if (homepageRequestControllerRef.current === controller) homepageRequestControllerRef.current = null
    })
  }, [])

  useEffect(() => {
    refreshHomepage(initialAuthStatusRef.current === 'authenticated' ? getAccessToken() ?? undefined : undefined)
    return () => {
      homepageRequestIdRef.current += 1
      homepageRequestControllerRef.current?.abort()
      homepageRequestControllerRef.current = null
    }
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

  useEffect(() => {
    if (isHomepageError) appToast.error(t('home.rebuild.loadFailed'))
  }, [isHomepageError, t])

  return (
    <PublicLayout mainClassName="home-page home-page--manuscript">
      <div className="manuscript-home-shell">
        <section className="manuscript-hero" aria-labelledby="homeTitle">
          <div className="manuscript-hero-copy">
            <h1 id="homeTitle"><SplitTextReveal text={heroTitle} /><SplitTextReveal as="strong" text={heroSubtitle} delayOffset={Array.from(heroTitle).length} /></h1>
            <div className="manuscript-hero-actions">
              <HomeLiquidMetalQuickstartAction returnPath="/console/quickstart">{t('home.rebuild.primaryCta')}</HomeLiquidMetalQuickstartAction>
              <Link className="btn btn-secondary manuscript-model-button" to="/models" aria-label={t('home.rebuild.secondaryCta')}><span>{t('home.rebuild.secondaryCta')}</span></Link>
            </div>
            <div className="manuscript-digital-stats" role="list" aria-label={t('home.overview')}>
              <ManuscriptScoreboard metricId="token-volume" unit={t('home.rebuild.tokenVolumeUnit')} value={animatedTokenVolume} onInitialFlipComplete={handleTokenScoreboardReady} />
              <ManuscriptScoreboard metricId="api-calls" unit={t('home.rebuild.apiCallsUnit')} value={animatedApiCalls} onInitialFlipComplete={handleApiScoreboardReady} />
            </div>
          </div>
        </section>

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
          <div className="manuscript-promotion-grid" role={isHomepageLoading ? 'status' : undefined} aria-busy={isHomepageLoading || undefined}>{isHomepageLoading ? <><span className="public-sr-only">{t('home.rebuild.loadingPromotions')}</span><HomePromotionSkeleton /></> : <><article className="manuscript-reward-card"><h3>{t('home.rebuild.rewardTitle')}</h3><p>{t('home.rebuild.rewardDescription')}</p><div className="manuscript-reward-marks">{Array.from({ length: promotionUsernames.length || HOME_REWARD_AVATAR_COUNT }, (_, index) => {
            const username = promotionUsernames[index]
            return <span className="manuscript-reward-avatar" aria-hidden={username ? undefined : true} aria-label={username} title={username} key={`reward-avatar-${index}-${username ?? 'placeholder'}`} />
          })}</div><div className="manuscript-reward-login"><span>{t('home.rebuild.rewardLoginHint')}</span><LoginRequiredAction returnPath="/console/invitations">{t('home.rebuild.rewardLoginAction')}</LoginRequiredAction></div><div className="manuscript-reward-stats">{HOME_REWARD_STAT_KEYS.map(({ unitKey, labelKey }, index) => <HomeRewardStat value={rewardValues[index] ?? '0'} unit={t(`home.rebuild.${unitKey}`)} label={t(`home.rebuild.${labelKey}`)} key={labelKey} />)}</div></article><div className="manuscript-news-column">
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
