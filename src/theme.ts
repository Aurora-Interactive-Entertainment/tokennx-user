import { useSyncExternalStore } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'token-nx:theme'

const THEME_CHANGE_EVENT = 'token-nx-theme-change'

let themeMode: ThemeMode = readStoredThemeMode()
const listeners = new Set<() => void>()
let mediaQuery: MediaQueryList | null = null

function readStoredThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark'
  } catch {
    // 中文：浏览器禁用存储时使用系统主题，避免阻塞首屏渲染。
    return 'dark'
  }
}

function systemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark'
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function resolvedTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? systemTheme() : mode
}

function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const resolved = resolvedTheme(mode)
  root.dataset.themeMode = mode
  root.dataset.theme = resolved
  root.style.colorScheme = resolved
  // 中文：把解析后的主题桥接给 Semi UI。Semi 只识别 body[theme-mode="dark"]，
  // 否则未被手工重写的 Semi 组件（Toast、Switch、Pagination 等）会停留在亮色默认调色板，暗色下显示近黑文字。
  document.body?.setAttribute('theme-mode', resolved)
}

function notify(): void {
  listeners.forEach((listener) => listener())
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: themeMode }))
}

function handleSystemThemeChange(): void {
  if (themeMode === 'system') {
    applyTheme(themeMode)
    notify()
  }
}

function syncSystemListener(): void {
  if (typeof window === 'undefined') return
  if (mediaQuery) mediaQuery.removeEventListener('change', handleSystemThemeChange)
  try {
    mediaQuery = themeMode === 'system' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null
  } catch {
    mediaQuery = null
  }
  mediaQuery?.addEventListener('change', handleSystemThemeChange)
}

applyTheme(themeMode)
syncSystemListener()

export function getThemeMode(): ThemeMode {
  return themeMode
}

export function setThemeMode(mode: ThemeMode): void {
  themeMode = mode
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // 中文：主题切换仍在当前页面生效，持久化失败不影响用户继续操作。
  }
  applyTheme(mode)
  syncSystemListener()
  notify()
}

export function cycleThemeMode(): void {
  const nextMode: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' }
  setThemeMode(nextMode[themeMode])
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getThemeMode,
    () => 'dark',
  )
}

// 中文：返回解析后的实际主题（light/dark）。相比 useThemeMode，它在“跟随系统”时也会在系统主题切换后更新，
// 适合需要按真实明暗取色的场景（如图表坐标轴颜色）。
export function useResolvedTheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => resolvedTheme(themeMode),
    () => 'dark',
  )
}

export function themeModeLabel(mode: ThemeMode): string {
  return mode === 'light' ? 'theme.light' : mode === 'dark' ? 'theme.dark' : 'theme.system'
}
