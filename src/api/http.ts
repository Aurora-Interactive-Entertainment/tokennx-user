import i18n, { getActiveLanguage } from '@/i18n'

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8081'
const REQUEST_TIMEOUT_MS = 15000
export const AUTH_UNAUTHORIZED_STATUS = 401
export const AUTH_INVALID_CODE = 110001

export function resolveBackendBaseUrl(apiBaseUrl: string | undefined, proxyTarget: string | undefined, fallback = DEFAULT_API_BASE_URL): string {
  const configuredBaseUrl = apiBaseUrl?.trim() || proxyTarget?.trim() || fallback
  return normalizeBaseUrl(configuredBaseUrl)
}

// 中文：开发环境允许通过代理目标配置后端地址，模型直连请求必须复用这个真实地址。
export const BACKEND_BASE_URL = resolveBackendBaseUrl(import.meta.env.VITE_API_BASE_URL, import.meta.env.VITE_API_PROXY_TARGET)

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
		throw new ApiError(i18n.t('api.http.unreadableResponse'), response.status, 0, requestId)
	}

	if (!payload) throw new ApiError(i18n.t('api.http.unreadableResponse'), response.status, 0, requestId)
	if (payload.code !== 0) {
		throw new ApiError(errorMessage(payload, response), response.status, payload.code ?? 0, requestId)
	}
	return payload.data as T
}

// fetchResponse 保留认证请求的原始响应，供文件下载等非 JSON 接口复用统一超时和错误处理。
export async function fetchResponse(path: string, options: FetchJsonOptions = {}): Promise<Response> {
	const controller = new AbortController()
	const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const headers = new Headers(options.headers)
  const requestId = createRequestId()
  headers.set('Accept', 'application/json')
  headers.set('X-Request-ID', requestId)
  headers.set('X-App-Lang', getActiveLanguage())
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  if (options.accessToken) headers.set('Authorization', `Bearer ${options.accessToken}`)

	let response: Response
  try {
    response = await fetch(makeApiUrl(path), {
      ...options,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'omit',
      headers,
      signal: options.signal ?? controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new ApiError(i18n.t('api.http.timeout'), 408, 0, requestId)
    throw new ApiError(i18n.t('api.http.networkFailure'), 0, 0, requestId)
  } finally {
    window.clearTimeout(timeout)
  }

	let payload: Partial<ApiEnvelope<unknown>> | null = null
	if (response.ok) return response
	try {
		payload = await response.json() as Partial<ApiEnvelope<unknown>>
	} catch {
		throw new ApiError(i18n.t('api.http.unreadableResponse'), response.status, 0, response.headers.get('X-Request-ID') ?? requestId)
	}

	if (!payload) throw new ApiError(i18n.t('api.http.unreadableResponse'), response.status, 0, response.headers.get('X-Request-ID') ?? requestId)
	const responseRequestId = response.headers.get('X-Request-ID') ?? requestId
	throw new ApiError(errorMessage(payload, response), response.status, payload.code ?? 0, responseRequestId)
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function isAuthenticationFailure(error: unknown): boolean {
  if (isApiError(error)) return error.status === AUTH_UNAUTHORIZED_STATUS || error.code === AUTH_INVALID_CODE
  if (!error || typeof error !== 'object') return false
  const candidate = error as { status?: unknown; code?: unknown }
  return candidate.status === AUTH_UNAUTHORIZED_STATUS || candidate.code === AUTH_INVALID_CODE
}
