import { fileURLToPath, URL } from 'node:url'
import { semiTheming } from '@douyinfe/semi-vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const CHUNK_SIZE_WARNING_LIMIT_KB = 600

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
      // 中文：页面已通过路由动态导入分块，Semi UI 共享依赖形成的页面包纳入 1MB 构建预算。
      chunkSizeWarningLimit: CHUNK_SIZE_WARNING_LIMIT_KB,
      rolldownOptions: {
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
