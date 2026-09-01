import Button from '@douyinfe/semi-ui/lib/es/button'
import { IconUserStroked } from '@douyinfe/semi-icons'
import Modal from '@/components/app-modal'
import { useTranslation } from 'react-i18next'
import './real-name-required-dialog.css'

interface RealNameRequiredDialogProps {
  visible: boolean
  onCancel: () => void
  onVerify: () => void
  onCompleted: () => void
}

// 中文：充值前实名提示独立成组件，保证充值表单只负责支付流程状态。
export function RealNameRequiredDialog({ visible, onCancel, onVerify, onCompleted }: RealNameRequiredDialogProps) {
  const { t } = useTranslation()
  return (
    <Modal
      visible={visible}
      className="real-name-required-dialog"
      title={<span className="public-sr-only">{t('console.realNameRequired.title')}</span>}
      onCancel={onCancel}
      footer={null}
      width={680}
      maskClosable={false}
      motion={false}
    >
      <div className="real-name-required-content">
        <div className="real-name-required-icon" aria-hidden="true"><span><IconUserStroked /></span></div>
        <h2>{t('console.realNameRequired.title')}</h2>
        <p>{t('console.realNameRequired.description')}</p>
        <div className="real-name-required-actions">
          <Button theme="outline" onClick={onCompleted}>{t('console.realNameRequired.completed')}</Button>
          <Button className="real-name-required-primary" theme="solid" type="primary" onClick={onVerify}>{t('console.realNameRequired.verify')}</Button>
        </div>
      </div>
    </Modal>
  )
}

export default RealNameRequiredDialog
