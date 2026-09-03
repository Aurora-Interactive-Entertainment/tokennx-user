import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Tooltip from '@douyinfe/semi-ui/lib/es/tooltip'
import { IconBellStroked, IconHelpCircleStroked } from '@douyinfe/semi-icons'
import Modal from '@/components/app-modal'
import { PageTitle } from '@/components/common'
import { getBillingErrorMessage, getBillingPaymentOrder, getBillingRequestId, getBillingWallet, type BillingPaymentOrder, type BillingWallet } from '@/api/billing'
import { isAuthenticationFailure } from '@/api/http'
import { BalanceAlertDialog } from '@/components/balance-alert-dialog'
import { appToast as Toast } from '@/components/app-toast'
import { useAppStore } from '@/data/app-state'
import { invalidateAuth } from '@/store/auth-slice'
import { useAppDispatch } from '@/store/hooks'
import { billingContextForWorkspace, billingContextKey, PaymentReturnNotice, RechargeTab, type ResourceState } from './billing'
import { CompatInput as Input } from '@/components/semi-compat'
import './recharge.css'

export function RechargePage() {
  const { t } = useTranslation()
  const store = useAppStore()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const activeWorkspace = store.activeWorkspace
  const context = useMemo(() => billingContextForWorkspace(activeWorkspace), [activeWorkspace.id, activeWorkspace.type])
  const subscriptionPath = activeWorkspace.type === 'enterprise' ? '/console/trae-enterprise/subscription' : '/console/subscription'
  const paymentReturnOrderID = useMemo(() => new URLSearchParams(location.search).get('order_id')?.trim() ?? '', [location.search])
  const [paymentReturnState, setPaymentReturnState] = useState<ResourceState<BillingPaymentOrder>>({ status: 'idle', data: null, error: '', requestId: null })
  const [paymentReturnRetryToken, setPaymentReturnRetryToken] = useState(0)
  const [noticeExpanded, setNoticeExpanded] = useState(true)
  const [wallet, setWallet] = useState<BillingWallet | null>(null)
  const [walletReloadToken, setWalletReloadToken] = useState(0)
  const [balanceAlertOpen, setBalanceAlertOpen] = useState(false)

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
    // 中文：支付回跳查单沿用当前账务主体，企业订单不能落到个人接口。
    void getBillingPaymentOrder(paymentReturnOrderID, { signal: controller.signal }, context).then((order) => {
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
  }, [context.account_type, context.enterprise_id, handleAuthFailure, paymentReturnOrderID, paymentReturnRetryToken])

  useEffect(() => {
    const controller = new AbortController()
    // 中文：余额卡片读取当前账务主体的钱包，支付到账后只刷新展示，不改变支付链路。
    void getBillingWallet(context, { signal: controller.signal }).then((response) => {
      if (!controller.signal.aborted) setWallet(response.wallet)
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      if (isAuthenticationFailure(error)) handleAuthFailure()
    })
    return () => controller.abort()
  }, [context.account_type, context.enterprise_id, handleAuthFailure, walletReloadToken])

  return (
    <div className="page-stack billing-console-page recharge-console-page">
      <PageTitle title={t('console.billing.rechargeRemittance')} actions={<Button className="recharge-alert-button" theme="solid" type="primary" size="small" icon={<IconBellStroked aria-hidden="true" />} onClick={() => setBalanceAlertOpen(true)}>{t('console.billing.balanceAlert')}</Button>} />
      <PaymentReturnNotice state={paymentReturnState} onRetry={() => setPaymentReturnRetryToken((value) => value + 1)} />
      <RechargeNotice expanded={noticeExpanded} subscriptionPath={subscriptionPath} onToggle={() => setNoticeExpanded((value) => !value)} />
      <RechargeBalanceCard wallet={wallet} />
      <div className="recharge-page-tabs" role="tablist" aria-label={t('console.billing.rechargeTabs')}><button className="is-active" type="button" role="tab" aria-selected="true">{t('console.billing.onlineRecharge')}</button></div>
      <RechargeTab key={billingContextKey(context)} context={context} onOrderUpdated={() => setWalletReloadToken((value) => value + 1)} onAuthFailure={handleAuthFailure} />
      <BalanceAlertDialog visible={balanceAlertOpen} onClose={() => setBalanceAlertOpen(false)} onAuthFailure={handleAuthFailure} />
    </div>
  )
}

// 中文：说明文字按设计稿拆成强调色与站内链接，避免把整句点击区域做得过大。
function RechargeNotice({ expanded, subscriptionPath, onToggle }: { expanded: boolean; subscriptionPath: string; onToggle: () => void }) {
  const { t } = useTranslation()
  return <section className={`recharge-notice${expanded ? ' is-expanded' : ''}`} aria-label={t('console.billing.rechargeNotice')}><span className="recharge-notice-icon" aria-hidden="true">i</span><div className="recharge-notice-body"><ol><li><span className="recharge-notice-emphasis">{t('console.billing.rechargeNoticeInvoiceWarning')}</span>{t('console.billing.rechargeNoticeInvoicePrefix')}<Link to="/console/billing?tab=invoice">{t('console.billing.rechargeNoticeInvoiceLink')}</Link>{t('console.billing.rechargeNoticeInvoiceSuffix')}</li>{expanded ? <><li>{t('console.billing.rechargeNoticeBalancePrefix')}<Link to="/console/billing">{t('console.billing.rechargeNoticeWithdrawLink')}</Link>{t('console.billing.rechargeNoticeOr')}<Link to="/console/billing#billingLedgerHeading">{t('console.billing.rechargeNoticeLedgerLink')}</Link>{t('console.billing.rechargeNoticeLedgerSuffix')}</li><li><span className="recharge-notice-emphasis">{t('console.billing.rechargeNoticeRenewWarning')}</span>{t('console.billing.rechargeNoticeRenewPrefix')}<Link to={subscriptionPath}>{t('console.billing.rechargeNoticeRenewLink')}</Link>{t('console.billing.rechargeNoticeRenewSuffix')}</li></> : null}</ol><button type="button" className="recharge-notice-toggle" onClick={onToggle}>{expanded ? t('console.billing.collapseMore') : t('console.billing.expandMore')}</button></div></section>
}

function RechargeBalanceCard({ wallet }: { wallet: BillingWallet | null }) {
  const { t } = useTranslation()
  const displayAmount = (value: string | undefined): string => Number(value ?? 0).toFixed(2)
  return <section className="recharge-balance-card" aria-label={t('console.billing.availableBalance')}><div className="recharge-balance-label"><span className="recharge-balance-icon" aria-hidden="true">¥</span>{t('console.billing.availableBalance')}</div><div className="recharge-balance-summary"><div className="recharge-balance-value">¥{displayAmount(wallet?.total_available_yuan)}</div><div className="recharge-balance-facts"><span className="recharge-balance-fact"><span className="recharge-balance-fact-label">{t('console.billing.cashBalance')}<Tooltip className="app-info-tooltip" content={t('console.billing.rechargeBalanceHint')} position="top"><IconHelpCircleStroked className="recharge-balance-help" aria-label={t('console.billing.rechargeBalanceHint')} /></Tooltip>：</span><strong>¥{displayAmount(wallet?.paid_available_yuan)}</strong></span><span className="recharge-balance-separator" aria-hidden="true">−</span><span className="recharge-balance-fact"><span className="recharge-balance-fact-label">{t('console.billing.debtBalance')}：</span><strong>¥{displayAmount(wallet?.debt_yuan)}</strong></span></div></div></section>
}
