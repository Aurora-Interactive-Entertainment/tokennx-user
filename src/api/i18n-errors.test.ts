import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { ApiError } from './http'
import { getBillingErrorMessage } from './billing'
import { getEnterpriseErrorMessage } from './enterprise-console'
import { getProfileErrorMessage } from './profile'
import { getRealNameErrorMessage } from './real-name'
import { getUserApiKeyErrorMessage } from './user-api-keys'
import { getUserModelsErrorMessage } from './user-models'

describe('API 错误提示语言', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN')
  })

  it('按调用时的语言返回各业务错误回退文案', async () => {
    await i18n.changeLanguage('en-US')

    expect(getProfileErrorMessage(new ApiError('server', 409, 100006, null))).toBe('The profile changed. Refresh and try again.')
    expect(getRealNameErrorMessage(new ApiError('server', 503, 100002, null))).toBe('The real-name verification service is temporarily unavailable. Try again later.')
    expect(getUserModelsErrorMessage(new ApiError('server', 403, 120003, null))).toBe('You do not have permission to view models in this workspace.')
    expect(getUserApiKeyErrorMessage(new ApiError('server', 409, 100009, null))).toBe('The API key has expired and cannot be enabled again.')
    expect(getBillingErrorMessage(new ApiError('server', 409, 130006, null))).toBe('This reward has no balance available for revocation.')
    expect(getEnterpriseErrorMessage(new ApiError('server', 409, 140004, null))).toBe('The enterprise resource was updated by another operation. Refresh and try again.')

    await i18n.changeLanguage('zh-CN')
    expect(getProfileErrorMessage(new ApiError('server', 409, 100006, null))).toBe('资料状态已变化，请刷新后重试')
    expect(getEnterpriseErrorMessage(new ApiError('server', 409, 140004, null))).toBe('企业资源已被其他操作更新，请刷新后重试')
  })
})
