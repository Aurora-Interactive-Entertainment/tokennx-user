import { useTranslation } from 'react-i18next'

export function PurchaseCatalogState({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  const { t } = useTranslation()
  const empty = !loading && !error
  return <div className="purchase-catalog-state" role={error ? 'alert' : 'status'}>
    {empty && <span className="purchase-catalog-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m3.5 7.2 8.5-4 8.5 4v9.6l-8.5 4-8.5-4V7.2Z" /><path d="m3.8 7.4 8.2 4 8.2-4M12 11.4v9" /></svg></span>}
    <span>{t(`console.purchasePage.api.${loading ? 'loading' : error ? 'loadFailed' : 'empty'}`)}</span>
    {error && <><small>{error}</small><button type="button" onClick={onRetry}>{t('console.purchasePage.api.retry')}</button></>}
  </div>
}
