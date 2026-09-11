import '@douyinfe/semi-ui/react19-adapter'
import '@douyinfe/semi-ui/lib/es/_base/base.css'
import { useCallback } from 'react'
import { Provider } from 'react-redux'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AppErrorBoundary } from './components/app-error-boundary'
import { createReactRootErrorHandler, initSentry } from './observability/sentry'
import { store } from './store'
import './i18n'
import './theme'
import './styles.css'
import './components/console-form-controls.css'
import './console-custom-typography.css'
import './theme/semi-theme-tokens.css'
import './components/dropdown-options.css'

// 监控必须先于 React 挂载初始化，才能捕获首屏和懒加载阶段的致命异常。
initSentry()

function applyInitialPerformanceMode(): void {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return
  const deviceMemory = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0)
  const hardwareConcurrency = navigator.hardwareConcurrency || 0
  const isConstrained = (deviceMemory > 0 && deviceMemory <= 2)
    || (hardwareConcurrency > 0 && hardwareConcurrency <= 2)
  const isBalanced = /MicroMessenger/i.test(navigator.userAgent)
    || (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches)
    || (deviceMemory > 0 && deviceMemory <= 4)
    || (hardwareConcurrency > 0 && hardwareConcurrency <= 4)

  document.documentElement.dataset.performance = isConstrained ? 'lite' : isBalanced ? 'balanced' : 'full'
}

applyInitialPerformanceMode()

function AppRoot() {
  const releaseBootLoader = useCallback(() => document.documentElement.classList.add('app-ready'), [])

  // 所有路由在首帧释放静态加载层，首页计分板动画在页面可见后继续完成。
  return <Provider store={store}><App onBootReady={releaseBootLoader} /></Provider>
}

const appMount = document.getElementById('app-mount')

if (!appMount) throw new Error('应用挂载节点不存在')

// 静态加载层独立于 React 根节点，由 App 首帧通知决定淡出时机。
const rootErrorHandler = createReactRootErrorHandler()
ReactDOM.createRoot(
  appMount,
  rootErrorHandler
    ? {
        onCaughtError: rootErrorHandler,
        onRecoverableError: rootErrorHandler,
        onUncaughtError: rootErrorHandler,
      }
    : undefined,
).render(
  <AppErrorBoundary>
    <AppRoot />
  </AppErrorBoundary>,
)
