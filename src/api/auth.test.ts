import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getWechatStatus, loginByEmail, loginByPhone, refreshSession, sendEmailCode, sendPhoneCode } from './auth'

function response(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, msg: 'success', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('认证接口封装', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('按后端契约发送邮箱验证码和登录设备信息', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ destination_masked: 'u***@example.com', expires_at: '2099-01-01T00:05:00Z', retry_after_seconds: 60 }))
    await sendEmailCode('User@example.com')

    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/auth/email/code')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ destination: 'User@example.com', locale: 'zh-CN' })

    fetchMock.mockResolvedValue(response({ status: 'succeeded', binding_required: false }))
    await loginByEmail('User@example.com', '482915', { device_id: 'device-1', device_name: 'Chrome' })
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/auth/email/login')
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ destination: 'User@example.com', code: '482915', locale: 'zh-CN', device_id: 'device-1', device_name: 'Chrome' })
  })

  it('按后端契约发送手机号验证码和设备信息', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ destination_masked: '138****8000', expires_at: '2099-01-01T00:05:00Z', retry_after_seconds: 60 }))
    await sendPhoneCode('13800138000')

    const [url, options] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/auth/phone/code')
    expect(JSON.parse(String(options?.body))).toEqual({ destination: '13800138000', country_code: '+86' })

    fetchMock.mockResolvedValue(response({ status: 'succeeded', binding_required: false }))
    await loginByPhone('13800138000', '482915')
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ destination: '13800138000', code: '482915' })
  })

  it('正确编码微信状态并合并并发 refresh 请求', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ status: 'pending' }))
    await getWechatStatus('state with space')
    expect(String(fetchMock.mock.calls[0][0])).toContain('state%20with%20space')

    let resolveRequest: ((value: Response) => void) | undefined
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => { resolveRequest = resolve }))
    const first = refreshSession('refresh-token', { device_id: 'device-1' })
    const second = refreshSession('refresh-token', { device_id: 'device-1' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    resolveRequest?.(response({ status: 'succeeded', binding_required: false }))
    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
  })
})
