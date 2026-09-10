import type { Breadcrumb, ErrorEvent, EventHint } from "@sentry/react";

const SENSITIVE_KEY_PATTERN =
  /(?:token|authorization|cookie|password|secret|api[-_]?key|prompt|content|message|email|phone|mobile|id[-_]?card)/i;
const EXTENSION_URL_PATTERN = /^(?:chrome|moz|safari-web)-extension:\/\//i;
const THIRD_PARTY_FRAME_PATTERN =
  /(?:googletagmanager\.com|google-analytics\.com|doubleclick\.net|clarity\.ms|hm\.baidu\.com)\//i;
const NOISE_MESSAGE_PATTERN =
  /ResizeObserver loop limit exceeded|ResizeObserver loop completed with undelivered notifications/i;
const NETWORK_NOISE_PATTERN =
  /^(?:TypeError:\s*)?(?:Failed to fetch|Load failed|Network request failed|NetworkError when attempting to fetch resource\.?|The Internet connection appears to be offline\.?|Script error\.?)$/i;
const CHUNK_ERROR_PATTERN =
  /(?:ChunkLoadError|Loading (?:CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed)/i;
const RESOURCE_PATH_SEGMENTS = new Set([
  "api-keys",
  "departments",
  "docs",
  "enterprise",
  "exports",
  "files",
  "invitations",
  "invoices",
  "materials",
  "members",
  "models",
  "news",
  "notifications",
  "orders",
  "roles",
  "tags",
  "users",
]);
const RESOURCE_ACTION_SEGMENTS = new Set([
  "accept",
  "approve",
  "bind",
  "cancel",
  "code",
  "confirm",
  "create",
  "delete",
  "disable",
  "download",
  "enable",
  "list",
  "overview",
  "precheck",
  "records",
  "refresh",
  "reject",
  "reorder",
  "retry",
  "revoke",
  "search",
  "send",
  "stats",
  "status",
  "submit",
  "summary",
  "unbind",
  "update",
  "upload",
  "validate",
  "verify",
]);

const ALLOWED_TAGS = new Set([
  "monitoring_priority",
  "capture_source",
  "error.kind",
  "api.method",
  "api.status",
  "api.code",
  "locale",
  "auth_state",
  "console_scope",
]);
const ALLOWED_CONTEXTS = new Set(["react", "browser", "os", "culture", "api"]);

function replaceUrlInText(text: string): string {
  return text.replace(
    /https?:\/\/[^\s)\]}]+/gi,
    (url) => sanitizeRequestUrl(url) || "[URL]",
  );
}

export function redactText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  return replaceUrlInText(value)
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|pk|nx)[-_][A-Za-z0-9_-]{8,}\b/g, "[REDACTED_KEY]")
    .replace(
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\b/g,
      "[REDACTED_TOKEN]",
    )
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[REDACTED_ID]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[REDACTED_TOKEN]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, "[REDACTED_PHONE]")
    .replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, "[REDACTED_ID]")
    .replace(
      new RegExp(
        `(${SENSITIVE_KEY_PATTERN.source})\\s*[:=]\\s*[^\\s,;&]+`,
        "gi",
      ),
      "$1=[REDACTED]",
    );
}

export function stripUrlQuery(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;

  try {
    const base =
      typeof window === "undefined"
        ? "https://local.invalid"
        : window.location.origin;
    const parsed = new URL(value, base);
    return parsed.origin === base
      ? parsed.pathname
      : `${parsed.origin}${parsed.pathname}`;
  } catch {
    return value.split(/[?#]/, 1)[0] || undefined;
  }
}

export function sanitizeRequestUrl(value: unknown): string | undefined {
  const sanitized = stripUrlQuery(value);
  if (!sanitized) return undefined;

  try {
    const base =
      typeof window === "undefined"
        ? "https://local.invalid"
        : window.location.origin;
    const pathname = new URL(sanitized, base).pathname;
    const segments = pathname.split("/");

    // 资源 ID、邀请标识和用户自定义 slug 都统一模板化，避免出现在事件与面包屑中。
    return segments
      .map((segment, index) => {
        if (!segment) return segment;

        let decoded = segment;
        try {
          decoded = decodeURIComponent(segment);
        } catch {
          return ":id";
        }

        const previous = segments[index - 1]?.toLowerCase();
        const normalized = decoded.toLowerCase();
        if (
          RESOURCE_PATH_SEGMENTS.has(previous) &&
          !RESOURCE_ACTION_SEGMENTS.has(normalized)
        ) {
          return ":id";
        }
        if (
          decoded.includes("@") ||
          decoded.length > 32 ||
          /^\d+$/.test(decoded) ||
          /^(?:[0-9a-f]{8,}|[0-9a-hjkmnp-tv-z]{20,})$/i.test(decoded) ||
          !/^[a-z0-9._~-]+$/i.test(decoded)
        ) {
          return ":id";
        }

        return decoded;
      })
      .join("/");
  } catch {
    return sanitized.startsWith("/") ? sanitized : undefined;
  }
}

export function sanitizeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const category = breadcrumb.category || "";
  if (category === "console" || category.startsWith("ui.")) return null;

  const sanitized: Breadcrumb = {};
  if (breadcrumb.type) sanitized.type = breadcrumb.type;
  if (breadcrumb.level) sanitized.level = breadcrumb.level;
  if (breadcrumb.category) sanitized.category = breadcrumb.category;
  if (breadcrumb.timestamp) sanitized.timestamp = breadcrumb.timestamp;
  if (breadcrumb.message) sanitized.message = redactText(breadcrumb.message);

  if (category === "fetch" || category === "xhr") {
    const data: NonNullable<Breadcrumb["data"]> = {};
    if (typeof breadcrumb.data?.method === "string")
      data.method = breadcrumb.data.method;
    if (typeof breadcrumb.data?.status_code === "number") {
      data.status_code = breadcrumb.data.status_code;
    }
    const url = sanitizeRequestUrl(breadcrumb.data?.url);
    if (url) data.url = url;
    sanitized.data = data;
  } else if (category === "navigation") {
    const data: NonNullable<Breadcrumb["data"]> = {};
    const from = sanitizeRequestUrl(breadcrumb.data?.from);
    const to = sanitizeRequestUrl(breadcrumb.data?.to);
    if (from) data.from = from;
    if (to) data.to = to;
    sanitized.data = data;
  }

  return sanitized;
}

function sanitizeTags(tags: ErrorEvent["tags"]): ErrorEvent["tags"] {
  if (!tags) return undefined;

  return Object.fromEntries(
    Object.entries(tags)
      .filter(
        ([key]) => ALLOWED_TAGS.has(key) && !SENSITIVE_KEY_PATTERN.test(key),
      )
      .map(([key, value]) => [
        key,
        typeof value === "string" ? redactText(value) : value,
      ]),
  );
}

function sanitizeContexts(
  contexts: ErrorEvent["contexts"],
): ErrorEvent["contexts"] {
  if (!contexts) return undefined;

  return Object.fromEntries(
    Object.entries(contexts).filter(([key]) => ALLOWED_CONTEXTS.has(key)),
  );
}

export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
  event.message = redactText(event.message);
  if (event.logentry) {
    event.logentry = { message: redactText(event.logentry.message) };
  }

  event.user = event.user?.id ? { id: String(event.user.id) } : undefined;
  event.request = event.request
    ? {
        method: event.request.method,
        url: sanitizeRequestUrl(event.request.url),
      }
    : undefined;
  event.tags = sanitizeTags(event.tags);
  event.contexts = sanitizeContexts(event.contexts);
  event.extra = undefined;
  event.transaction = sanitizeRequestUrl(event.transaction);
  event.threads = undefined;
  event.breadcrumbs = event.breadcrumbs
    ?.map(sanitizeBreadcrumb)
    .filter((breadcrumb): breadcrumb is Breadcrumb => breadcrumb !== null);

  for (const exception of event.exception?.values ?? []) {
    exception.value = redactText(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) {
      frame.filename = stripUrlQuery(frame.filename);
      frame.abs_path = stripUrlQuery(frame.abs_path);
      frame.vars = undefined;
    }
  }

  return event;
}

function getErrorMessage(event: ErrorEvent, hint: EventHint): string {
  const original = hint.originalException;
  if (original instanceof Error) return `${original.name}: ${original.message}`;
  if (typeof original === "string") return original;
  return (
    event.message ||
    event.exception?.values
      ?.map((exception) => `${exception.type}: ${exception.value}`)
      .join(" ") ||
    ""
  );
}

export function isChunkLoadError(event: ErrorEvent, hint: EventHint): boolean {
  return CHUNK_ERROR_PATTERN.test(getErrorMessage(event, hint));
}

export function isDiscardedBrowserNoise(
  event: ErrorEvent,
  hint: EventHint,
): boolean {
  const original = hint.originalException;
  const message = getErrorMessage(event, hint);

  if (
    (typeof DOMException !== "undefined" &&
      original instanceof DOMException &&
      original.name === "AbortError") ||
    (original instanceof Error && original.name === "AbortError") ||
    (original instanceof Error && original.name === "ApiError") ||
    event.exception?.values?.some(
      (exception) => exception.type === "ApiError",
    ) ||
    NETWORK_NOISE_PATTERN.test(message) ||
    NOISE_MESSAGE_PATTERN.test(message)
  ) {
    return true;
  }

  const frames =
    event.exception?.values?.flatMap(
      (exception) => exception.stacktrace?.frames ?? [],
    ) ?? [];
  if (frames.length === 0) return false;

  return frames.every((frame) => {
    const filename = frame.filename || "";
    return (
      EXTENSION_URL_PATTERN.test(filename) ||
      THIRD_PARTY_FRAME_PATTERN.test(filename)
    );
  });
}

export function createSentrySignature(
  event: ErrorEvent,
  route: string,
): string {
  const exception = event.exception?.values?.[0];
  const frame = exception?.stacktrace?.frames?.at(-1);

  return [
    event.release || "no-release",
    event.tags?.["capture_source"] || "automatic",
    event.tags?.["error.kind"] || exception?.type || "Error",
    frame?.filename || "no-file",
    frame?.function || "no-function",
    frame?.lineno || 0,
    route,
  ].join("|");
}
