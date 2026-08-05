import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthTokens, saveAuthTokens } from '@/auth/token-storage'
import type { AuthResult } from './auth'
import { ApiError } from './http'
import { getUserModels, getUserModelsErrorMessage } from './user-models'

function response(data: unknown, status = 200, code = 0, msg = 'success'): Response {
  return new Response(JSON.stringify({ code, msg, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function authResult(): AuthResult {
  return {
    status: 'succeeded',
    binding_required: false,
    access_token: 'model-token',
    refresh_token: 'refresh-token',
    refresh_expires_at: Date.UTC(2099, 0, 1),
    user: {
      id: 'user-1',
      display_name: '模型用户',
      avatar_url: '',
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      status: 'active',
    },
  }
}

describe('用户模型目录接口封装', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    clearAuthTokens()
    saveAuthTokens(authResult())
  })

  it('按个人和企业工作空间构造查询并携带认证令牌', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response({ items: [] }))

    await getUserModels({ account_type: 'personal' })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/user/models?account_type=personal')
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer model-token')

    await getUserModels({ account_type: 'enterprise', enterprise_id: ' enterprise-1 ' })
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe('/api/user/models?account_type=enterprise&enterprise_id=enterprise-1')
  })

  it('拒绝无法识别的响应并映射稳定业务错误', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ items: null }))
    await expect(getUserModels({ account_type: 'personal' })).rejects.toMatchObject({ name: 'ApiError', status: 502, code: 100002 })
    expect(getUserModelsErrorMessage(new ApiError('服务错误', 403, 120003, 'request-1'))).toBe('当前用户没有查看该工作空间模型的权限')
    expect(getUserModelsErrorMessage(new Error('offline'))).toBe('模型目录加载失败，请稍后重试')
  })
})
