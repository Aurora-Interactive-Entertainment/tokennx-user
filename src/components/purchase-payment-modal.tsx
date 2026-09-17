import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type HTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import type { BillingContext } from "@/api/billing";
import { isPaymentActive, isPaymentSettled } from "@/api/payment-flow";
import Spin from "@douyinfe/semi-ui/lib/es/spin";
import { IconRefresh } from "@douyinfe/semi-icons";
import { PaymentQRCode } from "./payment-qr-code";
import { PaymentQRCodeFrame } from "./payment-qr-frame";
import { PurchaseVerificationGate } from "./purchase-verification-gate";
import RechargeAgreementModal from "./recharge-agreement-modal";
import { usePlanPayment } from "./use-plan-payment";
import AppModal from "@/components/app-modal";
import { appToast } from "@/components/app-toast";
import wechatIcon from "@/assets/payment-icons/wechat-pay.svg";
import alipayIcon from "@/assets/payment-icons/alipay.svg";
import "./purchase-payment-modal.css";
import "./purchase-modal-motion.css";

interface PurchasePaymentProps {
  open: boolean;
  planName: string;
  planID?: string;
  context?: BillingContext;
  priceCent?: string | number;
  validitySeconds?: number;
  onClose: () => void;
  // 关闭全部相关弹窗（含底层的套餐弹窗），跳转认证页等整页离开场景使用。
  onCloseAll?: () => void;
  onPaid?: () => void;
  onAuthFailure?: () => void;
}

export function PurchasePaymentModal(props: PurchasePaymentProps) {
  // 每个商品和主体独立管理支付会话，关闭后停止旧请求和查单。
  return props.open ? (
    <PurchaseVerificationGate
      key={`${props.context?.account_type}:${props.context?.enterprise_id}:${props.planID}`}
      onClose={props.onCloseAll ?? props.onClose}
      onAuthFailure={props.onAuthFailure}
      context={props.context}
    >
      {(onRealNameRequired) => <PurchasePaymentContent {...props} onRealNameRequired={onRealNameRequired} />}
    </PurchaseVerificationGate>
  ) : null;
}

function PurchasePaymentContent({
  open,
  planName,
  priceCent,
  validitySeconds,
  onClose,
  planID,
  context = { account_type: "personal" },
  onPaid,
  onAuthFailure,
  onRealNameRequired,
}: PurchasePaymentProps & { onRealNameRequired: () => void }) {
  const { t } = useTranslation();
  const [closing, setClosing] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const payment = usePlanPayment(context, planID, onPaid, onAuthFailure);
  const copy = "console.purchasePage.paymentModal";
  const paidNotified = useRef(false);
  useEffect(() => {
    if (payment.error) appToast.error(payment.error);
  }, [payment.error]);
  useEffect(() => {
    // 入账后弹窗会自动关闭，成功提示必须在这一刻给出，否则用户只看到弹窗无声消失。
    // 查单会反复下发同一个已入账订单，用 ref 保证一次购买只提示一次。
    if (paidNotified.current || !payment.order || !isPaymentSettled(payment.order))
      return;
    paidNotified.current = true;
    appToast.success(t(`${copy}.paidNotice`));
  }, [payment.order, t]);
  useEffect(() => {
    // 订单确认入账（paid_at 已回）后自动关闭支付弹窗：买完不该再留一个需要手动关闭的弹窗。
    // 已支付但尚未到账时继续查单，等入账确认后再关闭，避免提前切断状态确认。
    if (!closing && !payment.busy && payment.order && isPaymentSettled(payment.order))
      void payment.close(() => setClosing(true));
  }, [payment.order, payment.busy, closing]);
  useEffect(() => {
    // 服务端再次要求实名时卸载支付会话，认证提示下面不保留支付弹窗或查单任务。
    if (payment.realNameRequired) onRealNameRequired();
  }, [payment.realNameRequired, onRealNameRequired]);
  const radioName = useId();
  const { method, agreed } = payment;
  const isPlan = ["miniMax", "deepSeek", "seedance", "kimi", "glm"].includes(
    planName,
  );
  const displayName = isPlan
    ? t(`console.purchasePage.plans.${planName}.name`)
    : planName;
  // 金额沿用所选套餐价格，避免所有套餐都错误地显示固定 30 元。
  const rawPriceCent = String(priceCent ?? "").trim();
  const normalizedPriceCent = /^\d+$/.test(rawPriceCent)
    ? rawPriceCent.replace(/^0+(?=\d)/, "")
    : "";
  const apiPrice = normalizedPriceCent
    ? `¥${normalizedPriceCent.length > 2 ? normalizedPriceCent.slice(0, -2) : "0"}.${normalizedPriceCent.slice(-2).padStart(2, "0")}`
    : "";
  const price = payment.order
    ? `¥${payment.order.amount_yuan}`
    : apiPrice ||
      (isPlan ? t(`console.purchasePage.plans.${planName}.price`) : "—");
  const validityDays =
    validitySeconds && validitySeconds > 0
      ? Math.max(1, Math.ceil(validitySeconds / 86400))
      : 30;
  return (
    <>
      <AppModal
        className="purchase-payment-modal"
        visible={open && !payment.realNameRequired && !closing}
        motion
        zIndex={1000}
        title={null}
        footer={null}
        // 保留组件直到退场动画完成，避免父组件立即卸载导致关闭生硬。
        onCancel={() => { if (!closing) void payment.close(() => setClosing(true)); }}
        afterClose={() => { if (closing) onClose(); }}
        closeOnEsc={!agreementOpen && !closing && !payment.busy && !payment.realNameRequired}
        maskClosable={false}
        closable={!payment.busy}
        width={520}
        aria-label={t(`${copy}.title`)}
        // 阅读协议时保留底层支付会话，但让键盘和读屏只访问最上层弹窗。
        modalRender={(node) => isValidElement<HTMLAttributes<HTMLDivElement>>(node)
          ? cloneElement(node, { inert: agreementOpen, "aria-hidden": agreementOpen || undefined })
          : node}
      >
        <div className="purchase-payment-content">
          <h2>{t(`${copy}.title`)}</h2>
          <div className="purchase-payment-columns">
            <dl className="purchase-payment-summary">
              <div>
                <dt>{t(`${copy}.plan`)}</dt>
                <dd>{displayName}</dd>
              </div>
              <div>
                <dt>{t(`${copy}.validity`)}</dt>
                <dd>{t(`${copy}.days`, { count: validityDays })}</dd>
              </div>
              <div className="purchase-payment-total">
                <dt>{t(`${copy}.amount`)}</dt>
                <dd>{price}</dd>
              </div>
            </dl>
            <div className="purchase-payment-methods">
              <div className="purchase-payment-scan-title">
                <strong>{t(`${copy}.scan`)}</strong>
                <img src={alipayIcon} alt={t(`${copy}.alipay`)} />
                <img src={wechatIcon} alt={t(`${copy}.wechat`)} />
              </div>
              <div className="purchase-payment-qr" aria-busy={agreed && payment.busy}>
                {!agreed ? (
                  <span className="purchase-payment-consent" role="status">{t(`${copy}.agreementRequired`)}</span>
                ) : payment.busy ? (
                  <div className="purchase-payment-loading" role="status"><Spin size="large" /><span>{t(`${copy}.processing`)}</span></div>
                ) : payment.timedOut ? (
                  <div className="purchase-payment-loading">
                    <span role="status">{t("console.billing.paymentStatusUnknown")}</span>
                    <button type="button" className="purchase-payment-qr-refresh" aria-label={t(`${copy}.refresh`)} title={t(`${copy}.refresh`)} onClick={payment.refresh} disabled={payment.querying}><IconRefresh aria-hidden="true" /></button>
                  </div>
                ) : payment.order?.status !== "paid" && payment.active && payment.qr ? (
                  <PaymentQRCode
                    value={payment.qr}
                    title={t(`${copy}.scan`)}
                    errorMessage={t(method === "wechat" ? "api.billing.wechatQRCodeInvalid" : "api.billing.paymentFormInvalid")}
                    onError={payment.handleError}
                  />
                ) : payment.order?.status !== "paid" && payment.active && payment.form ? (
                  <PaymentQRCodeFrame
                    formHTML={payment.form}
                    title={t(`${copy}.scan`)}
                    errorMessage={t("api.billing.paymentFormInvalid")}
                    // 与下单、发起支付共用同一句加载文案，二维码页面加载完成前不出现空白区域。
                    loadingLabel={t(`${copy}.processing`)}
                    onError={payment.handleError}
                  />
                ) : payment.order?.status !== "paid" && !payment.blocked && (!payment.order || isPaymentActive(payment.order.status)) ? (
                  // 订单没建出来（下单失败）或建出来了却拿不到二维码/表单（发起支付失败）：
                  // 都必须给出明确的重试入口，否则界面只剩一句状态文案，用户无路可走。
                  // 重试沿用同一个支付幂等键：上一次没有创建成功，同键重试才是补上那次调用。
                  <button
                    type="button"
                    className="purchase-payment-qr-refresh"
                    aria-label={t(`${copy}.retry`)}
                    title={t(`${copy}.retry`)}
                    // 只跟 busy：查单在途时 querying 为真，若一并禁用会让按钮点不动。
                    disabled={payment.busy}
                    onClick={() => void payment.start()}
                  >
                    <IconRefresh aria-hidden="true" />
                  </button>
                ) : payment.order ? (
                  <span role="status">
                    {payment.order.status === "paid" && payment.order.paid_at
                      ? t(`${copy}.paid`)
                      : t(
                          `console.billing.paymentStatus${payment.order.status === "paid" && !payment.order.paid_at ? "Unknown" : payment.order.status.charAt(0).toUpperCase() + payment.order.status.slice(1)}`,
                        )}
                  </span>
                ) : <span>{t(`${copy}.qrUnavailable`)}</span>}
              </div>
              <fieldset
                className="purchase-payment-options"
                aria-label={t(`${copy}.method`)}
                disabled={payment.busy || payment.blocked || Boolean(payment.order && !isPaymentActive(payment.order.status))}
              >
                {[
                  { key: "wechat", icon: wechatIcon },
                  { key: "alipay", icon: alipayIcon },
                ].map((item) => (
                  <label
                    key={item.key}
                    className={method === item.key ? "is-selected" : undefined}
                  >
                    <input
                      type="radio"
                      name={radioName}
                      value={item.key}
                      checked={method === item.key}
                      onChange={() => void payment.selectMethod(item.key as "wechat" | "alipay")}
                    />
                    <img src={item.icon} alt="" aria-hidden="true" />
                    <strong>{t(`${copy}.${item.key}`)}</strong>
                  </label>
                ))}
              </fieldset>
              <div className="purchase-payment-agreement">
                <label>
                  <input
                    type="checkbox"
                    checked={agreed}
                    disabled={payment.blocked || payment.consentLocked || closing || Boolean(payment.order && isPaymentSettled(payment.order))}
                    onChange={(event) => void payment.setAgreed(event.target.checked)}
                  />
                  {t(`${copy}.readAgreement`)}
                </label>
                <button type="button" className="purchase-payment-agreement-link" onClick={() => setAgreementOpen(true)}>
                  {t(`${copy}.agreement`)}
                </button>
              </div>
            </div>
          </div>
        </div>
      </AppModal>
      {agreementOpen && <RechargeAgreementModal open onClose={() => setAgreementOpen(false)} />}
    </>
  );
}
