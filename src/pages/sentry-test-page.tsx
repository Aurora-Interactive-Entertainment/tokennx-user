import Button from "@douyinfe/semi-ui/lib/es/button";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import "./sentry-test-page.css";

export default function SentryTestPage() {
  const { t } = useTranslation();
  const [throwRenderError, setThrowRenderError] = useState(false);

  if (throwRenderError) throw new Error("Sentry test: React render failure");

  const throwGlobalError = () => {
    window.setTimeout(() => {
      throw new Error("Sentry test: uncaught JavaScript failure");
    }, 0);
  };

  return (
    <main className="sentry-test-page">
      <section className="sentry-test-page__card">
        <span>{t("sentryTest.eyebrow")}</span>
        <h1>{t("sentryTest.title")}</h1>
        <p>{t("sentryTest.description")}</p>
        <div className="sentry-test-page__actions">
          <Button theme="solid" type="primary" onClick={throwGlobalError}>
            {t("sentryTest.javascriptError")}
          </Button>
          <Button type="danger" onClick={() => setThrowRenderError(true)}>
            {t("sentryTest.reactError")}
          </Button>
        </div>
      </section>
    </main>
  );
}
