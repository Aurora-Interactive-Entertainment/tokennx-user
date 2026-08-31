import '@/i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  confirmEnterpriseFaceVerification,
  getEnterpriseFaceVerificationStatus,
  getEnterpriseCertification,
  normalizeEnterpriseCreditCode,
  startEnterpriseFaceVerification,
  submitEnterpriseCertification,
  uploadEnterpriseCertificationMaterial,
  validateEnterpriseCertificationForm,
  type EnterpriseCertification,
} from './enterprise-certification'

const CERTIFICATION: EnterpriseCertification = { status: 'unsubmitted', current_stage: 'not_started' }

function response(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, msg: 'success', data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('enterprise certification API', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('queries and submits the complete legal representative request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(response(CERTIFICATION)))
    await expect(getEnterpriseCertification('enterprise-token')).resolves.toEqual(CERTIFICATION)
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/user/enterprise/certification')

    const request = {
      enterprise_name: '测试企业', credit_code: '91330100MA1FL0AB2C', legal_representative: '张三', legal_representative_id: '110101199001011234',
      contact_name: '李四', contact_phone: '0571-12345678', applicant_type: 'legal_representative' as const,
      license_url: '/api/user/enterprise/certification/materials/license/content', consent: true as const,
    }
    await submitEnterpriseCertification('enterprise-token', request)
    expect(fetchMock.mock.calls.at(-1)?.[1]?.method).toBe('POST')
    expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))).toEqual(request)
  })

  it('uploads the business license as multipart form data', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ resource_url: '/material', file_name: 'license.png', mime_type: 'image/png', size_bytes: 3 }))
    const file = new File(['png'], 'license.png', { type: 'image/png' })
    await uploadEnterpriseCertificationMaterial('enterprise-token', file)
    const options = fetchMock.mock.calls.at(-1)?.[1]
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/user/enterprise/certification/materials')
    expect(options?.body).toBeInstanceOf(FormData)
    expect((options?.body as FormData).get('material_type')).toBe('business_license')
    expect((options?.body as FormData).get('file')).toBe(file)
    expect(new Headers(options?.headers).has('Content-Type')).toBe(false)
  })

  it('starts and confirms legal representative face verification', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(response({ status: 'checking', current_stage: 'face_verification', face_url: 'https://example.com/face' })))
    await startEnterpriseFaceVerification('enterprise-token', 'https://console.example.com/console/enterprise-create')
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/user/enterprise/certification/face')
    expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))).toEqual({ return_url: 'https://console.example.com/console/enterprise-create' })
    await confirmEnterpriseFaceVerification('enterprise-token')
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/user/enterprise/certification/face/confirm')
    expect(fetchMock.mock.calls.at(-1)?.[1]?.body).toBeUndefined()
  })

  it('queries the face verification status endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ status: 'checking', current_stage: 'face_verification' }))
    await expect(getEnterpriseFaceVerificationStatus('enterprise-token')).resolves.toEqual({ status: 'checking', current_stage: 'face_verification' })
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/user/enterprise/certification/face/status')
    expect(fetchMock.mock.calls.at(-1)?.[1]?.method).toBeUndefined()
  })

  it('normalizes credit codes and validates every required submission field', () => {
    expect(normalizeEnterpriseCreditCode(' 91330100ma1fl0ab2c ')).toBe('91330100MA1FL0AB2C')
    expect(validateEnterpriseCertificationForm({ enterpriseName: '', creditCode: '', legalRepresentative: '', legalRepresentativeId: '', contactName: '', contactPhone: '', licenseUrl: '', consent: false })).toMatchObject({
      enterpriseName: '请输入企业名称', creditCode: '请输入统一社会信用代码', legalRepresentative: '请输入法定代表人', legalRepresentativeId: '请输入法定代表人身份证号', contactName: '请输入企业联系人', contactPhone: '请输入联系电话', licenseUrl: '请先上传营业执照', consent: '请先确认企业信息并同意认证信息处理声明',
    })
    expect(validateEnterpriseCertificationForm({ enterpriseName: '测试企业', creditCode: '91330100MA1FL0AB2C', legalRepresentative: '张三', legalRepresentativeId: '110101199001011234', contactName: '李四', contactPhone: '0571-12345678', licenseUrl: '/material', consent: true })).toEqual({})
  })
})
