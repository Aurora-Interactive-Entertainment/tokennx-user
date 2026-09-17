type ModalPageProperty = 'scroll-behavior' | '--modal-page-width'

interface PageStyleLock {
  count: number
  previousValue: string
  previousPriority: string
}

const pageStyleLocks = new WeakMap<HTMLElement, Map<ModalPageProperty, PageStyleLock>>()

/** 嵌套弹窗共享页面样式，最后一个使用者释放后才恢复打开前的值。 */
export function retainModalPageStyle(property: ModalPageProperty, value: string): () => void {
  const root = document.documentElement
  let locks = pageStyleLocks.get(root)
  if (!locks) {
    locks = new Map()
    pageStyleLocks.set(root, locks)
  }
  let lock = locks.get(property)
  if (!lock) {
    lock = {
      count: 0,
      previousValue: root.style.getPropertyValue(property),
      previousPriority: root.style.getPropertyPriority(property),
    }
    locks.set(property, lock)
    root.style.setProperty(property, value)
  }
  lock.count += 1
  let released = false
  return () => {
    if (released) return
    released = true
    lock.count -= 1
    if (lock.count > 0) return
    if (lock.previousValue) root.style.setProperty(property, lock.previousValue, lock.previousPriority)
    else root.style.removeProperty(property)
    locks.delete(property)
    if (locks.size === 0) pageStyleLocks.delete(root)
  }
}
