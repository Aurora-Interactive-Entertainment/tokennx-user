/// <reference types="vite/client" />

declare const __SENTRY_RELEASE__: string;

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_PROXY_TARGET?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_SENTRY_API_ERROR_SAMPLE_RATE?: string;
  readonly VITE_SENTRY_CHUNK_ERROR_SAMPLE_RATE?: string;
  readonly VITE_SENTRY_TEST_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
