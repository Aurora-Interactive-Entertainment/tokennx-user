import i18n from '@/i18n'
import { ApiError } from './http'

const PAYMENT_FORM_ERROR_CODE = 140002
const PAYMENT_FORM_TARGET_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/
const PAYMENT_FORM_RESERVED_TARGETS = new Set(['_self', '_blank', '_parent', '_top'])

export interface PaymentFormSubmitOptions {
  target: string
}

// 仅复制支付宝服务端返回的表单字段，避免通过 innerHTML 执行未知脚本。
export function submitPaymentFormHTML(formHTML: string, options: PaymentFormSubmitOptions): () => void {
  if (typeof DOMParser === 'undefined' || typeof document === 'undefined') {
    throw new ApiError(i18n.t('api.billing.paymentFormInvalid'), 502, PAYMENT_FORM_ERROR_CODE, null)
  }
  const target = options?.target?.trim() || ''
  if (!PAYMENT_FORM_RESERVED_TARGETS.has(target) && !PAYMENT_FORM_TARGET_PATTERN.test(target)) {
    throw new ApiError(i18n.t('api.billing.paymentFormInvalid'), 502, PAYMENT_FORM_ERROR_CODE, null)
  }
  const parsed = new DOMParser().parseFromString(formHTML.trim(), 'text/html')
  const sourceForm = parsed.querySelector('form')
  if (!sourceForm) throw new ApiError(i18n.t('api.billing.paymentFormInvalid'), 502, PAYMENT_FORM_ERROR_CODE, null)

  const method = (sourceForm.getAttribute('method') || 'POST').trim().toUpperCase()
  const action = sourceForm.getAttribute('action')?.trim() || ''
  let actionURL: URL
  try {
    actionURL = new URL(action, window.location.origin)
  } catch {
    throw new ApiError(i18n.t('api.billing.paymentFormInvalid'), 502, PAYMENT_FORM_ERROR_CODE, null)
  }
  if (method !== 'POST' || (actionURL.protocol !== 'https:' && actionURL.protocol !== 'http:')) {
    throw new ApiError(i18n.t('api.billing.paymentFormInvalid'), 502, PAYMENT_FORM_ERROR_CODE, null)
  }

  const form = document.createElement('form')
  form.method = method
  form.action = actionURL.toString()
  form.target = target
  form.hidden = true
  form.setAttribute('aria-hidden', 'true')
  const fields = Array.from(sourceForm.querySelectorAll<HTMLInputElement>('input[name]'))
  if (fields.length === 0) throw new ApiError(i18n.t('api.billing.paymentFormInvalid'), 502, PAYMENT_FORM_ERROR_CODE, null)
  for (const field of fields) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = field.name
    input.value = field.value
    form.append(input)
  }
  document.body.append(form)
  try {
    form.submit()
  } catch (error) {
    form.remove()
    throw new ApiError(i18n.t('api.billing.paymentFormInvalid'), 502, PAYMENT_FORM_ERROR_CODE, null)
  }

  let removed = false
  return () => {
    if (removed) return
    removed = true
    form.remove()
  }
}
