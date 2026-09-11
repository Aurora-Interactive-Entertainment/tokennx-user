import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { getRealNameErrorMessage, getRealNameProfile } from "@/api/real-name";
import { isAuthenticationFailure } from "@/api/http";
import { getAccessToken } from "@/auth/token-storage";
import type { BillingContext } from "@/api/billing";
import { appToast } from "./app-toast";
import { RealNameRequiredDialog } from "./real-name-required-dialog";

interface PurchaseVerificationGateProps {
  onClose: () => void;
  onAuthFailure?: () => void;
  context?: BillingContext;
  children: (onRealNameRequired: () => void) => ReactNode;
}

// 个人购买预查个人实名；企业认证及 billing.operate 权限由下单接口按企业主体校验。
export function PurchaseVerificationGate({ onClose, onAuthFailure, context, children }: PurchaseVerificationGateProps) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "required" | "verified" | "closed">("checking");
  const [checking, setChecking] = useState(true);
  const [retry, setRetry] = useState(0);
  const dismissed = useRef(false);
  const callbacks = useRef({ onClose, onAuthFailure });
  callbacks.current = { onClose, onAuthFailure };
  const requireRealName = useCallback(() => setStatus("required"), []);

  useEffect(() => {
    let cancelled = false;
    const close = () => {
      setStatus("closed");
      callbacks.current.onClose();
    };
    const check = async () => {
      try {
        const accessToken = getAccessToken();
        if (!accessToken) {
          // 登录失效应交给登录流程处理，不能把未知状态当成已实名。
          setStatus("closed");
          (callbacks.current.onAuthFailure ?? callbacks.current.onClose)();
          return;
        }
        if (context?.account_type === "enterprise") {
          setStatus("verified");
          return;
        }
        const profile = await getRealNameProfile(accessToken);
        if (!cancelled && !dismissed.current) setStatus(profile.status === "verified" ? "verified" : "required");
      } catch (error) {
        if (cancelled || dismissed.current) return;
        if (isAuthenticationFailure(error) && callbacks.current.onAuthFailure) {
          setStatus("closed");
          callbacks.current.onAuthFailure();
        } else {
          appToast.error(getRealNameErrorMessage(error));
          // 首次查询失败结束本次购买；重新查询失败则保留认证提示，允许再次检查。
          if (retry === 0) close();
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    void check();
    return () => { cancelled = true; };
  }, [retry, context?.account_type]);

  if (status === "verified") return children(requireRealName);
  if (status !== "required") return null;
  const close = () => {
    // 关闭后忽略尚未返回的复查结果，避免慢请求重新唤起支付。
    dismissed.current = true;
    setStatus("closed");
    onClose();
  };
  return (
    <RealNameRequiredDialog
      visible
      checking={checking}
      onCancel={close}
      onCompleted={() => {
        if (checking) return;
        setChecking(true);
        setRetry((value) => value + 1);
      }}
      onVerify={() => {
        close();
        navigate("/console/real-name");
      }}
    />
  );
}
