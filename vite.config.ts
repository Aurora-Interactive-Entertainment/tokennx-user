import { fileURLToPath, URL } from 'node:url'
import { semiTheming } from '@douyinfe/semi-vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const CHUNK_SIZE_WARNING_LIMIT_KB = 600

// 中文：按运行时职责拆分共享依赖，避免所有页面共用一个超大 common chunk。
const CODE_SPLITTING_GROUPS = [
  {
    name: 'react-vendor',
    test: /node_modules[\\/](?:react|react-dom|react-router|react-redux|@reduxjs[\\/]toolkit)[\\/]/,
    priority: 30,
  },
  {
    // 中文：Semi 组件按目录拆分，避免将全部控件和图标聚合到单个超大文件。
    name: (moduleId: string) => {
      const match = moduleId.match(/node_modules[\\/]@douyinfe[\\/]semi-ui[\\/]lib[\\/]es[\\/]([^\\/]+)/)
      return match ? `semi-${match[1]}` : null
    },
    test: /node_modules[\\/]@douyinfe[\\/]semi-ui[\\/]/,
    priority: 20,
    minSize: 10 * 1024,
  },
  {
    name: 'semi-icons',
    test: /node_modules[\\/]@douyinfe[\\/]semi-icons[\\/]/,
    priority: 20,
  },
  {
    name: 'charts-vendor',
    test: /node_modules[\\/](?:echarts|zrender)[\\/]/,
    priority: 20,
  },
  {
    name: 'markdown-vendor',
    test: /node_modules[\\/](?:react-markdown|react-syntax-highlighter|prism-react-renderer|prismjs|remark-[^\\/]+|rehype-[^\\/]+|hast-util-[^\\/]+)[\\/]/,
    priority: 20,
  },
]

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      // 中文：使用 Semi 官方 Vite 插件提供主题编译入口，结构型 token 保持官方默认值。
      semiTheming({
        include: fileURLToPath(new URL('./src/theme/semi-theme.scss', import.meta.url)),
      }),
      react(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5174,
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8081',
          changeOrigin: true,
          secure: false,
        },
        '/v1': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8081',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      // 中文：页面通过路由和运行时依赖分块，单个产物控制在 600KB 警戒线以内。
      chunkSizeWarningLimit: CHUNK_SIZE_WARNING_LIMIT_KB,
      rolldownOptions: {
        output: {
          codeSplitting: {
            minSize: 20 * 1024,
            groups: CODE_SPLITTING_GROUPS,
          },
        },
        checks: {
          pluginTimings: false,
        },
        onwarn(warning, defaultHandler) {
          // 中文：第三方 lottie-web 依赖 eval 实现表达式运行时，过滤其已知告警并保留其他告警。
          if (warning.code === 'EVAL' && warning.id?.includes('lottie-web')) return
          defaultHandler(warning)
        },
      },
    },
  }
})
