import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Tooltip from '@douyinfe/semi-ui/lib/es/tooltip'
import { IconBellStroked, IconHelpCircleStroked } from '@douyinfe/semi-icons'
import { PageTitle } from '@/components/common'
import { getBillingErrorMessage, getBillingWallet, type BillingWallet } from '@/api/billing'
import { isAuthenticationFailure } from '@/api/http'
import { BalanceAlertDialog } from '@/components/balance-alert-dialog'
import { RechargeHistory } from '@/components/recharge-history'
import { useAppStore } from '@/data/app-state'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'
import { billingContextForWorkspace, billingContextKey, PaymentReturnNotice, RechargeTab } from './billing'
import { usePaymentReturn } from '@/components/use-payment-return'
import { paymentIntentScope } from '@/api/pending-payment-intent'
import { BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES, formatYuan } from '@/utils/format'
import './recharge.css'

export function RechargePage() {
  const { t } = useTranslation()
  const store = useAppStore()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const activeWorkspace = store.activeWorkspace
  const context = useMemo(() => billingContextForWorkspace(activeWorkspace), [activeWorkspace.id, activeWorkspace.type])
  const contextKey = billingContextKey(context)
  const paymentReturnOrderID = useMemo(() => new URLSearchParams(location.search).get('order_id')?.trim() ?? '', [location.search])
  const [walletState, setWalletState] = useState<{ contextKey: string; wallet: BillingWallet | null; loading: boolean; error: string }>({ contextKey: '', wallet: null, loading: true, error: '' })
  const [walletReloadToken, setWalletReloadToken] = useState(0)
  const [balanceAlertOpen, setBalanceAlertOpen] = useState(false)

  const handleAuthFailure = useCallback(() => {
    dispatch(invalidateAuth())
    navigate('/', { replace: true })
  }, [dispatch, navigate])

  const { state: paymentReturnState, retry: retryPaymentReturn } = usePaymentReturn({ context, orderID: paymentReturnOrderID, onAuthFailure: handleAuthFailure, onSettled: () => setWalletReloadToken((value) => value + 1) })

  useEffect(() => {
    const controller = new AbortController()
    // 钱包状态绑定账务主体；切换时立即隔离旧余额，同一主体刷新可保留已确认数值。
    setWalletState((previous) => ({ contextKey, wallet: previous.contextKey === contextKey ? previous.wallet : null, loading: true, error: '' }))
    void getBillingWallet(context, { signal: controller.signal }).then((response) => {
      if (!controller.signal.aborted) setWalletState({ contextKey, wallet: response.wallet, loading: false, error: '' })
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      if (isAuthenticationFailure(error)) {
        handleAuthFailure()
        return
      }
      setWalletState({ contextKey, wallet: null, loading: false, error: getBillingErrorMessage(error) })
    })
    return () => controller.abort()
  }, [context.account_type, context.enterprise_id, contextKey, handleAuthFailure, walletReloadToken])

  const currentWallet = walletState.contextKey === contextKey ? walletState : { wallet: null, loading: true, error: '' }

  return (
    <div className="page-stack billing-console-page recharge-console-page">
      <PageTitle title={t('console.billing.rechargeRemittance')} actions={<Button className="recharge-alert-button" theme="solid" type="primary" size="small" icon={<IconBellStroked aria-hidden="true" />} onClick={() => setBalanceAlertOpen(true)}>{t('console.billing.balanceAlert')}</Button>} />
      <PaymentReturnNotice state={paymentReturnState} onRetry={retryPaymentReturn} />
      <RechargeNotice />
      <RechargeBalanceCard wallet={currentWallet.wallet} loading={currentWallet.loading} />
      {currentWallet.error ? <div className="recharge-wallet-error" role="alert"><span>{currentWallet.error}</span><Button theme="outline" onClick={() => setWalletReloadToken((value) => value + 1)}>{t('console.common.retry')}</Button></div> : null}
      <div className="recharge-page-tabs" role="tablist" aria-label={t('console.billing.rechargeTabs')}><button className="is-active" type="button" role="tab" aria-selected="true">{t('console.billing.onlineRecharge')}</button></div>
      <RechargeTab key={paymentIntentScope(context, 'recharge') ?? billingContextKey(context)} context={context} onOrderUpdated={() => setWalletReloadToken((value) => value + 1)} onAuthFailure={handleAuthFailure} />
      {/* 工作空间切换时重建分页和请求状态，避免显示上一个主体的充值记录。 */}
      <RechargeHistory key={`history:${billingContextKey(context)}`} context={context} refreshToken={walletReloadToken} onAuthFailure={handleAuthFailure} />
      <BalanceAlertDialog visible={balanceAlertOpen} onClose={() => setBalanceAlertOpen(false)} onAuthFailure={handleAuthFailure} />
    </div>
  )
}

// 说明文字按设计稿拆成强调色与站内链接，避免把整句点击区域做得过大。
function RechargeNotice() {
  const { t } = useTranslation()
  return <section className="recharge-notice" aria-label={t('console.billing.rechargeNotice')}><span className="recharge-notice-icon" aria-hidden="true">i</span><div className="recharge-notice-body"><ol><li><span className="recharge-notice-emphasis">{t('console.billing.rechargeNoticeInvoiceWarning')}</span>{t('console.billing.rechargeNoticeInvoicePrefix')}<Link to="/console/billing?tab=invoice">{t('console.billing.rechargeNoticeInvoiceLink')}</Link>{t('console.billing.rechargeNoticeInvoiceSuffix')}</li><li>{t('console.billing.rechargeNoticeBalancePrefix')}<Link to="/console/billing#billingLedgerHeading">{t('console.billing.rechargeNoticeLedgerLink')}</Link>{t('console.billing.rechargeNoticeLedgerSuffix')}</li></ol></div></section>
}

function RechargeBalanceCard({ wallet, loading }: { wallet: BillingWallet | null; loading: boolean }) {
  const { t } = useTranslation()
  const displayAmount = (value: string | undefined): string => {
    // 未加载或失败不代表余额为零，避免用户据此作出错误充值判断。
    if (value === undefined) return '—'
    // 充值余额卡与费用中心统一保留 4 位小数，同时维持原有无千位分隔的版式。
    return formatYuan(value ?? '0', BACKOFFICE_MONEY_DISPLAY_DECIMAL_PLACES).replace(/^¥/, '').replaceAll(',', '')
  }
  return <section className="recharge-balance-card" aria-label={t('console.billing.availableBalance')} aria-busy={loading}><div className="recharge-balance-label"><span className="recharge-balance-icon" aria-hidden="true">¥</span>{t('console.billing.availableBalance')}</div><div className="recharge-balance-summary"><div className="recharge-balance-value">¥{displayAmount(wallet?.total_available_yuan)}</div><div className="recharge-balance-facts"><span className="recharge-balance-fact"><span className="recharge-balance-fact-label">{t('console.billing.cashBalance')}<Tooltip className="app-info-tooltip" content={t('console.billing.rechargeBalanceHint')} position="top"><IconHelpCircleStroked className="recharge-balance-help" aria-label={t('console.billing.rechargeBalanceHint')} /></Tooltip>：</span><strong>¥{displayAmount(wallet?.paid_available_yuan)}</strong></span><span className="recharge-balance-separator" aria-hidden="true">−</span><span className="recharge-balance-fact"><span className="recharge-balance-fact-label">{t('console.billing.debtBalance')}：</span><strong>¥{displayAmount(wallet?.debt_yuan)}</strong></span></div></div></section>
}
