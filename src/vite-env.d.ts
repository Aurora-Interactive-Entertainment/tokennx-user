/// <reference types="vite/client" />

declare const __SENTRY_RELEASE__: string;
declare const __TOKEN_NX_BUILD_VERSION__: string;

interface Window {
  __TOKEN_NX_BUILD_VERSION__?: string;
  __TOKEN_NX_UPDATE_GUARD__?: {
    readonly pendingVersion: string;
    check: (urgent?: boolean) => Promise<void>;
    routeChanged: () => Promise<void>;
    blockReload: () => () => void;
  };
}

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
