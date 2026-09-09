import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import AppModal from "@/components/app-modal";
import wechatIcon from "@/assets/payment-icons/wechat-pay.svg";
import alipayIcon from "@/assets/payment-icons/alipay.svg";
import "./purchase-payment-modal.css";

export function PurchasePaymentModal({
  open,
  planName,
  onClose,
}: {
  open: boolean;
  planName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const radioName = useId();
  const [method, setMethod] = useState("wechat");
  const [agreed, setAgreed] = useState(false);
  const copy = "console.purchasePage.paymentModal";
  const isPlan = ["miniMax", "deepSeek", "seedance", "kimi", "glm"].includes(
    planName,
  );
  const displayName = isPlan
    ? t(`console.purchasePage.plans.${planName}.name`)
    : planName;
  // 金额沿用所选套餐价格，避免所有套餐都错误地显示固定 30 元。
  const price = isPlan
    ? t(`console.purchasePage.plans.${planName}.price`)
    : "—";
  useEffect(() => {
    if (open) {
      setMethod("wechat");
      setAgreed(false);
    }
  }, [open, planName]);
  return (
    <AppModal
      className="purchase-payment-modal"
      visible={open}
      title={null}
      footer={null}
      onCancel={onClose}
      closable
      width={410}
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
              <dd>{t(`${copy}.days`, { count: 30 })}</dd>
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
            {/* 尚无套餐订单二维码接口，保留设计稿占位，不展示虚假的可支付二维码。 */}
            <div
              className="purchase-payment-qr"
              role="img"
              aria-label={t(`${copy}.qrUnavailable`)}
            />
            <fieldset
              className="purchase-payment-options"
              aria-label={t(`${copy}.method`)}
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
                    onChange={() => setMethod(item.key)}
                  />
                  <img src={item.icon} alt="" aria-hidden="true" />
                  <strong>{t(`${copy}.${item.key}`)}</strong>
                  {item.key === "wechat" && (
                    <small>{t(`${copy}.recommended`)}</small>
                  )}
                </label>
              ))}
            </fieldset>
            <div className="purchase-payment-agreement">
              <label>
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                />
                {t(`${copy}.readAgreement`)}
              </label>
              <Link to="/recharge-agreement" target="_blank" rel="noreferrer">
                {t(`${copy}.agreement`)}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AppModal>
  );
}
