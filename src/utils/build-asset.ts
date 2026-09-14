import { BUILD_VERSION } from '@/build-version'

/**
 * 给 public/ 下的固定文件名资源追加构建版本查询串。
 * 这些文件没有内容指纹，源站也不下发缓存头，内容变过但 URL 不变时浏览器和 CDN 会继续用旧副本。
 * 查询串每次构建都会变，等价于一次强制更新。
 */
export function buildAssetUrl(path: string): string {
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}v=${encodeURIComponent(BUILD_VERSION)}`
}
