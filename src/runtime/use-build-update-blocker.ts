import { useLayoutEffect } from 'react'
import { blockBuildUpdate } from './build-update'

/** 在页面提交布局时同步保护草稿或操作，卸载与状态结束均自动释放。 */
export function useBuildUpdateBlocker(active: boolean): void {
  useLayoutEffect(() => {
    if (active) return blockBuildUpdate()
  }, [active])
}
