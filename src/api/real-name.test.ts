import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './http'
import { getRealNameErrorMessage, getRealNameProfile, submitRealName, type RealNameProfile } from './real-name'

function response(data: RealNameProfile): Response {
  return new Response(JSON.stringify({ code: 0, msg: 'success', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('实名认证 API 封装', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('读取认证状态并提交实名资料', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ status: 'unverified' }))

    await getRealNameProfile('real-name-token')
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/user/real-name')
    expect(new Headers(fetchMock.mock.calls.at(-1)?.[1]?.headers).get('Authorization')).toBe('Bearer real-name-token')

    const verified: RealNameProfile = { status: 'verified', id_type: 'id-card', verification_level: 'test', masked_id_number: '1101**********1234', verified_at: '2026-07-24T08:00:00Z' }
    fetchMock.mockResolvedValue(response(verified))
    await expect(submitRealName('real-name-token', { name: '张三', id_type: 'id-card', id_number: '110101199001011234', consent: true })).resolves.toEqual(verified)
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/user/real-name')
    expect(fetchMock.mock.calls.at(-1)?.[1]?.method).toBe('POST')
    expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))).toEqual({ name: '张三', id_type: 'id-card', id_number: '110101199001011234', consent: true })
  })

  it('映射认证接口错误并保留未知错误信息', () => {
    expect(getRealNameErrorMessage(new ApiError('请求参数无效', 400, 100001, 'request-1'))).toBe('请检查姓名、证件类型和证件号码')
    expect(getRealNameErrorMessage(new ApiError('认证信息无效', 401, 110001, 'request-2'))).toBe('登录状态已失效，请重新登录')
    expect(getRealNameErrorMessage(new Error('offline'))).toBe('实名认证请求失败，请稍后重试')
  })
})
