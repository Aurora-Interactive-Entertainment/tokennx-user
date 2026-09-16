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
  let dirty = false
  let appReady = false
  let navigating = false

  function isAuthCallback() {
    const url = new URL(window.location.href)
    // 授权码只能消费一次，自动和手动更新都不能重放回调。
    return url.pathname === '/weixin/callback' || (url.searchParams.has('code') && url.searchParams.has('state'))
  }

  function notify() {
    window.dispatchEvent(new CustomEvent('token-nx:update-available'))
  }

  function canAutoReload() {
    if (document.visibilityState === 'hidden' || dirty) return false
    // 控制台可能有支付、生成或未保存操作；启动后的更新交给用户确认。
    if (appReady && /^\/(?:en\/)?(?:console|login|join|invite)(?:\/|$)/.test(window.location.pathname)) return false
    if (document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return false
    return !Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'))
      .some((element) => element.getClientRects().length > 0)
  }

  function reload(manual = false) {
    if (!pendingVersion || navigating || isAuthCallback()) return false
    if (!manual && !canAutoReload()) return false
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
    if (!manual && now - lastAttempt < retryInterval) return false
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
    if (pendingVersion) reload()
    notify()
  }

  function check(urgent = false) {
    if (isAuthCallback() || document.visibilityState === 'hidden' || navigating) return Promise.resolve()
    if (inFlight) return inFlight
    // 协议入口最多每 5 秒检查一次，其他触发共享 30 秒节流与在途请求。
    if (Date.now() - lastCheck < (urgent ? 5_000 : checkInterval)) {
      if (pendingVersion) { reload(); notify() }
      return Promise.resolve()
    }
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
    reload: () => reload(true),
    routeChanged() {
      appReady = true
      if (pathname !== window.location.pathname) {
        pathname = window.location.pathname
        dirty = false
      }
      notify()
      return check(/^\/(?:en\/)?(?:terms|privacy|recharge-agreement)\/?$/.test(pathname))
    },
  }

  document.addEventListener('input', () => { dirty = true }, true)
  document.addEventListener('change', () => { dirty = true }, true)
  document.addEventListener('submit', () => { dirty = true }, true)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void check() })
  window.addEventListener('focus', () => { void check() })
  window.addEventListener('online', () => { void check() })
  window.addEventListener('pageshow', () => { void check() })
  void check()
})()
