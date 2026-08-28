import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './http'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import type { AuthResult } from './auth'
import {
  createUserApiKey,
  getEnterpriseApiKeys,
  createEnterpriseApiKey,
  batchManageEnterpriseApiKeys,
  disableUserApiKey,
  enableUserApiKey,
  getUserApiKeyActivity,
  getUserApiKeyErrorMessage,
  getUserApiKeys,
  revokeUserApiKey,
  updateUserApiKey,
  type UserApiKeyContext,
} from './user-api-keys'

function response(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, msg: 'success', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

type FetchSpy = { mock: { calls: Array<[string | URL | Request, RequestInit?]> } }

function lastRequest(fetchMock: FetchSpy): { url: string; options: RequestInit | undefined } {
  const [url, options] = fetchMock.mock.calls.at(-1) ?? []
  return { url: String(url), options }
}

const mutation = {
  name: '生产环境密钥',
  tags: ['生产', '前端'],
  expires_at: null,
  scope: 'all' as const,
  model_ids: [] as string[],
  billing_source: 'balance' as const,
  limits_enabled: true,
  cost_limit_yuan: '100',
  rpm: 60,
  tpm: null,
  concurrency: null,
}

const personalContext: UserApiKeyContext = { account_type: 'personal' }
const enterpriseContext: UserApiKeyContext = { account_type: 'enterprise', enterprise_id: 'enterprise-1' }

function authResult(): AuthResult {
  return {
    status: 'succeeded',
    binding_required: false,
    access_token: 'api-key-token',
    refresh_token: 'refresh-token',
    refresh_expires_at: Date.UTC(2099, 0, 1),
    user: {
      id: 'user-1',
      display_name: '测试用户',
      avatar_url: '',
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      status: 'active',
    },
  }
}

describe('用户 API 密钥接口封装', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    clearAuthTokens()
    saveAuthTokens(authResult())
  })

  it('按接口文档读取列表并提交创建、更新、启停、撤销和活动查询', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response({ items: [], available_models: [] }))

    await getUserApiKeys(personalContext, 'active')
    expect(lastRequest(fetchMock).url).toBe('/api/user/api-keys?account_type=personal&status=active')
    expect(new Headers(lastRequest(fetchMock).options?.headers).get('Authorization')).toBe('Bearer api-key-token')

    await createUserApiKey(enterpriseContext, mutation)
    expect(lastRequest(fetchMock).url).toBe('/api/user/api-keys?account_type=enterprise&enterprise_id=enterprise-1')
    expect(lastRequest(fetchMock).options?.method).toBe('POST')
    expect(JSON.parse(String(lastRequest(fetchMock).options?.body))).toEqual(mutation)

    await updateUserApiKey(enterpriseContext, 'key-1', mutation)
    expect(lastRequest(fetchMock).url).toBe('/api/user/api-keys/key-1?account_type=enterprise&enterprise_id=enterprise-1')
    expect(lastRequest(fetchMock).options?.method).toBe('PUT')

    await enableUserApiKey(enterpriseContext, 'key-1')
    expect(lastRequest(fetchMock).url).toBe('/api/user/api-keys/key-1/enable?account_type=enterprise&enterprise_id=enterprise-1')
    expect(lastRequest(fetchMock).options?.method).toBe('POST')

    await disableUserApiKey(enterpriseContext, 'key-1')
    expect(lastRequest(fetchMock).url).toBe('/api/user/api-keys/key-1/disable?account_type=enterprise&enterprise_id=enterprise-1')

    await revokeUserApiKey(enterpriseContext, 'key-1')
    expect(lastRequest(fetchMock).url).toBe('/api/user/api-keys/key-1?account_type=enterprise&enterprise_id=enterprise-1')
    expect(lastRequest(fetchMock).options?.method).toBe('DELETE')

    await getUserApiKeyActivity(enterpriseContext, 'key-1', 10)
    expect(lastRequest(fetchMock).url).toBe('/api/user/api-keys/key-1/activity?account_type=enterprise&enterprise_id=enterprise-1&limit=10')

    expect(() => getUserApiKeys({ account_type: 'enterprise', enterprise_id: ' ' })).toThrowError('企业 API Key 上下文缺少企业 ID')
  })

  it('映射固定业务错误码并保留未知错误原文', () => {
    expect(getUserApiKeyErrorMessage(new ApiError('服务错误', 401, 110001, 'req-1'))).toBe('登录状态已失效，请重新登录')
    expect(getUserApiKeyErrorMessage(new ApiError('服务错误', 409, 100006, 'req-2'))).toBe('API 密钥状态已变化，请刷新后重试')
    expect(getUserApiKeyErrorMessage(new ApiError('服务错误', 409, 100009, 'req-3'))).toBe('API 密钥已过期，无法重新启用')
    expect(getUserApiKeyErrorMessage(new Error('offline'))).toBe('API 密钥请求失败，请稍后重试')
  })

  it('企业密钥管理使用企业专用列表、创建和批量接口', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response({ items: [], available_models: [], updated: 0 }))
    await getEnterpriseApiKeys({ account_type: 'enterprise', enterprise_id: 'ent/01' }, 'active', 'member-1')
    expect(lastRequest(fetchMock).url).toBe('/api/user/enterprise/ent%2F01/api-keys?status=active&member_id=member-1')

    await createEnterpriseApiKey({ account_type: 'enterprise', enterprise_id: 'ent/01' }, { ...mutation, member_id: 'member-1' })
    expect(lastRequest(fetchMock).url).toBe('/api/user/enterprise/ent%2F01/api-keys')
    expect(lastRequest(fetchMock).options?.method).toBe('POST')

    await batchManageEnterpriseApiKeys({ account_type: 'enterprise', enterprise_id: 'ent/01' }, { action: 'disable', items: [{ key_id: 'key-1' }] })
    expect(lastRequest(fetchMock).url).toBe('/api/user/enterprise/ent%2F01/api-keys/batch')
    expect(lastRequest(fetchMock).options?.method).toBe('POST')
  })
})
