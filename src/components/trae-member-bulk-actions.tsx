import Tooltip from "@douyinfe/semi-ui/lib/es/tooltip";
import { useTranslation } from "react-i18next";
import "./trae-member-bulk-actions.css";

export type TraeMemberRole = "owner" | "admin" | "member";
export type TraeMemberStatus = "active" | "pending" | "suspended";

export type TraeBulkMember = {
  id: string;
  role: TraeMemberRole;
  status: TraeMemberStatus;
};

export type TraeMemberBulkAction =
  "changeDepartment" | "removeMember" | "changeRole" | "sendInvite";

type BulkActionAvailability = {
  disabled: boolean;
  reason?: "protectedMember" | "removeProtectedMember" | "inviteUnavailable";
};

export function getTraeBulkActionAvailability(
  action: TraeMemberBulkAction,
  members: TraeBulkMember[],
  operator: { memberID: string; role: TraeMemberRole },
): BulkActionAvailability {
  if (members.length === 0) return { disabled: true };

  // Only the signed-in super administrator can perform protected operations
  // on their own account. Moving departments remains available to match the
  // enterprise console behavior.
  const hasRestrictedSuperAdmin = members.some(
    (member) =>
      member.role === "owner" &&
      !(operator.role === "owner" && member.id === operator.memberID),
  );
  const containsNonRemovableOperator =
    operator.role !== "owner" &&
    members.some((member) => member.id === operator.memberID);

  if (action === "changeDepartment") {
    return { disabled: false };
  }
  if (action === "removeMember") {
    return hasRestrictedSuperAdmin || containsNonRemovableOperator
      ? { disabled: true, reason: "removeProtectedMember" }
      : { disabled: false };
  }
  if (action === "sendInvite") {
    if (hasRestrictedSuperAdmin)
      return { disabled: true, reason: "protectedMember" };
    return members.every((member) => member.status === "pending")
      ? { disabled: false }
      : { disabled: true, reason: "inviteUnavailable" };
  }
  return hasRestrictedSuperAdmin
    ? { disabled: true, reason: "protectedMember" }
    : { disabled: false };
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
}: {
  members: TraeBulkMember[];
  operator: { memberID: string; role: TraeMemberRole };
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
              disabled={availability.disabled}
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
