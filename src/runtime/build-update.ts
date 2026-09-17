/** 每个操作独立持有刷新保护，结束时只释放自己的保护。开发环境没有内联守卫。 */
export function blockBuildUpdate(): () => void {
  return window.__TOKEN_NX_UPDATE_GUARD__?.blockReload() ?? (() => {})
}
