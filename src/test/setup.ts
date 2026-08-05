// 中文：测试环境与生产入口一样先注入 Semi Design 的 React 19 适配层。
import '@douyinfe/semi-ui/react19-adapter'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  // 中文：命令式 Toast 不属于 React 树，测试结束时需要显式销毁，避免污染下一个用例。
  Toast.destroyAll()
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(String(key)) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(String(key)) },
    setItem: (key, value) => { values.set(String(key), String(value)) },
  }
}

// 中文：Node 新版在 jsdom worker 中可能不提供存储对象，测试使用内存实现保持页面状态隔离。
function ensureStorage(name: 'localStorage' | 'sessionStorage'): void {
  let storage: Storage | undefined
  try { storage = window[name] } catch { storage = undefined }
  if (!storage) {
    storage = createMemoryStorage()
    Object.defineProperty(window, name, { configurable: true, value: storage })
    Object.defineProperty(globalThis, name, { configurable: true, value: storage })
  }
}

ensureStorage('localStorage')
ensureStorage('sessionStorage')

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: () => ({
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    clearRect: () => undefined,
    fillRect: () => undefined,
    strokeRect: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    stroke: () => undefined,
    save: () => undefined,
    restore: () => undefined,
    translate: () => undefined,
    scale: () => undefined,
    setTransform: () => undefined,
    drawImage: () => undefined,
    measureText: () => ({ width: 0 }),
  }),
})
