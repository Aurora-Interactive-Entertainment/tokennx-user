import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { appToast } from "./app-toast";
import type { BillingContext } from "@/api/billing";
import { PaymentQRCode } from "./payment-qr-code";
import { PaymentQRCodeFrame } from "./payment-qr-frame";
import { PurchaseVerificationGate } from "./purchase-verification-gate";
import { usePlanPayment } from "./use-plan-payment";
import AppModal from "@/components/app-modal";
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
  guestDebug?: boolean;
}

export function PurchasePaymentModal(props: PurchasePaymentProps) {
  // 每个商品和主体独立管理支付会话，关闭后停止旧请求和查单。
  return props.open ? (
    <PurchaseVerificationGate
      key={`${props.context?.account_type}:${props.context?.enterprise_id}:${props.planID}`}
      onClose={props.onCloseAll ?? props.onClose}
      onAuthFailure={props.onAuthFailure}
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
  guestDebug = false,
  onRealNameRequired,
}: PurchasePaymentProps & { onRealNameRequired: () => void }) {
  const { t } = useTranslation();
  const [closing, setClosing] = useState(false);
  const payment = usePlanPayment(context, planID, onPaid, onAuthFailure, guestDebug);
  useEffect(() => {
    // 服务端再次要求实名时卸载支付会话，认证提示下面不保留支付弹窗或查单任务。
    if (payment.realNameRequired) onRealNameRequired();
  }, [payment.realNameRequired, onRealNameRequired]);
  // 公开入口临时联调直接下单；正式购买改由勾选协议触发，无需额外确认按钮。
  useEffect(() => {
    if (guestDebug) void payment.start();
  }, []);
  useEffect(() => {
    // 调试阶段的接口错误不占用设计稿布局，正式流程仍通过全局提示反馈。
    if (payment.error && !guestDebug) appToast.error(payment.error);
  }, [payment.error, guestDebug]);
  const radioName = useId();
  const [method, setMethod] = useState("alipay");
  const [agreed, setAgreed] = useState(false);
  const copy = "console.purchasePage.paymentModal";
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
  useEffect(() => {
    if (open) {
      setMethod("alipay");
      setAgreed(false);
    }
  }, [open, planName]);
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
        closeOnEsc={!closing && !payment.busy && !payment.realNameRequired}
        maskClosable={false}
        closable={!payment.busy}
        width={520}
        aria-label={t(`${copy}.title`)}
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
              <div className="purchase-payment-qr">
                {payment.active && payment.qr ? (
                  <PaymentQRCode
                    value={payment.qr}
                    title={t(`${copy}.scan`)}
                    errorMessage={t("api.billing.paymentFormInvalid")}
                    onError={payment.handleError}
                  />
                ) : payment.active && payment.form ? (
                  <PaymentQRCodeFrame
                    formHTML={payment.form}
                    title={t(`${copy}.scan`)}
                    errorMessage={t("api.billing.paymentFormInvalid")}
                    onError={payment.handleError}
                  />
                ) : payment.order ? (
                  <span role="status">
                    {payment.order
                      ? t(
                          `console.billing.paymentStatus${payment.order.status === "paid" && !payment.order.paid_at ? "Unknown" : payment.order.status.charAt(0).toUpperCase() + payment.order.status.slice(1)}`,
                        )
                      : t(`${copy}.qrUnavailable`)}
                  </span>
                ) : null}
              </div>
              <fieldset
                className="purchase-payment-options"
                aria-label={t(`${copy}.method`)}
                disabled={payment.busy || Boolean(payment.order)}
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
                      disabled={item.key === "wechat"}
                      onChange={() => setMethod(item.key)}
                    />
                    <img src={item.icon} alt="" aria-hidden="true" />
                    <strong>{t(`${copy}.${item.key}`)}</strong>
                    {item.key === "wechat" && (
                      <small>{t(`${copy}.unavailable`)}</small>
                    )}
                  </label>
                ))}
              </fieldset>
              <div className="purchase-payment-agreement">
                <label>
                  <input
                    type="checkbox"
                    checked={agreed}
                    disabled={payment.busy || Boolean(payment.order)}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setAgreed(checked);
                      if (checked && !payment.order) void payment.start();
                    }}
                  />
                  {t(`${copy}.readAgreement`)}
                </label>
                <Link to="/recharge-agreement" target="_blank" rel="noreferrer">
                  {t(`${copy}.agreement`)}
                </Link>
              </div>
            </div>
          </div>
          {payment.order && (
            <p className="purchase-payment-status" role="status">
              {t("console.billing.paymentReturnOrder", {
                orderNo: payment.order.order_no,
              })}
            </p>
          )}
        </div>
      </AppModal>
    </>
  );
}
