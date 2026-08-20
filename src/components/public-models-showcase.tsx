import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { IconArrowRight } from '@douyinfe/semi-icons'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LoginRequiredAction, ModelLogo } from '@/components/common'
import type { PublicMarketCarousel } from '@/api/public-model-market'
import type { ModelRecord } from '@/data/models'
import modelCardArt from '@/assets/figma-home/model-card-art.png'
import promoArticleArt from '@/assets/figma-home/promo-article.png'
import promoBannerArt from '@/assets/figma-home/promo-banner.png'
import './public-models-showcase.css'

export type ModelsShowcaseGroup = {
  id: string
  titleKey?: string
  descriptionKey?: string
  title?: string
  description?: string
  models: ModelRecord[]
  carousels?: PublicMarketCarousel[]
}

type ShowcaseSlide = {
  id: string
  title: string
  description: string
  image: string
  accent: string
  tags: string[]
  modelId: string
}

const SLIDE_INTERVAL = 5600
const SLIDE_TRANSITION_DURATION = 1500
const FALLBACK_SLIDES: ShowcaseSlide[] = [
  { id: 'deepseek-v4', title: 'Deepseek V4 Pro', description: '新一代通用智能模型，面向复杂推理、代码和多模态任务。', image: promoBannerArt, accent: '#2d80ff', tags: ['深度思考', '文本生成', '视频生成'], modelId: 'deepseek-public' },
  { id: 'claude-sonnet', title: 'Claude Sonnet 4', description: '稳定的长上下文分析与结构化协作能力。', image: promoArticleArt, accent: '#8a5cf6', tags: ['文本生成'], modelId: 'claude-public' },
  { id: 'gpt-4o', title: 'GPT-4o', description: '文本、视觉与音频在一条工作流中自然协同。', image: modelCardArt, accent: '#00b7c7', tags: ['文本生成', '图片生成'], modelId: 'gpt-public' },
  { id: 'qwen3', title: 'Qwen3 235B', description: '面向中文场景和代码任务的高性能大模型。', image: promoBannerArt, accent: '#ef6a9b', tags: ['文本生成'], modelId: 'qwen-public' },
  { id: 'glm', title: 'GLM-4.5', description: '为开发者准备的快速、稳定、可控的推理能力。', image: promoArticleArt, accent: '#f6a531', tags: ['文本生成'], modelId: 'glm-public' },
]

function priceValue(model: ModelRecord, side: 'input' | 'output', source: 'tokenNxPrice' | 'officialPrice' = 'tokenNxPrice'): string {
  const value = model[source][side]
  return value === undefined ? '--' : `${value}`
}

function hasDiscount(model: ModelRecord, side: 'input' | 'output'): boolean {
  const current = model.tokenNxPrice[side]
  const original = model.officialPrice[side]
  return current !== undefined && original !== undefined && original > current
}

function carouselSlide(entry: PublicMarketCarousel, index: number, language: string): ShowcaseSlide {
  const english = language.toLowerCase().startsWith('en')
  return {
    id: entry.id,
    title: english ? entry.title_en || entry.title : entry.title,
    description: english ? entry.description_en || entry.description : entry.description,
    image: entry.image_url || FALLBACK_SLIDES[index % FALLBACK_SLIDES.length].image,
    accent: FALLBACK_SLIDES[index % FALLBACK_SLIDES.length].accent,
    tags: english ? entry.tags_en || entry.tags : entry.tags,
    modelId: entry.model_id,
  }
}

export function ModelsHeroCarousel({ carousels = [] }: { carousels?: PublicMarketCarousel[] }) {
  const { t, i18n } = useTranslation()
  const slides = carousels.length ? carousels.map((entry, index) => carouselSlide(entry, index, i18n.resolvedLanguage ?? i18n.language)) : FALLBACK_SLIDES
  const [activeIndex, setActiveIndex] = useState(0)
  const [transitionSeed, setTransitionSeed] = useState(0)
  const [outgoingSlide, setOutgoingSlide] = useState<ShowcaseSlide | null>(null)
  const [paused, setPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const transitionTimeoutRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, slides.length - 1)))
  }, [slides.length])

  useEffect(() => {
    if (!outgoingSlide) return
    window.clearTimeout(transitionTimeoutRef.current)
    transitionTimeoutRef.current = window.setTimeout(() => setOutgoingSlide(null), SLIDE_TRANSITION_DURATION)
    return () => window.clearTimeout(transitionTimeoutRef.current)
  }, [outgoingSlide, transitionSeed])

  const slide = slides[activeIndex] ?? FALLBACK_SLIDES[0]
  const selectSlide = (index: number) => {
    if (index === activeIndex) return
    setOutgoingSlide(slide)
    setActiveIndex(index)
    setTransitionSeed((seed) => seed + 1)
  }

  return <section className="models-showcase-hero" aria-labelledby="modelsShowcaseTitle" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false) }}>
    {outgoingSlide ? <div className="models-showcase-hero-art models-showcase-hero-art--outgoing" style={{ '--models-hero-accent': outgoingSlide.accent } as CSSProperties} key={`outgoing-${transitionSeed}`}><img src={outgoingSlide.image} alt="" aria-hidden="true" /></div> : null}
    <div className="models-showcase-hero-art models-showcase-hero-art--incoming" style={{ '--models-hero-accent': slide.accent } as CSSProperties} key={`incoming-${slide.id}-${transitionSeed}`}><img src={slide.image} alt="" aria-hidden="true" /></div>
    <div className="models-showcase-hero-overlay" />
    <div className="models-showcase-hero-copy" key={`copy-${slide.id}-${transitionSeed}`}>
      <h1 id="modelsShowcaseTitle">{slide.title}</h1>
      <div className="models-showcase-hero-tags">{slide.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      <p>{slide.description}</p>
      <LoginRequiredAction className="models-showcase-hero-action" returnPath={`/console/models?model=${encodeURIComponent(slide.modelId)}`}>{t('public.models.tryNow')}<IconArrowRight aria-hidden="true" /></LoginRequiredAction>
    </div>
    <div className={`models-showcase-progress${paused ? ' models-showcase-progress--paused' : ''}`} role="tablist" aria-label={t('public.models.carouselLabel')}>
      {slides.map((entry, index) => <button className={`models-showcase-progress-item${index === activeIndex ? ' is-active' : ''}`} key={entry.id} type="button" role="tab" aria-selected={index === activeIndex} aria-label={t('public.models.carouselSlide', { number: index + 1 })} onClick={() => selectSlide(index)}><span key={index === activeIndex ? `${entry.id}-${transitionSeed}` : entry.id} style={{ animationDuration: `${SLIDE_INTERVAL}ms` }} onAnimationEnd={(event) => { if (event.animationName !== 'models-showcase-progress' || paused || reducedMotion) return; const nextIndex = (activeIndex + 1) % slides.length; setOutgoingSlide(slide); setActiveIndex(nextIndex); setTransitionSeed((seed) => seed + 1) }} /></button>)}
    </div>
  </section>
}

export function ShowcaseModelCard({ model }: { model: ModelRecord }) {
  const { t } = useTranslation()
  const modelHref = `/models/${encodeURIComponent(model.alias || model.id)}`
  return <article className="models-showcase-card">
    <div className="models-showcase-card-head"><Link className="models-showcase-card-identity" to={modelHref} aria-label={model.name}><ModelLogo model={model} className="models-showcase-card-logo" /><span><strong>{model.name}</strong><small>{t('public.models.releaseDate', { date: '2026年7月3日' })}</small></span></Link></div>
    <p className="models-showcase-card-description">{model.description}</p>
    <dl className="models-showcase-card-prices"><div><dt>{t('public.models.inputPrice')}</dt><dd>{hasDiscount(model, 'input') ? <del className="models-showcase-card-price-original"><span>{t('public.models.priceBase')}</span>{priceValue(model, 'input', 'officialPrice')}</del> : <span className="models-showcase-card-price-currency">{t('public.models.priceBase')}</span>}<strong className="models-showcase-card-price-current">{priceValue(model, 'input')}</strong></dd></div><div><dt>{t('public.models.outputPrice')}</dt><dd>{hasDiscount(model, 'output') ? <del className="models-showcase-card-price-original"><span>{t('public.models.priceBase')}</span>{priceValue(model, 'output', 'officialPrice')}</del> : <span className="models-showcase-card-price-currency">{t('public.models.priceBase')}</span>}<strong className="models-showcase-card-price-current">{priceValue(model, 'output')}</strong></dd></div></dl>
    <div className="models-showcase-card-actions"><LoginRequiredAction className="models-showcase-card-primary" returnPath={`/console/models?model=${encodeURIComponent(model.id)}`}>{t('public.models.tryNow')}</LoginRequiredAction><Link className="models-showcase-card-docs" to="/docs/01M0765G0JDT3JCZ6QQXNM40TX/token-nx-api-documentation">{t('public.models.apiDocs')}</Link></div>
  </article>
}

export function ModelsShowcase({ groups }: { groups: ModelsShowcaseGroup[] }) {
  const { t } = useTranslation()
  const normalizedGroups = useMemo(() => groups.map((group) => ({ ...group, models: group.models.slice(0, 3) })), [groups])
  const carousels = groups.flatMap((group) => group.carousels ?? [])
  return <div className="models-showcase"><ModelsHeroCarousel carousels={carousels} /><div className="models-showcase-catalog"><h2 className="public-sr-only">{t('public.models.title')}</h2>{normalizedGroups.map((group) => <section className="models-showcase-group" aria-labelledby={`${group.id}-title`} key={group.id}><div className="models-showcase-group-head"><div><h3 id={`${group.id}-title`}>{group.title ?? (group.titleKey ? t(group.titleKey) : '')}</h3><p>{group.description ?? (group.descriptionKey ? t(group.descriptionKey) : '')}</p></div></div><div className="models-showcase-grid">{group.models.map((model) => <ShowcaseModelCard key={model.id} model={model} />)}</div></section>)}</div></div>
}
