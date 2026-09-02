import type { ReactNode } from 'react'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Steps from '@douyinfe/semi-ui/lib/es/steps'
import { IconTickCircle } from '@douyinfe/semi-icons'
import { Link } from 'react-router'
import Modal from '@/components/app-modal'
import { BackofficeMoneyText as MoneyText } from '@/components/money'
import { CompatSelect as Select } from '@/components/semi-compat'
import type { BillingInvoiceOption, BillingInvoiceType } from '@/api/billing'
import type {
  InvoiceDialogOptions,
  InvoiceForm,
  InvoiceFormErrors,
} from '@/components/billing-invoice-form'
import i18n from '@/i18n'
import './billing-invoice-dialog.css'

function invoiceTypeLabel(
  type: string,
  options: BillingInvoiceOption<BillingInvoiceType>[],
): string {
  return (
    options.find((option) => option.value === type)?.label ??
    i18n.t(
      type === 'special'
        ? 'console.billing.invoiceTypeSpecial'
        : 'console.billing.invoiceTypeNormal',
    )
  )
}

interface InvoiceFillStepProps {
  form: InvoiceForm
  options: InvoiceDialogOptions
  errors: InvoiceFormErrors
  onChange: (key: keyof InvoiceForm, value: string) => void
}

// 中文：填写步只暴露邮箱和两个下拉的交互，接口字段均保持只读。
function InvoiceFillStep({
  form,
  options,
  errors,
  onChange,
}: InvoiceFillStepProps) {
  const fieldError = (key: keyof InvoiceForm): ReactNode =>
    errors[key] ? (
      <small
        className="invoice-field-error"
        id={`invoice-${key}-error`}
        role="alert"
      >
        {errors[key]}
      </small>
    ) : null
  const fieldClass = (key: keyof InvoiceForm): string =>
    `invoice-field${errors[key] ? ' has-error' : ''}`
  const isEnterprise = form.taxpayer_type === 'enterprise'

  return (
    <div className="invoice-dialog-body">
      <div className="invoice-form-grid">
        <label className={fieldClass('title')}>
          <span className="invoice-field-label">
            {i18n.t('console.billing.invoiceTitle')}
          </span>
          <input
            id="invoice-title"
            className="input invoice-readonly-input"
            value={form.title}
            readOnly
            aria-readonly="true"
            aria-invalid={Boolean(errors.title)}
            aria-describedby="invoice-title-error"
          />
          {fieldError('title')}
        </label>
        {isEnterprise ? (
          <label className={fieldClass('tax_identifier')}>
            <span className="invoice-field-label">
              {i18n.t('console.billing.taxpayerId')}
            </span>
            <input
              id="invoice-tax-identifier"
              className="input invoice-readonly-input"
              value={form.tax_identifier}
              readOnly
              aria-readonly="true"
              aria-invalid={Boolean(errors.tax_identifier)}
              aria-describedby="invoice-tax_identifier-error"
            />
            {fieldError('tax_identifier')}
          </label>
        ) : null}
        <label className={fieldClass('invoice_type')}>
          <span className="invoice-field-label" id="invoice-type-label">
            {i18n.t('console.billing.invoiceType')} <em>*</em>
          </span>
          <Select
            id="invoice-type"
            className="billing-filter"
            dropdownClassName="billing-filter-dropdown"
            value={form.invoice_type}
            onChange={(value) =>
              onChange('invoice_type', String(value ?? ''))
            }
            onSelect={(value) =>
              onChange('invoice_type', String(value ?? ''))
            }
            block
            aria-invalid={Boolean(errors.invoice_type)}
            aria-labelledby="invoice-type-label"
            aria-describedby="invoice-invoice_type-error"
          >
            {options.invoiceTypes.map((option) => (
              <Select.Option key={option.value} value={option.value}>
                {option.label}
              </Select.Option>
            ))}
          </Select>
          {fieldError('invoice_type')}
        </label>
        <label className={fieldClass('project_name')}>
          <span
            className="invoice-field-label"
            id="invoice-project-name-label"
          >
            {i18n.t('console.billing.projectName')} <em>*</em>
          </span>
          <Select
            id="invoice-project-name"
            className="billing-filter"
            dropdownClassName="billing-filter-dropdown"
            value={form.project_name}
            onChange={(value) =>
              onChange('project_name', String(value ?? ''))
            }
            onSelect={(value) =>
              onChange('project_name', String(value ?? ''))
            }
            block
            aria-invalid={Boolean(errors.project_name)}
            aria-labelledby="invoice-project-name-label"
            aria-describedby="invoice-project_name-error"
          >
            {options.projectNames.map((option) => (
              <Select.Option key={option.value} value={option.value}>
                {option.label}
              </Select.Option>
            ))}
          </Select>
          {fieldError('project_name')}
        </label>
        <label className={fieldClass('amount_yuan')}>
          <span className="invoice-field-label">
            {i18n.t('console.billing.invoiceAmountYuan')}
          </span>
          <input
            id="invoice-amount"
            className="input invoice-readonly-input"
            inputMode="decimal"
            value={form.amount_yuan}
            readOnly
            aria-readonly="true"
            aria-invalid={Boolean(errors.amount_yuan)}
            aria-describedby="invoice-amount_yuan-error"
          />
          {fieldError('amount_yuan')}
        </label>
        <div className={fieldClass('email') + ' invoice-field-wide'}>
          <label className="invoice-field-label" htmlFor="invoice-email">
            {i18n.t('console.billing.receivingEmail')}
          </label>
          <input
            id="invoice-email"
            className="input"
            type="email"
            value={form.email}
            onChange={(event) => onChange('email', event.target.value)}
            placeholder={i18n.t('console.billing.accountEmail')}
            aria-invalid={Boolean(errors.email)}
            aria-describedby="invoice-email-error"
          />
          {fieldError('email')}
        </div>
      </div>
    </div>
  )
}

// 中文：确认步按当前空间类型展示已选信息，个人空间不渲染税号。
function InvoiceConfirmStep({
  form,
  options,
}: Pick<
  BillingInvoiceDialogProps,
  'form' | 'options'
>) {
  const isEnterprise = form.taxpayer_type === 'enterprise'
  return (
    <div className="invoice-dialog-body">
      <p className="invoice-dialog-note">
        {i18n.t('console.billing.confirmInvoiceInfo')}
      </p>
      <dl className="invoice-confirm-grid">
        <dt>{i18n.t('console.billing.invoiceTitle')}</dt>
        <dd>{form.title}</dd>
        {isEnterprise ? (
          <>
            <dt>{i18n.t('console.billing.taxpayerId')}</dt>
            <dd>{form.tax_identifier}</dd>
          </>
        ) : null}
        <dt>{i18n.t('console.billing.invoiceType')}</dt>
        <dd>{invoiceTypeLabel(form.invoice_type, options.invoiceTypes)}</dd>
        <dt>{i18n.t('console.billing.projectName')}</dt>
        <dd>{form.project_name}</dd>
        <dt>{i18n.t('console.billing.invoiceAmount')}</dt>
        <dd>
          <MoneyText value={form.amount_yuan} />
        </dd>
        <dt>{i18n.t('console.billing.receivingEmail')}</dt>
        <dd>{form.email || i18n.t('console.billing.notProvided')}</dd>
      </dl>
    </div>
  )
}

// 中文：完成步仅展示服务端已接收申请的结果。
function InvoiceSuccessStep() {
  return (
    <div className="invoice-dialog-body invoice-success">
      <div className="invoice-success-mark" aria-hidden="true">
        <IconTickCircle />
      </div>
      <p className="invoice-dialog-note">
        {i18n.t('console.billing.invoiceSuccessHint')}
      </p>
      <p className="invoice-demo-note">
        {i18n.t('console.billing.invoiceSuccessDemo')}
      </p>
    </div>
  )
}

interface BillingInvoiceDialogProps {
  open: boolean
  form: InvoiceForm
  options: InvoiceDialogOptions
  errors: InvoiceFormErrors
  step: 1 | 2 | 3
  submitting: boolean
  onClose: () => void
  onChange: (key: keyof InvoiceForm, value: string) => void
  onNext: () => void
  onBack: () => void
  onSubmit: () => void
}

// 中文：操作区统一交给 AppModal footer 渲染，复用项目标准按钮规格与间距。
function InvoiceDialogFooter({
  step,
  submitting,
  onClose,
  onNext,
  onBack,
  onSubmit,
}: Pick<
  BillingInvoiceDialogProps,
  'step' | 'submitting' | 'onClose' | 'onNext' | 'onBack' | 'onSubmit'
>) {
  return (
    <div className="invoice-dialog-footer">
      {step === 1 ? (
        <>
          <Link
            className="invoice-enterprise-link"
            to="/console/enterprise-create"
          >
            {i18n.t('console.billing.enterpriseVerification')}
          </Link>
          <Button theme="outline" type="tertiary" onClick={onClose}>
            {i18n.t('console.common.cancel')}
          </Button>
          <Button theme="solid" type="primary" onClick={onNext}>
            {i18n.t('console.billing.confirmInvoice')}
          </Button>
        </>
      ) : step === 2 ? (
        <>
          <Button
            theme="outline"
            type="tertiary"
            onClick={onBack}
            disabled={submitting}
          >
            {i18n.t('console.billing.checkAgain')}
          </Button>
          <Button
            theme="solid"
            type="primary"
            loading={submitting}
            onClick={onSubmit}
          >
            {i18n.t('console.billing.confirmSubmit')}
          </Button>
        </>
      ) : (
        <Button theme="solid" type="primary" onClick={onClose}>
          {i18n.t('console.common.confirm')}
        </Button>
      )}
    </div>
  )
}

// 中文：开票流程独立成组件，避免费用页继续承担弹窗的表单与布局细节。
export function BillingInvoiceDialog({
  open,
  form,
  options,
  errors,
  step,
  submitting,
  onClose,
  onChange,
  onNext,
  onBack,
  onSubmit,
}: BillingInvoiceDialogProps) {
  return (
    <Modal
      visible={open}
      title={
        step === 1
          ? i18n.t('console.billing.applyInvoice')
          : step === 2
            ? i18n.t('console.billing.confirmInvoice')
            : i18n.t('console.billing.invoiceSuccess')
      }
      onCancel={onClose}
      width={760}
      footer={
        <InvoiceDialogFooter
          step={step}
          submitting={submitting}
          onClose={onClose}
          onNext={onNext}
          onBack={onBack}
          onSubmit={onSubmit}
        />
      }
      className="invoice-dialog"
    >
      {/* 中文：使用 Semi 步骤器保持开票流程与认证流程一致，并让当前步骤自动呈现状态。 */}
      <Steps
        className="invoice-steps"
        type="basic"
        size="small"
        current={step - 1}
        aria-label={i18n.t('console.billing.invoiceStepsLabel')}
      >
        <Steps.Step title={i18n.t('console.billing.fillStep')} />
        <Steps.Step title={i18n.t('console.billing.confirmStep')} />
        <Steps.Step title={i18n.t('console.billing.doneStep')} />
      </Steps>
      {step === 1 ? (
        <InvoiceFillStep
          form={form}
          options={options}
          errors={errors}
          onChange={onChange}
        />
      ) : step === 2 ? (
        <InvoiceConfirmStep
          form={form}
          options={options}
        />
      ) : (
        <InvoiceSuccessStep />
      )}
    </Modal>
  )
}
