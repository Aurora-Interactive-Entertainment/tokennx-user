import { useEffect, useId, useRef } from 'react'
import './wave-background.css'

// 生成中画框的默认流速：比演示稿的 1× 略快，出效果更明显。
export const WAVE_BACKGROUND_DEFAULT_SPEED = 1.25

const FRAME_INTERVAL_MS = 1000 / 30
const MAX_FRAME_DELTA_S = 0.1
const MIN_SPEED = 0.1
const MAX_SPEED = 3

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// 曲线两端各留出一段，模糊后不会出现白边。
function wavePoints(boundary: (x: number) => number): string {
  let path = ''
  for (let x = -240; x <= 1200; x += 20) path += `${x === -240 ? 'M' : 'L'}${x},${boundary(x).toFixed(2)}`
  return path
}

function topShape(boundary: (x: number) => number): string {
  return `${wavePoints(boundary)}L1200,-300L-240,-300Z`
}

function bottomShape(boundary: (x: number) => number): string {
  return `${wavePoints(boundary)}L1200,840L-240,840Z`
}

/** 持续改写 SVG 曲线与光晕位置，而不是跑一段 CSS 动画：波峰才会真正从一侧传播到另一侧。 */
function startWaveMotion(root: HTMLElement, speedInput: number): () => void {
  const query = (name: string) => root.querySelector<SVGElement>(`[data-part="${name}"]`)
  const warm = query('warm')
  const violet = query('violet')
  const cool = query('cool')
  const sky = query('sky')
  const orange = query('orange')
  const mist = query('mist')
  if (!warm || !violet || !cool || !sky || !orange || !mist) return () => {}

  let speed = clamp(Number.isFinite(speedInput) ? speedInput : 1, MIN_SPEED, MAX_SPEED)
  let phase = 0
  let frame = 0
  let previous = 0
  let lastDraw = 0
  let disposed = false

  const draw = (t: number): void => {
    // 两组不同频率叠加：形成从一侧向另一侧传播的波峰，而非整块渐变左右平移。
    const upper = (x: number): number => 265 + 76 * Math.sin(x * 0.0056 - t * 0.88) + 24 * Math.sin(x * 0.0091 + t * 0.53 + 1.1)
    const lower = (x: number): number => 386 + 70 * Math.sin(x * 0.0051 - t * 0.98 + 1.15) + 23 * Math.sin(x * 0.0102 + t * 0.64)
    violet.setAttribute('d', topShape((x) => upper(x) + 48))
    warm.setAttribute('d', topShape(upper))
    cool.setAttribute('d', bottomShape(lower))
    mist.setAttribute('d', wavePoints((x) => lower(x) - 12))
    sky.setAttribute('cx', (65 + 110 * Math.sin(t * 0.67)).toFixed(2))
    sky.setAttribute('cy', (20 + 76 * Math.sin(t * 0.81 + 0.3)).toFixed(2))
    orange.setAttribute('cx', (890 + 135 * Math.sin(t * 0.57 + 0.45)).toFixed(2))
    orange.setAttribute('cy', (-5 + 80 * Math.sin(t * 0.76 + 0.8)).toFixed(2))
  }

  const stop = (): void => {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
  }

  const schedule = (): void => {
    if (disposed || document.hidden || frame) return
    previous = performance.now()
    frame = requestAnimationFrame(tick)
  }

  const tick = (now: number): void => {
    frame = 0
    if (disposed || document.hidden) return
    const delta = clamp((now - previous) / 1000, 0, MAX_FRAME_DELTA_S)
    previous = now
    phase += delta * speed
    // 按约 30fps 绘制：计时与刷新率无关，高刷屏不会让动效变快。
    if (now - lastDraw >= FRAME_INTERVAL_MS - 0.5) {
      draw(phase)
      lastDraw = now
    }
    frame = requestAnimationFrame(tick)
  }

  // 切到后台就停画，回前台再续上，避免隐藏标签页里空转。
  const onVisibilityChange = (): void => {
    if (document.hidden) stop()
    else schedule()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  draw(0)
  root.classList.add('is-ready')
  schedule()

  return () => {
    disposed = true
    stop()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}

/** 视频「正在创建」画框的波浪背景。装饰层，对读屏隐藏；容器尺寸与圆角由调用方负责。 */
export function WaveBackground({ speed = WAVE_BACKGROUND_DEFAULT_SPEED }: { speed?: number } = {}) {
  const rootRef = useRef<HTMLDivElement>(null)
  // 同一页面可能同时挂多个实例，SVG 的 defs id 必须唯一，否则 url(#…) 会全指到第一个。
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const id = (name: string) => `${uid}-${name}`

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    // 系统要求减少动态效果时保留静态渐变，不启动逐帧绘制。
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    return startWaveMotion(root, speed)
  }, [speed])

  return <div className="wave-background" ref={rootRef} aria-hidden="true">
    <div className="wave-background-fallback"><i /><i /></div>
    <svg className="wave-background-art" viewBox="0 0 960 540" preserveAspectRatio="none" focusable="false">
      <defs>
        <linearGradient id={id('base')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e7d1e0" />
          <stop offset="0.45" stopColor="#d6c6df" />
          <stop offset="0.72" stopColor="#a3cdf7" />
          <stop offset="1" stopColor="#39b0f5" />
        </linearGradient>
        <linearGradient id={id('warm')} x1="0" y1="0.2" x2="1" y2="0.65">
          <stop offset="0" stopColor="#ded0e5" />
          <stop offset="0.4" stopColor="#f5bec7" />
          <stop offset="0.75" stopColor="#ffc3b0" />
          <stop offset="1" stopColor="#f5b8bf" />
        </linearGradient>
        <linearGradient id={id('cool')} gradientUnits="userSpaceOnUse" x1="0" y1="220" x2="0" y2="600">
          <stop offset="0" stopColor="#92d1ff" />
          <stop offset="0.48" stopColor="#61bffc" />
          <stop offset="1" stopColor="#27aaf2" />
        </linearGradient>
        <radialGradient id={id('sky')}>
          <stop offset="0" stopColor="#96ddff" />
          <stop offset="0.5" stopColor="#9adaff" stopOpacity=".97" />
          <stop offset="1" stopColor="#a1dfff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('orange')}>
          <stop offset="0" stopColor="#ff9a57" />
          <stop offset="0.4" stopColor="#ffa36a" stopOpacity=".95" />
          <stop offset="1" stopColor="#ffb48f" stopOpacity="0" />
        </radialGradient>
        <filter id={id('soften')} x="-300" y="-300" width="1560" height="1140" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="32" />
        </filter>
      </defs>
      <rect width="960" height="540" fill={`url(#${id('base')})`} />
      <g filter={`url(#${id('soften')})`}>
        <path data-part="violet" fill="#bfbadd" />
        <path data-part="warm" fill={`url(#${id('warm')})`} />
        <ellipse data-part="sky" cx="40" cy="20" rx="380" ry="290" fill={`url(#${id('sky')})`} />
        <ellipse data-part="orange" cx="960" cy="-10" rx="340" ry="250" fill={`url(#${id('orange')})`} />
        <path data-part="cool" fill={`url(#${id('cool')})`} />
        <path data-part="mist" fill="none" stroke="#b1dfff" strokeWidth="48" opacity=".50" />
      </g>
    </svg>
  </div>
}
