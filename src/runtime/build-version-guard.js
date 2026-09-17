// 构建时内联到 HTML；不依赖入口 JS，资源加载失败时仍能检查新版本。
(() => {
  const selfVersion = document.querySelector('meta[name="token-nx-build-version"]')?.content?.trim()
  if (!selfVersion || selfVersion.startsWith('__TOKEN_NX') || window.__TOKEN_NX_UPDATE_GUARD__) return

  const storageKey = 'token-nx:build-guard'
  const checkInterval = 30_000
  const retryInterval = 60_000
  let lastCheck = -Infinity
  let inFlight = null
  let pendingVersion = ''
  let pathname = window.location.pathname
  let navigating = false
  let routeSequence = 0
  let activitySequence = 0
  const blockers = new Set()
  const editedFields = new Set()
  const originalValues = new WeakMap()
  const fieldSelector = 'input:not([type="hidden"]), textarea, select, [contenteditable="true"]'

  function isAuthCallback() {
    const url = new URL(window.location.href)
    // 授权码只能消费一次，版本更新不能自动重放回调。
    return url.pathname === '/weixin/callback' || (url.searchParams.has('code') && url.searchParams.has('state'))
  }

  function canAutoReload() {
    if (document.visibilityState === 'hidden' || blockers.size || hasUnsavedFields()) return false
    if (document.activeElement?.matches(fieldSelector)) return false
    return !Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'))
      .some((element) => element.getClientRects().length > 0)
  }

  function fieldValue(element, initial = false) {
    if (element.type === 'checkbox' || element.type === 'radio') return initial ? element.defaultChecked : element.checked
    if (element.type === 'file') return element.value
    if (element.tagName === 'SELECT') return JSON.stringify(Array.from(element.options)
      .filter((option) => initial ? option.defaultSelected : option.selected).map((option) => option.value))
    return initial ? element.defaultValue ?? element.textContent : element.value ?? element.textContent
  }

  function fieldFromEvent(event) {
    const element = event.target?.closest?.(fieldSelector)
    // 生成器等复杂表单由业务状态精确判断，避免已保存的提示词永久挡住更新。
    return element?.closest('[data-build-update-managed]') ? null : element
  }

  function rememberField(event) {
    const element = fieldFromEvent(event)
    if (element && !originalValues.has(element)) originalValues.set(element, fieldValue(element))
  }

  function editField(event) {
    const element = fieldFromEvent(event)
    if (!element) return
    if (!originalValues.has(element)) originalValues.set(element, fieldValue(element, true))
    editedFields.add(element)
  }

  function hasUnsavedFields() {
    for (const element of editedFields) {
      const dialog = element.closest('[role="dialog"], [role="alertdialog"]')
      // 取消或保存并关闭的弹窗、已卸载的页面不再持有旧草稿；仍挂载的草稿保留。
      if (!element.isConnected || element.closest('[data-build-update-managed]') ||
        (dialog && !dialog.getClientRects().length) || fieldValue(element) === originalValues.get(element)) {
        editedFields.delete(element)
        originalValues.delete(element)
      }
    }
    return editedFields.size > 0
  }

  function reload() {
    if (!pendingVersion || navigating || isAuthCallback()) return false
    if (!canAutoReload()) return false
    const url = new URL(window.location.href)
    const now = Date.now()
    let lastAttempt = 0
    try {
      const record = JSON.parse(window.sessionStorage.getItem(storageKey) || 'null')
      if (record?.from === selfVersion && record?.to === pendingVersion) lastAttempt = Number(record.at) || 0
    } catch {
      // 兼容旧版字符串标记与禁用存储的浏览器，仍允许查询版本。
    }
    // URL 时间戳同时用于绕过旧 HTML 缓存和存储不可用时的刷新循环保护。
    lastAttempt = Math.max(lastAttempt, Number(url.searchParams.get('__token_nx_retry_at')) || 0)
    if (now - lastAttempt < retryInterval) return false
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ from: selfVersion, to: pendingVersion, at: now }))
    } catch {
      // 存储失败时由 URL 中的时间戳保底，不阻止用户取得新版。
    }
    url.searchParams.set('__token_nx_build', pendingVersion)
    url.searchParams.set('__token_nx_retry_at', String(now))
    navigating = true
    window.location.replace(url.toString())
    return true
  }

  function applyVersion(version) {
    pendingVersion = version === selfVersion ? '' : version
  }

  function check(urgent = false) {
    if (isAuthCallback() || document.visibilityState === 'hidden' || navigating) return Promise.resolve()
    if (inFlight) return inFlight
    // 页面切换最多每 5 秒检查一次，后台探测共享 30 秒节流与在途请求。
    if (Date.now() - lastCheck < (urgent ? 5_000 : checkInterval)) return Promise.resolve()
    lastCheck = Date.now()
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 8_000)
    inFlight = Promise.resolve().then(() => window.fetch('/version.json?t=' + Date.now(), {
      cache: 'no-store', credentials: 'omit', signal: controller.signal,
    })).then((response) => response.ok ? response.json() : null).then((payload) => {
      const version = typeof payload?.version === 'string' ? payload.version.trim() : ''
      // 仅接受构建器支持的版本格式，忽略错误页和异常探针响应。
      if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(version)) applyVersion(version)
    }).catch(() => {
      // 离线、超时或发布窗口内探针不可用时保留当前页面，下次触发继续检查。
    }).finally(() => {
      window.clearTimeout(timeout)
      inFlight = null
    })
    return inFlight
  }

  window.__TOKEN_NX_UPDATE_GUARD__ = {
    get pendingVersion() { return isAuthCallback() ? '' : pendingVersion },
    check,
    blockReload() {
      const token = {}
      activitySequence++
      blockers.add(token)
      return () => { blockers.delete(token) }
    },
    routeChanged() {
      // 首次挂载、查询参数和锚点变化都不代表离开当前页面，不能借此刷新。
      if (pathname === window.location.pathname) return check()
      pathname = window.location.pathname
      const sequence = ++routeSequence
      const activity = activitySequence
      const target = window.location.href
      const startedAt = Date.now()
      const safeAtNavigation = canAutoReload()
      if (safeAtNavigation && reload()) return Promise.resolve()
      return check(true).then(() => {
        // 只在本次切页的短暂窗口尝试一次；慢响应、用户新操作或受保护状态都留待下次切页。
        if (safeAtNavigation && sequence === routeSequence && activity === activitySequence
          && target === window.location.href && Date.now() - startedAt <= 1_000) reload()
      })
    },
  }

  // 新交互会取消当前切页等待中的刷新资格，不干预事件本身或正常浏览器刷新。
  for (const event of ['pointerdown', 'keydown', 'input', 'change', 'submit', 'wheel', 'touchstart']) {
    document.addEventListener(event, () => { activitySequence++ }, { capture: true, passive: true })
  }
  document.addEventListener('focusin', rememberField, true)
  document.addEventListener('beforeinput', rememberField, true)
  document.addEventListener('input', editField, true)
  document.addEventListener('change', editField, true)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void check() })
  window.addEventListener('focus', () => { void check() })
  window.addEventListener('online', () => { void check() })
  window.addEventListener('pageshow', () => { void check() })
  // 定时检测仅静默记录新版，停留当前页、恢复焦点或操作结束都不会触发刷新。
  window.setInterval(() => { void check() }, checkInterval)
  void check()
})()
