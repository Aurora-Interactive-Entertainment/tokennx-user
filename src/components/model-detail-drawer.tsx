import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { CSSProperties, ReactNode } from 'react'
import Button from '@douyinfe/semi-ui/lib/es/button'
import SideSheet from '@douyinfe/semi-ui/lib/es/sideSheet'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { IconClose, IconCopy } from '@douyinfe/semi-icons'
import { localizeConsoleLabel, ModelLogo } from './common'
import { MoneyText } from './money'
import './model-detail-drawer.css'
import type { UserModelDetail, UserModelMetricPoint, UserModelPrice, UserModelTag } from '@/api/user-models'
import { modelAlias, modelRouteKey, type ModelPrice, type ModelRecord } from '@/data/models'
import { formatCount, formatNumber } from '@/utils/format'

const MODEL_UNAVAILABLE_LABEL = '暂无数据'
const TOKEN_QUANTITY = 1_000_000
const MODALITY_IO: Record<ModelRecord['modality'], [string, string]> = {
  text: ['文本', '文本'],
  image: ['文本', '图像'],
  video: ['文本', '视频'],
  audio: ['文本', '音频'],
  embedding: ['文本', '向量'],
  rerank: ['文本', '排序分数'],
  speech: ['文本', '音频'],
  transcription: ['音频', '文本'],
  other: [MODEL_UNAVAILABLE_LABEL, MODEL_UNAVAILABLE_LABEL],
}

function ioTypes(model: ModelRecord): [string, string] {
  return MODALITY_IO[model.modality]
}

function PriceCell({ label, price, fallback, unavailableLabel }: { label: string; price?: UserModelPrice; fallback?: { value?: number; raw?: string; unit: string }; unavailableLabel: string }) {
  const raw = price?.unit_price_yuan.trim() || fallback?.raw
  const value = raw ? Number(raw) : fallback?.value
  const available = value !== undefined && Number.isFinite(value)
  const unit = price ? priceUnit(price) : fallback?.unit ?? unavailableLabel
  return (
    <article className="model-detail-price-card">
      <span>{label}</span>
      <strong>{available ? <MoneyText value={value} rawValue={raw} withCurrency={false} /> : unavailableLabel}</strong>
      {available ? <small>{unit}</small> : null}
    </article>
  )
}

function primaryInput(price: ModelPrice): { value: number | undefined; raw?: string } {
  if (price.input !== undefined) return { value: price.input, raw: price.inputRaw }
  if (price.standard !== undefined) return { value: price.standard, raw: price.standardRaw }
  if (price.base !== undefined) return { value: price.base, raw: price.baseRaw }
  return { value: undefined }
}

function primaryOutput(price: ModelPrice): { value: number | undefined; raw?: string } {
  if (price.output !== undefined) return { value: price.output, raw: price.outputRaw }
  if (price.hd !== undefined) return { value: price.hd, raw: price.hdRaw }
  return { value: undefined }
}

function modelContextValue(model: ModelRecord): string {
  if (model.modality === 'text') return model.context ?? MODEL_UNAVAILABLE_LABEL
  if (model.modality === 'image') return model.params?.['尺寸']?.slice(0, 2).map(String).join(' / ') ?? MODEL_UNAVAILABLE_LABEL
  if (model.modality === 'video') return model.params?.['时长']?.slice(0, 2).map((value) => `${value}s`).join(' / ') ?? MODEL_UNAVAILABLE_LABEL
  if (model.modality === 'audio' || model.modality === 'speech') return model.params?.['音色']?.slice(0, 2).map(String).join(' / ') ?? MODEL_UNAVAILABLE_LABEL
  if (model.modality === 'transcription') return model.params?.['音频格式']?.slice(0, 2).map(String).join(' / ') ?? MODEL_UNAVAILABLE_LABEL
  if (model.modality === 'embedding') return model.params?.['向量维度']?.slice(0, 2).map(String).join(' / ') ?? MODEL_UNAVAILABLE_LABEL
  return model.context ?? MODEL_UNAVAILABLE_LABEL
}

function formatTokenLimit(value: number | undefined): string | undefined {
  if (!value || value <= 0) return undefined
  if (value >= TOKEN_QUANTITY && value % TOKEN_QUANTITY === 0) return `${value / TOKEN_QUANTITY}M`
  if (value >= 1000 && value % 1000 === 0) return `${value / 1000}K`
  return formatNumber(value)
}

function priceUnit(price: UserModelPrice): string {
  const currency = price.currency.trim().toUpperCase()
  const currencyLabel = currency === 'CNY' ? '¥' : currency || '¥'
  const unit = price.unit.trim() || 'unit'
  const quantity = price.unit_quantity
  const denominator = quantity === TOKEN_QUANTITY && unit === 'token'
    ? 'M tokens'
    : quantity === 1 ? unit : `${formatNumber(quantity)} ${unit}`
  return `${currencyLabel}/${denominator}`
}

function pricePurpose(price: UserModelPrice): string {
  const identity = `${price.purpose ?? ''} ${price.meter_kind} ${price.meter_code}`.toLowerCase()
  if (identity.includes('cache') && (identity.includes('creation') || identity.includes('create'))) return 'cache_creation'
  if (identity.includes('cache')) return 'cache_hit'
  if (identity.includes('input')) return 'input'
  if (identity.includes('output')) return 'output'
  if (identity.includes('base')) return 'base'
  return price.purpose?.trim().toLowerCase() ?? ''
}

function currentPrice(prices: UserModelPrice[] | null | undefined, purpose: string): UserModelPrice | undefined {
  const matching = (prices ?? []).filter((price) => pricePurpose(price) === purpose)
  if (!matching.length) return undefined
  const tier = Math.min(...matching.map((price) => price.tier_no))
  return matching.find((price) => price.tier_no === tier)
}

function unavailableChart(title: string, description: string): ReactNode {
  return <div className="model-detail-chart-empty" role="img" aria-label={title}><span>{description}</span></div>
}

function MetricBarChart({ title, points, unit, unavailableLabel }: { title: string; points: UserModelMetricPoint[]; unit: string; unavailableLabel: string }) {
  const values = points.map((point) => point.value).filter((value): value is number => value !== null && Number.isFinite(value))
  if (!values.length) return unavailableChart(title, unavailableLabel)
  const maximum = Math.max(...values, 0)
  return (
    <div className="model-detail-chart-bars" role="img" aria-label={title}>
      {points.map((point) => {
        const value = point.value !== null && Number.isFinite(point.value) ? point.value : null
        const height = value === null ? 0 : maximum > 0 ? Math.max(6, Math.round((value / maximum) * 100)) : 6
        const label = new Date(point.timestamp).toISOString().slice(5, 10)
        const style = { '--model-metric-height': `${height}%` } as CSSProperties
        return <span className={value === null ? 'is-missing' : ''} key={point.timestamp} title={`${label}: ${value === null ? unavailableLabel : `${formatNumber(value)} ${unit}`}`}><i style={style} /><small>{label}</small></span>
      })}
    </div>
  )
}

type LinePoint = { x: number; y: number; point: UserModelMetricPoint; label: string }

function lineChartPoints(points: UserModelMetricPoint[]): Array<LinePoint | null> {
  const presentValues = points.map((point) => point.value).filter((value): value is number => value !== null && Number.isFinite(value))
  if (!presentValues.length) return points.map(() => null)
  const minimum = Math.min(...presentValues)
  const maximum = Math.max(...presentValues)
  const range = maximum - minimum
  return points.map((point, index) => {
    if (point.value === null || !Number.isFinite(point.value)) return null
    const x = points.length <= 1 ? 350 : 20 + (index * 660) / (points.length - 1)
    const y = range === 0 ? 75 : 130 - ((point.value - minimum) / range) * 110
    return { x, y, point, label: new Date(point.timestamp).toISOString().slice(5, 10) }
  })
}

function lineSegments(points: Array<LinePoint | null>): LinePoint[][] {
  const segments: LinePoint[][] = []
  let current: LinePoint[] = []
  points.forEach((point) => {
    if (point) {
      current.push(point)
      return
    }
    if (current.length) segments.push(current)
    current = []
  })
  if (current.length) segments.push(current)
  return segments
}

function MetricLineChart({ title, points, unit, unavailableLabel }: { title: string; points: UserModelMetricPoint[]; unit: string; unavailableLabel: string }) {
  const chartPoints = lineChartPoints(points)
  const presentPoints = chartPoints.filter((point): point is LinePoint => point !== null)
  if (!presentPoints.length) return unavailableChart(title, unavailableLabel)
  const segments = lineSegments(chartPoints)
  return (
    <div className="model-detail-chart-line" role="img" aria-label={title}>
      <svg viewBox="0 0 700 150" preserveAspectRatio="none" aria-hidden="true">
        {[20, 75, 130].map((y) => <line className="model-detail-chart-grid-line" x1="20" x2="680" y1={y} y2={y} key={y} />)}
        {segments.map((segment, index) => segment.length > 1 ? <polyline points={segment.map((point) => `${point.x},${point.y}`).join(' ')} key={index} /> : null)}
        {presentPoints.map((item) => <circle cx={item.x} cy={item.y} r="4" key={item.point.timestamp}><title>{`${item.label}: ${formatNumber(item.point.value ?? 0)} ${unit}`}</title></circle>)}
      </svg>
      <div className="model-detail-chart-line-labels">{points.map((point) => <small key={point.timestamp}>{new Date(point.timestamp).toISOString().slice(5, 10)}</small>)}</div>
    </div>
  )
}

function modalityLabel(value: string, t: ReturnType<typeof useTranslation>['t']): string {
  const keyByValue: Record<string, string> = {
    text: 'console.common.text', image: 'console.common.image', video: 'console.common.video', audio: 'console.common.audio',
    embedding: 'console.common.embedding', rerank: 'console.common.rerank', speech: 'console.common.speech', transcription: 'console.common.transcription',
  }
  const key = keyByValue[value.trim().toLowerCase()]
  return key ? t(key) : localizeConsoleLabel(t, value)
}

function modalityList(values: string[] | undefined, fallback: string, t: ReturnType<typeof useTranslation>['t']): string {
  return values?.length ? values.map((value) => modalityLabel(value, t)).join(' / ') : fallback
}

type ModelDetailDrawerProps = {
  model: ModelRecord | null
  detail: UserModelDetail | null
  loading: boolean
  error: string
  visible: boolean
  onClose: () => void
}

export function ModelDetailDrawer({ model, detail, loading, error, visible, onClose }: ModelDetailDrawerProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const detailModel = detail?.model
  const publicAlias = detailModel?.alias?.trim() || (model ? modelAlias(model) : '')
  const displayAlias = publicAlias || t('console.common.modelAliasUnset')
  const routeKey = model ? modelRouteKey({ id: detailModel?.id ?? model.id, alias: publicAlias }) : undefined

  async function copyAlias(): Promise<void> {
    if (!publicAlias) return
    try {
      await navigator.clipboard.writeText(publicAlias)
      Toast.success(t('console.models.aliasCopied'))
    } catch {
      Toast.error(t('console.common.copyFailed'))
    }
  }

  function goto(path: string): void {
    onClose()
    navigate(path)
  }

  const listPrice = model?.tokenNxPrice
  const fallbackUnit = listPrice?.unit && listPrice.unit !== '不适用' ? listPrice.unit : t('console.common.notApplicable')
  const inputFallback = listPrice ? primaryInput(listPrice) : { value: undefined }
  const outputFallback = listPrice ? primaryOutput(listPrice) : { value: undefined }
  const [fallbackInputType, fallbackOutputType] = model ? ioTypes(model) : ['--', '--']
  const contextValue = formatTokenLimit(detailModel?.context_window_tokens) ?? (model ? modelContextValue(model) : MODEL_UNAVAILABLE_LABEL)
  const noDataLabel = t('console.modelDetail.noData')
  const displayContextValue = contextValue === MODEL_UNAVAILABLE_LABEL ? noDataLabel : contextValue
  const specifications = detail?.specifications
  const metrics = detail?.metrics
  const availabilityRate = metrics?.availability?.rate ?? model?.availability.rate ?? 0
  const availabilityReady = Number.isFinite(availabilityRate) && metrics ? availabilityRate >= 0 && availabilityRate <= 100 : availabilityRate > 0 && availabilityRate <= 100
  const availabilityLabel = availabilityReady ? `${formatNumber(availabilityRate)}%` : noDataLabel
  const cumulativeUsage = metrics?.cumulative_usage?.value ?? detailModel?.total_tokens
  const formattedCumulativeUsage = formatCount(cumulativeUsage)
  const cumulativeUsageLabel = formattedCumulativeUsage === '--' ? noDataLabel : formattedCumulativeUsage
  const canTestOnline = Boolean(routeKey && (detailModel?.modality ?? model?.modality) === 'text')
  const tags: UserModelTag[] = detail?.tags?.length ? detail.tags : model?.labels.map((label) => ({ label })) ?? []
  const capabilities = detailModel?.capabilities ?? model?.capabilities ?? []
  const inputType = modalityList(specifications?.input_modalities, localizeConsoleLabel(t, fallbackInputType), t)
  const outputType = modalityList(specifications?.output_modalities, localizeConsoleLabel(t, fallbackOutputType), t)
  const windowLabel = metrics?.window ? `${metrics.window.timezone} · ${t('console.modelDetail.recent7Days')}` : model ? localizeConsoleLabel(t, model.availability.window) : '--'

  return (
    <SideSheet
      className="model-detail-sheet"
      placement="right"
      width="min(640px, 100vw)"
      visible={visible}
      onCancel={onClose}
      closable={false}
      headerStyle={{ display: 'none' }}
      mask
    >
      {model ? (
        <article className="model-detail-panel" data-model-detail-content aria-busy={loading}>
          <header className="model-detail-panel-head">
            <div className="model-detail-heading">
              <span className="model-detail-logo"><ModelLogo model={model} size="large" /></span>
              <div className="model-detail-heading-copy">
                <p className="model-detail-eyebrow">{detailModel?.company || model.company}</p>
                <h2 id="modelDetailTitle">{detailModel?.name || model.name}</h2>
                <div className="model-detail-id-row">
                  <code>{displayAlias}</code>
                  <Button className="model-detail-copy" theme="borderless" size="small" icon={<IconCopy />} aria-label={t('console.modelDetail.copyAlias')} title={t('console.modelDetail.copyAlias')} onClick={copyAlias} disabled={!publicAlias} />
                </div>
              </div>
            </div>
            <Button className="model-detail-close" theme="borderless" icon={<IconClose />} aria-label={t('console.modelDetail.close')} title={t('console.modelDetail.close')} onClick={onClose} />
          </header>

          <div className="model-detail-panel-actions">
            <Button theme="outline" disabled={!canTestOnline} onClick={() => goto(`/console/playground?model=${encodeURIComponent(publicAlias)}`)}>{t('console.modelDetail.onlineTest')}</Button>
            <Button theme="solid" type="primary" disabled={!routeKey} onClick={() => goto(`/console/api-keys?model=${encodeURIComponent(publicAlias)}`)}>{t('console.modelDetail.apiAccess')}</Button>
          </div>

          {loading ? <p className="model-detail-load-state" role="status">{t('console.modelDetail.detailLoading')}</p> : null}
          {error ? <p className="model-detail-load-state is-error" role="alert">{t('console.modelDetail.detailLoadFailed', { message: error })}</p> : null}

          <section className="model-detail-section" aria-labelledby="modelDetailDescriptionTitle">
            <div className="model-detail-section-heading"><h3 id="modelDetailDescriptionTitle">{t('console.modelDetail.descriptionTitle')}</h3></div>
            <p className="model-detail-description">{detailModel?.description || model.description || t('console.modelDetail.noDescription')}</p>
            <div className="model-detail-tags">{tags.map((tag) => <span className="model-detail-tag model-detail-tag--neutral" style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined} key={tag.label}>{localizeConsoleLabel(t, tag.label)}</span>)}</div>
          </section>

          <section className="model-detail-section" aria-labelledby="modelDetailPricingTitle">
            <div className="model-detail-section-heading"><h3 id="modelDetailPricingTitle">{t('console.modelDetail.pricingTitle')}</h3><span>{t('console.modelDetail.pricingSource')}</span></div>
            <div className="model-detail-price-grid">
              <PriceCell label={t('console.modelDetail.inputTokens')} price={currentPrice(detailModel?.prices, 'input')} fallback={{ ...inputFallback, unit: fallbackUnit }} unavailableLabel={noDataLabel} />
              <PriceCell label={t('console.modelDetail.outputTokens')} price={currentPrice(detailModel?.prices, 'output')} fallback={{ ...outputFallback, unit: fallbackUnit }} unavailableLabel={noDataLabel} />
              <PriceCell label={t('console.modelDetail.cacheHitPrice')} price={currentPrice(detailModel?.prices, 'cache_hit')} unavailableLabel={noDataLabel} />
              <PriceCell label={t('console.modelDetail.cacheCreatePrice')} price={currentPrice(detailModel?.prices, 'cache_creation')} unavailableLabel={noDataLabel} />
            </div>
          </section>

          <section className="model-detail-section" aria-labelledby="modelDetailInfoTitle">
            <div className="model-detail-section-heading"><h3 id="modelDetailInfoTitle">{t('console.modelDetail.informationTitle')}</h3></div>
            <dl className="model-detail-info-grid">
              <div><dt>{t('console.common.context')}</dt><dd>{displayContextValue}</dd></div>
              <div><dt>{t('console.common.maxOutput')}</dt><dd>{formatTokenLimit(specifications?.max_output_tokens) ?? model.maxOutput ?? noDataLabel}</dd></div>
              <div><dt>{t('console.common.inputType')}</dt><dd>{inputType}</dd></div>
              <div><dt>{t('console.common.outputType')}</dt><dd>{outputType}</dd></div>
              <div><dt>{t('console.modelDetail.recommendedProtocol')}</dt><dd>{specifications ? specifications.recommended_protocol?.name ?? noDataLabel : model.modality === 'text' ? 'OpenAI Chat Completions' : noDataLabel}</dd></div>
            </dl>
            <div className="model-detail-capabilities">{capabilities.map((capability) => <span className="model-detail-tag model-detail-tag--accent" key={capability}>{localizeConsoleLabel(t, capability)}</span>)}</div>
          </section>

          <section className="model-detail-section" aria-labelledby="modelDetailActivityTitle">
            <div className="model-detail-section-heading"><h3 id="modelDetailActivityTitle">{t('console.modelDetail.activityTitle')}</h3><span>{metrics ? windowLabel : null}</span></div>
            <div className="model-detail-chart-frame">
              <MetricBarChart title={t('console.modelDetail.activityChart')} points={metrics?.activity?.points ?? []} unit={metrics?.activity?.unit ?? ''} unavailableLabel={noDataLabel} />
            </div>
            <div className="model-detail-chart-grid">
              <figure className="model-detail-chart-card"><figcaption><strong>{t('console.modelDetail.throughput')}</strong><span>{metrics?.throughput?.unit ?? 'tokens/s'}</span></figcaption><MetricLineChart title={t('console.modelDetail.throughputChart')} points={metrics?.throughput?.points ?? []} unit={metrics?.throughput?.unit ?? 'tokens/s'} unavailableLabel={noDataLabel} /></figure>
              <figure className="model-detail-chart-card"><figcaption><strong>{t('console.modelDetail.firstTokenLatency')}</strong><span>{metrics?.first_token_latency?.unit ?? 'ms'}</span></figcaption><MetricLineChart title={t('console.modelDetail.firstTokenLatencyChart')} points={metrics?.first_token_latency?.points ?? []} unit={metrics?.first_token_latency?.unit ?? 'ms'} unavailableLabel={noDataLabel} /></figure>
            </div>
            <div className="model-detail-metrics">
              <div><span>{t('console.modelDetail.recentAvailability')}</span><strong className={availabilityReady ? 'model-detail-availability' : ''}>{availabilityLabel}</strong><small>{windowLabel}</small></div>
              <div><span>{t('console.modelDetail.platformTokens')}</span><strong>{cumulativeUsageLabel}</strong><small>{t('console.modelDetail.successfulCallTotal')}</small></div>
            </div>
          </section>
        </article>
      ) : null}
    </SideSheet>
  )
}
