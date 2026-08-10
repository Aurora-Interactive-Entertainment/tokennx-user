import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import { AppLoadingScreen, ConsoleLayout, DEFAULT_CONSOLE_PATH, PublicLayout } from '@/components/common'
import { AppStoreProvider } from '@/data/app-state'
import { hydrateAuth, invalidateAuth, synchronizeAuthenticatedUser } from '@/store/auth-slice'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { subscribeAuthTokenChanges } from '@/auth/token-storage'

const loadPublicPages = () => import('@/pages/public')
const loadInvitationPage = () => import('@/pages/join')
const loadConsoleCorePages = () => import('@/pages/console-core')
const loadConsoleAccountPages = () => import('@/pages/console-account')

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
const VideoPage = lazy(() => import('@/pages/video-generation').then(({ VideoPage }) => ({ default: VideoPage })))
const ConsoleModelDetailPage = lazy(() => import('@/pages/console-model-detail').then(({ ConsoleModelDetailPage }) => ({ default: ConsoleModelDetailPage })))

const ApiKeysPage = lazy(() => loadConsoleAccountPages().then(({ ApiKeysPage }) => ({ default: ApiKeysPage })))
const BillingPage = lazy(() => import('@/pages/billing').then(({ BillingPage }) => ({ default: BillingPage })))
const EnterpriseCreatePage = lazy(() => loadConsoleAccountPages().then(({ EnterpriseCreatePage }) => ({ default: EnterpriseCreatePage })))
const EnterpriseModelsPage = lazy(() => import('@/pages/enterprise-models').then(({ EnterpriseModelsPage }) => ({ default: EnterpriseModelsPage })))
const EnterpriseSettingsPage = lazy(() => loadConsoleAccountPages().then(({ EnterpriseSettingsPage }) => ({ default: EnterpriseSettingsPage })))
const InvitationsPage = lazy(() => loadConsoleAccountPages().then(({ InvitationsPage }) => ({ default: InvitationsPage })))
const EnterpriseAnalyticsPage = lazy(() => import('@/pages/enterprise-analytics').then(({ EnterpriseAnalyticsPage }) => ({ default: EnterpriseAnalyticsPage })))
const EnterpriseAuditLogPage = lazy(() => import('@/pages/enterprise-audit-log').then(({ EnterpriseAuditLogPage }) => ({ default: EnterpriseAuditLogPage })))
const EnterpriseUsagePage = lazy(() => import('@/pages/enterprise-usage').then(({ EnterpriseUsagePage }) => ({ default: EnterpriseUsagePage })))
const EnterpriseGovernancePage = lazy(() => import('@/pages/enterprise-governance').then(({ EnterpriseGovernancePage }) => ({ default: EnterpriseGovernancePage })))
const MembersPage = lazy(() => import('@/pages/enterprise-members').then(({ MembersPage }) => ({ default: MembersPage })))
const RecordsPage = lazy(() => import('@/pages/records').then(({ RecordsPage }) => ({ default: RecordsPage })))
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
  useEffect(() => {
    if (typeof window.requestAnimationFrame === 'function') {
      const frame = window.requestAnimationFrame(onBootReady)
      return () => window.cancelAnimationFrame(frame)
    }

    const timer = window.setTimeout(onBootReady, 0)
    return () => window.clearTimeout(timer)
  }, [onBootReady])

  return null
}

export default function App({ onBootReady }: { onBootReady: () => void }) {
  return (
    <BrowserRouter>
      <AppStoreProvider>
        <AuthBootstrap>
          <BootReadyWatcher onBootReady={onBootReady} />
          <Suspense fallback={<AppLoadingFallback />}>
            <Routes>
              <Route path="/" element={<HomePage onInitialScoreboardReady={onBootReady} />} />
              <Route path="/models" element={<ModelsPublicPage />} />
              <Route path="/models/:modelId" element={<ModelDetailPage />} />
              <Route path="/docs" element={<DocsPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/status" element={<StatusPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/terms" element={<LegalPage kind="terms" />} />
              <Route path="/privacy" element={<LegalPage kind="privacy" />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/join" element={<JoinPage />} />
              <Route path="/console" element={<ConsoleOutlet />}>
                <Route index element={<ConsoleHomeRedirect />} />
                <Route path="models" element={<ConsoleModelsPage />} />
                <Route path="models/:modelId" element={<ConsoleModelDetailPage />} />
                <Route path="playground" element={<PlaygroundPage />} />
                <Route path="video" element={<VideoPage />} />
                <Route path="quickstart" element={<QuickstartPage />} />
                <Route path="api-keys" element={<ApiKeysPage />} />
                <Route path="usage" element={<UsagePage />} />
                <Route path="records" element={<RecordsPage />} />
                <Route path="billing" element={<BillingPage />} />
                <Route path="real-name" element={<RealNamePage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="invitations" element={<InvitationsPage />} />
                <Route path="enterprise-create" element={<EnterpriseCreatePage />} />
                <Route path="members" element={<MembersPage />} />
                <Route path="enterprise-governance" element={<EnterpriseGovernancePage />} />
                <Route path="enterprise-usage" element={<EnterpriseUsagePage />} />
                <Route path="enterprise-records" element={<EnterpriseAuditLogPage />} />
                <Route path="enterprise-audit-log" element={<EnterpriseAuditLogPage />} />
                <Route path="enterprise-analytics" element={<EnterpriseAnalyticsPage />} />
                <Route path="enterprise-models" element={<EnterpriseModelsPage />} />
                <Route path="enterprise-settings" element={<EnterpriseSettingsPage />} />
              </Route>
              <Route path="/home" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </AuthBootstrap>
      </AppStoreProvider>
    </BrowserRouter>
  )
}
