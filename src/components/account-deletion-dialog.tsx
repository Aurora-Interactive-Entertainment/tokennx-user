import { useEffect, useState } from 'react'
import Modal from '@/components/app-modal'
import './account-deletion-dialog.css'

const DELETE_CONFIRMATION = 'DELETE'

type AccountDeletionDialogProps = {
  visible: boolean
  onCancel: () => void
  onConfirm: () => void
  loading?: boolean
  title: string
  description: string
  consequences: string[]
  confirmationLabel: string
  confirmationPlaceholder: string
  confirmText: string
  cancelText: string
}

/**
 * 中文：注销接口接入前先复用统一确认弹窗，明确要求用户输入 DELETE，避免误触危险操作。
 */
export function AccountDeletionDialog({
  visible,
  onCancel,
  onConfirm,
  title,
  description,
  consequences,
  confirmationLabel,
  confirmationPlaceholder,
  confirmText,
  cancelText,
  loading = false,
}: AccountDeletionDialogProps) {
  const [confirmation, setConfirmation] = useState('')
  const canConfirm = confirmation === DELETE_CONFIRMATION

  useEffect(() => {
    if (!visible) setConfirmation('')
  }, [visible])

  return (
    <Modal
      className="account-deletion-dialog"
      centered
      title={title}
      aria-label={title}
      visible={visible}
      // 中文：账户设置弹窗自身层级为 1200，注销流程必须使用更高层级，避免被父弹窗遮挡。
      zIndex={2000}
      // 中文：账户设置弹窗使用 body 独立挂载，注销弹窗也挂到 body，避免被 app-mount 层叠上下文遮挡。
      getPopupContainer={() => document.body}
      onCancel={onCancel}
      confirmLoading={loading}
      onOk={() => {
        if (canConfirm) onConfirm()
      }}
      okText={confirmText}
      cancelText={cancelText}
      okButtonProps={{
        disabled: !canConfirm || loading,
        className: 'account-deletion-confirm-button',
        'aria-label': confirmText,
      }}
      cancelButtonProps={{
        className: 'account-deletion-cancel-button',
        'aria-label': cancelText,
      }}
    >
      <div className="account-deletion-dialog-body">
        <p className="account-deletion-dialog-description">{description}</p>
        <ul className="account-deletion-consequences">
          {consequences.map((consequence) => <li key={consequence}>{consequence}</li>)}
        </ul>
        <label className="account-deletion-confirmation-label" htmlFor="account-deletion-confirmation">
          {confirmationLabel}
        </label>
        <input
          id="account-deletion-confirmation"
          className="account-deletion-confirmation-input"
          type="text"
          value={confirmation}
          placeholder={confirmationPlaceholder}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </div>
    </Modal>
  )
}
