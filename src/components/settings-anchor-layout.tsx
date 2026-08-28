import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

export interface SettingsAnchorItem {
  id: string
  label: string
}

interface SettingsAnchorLayoutProps {
  items: SettingsAnchorItem[]
  navigationLabel: string
  children: ReactNode
}

export function SettingsAnchorLayout({ items, navigationLabel, children }: SettingsAnchorLayoutProps) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? '')
  const manualScrollRef = useRef<number | null>(null)

  useEffect(() => {
    if (!items.some((item) => item.id === activeId)) setActiveId(items[0]?.id ?? '')
  }, [activeId, items])

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((section): section is HTMLElement => Boolean(section))
    if (!sections.length) return

    let frame = 0
    const updateActiveSection = () => {
      frame = 0
      if (manualScrollRef.current !== null) return
      const viewportMarker = window.innerHeight * 0.22
      const maxScrollTop = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      )
      // 中文：内容不足一屏时不强制激活最后一项，避免点击锚点后被“页面底部”判断覆盖。
      if (maxScrollTop <= 24) return
      const pageBottom = window.scrollY >= maxScrollTop - 2
      if (pageBottom) {
        setActiveId(sections.at(-1)?.id ?? '')
        return
      }
      const currentSection = sections.reduce<HTMLElement>((current, section) => (
        section.getBoundingClientRect().top <= viewportMarker ? section : current
      ), sections[0])
      setActiveId(currentSection.id)
    }
    const handleScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateActiveSection)
    }

    // 中文：以视口上部为当前阅读区，并在到达页面底部时激活最后一个区块。
    updateActiveSection()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [items])

  const scrollToSection = useCallback((id: string) => {
    const section = document.getElementById(id)
    if (!section) return
    setActiveId(id)
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${id}`)
    section.scrollIntoView({
      behavior: typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    })
    if (manualScrollRef.current !== null) window.clearTimeout(manualScrollRef.current)
    manualScrollRef.current = window.setTimeout(() => {
      manualScrollRef.current = null
      window.dispatchEvent(new Event('scroll'))
    }, 700)
  }, [])

  useEffect(() => () => {
    if (manualScrollRef.current !== null) window.clearTimeout(manualScrollRef.current)
  }, [])

  return (
    <div className="settings-anchor-layout">
      <nav className="settings-anchor-nav" aria-label={navigationLabel}>
        {items.map((item) => (
          <button
            className={`settings-anchor-link${activeId === item.id ? ' is-active' : ''}`}
            type="button"
            aria-current={activeId === item.id ? 'location' : undefined}
            key={item.id}
            onClick={() => scrollToSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="settings-anchor-content">{children}</div>
    </div>
  )
}
