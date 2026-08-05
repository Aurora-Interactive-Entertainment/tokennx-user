import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './http'
import {
  getNotificationPreferences,
  getProfileEnterprises,
  getProfileErrorMessage,
  getUserProfile,
  isNotificationPreferenceCode,
  isValidContactDestination,
  isValidDisplayName,
  isValidVerificationCode,
  limitDisplayNameLength,
  sendProfileContactCode,
  updateNotificationPreferences,
  updateProfileContact,
  updateProfileNickname,
} from './profile'

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

describe('个人中心 API 封装', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('按接口文档读取资料、企业关系和通知偏好', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response({ items: [] }))

    await getUserProfile('profile-token')
    expect(lastRequest(fetchMock).url).toBe('/api/user/profile')
    expect(new Headers(lastRequest(fetchMock).options?.headers).get('Authorization')).toBe('Bearer profile-token')

    await getProfileEnterprises('profile-token')
    expect(lastRequest(fetchMock).url).toBe('/api/user/profile/enterprises')

    await getNotificationPreferences('profile-token')
    expect(lastRequest(fetchMock).url).toBe('/api/user/profile/notification-preferences')
  })

  it('按接口文档提交昵称、联系方式验证码和联系方式更换', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response({}))

    await updateProfileNickname('profile-token', '新的昵称')
    expect(lastRequest(fetchMock).url).toBe('/api/user/profile/nickname')
    expect(JSON.parse(String(lastRequest(fetchMock).options?.body))).toEqual({ display_name: '新的昵称' })

    await sendProfileContactCode('profile-token', {
      provider_code: 'phone',
      purpose: 'current',
      destination: '13812345678',
      locale: 'zh-CN',
    })
    expect(lastRequest(fetchMock).url).toBe('/api/user/profile/contact/code')
    expect(JSON.parse(String(lastRequest(fetchMock).options?.body))).toEqual({
      provider_code: 'phone',
      purpose: 'current',
      destination: '13812345678',
      locale: 'zh-CN',
    })

    await updateProfileContact('profile-token', 'email', {
      current_destination: 'old@example.com',
      current_code: '123456',
      new_destination: 'new@example.com',
      new_code: '654321',
    })
    expect(lastRequest(fetchMock).url).toBe('/api/user/profile/email')
    expect(JSON.parse(String(lastRequest(fetchMock).options?.body))).toEqual({
      current_destination: 'old@example.com',
      current_code: '123456',
      new_destination: 'new@example.com',
      new_code: '654321',
    })
  })

  it('支持通知偏好部分更新并保留每个请求的认证头', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ items: [] }))

    await updateNotificationPreferences('profile-token', { low_balance: false, product_updates: true })

    expect(lastRequest(fetchMock).url).toBe('/api/user/profile/notification-preferences')
    expect(JSON.parse(String(lastRequest(fetchMock).options?.body))).toEqual({ values: { low_balance: false, product_updates: true } })
    expect(new Headers(lastRequest(fetchMock).options?.headers).get('Authorization')).toBe('Bearer profile-token')
  })
})

describe('个人中心输入约束和错误提示', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('只接受服务端约束的昵称、手机号、邮箱和六位验证码', async () => {
    expect(isValidDisplayName('二十个字符的昵称测试用例')).toBe(true)
    expect(isValidDisplayName('名'.repeat(21))).toBe(false)
    expect(isValidDisplayName('   ')).toBe(false)
    expect(limitDisplayNameLength('名'.repeat(21))).toBe('名'.repeat(20))
    expect(isValidContactDestination('phone', '13812345678')).toBe(true)
    expect(isValidContactDestination('phone', '12812345678')).toBe(false)
    expect(isValidContactDestination('phone', '1381234567')).toBe(false)
    expect(isValidContactDestination('email', 'user@example.com')).toBe(true)
    expect(isValidContactDestination('email', 'user@example')).toBe(false)
    expect(isValidVerificationCode('123456')).toBe(true)
    expect(isValidVerificationCode('12345')).toBe(false)
    expect(isValidVerificationCode('12345a')).toBe(false)

    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await expect(updateProfileNickname('profile-token', '名'.repeat(21))).rejects.toMatchObject({ code: 100001, status: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('识别固定通知白名单并映射个人中心业务错误', () => {
    expect(isNotificationPreferenceCode('low_balance')).toBe(true)
    expect(isNotificationPreferenceCode('unknown')).toBe(false)
    expect(getProfileErrorMessage(new ApiError('服务错误', 409, 100006, 'request-1'))).toBe('资料状态已变化，请刷新后重试')
    expect(getProfileErrorMessage(new ApiError('服务错误', 429, 110004, 'request-2'))).toBe('验证码发送过于频繁，请稍后再试')
    expect(getProfileErrorMessage(new Error('offline'))).toBe('个人中心请求失败，请稍后重试')
  })
})
