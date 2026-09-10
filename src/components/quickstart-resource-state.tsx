import { useTranslation } from 'react-i18next'
import Button from '@douyinfe/semi-ui/lib/es/button'
import { EmptyPanel } from './common'
import './quickstart-guide.css'

// 无数据时仍保留接入页标题和内容面板，错误与空列表使用不同文案。
export function QuickstartResourceState({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  const { t } = useTranslation()
  return <div className="quickstart-page quickstart-pdf-page">
    <div className="quickstart-pdf-intro"><div><strong>{t('console.quickstart.heroTitle')}</strong><p>{t('console.quickstart.heroHint')}</p></div></div>
    <section className="quickstart-resource-state" role="status" aria-live="polite" aria-busy={loading}>
      <EmptyPanel
        title={t(loading ? 'console.common.loadingModels' : error ? 'console.quickstart.loadFailed' : 'console.quickstart.noModelsTitle')}
        description={loading ? t('console.common.readingModels') : error || t('console.quickstart.noModelsHint')}
        action={!loading ? <Button theme="outline" onClick={onRetry}>{t('console.quickstart.reloadModels')}</Button> : undefined}
      />
    </section>
  </div>
}
