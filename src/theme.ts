import { useSyncExternalStore } from 'react'

export type ThemeMode = 'light' | 'dark'

export interface ThemeTransitionOrigin {
  x: number
  y: number
}

export const THEME_STORAGE_KEY = 'token-nx:theme'

const THEME_CHANGE_EVENT = 'token-nx-theme-change'
const NEXT_THEME_MODE: Record<ThemeMode, ThemeMode> = { light: 'dark', dark: 'light' }

let themeMode: ThemeMode = readStoredThemeMode()
const listeners = new Set<() => void>()

function readStoredThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored

    // Resolve a missing or legacy `system` value once, then keep a concrete user preference.
    const initialTheme = systemTheme()
    window.localStorage.setItem(THEME_STORAGE_KEY, initialTheme)
    return initialTheme
  } catch {
    return systemTheme()
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

function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.themeMode = mode
  root.dataset.theme = mode
  root.style.colorScheme = mode
  // 中文：把解析后的主题桥接给 Semi UI。Semi 只识别 body[theme-mode="dark"]，
  // 否则未被手工重写的 Semi 组件（Toast、Switch、Pagination 等）会停留在亮色默认调色板，暗色下显示近黑文字。
  document.body?.setAttribute('theme-mode', mode)
}

function notify(): void {
  listeners.forEach((listener) => listener())
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: themeMode }))
}

applyTheme(themeMode)

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
  notify()
}

export function cycleThemeMode(): void {
  setThemeMode(NEXT_THEME_MODE[themeMode])
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function transitionGeometry(origin?: ThemeTransitionOrigin): { x: number; y: number; radius: number } {
  const x = Math.min(window.innerWidth, Math.max(0, origin?.x ?? window.innerWidth - 32))
  const y = Math.min(window.innerHeight, Math.max(0, origin?.y ?? 32))
  return {
    x,
    y,
    radius: Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)),
  }
}

function radialThemeTransition(origin: ThemeTransitionOrigin | undefined, previousResolvedTheme: string | undefined): void {
  const { x, y, radius } = transitionGeometry(origin)
  const overlay = document.createElement('div')
  overlay.className = 'theme-transition-overlay'
  overlay.dataset.theme = previousResolvedTheme === 'light' ? 'light' : 'dark'
  overlay.style.setProperty('--theme-transition-x', `${x}px`)
  overlay.style.setProperty('--theme-transition-y', `${y}px`)
  overlay.style.setProperty('--theme-transition-radius', `${radius}px`)
  const removeOverlay = () => overlay.remove()
  overlay.addEventListener('animationend', removeOverlay, { once: true })
  document.body.appendChild(overlay)
  window.setTimeout(removeOverlay, 1200)
}

export function cycleThemeModeWithTransition(origin?: ThemeTransitionOrigin): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    cycleThemeMode()
    return
  }

  const previousResolvedTheme = document.documentElement.dataset.theme
  const nextMode = NEXT_THEME_MODE[themeMode]
  if (nextMode === previousResolvedTheme) {
    setThemeMode(nextMode)
    return
  }
  if (prefersReducedMotion()) {
    setThemeMode(nextMode)
    return
  }

  radialThemeTransition(origin, previousResolvedTheme)
  setThemeMode(nextMode)
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

// Used by components that need the concrete palette, such as chart axes.
export function useResolvedTheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => themeMode,
    () => 'dark',
  )
}

export function themeModeLabel(mode: ThemeMode): string {
  return mode === 'light' ? 'theme.light' : 'theme.dark'
}
