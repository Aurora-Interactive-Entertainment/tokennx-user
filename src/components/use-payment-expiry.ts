import { useEffect, useState } from "react";
import { paymentDeadline } from "@/api/payment-flow";

export function usePaymentExpiry(
  orderExpiresAt: unknown,
  transactionExpiresAt: unknown,
) {
  const deadline = paymentDeadline(orderExpiresAt, transactionExpiresAt);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // 仅使过期载体失效，不能把本地时钟推断当作服务端订单的最终状态。
    const update = () => {
      const current = Date.now();
      setNow(current);
      if (deadline !== null && current < deadline)
        timer = setTimeout(update, Math.min(2_147_483_647, deadline - current));
    };
    update();
    return () => clearTimeout(timer);
  }, [deadline]);
  return {
    deadline,
    expired: deadline !== null && Math.max(now, Date.now()) >= deadline,
  };
}
