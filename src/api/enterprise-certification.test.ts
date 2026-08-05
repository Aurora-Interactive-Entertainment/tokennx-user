import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './http'
import {
  getEnterpriseCertification,
  getEnterpriseCertificationErrorMessage,
  normalizeEnterpriseCreditCode,
  submitEnterpriseCertification,
  validateEnterpriseCertificationForm,
  type EnterpriseCertification,
} from './enterprise-certification'

const CERTIFICATION: EnterpriseCertification = {
  status: 'unsubmitted',
  current_stage: 'not_started',
}

function response(data: EnterpriseCertification): Response {
  return new Response(JSON.stringify({ code: 0, msg: 'success', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('企业认证 API 封装', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('读取认证状态并提交企业认证资料', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(CERTIFICATION))

    await expect(getEnterpriseCertification('enterprise-token')).resolves.toEqual(CERTIFICATION)
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/user/enterprise/certification')
    expect(new Headers(fetchMock.mock.calls.at(-1)?.[1]?.headers).get('Authorization')).toBe('Bearer enterprise-token')

    const approved: EnterpriseCertification = {
      status: 'approved',
      current_stage: 'done',
      enterprise_name: '测试企业',
      credit_code_masked: '9133**********AB2C',
      legal_representative_masked: '张*',
    }
    fetchMock.mockResolvedValue(response(approved))
    const request = {
      enterprise_name: '测试企业',
      credit_code: '91330100MA1FL0AB2C',
      legal_representative: '张三',
      applicant_type: 'legal_representative' as const,
      consent: true,
    }
    await expect(submitEnterpriseCertification('enterprise-token', request)).resolves.toEqual(approved)
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/user/enterprise/certification')
    expect(fetchMock.mock.calls.at(-1)?.[1]?.method).toBe('POST')
    expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))).toEqual(request)
  })

  it('规范化统一社会信用代码并校验企业认证表单', () => {
    expect(normalizeEnterpriseCreditCode(' 91330100ma1fl0ab2c ')).toBe('91330100MA1FL0AB2C')
    expect(validateEnterpriseCertificationForm({ enterpriseName: '', creditCode: '', legalRepresentative: '', applicantType: 'legal_representative', consent: false })).toEqual({
      enterpriseName: '请输入企业名称',
      creditCode: '请输入统一社会信用代码',
      legalRepresentative: '请输入法定代表人',
      consent: '请先同意企业认证信息处理声明',
    })
    expect(validateEnterpriseCertificationForm({ enterpriseName: '测试企业', creditCode: '91330100MA1FL0AB2C', legalRepresentative: '张三', applicantType: 'authorized_agent', consent: true })).toEqual({})
    expect(validateEnterpriseCertificationForm({ enterpriseName: '测试企业', creditCode: '91330100INVALID', legalRepresentative: '张三', applicantType: 'authorized_agent', consent: true })).toEqual({ creditCode: '请输入有效的统一社会信用代码' })
  })

  it('映射认证服务错误并保留未知错误信息', () => {
    expect(getEnterpriseCertificationErrorMessage(new ApiError('参数无效', 400, 100001, 'request-1'))).toBe('请检查企业名称、统一社会信用代码和法定代表人信息')
    expect(getEnterpriseCertificationErrorMessage(new ApiError('认证服务错误', 503, 100002, 'request-2'))).toBe('企业认证服务暂时不可用，请稍后重试')
    expect(getEnterpriseCertificationErrorMessage(new ApiError('服务自定义错误', 400, 199999, 'request-3'))).toBe('服务自定义错误')
    expect(getEnterpriseCertificationErrorMessage(new Error('offline'))).toBe('企业认证请求失败，请稍后重试')
  })
})
