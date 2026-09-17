import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isUserProductPlan, type CatalogPlan, type ProductPlanSummary } from '@/api/product-plans'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { invalidateAuth } from '@/store/auth-slice'
import { closePurchaseLogin, consumePurchaseIntent, requestPurchaseLogin } from '@/store/purchase-intent-slice'
import { LoginDialog } from './common'
import { appToast } from './app-toast'
import { usePurchaseCatalog } from './use-purchase-catalog'
import { PurchaseHoverMenu } from './purchase-hover-menu'
import { PurchaseSubscriptionModal } from './purchase-subscription-modal'
import { PurchasePaymentModal } from './purchase-payment-modal'
import type { BillingContext } from '@/api/billing'
import { notifyPurchasedPlansChanged } from '@/api/purchased-plan-updates'

// 顶部入口在页面挂载时预加载，弹窗只消费同一份目录，不重复请求。
export function HeaderPurchase({ inviteCode, context = { account_type: 'personal' } }: { inviteCode?: string; context?: BillingContext }) {
  const { t } = useTranslation()
  const auth = useAppSelector(state => state.auth)
  const dispatch = useAppDispatch()
  const userKey = auth.status === 'authenticated' && auth.user ? `${auth.user.id}:${auth.loginSequence}` : null
  // 顶部弹窗与控制台使用同一账务主体，企业空间不能误查个人套餐目录。
  const catalog = usePurchaseCatalog(userKey, context)
  const { loginPlanID, resume } = useAppSelector(state => state.purchaseIntent)
  const [open, setOpen] = useState(Boolean(loginPlanID || resume))
  const [selected, setSelected] = useState<{ scope: string; plan: ProductPlanSummary } | null>(null)
  const paymentPlan = selected?.scope === catalog.scope ? selected.plan : null

  useEffect(() => {
    setSelected(null)
  }, [catalog.scope])

  useEffect(() => {
    if (!resume || !userKey || catalog.loading) return
    if (resume.userID !== auth.user?.id) { dispatch(consumePurchaseIntent()); return }
    const plan = catalog.plans.find(item => item.id === resume.planID)
    dispatch(consumePurchaseIntent())
    setOpen(true)
    // 登录后按公开 ID 重新匹配用户列表；下架、售罄、限购及新价格均以新列表为准。
    if (!catalog.error && plan && isUserProductPlan(plan) && plan.can_purchase === true) {
      setSelected({ scope: catalog.scope, plan })
    } else if (!catalog.error) {
      appToast.warning(t('console.purchasePage.api.unavailable'))
    }
  }, [resume, userKey, auth.user?.id, catalog.loading, catalog.error, catalog.plans, catalog.scope, dispatch, t])

  function selectPlan(plan: CatalogPlan) {
    if (catalog.loading || catalog.error) return
    if (!userKey) { dispatch(requestPurchaseLogin(plan.id)); return }
    if (isUserProductPlan(plan) && plan.can_purchase === true) setSelected({ scope: catalog.scope, plan })
  }

  return <>
    <PurchaseHoverMenu onSelect={() => setOpen(true)} />
    <PurchaseSubscriptionModal open={open} onClose={() => setOpen(false)} plans={catalog.plans} loading={catalog.loading} error={catalog.error} onRetry={catalog.reload}
      onPlanSelect={selectPlan} covered={Boolean(paymentPlan || loginPlanID || resume)} />
    <LoginDialog open={loginPlanID !== null && !userKey && auth.status !== 'loading'} dialogId="purchase-login-dialog" inviteCode={inviteCode}
      onClose={() => dispatch(closePurchaseLogin())}
      onSuccess={() => { /* 登录成功由全局购买意图接续，避免页面重挂载后回调失效。 */ }} />
    <PurchasePaymentModal open={Boolean(paymentPlan)} context={context} planID={paymentPlan?.id} planName={paymentPlan?.display_name || paymentPlan?.name || ''}
      priceCent={paymentPlan?.price.price_cent} validitySeconds={paymentPlan?.price.validity_seconds}
      onClose={() => setSelected(null)} onCloseAll={() => { setSelected(null); setOpen(false) }} onPaid={() => {
        catalog.reload()
        notifyPurchasedPlansChanged(auth.user?.id, context)
      }}
      onAuthFailure={() => { setSelected(null); dispatch(invalidateAuth()); if (paymentPlan) dispatch(requestPurchaseLogin(paymentPlan.id)) }} />
  </>
}
