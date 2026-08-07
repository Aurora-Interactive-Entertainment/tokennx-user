import '@douyinfe/semi-ui/react19-adapter'
import { useCallback } from 'react'
import { Provider } from 'react-redux'
import ReactDOM from 'react-dom/client'
import App from './App'
import { store } from './store'
import './i18n'
import './theme'
import './styles.css'

function applyInitialPerformanceMode(): void {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return
  const isLite = /MicroMessenger/i.test(navigator.userAgent)
    || (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches)
    || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4)
  if (isLite) document.documentElement.dataset.performance = 'lite'
}

applyInitialPerformanceMode()

function AppRoot() {
  const releaseBootLoader = useCallback(() => document.documentElement.classList.add('app-ready'), [])

  // 中文：所有路由在首帧释放静态加载层，首页计分板动画在页面可见后继续完成。
  return <Provider store={store}><App onBootReady={releaseBootLoader} /></Provider>
}

const appMount = document.getElementById('app-mount')

if (!appMount) throw new Error('应用挂载节点不存在')

// 中文：静态加载层独立于 React 根节点，由 App 首帧通知决定淡出时机。
ReactDOM.createRoot(appMount).render(<AppRoot />)
