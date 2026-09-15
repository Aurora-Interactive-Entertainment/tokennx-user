// 加载层独立于 React 根节点；多个首帧回调只启动一次收尾，避免后台标签页残留遮罩。
export function releaseBootLoader(): void {
  document.documentElement.classList.add('app-ready')
  const loader = document.getElementById('boot-loader')
  if (!loader || loader.dataset.releasing === 'true') return
  loader.dataset.releasing = 'true'

  const finish = (): void => {
    window.clearTimeout(timer)
    loader.removeEventListener('transitionend', onTransitionEnd)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    loader.remove()
  }
  const onTransitionEnd = (event: TransitionEvent): void => {
    if (event.target === loader && event.propertyName === 'opacity') finish()
  }
  const onVisibilityChange = (): void => {
    if (!document.hidden) finish()
  }
  const timer = window.setTimeout(finish, 1500)
  loader.addEventListener('transitionend', onTransitionEnd)
  document.addEventListener('visibilitychange', onVisibilityChange)
}
