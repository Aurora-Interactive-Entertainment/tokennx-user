import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Card from '@douyinfe/semi-ui/lib/es/card'
import Tag from '@douyinfe/semi-ui/lib/es/tag'
import { IconArrowRight, IconCheckCircleStroked, IconCode, IconHistory } from '@douyinfe/semi-icons'
import { BannerNotice, EmptyPanel, ModelLogo, ModelTags, PageTitle, localizeConsoleLabel } from '@/components/common'
import { appToast } from '@/components/app-toast'
import { ModelPriceSummary } from '@/components/money'
import { useAppStore } from '@/data/app-state'
import { findModelInList, modelAlias, modelRouteKey } from '@/data/models'
import { useUserModels } from '@/data/user-models'
import { BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES } from '@/utils/format'

export function ConsoleModelDetailPage() {
  const { t } = useTranslation()
  const { modelId } = useParams()
  const navigate = useNavigate()
  const store = useAppStore()
  const { models, loading, error } = useUserModels()
  const model = findModelInList(models, modelId)
  const routeKey = model ? modelRouteKey(model) : undefined

  useEffect(() => {
    if (error) appToast.error(error)
  }, [error])

  useEffect(() => {
    if (!model || !routeKey || modelId === routeKey) return
    navigate(`/console/models/${encodeURIComponent(routeKey)}`, { replace: true })
  }, [model, modelId, navigate, routeKey])

  if (loading) return <div className="page-stack"><PageTitle title={t('console.modelDetail.title')} description={t('console.modelDetail.description')} /><EmptyPanel title={t('console.modelDetail.loadingTitle')} description={t('console.modelDetail.loadingDescription')} /></div>
  if (error) return <div className="page-stack"><PageTitle title={t('console.modelDetail.title')} description={t('console.modelDetail.description')} /></div>
  if (!model) return <div className="page-stack"><PageTitle title={t('console.modelDetail.notFoundTitle')} description={t('console.modelDetail.notFoundDescription')} /><EmptyPanel title={t('console.modelDetail.unavailableTitle')} description={t('console.modelDetail.unavailableDescription')} action={<Button theme="outline" onClick={() => navigate('/console/models')}>{t('console.modelDetail.backCatalog')}</Button>} /></div>

  const displayAlias = modelAlias(model) || t('console.common.modelAliasUnset')
  const canUseAlias = Boolean(modelAlias(model))
  const modelQuery = routeKey ? encodeURIComponent(routeKey) : ''

  return <div className="page-stack"><PageTitle title={model.name} description={`${model.company} · ${displayAlias}`} actions={<Button theme="solid" type="primary" disabled={!canUseAlias} onClick={() => navigate(`/console/playground?model=${modelQuery}`)}>{t('console.modelDetail.onlineTest')}</Button>} /><BannerNotice>{t('console.modelDetail.notice')}</BannerNotice><div className="console-model-hero"><div className="model-detail-identity"><ModelLogo model={model} size="large"/><div><span className="eyebrow">{model.company}</span><h2>{model.name}</h2><code>{displayAlias}</code></div></div><ModelTags model={model}/><p>{model.description}</p><div className="console-model-facts"><div><span>{t('console.modelDetail.context')}</span><strong>{model.context ?? t('console.modelDetail.byParameters')}</strong></div><div><span>{t('console.common.tokenNxPrice')}</span><strong><ModelPriceSummary price={model.tokenNxPrice} digits={BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES} /></strong></div><div><span>{t('console.modelDetail.currentWorkspace')}</span><strong>{store.activeWorkspace.name}</strong></div><div><span>{t('console.modelDetail.recent24h')}</span><strong>{model.availability.rate > 0 ? `${model.availability.rate}%` : localizeConsoleLabel(t, model.availability.window)}</strong></div></div></div><div className="detail-action-grid"><Card title={t('console.modelDetail.testTitle')}><IconHistory/><h3>{t('console.modelDetail.testHeading')}</h3><p>{t('console.modelDetail.testCopy')}</p><Button theme="borderless" disabled={!canUseAlias} icon={<IconArrowRight/>} iconPosition="right" onClick={() => navigate(`/console/playground?model=${modelQuery}`)}>{t('console.modelDetail.openTest')}</Button></Card><Card title={t('console.modelDetail.accessTitle')}><IconCode/><h3>{t('console.modelDetail.accessHeading')}</h3><p>{t('console.modelDetail.accessCopy')}</p><Button theme="borderless" disabled={!canUseAlias} icon={<IconArrowRight/>} iconPosition="right" onClick={() => navigate(`/console/api-keys?model=${modelQuery}`)}>{t('console.modelDetail.manageKeys')}</Button></Card><Card title={t('console.modelDetail.permissionTitle')}><IconCheckCircleStroked/><h3>{t('console.modelDetail.permissionHeading')}</h3><p>{t('console.modelDetail.permissionCopy')}</p><Tag color="green">{t('console.modelDetail.enabled')}</Tag></Card></div></div>
}
