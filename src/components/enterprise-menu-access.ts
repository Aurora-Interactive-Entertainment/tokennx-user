import { useEffect, useState } from "react";
import { getAccessToken } from "@/auth/token-storage";
import { getEnterpriseContext } from "@/api/enterprise-console";
import { isAuthenticationFailure } from "@/api/http";
import { useAppDispatch } from "@/store/hooks";
import { invalidateAuth } from "@/store/auth-slice";
import { useNavigate } from "react-router";
import type { Workspace } from "@/data/app-state";

// 中文：菜单只关心资源前缀，具体动作由企业角色权限矩阵继续控制。
export const ENTERPRISE_MENU_PERMISSION_PREFIXES = {
  members: ["members."],
  usage: ["usage."],
  audit: ["audit."],
  analytics: ["analytics."],
  billing: ["billing."],
  settings: ["settings."],
  models: ["models."],
  governance: ["roles.", "tags."],
} as const;

export type EnterpriseMenuPermissionKey =
  keyof typeof ENTERPRISE_MENU_PERMISSION_PREFIXES;

type EnterpriseMenuAccessState = {
  enterpriseID: string;
  loading: boolean;
  permissions: string[];
};

export type EnterpriseMenuAccess = {
  loading: boolean;
  permissions: readonly string[];
};

const ENTERPRISE_MENU_PATH_SCOPES: readonly {
  path: string;
  scope: EnterpriseMenuPermissionKey;
}[] = [
  { path: "/console/enterprise-settings", scope: "settings" },
  { path: "/console/enterprise-models", scope: "models" },
  { path: "/console/enterprise-governance", scope: "governance" },
  { path: "/console/enterprise-analytics", scope: "analytics" },
  { path: "/console/enterprise-audit-log", scope: "audit" },
  { path: "/console/enterprise-records", scope: "audit" },
  { path: "/console/enterprise-usage", scope: "usage" },
  { path: "/console/members", scope: "members" },
  { path: "/console/billing", scope: "billing" },
];

export function isEnterpriseOwner(
  workspace: Pick<Workspace, "type" | "role">,
): boolean {
  return (
    workspace.type === "enterprise" &&
    workspace.role.trim().toLowerCase() === "owner"
  );
}

export function hasEnterpriseMenuPermission(
  permissionCodes: readonly string[],
  scope: EnterpriseMenuPermissionKey,
): boolean {
  const prefixes = ENTERPRISE_MENU_PERMISSION_PREFIXES[scope];
  return prefixes.some((prefix) =>
    permissionCodes.some((permission) => permission.startsWith(prefix)),
  );
}

export function enterpriseMenuPermissionKeyForPath(
  pathname: string,
): EnterpriseMenuPermissionKey | null {
  const match = ENTERPRISE_MENU_PATH_SCOPES.find(
    ({ path }) => pathname === path || pathname.startsWith(`${path}/`),
  );
  return match?.scope ?? null;
}

function normalizePermissions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((permission) =>
          typeof permission === "string" ? permission.trim() : "",
        )
        .filter(Boolean),
    ),
  ];
}

function initialAccessState(
  workspace: Pick<Workspace, "type" | "id" | "role">,
): EnterpriseMenuAccessState {
  const enterpriseID =
    workspace.type === "enterprise" ? workspace.id.trim() : "";
  return {
    enterpriseID,
    loading: Boolean(enterpriseID && !isEnterpriseOwner(workspace)),
    permissions: [],
  };
}

export function useEnterpriseMenuAccess(
  workspace: Pick<Workspace, "type" | "id" | "role">,
): EnterpriseMenuAccess {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const enterpriseID =
    workspace.type === "enterprise" ? workspace.id.trim() : "";
  const owner = isEnterpriseOwner(workspace);
  const [state, setState] = useState<EnterpriseMenuAccessState>(() =>
    initialAccessState(workspace),
  );

  useEffect(() => {
    if (!enterpriseID || owner) {
      setState({ enterpriseID, loading: false, permissions: [] });
      return undefined;
    }

    const accessToken = getAccessToken();
    if (!accessToken) {
      setState({ enterpriseID, loading: false, permissions: [] });
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setState({ enterpriseID, loading: true, permissions: [] });
    getEnterpriseContext(
      { enterprise_id: enterpriseID },
      { accessToken, signal: controller.signal },
    )
      .then((context) => {
        if (active)
          setState({
            enterpriseID,
            loading: false,
            permissions: normalizePermissions(context.permissions),
          });
      })
      .catch((reason: unknown) => {
        if (!active || controller.signal.aborted) return;
        if (isAuthenticationFailure(reason)) {
          dispatch(invalidateAuth());
          navigate("/", { replace: true });
          return;
        }
        // 中文：权限上下文不可用时只保留基础入口，避免错误状态扩大可见范围。
        setState({ enterpriseID, loading: false, permissions: [] });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [dispatch, enterpriseID, navigate, owner]);

  const currentState =
    state.enterpriseID === enterpriseID
      ? state
      : {
          enterpriseID,
          loading: Boolean(enterpriseID && !owner),
          permissions: [],
        };
  return owner
    ? { loading: false, permissions: [] }
    : { loading: currentState.loading, permissions: currentState.permissions };
}
