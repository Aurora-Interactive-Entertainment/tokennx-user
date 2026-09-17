import Button from '@douyinfe/semi-ui/lib/es/button'
import { useTranslation } from 'react-i18next'
import './request-error-panel.css'

interface RequestErrorPanelProps {
  message: string
  onRetry: () => void
  requestId?: string | null
  retrying?: boolean
  className?: string
}

/** 保留请求失败原因与恢复入口；即时 Toast 由调用方负责，避免重复提示。 */
export function RequestErrorPanel({ message, onRetry, requestId, retrying = false, className }: RequestErrorPanelProps) {
  const { t } = useTranslation()
  return (
    <div className={['request-error-panel', className].filter(Boolean).join(' ')} role="alert" aria-busy={retrying}>
      <div className="request-error-panel__message">
        <span>{message}</span>
        {requestId ? <small>{t('console.common.requestId')}: {requestId}</small> : null}
      </div>
      <Button theme="outline" loading={retrying} disabled={retrying} onClick={onRetry}>{t('console.common.retry')}</Button>
    </div>
  )
}
