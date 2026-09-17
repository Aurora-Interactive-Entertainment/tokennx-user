import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LoginRequiredAction, ModelLogo } from '@/components/common'
import type { PublicMarketCarousel, PublicMarketPrice } from '@/api/public-model-market'
import type { ModelRecord } from '@/data/models'
import { PublicModelPrices } from './public-model-prices'
import type { PublicPriceSources } from '@/utils/public-model-prices'
import { publicPath } from '@/routes/public-path'
import modelCardArt from '@/assets/figma-home/model-card-art.png'
import promoArticleArt from '@/assets/figma-home/promo-article.png'
import promoBannerArt from '@/assets/figma-home/promo-banner.png'
import { apiTimeToDate } from '@/utils/format'
import './public-models-showcase.css'

export type PublicShowcaseModel = ModelRecord & { marketPrices?: PublicMarketPrice[] } & Omit<PublicPriceSources, 'prices'>

export type ModelsShowcaseGroup = {
  id: string
  titleKey?: string
  descriptionKey?: string
  title?: string
  description?: string
  models: PublicShowcaseModel[]
  carousels?: PublicMarketCarousel[]
}

type ShowcaseSlide = {
  id: string
  title: string
  description: string
  image: string
  tags: string[]
  modelId?: string
  modelName?: string
}

const SLIDE_INTERVAL = 5600
const SLIDE_TRANSITION_DURATION = 1500
// 保留原来五项默认配图的循环顺序，缺少图片时也不改变已有轮播外观。
const FALLBACK_ART = [promoBannerArt, promoArticleArt, modelCardArt, promoBannerArt, promoArticleArt]

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
    image: entry.image_url || FALLBACK_ART[index % FALLBACK_ART.length],
    tags: english ? entry.tags_en || entry.tags : entry.tags,
    modelId: entry.model_id,
    modelName: entry.model_name,
  }
}

export function ModelsHeroCarousel({ carousels = [] }: { carousels?: PublicMarketCarousel[] }) {
  const { t, i18n } = useTranslation()
  const slides = carousels.map((entry, index) => carouselSlide(entry, index, i18n.resolvedLanguage ?? i18n.language))
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

  const slide = slides[activeIndex] ?? slides[0]
  if (!slide) return null
  // 跳转控制台模型广场时用 keyword 搜索参数定位模型，控制台搜索框会命中该字段。
  const slideReturnPath = slide.modelId ? `/console/models?keyword=${encodeURIComponent(slide.modelId)}` : '/console/models'
  const selectSlide = (index: number) => {
    if (index === activeIndex) return
    setOutgoingSlide(slide)
    setActiveIndex(index)
    setTransitionSeed((seed) => seed + 1)
  }

  return <section className="models-showcase-hero" aria-labelledby="modelsShowcaseTitle" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false) }}>
    {outgoingSlide ? <div className="models-showcase-hero-art models-showcase-hero-art--outgoing" key={`outgoing-${transitionSeed}`}><img src={outgoingSlide.image} alt="" aria-hidden="true" /></div> : null}
    <div className="models-showcase-hero-art models-showcase-hero-art--incoming" key={`incoming-${slide.id}-${transitionSeed}`}><img src={slide.image} alt="" aria-hidden="true" /></div>
    <div className="models-showcase-hero-overlay" />
    <div className="models-showcase-hero-copy" key={`copy-${slide.id}-${transitionSeed}`}>
      <h1 id="modelsShowcaseTitle">{slide.title}</h1>
      <div className="models-showcase-hero-tags">{slide.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      <p>{slide.description}</p>
      <LoginRequiredAction className="models-showcase-hero-action" returnPath={slideReturnPath}>{t('public.models.tryNow')}</LoginRequiredAction>
    </div>
    {/* 单张轮播不需要进度条，也不应触发自动切换。 */}
    {slides.length > 1 ? <div className={`models-showcase-progress${paused ? ' models-showcase-progress--paused' : ''}`} role="tablist" aria-label={t('public.models.carouselLabel')}>
      {slides.map((entry, index) => <button className={`models-showcase-progress-item${index === activeIndex ? ' is-active' : ''}`} key={entry.id} type="button" role="tab" aria-selected={index === activeIndex} aria-label={t('public.models.carouselSlide', { number: index + 1 })} onClick={() => selectSlide(index)}><span key={index === activeIndex ? `${entry.id}-${transitionSeed}` : entry.id} style={{ animationDuration: `${SLIDE_INTERVAL}ms` }} onAnimationEnd={(event) => { if (slides.length < 2 || event.animationName !== 'models-showcase-progress' || paused || reducedMotion) return; const nextIndex = (activeIndex + 1) % slides.length; setOutgoingSlide(slide); setActiveIndex(nextIndex); setTransitionSeed((seed) => seed + 1) }} /></button>)}
    </div> : null}
  </section>
}

export function ShowcaseModelCard({ model }: { model: PublicShowcaseModel }) {
  const { t, i18n } = useTranslation()
  // 发布日期以模型接口为准；缺少日期时不显示虚构的统一日期。
  const launchDate = model.launchedAt ? apiTimeToDate(model.launchedAt) : null
  const modelReturnPath = `/console/models?keyword=${encodeURIComponent(model.id)}`
  return <article className="models-showcase-card">
    <div className="models-showcase-card-head"><div className="models-showcase-card-identity"><ModelLogo model={model} className="models-showcase-card-logo" /><span><strong>{model.name}</strong>{launchDate ? <small>{t('public.models.releaseDate', { date: launchDate.toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' }) })}</small> : null}</span></div></div>
    <p className="models-showcase-card-description">{model.description}</p>
    {model.marketPrices ? <PublicModelPrices prices={model.marketPrices} templatePrices={model.templatePrices} templatePricingPeriods={model.templatePricingPeriods} templatePricingTimezone={model.templatePricingTimezone} /> : <dl className="models-showcase-card-prices"><div><dt>{t('public.models.inputPrice')}</dt><dd>{hasDiscount(model, 'input') ? <del className="models-showcase-card-price-original"><span>{t('public.models.priceBase')}</span>{priceValue(model, 'input', 'officialPrice')}</del> : <span className="models-showcase-card-price-original models-showcase-card-price-original--placeholder" aria-hidden="true" />}<strong className="models-showcase-card-price-current"><span className="models-showcase-card-price-current-currency">{t('public.models.priceBase')}</span>{priceValue(model, 'input')}</strong></dd></div><div><dt>{t('public.models.outputPrice')}</dt><dd>{hasDiscount(model, 'output') ? <del className="models-showcase-card-price-original"><span>{t('public.models.priceBase')}</span>{priceValue(model, 'output', 'officialPrice')}</del> : <span className="models-showcase-card-price-original models-showcase-card-price-original--placeholder" aria-hidden="true" />}<strong className="models-showcase-card-price-current"><span className="models-showcase-card-price-current-currency">{t('public.models.priceBase')}</span>{priceValue(model, 'output')}</strong></dd></div></dl>}
    <div className="models-showcase-card-actions"><LoginRequiredAction className="models-showcase-card-primary" returnPath={modelReturnPath}>{t('public.models.tryNow')}</LoginRequiredAction><Link className="models-showcase-card-docs" to={publicPath('/docs/01M0765G0JDT3JCZ6QQXNM40TX/token-nx-api-documentation', i18n.language)}>{t('public.models.apiDocs')}</Link></div>
  </article>
}

export function ModelsShowcase({ groups, carousels: suppliedCarousels }: { groups: ModelsShowcaseGroup[]; carousels?: PublicMarketCarousel[] }) {
  const { t } = useTranslation()
  const normalizedGroups = useMemo(() => groups.map((group) => ({ ...group, models: group.models.slice(0, 3) })), [groups])
  const carousels = suppliedCarousels ?? groups.flatMap((group) => group.carousels ?? [])
  return <div className="models-showcase"><ModelsHeroCarousel carousels={carousels} /><div className="models-showcase-catalog"><h2 className="public-sr-only">{t('public.models.title')}</h2>{!normalizedGroups.length ? <p role="status">{t('public.models.empty')}</p> : null}{normalizedGroups.map((group) => <section className="models-showcase-group" aria-labelledby={`${group.id}-title`} key={group.id}><div className="models-showcase-group-head"><div><h3 id={`${group.id}-title`}>{group.title ?? (group.titleKey ? t(group.titleKey) : '')}</h3><p>{group.description ?? (group.descriptionKey ? t(group.descriptionKey) : '')}</p></div></div><div className="models-showcase-grid">{group.models.map((model) => <ShowcaseModelCard key={model.id} model={model} />)}</div></section>)}</div></div>
}
