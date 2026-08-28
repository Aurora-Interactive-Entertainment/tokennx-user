import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@douyinfe/semi-ui/lib/es/button";
import Toast from "@douyinfe/semi-ui/lib/es/toast";
import { IconDeleteStroked, IconPlus } from "@douyinfe/semi-icons";
import Modal from "@/components/app-modal";
import { EnterprisePermissionMatrix } from "@/components/enterprise-permission-matrix";
import { CompatInput as Input } from "@/components/semi-compat";
import {
  createEnterpriseRole,
  deleteEnterpriseRole,
  getEnterpriseGovernance,
  updateEnterpriseRole,
  type EnterpriseContext,
  type EnterpriseGovernanceResponse,
  type EnterprisePermissionDefinition,
  type EnterpriseRole,
  type EnterpriseRoleInput,
} from "@/api/enterprise-console";
import {
  EnterpriseEmpty,
  EnterpriseError,
  EnterpriseLoading,
  EnterprisePageShell,
  roleLabel,
  useEnterpriseErrorHandler,
} from "./enterprise-console-shared";

export { updatePermissionSelection } from "@/components/enterprise-permission-matrix";

type RoleDraft = {
  id?: string;
  version?: number;
  builtIn: boolean;
  ownerRole: boolean;
  name: string;
  description: string;
  permissionCodes: string[];
};
const MAX_ROLE_COUNT = 50;
const MAX_ROLE_NAME_LENGTH = 40;
const MAX_ROLE_DESCRIPTION_LENGTH = 160;
// 中文：标签服务已下线，权限矩阵只保留仍然可配置的企业资源。
const ENTERPRISE_GOVERNANCE_RESOURCES = new Set([
  "members",
  "usage",
  "audit",
  "analytics",
  "billing",
  "settings",
  "models",
  "roles",
]);

function roleDraftFromRole(role: EnterpriseRole): RoleDraft {
  return {
    id: role.id,
    version: role.version,
    builtIn: role.built_in,
    ownerRole: role.owner_role,
    name: role.name,
    description: role.description,
    permissionCodes: Array.isArray(role.permission_codes)
      ? [...role.permission_codes]
      : [],
  };
}
function normalizeEnterpriseRole(
  role: EnterpriseRole,
  allowed?: ReadonlySet<string>,
): EnterpriseRole {
  const codes = Array.isArray(role.permission_codes)
    ? [...role.permission_codes]
    : [];
  return {
    ...role,
    permission_codes: allowed
      ? codes.filter((code) => allowed.has(code))
      : codes,
  };
}
function normalizeEnterpriseGovernance(
  response: EnterpriseGovernanceResponse,
): EnterpriseGovernanceResponse {
  const permissions = filterEnterpriseGovernancePermissions(
    response.permissions,
  ).map((permission) => ({
    ...permission,
    depends_on: Array.isArray(permission.depends_on)
      ? [...permission.depends_on]
      : [],
  }));
  const allowed = new Set(permissions.map((permission) => permission.code));
  return {
    ...response,
    permissions,
    roles: Array.isArray(response.roles)
      ? response.roles.map((role) => normalizeEnterpriseRole(role, allowed))
      : [],
  };
}
export function filterEnterpriseGovernancePermissions(
  permissions: EnterprisePermissionDefinition[],
): EnterprisePermissionDefinition[] {
  return Array.isArray(permissions)
    ? permissions.filter((permission) =>
        ENTERPRISE_GOVERNANCE_RESOURCES.has(permission.resource),
      )
    : [];
}
function roleCountLabel(
  role: EnterpriseRole,
  translate: ReturnType<typeof useTranslation>["t"],
): string {
  const category = role.built_in
    ? translate("console.enterprise.governance.systemRole")
    : translate("console.enterprise.governance.customRole");
  return translate("console.enterprise.governance.roleCount", {
    category,
    count: role.member_count,
  });
}
function RoleList({
  roles,
  selectedID,
  canCreate,
  onSelect,
  onCreate,
}: {
  roles: EnterpriseRole[];
  selectedID: string;
  canCreate: boolean;
  onSelect: (role: EnterpriseRole) => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  const count = roles.filter(
    (role) => !role.built_in && !role.owner_role,
  ).length;
  return (
    <aside
      className="enterprise-governance-rail"
      aria-label={t("console.enterprise.governance.roleList")}
    >
      <div className="enterprise-governance-rail-header">
        <span className="enterprise-governance-rail-title">
          {t("console.enterprise.governance.roles")}
        </span>
        <span className="enterprise-governance-rail-tools">
          <span className="enterprise-governance-rail-count">
            {roles.length}
          </span>
          <Button
            theme="borderless"
            type="tertiary"
            size="small"
            className="enterprise-governance-rail-add"
            icon={<IconPlus />}
            aria-label={t("console.enterprise.governance.createRole")}
            title={t("console.enterprise.governance.createRole")}
            onClick={onCreate}
            disabled={!canCreate || count >= MAX_ROLE_COUNT}
          />
        </span>
      </div>
      {roles.length === 0 ? (
        <EnterpriseEmpty
          title={t("console.enterprise.governance.noRoles")}
          description={t("console.enterprise.governance.noRolesHint")}
        />
      ) : (
        <div className="enterprise-governance-rail-list">
          {roles.map((role) => {
            const name = roleLabel(role.code, [
              { code: role.code, name: role.name, owner_role: role.owner_role },
            ]);
            return (
              <button
                type="button"
                className={`enterprise-governance-rail-item${selectedID === role.id ? " is-selected" : ""}`}
                aria-current={selectedID === role.id}
                key={role.id}
                onClick={() => onSelect(role)}
              >
                <span
                  className="enterprise-governance-rail-avatar"
                  aria-hidden="true"
                >
                  {name.slice(0, 1)}
                </span>
                <span className="enterprise-governance-rail-copy">
                  <span className="enterprise-governance-rail-name">
                    {name}
                  </span>
                  <span className="enterprise-governance-rail-meta">
                    {roleCountLabel(role, t)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function RoleEditor({
  draft,
  permissions,
  canEdit,
  saving,
  onChange,
  onSave,
  onDelete,
}: {
  draft: RoleDraft;
  permissions: EnterprisePermissionDefinition[];
  canEdit: boolean;
  saving: boolean;
  onChange: (patch: Partial<RoleDraft>) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const ownerRole = draft.ownerRole;
  const editable = !draft.builtIn && !ownerRole;
  const description = ownerRole
    ? t("console.enterprise.governance.ownerDescription")
    : draft.description ||
      t("console.enterprise.governance.customRoleDescription");
  return (
    <section
      className="enterprise-governance-main"
      aria-label={t("console.enterprise.governance.rolePermissionEdit")}
    >
      <div className="enterprise-governance-panel-heading">
        <div>
          <h2>
            {draft.name || t("console.enterprise.governance.unnamedRole")}
          </h2>
          <p className="enterprise-governance-role-description">
            {description}
          </p>
        </div>
        <div className="enterprise-governance-panel-actions">
          {draft.id && !ownerRole ? (
            <Button
              theme="borderless"
              type="danger"
              icon={<IconDeleteStroked />}
              disabled={!canEdit || saving}
              onClick={onDelete}
            >
              {t("console.enterprise.governance.deleteRole")}
            </Button>
          ) : null}
          {!ownerRole ? (
            <Button
              theme="solid"
              type="primary"
              loading={saving}
              disabled={!canEdit || saving}
              onClick={onSave}
            >
              {t("console.enterprise.governance.savePermission")}
            </Button>
          ) : null}
        </div>
      </div>
      {editable ? (
        <div className="enterprise-governance-main-content">
          <div className="enterprise-governance-role-form">
            <div className="enterprise-governance-role-form-grid">
              <label className="enterprise-governance-form-field">
                <span>{t("console.enterprise.governance.roleName")}</span>
                <Input
                  value={draft.name}
                  maxLength={MAX_ROLE_NAME_LENGTH}
                  disabled={!canEdit}
                  onChange={(value) => onChange({ name: value })}
                />
              </label>
              <label className="enterprise-governance-form-field">
                <span>{t("console.enterprise.governance.roleDescription")}</span>
                <Input
                  value={draft.description}
                  maxLength={MAX_ROLE_DESCRIPTION_LENGTH}
                  disabled={!canEdit}
                  onChange={(value) => onChange({ description: value })}
                />
              </label>
            </div>
            <p className="enterprise-governance-field-hint">
              {t("console.enterprise.governance.customRoleHint")}
            </p>
          </div>
        </div>
      ) : null}
      <EnterprisePermissionMatrix
        permissions={permissions}
        selectedCodes={draft.permissionCodes}
        canEdit={canEdit}
        readOnly={ownerRole}
        onChange={(permissionCodes) => onChange({ permissionCodes })}
      />
    </section>
  );
}

function RoleCreationDialog({
  draft,
  saving,
  onChange,
  onCreate,
  onCancel,
}: {
  draft: RoleDraft | null;
  saving: boolean;
  onChange: (patch: Partial<RoleDraft>) => void;
  onCreate: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      centered
      title={t("console.enterprise.governance.createRole")}
      visible={Boolean(draft)}
      onCancel={onCancel}
      onOk={onCreate}
      okText={t("console.enterprise.governance.createRole")}
      cancelText={t("console.common.cancel")}
      okButtonProps={{ loading: saving, disabled: saving }}
    >
      <div className="enterprise-governance-create-form">
        <label className="enterprise-governance-form-field">
          <span>{t("console.enterprise.governance.roleName")}</span>
          <Input
            value={draft?.name ?? ""}
            maxLength={MAX_ROLE_NAME_LENGTH}
            placeholder={t("console.enterprise.governance.roleNamePlaceholder")}
            onChange={(value) => onChange({ name: value })}
          />
        </label>
        <label className="enterprise-governance-form-field">
          <span>{t("console.enterprise.governance.roleDescription")}</span>
          <Input
            value={draft?.description ?? ""}
            maxLength={MAX_ROLE_DESCRIPTION_LENGTH}
            placeholder={t(
              "console.enterprise.governance.roleDescriptionPlaceholder",
            )}
            onChange={(value) => onChange({ description: value })}
          />
        </label>
        <p className="enterprise-governance-field-hint">
          {t("console.enterprise.governance.roleCreationHint")}
        </p>
      </div>
    </Modal>
  );
}

function GovernanceContent({ context }: { context: EnterpriseContext }) {
  const { t } = useTranslation();
  const handleError = useEnterpriseErrorHandler();
  const [governance, setGovernance] =
    useState<EnterpriseGovernanceResponse | null>(null);
  const [selectedRoleID, setSelectedRoleID] = useState("");
  const [roleDraft, setRoleDraft] = useState<RoleDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{
    message: string;
    requestId: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const ownerRole =
    context.role === "owner" ||
    context.roles.includes("owner") ||
    context.role_options?.some(
      (option) => option.owner_role && context.roles.includes(option.code),
    ) === true;
  const canEditRoles =
    context.capabilities.can_manage_roles &&
    (ownerRole || context.permissions?.includes("roles.edit") === true);
  const requestContext = useMemo(
    () => ({ enterprise_id: context.id }),
    [context.id],
  );
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getEnterpriseGovernance(requestContext, { signal: controller.signal })
      .then((response) => {
        if (!active) return;
        const normalized = normalizeEnterpriseGovernance(response);
        setGovernance(normalized);
        setSelectedRoleID((previous) =>
          normalized.roles.some((role) => role.id === previous)
            ? previous
            : (normalized.roles[0]?.id ?? ""),
        );
      })
      .catch((reason: unknown) => {
        if (!active || controller.signal.aborted) return;
        const result = handleError(reason);
        if (result) setError(result);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [handleError, requestContext]);
  const selectedRole =
    governance?.roles.find((role) => role.id === selectedRoleID) ?? null;
  function createRole(): void {
    setRoleDraft({
      builtIn: false,
      ownerRole: false,
      name: "",
      description: "",
      permissionCodes: [],
    });
  }
  function editRole(role: EnterpriseRole): void {
    setSelectedRoleID(role.id);
    setRoleDraft(roleDraftFromRole(role));
  }
  async function saveRole(): Promise<void> {
    if (!roleDraft) return;
    const name = roleDraft.name.trim();
    if (
      !name ||
      name.length > MAX_ROLE_NAME_LENGTH ||
      roleDraft.description.trim().length > MAX_ROLE_DESCRIPTION_LENGTH
    ) {
      Toast.warning(
        t("console.enterprise.governance.roleValidation", {
          nameLength: MAX_ROLE_NAME_LENGTH,
          descriptionLength: MAX_ROLE_DESCRIPTION_LENGTH,
        }),
      );
      return;
    }
    const input: EnterpriseRoleInput = {
      name,
      description: roleDraft.description.trim(),
      permission_codes: roleDraft.permissionCodes,
    };
    setSaving(true);
    try {
      const result =
        roleDraft.id && roleDraft.version
          ? await updateEnterpriseRole(requestContext, roleDraft.id, {
              ...input,
              expected_version: roleDraft.version,
            })
          : await createEnterpriseRole(requestContext, input);
      const allowed = new Set(
        governance?.permissions.map((permission) => permission.code) ?? [],
      );
      const normalized = normalizeEnterpriseRole(result, allowed);
      setGovernance((previous) =>
        previous
          ? {
              ...previous,
              roles: roleDraft.id
                ? previous.roles.map((role) =>
                    role.id === normalized.id
                      ? { ...role, ...normalized }
                      : role,
                  )
                : [...previous.roles, normalized],
            }
          : previous,
      );
      setSelectedRoleID(normalized.id);
      setRoleDraft(null);
      Toast.success(
        roleDraft.id
          ? t("console.enterprise.governance.saveSuccess")
          : t("console.enterprise.governance.createSuccess"),
      );
    } catch (reason: unknown) {
      const result = handleError(reason);
      if (result) Toast.error(result.message);
    } finally {
      setSaving(false);
    }
  }
  async function removeRole(): Promise<void> {
    if (
      !roleDraft?.id ||
      !selectedRole ||
      !window.confirm(
        t("console.enterprise.governance.deleteConfirm", {
          name: selectedRole.name,
        }),
      )
    )
      return;
    if (selectedRole.member_count > 0 || selectedRole.invitation_count > 0) {
      Toast.warning(t("console.enterprise.governance.roleInUse"));
      return;
    }
    setSaving(true);
    try {
      await deleteEnterpriseRole(
        requestContext,
        selectedRole.id,
        selectedRole.version,
      );
      const remaining =
        governance?.roles.filter((role) => role.id !== selectedRole.id) ?? [];
      setGovernance((previous) =>
        previous ? { ...previous, roles: remaining } : previous,
      );
      setSelectedRoleID(remaining[0]?.id ?? "");
      setRoleDraft(null);
      Toast.success(t("console.enterprise.governance.deleteSuccess"));
    } catch (reason: unknown) {
      const result = handleError(reason);
      if (result) Toast.error(result.message);
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return (
      <EnterpriseLoading label={t("console.enterprise.governance.loading")} />
    );
  if (error)
    return (
      <EnterpriseError
        message={error.message}
        requestId={error.requestId}
        onRetry={() => window.location.reload()}
      />
    );
  if (!governance)
    return (
      <EnterpriseEmpty
        title={t("console.enterprise.governance.noGovernance")}
        description={t("console.enterprise.governance.noGovernanceHint")}
      />
    );
  const roleCreationDraft = roleDraft?.id ? null : roleDraft;
  const roleEditor = roleCreationDraft
    ? null
    : (roleDraft ?? (selectedRole ? roleDraftFromRole(selectedRole) : null));
  return (
    <div className="enterprise-governance-content">
      <div className="enterprise-governance-layout">
        <RoleList
          roles={governance.roles}
          selectedID={selectedRoleID}
          canCreate={canEditRoles}
          onSelect={editRole}
          onCreate={createRole}
        />
        {roleEditor ? (
          <RoleEditor
            draft={roleEditor}
            permissions={governance.permissions}
            canEdit={canEditRoles}
            saving={saving}
            onChange={(patch) =>
              setRoleDraft((previous) => ({
                ...(previous ?? roleEditor),
                ...patch,
              }))
            }
            onSave={() => {
              void saveRole();
            }}
            onDelete={() => {
              void removeRole();
            }}
          />
        ) : (
          <EnterpriseEmpty
            title={t("console.enterprise.governance.selectRole")}
            description={t("console.enterprise.governance.selectRoleHint")}
          />
        )}
      </div>
      <RoleCreationDialog
        draft={roleCreationDraft}
        saving={saving}
        onChange={(patch) =>
          setRoleDraft((previous) =>
            previous ? { ...previous, ...patch } : previous,
          )
        }
        onCreate={() => {
          void saveRole();
        }}
        onCancel={() => setRoleDraft(null)}
      />
    </div>
  );
}
export function EnterpriseGovernancePage() {
  const { t } = useTranslation();
  return (
    <EnterprisePageShell
      title={t("console.nav.governance")}
      description=""
    >
      {(context) => <GovernanceContent context={context} />}
    </EnterprisePageShell>
  );
}
