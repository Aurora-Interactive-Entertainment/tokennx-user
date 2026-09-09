import * as Sentry from "@sentry/react";
import type { ErrorEvent, EventHint } from "@sentry/react";
import {
  canSendSentryEvent,
  normalizeSampleRate,
  passesSampleRate,
  type SentryEventCategory,
} from "./sentry-rate-limit";
import {
  createSentrySignature,
  isChunkLoadError,
  isDiscardedBrowserNoise,
  sanitizeBreadcrumb,
  sanitizeRequestUrl,
  sanitizeSentryEvent,
} from "./sentry-sanitizer";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CRITICAL_API_PREFIXES = [
  "/api/auth/",
  "/api/user/api-keys",
  "/api/user/enterprise",
  "/api/user/billing",
  "/api/user/payment",
  "/api/user/real-name",
  "/api/user/account-deletion",
  "/api/user/profile",
  "/api/user/invitations",
  "/api/user/exports",
];

const sentryDsn = import.meta.env.VITE_SENTRY_DSN?.trim() || "";
const sentryEnvironment =
  import.meta.env.VITE_SENTRY_ENVIRONMENT?.trim() || import.meta.env.MODE;
const sentryRelease =
  typeof __SENTRY_RELEASE__ === "string"
    ? __SENTRY_RELEASE__.trim() || undefined
    : undefined;
const apiErrorSampleRate = normalizeSampleRate(
  import.meta.env.VITE_SENTRY_API_ERROR_SAMPLE_RATE,
  sentryEnvironment === "production" ? 0.1 : 0,
);
const chunkErrorSampleRate = normalizeSampleRate(
  import.meta.env.VITE_SENTRY_CHUNK_ERROR_SAMPLE_RATE,
  sentryEnvironment === "production" ? 0.1 : 0,
);
const reportedApiErrors = new WeakSet<object>();

let sentryInitialized = false;

function currentRoute(): string {
  if (typeof window === "undefined") return "/";
  return sanitizeRequestUrl(window.location.href) || "/";
}

function classifyEvent(
  event: ErrorEvent,
  hint: EventHint,
): SentryEventCategory {
  if (event.tags?.capture_source === "api") return "api";
  if (isChunkLoadError(event, hint)) return "chunk";
  return "critical";
}

function shouldKeepEvent(
  event: ErrorEvent,
  hint: EventHint,
): ErrorEvent | null {
  const original = hint.originalException;
  if (
    original !== null &&
    typeof original === "object" &&
    reportedApiErrors.has(original) &&
    event.tags?.capture_source !== "api"
  ) {
    return null;
  }

  if (isDiscardedBrowserNoise(event, hint)) return null;

  const category = classifyEvent(event, hint);
  const rate =
    category === "api"
      ? apiErrorSampleRate
      : category === "chunk"
        ? chunkErrorSampleRate
        : 1;
  if (!passesSampleRate(rate)) return null;

  event.tags = {
    ...event.tags,
    capture_source: event.tags?.capture_source || "automatic",
    monitoring_priority: category,
  };
  const sanitized = sanitizeSentryEvent(event);
  const signature = createSentrySignature(sanitized, currentRoute());

  return canSendSentryEvent(category, signature) ? sanitized : null;
}

export function initSentry(): void {
  if (!sentryDsn || sentryInitialized) return;

  Sentry.init({
    dsn: sentryDsn,
    environment: sentryEnvironment,
    release: sentryRelease,
    sampleRate: 1,
    enableLogs: false,
    sendClientReports: false,
    maxBreadcrumbs: 30,
    normalizeDepth: 3,
    maxValueLength: 250,
    enhanceFetchErrorMessages: false,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    },
    integrations(defaultIntegrations) {
      return [
        ...defaultIntegrations.filter(
          (integration) =>
            integration.name !== "BrowserSession" &&
            integration.name !== "Breadcrumbs",
        ),
        Sentry.breadcrumbsIntegration({
          console: false,
          dom: false,
          fetch: true,
          history: true,
          sentry: false,
          xhr: true,
        }),
      ];
    },
    beforeBreadcrumb(breadcrumb) {
      return sanitizeBreadcrumb(breadcrumb);
    },
    beforeSend: shouldKeepEvent,
  });

  sentryInitialized = true;
}

export function isSentryEnabled(): boolean {
  return sentryInitialized;
}

export function createReactRootErrorHandler():
  ReturnType<typeof Sentry.reactErrorHandler> | undefined {
  return sentryInitialized ? Sentry.reactErrorHandler() : undefined;
}

export interface SentryIdentityContext {
  userId?: string | null;
  locale: string;
  consoleScope: "public" | "personal" | "enterprise";
}

export function syncSentryIdentity({
  userId,
  locale,
  consoleScope,
}: SentryIdentityContext): void {
  if (!sentryInitialized) return;

  Sentry.setUser(userId ? { id: userId } : null);
  Sentry.setTag("locale", locale);
  Sentry.setTag("auth_state", userId ? "authenticated" : "anonymous");
  Sentry.setTag("console_scope", consoleScope);
}

export interface CriticalApiFailure {
  error: Error;
  method: string;
  status: number;
  code?: number | string;
  requestId?: string;
  path: string;
}

export function shouldReportCriticalApiFailure(
  method: string,
  status: number,
  path: string,
): boolean {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = sanitizeRequestUrl(path) || "/";

  return (
    status >= 500 &&
    status <= 599 &&
    MUTATION_METHODS.has(normalizedMethod) &&
    CRITICAL_API_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))
  );
}

export function reportCriticalApiFailure({
  error,
  method,
  status,
  code,
  requestId,
  path,
}: CriticalApiFailure): void {
  if (
    !sentryInitialized ||
    !shouldReportCriticalApiFailure(method, status, path)
  )
    return;

  const safePath = sanitizeRequestUrl(path) || "/";
  const normalizedMethod = method.toUpperCase();
  reportedApiErrors.add(error);

  // 中文：不上传后端错误文案或响应体，只用固定异常和低敏结构化信息定位问题。
  const safeError = new Error("Critical API request failed");
  safeError.name = "CriticalApiError";

  Sentry.withScope((scope) => {
    scope.setTags({
      capture_source: "api",
      "api.method": normalizedMethod,
      "api.status": String(status),
      ...(code === undefined ? {} : { "api.code": String(code) }),
    });
    scope.setContext("api", {
      method: normalizedMethod,
      path: safePath,
      status,
      code,
      requestId,
    });
    scope.setFingerprint([
      "critical-api",
      normalizedMethod,
      safePath,
      String(status),
      String(code ?? ""),
    ]);
    Sentry.captureException(safeError, {
      mechanism: { handled: true, type: "api" },
    });
  });
}

export { Sentry };
