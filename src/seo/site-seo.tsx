import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'

export const SITE_ORIGIN = 'https://tokennx.com'
export const SITE_NAME = 'Token NX'
export const SITE_DESCRIPTION = '合规的企业级大型 AI 算力聚合平台'
export const SITE_SHARE_IMAGE = `${SITE_ORIGIN}/og/share.png`
export const SITE_LOGO = `${SITE_ORIGIN}/logo.png`

type SeoLocale = 'zh-CN' | 'en-US'
type SeoCopy = {
  title: string
  description: string
  heading: string
  summary: string
  answers?: Array<{ question: string; answer: string }>
  breadcrumb: string
}

type SeoPage = {
  schemaType: 'WebPage' | 'CollectionPage' | 'AboutPage'
  zh: SeoCopy
  en: SeoCopy
}

export type ResolvedSeo = {
  locale: SeoLocale
  routePath: string
  canonicalPath: string
  canonicalUrl?: string
  alternateUrls?: { locale: string; url: string }[]
  copy: SeoCopy
  schemaType?: SeoPage['schemaType']
  noindex: boolean
}

const SEO_PAGES: Record<string, SeoPage> = {
  '/': {
    schemaType: 'WebPage',
    zh: {
      title: 'Token NX - 合规的企业级 AI 算力聚合平台',
      description: 'Token NX 是合规的企业级大型 AI 算力聚合平台，聚合多家大模型算力，提供优质、低价的 API 接入与企业管理能力。',
      heading: '企业级 AI 算力聚合平台',
      summary: 'Token NX 聚合多家大模型的算力，为开发者和企业提供系统级、企业级的 AI 算力服务，以优质服务和低廉价格降低 AI 使用成本。',
      answers: [
        { question: 'Token NX 是什么？', answer: 'Token NX 是合规的企业级大型 AI 算力聚合平台，把多家大模型的算力、API Key、公开价格和调用记录集中在一个入口。' },
        { question: '如何开始调用模型？', answer: '创建 API Key 后，在 OpenAI 兼容 SDK 中把 Base URL 配置为 https://api.tokennx.com/v1，选择可用模型并发送请求。' },
        { question: '为什么选择 Token NX？', answer: '合规运营、企业级服务、多家大模型算力聚合，以及低廉的价格和优质的服务支持。' },
      ],
      breadcrumb: '首页',
    },
    en: {
      title: 'Token NX - Compliant Enterprise AI Compute Platform',
      description: 'Token NX is a compliant, enterprise-grade AI compute aggregation platform bringing together compute from multiple large models with quality support and low pricing.',
      heading: 'Enterprise-Grade AI Compute Aggregation',
      summary: 'Token NX aggregates compute from multiple large models and delivers system-level, enterprise-level AI compute services to developers and enterprises, lowering AI costs with quality support and low pricing.',
      answers: [
        { question: 'What is Token NX?', answer: 'Token NX is a compliant, enterprise-grade AI compute aggregation platform that brings model compute, API keys, public pricing, and request records into one entry point.' },
        { question: 'How do I start calling a model?', answer: 'After creating an API key, set the Base URL to https://api.tokennx.com/v1 in an OpenAI-compatible SDK, select a model, and send a request.' },
        { question: 'Why choose Token NX?', answer: 'Compliant operations, enterprise-grade services, aggregated compute from multiple large models, and low pricing with quality support.' },
      ],
      breadcrumb: 'Home',
    },
  },
  '/models': {
    schemaType: 'CollectionPage',
    zh: {
      title: '模型价格与能力对照 - Token NX',
      description: '查询 Token NX 当前可用模型的输入输出价格、模型公司、上下文长度和支持能力，注册前即可比较。',
      heading: '模型价格与能力对照',
      summary: '按模型公司、模态、上下文长度和能力筛选可用模型，并查看当前公开价格与适用范围。',
      answers: [
        { question: '价格如何展示？', answer: '按 Token 计价与按次计价分开展示，并按模型的公开规则显示输入、输出或不同规格的价格。' },
        { question: '如何比较模型？', answer: '可按模型公司、模态、上下文长度和支持能力筛选，再结合价格与适用范围选择模型。' },
        { question: '价格是否会变化？', answer: '模型公司定价、平台成本或汇率变化时，公开价格可能调整；实际费用以调用时页面显示的计费规则为准。' },
      ],
      breadcrumb: '模型与价格',
    },
    en: {
      title: 'Model Pricing & Capabilities - Token NX',
      description: 'Compare input and output prices, model companies, context windows, and capabilities across Token NX models before signing up.',
      heading: 'Model Pricing & Capabilities',
      summary: 'Filter available models by company, modality, context window, and capability, then review current public pricing and fit.',
      answers: [
        { question: 'How are prices shown?', answer: 'Token-based and per-call billing are shown separately, with current public input, output, or specification prices for each model.' },
        { question: 'How can I compare models?', answer: 'Filter by model company, modality, context window, and capabilities, then compare price and intended use.' },
        { question: 'Can prices change?', answer: 'Public prices may change with model-company pricing, platform costs, or exchange rates; actual charges follow the rules shown at call time.' },
      ],
      breadcrumb: 'Models & Pricing',
    },
  },
  '/about': {
    schemaType: 'AboutPage',
    zh: { title: '平台介绍 - Token NX', description: '了解 Token NX 的合规运营、企业级算力聚合服务、数据处理原则和官方联系方式。', heading: 'Token NX 平台', summary: 'Token NX 是合规的企业级大型 AI 算力聚合平台，聚合多家大模型算力，提供用量计费、调用记录和密钥管理，并公开说明服务边界。', breadcrumb: '平台介绍' },
    en: { title: 'About - Token NX', description: "Learn about Token NX's compliant, enterprise-grade AI compute services, data handling, and official contact.", heading: 'About Token NX', summary: 'Token NX is a compliant, enterprise-grade AI compute aggregation platform providing usage-based billing, request records, and key management while explaining service boundaries.', breadcrumb: 'About' },
  },
  '/terms': {
    schemaType: 'WebPage',
    zh: { title: '服务条款 - Token NX', description: '阅读 Token NX 服务条款、账户使用规则、计费说明、服务边界和合规要求。', heading: 'Token NX 服务条款', summary: '本页面说明使用 Token NX 账户、API Key、充值、模型调用与相关服务时适用的规则。', breadcrumb: '服务条款' },
    en: { title: 'Terms of Service - Token NX', description: 'Read Token NX terms of service, account rules, billing terms, service boundaries, and compliance requirements.', heading: 'Token NX Terms of Service', summary: 'This page explains the rules that apply when using Token NX accounts, API keys, top-ups, model calls, and related services.', breadcrumb: 'Terms of Service' },
  },
  '/privacy': {
    schemaType: 'WebPage',
    zh: { title: '隐私政策 - Token NX', description: '了解 Token NX 如何收集、使用、保存和保护账户信息、调用数据及相关服务数据。', heading: 'Token NX 隐私政策', summary: '本页面说明 Token NX 在提供账户、计费、模型调用和调用记录服务时如何处理与保护必要数据。', breadcrumb: '隐私政策' },
    en: { title: 'Privacy Policy - Token NX', description: 'Understand how Token NX collects, uses, stores, and protects account information, call data, and related service data.', heading: 'Token NX Privacy Policy', summary: 'This page explains how Token NX handles and protects necessary data while providing accounts, billing, model access, and request records.', breadcrumb: 'Privacy Policy' },
  },
  '/docs': {
    schemaType: 'WebPage',
    zh: { title: '文档中心 - Token NX', description: '查阅 Token NX 使用指南、API 文档、接入方式与常见问题。', heading: 'Token NX 文档中心', summary: 'Token NX 文档中心提供从创建 API Key 到接入客户端、管理用量与账单的完整指引。', breadcrumb: '文档中心' },
    en: { title: 'Documentation - Token NX', description: 'Browse Token NX user guides, API reference, integration methods, and FAQs.', heading: 'Token NX Documentation', summary: 'The Token NX documentation covers everything from creating an API key to integrating clients and managing usage and billing.', breadcrumb: 'Documentation' },
  },
  '/quickstart': {
    schemaType: 'WebPage',
    zh: { title: '快速接入 - Token NX', description: '几分钟内完成 Token NX 接入：创建 API Key、配置 Base URL、发送第一个模型请求。', heading: '快速接入 Token NX', summary: '按代码接入工作台的指引创建 API Key、选择模型并配置 Base URL，即可开始调用。', breadcrumb: '快速接入' },
    en: { title: 'Quickstart - Token NX', description: 'Get started with Token NX in minutes: create an API key, configure the Base URL, and send your first model request.', heading: 'Quickstart with Token NX', summary: 'Follow the code-workspace guide to create an API key, select a model, and configure the Base URL to start calling.', breadcrumb: 'Quickstart' },
  },
  '/contact': {
    schemaType: 'WebPage',
    zh: { title: '联系我们 - Token NX', description: '联系 Token NX 获取商务合作、技术支持或反馈。', heading: '联系我们', summary: '通过本页提供的渠道联系 Token NX，获取商务合作、技术支持或提交反馈。', breadcrumb: '联系我们' },
    en: { title: 'Contact - Token NX', description: 'Contact Token NX for business cooperation, technical support, or feedback.', heading: 'Contact Us', summary: 'Reach Token NX through the channels on this page for business cooperation, technical support, or feedback.', breadcrumb: 'Contact' },
  },
  '/rankings': {
    schemaType: 'CollectionPage',
    zh: { title: '模型排名 - Token NX', description: '查看 Token NX 平台模型使用情况与公开排行榜。', heading: '模型排名', summary: '查看 Token NX 平台公开模型的使用排名与近期趋势。', breadcrumb: '排名' },
    en: { title: 'Model Rankings - Token NX', description: 'Explore public model usage rankings and trends on Token NX.', heading: 'Model Rankings', summary: 'Review public model usage rankings and recent trends on Token NX.', breadcrumb: 'Rankings' },
  },
  '/apps': {
    schemaType: 'CollectionPage',
    zh: { title: 'AI 工具排名 - Token NX', description: '查看 Token NX 平台热门 AI 工具的使用排名。', heading: '热门 AI 工具排名', summary: '按公开使用情况查看 Token NX 平台智能体客户端与 AI 工具排名。', breadcrumb: '智能体' },
    en: { title: 'AI Tool Rankings - Token NX', description: 'Explore popular AI tool usage rankings across Token NX.', heading: 'Popular AI Tool Rankings', summary: 'Review agent clients and AI tools ranked by public usage across Token NX.', breadcrumb: 'Agent tools' },
  },
  '/pricing': {
    schemaType: 'CollectionPage',
    zh: { title: '模型价格 - Token NX', description: '对比模型公司参考价与 Token NX 公开价格。', heading: '模型价格', summary: '查看 Token NX 公开模型的价格对照与计费说明。', breadcrumb: '价格' },
    en: { title: 'Model Pricing - Token NX', description: 'Compare provider reference prices with public Token NX pricing.', heading: 'Model Pricing', summary: 'Review public model pricing comparisons and billing notes on Token NX.', breadcrumb: 'Pricing' },
  },
  '/status': {
    schemaType: 'WebPage',
    zh: { title: '服务状态 - Token NX', description: '查看 Token NX 公开服务链路与状态说明。', heading: '服务状态', summary: '查看 Token NX 网关、模型路由、身份服务和用量链路的状态说明。', breadcrumb: '状态' },
    en: { title: 'Service Status - Token NX', description: 'Review public Token NX service paths and status notes.', heading: 'Service Status', summary: 'Review status notes for the Token NX gateway, model routing, identity, and usage paths.', breadcrumb: 'Status' },
  },
  '/news': {
    schemaType: 'CollectionPage',
    zh: { title: '资讯 - Token NX', description: '阅读 Token NX 最新产品动态与平台公告。', heading: 'Token NX 资讯', summary: '阅读 Token NX 发布的产品动态、模型资讯与平台公告。', breadcrumb: '资讯' },
    en: { title: 'News - Token NX', description: 'Read the latest Token NX product updates and platform announcements.', heading: 'Token NX News', summary: 'Read Token NX product updates, model news, and platform announcements.', breadcrumb: 'News' },
  },
}

const MODEL_DETAIL_COPY: Record<SeoLocale, SeoCopy> = {
  'zh-CN': { title: '模型详情 - Token NX', description: '查看 Token NX 模型能力、上下文长度和公开价格，具体价格以页面显示为准。', heading: '模型详情', summary: '查看模型能力、上下文长度、支持方式和当前公开价格；未核验内容不会写入 SEO 元数据。', breadcrumb: '模型详情' },
  'en-US': { title: 'Model Details - Token NX', description: 'Review Token NX model capabilities, context windows, and public pricing; the page is the source of current pricing.', heading: 'Model Details', summary: 'Review model capabilities, context windows, integration options, and current public pricing without inferring unverified values.', breadcrumb: 'Model details' },
}

function normalizedPath(pathname: string): string {
  const withoutLocale = pathname.replace(/^\/en(?:\/|$)/, '/')
  if (withoutLocale === '/' || withoutLocale === '') return '/'
  return `/${withoutLocale.replace(/^\/+|\/+$/g, '')}`
}

function isEnglishPath(pathname: string): boolean {
  return /^\/en(?:\/|$)/.test(pathname)
}

function canonicalPath(routePath: string, locale: SeoLocale): string {
  const localized = locale === 'en-US' ? `/en${routePath === '/' ? '' : routePath}` : routePath
  if (localized === '/') return '/'
  return `${localized.replace(/\/+$/, '')}/`
}

function isNoindexPath(routePath: string): boolean {
  return routePath === '/login' || routePath === '/join' || routePath === '/invite' || routePath === '/home' || routePath.startsWith('/console')
}

export function resolveSeo(pathname: string, language: string): ResolvedSeo {
  const routePath = normalizedPath(pathname)
  const locale: SeoLocale = isEnglishPath(pathname) || language.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
  const modelDetail = routePath.startsWith('/models/') && routePath !== '/models'
  const page = SEO_PAGES[routePath]
  const noindex = isNoindexPath(routePath) || (!page && !modelDetail)
  const copy = modelDetail ? MODEL_DETAIL_COPY[locale] : page?.[locale === 'en-US' ? 'en' : 'zh'] ?? MODEL_DETAIL_COPY[locale]
  const routeForLanguage = modelDetail ? routePath : routePath
  const canonical = noindex ? undefined : canonicalPath(routeForLanguage, locale)
  const canonicalUrl = canonical ? `${SITE_ORIGIN}${canonical}` : undefined
  const alternateUrls = canonical ? [
    { locale: 'zh-CN', url: `${SITE_ORIGIN}${canonicalPath(routeForLanguage, 'zh-CN')}` },
    { locale: 'en', url: `${SITE_ORIGIN}${canonicalPath(routeForLanguage, 'en-US')}` },
    { locale: 'x-default', url: `${SITE_ORIGIN}${canonicalPath(routeForLanguage, 'zh-CN')}` },
  ] : undefined
  return { locale, routePath, canonicalPath: canonical ?? '', canonicalUrl, alternateUrls, copy, schemaType: page?.schemaType ?? (modelDetail ? 'WebPage' : undefined), noindex }
}

function createMeta(attribute: 'name' | 'property', key: string, content: string): void {
  const element = document.createElement('meta')
  element.setAttribute(attribute, key)
  element.setAttribute('content', content)
  element.dataset.seoManaged = 'true'
  document.head.appendChild(element)
}

function createLink(rel: string, href: string, extra: Record<string, string> = {}): void {
  const element = document.createElement('link')
  element.rel = rel
  element.href = href
  Object.entries(extra).forEach(([key, value]) => element.setAttribute(key, value))
  element.dataset.seoManaged = 'true'
  document.head.appendChild(element)
}

function buildJsonLd(seo: ResolvedSeo): Record<string, unknown> {
  const canonicalUrl = seo.canonicalUrl ?? SITE_ORIGIN
  const graph: Record<string, unknown>[] = [
    { '@type': 'Organization', '@id': `${SITE_ORIGIN}/#organization`, name: SITE_NAME, url: SITE_ORIGIN, logo: SITE_LOGO, description: 'Token NX 是合规的企业级大型 AI 算力聚合平台，提供用量计费、调用记录和密钥管理。', email: 'legal@tokennx.com' },
    { '@type': 'WebSite', '@id': `${SITE_ORIGIN}/#website`, url: `${SITE_ORIGIN}/`, name: SITE_NAME, description: SITE_DESCRIPTION, inLanguage: ['zh-CN', 'en'], publisher: { '@id': `${SITE_ORIGIN}/#organization` } },
    { '@type': 'Service', '@id': `${SITE_ORIGIN}/#service`, name: SITE_NAME, serviceType: SITE_DESCRIPTION, description: 'Token NX 聚合多家大模型的算力，为开发者和企业提供系统级、企业级的 AI 算力服务，以优质服务和低廉价格降低 AI 使用成本。', url: `${SITE_ORIGIN}/`, provider: { '@id': `${SITE_ORIGIN}/#organization` }, termsOfService: `${SITE_ORIGIN}/terms/` },
  ]
  if (seo.schemaType) graph.push({ '@type': seo.schemaType, '@id': `${canonicalUrl}#webpage`, url: canonicalUrl, name: seo.copy.heading, description: seo.copy.description, inLanguage: seo.locale, isPartOf: { '@id': `${SITE_ORIGIN}/#website` }, about: { '@id': `${SITE_ORIGIN}/#service` } })
  graph.push({ '@type': 'BreadcrumbList', '@id': `${canonicalUrl}#breadcrumb`, itemListElement: [{ '@type': 'ListItem', position: 1, name: seo.copy.breadcrumb, item: canonicalUrl }] })
  return { '@context': 'https://schema.org', '@graph': graph }
}

function applySeo(seo: ResolvedSeo): void {
  document.title = seo.copy.title
  document.documentElement.lang = seo.locale === 'en-US' ? 'en' : 'zh-CN'
  document.head.querySelectorAll('[data-seo-managed="true"]').forEach((element) => element.remove())
  createMeta('name', 'description', seo.copy.description)
  createMeta('name', 'robots', seo.noindex ? 'noindex, nofollow' : 'index, follow')
  if (!seo.noindex && seo.canonicalUrl) {
    createLink('canonical', seo.canonicalUrl)
    seo.alternateUrls?.forEach(({ locale, url }) => createLink('alternate', url, { hreflang: locale }))
    createMeta('property', 'og:type', 'website')
    createMeta('property', 'og:site_name', SITE_NAME)
    createMeta('property', 'og:locale', seo.locale === 'en-US' ? 'en_US' : 'zh_CN')
    createMeta('property', 'og:locale:alternate', seo.locale === 'en-US' ? 'zh_CN' : 'en_US')
    createMeta('property', 'og:title', seo.copy.title)
    createMeta('property', 'og:description', seo.copy.description)
    createMeta('property', 'og:url', seo.canonicalUrl)
    createMeta('property', 'og:image', SITE_SHARE_IMAGE)
    createMeta('property', 'og:image:alt', SITE_DESCRIPTION)
    createMeta('name', 'twitter:card', 'summary_large_image')
    createMeta('name', 'twitter:title', seo.copy.title)
    createMeta('name', 'twitter:description', seo.copy.description)
    createMeta('name', 'twitter:image', SITE_SHARE_IMAGE)
    createMeta('name', 'twitter:image:alt', SITE_DESCRIPTION)
    const jsonLd = document.createElement('script')
    jsonLd.type = 'application/ld+json'
    jsonLd.dataset.seoManaged = 'true'
    jsonLd.textContent = JSON.stringify(buildJsonLd(seo))
    document.head.appendChild(jsonLd)
  }
  document.getElementById('static-seo-summary')?.remove()
}

export function SeoManager(): null {
  const location = useLocation()
  const { i18n } = useTranslation()
  useEffect(() => {
    applySeo(resolveSeo(location.pathname, i18n.resolvedLanguage ?? i18n.language))
  }, [i18n.language, i18n.resolvedLanguage, location.pathname])
  return null
}
