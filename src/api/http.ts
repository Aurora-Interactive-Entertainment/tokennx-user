import i18n, { getActiveLanguage } from '@/i18n'
import { reportCriticalApiFailure } from '@/observability/sentry'

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8081'
const REQUEST_TIMEOUT_MS = 15000
export const AUTH_UNAUTHORIZED_STATUS = 401
export const AUTH_INVALID_CODE = 160001

export function resolveBackendBaseUrl(
  apiBaseUrl: string | undefined,
  proxyTarget: string | undefined,
  fallback = DEFAULT_API_BASE_URL,
  requireHttps = false,
): string {
  const configuredBaseUrl = apiBaseUrl?.trim() || proxyTarget?.trim() || fallback
  const normalized = normalizeBaseUrl(configuredBaseUrl)
  if (requireHttps) {
    let parsed: URL
    try {
      parsed = new URL(normalized)
    } catch {
      throw new Error('生产环境 API 地址必须是 HTTPS 绝对地址')
    }
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error('生产环境 API 地址必须使用 HTTPS，且不能包含用户名或密码')
    }
  }
  return normalized
}

// 中文：开发环境允许通过代理目标配置后端地址，模型直连请求必须复用这个真实地址。
export const BACKEND_BASE_URL = resolveBackendBaseUrl(
  import.meta.env.VITE_API_BASE_URL,
  import.meta.env.VITE_API_PROXY_TARGET,
  DEFAULT_API_BASE_URL,
  import.meta.env.PROD,
)

// 开发环境固定使用同源请求，避免已有的绝对地址配置绕过 Vite 代理。
export const API_BASE_URL = normalizeBaseUrl(import.meta.env.DEV ? '' : BACKEND_BASE_URL)

export interface ApiEnvelope<T> {
  code: number
  msg: string
  data: T
}

export interface FetchJsonOptions extends Omit<RequestInit, 'body' | 'headers'> {
  body?: unknown
  headers?: HeadersInit
  accessToken?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly code: number
  readonly requestId: string | null

  constructor(message: string, status: number, code: number, requestId: string | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

function createApiError(
  path: string,
  options: FetchJsonOptions,
  message: string,
  status: number,
  code: number,
  requestId: string | null,
): ApiError {
  const error = new ApiError(message, status, code, requestId)

  reportCriticalApiFailure({
    error,
    method: options.method || 'GET',
    status,
    code,
    requestId: requestId || undefined,
    path,
  })

  return error
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function makeApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${API_BASE_URL}/${path.replace(/^\/+/, '')}`
}

function withApiVersionPath(value: string): string {
  return /\/v1$/i.test(value) ? value : `${value}/v1`
}

// 中文：模型调用和接入样例共用前端配置的后端地址，避免开发环境只请求到前端代理地址。
export const MODEL_API_BASE_URL = withApiVersionPath(BACKEND_BASE_URL)

function errorMessage(payload: Partial<ApiEnvelope<unknown>> | null, response: Response): string {
  if (payload?.msg) return payload.msg
  if (response.status >= 500) return i18n.t('api.http.serviceUnavailable')
  return i18n.t('api.http.requestFailed')
}

export async function fetchJson<T>(path: string, options: FetchJsonOptions = {}): Promise<T> {
	const response = await fetchResponse(path, options)
	const requestId = response.headers.get('X-Request-ID')
	let payload: Partial<ApiEnvelope<T>> | null = null
	try {
		payload = await response.json() as Partial<ApiEnvelope<T>>
	} catch {
		throw createApiError(path, options, i18n.t('api.http.unreadableResponse'), response.status, 0, requestId)
	}

	if (!payload) throw createApiError(path, options, i18n.t('api.http.unreadableResponse'), response.status, 0, requestId)
	if (payload.code !== 0) {
		throw createApiError(path, options, errorMessage(payload, response), response.status, payload.code ?? 0, requestId)
	}
	return payload.data as T
}

// fetchResponse 保留认证请求的原始响应，供文件下载等非 JSON 接口复用统一超时和错误处理。
export async function fetchResponse(path: string, options: FetchJsonOptions = {}): Promise<Response> {
	const controller = new AbortController()
	let timedOut = false
	let removeExternalAbortListener: (() => void) | undefined
	if (options.signal) {
		if (options.signal.aborted) {
			controller.abort(options.signal.reason)
		} else {
			const onExternalAbort = () => controller.abort(options.signal?.reason)
			options.signal.addEventListener('abort', onExternalAbort, { once: true })
			removeExternalAbortListener = () => options.signal?.removeEventListener('abort', onExternalAbort)
		}
	}
	const timeout = window.setTimeout(() => {
		timedOut = true
		controller.abort()
	}, REQUEST_TIMEOUT_MS)
  const headers = new Headers(options.headers)
  const isFormDataBody = typeof FormData !== 'undefined' && options.body instanceof FormData
  const requestId = createRequestId()
  // 中文：允许文件流请求覆盖默认 JSON 协商头，普通接口仍默认接受 JSON。
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  // 中文：调用方可复用同一个请求编号进行幂等重试；未显式提供时才生成新编号。
  if (!headers.has('X-Request-ID')) headers.set('X-Request-ID', requestId)
  const activeLanguage = getActiveLanguage()
  // 中文：调用方显式指定语言时必须优先于当前全局语言，公开新闻/模型接口依赖该优先级。
  if (!headers.has('X-App-Lang')) headers.set('X-App-Lang', activeLanguage)
  // 中文：公开模型展示接口按 Accept-Language 返回单语言字段，同时保留业务接口使用的 X-App-Lang。
  if (!headers.has('Accept-Language')) headers.set('Accept-Language', activeLanguage)
  if (isFormDataBody) headers.delete('Content-Type')
  else if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  if (options.accessToken) headers.set('Authorization', `Bearer ${options.accessToken}`)

  const requestBody: BodyInit | undefined = options.body === undefined
    ? undefined
    : isFormDataBody
      ? options.body as FormData
      : JSON.stringify(options.body)

	let response: Response
  try {
    response = await fetch(makeApiUrl(path), {
      ...options,
      body: requestBody,
      credentials: 'omit',
      headers,
      signal: controller.signal,
    })
  } catch (error) {
    // 中文：调用方主动取消不应被误报为网络故障，页面卸载和用户点击停止都依赖该语义。
    if (options.signal?.aborted) throw error
    if (timedOut && error instanceof DOMException && error.name === 'AbortError') {
      throw createApiError(path, options, i18n.t('api.http.timeout'), 408, 0, requestId)
    }
    throw createApiError(path, options, i18n.t('api.http.networkFailure'), 0, 0, requestId)
  } finally {
    window.clearTimeout(timeout)
		removeExternalAbortListener?.()
  }

	let payload: Partial<ApiEnvelope<unknown>> | null = null
	if (response.ok) return response
	try {
		payload = await response.json() as Partial<ApiEnvelope<unknown>>
	} catch {
		throw createApiError(path, options, i18n.t('api.http.unreadableResponse'), response.status, 0, response.headers.get('X-Request-ID') ?? requestId)
	}

	if (!payload) throw createApiError(path, options, i18n.t('api.http.unreadableResponse'), response.status, 0, response.headers.get('X-Request-ID') ?? requestId)
	const responseRequestId = response.headers.get('X-Request-ID') ?? requestId
	throw createApiError(path, options, errorMessage(payload, response), response.status, payload.code ?? 0, responseRequestId)
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function isAuthenticationFailure(error: unknown): boolean {
  // Only an HTTP 401 means that the account session is no longer authorized.
  // Business error codes can be reused by login/form APIs and must not log out a user.
  if (isApiError(error)) return error.status === AUTH_UNAUTHORIZED_STATUS
  if (!error || typeof error !== 'object') return false
  const candidate = error as { status?: unknown }
  return candidate.status === AUTH_UNAUTHORIZED_STATUS
}
