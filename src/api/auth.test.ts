import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bindWechatPhone, getWechatStatus, loginByEmail, loginByPhone, refreshSession, sendBindingPhoneCode, sendEmailCode, sendPhoneCode } from './auth'

function response(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, msg: 'success', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('认证接口封装', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('按后端契约发送邮箱验证码，并仅通过查询参数传邀请码', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({}))
    await sendEmailCode('User@example.com')

    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/auth/email/code')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ destination: 'User@example.com' })

    fetchMock.mockResolvedValue(response({ status: 'succeeded', binding_required: false }))
    await loginByEmail('User@example.com', '482915', 'invite/code')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/auth/email/login?invite_code=invite%2Fcode')
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ destination: 'User@example.com', code: '482915' })
  })

  it('按后端契约发送手机号验证码和设备信息', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({}))
    await sendPhoneCode('13800138000')

    const [url, options] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/auth/phone/code')
    expect(JSON.parse(String(options?.body))).toEqual({ destination: '13800138000', country_code: '+86' })

    fetchMock.mockResolvedValue(response({ status: 'succeeded', binding_required: false }))
    await loginByPhone('13800138000', '482915')
    expect(new URL(String(fetchMock.mock.calls[1][0]), 'https://example.com').search).toBe('')
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ destination: '13800138000', code: '482915' })

    fetchMock.mockResolvedValue(response({ status: 'succeeded', binding_required: false }))
    await loginByPhone('13800138000', '482915', 'invite/code')
    expect(String(fetchMock.mock.calls[2][0])).toContain('/api/auth/phone/login?invite_code=invite%2Fcode')
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({ destination: '13800138000', code: '482915' })
  })

  it('绑定手机号使用国内号码和独立国家码，登录体不携带设备字段', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({}))
    await sendBindingPhoneCode('binding-ticket', '13800138000')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      binding_ticket: 'binding-ticket',
      phone: '13800138000',
      country_code: '+86',
    })

    fetchMock.mockResolvedValue(response({ status: 'succeeded', binding_required: false }))
    await bindWechatPhone('binding-ticket', '13800138000', '482915', 'invite/code')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/auth/bind-phone?invite_code=invite%2Fcode')
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ binding_ticket: 'binding-ticket', phone: '13800138000', code: '482915' })
  })

  it('正确编码微信状态并合并并发 refresh 请求', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ status: 'pending' }))
    await getWechatStatus('state with space')
    expect(String(fetchMock.mock.calls[0][0])).toContain('state%20with%20space')

    let resolveRequest: ((value: Response) => void) | undefined
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => { resolveRequest = resolve }))
    const first = refreshSession('refresh-token')
    const second = refreshSession('refresh-token')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    resolveRequest?.(response({ status: 'succeeded', binding_required: false }))
    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ refresh_token: 'refresh-token' })
  })
})
