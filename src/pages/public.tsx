import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { TFunction } from 'i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import Skeleton from '@douyinfe/semi-ui/lib/es/skeleton'
import { IconBookOpenStroked, IconChevronDown, IconCodeStroked, IconCopyStroked, IconCustomerSupportStroked, IconFile, IconShieldStroked } from '@douyinfe/semi-icons'
import { LoginPanel, LoginRequiredAction, ManuscriptSupportWidget, PublicLayout, ModelLogo, normalizeLoginReturnPath, requestSupportWidget, DEFAULT_CONSOLE_PATH, authUserNeedsEmailBinding } from '@/components/common'
import '@/docs-page.css'
import './public-apps.css'
import './public-rankings.css'
import { ModelPriceSummary } from '@/components/money'
import { ModelAvailability } from '@/components/model-availability'
import { MarkdownContent } from '@/components/markdown-content'
import { CompatSelect as Select } from '@/components/semi-compat'
import { getModelUsageLeaderboard, getRecentModelUsage, type ModelUsageLeaderboard, type RecentModelUsage } from '@/api/model-rankings'
import { getToolUsageClients, getToolUsageLeaderboard, type ToolUsageClients, type ToolUsageLeaderboard } from '@/api/tool-usage'
import { getPublicDocument, getPublicDocumentAssetUrl, getPublicDocsTree, publicDocumentHref, type PublicDocument, type PublicDocsLocale, type PublicDocsNode } from '@/api/public-docs'
import { getPublicModelMarket, type PublicMarketModel, type PublicMarketTopic, type PublicModelMarket } from '@/api/public-model-market'
import { isApiError } from '@/api/http'
import { findModel, findModelInList, modelAlias, modelRouteKey, MODEL_CATALOG, MODALITY_LABELS, type ModelModality, type ModelPrice, type ModelRecord } from '@/data/models'
import { useAppSelector } from '@/store/hooks'
import { QUICKSTART_API_BASE_URL, quickstartCodeSample } from '@/utils/quickstart'
import { useTranslation } from 'react-i18next'
import { formatRankingTokens, RankingRecentUsageChart } from '@/components/ranking-usage-chart'
import { formatToolUsageTokens, ToolUsageClientsChart } from '@/components/tool-usage-chart'
import { apiTimeToDate } from '@/utils/format'
import { ModelsShowcase, type ModelsShowcaseGroup } from '@/components/public-models-showcase'
import { appToast } from '@/components/app-toast'

function formatPublicPrice(price: ModelPrice): ReactNode {
  return <ModelPriceSummary price={price} />
}

// 中文：文档产品导航根据目录标题匹配语义化图标，接口、隐私和支持入口各自使用专属图标。
function docsProductIcon(node: Pick<PublicDocsNode, 'title' | 'slug'>): ReactNode {
  const label = `${node.title} ${node.slug}`.toLowerCase()
  if (label.includes('api') || label.includes('接口') || label.includes('sdk')) return <IconCodeStroked aria-hidden="true" />
  if (label.includes('privacy') || label.includes('隐私') || label.includes('安全')) return <IconShieldStroked aria-hidden="true" />
  if (label.includes('support') || label.includes('帮助') || label.includes('支持') || label.includes('客服')) return <IconCustomerSupportStroked aria-hidden="true" />
  return <IconBookOpenStroked aria-hidden="true" />
}

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
    void getPublicModelMarket(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setMarket(value)
      })
      .catch(() => {
        if (!controller.signal.aborted) setMarket(null)
      })
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
    if (leaderboardError) appToast.error(leaderboardError)
  }, [leaderboardError])

  useEffect(() => {
    if (recentError) appToast.error(recentError)
  }, [recentError])

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
            <div className="ranking-chart-layout">{recentLoading && !recentUsage ? <div className="ranking-data-state" role="status">{t('public.rankings.loading')}</div> : recentUsage && recentUsage.weeks.length && recentUsage.items.length ? <RankingRecentUsageChart data={recentUsage} /> : <div className="ranking-data-state">{t('public.rankings.empty')}</div>}</div>
          </section>

          <section id="model-ranking" className="ranking-list-section">
            <div className="ranking-list-head"><div><h2>{t('public.rankings.leaderboardTitle')}</h2><p>{t('public.rankings.leaderboardDescription')}</p></div></div>

            <div className="ranking-model-list" aria-live="polite">{leaderboardLoading && !leaderboard ? <div className="ranking-data-state" role="status">{t('public.rankings.loading')}</div> : leaderboard?.items.length ? leaderboard.items.map((model) => <article className="ranking-model-row" key={model.code}>
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

  useEffect(() => {
    if (loadError) appToast.error(loadError)
  }, [loadError])

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
          {!yearLeaderboard ? (loadError ? null : <div className="apps-grid-state" role="status">{t('public.apps.loading')}</div>) : !popularItems.length ? <div className="apps-grid-state">{t('public.apps.empty')}</div> : null}
        </section>

        <section className="apps-chart-panel" aria-labelledby="appsChartTitle">
          <div className="apps-chart-heading"><h2 id="appsChartTitle">{t('public.apps.chartTitle')}</h2><span>{t('public.apps.pastSixMonths')}</span></div>
          {clients?.weeks.length && clients.items.length ? <ToolUsageClientsChart data={clients} /> : clients ? <div className="apps-chart-state" role="status">{t('public.apps.empty')}</div> : loadError ? null : <div className="apps-chart-state" role="status">{t('public.apps.loading')}</div>}
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
          {!leaderboard ? (loadError ? null : <div className="apps-list-state" role="status">{t('public.apps.loading')}</div>) : !rankingItems.length ? <div className="apps-list-state">{t('public.apps.empty')}</div> : null}
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
    if (error) appToast.error(error.message)
  }, [error])

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
            return firstDocument ? <Link className={activeRoot?.id === root.id ? 'is-active' : ''} to={publicDocumentHref(firstDocument)} key={root.id}>{docsProductIcon(root)}{root.title}</Link> : null
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
  const authUser = useAppSelector((state) => state.auth.user)
  const returnPath = normalizeLoginReturnPath(searchParams.get('return'))
  // 中文：登录页没有公共页脚，仍然需要保留全局客服入口。
  return <div className="login-page"><div className="login-card"><LoginPanel onSuccess={(user) => navigate(user && authUserNeedsEmailBinding(user) ? DEFAULT_CONSOLE_PATH : returnPath)} /></div><ManuscriptSupportWidget /></div>
}
