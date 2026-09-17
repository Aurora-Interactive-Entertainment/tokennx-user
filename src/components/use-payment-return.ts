import { useCallback, useMemo, useRef, useState } from 'react'
import { getBillingErrorMessage, getBillingRequestId, type BillingContext, type BillingPaymentOrder } from '@/api/billing'
import { isAuthenticationFailure } from '@/api/http'
import { isPaymentSettled } from '@/api/payment-flow'
import { assertBillingPaymentOrderIdentity } from '@/api/plan-payment-validation'
import { getAccessTokenUserId } from '@/auth/token-storage'
import { useBillingPaymentPolling } from './use-billing-payment-polling'
import { useBuildUpdateBlocker } from '@/runtime/use-build-update-blocker'
import i18n from '@/i18n'

export interface PaymentReturnState {
  status: 'idle' | 'loading' | 'success' | 'error'
  data: BillingPaymentOrder | null
  error: string
  requestId: string | null
}

// 回跳也使用串行、有界查单；支付中和短暂失败均保留手动恢复入口。
export function usePaymentReturn({ context, orderID, onAuthFailure, onSettled }: {
  context: BillingContext
  orderID: string
  onAuthFailure: () => void
  onSettled: () => void
}) {
  const userID = getAccessTokenUserId()
  const normalizedID = orderID.trim()
  const key = JSON.stringify([userID, context.account_type, context.enterprise_id, normalizedID])
  const [snapshot, setSnapshot] = useState<{ key: string; state: PaymentReturnState } | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const settledKey = useRef<string | null>(null)
  // 此对象只提供轮询目标，不作为已查证的订单渲染。
  const queryTarget = useMemo(() => normalizedID ? { id: normalizedID, status: 'pending', paid_at: null } as BillingPaymentOrder : null, [key])
  const fallback: PaymentReturnState = { status: normalizedID ? 'loading' : 'idle', data: null, error: '', requestId: null }
  const state = snapshot?.key === key ? snapshot.state : fallback
  // 回跳参数会保留到 URL 中；只有当前主体查证的终态才允许自动更新，超时后仍需用户重试或离开。
  const confirmedTerminal = state.data && (isPaymentSettled(state.data) || ['closed', 'expired'].includes(state.data.status))
  useBuildUpdateBlocker(Boolean(normalizedID && !confirmedTerminal))
  useBillingPaymentPolling({
    context, order: queryTarget, enabled: Boolean(normalizedID), refreshToken, scopeKey: key,
    onOrder: (order) => {
      assertBillingPaymentOrderIdentity(order, context, { orderID: normalizedID, userID })
      setSnapshot({ key, state: { status: 'success', data: order, error: '', requestId: null } })
      if (isPaymentSettled(order) && settledKey.current !== key) {
        settledKey.current = key
        onSettled()
      }
    },
    onError: (error) => {
      if (isAuthenticationFailure(error)) { onAuthFailure(); return }
      setSnapshot((previous) => ({ key, state: { status: 'error', data: previous?.key === key ? previous.state.data : null, error: getBillingErrorMessage(error), requestId: getBillingRequestId(error) } }))
    },
    onTimeout: () => setSnapshot((previous) => ({ key, state: { status: 'error', data: previous?.key === key ? previous.state.data : null, error: i18n.t('console.billing.paymentStatusUnknown'), requestId: null } })),
  })
  const retry = useCallback(() => setRefreshToken((value) => value + 1), [])
  return { state, retry }
}
