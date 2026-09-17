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
  prefetchUnreadNotificationCount,
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
import type { ConsoleRoutePath } from "@/routes/console-route-meta";
import { syncSentryIdentity } from "@/observability/sentry";
import { WechatCallbackPage } from "@/pages/wechat-callback";
import { BuildUpdateNotice } from "@/components/build-update-notice";
import { CONSOLE_IMAGE_GENERATION_ENABLED } from "@/config/console-features";
import siteI18n from "@/i18n";
import { RequestErrorPanel } from "@/components/request-error-panel";

const loadPublicPages = () => import("@/pages/public");
const loadInvitationPage = () => import("@/pages/join");
const loadConsoleCorePages = () => import("@/pages/console-core");
const loadConsoleAccountPages = () => import("@/pages/console-account");
const loadNewsPages = () => import("@/pages/news");
const SentryTestPage =
  import.meta.env.DEV && import.meta.env.VITE_SENTRY_TEST_ENABLED === "true"
    ? lazy(() => import("@/pages/sentry-test-page"))
    : null;

const HomePage = lazy(() =>
  import("@/pages/home").then(({ HomePage }) => ({ default: HomePage })),
);
const ModelsPublicPage = lazy(() =>
  loadPublicPages().then(({ ModelsPublicPage }) => ({
    default: ModelsPublicPage,
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
const PurchasePage = lazy(() =>
  import("@/pages/purchase").then(({ PurchasePage }) => ({
    default: PurchasePage,
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

// 路由组件必须覆盖标题清单，防止新增控制台页面漏配元信息。
const consolePages: Record<ConsoleRoutePath, ReactNode> = {
  "models": <ConsoleModelsPage />,
  "models/:modelId": <ConsoleModelDetailPage />,
  "playground": <PlaygroundPage />,
  // 未开放的功能同步限制直接路由，避免进入仅有模拟生成的页面。
  "image": CONSOLE_IMAGE_GENERATION_ENABLED ? <ImagePage /> : <Navigate to={DEFAULT_CONSOLE_PATH} replace />,
  "video": <VideoPage />,
  "quickstart": <QuickstartPage />,
  "api-keys": <ApiKeysPage />,
  "enterprise-api-keys": <ApiKeysPage mode="enterprise" />,
  "usage": <PersonalUsagePage />,
  "billing": <BillingPage />,
  "subscription": <SubscriptionPage />,
  "purchase": <PurchasePage />,
  "recharge": <RechargePage />,
  "real-name": <RealNamePage />,
  "settings": <SettingsPage />,
  "invitations": <InvitationsPage />,
  "enterprise-create": <EnterpriseCreatePage />,
  "enterprise-governance": <EnterpriseGovernancePage />,
  "enterprise-models": <EnterpriseModelsPage />,
  "enterprise-settings": <EnterpriseSettingsPage />,
  "trae-enterprise/data-analysis": <TraeEnterpriseAnalysisPage />,
  "trae-enterprise/users": <TraeEnterpriseMembersPage />,
  "trae-enterprise/subscription": <SubscriptionPage />,
  "trae-enterprise/usage": <TraeEnterpriseUsagePage />,
  "trae-enterprise/operation-log": <TraeEnterpriseAuditPage />,
};

export function ConsoleOutlet() {
  const { t } = useTranslation();
  const auth = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();
  const authStatus = auth.status;
  // 恢复失败仅阻止受保护页面；重试期间保留错误和禁用按钮，避免反复切换整页加载态。
  if (authStatus === "restore-failed" || (!auth.user && auth.hydrationError))
    return <div className="app-loading-screen"><RequestErrorPanel message={auth.hydrationError?.message || t("api.auth.requestFailed")} retrying={Boolean(auth.hydrationRequestId)} onRetry={() => { void dispatch(hydrateAuth()); }} /></div>;
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

  // 登录后取一次未读通知数：铃铛红点来自客服浮层派发的未读数事件，
  // 浮层此前只在打开通知面板时才取数，导致红点必须点一下才出现。
  // 这里按登录态取一次（不轮询、未登录不请求），结果由 Header 复用。
  useEffect(() => {
    if (authStatus !== "authenticated") return undefined;
    const controller = new AbortController();
    void prefetchUnreadNotificationCount(controller.signal).catch(() => {
      // 取数失败不影响页面，红点保持隐藏，等用户打开通知面板时再取。
    });
    return () => controller.abort();
  }, [authStatus]);

  useEffect(
    () =>
      subscribeAuthTokenChanges((change) => {
        if (change.type === "signed-out") {
          dispatch(invalidateAuth());
          navigate("/", { replace: true });
          return;
        }
        if (change.user) dispatch(synchronizeAuthenticatedUser(change.user, change.isRefresh === true));
      }),
    [dispatch, navigate],
  );

  useEffect(() => {
    if (authStatus === "unknown") void dispatch(hydrateAuth());
  }, [authStatus, dispatch]);

  // 公开页由页头展示非阻断恢复提示，控制台是否可访问仅由 ConsoleOutlet 判断。
  return children;
}

function EnglishLocaleRoute() {
  const { pathname } = useLocation();
  useEffect(() => {
    // 只在进入英文路径时同步语言，切回中文时不能由尚未卸载的旧路由抢写。
    if (!siteI18n.language.startsWith("en")) void siteI18n.changeLanguage("en-US");
  }, [pathname]);
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

// 每次切换路由后把页面滚动位置复位，避免新页面沿用上一个页面的阅读位置。
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

export function AuthScopedStoreProvider({ children }: { children: ReactNode }) {
  const auth = useAppSelector((state) => state.auth)
  const { i18n } = useTranslation()
  const { pathname } = useLocation()
  // 请求等待和失败不改变账号身份，避免登录表单被重建后丢失输入和错误提示。
  const userId = auth.user?.id ?? null

  useEffect(() => {
    const consoleScope = pathname.startsWith('/console/trae-enterprise')
      || pathname.startsWith('/console/enterprise-')
      ? 'enterprise'
      : pathname.startsWith('/console')
        ? 'personal'
        : 'public'

    // 只同步内部用户 ID 和低敏页面范围，不上传邮箱、手机号或路由查询参数。
    syncSentryIdentity({
      userId: userId || null,
      locale: i18n.language.startsWith('en') ? 'en-US' : 'zh-CN',
      consoleScope,
    })
  }, [i18n.language, pathname, userId])

  // AppStoreProvider 内部按 userId 重建，继续隔离登录、退出和切换账号的数据。
  return <AppStoreProvider userId={userId}>{children}</AppStoreProvider>
}

export default function App({ onBootReady }: { onBootReady: () => void }) {
  return (
    <BrowserRouter>
      <SeoManager />
      <ScrollToTop />
      <BuildUpdateNotice />
      <AuthBootstrap>
        <>
          <AuthScopedStoreProvider>
            <BootReadyWatcher onBootReady={onBootReady} />
            <Suspense fallback={<AppLoadingFallback />}>
              <Routes>
              <Route
                path="/"
                element={<HomePage onInitialScoreboardReady={onBootReady} />}
              />
              <Route path="/models" element={<ModelsPublicPage />} />
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
              <Route path="/weixin/callback" element={<WechatCallbackPage />} />
              <Route path="/join" element={<JoinPage />} />
              <Route path="/invite" element={<InviteLandingPage />} />
              <Route path="/en" element={<EnglishLocaleRoute />}>
                <Route
                  index
                  element={<HomePage onInitialScoreboardReady={onBootReady} />}
                />
                <Route path="models" element={<ModelsPublicPage />} />
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
                <Route path="recharge-agreement" element={<LegalPage kind="recharge" />} />
                <Route path="login" element={<LoginPage />} />
              </Route>
              <Route path="/console" element={<ConsoleOutlet />}>
                <Route index element={<ConsoleHomeRedirect />} />
                {/* 兼容仍被运营配置引用的旧成员入口。 */}
                <Route path="members" element={<Navigate to="/console/trae-enterprise/users" replace />} />
                {Object.entries(consolePages).map(([path, element]) => (
                  <Route key={path} path={path} element={element} />
                ))}
              </Route>
              <Route path="/home" element={<Navigate to="/" replace />} />
              {SentryTestPage ? (
                <Route path="/__sentry-test" element={<SentryTestPage />} />
              ) : null}
              {/* 未匹配路由统一回到首页，暂时不展示 404 页面。 */}
              <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </AuthScopedStoreProvider>
        </>
      </AuthBootstrap>
    </BrowserRouter>
  );
}
