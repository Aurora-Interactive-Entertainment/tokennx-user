import '@douyinfe/semi-ui/react19-adapter'
import { useCallback } from 'react'
import { Provider } from 'react-redux'
import ReactDOM from 'react-dom/client'
import App from './App'
import { store } from './store'
import './i18n'
import './theme'
import './styles.css'

function AppRoot() {
  const releaseBootLoader = useCallback(() => document.documentElement.classList.add('app-ready'), [])

  // 中文：首页必须等首轮计分板翻牌完成，其他路由由 App 在首帧释放静态加载层。
  return <Provider store={store}><App onBootReady={releaseBootLoader} /></Provider>
}

const appMount = document.getElementById('app-mount')

if (!appMount) throw new Error('应用挂载节点不存在')

// 中文：静态加载层独立于 React 根节点，由路由状态和首页首轮翻牌共同决定淡出时机。
ReactDOM.createRoot(appMount).render(<AppRoot />)
