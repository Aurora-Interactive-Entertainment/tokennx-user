import { useTranslation } from "react-i18next";
import Switch from "@douyinfe/semi-ui/lib/es/switch";
import type { EnterprisePermissionDefinition } from "@/api/enterprise-console";
import "./enterprise-permission-matrix.css";

type EnterprisePermissionMatrixProps = {
  permissions: EnterprisePermissionDefinition[];
  selectedCodes: string[];
  canEdit: boolean;
  readOnly: boolean;
  onChange: (permissionCodes: string[]) => void;
};

function groupedPermissions(
  permissions: EnterprisePermissionDefinition[],
): Array<[string, EnterprisePermissionDefinition[]]> {
  const groups = new Map<string, EnterprisePermissionDefinition[]>();
  permissions.forEach((permission) => {
    const current = groups.get(permission.resource) ?? [];
    current.push(permission);
    groups.set(permission.resource, current);
  });
  return [...groups.entries()];
}

export function updatePermissionSelection(
  code: string,
  selected: boolean,
  current: string[],
  permissions: EnterprisePermissionDefinition[],
): string[] {
  const dependencies = new Map(
    permissions.map((permission) => [
      permission.code,
      Array.isArray(permission.depends_on) ? permission.depends_on : [],
    ]),
  );
  const dependents = new Map<string, string[]>();
  dependencies.forEach((items, permissionCode) =>
    items.forEach((dependency) =>
      dependents.set(dependency, [
        ...(dependents.get(dependency) ?? []),
        permissionCode,
      ]),
    ),
  );
  const next = new Set(current);

  // 中文：开启权限时自动补齐依赖，关闭时同步移除依赖它的权限。
  if (selected) {
    const add = (permissionCode: string): void => {
      if (next.has(permissionCode)) return;
      next.add(permissionCode);
      (dependencies.get(permissionCode) ?? []).forEach(add);
    };
    add(code);
  } else {
    const remove = (permissionCode: string): void => {
      next.delete(permissionCode);
      (dependents.get(permissionCode) ?? []).forEach(remove);
    };
    remove(code);
  }

  return permissions
    .filter((permission) => next.has(permission.code))
    .map((permission) => permission.code);
}

export function EnterprisePermissionMatrix({
  permissions,
  selectedCodes,
  canEdit,
  readOnly,
  onChange,
}: EnterprisePermissionMatrixProps) {
  const { t } = useTranslation();
  const groups = groupedPermissions(permissions);
  const messages = t("console.enterprise.governance.permissions", {
    returnObjects: true,
  }) as unknown as Record<string, { name: string; description: string }>;

  return (
    <div className="enterprise-governance-permission-matrix">
      <div className="enterprise-governance-permission-heading">
        <div>
          <h3>{t("console.enterprise.governance.permissionMatrix")}</h3>
          <p>{t("console.enterprise.governance.permissionHint")}</p>
        </div>
        <span>
          {t("console.enterprise.governance.selectedCount", {
            count: selectedCodes.length,
          })}
        </span>
      </div>
      <div className="enterprise-governance-permission-groups">
        {groups.map(([resource, items]) => (
          <section
            className="enterprise-governance-permission-group"
            key={resource}
          >
            <h3>
              {t(`console.enterprise.governance.resources.${resource}`, {
                defaultValue: resource,
              })}
            </h3>
            <div className="enterprise-governance-permission-list">
              {items.map((permission) => {
                const checked = selectedCodes.includes(permission.code);
                const message = messages[permission.code] ?? permission;
                const nameID = `enterprise-permission-${permission.code.replace(/[^a-zA-Z0-9_-]/g, "-")}-name`;
                const descriptionID = `${nameID}-description`;

                return (
                  <div
                    className="enterprise-governance-permission-row"
                    key={permission.code}
                  >
                    <div
                      className="enterprise-governance-permission-label"
                      id={nameID}
                    >
                      {message.name}
                    </div>
                    <div
                      className="enterprise-governance-permission-description"
                      id={descriptionID}
                    >
                      {message.description}
                    </div>
                    <div className="enterprise-governance-permission-control">
                      <Switch
                        size="default"
                        checked={checked}
                        aria-labelledby={nameID}
                        aria-describedby={descriptionID}
                        disabled={!canEdit || readOnly}
                        onChange={(nextChecked) =>
                          onChange(
                            updatePermissionSelection(
                              permission.code,
                              nextChecked,
                              selectedCodes,
                              permissions,
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
