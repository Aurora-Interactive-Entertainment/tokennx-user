import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './http'
import { confirmRealName, getRealNameErrorMessage, getRealNameProfile, submitRealName, type RealNameProfile } from './real-name'

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
    expect(fetchMock.mock.calls.at(-1)?.[1]?.method).toBe('GET')
    expect(new Headers(fetchMock.mock.calls.at(-1)?.[1]?.headers).get('Authorization')).toBe('Bearer real-name-token')

    const verified: RealNameProfile = { status: 'verified', id_type: 'id-card', verification_level: 'test', masked_id_number: '1101**********1234', verified_at: Date.parse('2026-07-24T08:00:00Z') }
    fetchMock.mockResolvedValue(response(verified))
    await expect(submitRealName('real-name-token', { name: '张三', id_type: 'id-card', id_number: '110101199001011234', consent: true })).resolves.toEqual(verified)
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/user/real-name')
    expect(fetchMock.mock.calls.at(-1)?.[1]?.method).toBe('POST')
    expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))).toEqual({ name: '张三', id_type: 'id-card', id_number: '110101199001011234', consent: true })
  })

  it('优先显示认证接口返回的 msg，并为非接口异常提供兜底文案', () => {
    expect(getRealNameErrorMessage(new ApiError('请求参数无效', 400, 100001, 'request-1'))).toBe('请求参数无效')
    expect(getRealNameErrorMessage(new ApiError('认证信息无效', 401, 110001, 'request-2'))).toBe('认证信息无效')
    expect(getRealNameErrorMessage(new ApiError('当前账号不可用', 403, 110001, 'request-3'))).toBe('当前账号不可用')
    expect(getRealNameErrorMessage(new ApiError('人脸核身未通过', 409, 110023, 'request-4'))).toBe('人脸核身未通过')
    expect(getRealNameErrorMessage(new Error('offline'))).toBe('实名认证请求失败，请稍后重试')
  })

  it('确认实名认证使用单据 ID 调用 confirm POST 接口', async () => {
    const verified: RealNameProfile = { status: 'verified', id_type: 'id-card' }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(verified))

    await expect(confirmRealName('real-name-token', '  session-1  ')).resolves.toEqual(verified)
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/user/real-name/confirm')
    expect(fetchMock.mock.calls.at(-1)?.[1]?.method).toBe('POST')
    expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))).toEqual({ session_id: 'session-1' })
  })
})
