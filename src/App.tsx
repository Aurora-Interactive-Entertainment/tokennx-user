import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import Button from "@douyinfe/semi-ui/lib/es/button";
import {
  AppLoadingScreen,
  ConsoleLayout,
  DEFAULT_CONSOLE_PATH,
  PublicLayout,
} from "@/components/common";
import { AppStoreProvider } from "@/data/app-state";
import {
  hydrateAuth,
  invalidateAuth,
  synchronizeAuthenticatedUser,
} from "@/store/auth-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { subscribeAuthTokenChanges } from "@/auth/token-storage";
import { SeoManager } from "@/seo/site-seo";

const loadPublicPages = () => import("@/pages/public");
const loadInvitationPage = () => import("@/pages/join");
const loadConsoleCorePages = () => import("@/pages/console-core");
const loadConsoleAccountPages = () => import("@/pages/console-account");
const loadNewsPages = () => import("@/pages/news");

const HomePage = lazy(() =>
  loadPublicPages().then(({ HomePage }) => ({ default: HomePage })),
);
const ModelsPublicPage = lazy(() =>
  loadPublicPages().then(({ ModelsPublicPage }) => ({
    default: ModelsPublicPage,
  })),
);
const ModelDetailPage = lazy(() =>
  loadPublicPages().then(({ ModelDetailPage }) => ({
    default: ModelDetailPage,
  })),
);
const RankingsPage = lazy(() =>
  loadPublicPages().then(({ RankingsPage }) => ({ default: RankingsPage })),
);
const AppsPage = lazy(() =>
  loadPublicPages().then(({ AppsPage }) => ({ default: AppsPage })),
);
const DocsPage = lazy(() =>
  loadPublicPages().then(({ DocsPage }) => ({ default: DocsPage })),
);
const PricingPage = lazy(() =>
  loadPublicPages().then(({ PricingPage }) => ({ default: PricingPage })),
);
const StatusPage = lazy(() =>
  loadPublicPages().then(({ StatusPage }) => ({ default: StatusPage })),
);
const AboutPage = lazy(() =>
  loadPublicPages().then(({ AboutPage }) => ({ default: AboutPage })),
);
const ContactPage = lazy(() =>
  loadPublicPages().then(({ ContactPage }) => ({ default: ContactPage })),
);
const QuickstartPublicPage = lazy(() =>
  loadPublicPages().then(({ QuickstartPublicPage }) => ({
    default: QuickstartPublicPage,
  })),
);
const LegalPage = lazy(() =>
  loadPublicPages().then(({ LegalPage }) => ({ default: LegalPage })),
);
const LoginPage = lazy(() =>
  loadPublicPages().then(({ LoginPage }) => ({ default: LoginPage })),
);
const JoinPage = lazy(() =>
  loadInvitationPage().then(({ JoinPage }) => ({ default: JoinPage })),
);
const InviteLandingPage = lazy(() =>
  import("@/pages/invite").then(({ InviteLandingPage }) => ({
    default: InviteLandingPage,
  })),
);
const NewsListPage = lazy(() =>
  loadNewsPages().then(({ NewsListPage }) => ({ default: NewsListPage })),
);
const NewsDetailPage = lazy(() =>
  loadNewsPages().then(({ NewsDetailPage }) => ({ default: NewsDetailPage })),
);

const ConsoleModelsPage = lazy(() =>
  loadConsoleCorePages().then(({ ConsoleModelsPage }) => ({
    default: ConsoleModelsPage,
  })),
);
const PlaygroundPage = lazy(() =>
  loadConsoleCorePages().then(({ PlaygroundPage }) => ({
    default: PlaygroundPage,
  })),
);
const QuickstartPage = lazy(() =>
  loadConsoleCorePages().then(({ QuickstartPage }) => ({
    default: QuickstartPage,
  })),
);
const VideoPage = lazy(() =>
  import("@/pages/video-generation").then(({ VideoPage }) => ({
    default: VideoPage,
  })),
);
const ConsoleModelDetailPage = lazy(() =>
  import("@/pages/console-model-detail").then(({ ConsoleModelDetailPage }) => ({
    default: ConsoleModelDetailPage,
  })),
);

const ApiKeysPage = lazy(() =>
  loadConsoleAccountPages().then(({ ApiKeysPage }) => ({
    default: ApiKeysPage,
  })),
);
const BillingPage = lazy(() =>
  import("@/pages/billing").then(({ BillingPage }) => ({
    default: BillingPage,
  })),
);
const RechargePage = lazy(() =>
  import("@/pages/recharge").then(({ RechargePage }) => ({
    default: RechargePage,
  })),
);
const EnterpriseCreatePage = lazy(() =>
  loadConsoleAccountPages().then(({ EnterpriseCreatePage }) => ({
    default: EnterpriseCreatePage,
  })),
);
const EnterpriseModelsPage = lazy(() =>
  import("@/pages/enterprise-models").then(({ EnterpriseModelsPage }) => ({
    default: EnterpriseModelsPage,
  })),
);
const EnterpriseSettingsPage = lazy(() =>
  loadConsoleAccountPages().then(({ EnterpriseSettingsPage }) => ({
    default: EnterpriseSettingsPage,
  })),
);
const InvitationsPage = lazy(() =>
  loadConsoleAccountPages().then(({ InvitationsPage }) => ({
    default: InvitationsPage,
  })),
);
const EnterpriseGovernancePage = lazy(() =>
  import("@/pages/enterprise-governance").then(
    ({ EnterpriseGovernancePage }) => ({ default: EnterpriseGovernancePage }),
  ),
);
const TraeEnterpriseAnalysisPage = lazy(() =>
  import("@/pages/trae-enterprise").then(({ TraeEnterpriseAnalysisPage }) => ({
    default: TraeEnterpriseAnalysisPage,
  })),
);
const TraeEnterpriseMembersPage = lazy(() =>
  import("@/pages/trae-enterprise").then(({ TraeEnterpriseMembersPage }) => ({
    default: TraeEnterpriseMembersPage,
  })),
);
const SubscriptionPage = lazy(() =>
  import("@/pages/subscription").then(({ SubscriptionPage }) => ({
    default: SubscriptionPage,
  })),
);
const ImagePage = lazy(() =>
  import("@/pages/image-generation").then(({ ImagePage }) => ({
    default: ImagePage,
  })),
);
const TraeEnterpriseUsagePage = lazy(() =>
  import("@/pages/trae-enterprise").then(({ TraeEnterpriseUsagePage }) => ({
    default: TraeEnterpriseUsagePage,
  })),
);
const TraeEnterpriseAuditPage = lazy(() =>
  import("@/pages/trae-enterprise-audit").then(
    ({ TraeEnterpriseAuditPage }) => ({ default: TraeEnterpriseAuditPage }),
  ),
);
const PersonalUsagePage = lazy(() =>
  import("@/pages/personal-usage").then(({ PersonalUsagePage }) => ({
    default: PersonalUsagePage,
  })),
);
const RealNamePage = lazy(() =>
  import("@/pages/console-real-name").then(({ RealNamePage }) => ({
    default: RealNamePage,
  })),
);
const SettingsPage = lazy(() =>
  import("@/pages/console-profile").then(({ SettingsPage }) => ({
    default: SettingsPage,
  })),
);

export function ConsoleOutlet() {
  const { t } = useTranslation();
  const authStatus = useAppSelector((state) => state.auth.status);
  if (authStatus === "unknown" || authStatus === "loading")
    return <AppLoadingScreen label={t("console.common.checkingAuth")} />;
  if (authStatus !== "authenticated") return <Navigate replace to="/" />;
  return (
    <ConsoleLayout>
      <Outlet />
    </ConsoleLayout>
  );
}

export function ConsoleHomeRedirect() {
  return <Navigate replace to={DEFAULT_CONSOLE_PATH} />;
}

export function AuthBootstrap({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const authStatus = useAppSelector((state) => state.auth.status);

  useEffect(
    () =>
      subscribeAuthTokenChanges((change) => {
        if (change.type === "signed-out") {
          dispatch(invalidateAuth());
          navigate("/", { replace: true });
          return;
        }
        if (change.user) dispatch(synchronizeAuthenticatedUser(change.user));
      }),
    [dispatch, navigate],
  );

  useEffect(() => {
    if (authStatus === "unknown") void dispatch(hydrateAuth());
  }, [authStatus, dispatch]);

  return children;
}

function EnglishLocaleRoute() {
  const { i18n } = useTranslation();
  useEffect(() => {
    if (!i18n.language.startsWith("en")) void i18n.changeLanguage("en-US");
  }, [i18n]);
  return <Outlet />;
}

function NotFoundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <PublicLayout>
      <div className="public-container not-found-page">
        <span className="eyebrow">{t("console.modelDetail.notFoundCode")}</span>
        <h1>{t("console.modelDetail.notFoundPageTitle")}</h1>
        <p>{t("console.modelDetail.notFoundPageDescription")}</p>
        <Button theme="solid" type="primary" onClick={() => navigate("/")}>
          {t("console.modelDetail.backHome")}
        </Button>
      </div>
    </PublicLayout>
  );
}

function AppLoadingFallback() {
  const { t } = useTranslation();
  return <AppLoadingScreen label={t("console.common.loadingPage")} />;
}

// 中文：每次切换路由后把页面滚动位置复位，避免新页面沿用上一个页面的阅读位置。
function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    root.style.scrollBehavior = previousScrollBehavior;
  }, [pathname, search]);

  return null;
}

function BootReadyWatcher({ onBootReady }: { onBootReady: () => void }) {
  useEffect(() => {
    if (typeof window.requestAnimationFrame === "function") {
      const frame = window.requestAnimationFrame(onBootReady);
      return () => window.cancelAnimationFrame(frame);
    }

    const timer = window.setTimeout(onBootReady, 0);
    return () => window.clearTimeout(timer);
  }, [onBootReady]);

  return null;
}

export default function App({ onBootReady }: { onBootReady: () => void }) {
  return (
    <BrowserRouter>
      <SeoManager />
      <ScrollToTop />
      <AppStoreProvider>
        <AuthBootstrap>
          <BootReadyWatcher onBootReady={onBootReady} />
          <Suspense fallback={<AppLoadingFallback />}>
            <Routes>
              <Route
                path="/"
                element={<HomePage onInitialScoreboardReady={onBootReady} />}
              />
              <Route path="/models" element={<ModelsPublicPage />} />
              <Route path="/models/:modelId" element={<ModelDetailPage />} />
              <Route path="/rankings" element={<RankingsPage />} />
              <Route path="/apps" element={<AppsPage />} />
              <Route path="/docs" element={<DocsPage />} />
              <Route path="/docs/:publicId/:slug?" element={<DocsPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/status" element={<StatusPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/quickstart" element={<QuickstartPublicPage />} />
              <Route path="/news" element={<NewsListPage />} />
              <Route path="/news/:id" element={<NewsDetailPage />} />
              <Route path="/terms" element={<LegalPage kind="terms" />} />
              <Route path="/privacy" element={<LegalPage kind="privacy" />} />
              <Route
                path="/recharge-agreement"
                element={<LegalPage kind="recharge" />}
              />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/join" element={<JoinPage />} />
              <Route path="/invite" element={<InviteLandingPage />} />
              <Route path="/en" element={<EnglishLocaleRoute />}>
                <Route
                  index
                  element={<HomePage onInitialScoreboardReady={onBootReady} />}
                />
                <Route path="models" element={<ModelsPublicPage />} />
                <Route path="models/:modelId" element={<ModelDetailPage />} />
                <Route path="rankings" element={<RankingsPage />} />
                <Route path="apps" element={<AppsPage />} />
                <Route path="docs" element={<DocsPage />} />
                <Route path="docs/:publicId/:slug?" element={<DocsPage />} />
                <Route path="pricing" element={<PricingPage />} />
                <Route path="status" element={<StatusPage />} />
                <Route path="about" element={<AboutPage />} />
                <Route path="contact" element={<ContactPage />} />
                <Route path="quickstart" element={<QuickstartPublicPage />} />
                <Route path="news" element={<NewsListPage />} />
                <Route path="news/:id" element={<NewsDetailPage />} />
                <Route path="terms" element={<LegalPage kind="terms" />} />
                <Route path="privacy" element={<LegalPage kind="privacy" />} />
                <Route path="login" element={<LoginPage />} />
              </Route>
              <Route path="/console" element={<ConsoleOutlet />}>
                <Route index element={<ConsoleHomeRedirect />} />
                <Route path="models" element={<ConsoleModelsPage />} />
                <Route
                  path="models/:modelId"
                  element={<ConsoleModelDetailPage />}
                />
                <Route path="playground" element={<PlaygroundPage />} />
                <Route path="image" element={<ImagePage />} />
                <Route path="video" element={<VideoPage />} />
                <Route path="quickstart" element={<QuickstartPage />} />
                <Route path="api-keys" element={<ApiKeysPage />} />
                <Route
                  path="enterprise-api-keys"
                  element={<ApiKeysPage mode="enterprise" />}
                />
                <Route path="usage" element={<PersonalUsagePage />} />
                <Route path="billing" element={<BillingPage />} />
                <Route path="subscription" element={<SubscriptionPage />} />
                <Route path="recharge" element={<RechargePage />} />
                <Route path="real-name" element={<RealNamePage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="invitations" element={<InvitationsPage />} />
                <Route
                  path="enterprise-create"
                  element={<EnterpriseCreatePage />}
                />
                <Route
                  path="enterprise-governance"
                  element={<EnterpriseGovernancePage />}
                />
                <Route
                  path="enterprise-models"
                  element={<EnterpriseModelsPage />}
                />
                <Route
                  path="enterprise-settings"
                  element={<EnterpriseSettingsPage />}
                />
                <Route
                  path="trae-enterprise/data-analysis"
                  element={<TraeEnterpriseAnalysisPage />}
                />
                <Route
                  path="trae-enterprise/users"
                  element={<TraeEnterpriseMembersPage />}
                />
                <Route
                  path="trae-enterprise/subscription"
                  element={<SubscriptionPage />}
                />
                <Route
                  path="trae-enterprise/usage"
                  element={<TraeEnterpriseUsagePage />}
                />
                <Route
                  path="trae-enterprise/operation-log"
                  element={<TraeEnterpriseAuditPage />}
                />
              </Route>
              <Route path="/home" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </AuthBootstrap>
      </AppStoreProvider>
    </BrowserRouter>
  );
}
