// 构建版本由 Vite 注入；开发服务器未经过构建插件时保留可读的本地标识。
export const BUILD_VERSION = typeof __TOKEN_NX_BUILD_VERSION__ === 'string'
  ? __TOKEN_NX_BUILD_VERSION__.trim() || 'dev'
  : 'dev'
