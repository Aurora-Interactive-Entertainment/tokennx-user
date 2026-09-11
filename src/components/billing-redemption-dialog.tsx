import { useEffect, useState } from 'react'
import Toast from '@douyinfe/semi-ui/lib/es/toast'
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

  useEffect(() => {
    if (error) Toast.error(error)
  }, [error])

  async function submit(): Promise<void> {
    if (submitting) return
    const normalized = code.trim()
    if (!/^[A-Za-z0-9]{12}$/.test(normalized)) {
      setError(i18n.t('console.billing.redeemCodeInvalid'))
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
      setError(getBillingErrorMessage(reason))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      className="billing-redemption-modal"
      title={i18n.t('console.billing.redeemCodeTitle')}
      visible={visible}
      onCancel={() => { if (!submitting) onClose() }}
      onOk={() => { void submit() }}
      okText={i18n.t('console.billing.redeemCodeSubmit')}
      cancelText={i18n.t('console.billing.redeemCodeCancel')}
      okButtonProps={{ loading: submitting, disabled: submitting }}
    >
      <div className="billing-redemption-form">
        <input
          id="billing-redemption-code"
          className={`billing-redemption-input${error ? ' is-invalid' : ''}`}
          value={code}
          maxLength={12}
          autoComplete="off"
          inputMode="text"
          aria-invalid={Boolean(error)}
          aria-describedby="billing-redemption-hint"
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
        <p className="billing-redemption-hint" id="billing-redemption-hint">
          {i18n.t('console.billing.redeemCodeHint')}
        </p>
      </div>
    </Modal>
  )
}

export default BillingRedemptionDialog
