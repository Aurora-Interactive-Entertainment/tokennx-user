import type { EnterpriseContext } from "@/api/enterprise-console";
import { hasEnterpriseMemberPermission } from "@/utils/enterprise-member-access";
import Tooltip from "@douyinfe/semi-ui/lib/es/tooltip";
import { useTranslation } from "react-i18next";
import "./trae-member-bulk-actions.css";

export type TraeMemberRole = "owner" | "admin" | "member";
export type TraeMemberStatus = "active" | "pending" | "suspended" | "removed";

export type TraeBulkMember = {
  id: string;
  role: TraeMemberRole;
  status: TraeMemberStatus;
};

export type TraeMemberBulkAction =
  "changeDepartment" | "removeMember" | "changeRole" | "sendInvite";

type BulkActionAvailability = {
  disabled: boolean;
  reason?: "protectedMember" | "removeProtectedMember" | "inviteUnavailable" | "noPermission" | "batchLimit" | "invalidStatus";
};

export function getTraeBulkActionAvailability(
  action: TraeMemberBulkAction,
  members: TraeBulkMember[],
  operator: { memberID: string; role: TraeMemberRole; context?: EnterpriseContext },
): BulkActionAvailability {
  if (members.length === 0) return { disabled: true };

  const permission = action === "changeDepartment" ? "department_members.manage" : action === "changeRole" ? "roles.edit" : action === "removeMember" ? "members.remove" : "members.invite";
  if (operator.context && !hasEnterpriseMemberPermission(operator.context, permission)) return { disabled: true, reason: "noPermission" };
  // 普通成员操作不能修改所有者；部门调整与移除也禁止针对操作者本人。
  const protectedMember = members.some((member) => member.role === "owner" || ((action === "changeDepartment" || action === "removeMember") && member.id === operator.memberID));
  if (protectedMember) return { disabled: true, reason: action === "removeMember" ? "removeProtectedMember" : "protectedMember" };
  if (action === "sendInvite") return members.every((member) => member.status === "pending") ? { disabled: false } : { disabled: true, reason: "inviteUnavailable" };
  if (members.some((member) => member.status !== "active" && member.status !== "suspended")) return { disabled: true, reason: "invalidStatus" };
  if (action === "changeRole" && members.length > 100) return { disabled: true, reason: "batchLimit" };
  return { disabled: false };
}

const BULK_ACTIONS: TraeMemberBulkAction[] = [
  "changeDepartment",
  "removeMember",
  "changeRole",
  "sendInvite",
];

export function TraeMemberBulkActions({
  members,
  operator,
  onCancel,
  onAction,
  disabled = false,
}: {
  members: TraeBulkMember[];
  operator: { memberID: string; role: TraeMemberRole; context?: EnterpriseContext };
  disabled?: boolean;
  onCancel: () => void;
  onAction: (action: TraeMemberBulkAction) => void;
}) {
  const { t } = useTranslation();
  if (members.length === 0) return null;

  return (
    <div className="trae-member-bulk-actions" aria-live="polite">
      <span className="trae-member-bulk-count">
        {t("traeEnterprise.members.selectedCount", { count: members.length })}
      </span>
      <button
        className="trae-member-bulk-cancel"
        type="button"
        onClick={onCancel}
      >
        {t("traeEnterprise.members.cancelSelection")}
      </button>
      <div className="trae-member-bulk-buttons">
        {BULK_ACTIONS.map((action) => {
          const availability = getTraeBulkActionAvailability(
            action,
            members,
            operator,
          );
          const button = (
            <button
              type="button"
              disabled={disabled || availability.disabled}
              onClick={() => onAction(action)}
            >
              {t(`traeEnterprise.members.${action}`)}
            </button>
          );
          return availability.reason ? (
            <Tooltip
              key={action}
              className="app-info-tooltip"
              content={t(
                `traeEnterprise.members.bulkDisabled.${availability.reason}`,
              )}
              position="top"
            >
              <span className="trae-member-bulk-button-wrap">{button}</span>
            </Tooltip>
          ) : (
            <span className="trae-member-bulk-button-wrap" key={action}>
              {button}
            </span>
          );
        })}
      </div>
    </div>
  );
}
