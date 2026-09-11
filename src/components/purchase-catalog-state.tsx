import { useTranslation } from 'react-i18next'

export function PurchaseCatalogState({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  const { t } = useTranslation()
  return <div className="purchase-catalog-state" role={error ? 'alert' : 'status'}>
    <span>{t(`console.purchasePage.api.${loading ? 'loading' : error ? 'loadFailed' : 'empty'}`)}</span>
    {error && <><small>{error}</small><button type="button" onClick={onRetry}>{t('console.purchasePage.api.retry')}</button></>}
  </div>
}
