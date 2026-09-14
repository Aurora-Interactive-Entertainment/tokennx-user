import { BUILD_VERSION } from "@/build-version";

const RECOVERY_KEY = "token-nx:chunk-recovery";

/** 识别入口与懒加载分块版本不一致导致的加载失败。 */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /ChunkLoadError|Loading (?:CSS )?chunk|Failed to fetch dynamically imported module|Importing a module script failed|dynamically imported module/i.test(message);
}

/** 每个构建版本最多自动恢复一次，避免缓存异常时无限刷新。 */
export function recoverFromChunkLoadError(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(RECOVERY_KEY) === BUILD_VERSION) return false;
    window.sessionStorage.setItem(RECOVERY_KEY, BUILD_VERSION);
  } catch {
    return false;
  }
  const url = new URL(window.location.href);
  url.searchParams.set("__token_nx_build", BUILD_VERSION);
  window.location.replace(url.toString());
  return true;
}
