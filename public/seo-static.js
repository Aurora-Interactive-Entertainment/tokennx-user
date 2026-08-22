/*
 * Static GEO summary for crawlers that read the document before React mounts.
 * The hydrated app replaces this node and applies the full route metadata.
 */
(() => {
  const origin = 'https://tokennx.com'
  const pages = {
    '/': {
      zh: { title: 'Token NX - 合规的企业级 AI 算力聚合平台', heading: '企业级 AI 算力聚合平台', summary: 'Token NX 聚合多家大模型的算力，为开发者和企业提供系统级、企业级的 AI 算力服务，以优质服务和低廉价格降低 AI 使用成本。', questions: [['Token NX 是什么？', 'Token NX 是合规的企业级大型 AI 算力聚合平台，把多家大模型的算力、API Key、公开价格和调用记录集中在一个入口。'], ['如何开始调用模型？', '创建 API Key 后，在 OpenAI 兼容 SDK 中把 Base URL 配置为 https://api.tokennx.com/v1，选择可用模型并发送请求。'], ['为什么选择 Token NX？', '合规运营、企业级服务、多家大模型算力聚合，以及低廉的价格和优质的服务支持。']] },
      en: { title: 'Token NX - Compliant Enterprise AI Compute Platform', heading: 'Enterprise-Grade AI Compute Aggregation', summary: 'Token NX aggregates compute from multiple large models and delivers system-level, enterprise-level AI compute services to developers and enterprises, lowering AI costs with quality support and low pricing.', questions: [['What is Token NX?', 'Token NX is a compliant, enterprise-grade AI compute aggregation platform that brings model compute, API keys, public pricing, and request records into one entry point.'], ['How do I start calling a model?', 'After creating an API key, set the Base URL to https://api.tokennx.com/v1 in an OpenAI-compatible SDK, select a model, and send a request.'], ['Why choose Token NX?', 'Compliant operations, enterprise-grade services, aggregated compute from multiple large models, and low pricing with quality support.']] },
    },
    '/models': {
      zh: { title: '模型价格与能力对照 - Token NX', heading: '模型价格与能力对照', summary: '按模型公司、模态、上下文长度和能力筛选可用模型，并查看当前公开价格与适用范围。', questions: [['价格如何展示？', '按 Token 计价与按次计价分开展示，并按模型的公开规则显示输入、输出或不同规格的价格。'], ['如何比较模型？', '可按模型公司、模态、上下文长度和支持能力筛选，再结合价格与适用范围选择模型。'], ['价格是否会变化？', '模型公司定价、平台成本或汇率变化时，公开价格可能调整；实际费用以调用时页面显示的计费规则为准。']] },
      en: { title: 'Model Pricing & Capabilities - Token NX', heading: 'Model Pricing & Capabilities', summary: 'Filter available models by company, modality, context window, and capability, then review current public pricing and fit.', questions: [['How are prices shown?', 'Token-based and per-call billing are shown separately, with current public input, output, or specification prices for each model.'], ['How can I compare models?', 'Filter by model company, modality, context window, and capabilities, then compare price and intended use.'], ['Can prices change?', 'Public prices may change with model-company pricing, platform costs, or exchange rates; actual charges follow the rules shown at call time.']] },
    },
    '/about': { zh: { title: '平台介绍 - Token NX', heading: 'Token NX 平台', summary: 'Token NX 是合规的企业级大型 AI 算力聚合平台，聚合多家大模型算力，提供用量计费、调用记录和密钥管理，并公开说明服务边界。' }, en: { title: 'About - Token NX', heading: 'About Token NX', summary: 'Token NX is a compliant, enterprise-grade AI compute aggregation platform providing usage-based billing, request records, and key management while explaining service boundaries.' } },
    '/terms': { zh: { title: '服务条款 - Token NX', heading: 'Token NX 服务条款', summary: '本页面说明使用 Token NX 账户、API Key、充值、模型调用与相关服务时适用的规则。' }, en: { title: 'Terms of Service - Token NX', heading: 'Token NX Terms of Service', summary: 'This page explains the rules that apply when using Token NX accounts, API keys, top-ups, model calls, and related services.' } },
    '/privacy': { zh: { title: '隐私政策 - Token NX', heading: 'Token NX 隐私政策', summary: '本页面说明 Token NX 在提供账户、计费、模型调用和调用记录服务时如何处理与保护必要数据。' }, en: { title: 'Privacy Policy - Token NX', heading: 'Token NX Privacy Policy', summary: 'This page explains how Token NX handles and protects necessary data while providing accounts, billing, model access, and request records.' } },
    '/docs': { zh: { title: '文档中心 - Token NX', heading: 'Token NX 文档中心', summary: 'Token NX 文档中心提供从创建 API Key 到接入客户端、管理用量与账单的完整指引。' }, en: { title: 'Documentation - Token NX', heading: 'Token NX Documentation', summary: 'The Token NX documentation covers everything from creating an API key to integrating clients and managing usage and billing.' } },
    '/quickstart': { zh: { title: '快速接入 - Token NX', heading: '快速接入 Token NX', summary: '按代码接入工作台的指引创建 API Key、选择模型并配置 Base URL，即可开始调用。' }, en: { title: 'Quickstart - Token NX', heading: 'Quickstart with Token NX', summary: 'Follow the code-workspace guide to create an API key, select a model, and configure the Base URL to start calling.' } },
    '/contact': { zh: { title: '联系我们 - Token NX', heading: '联系我们', summary: '通过本页提供的渠道联系 Token NX，获取商务合作、技术支持或提交反馈。' }, en: { title: 'Contact - Token NX', heading: 'Contact Us', summary: 'Reach Token NX through the channels on this page for business cooperation, technical support, or feedback.' } },
  }
  const path = window.location.pathname.replace(/^\/en(?:\/|$)/, '/') || '/'
  const normalizedPath = path === '/' ? '/' : `/${path.replace(/^\/+|\/+$/g, '')}`
  const isEnglish = /^\/en(?:\/|$)/.test(window.location.pathname)
  const copy = pages[normalizedPath]?.[isEnglish ? 'en' : 'zh'] || (normalizedPath.startsWith('/models/') ? (isEnglish ? { title: 'Model Details - Token NX', heading: 'Model Details', summary: 'Review model capabilities, context windows, integration options, and current public pricing without inferring unverified values.' } : { title: '模型详情 - Token NX', heading: '模型详情', summary: '查看模型能力、上下文长度、支持方式和当前公开价格；未核验内容不会写入 SEO 元数据。' }) : null)
  if (!copy || normalizedPath === '/login' || normalizedPath === '/join' || normalizedPath === '/invite' || normalizedPath === '/home' || normalizedPath.startsWith('/console')) return
  const summary = document.createElement('div')
  summary.id = 'static-seo-summary'
  summary.dataset.staticSeoSummary = 'true'
  summary.className = 'static-seo-summary'
  const heading = document.createElement('h1')
  heading.textContent = copy.heading
  summary.appendChild(heading)
  const paragraph = document.createElement('p')
  paragraph.textContent = copy.summary
  summary.appendChild(paragraph)
  if (copy.questions?.length) {
    const answersHeading = document.createElement('h2')
    answersHeading.textContent = isEnglish ? 'Common questions' : '常见问题'
    summary.appendChild(answersHeading)
    copy.questions.forEach(([question, answer]) => {
      const questionHeading = document.createElement('h3')
      questionHeading.textContent = question
      summary.appendChild(questionHeading)
      const answerParagraph = document.createElement('p')
      answerParagraph.textContent = answer
      summary.appendChild(answerParagraph)
    })
  }
  const nav = document.createElement('nav')
  nav.setAttribute('aria-label', isEnglish ? 'Public pages' : '公开页面')
  ;[['/', isEnglish ? 'Home' : '首页'], ['/models', isEnglish ? 'Models & Pricing' : '模型与价格'], ['/about', isEnglish ? 'About' : '平台介绍'], ['/docs', isEnglish ? 'Documentation' : '文档中心'], ['/quickstart', isEnglish ? 'Quickstart' : '快速接入'], ['/contact', isEnglish ? 'Contact' : '联系我们']].forEach(([href, label]) => {
    const link = document.createElement('a')
    link.href = isEnglish ? `/en${href === '/' ? '' : href}/` : `${href}${href === '/' ? '' : '/'}`
    link.textContent = label
    nav.appendChild(link)
  })
  summary.appendChild(nav)
  const root = document.getElementById('root')
  const mount = document.getElementById('app-mount')
  if (root && mount) root.insertBefore(summary, mount)
})()
