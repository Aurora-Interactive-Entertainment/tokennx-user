import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import { PageTitle } from '@/components/common'
import { getBillingErrorMessage, getBillingPaymentOrder, getBillingRequestId, type BillingPaymentOrder } from '@/api/billing'
import { isAuthenticationFailure } from '@/api/http'
import { useAppStore } from '@/data/app-state'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'
import { billingContextForWorkspace, PaymentReturnNotice, RechargeTab, type ResourceState } from './billing'

export function RechargePage() {
  const { t } = useTranslation()
  const store = useAppStore()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const activeWorkspace = store.activeWorkspace
  const context = useMemo(() => billingContextForWorkspace(activeWorkspace), [activeWorkspace.id, activeWorkspace.type])
  const paymentReturnOrderID = useMemo(() => new URLSearchParams(location.search).get('order_id')?.trim() ?? '', [location.search])
  const [paymentReturnState, setPaymentReturnState] = useState<ResourceState<BillingPaymentOrder>>({ status: 'idle', data: null, error: '', requestId: null })
  const [paymentReturnRetryToken, setPaymentReturnRetryToken] = useState(0)

  const handleAuthFailure = useCallback(() => {
    dispatch(invalidateAuth())
    navigate('/', { replace: true })
  }, [dispatch, navigate])

  useEffect(() => {
    if (!paymentReturnOrderID) {
      setPaymentReturnState({ status: 'idle', data: null, error: '', requestId: null })
      return
    }
    const controller = new AbortController()
    setPaymentReturnState((previous) => ({ status: 'loading', data: previous.data, error: '', requestId: null }))
    void getBillingPaymentOrder(paymentReturnOrderID, { signal: controller.signal }).then((order) => {
      if (!controller.signal.aborted) setPaymentReturnState({ status: 'success', data: order, error: '', requestId: null })
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      if (isAuthenticationFailure(error)) {
        handleAuthFailure()
        return
      }
      setPaymentReturnState({ status: 'error', data: null, error: getBillingErrorMessage(error), requestId: getBillingRequestId(error) })
    })
    return () => controller.abort()
  }, [handleAuthFailure, paymentReturnOrderID, paymentReturnRetryToken])

  return (
    <div className="page-stack billing-console-page recharge-console-page">
      <PageTitle title={t('console.nav.recharge')} />
      <PaymentReturnNotice state={paymentReturnState} onRetry={() => setPaymentReturnRetryToken((value) => value + 1)} />
      <RechargeTab context={context} onOrderUpdated={() => undefined} onAuthFailure={handleAuthFailure} />
    </div>
  )
}
