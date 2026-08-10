import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import Button from '@douyinfe/semi-ui/lib/es/button'
import SideSheet from '@douyinfe/semi-ui/lib/es/sideSheet'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { IconClose, IconCopy } from '@douyinfe/semi-icons'
import { localizeConsoleLabel, ModelLogo } from './common'
import { MoneyText } from './money'
import { modelAlias, modelRouteKey, type ModelPrice, type ModelRecord } from '@/data/models'

const MODEL_UNAVAILABLE_LABEL = '后端未提供'
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

// 价格卡：优先展示输入/输出价，缓存命中/创建价当前数据模型未提供，统一回退占位符。
function PriceCell({ label, value, raw, unit, unavailableLabel }: { label: string; value: number | undefined; raw?: string; unit: string; unavailableLabel: string }) {
  return (
    <article className="model-detail-price-card">
      <span>{label}</span>
      <strong>{value !== undefined ? <MoneyText value={value} rawValue={raw} withCurrency={false} /> : unavailableLabel}</strong>
      <small>{unit}</small>
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

function unavailableChart(title: string, description: string): ReactNode {
  return <div className="model-detail-chart-empty" role="img" aria-label={title}><span>{description}</span></div>
}

export function ModelDetailDrawer({ model, visible, onClose }: { model: ModelRecord | null; visible: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const publicAlias = model ? modelAlias(model) : ''
  const displayAlias = model ? modelAlias(model) || t('console.common.modelAliasUnset') : ''
  const routeKey = model ? modelRouteKey(model) : undefined

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

  const price = model?.tokenNxPrice
  const unit = price?.unit && price.unit !== '不适用' ? price.unit : t('console.common.notApplicable')
  const input = price ? primaryInput(price) : { value: undefined }
  const output = price ? primaryOutput(price) : { value: undefined }
  const [inputTypeValue, outputTypeValue] = model ? ioTypes(model) : ['--', '--']
  const inputType = localizeConsoleLabel(t, inputTypeValue)
  const outputType = localizeConsoleLabel(t, outputTypeValue)
  const contextValue = model ? modelContextValue(model) : MODEL_UNAVAILABLE_LABEL
  const displayContextValue = contextValue === MODEL_UNAVAILABLE_LABEL ? t('console.common.unavailable') : contextValue
  const availabilityReady = Boolean(model && Number.isFinite(model.availability.rate) && model.availability.rate > 0 && model.availability.rate <= 100)
  const unavailableLabel = t('console.common.unavailable')
  const availabilityLabel = availabilityReady && model ? `${model.availability.rate}%` : unavailableLabel
  const throughputLabel = model && model.throughput.unit !== MODEL_UNAVAILABLE_LABEL ? `${model.throughput.value} ${model.throughput.unit}` : unavailableLabel
  const runtimeUnavailable = t('console.modelDetail.runtimeDataUnavailable')
  const canTestOnline = Boolean(routeKey && model?.modality === 'text')

  return (
    <SideSheet
      className="model-detail-sheet"
      placement="right"
      width={640}
      visible={visible}
      onCancel={onClose}
      closable={false}
      headerStyle={{ display: 'none' }}
      mask
    >
      {model ? (
        <article className="model-detail-panel" data-model-detail-content>
          <header className="model-detail-panel-head">
            <div className="model-detail-heading">
              <span className="model-detail-logo"><ModelLogo model={model} size="large" /></span>
              <div className="model-detail-heading-copy">
                <p className="model-detail-eyebrow">{model.company}</p>
                <h2 id="modelDetailTitle">{model.name}</h2>
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

          <section className="model-detail-section" aria-labelledby="modelDetailDescriptionTitle">
            <div className="model-detail-section-heading"><h3 id="modelDetailDescriptionTitle">{t('console.modelDetail.descriptionTitle')}</h3></div>
            <p className="model-detail-description">{model.description || t('console.modelDetail.noDescription')}</p>
            <div className="model-detail-tags">{model.labels.map((label) => <span className="model-detail-tag model-detail-tag--neutral" key={label}>{localizeConsoleLabel(t, label)}</span>)}</div>
          </section>

          <section className="model-detail-section" aria-labelledby="modelDetailPricingTitle">
            <div className="model-detail-section-heading"><h3 id="modelDetailPricingTitle">{t('console.modelDetail.pricingTitle')}</h3><span>{t('console.modelDetail.pricingSource')}</span></div>
            <div className="model-detail-price-grid">
              <PriceCell label={t('console.modelDetail.inputTokens')} value={input.value} raw={input.raw} unit={unit} unavailableLabel={unavailableLabel} />
              <PriceCell label={t('console.modelDetail.outputTokens')} value={output.value} raw={output.raw} unit={unit} unavailableLabel={unavailableLabel} />
              <PriceCell label={t('console.modelDetail.cacheHitPrice')} value={undefined} unit={unit} unavailableLabel={unavailableLabel} />
              <PriceCell label={t('console.modelDetail.cacheCreatePrice')} value={undefined} unit={unit} unavailableLabel={unavailableLabel} />
            </div>
          </section>

          <section className="model-detail-section" aria-labelledby="modelDetailInfoTitle">
            <div className="model-detail-section-heading"><h3 id="modelDetailInfoTitle">{t('console.modelDetail.informationTitle')}</h3></div>
            <dl className="model-detail-info-grid">
              <div><dt>{t('console.common.context')}</dt><dd>{displayContextValue}</dd></div>
              <div><dt>{t('console.common.maxOutput')}</dt><dd>{model.maxOutput ?? '--'}</dd></div>
              <div><dt>{t('console.common.inputType')}</dt><dd>{inputType}</dd></div>
              <div><dt>{t('console.common.outputType')}</dt><dd>{outputType}</dd></div>
              <div><dt>{t('console.common.providerCount')}</dt><dd>{model.providerCount}</dd></div>
              <div><dt>{t('console.modelDetail.recommendedProtocol')}</dt><dd>{model.modality === 'text' ? 'OpenAI Chat Completions' : unavailableLabel}</dd></div>
            </dl>
            <div className="model-detail-capabilities">{model.capabilities.map((capability) => <span className="model-detail-tag model-detail-tag--accent" key={capability}>{localizeConsoleLabel(t, capability)}</span>)}</div>
          </section>

          <section className="model-detail-section" aria-labelledby="modelDetailActivityTitle">
            <div className="model-detail-section-heading"><h3 id="modelDetailActivityTitle">{t('console.modelDetail.activityTitle')}</h3></div>
            <p className="model-detail-chart-caption">{runtimeUnavailable}</p>
            <div className="model-detail-chart-frame">{unavailableChart(t('console.modelDetail.activityChart'), runtimeUnavailable)}</div>
            <div className="model-detail-chart-grid">
              <figure className="model-detail-chart-card"><figcaption><strong>{t('console.modelDetail.throughput')}</strong><span>tokens/s</span></figcaption>{unavailableChart(t('console.modelDetail.throughputChart'), runtimeUnavailable)}</figure>
              <figure className="model-detail-chart-card"><figcaption><strong>{t('console.modelDetail.firstTokenLatency')}</strong><span>ms</span></figcaption>{unavailableChart(t('console.modelDetail.firstTokenLatencyChart'), runtimeUnavailable)}</figure>
            </div>
            <div className="model-detail-metrics">
              <div><span>{t('console.modelDetail.recentAvailability')}</span><strong className={availabilityReady ? 'model-detail-availability' : ''}>{availabilityLabel}</strong><small>{localizeConsoleLabel(t, model.availability.window)}</small></div>
              <div><span>{t('console.modelDetail.platformTokens')}</span><strong>{throughputLabel}</strong><small>{t('console.modelDetail.successfulCallTotal')}</small></div>
            </div>
          </section>
        </article>
      ) : null}
    </SideSheet>
  )
}
