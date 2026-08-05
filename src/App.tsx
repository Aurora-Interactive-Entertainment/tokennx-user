import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useParams, useNavigate } from 'react-router'
import { Button, Card, Tag } from '@douyinfe/semi-ui'
import { IconArrowRight, IconCheckCircleStroked, IconCode, IconHistory } from '@douyinfe/semi-icons'
import { AppLoadingScreen, ConsoleLayout, DEFAULT_CONSOLE_PATH, EmptyPanel, PublicLayout, PageTitle, ModelLogo, ModelTags, BannerNotice, localizeConsoleLabel } from '@/components/common'
import { ModelPriceSummary } from '@/components/money'
import { AppStoreProvider, useAppStore } from '@/data/app-state'
import { hydrateAuth, invalidateAuth, synchronizeAuthenticatedUser } from '@/store/auth-slice'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { subscribeAuthTokenChanges } from '@/auth/token-storage'
import { findModelInList, modelAlias, modelRouteKey } from '@/data/models'
import { useUserModels } from '@/data/user-models'

const loadPublicPages = () => import('@/pages/public')
const loadInvitationPage = () => import('@/pages/join')
const loadConsoleCorePages = () => import('@/pages/console-core')
const loadConsoleAccountPages = () => import('@/pages/console-account')
const loadEnterprisePages = () => import('@/pages/enterprise-console')

const HomePage = lazy(() => loadPublicPages().then(({ HomePage }) => ({ default: HomePage })))
const ModelsPublicPage = lazy(() => loadPublicPages().then(({ ModelsPublicPage }) => ({ default: ModelsPublicPage })))
const ModelDetailPage = lazy(() => loadPublicPages().then(({ ModelDetailPage }) => ({ default: ModelDetailPage })))
const DocsPage = lazy(() => loadPublicPages().then(({ DocsPage }) => ({ default: DocsPage })))
const PricingPage = lazy(() => loadPublicPages().then(({ PricingPage }) => ({ default: PricingPage })))
const StatusPage = lazy(() => loadPublicPages().then(({ StatusPage }) => ({ default: StatusPage })))
const AboutPage = lazy(() => loadPublicPages().then(({ AboutPage }) => ({ default: AboutPage })))
const LegalPage = lazy(() => loadPublicPages().then(({ LegalPage }) => ({ default: LegalPage })))
const LoginPage = lazy(() => loadPublicPages().then(({ LoginPage }) => ({ default: LoginPage })))
const JoinPage = lazy(() => loadInvitationPage().then(({ JoinPage }) => ({ default: JoinPage })))

const ConsoleModelsPage = lazy(() => loadConsoleCorePages().then(({ ConsoleModelsPage }) => ({ default: ConsoleModelsPage })))
const PlaygroundPage = lazy(() => loadConsoleCorePages().then(({ PlaygroundPage }) => ({ default: PlaygroundPage })))
const QuickstartPage = lazy(() => loadConsoleCorePages().then(({ QuickstartPage }) => ({ default: QuickstartPage })))
const VideoPage = lazy(() => loadConsoleCorePages().then(({ VideoPage }) => ({ default: VideoPage })))

const ApiKeysPage = lazy(() => loadConsoleAccountPages().then(({ ApiKeysPage }) => ({ default: ApiKeysPage })))
const BillingPage = lazy(() => loadConsoleAccountPages().then(({ BillingPage }) => ({ default: BillingPage })))
const EnterpriseCreatePage = lazy(() => loadConsoleAccountPages().then(({ EnterpriseCreatePage }) => ({ default: EnterpriseCreatePage })))
const EnterpriseModelsPage = lazy(() => loadEnterprisePages().then(({ EnterpriseModelsPage }) => ({ default: EnterpriseModelsPage })))
const EnterpriseSettingsPage = lazy(() => loadConsoleAccountPages().then(({ EnterpriseSettingsPage }) => ({ default: EnterpriseSettingsPage })))
const InvitationsPage = lazy(() => loadConsoleAccountPages().then(({ InvitationsPage }) => ({ default: InvitationsPage })))
const EnterpriseAnalyticsPage = lazy(() => loadEnterprisePages().then(({ EnterpriseAnalyticsPage }) => ({ default: EnterpriseAnalyticsPage })))
const EnterpriseAuditLogPage = lazy(() => loadEnterprisePages().then(({ EnterpriseAuditLogPage }) => ({ default: EnterpriseAuditLogPage })))
const EnterpriseUsagePage = lazy(() => loadEnterprisePages().then(({ EnterpriseUsagePage }) => ({ default: EnterpriseUsagePage })))
const EnterpriseGovernancePage = lazy(() => loadEnterprisePages().then(({ EnterpriseGovernancePage }) => ({ default: EnterpriseGovernancePage })))
const MembersPage = lazy(() => loadEnterprisePages().then(({ MembersPage }) => ({ default: MembersPage })))
const RecordsPage = lazy(() => loadConsoleAccountPages().then(({ RecordsPage }) => ({ default: RecordsPage })))
const UsagePage = lazy(() => import('@/pages/usage').then(({ UsagePage }) => ({ default: UsagePage })))
const RealNamePage = lazy(() => import('@/pages/console-real-name').then(({ RealNamePage }) => ({ default: RealNamePage })))
const SettingsPage = lazy(() => import('@/pages/console-profile').then(({ SettingsPage }) => ({ default: SettingsPage })))

export function ConsoleOutlet() {
  const { t } = useTranslation()
  const authStatus = useAppSelector((state) => state.auth.status)
  if (authStatus === 'unknown' || authStatus === 'loading') return <AppLoadingScreen label={t('console.common.checkingAuth')} />
  if (authStatus !== 'authenticated') return <Navigate replace to="/" />
  return <ConsoleLayout><Outlet /></ConsoleLayout>
}

// 中文：访问控制台根路径时直接进入快速接入，不再加载已经移除的总览页。
export function ConsoleHomeRedirect() {
  return <Navigate replace to={DEFAULT_CONSOLE_PATH} />
}

export function AuthBootstrap({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const authStatus = useAppSelector((state) => state.auth.status)

  useEffect(() => subscribeAuthTokenChanges((change) => {
    if (change.type === 'signed-out') {
      dispatch(invalidateAuth())
      navigate('/', { replace: true })
      return
    }
    if (change.user) dispatch(synchronizeAuthenticatedUser(change.user))
  }), [dispatch, navigate])

  useEffect(() => {
    if (authStatus === 'unknown') void dispatch(hydrateAuth())
  }, [authStatus, dispatch])

  return children
}

function ConsoleModelDetailPage() {
  const { t } = useTranslation()
  const { modelId } = useParams()
  const navigate = useNavigate()
  const store = useAppStore()
  const { models, loading, error, refresh } = useUserModels()
  const model = findModelInList(models, modelId)
  const routeKey = model ? modelRouteKey(model) : undefined
  useEffect(() => {
    if (!model || !routeKey || modelId === routeKey) return
    navigate(`/console/models/${encodeURIComponent(routeKey)}`, { replace: true })
  }, [model, modelId, navigate, routeKey])
  if (loading) return <div className="page-stack"><PageTitle title={t('console.modelDetail.title')} description={t('console.modelDetail.description')} /><EmptyPanel title={t('console.modelDetail.loadingTitle')} description={t('console.modelDetail.loadingDescription')} /></div>
  if (error) return <div className="page-stack"><PageTitle title={t('console.modelDetail.title')} description={t('console.modelDetail.description')} /><EmptyPanel title={t('console.modelDetail.errorTitle')} description={error} action={<Button theme="outline" onClick={refresh}>{t('console.common.reload')}</Button>} /></div>
  if (!model) return <div className="page-stack"><PageTitle title={t('console.modelDetail.notFoundTitle')} description={t('console.modelDetail.notFoundDescription')} /><EmptyPanel title={t('console.modelDetail.unavailableTitle')} description={t('console.modelDetail.unavailableDescription')} action={<Button theme="outline" onClick={() => navigate('/console/models')}>{t('console.modelDetail.backCatalog')}</Button>} /></div>
  const displayAlias = modelAlias(model) || t('console.common.modelAliasUnset')
  const canUseAlias = Boolean(modelAlias(model))
  const modelQuery = routeKey ? encodeURIComponent(routeKey) : ''
  return <div className="page-stack"><PageTitle title={model.name} description={`${model.company} · ${displayAlias}`} actions={<Button theme="solid" type="primary" disabled={!canUseAlias} onClick={() => navigate(`/console/playground?model=${modelQuery}`)}>{t('console.modelDetail.onlineTest')}</Button>} /><BannerNotice>{t('console.modelDetail.notice')}</BannerNotice><div className="console-model-hero"><div className="model-detail-identity"><ModelLogo model={model} size="large"/><div><span className="eyebrow">{model.company}</span><h2>{model.name}</h2><code>{displayAlias}</code></div></div><ModelTags model={model}/><p>{model.description}</p><div className="console-model-facts"><div><span>{t('console.modelDetail.context')}</span><strong>{model.context ?? t('console.modelDetail.byParameters')}</strong></div><div><span>{t('console.common.tokenNxPrice')}</span><strong><ModelPriceSummary price={model.tokenNxPrice} /></strong></div><div><span>{t('console.modelDetail.currentWorkspace')}</span><strong>{store.activeWorkspace.name}</strong></div><div><span>{t('console.modelDetail.recent24h')}</span><strong>{model.availability.rate > 0 ? `${model.availability.rate}%` : localizeConsoleLabel(t, model.availability.window)}</strong></div></div></div><div className="detail-action-grid"><Card title={t('console.modelDetail.testTitle')}><IconHistory/><h3>{t('console.modelDetail.testHeading')}</h3><p>{t('console.modelDetail.testCopy')}</p><Button theme="borderless" disabled={!canUseAlias} icon={<IconArrowRight/>} iconPosition="right" onClick={() => navigate(`/console/playground?model=${modelQuery}`)}>{t('console.modelDetail.openTest')}</Button></Card><Card title={t('console.modelDetail.accessTitle')}><IconCode/><h3>{t('console.modelDetail.accessHeading')}</h3><p>{t('console.modelDetail.accessCopy')}</p><Button theme="borderless" disabled={!canUseAlias} icon={<IconArrowRight/>} iconPosition="right" onClick={() => navigate(`/console/api-keys?model=${modelQuery}`)}>{t('console.modelDetail.manageKeys')}</Button></Card><Card title={t('console.modelDetail.permissionTitle')}><IconCheckCircleStroked/><h3>{t('console.modelDetail.permissionHeading')}</h3><p>{t('console.modelDetail.permissionCopy')}</p><Tag color="green">{t('console.modelDetail.enabled')}</Tag></Card></div></div>
}

function NotFoundPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return <PublicLayout><div className="public-container not-found-page"><span className="eyebrow">404 · NOT FOUND</span><h1>{t('console.modelDetail.notFoundPageTitle')}</h1><p>{t('console.modelDetail.notFoundPageDescription')}</p><Button theme="solid" type="primary" onClick={() => navigate('/')}>{t('console.modelDetail.backHome')}</Button></div></PublicLayout>
}

function AppLoadingFallback() {
  const { t } = useTranslation()
  return <AppLoadingScreen label={t('console.common.loadingPage')} />
}

function BootReadyWatcher({ onBootReady }: { onBootReady: () => void }) {
  const location = useLocation()

  useEffect(() => {
    if (location.pathname === '/' || location.pathname === '/home') return

    if (typeof window.requestAnimationFrame === 'function') {
      const frame = window.requestAnimationFrame(onBootReady)
      return () => window.cancelAnimationFrame(frame)
    }

    const timer = window.setTimeout(onBootReady, 0)
    return () => window.clearTimeout(timer)
  }, [location.pathname, onBootReady])

  return null
}

export default function App({ onBootReady }: { onBootReady: () => void }) {
  return <BrowserRouter><AppStoreProvider><AuthBootstrap><BootReadyWatcher onBootReady={onBootReady} /><Suspense fallback={<AppLoadingFallback />}><Routes><Route path="/" element={<HomePage onInitialScoreboardReady={onBootReady}/>}/><Route path="/models" element={<ModelsPublicPage/>}/><Route path="/models/:modelId" element={<ModelDetailPage/>}/><Route path="/docs" element={<DocsPage/>}/><Route path="/pricing" element={<PricingPage/>}/><Route path="/status" element={<StatusPage/>}/><Route path="/about" element={<AboutPage/>}/><Route path="/terms" element={<LegalPage kind="terms"/>}/><Route path="/privacy" element={<LegalPage kind="privacy"/>}/><Route path="/login" element={<LoginPage/>}/><Route path="/join" element={<JoinPage/>}/><Route path="/console" element={<ConsoleOutlet/>}><Route index element={<ConsoleHomeRedirect/>}/><Route path="models" element={<ConsoleModelsPage/>}/><Route path="models/:modelId" element={<ConsoleModelDetailPage/>}/><Route path="playground" element={<PlaygroundPage/>}/><Route path="video" element={<VideoPage/>}/><Route path="quickstart" element={<QuickstartPage/>}/><Route path="api-keys" element={<ApiKeysPage/>}/><Route path="usage" element={<UsagePage/>}/><Route path="records" element={<RecordsPage/>}/><Route path="billing" element={<BillingPage/>}/><Route path="real-name" element={<RealNamePage/>}/><Route path="settings" element={<SettingsPage/>}/><Route path="invitations" element={<InvitationsPage/>}/><Route path="enterprise-create" element={<EnterpriseCreatePage/>}/><Route path="members" element={<MembersPage/>}/><Route path="enterprise-governance" element={<EnterpriseGovernancePage/>}/><Route path="enterprise-usage" element={<EnterpriseUsagePage/>}/><Route path="enterprise-records" element={<EnterpriseAuditLogPage/>}/><Route path="enterprise-audit-log" element={<EnterpriseAuditLogPage/>}/><Route path="enterprise-analytics" element={<EnterpriseAnalyticsPage/>}/><Route path="enterprise-models" element={<EnterpriseModelsPage/>}/><Route path="enterprise-settings" element={<EnterpriseSettingsPage/>}/></Route><Route path="*" element={<NotFoundPage/>}/><Route path="/home" element={<Navigate to="/" replace />}/></Routes></Suspense></AuthBootstrap></AppStoreProvider></BrowserRouter>
}
