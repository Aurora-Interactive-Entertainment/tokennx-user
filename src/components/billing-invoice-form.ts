import type {
  BillingInvoiceOption,
  BillingInvoiceResponse,
  BillingInvoiceType,
} from '@/api/billing'
import type { Workspace } from '@/data/app-state'
import {
  BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES,
  formatYuan,
} from '@/utils/format'
import i18n from '@/i18n'

export type InvoiceTaxpayerType = 'enterprise' | 'personal'

export interface InvoiceForm {
  amount_yuan: string
  title: string
  tax_identifier: string
  taxpayer_type: InvoiceTaxpayerType
  email: string
  project_name: string
  invoice_type: BillingInvoiceType | ''
}

export type InvoiceFormErrors = Partial<Record<keyof InvoiceForm, string>>

export interface InvoiceDialogOptions {
  invoiceTypes: BillingInvoiceOption<BillingInvoiceType>[]
  projectNames: BillingInvoiceOption[]
}

const MAX_INVOICE_TITLE_LENGTH = 255
const MAX_TAX_IDENTIFIER_LENGTH = 128
const MAX_EMAIL_LENGTH = 320
const MAX_PROJECT_NAME_LENGTH = 255

// 中文：后端开票配置上线前保留本地选项，接口返回后优先使用接口数据。
export function getInvoiceDialogOptions(
  response: BillingInvoiceResponse | null,
): InvoiceDialogOptions {
  const applicationForm = response?.application_form
  return {
    invoiceTypes: applicationForm?.invoice_types?.length
      ? applicationForm.invoice_types
      : [
          {
            value: 'normal',
            label: i18n.t('console.billing.invoiceTypeNormal'),
          },
          {
            value: 'special',
            label: i18n.t('console.billing.invoiceTypeSpecial'),
          },
        ],
    projectNames: applicationForm?.project_names?.length
      ? applicationForm.project_names
      : [
          {
            value: i18n.t('console.billing.defaultProjectName'),
            label: i18n.t('console.billing.defaultProjectName'),
          },
        ],
  }
}

// 中文：只读字段及下拉初始值均来自当前账务主体的接口响应。
export function createInvoiceForm(
  response: BillingInvoiceResponse | null,
  workspaceType: Workspace['type'],
): InvoiceForm {
  const applicationForm = response?.application_form
  const options = getInvoiceDialogOptions(response)
  return {
    amount_yuan:
      applicationForm?.amount_yuan ?? response?.available_amount_yuan ?? '',
    title: applicationForm?.title ?? response?.account.name ?? '',
    tax_identifier: applicationForm?.tax_identifier ?? '',
    taxpayer_type: workspaceType === 'enterprise' ? 'enterprise' : 'personal',
    email: '',
    project_name: options.projectNames[0]?.value ?? '',
    invoice_type: options.invoiceTypes[0]?.value ?? '',
  }
}

function parseAmount(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

// 中文：邮箱为选填，其余字段仍在提交前校验接口数据的完整性。
export function validateInvoiceForm(
  form: InvoiceForm,
  available: string,
): InvoiceFormErrors {
  const errors: InvoiceFormErrors = {}
  const amount = parseAmount(form.amount_yuan)
  const availableAmount = Number(available)
  if (amount === null)
    errors.amount_yuan = i18n.t('console.billing.invoiceFormAmount')
  else if (!Number.isFinite(availableAmount) || amount > availableAmount)
    errors.amount_yuan = i18n.t('console.billing.invoiceAmountExceeded', {
      amount: formatYuan(available, BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES),
    })

  const title = form.title.trim()
  if (!title) errors.title = i18n.t('console.billing.invoiceTitleRequired')
  else if (Array.from(title).length > MAX_INVOICE_TITLE_LENGTH)
    errors.title = i18n.t('console.billing.invoiceTitleTooLong', {
      count: MAX_INVOICE_TITLE_LENGTH,
    })

  const taxIdentifier = form.tax_identifier.trim()
  if (form.taxpayer_type === 'enterprise' && !taxIdentifier)
    errors.tax_identifier = i18n.t('console.billing.taxpayerRequired')
  else if (Array.from(taxIdentifier).length > MAX_TAX_IDENTIFIER_LENGTH)
    errors.tax_identifier = i18n.t('console.billing.taxpayerTooLong', {
      count: MAX_TAX_IDENTIFIER_LENGTH,
    })

  const email = form.email.trim()
  if (
    email &&
    (email.length > MAX_EMAIL_LENGTH ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  )
    errors.email = i18n.t('console.billing.emailInvalid')

  if (!form.invoice_type)
    errors.invoice_type = i18n.t('console.billing.invoiceTypeRequired')
  const projectName = form.project_name.trim()
  if (!projectName)
    errors.project_name = i18n.t('console.billing.projectNameRequired')
  else if (Array.from(projectName).length > MAX_PROJECT_NAME_LENGTH)
    errors.project_name = i18n.t('console.billing.projectNameTooLong', {
      count: MAX_PROJECT_NAME_LENGTH,
    })
  return errors
}
