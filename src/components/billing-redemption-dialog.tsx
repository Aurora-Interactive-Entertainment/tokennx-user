import { useEffect, useState } from 'react'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
import Tooltip from '@douyinfe/semi-ui/lib/es/tooltip'
import { IconInfoCircle } from '@douyinfe/semi-icons'
import Modal from '@/components/app-modal'
import { getBillingErrorMessage, redeemBillingCode, type BillingRedemptionResult } from '@/api/billing'
import { isAuthenticationFailure } from '@/api/http'
import i18n from '@/i18n'
import './billing-redemption-dialog.css'

export interface BillingRedemptionDialogProps {
  visible: boolean
  onClose: () => void
  onSuccess?: (result: BillingRedemptionResult) => void
  onAuthFailure?: () => void
}

/** 兑换码弹窗只负责输入与提交，余额刷新由账单页在成功后统一触发。 */
export function BillingRedemptionDialog({ visible, onClose, onSuccess, onAuthFailure }: BillingRedemptionDialogProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (visible) {
      setCode('')
      setError('')
      setSubmitting(false)
    }
  }, [visible])

  function showError(message: string): void {
    setError(message)
    // 用户每次主动提交都应收到反馈，不能依赖相同错误字符串触发状态变化。
    Toast.error(message)
  }

  function validate(value: string): string {
    if (!value) return i18n.t('console.billing.redeemCodeRequired')
    return /^[A-Za-z0-9]{12}$/.test(value) ? '' : i18n.t('console.billing.redeemCodeInvalid')
  }

  async function submit(): Promise<void> {
    if (submitting) return
    const normalized = code.trim()
    const validationError = validate(normalized)
    if (validationError) {
      showError(validationError)
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await redeemBillingCode(normalized)
      Toast.success(i18n.t('console.billing.redeemCodeSuccess', { amount: result.amount_yuan }))
      onSuccess?.(result)
      onClose()
    } catch (reason: unknown) {
      if (isAuthenticationFailure(reason)) {
        onAuthFailure?.()
        return
      }
      showError(getBillingErrorMessage(reason))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      className="billing-redemption-modal"
      title={(
        <span className="billing-redemption-title" aria-label={i18n.t('console.billing.redeemCodeTitle')}>
          <span>{i18n.t('console.billing.redeemCodeTitle')}</span>
          <Tooltip
            className="app-info-tooltip billing-redemption-tooltip"
            content={i18n.t('console.billing.redeemCodeHelp')}
            position="top"
          >
            <span
              className="app-info-icon-trigger billing-redemption-info-trigger"
              role="img"
              tabIndex={0}
              aria-label={i18n.t('console.billing.redeemCodeHelp')}
            >
              <IconInfoCircle className="app-info-icon" aria-hidden="true" />
            </span>
          </Tooltip>
        </span>
      )}
      visible={visible}
      onCancel={() => { if (!submitting) onClose() }}
      onOk={() => { void submit() }}
      okText={i18n.t('console.billing.redeemCodeSubmit')}
      cancelText={i18n.t('console.billing.redeemCodeCancel')}
      okButtonProps={{ loading: submitting, disabled: submitting }}
    >
      <div className="billing-redemption-form">
        <div className="billing-redemption-field">
          {/* 弹窗标题已经写明「兑换码」，字段标签只留给读屏，避免同一屏出现两行同名文案。 */}
          <label className="billing-redemption-sr-label" htmlFor="billing-redemption-code">
            {i18n.t('console.billing.redeemCodeTitle')}
          </label>
          <input
            id="billing-redemption-code"
            className={`billing-redemption-input${error ? ' is-invalid' : ''}`}
            value={code}
            maxLength={12}
            autoComplete="off"
            inputMode="text"
            required
            aria-required="true"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'billing-redemption-error' : undefined}
            placeholder={i18n.t('console.billing.redeemCodePlaceholder')}
            onChange={(event) => {
              setCode(event.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 12))
              if (error) setError('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void submit()
              }
            }}
          />
          {error ? (
            <span className="billing-redemption-error" id="billing-redemption-error" role="alert">
              {error}
            </span>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}

export default BillingRedemptionDialog
