import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@douyinfe/semi-ui/lib/es/button'
import {
  getBillingErrorMessage,
  getBillingStatements,
  type BillingContext,
  type BillingPageResult,
  type BillingStatementLine,
} from '@/api/billing'
import { isAuthenticationFailure } from '@/api/http'
import { EmptyPanel } from '@/components/common'
import { BackofficeMoneyText } from '@/components/money'
import { TraePagination } from '@/components/trae-pagination'
import { formatApiTime } from '@/utils/format'
import './recharge-history.css'

export function RechargeHistory({
  context,
  refreshToken,
  onAuthFailure,
}: {
  context: BillingContext
  refreshToken: number
  onAuthFailure: () => void
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [retryToken, setRetryToken] = useState(0)
  const [data, setData] =
    useState<BillingPageResult<BillingStatementLine> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    // 复用账务流水的充值筛选，直接获取全部历史的服务端分页，不混入消费或赠金。
    void getBillingStatements(context, {
      line_type: 'recharge',
      page,
      page_size: pageSize,
      signal: controller.signal,
    })
      .then((response) => {
        if (!controller.signal.aborted) setData(response)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        if (isAuthenticationFailure(reason)) onAuthFailure()
        else setError(getBillingErrorMessage(reason))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [
    context.account_type,
    context.enterprise_id,
    onAuthFailure,
    page,
    pageSize,
    refreshToken,
    retryToken,
  ])

  return (
    <section
      className="recharge-history"
      id="recharge-history"
      aria-labelledby="recharge-history-heading"
      aria-busy={loading}
    >
      <h2 id="recharge-history-heading">
        {t('console.billing.rechargeRecords')}
      </h2>
      {loading ? (
        <div className="billing-loading" role="status">
          <span className="api-keys-loading-spinner" />
          {t('console.billing.loadingRechargeRecords')}
        </div>
      ) : error ? (
        <div className="recharge-history-error" role="alert">
          <p>{error}</p>
          <Button
            theme="outline"
            onClick={() => setRetryToken((value) => value + 1)}
          >
            {t('console.common.retry')}
          </Button>
        </div>
      ) : !data?.items.length ? (
        <EmptyPanel
          surface="table"
          title={t('console.billing.noRechargeRecords')}
          description={t('console.billing.rechargeRecordsHint')}
        />
      ) : (
        <div
          className="recharge-history-scroll"
          role="region"
          aria-label={t('console.billing.rechargeRecords')}
          tabIndex={0}
        >
          <table className="recharge-history-table">
            <thead>
              <tr>
                <th>{t('console.billing.time')}</th>
                <th>{t('console.billing.relatedDescription')}</th>
                <th>{t('console.billing.rechargeAmount')}</th>
                <th>{t('console.billing.balance')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>{formatApiTime(item.occurred_at)}</td>
                  <td>{item.description || item.title || '--'}</td>
                  <td>
                    <BackofficeMoneyText value={item.amount_yuan} />
                  </td>
                  <td>
                    {item.balance_after_yuan ? (
                      <BackofficeMoneyText value={item.balance_after_yuan} />
                    ) : (
                      '--'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!error && data ? (
        <TraePagination
          ariaLabel={t('console.billing.rechargeRecordsPagination')}
          currentPage={page}
          pageSize={pageSize}
          total={data.total}
          disabled={loading}
          summary={t('console.billing.ledgerCount', { count: data.total })}
          onChange={(nextPage, nextPageSize) => {
            setPage(nextPageSize === pageSize ? nextPage : 1)
            setPageSize(nextPageSize)
          }}
        />
      ) : null}
    </section>
  )
}
