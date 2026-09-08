import Button from "@douyinfe/semi-ui/lib/es/button";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Sentry } from "@/observability/sentry";
import "./app-error-boundary.css";

function AppErrorFallback({ resetError }: { resetError: () => void }) {
  const { t } = useTranslation();

  useEffect(() => {
    // 中文：即使应用在首屏渲染阶段崩溃，也必须释放静态加载层以展示恢复入口。
    document.documentElement.classList.add("app-ready");
  }, []);

  return (
    <main className="app-error-boundary" role="alert">
      <section
        className="app-error-boundary__card"
        aria-labelledby="app-error-title"
      >
        <span className="app-error-boundary__eyebrow">
          {t("appError.eyebrow")}
        </span>
        <h1 id="app-error-title">{t("appError.title")}</h1>
        <p>{t("appError.description")}</p>
        <div className="app-error-boundary__actions">
          <Button theme="solid" type="primary" onClick={resetError}>
            {t("appError.retry")}
          </Button>
          <Button onClick={() => window.location.reload()}>
            {t("appError.refresh")}
          </Button>
        </div>
      </section>
    </main>
  );
}

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Sentry.ErrorBoundary
      showDialog={false}
      beforeCapture={(scope) => {
        scope.setTag("capture_source", "react-boundary");
        scope.setTag("monitoring_priority", "critical");
      }}
      fallback={({ resetError }) => (
        <AppErrorFallback resetError={resetError} />
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
