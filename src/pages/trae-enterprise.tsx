import { createPortal } from "react-dom";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Toast from "@douyinfe/semi-ui/lib/es/toast";
import { Form } from "@douyinfe/semi-ui/lib/es/form";
import Select from "@douyinfe/semi-ui/lib/es/select";
import Table from "@douyinfe/semi-ui/lib/es/table";
import Tooltip from "@douyinfe/semi-ui/lib/es/tooltip";
import {
  IconApartment,
  IconBarChartVStroked,
  IconBookmark,
  IconCalendar,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconCreditCard,
  IconDownload,
  IconEditStroked,
  IconExternalOpen,
  IconFile,
  IconGift,
  IconGridView,
  IconInfoCircle,
  IconLink,
  IconMoreStroked,
  IconPlus,
  IconSearch,
  IconTick,
  IconUserGroup,
  IconUserAdd,
  IconUserListStroked,
} from "@douyinfe/semi-icons";
import { TraeDialog } from "@/components/trae-dialog";
import { TraeEnterpriseInvitations } from "@/components/trae-enterprise-invitations";
import { TraeEnterpriseJoinRequests } from "@/components/trae-enterprise-join-requests";
import { TraeTableEmpty } from "@/components/trae-table-empty";
import type { AnalysisExportState } from "@/components/trae-enterprise-analysis";
import {
  TraeMemberBulkActions,
  type TraeMemberBulkAction,
  type TraeMemberRole,
} from "@/components/trae-member-bulk-actions";
import { getAccessToken } from "@/auth/token-storage";
import {
  createEnterpriseDepartment,
  deleteEnterpriseDepartment,
  getEnterpriseDepartmentMembers,
  getEnterpriseDepartments,
  getEnterpriseMembers,
  removeEnterpriseMember,
  updateEnterpriseDepartment,
  updateEnterpriseMemberDepartment,
  updateEnterpriseMemberRole,
  type EnterpriseContext,
  type EnterpriseDepartment,
  type EnterpriseMember,
} from "@/api/enterprise-console";
import { EnterprisePageShell, useEnterpriseConsoleContext, useEnterpriseErrorHandler, EnterpriseError, EnterpriseLoading } from "./enterprise-console-shared";
import { ConsoleTabs } from "@/components/console-tabs";
import { formatApiTime } from "@/utils/format";
import "@/trae-enterprise.css";

type Translate = (key: string, options?: Record<string, unknown>) => string;

const TraeEnterpriseAnalysis = lazy(() => import("@/components/trae-enterprise-analysis").then(({ TraeEnterpriseAnalysis }) => ({ default: TraeEnterpriseAnalysis })));
const TraeUsageBoard = lazy(() => import("@/components/trae-enterprise-usage").then(({ TraeUsageBoard }) => ({ default: TraeUsageBoard })));
const TraeUsageDetail = lazy(() => import("@/components/trae-enterprise-usage").then(({ TraeUsageDetail }) => ({ default: TraeUsageDetail })));

function showTraeToast(message: string) {
  Toast.success(message);
}
type TraePageProps = {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

type TraeMemberRow = {
  id: string;
  name: string;
  email: string;
  status: "active" | "pending" | "suspended";
  role: TraeMemberRole;
  account: string;
  joined: string;
  department: string;
  departmentID: string;
  version: number;
};

// 其他企业分析组件使用同一行模型；成员管理页本身只展示服务端返回的数据。
const memberRows: TraeMemberRow[] = [];

// 中文：当前企业上下文尚未返回订阅席位明细，先沿用订阅页的演示配额展示。
const TRAE_MEMBER_SEAT_SUMMARY = {
  total: 10,
  allOccupied: 4,
  allCapacity: 10,
  workOccupied: 0,
  workCapacity: 20,
} as const;

function toTraeMemberRow(member: EnterpriseMember): TraeMemberRow {
  const role = member.role === "owner" ? "owner" : member.role === "administrator" || member.role === "admin" ? "admin" : "member";
  const department = member.department;
  return {
    id: member.id,
    name: member.display_name || member.user_id,
    email: member.masked_contact || "--",
    // 兼容旧接口的 invited 值，页面与新接口统一使用 pending。
    status: member.status === "suspended" ? "suspended" : member.status === "pending" || member.status === "invited" ? "pending" : "active",
    role,
    account: member.join_source || "--",
    joined: formatApiTime(member.joined_at),
    department: department?.name || "--",
    departmentID: department?.id || "",
    version: member.version,
  };
}

async function loadEnterpriseDepartmentTree(
  enterpriseID: string,
  signal: AbortSignal,
): Promise<TraeDepartmentNode[]> {
  const request = { enterprise_id: enterpriseID };
  async function loadChildren(parentID?: string): Promise<TraeDepartmentNode[]> {
    const response = await getEnterpriseDepartments(request, {
      parent_id: parentID,
      page: 1,
      page_size: 10,
      signal,
    });
    const nodes = await Promise.all(response.items.map(async (department) => ({
      id: department.id,
      name: department.name,
      parentID: department.parent_id ?? undefined,
      depth: department.depth,
      childCount: department.child_count,
      memberCount: department.member_count,
      version: department.version,
      limits: department.limits,
      children: department.child_count > 0 ? await loadChildren(department.id) : [],
    })));
    return nodes;
  }
  return loadChildren();
}

function TraeShell({ title, action, children, className = "" }: TraePageProps) {
  return (
    <div className={`trae-page ${className}`.trim()}>
      <header className="trae-page-heading">
        <h1>{title}</h1>
        {action ? (
          <div className="trae-page-heading-action">{action}</div>
        ) : null}
      </header>
      {children}
    </div>
  );
}

function TraeToolbar({ children }: { children: ReactNode }) {
  return <div className="trae-toolbar">{children}</div>;
}

function TraeSelect({
  label,
  value,
  onChange,
  options,
  className = "",
  dropdownClassName = "",
  searchable = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
  dropdownClassName?: string;
  searchable?: boolean;
}) {
  return (
    <Select
      aria-label={label}
      className={`trae-select ${className}`}
      dropdownClassName={`trae-select-dropdown ${dropdownClassName}`.trim()}
      filter={searchable}
      searchPosition={searchable ? "dropdown" : undefined}
      searchPlaceholder={label}
      value={value}
      onChange={(nextValue) => onChange(String(nextValue ?? ""))}
    >
      {options.map((option) => (
        <Select.Option key={option.value} value={option.value}>
          {option.label}
        </Select.Option>
      ))}
    </Select>
  );
}

type TraePickerTab = "people" | "departments";

type TraeDepartmentNode = {
  id: string;
  name: string;
  children?: TraeDepartmentNode[];
  parentID?: string;
  depth?: number;
  childCount?: number;
  memberCount?: number;
  version?: number;
  isVirtual?: boolean;
  limits?: EnterpriseDepartment["limits"];
};

const traeDepartmentTree: TraeDepartmentNode[] = [
  {
    id: "company",
    name: "极光互娱科技（深圳）有限公司",
    children: [
      {
        id: "operation",
        name: "运营",
        children: [
          {
            id: "test-level-one",
            name: "测试子级部门",
            children: [
              {
                id: "test-level-two",
                name: "四级子部门",
                children: [{ id: "test-level-five", name: "五级" }],
              },
              {
                id: "test-level-three",
                name: "测试三级子部门",
              },
            ],
          },
        ],
      },
    ],
  },
];

function flattenTraeDepartments(
  nodes: TraeDepartmentNode[],
  expanded: Record<string, boolean>,
  depth = 0,
): Array<Record<string, unknown>> {
  return nodes.flatMap((node) => {
    const hasChildren = Boolean(node.children?.length);
    const row = {
      value: `department:${node.id}`,
      name: node.name,
      email: "",
      kind: "department",
      depth,
      hasChildren,
      expanded: expanded[node.id] !== false,
    };
    return hasChildren && expanded[node.id] !== false
      ? [
          row,
          ...flattenTraeDepartments(node.children ?? [], expanded, depth + 1),
        ]
      : [row];
  });
}

function findTraeDepartmentName(
  nodes: TraeDepartmentNode[],
  id: string,
): string | undefined {
  for (const node of nodes) {
    if (node.id === id) return node.name;
    const childName = node.children
      ? findTraeDepartmentName(node.children, id)
      : undefined;
    if (childName) return childName;
  }
  return undefined;
}

function findTraeDepartmentNode(
  nodes: TraeDepartmentNode[],
  id: string,
): TraeDepartmentNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = node.children
      ? findTraeDepartmentNode(node.children, id)
      : undefined;
    if (child) return child;
  }
  return undefined;
}

function containsTraeDepartmentNode(
  node: TraeDepartmentNode,
  id: string,
): boolean {
  return (
    node.children?.some(
      (child) => child.id === id || containsTraeDepartmentNode(child, id),
    ) ?? false
  );
}

function collectTraeDepartmentBranchIDs(
  node: TraeDepartmentNode,
  result = new Set<string>(),
): Set<string> {
  result.add(node.id);
  node.children?.forEach((child) => collectTraeDepartmentBranchIDs(child, result));
  return result;
}

function findTraeParentDepartmentID(
  nodes: TraeDepartmentNode[],
  id: string,
  parentID = "",
): string | undefined {
  for (const node of nodes) {
    if (node.id === id) return parentID || undefined;
    const childParent = node.children
      ? findTraeParentDepartmentID(node.children, id, node.id)
      : undefined;
    if (childParent) return childParent;
  }
  return undefined;
}

function getTraeDepartmentExpansionForSelection(
  nodes: TraeDepartmentNode[],
  selectedID: string,
): Record<string, boolean> {
  const expanded: Record<string, boolean> = {};
  function visit(items: TraeDepartmentNode[], ancestors: string[]): boolean {
    for (const node of items) {
      if (node.id === selectedID) {
        ancestors.forEach((id) => {
          expanded[id] = true;
        });
        return true;
      }
      if (node.children && visit(node.children, [...ancestors, node.id])) {
        return true;
      }
    }
    return false;
  }
  visit(nodes, []);
  return expanded;
}

function removeDepartmentNode(
  nodes: TraeDepartmentNode[],
  id: string,
): TraeDepartmentNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({
      ...node,
      children: node.children
        ? removeDepartmentNode(node.children, id)
        : undefined,
    }));
}

function hasNextSibling(nodes: TraeDepartmentNode[], targetID: string): boolean {
  for (const node of nodes) {
    const children = node.children ?? [];
    const index = children.findIndex((child) => child.id === targetID);
    if (index >= 0 && index < children.length - 1) return true;
    if (hasNextSibling(children, targetID)) return true;
  }
  return false;
}

function moveDepartmentDown(
  nodes: TraeDepartmentNode[],
  nodeID: string,
): TraeDepartmentNode[] {
  let moved = false;
  function swap(items: TraeDepartmentNode[]): TraeDepartmentNode[] {
    const index = items.findIndex((item) => item.id === nodeID);
    if (index >= 0 && index < items.length - 1) {
      const next = [...items];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      moved = true;
      return next;
    }
    return items.map((item) =>
      !moved && item.children
        ? { ...item, children: swap(item.children) }
        : item,
    );
  }
  return moved ? nodes : swap(nodes);
}

function moveDepartmentUp(
  nodes: TraeDepartmentNode[],
  nodeID: string,
): TraeDepartmentNode[] {
  let moved = false;
  function swap(items: TraeDepartmentNode[]): TraeDepartmentNode[] {
    const index = items.findIndex((item) => item.id === nodeID);
    if (index > 0) {
      const next = [...items];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      moved = true;
      return next;
    }
    return items.map((item) =>
      !moved && item.children
        ? { ...item, children: swap(item.children) }
        : item,
    );
  }
  return moved ? nodes : swap(nodes);
}

function hasPreviousSibling(nodes: TraeDepartmentNode[], nodeID: string): boolean {
  for (const node of nodes) {
    const children = node.children ?? [];
    if (children.findIndex((child) => child.id === nodeID) > 0) return true;
    if (hasPreviousSibling(children, nodeID)) return true;
  }
  return false;
}

function flattenDepartmentTableRows(
  nodes: TraeDepartmentNode[],
  expanded: Record<string, boolean>,
  depth = 0,
): Array<TraeDepartmentNode & { depth: number; hasChildren: boolean }> {
  return nodes.flatMap((node) => {
    const hasChildren = Boolean(node.children?.length);
    const row = { ...node, depth, hasChildren };
    return hasChildren && expanded[node.id] !== false
      ? [row, ...flattenDepartmentTableRows(node.children ?? [], expanded, depth + 1)]
      : [row];
  });
}

function TraeSection({
  title,
  action,
  children,
  className = "",
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`trae-section ${className}`}>
      <div className="trae-section-heading">
        <h2>{title}</h2>
        {action ? <div>{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function TraeEnterpriseAnalysisPage() {
  const { t } = useTranslation();
  const { context, loading, error, reload } = useEnterpriseConsoleContext();
  const [exportState, setExportState] = useState<AnalysisExportState>(() => ({
    disabled: true,
    run: () => undefined,
  }));
  const handleExportChange = useCallback((state: AnalysisExportState) => {
    setExportState(state);
  }, []);
  return (
    <TraeShell
      className="trae-analysis-page"
      title={t("traeEnterprise.analysis.title")}
      action={
        <button
          className="trae-primary-button"
          type="button"
          disabled={exportState.disabled}
          onClick={exportState.run}
        >
          <IconDownload aria-hidden="true" />
          {t("traeEnterprise.analysis.export")}
        </button>
      }
    >
      {loading || (!context && !error) ? (
        <EnterpriseLoading label={t("console.enterprise.contextLoading")} />
      ) : error || !context ? (
        <EnterpriseError
          message={error?.message ?? t("console.enterprise.contextFailed")}
          requestId={error?.requestId ?? null}
          onRetry={reload}
        />
      ) : (
        <Suspense fallback={<EnterpriseLoading label={t("traeEnterprise.analysis.loading")} />}>
          <TraeEnterpriseAnalysis
            context={context}
            onExportChange={handleExportChange}
          />
        </Suspense>
      )}
    </TraeShell>
  );
}

function MemberStatus({ value, t }: { value: string; t: Translate }) {
  const label =
    value === "active"
      ? t("traeEnterprise.members.active")
      : value === "pending"
        ? t("traeEnterprise.members.pending")
        : t("traeEnterprise.members.suspended");
  return (
    <span className={`trae-status-badge is-${value}`}>
      <i />
      {label}
    </span>
  );
}

function MemberStatusRulesTooltip({ t }: { t: Translate }) {
  return (
    <div className="trae-status-rules-tooltip">
      <p>{t("traeEnterprise.members.ruleActive")}</p>
      <p>{t("traeEnterprise.members.rulePending")}</p>
      <p>{t("traeEnterprise.members.ruleSuspended")}</p>
      <button type="button" onClick={() => undefined}>
        {t("traeEnterprise.members.stateRules")}
      </button>
    </div>
  );
}

function updateDepartmentNodes(
  nodes: TraeDepartmentNode[],
  targetID: string,
  update: (node: TraeDepartmentNode) => TraeDepartmentNode,
): TraeDepartmentNode[] {
  return nodes.map((node) =>
    node.id === targetID
      ? update(node)
      : {
          ...node,
          children: node.children
            ? updateDepartmentNodes(node.children, targetID, update)
            : undefined,
        },
  );
}

function DepartmentTree({
  collapsed,
  selectedID,
  onSelect,
  onToggle,
  t,
  nodes,
  onAddDepartment,
  onEditDepartment,
  onAddChildDepartment,
  onDeleteDepartment,
  onMoveUp,
  onMoveDown,
}: {
  collapsed: boolean;
  selectedID: string;
  onSelect: (id: string) => void;
  onToggle: () => void;
  t: Translate;
  nodes: TraeDepartmentNode[];
  onAddDepartment: (parentID?: string) => void;
  onEditDepartment: (node: TraeDepartmentNode) => void;
  onAddChildDepartment: (parentID: string) => void;
  onDeleteDepartment: (node: TraeDepartmentNode) => void;
  onMoveUp: (node: TraeDepartmentNode) => void;
  onMoveDown: (node: TraeDepartmentNode) => void;
}) {
  const departmentMenuRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [menuID, setMenuID] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    company: true,
  });
  const visible = search.trim().toLowerCase();

  useEffect(() => {
    if (!menuID) return undefined;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!departmentMenuRef.current?.contains(event.target as Node))
        closeDepartmentMenu();
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [menuID]);

  function toggleDepartmentMenu(nodeID: string, target: HTMLButtonElement) {
    if (menuID === nodeID) {
      setMenuID(null);
      return;
    }
    const tree = target.closest<HTMLElement>(".trae-department-tree");
    if (!tree) return;
    const targetRect = target.getBoundingClientRect();
    const treeRect = tree.getBoundingClientRect();
    // Keep the menu outside the scrolling list so it is never clipped at the list edge.
    setMenuPosition({
      top: targetRect.bottom - treeRect.top + 4,
      right: treeRect.right - targetRect.right,
    });
    setMenuID(nodeID);
  }

  function closeDepartmentMenu() {
    setMenuID(null);
    setMenuPosition(null);
  }

  function renderNodes(items: TraeDepartmentNode[], depth = 0): ReactNode[] {
    return items.flatMap((node) => {
      const hasChildren = Boolean(node.children?.length);
      const isVisible = !visible || node.name.toLowerCase().includes(visible);
      const isExpanded = expanded[node.id] !== false;
      const row = isVisible ? (
        <div
          className={`trae-department-node${selectedID === node.id ? " is-selected" : ""}${depth === 0 ? " is-root" : ""}`}
          key={node.id}
          style={{ paddingLeft: `${depth === 0 ? 4 : 6 + depth * 18}px` }}
        >
          {depth > 0 ? (
            <span className="trae-department-node-chevron">
              {hasChildren ? (
                <button
                  type="button"
                  aria-label={
                    isExpanded
                      ? t("traeEnterprise.members.collapseDepartment")
                      : t("traeEnterprise.members.expandDepartment")
                  }
                  onClick={() =>
                    setExpanded((current) => ({
                      ...current,
                      [node.id]: !isExpanded,
                    }))
                  }
                >
                  {isExpanded ? (
                    <IconChevronDown aria-hidden="true" />
                  ) : (
                    <IconChevronRight aria-hidden="true" />
                  )}
                </button>
              ) : (
                <span />
              )}
            </span>
          ) : null}
          <button
            className="trae-department-node-main"
            type="button"
            onClick={() => onSelect(node.id)}
          >
            {depth === 0 ? <IconGridView aria-hidden="true" /> : null}
            <span className="trae-department-node-label">{node.name}</span>
          </button>
          {depth > 0 ? (
            <div
              className={"trae-department-node-actions" + (menuID === node.id ? " is-menu-open" : "")}
            >
              <button
                type="button"
                aria-label={t("traeEnterprise.members.moreDepartmentActions")}
                onClick={(event) =>
                  toggleDepartmentMenu(node.id, event.currentTarget)
                }
              >
                <IconMoreStroked aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null;
      return hasChildren && (depth === 0 || isExpanded)
        ? [row, ...renderNodes(node.children ?? [], depth + 1)]
        : [row];
    });
  }
  const menuNode = menuID ? findTraeDepartmentNode(nodes, menuID) : undefined;
  return (
    <aside className={`trae-department-tree${collapsed ? " is-collapsed" : ""}`}>
      <div className="trae-department-expanded-content">
        <div className="trae-department-toolbar">
          <button
            type="button"
            aria-label={t("traeEnterprise.members.collapseTree")}
            onClick={() => {
              closeDepartmentMenu();
              onToggle();
            }}
          >
            <IconChevronRight aria-hidden="true" className="is-rotated" />
          </button>
          <label className="trae-inline-search">
            <IconSearch aria-hidden="true" />
            <input
              aria-label={t("traeEnterprise.members.searchDepartment")}
              placeholder={t("traeEnterprise.members.searchDepartment")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button
            className="trae-department-add"
            type="button"
            aria-label={t("traeEnterprise.members.newDepartment")}
            onClick={() => onAddDepartment()}
          >
            <IconPlus aria-hidden="true" />
          </button>
        </div>
        <div className="trae-department-list">{renderNodes(nodes)}</div>
        {menuNode && menuPosition ? (
          <div
            ref={departmentMenuRef}
            className="trae-department-menu"
            role="menu"
            style={menuPosition}
          >
            <button
              type="button"
              onClick={() => {
                closeDepartmentMenu();
                onEditDepartment(menuNode);
              }}
            >
              <IconEditStroked aria-hidden="true" />
              {t("traeEnterprise.members.editDepartmentAction")}
            </button>
            <button
              type="button"
              onClick={() => {
                closeDepartmentMenu();
                onAddChildDepartment(menuNode.id);
              }}
            >
              <IconPlus aria-hidden="true" />
              {t("traeEnterprise.members.addChildDepartment")}
            </button>
            {hasPreviousSibling(nodes, menuNode.id) ? (
              <button
                type="button"
                onClick={() => {
                  closeDepartmentMenu();
                  onMoveUp(menuNode);
                }}
              >
                <IconChevronUp aria-hidden="true" />
                {t("traeEnterprise.departmentTable.moveUp")}
              </button>
            ) : null}
            {hasNextSibling(nodes, menuNode.id) ? (
              <button
                type="button"
                onClick={() => {
                  closeDepartmentMenu();
                  onMoveDown(menuNode);
                }}
              >
                <IconChevronDown aria-hidden="true" />
                {t("traeEnterprise.departmentTable.moveDown")}
              </button>
            ) : null}
            <button
              className="is-danger"
              type="button"
              onClick={() => {
                closeDepartmentMenu();
                onDeleteDepartment(menuNode);
              }}
            >
              <IconFile aria-hidden="true" />
              {t("traeEnterprise.members.deleteDepartment")}
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function DepartmentManagementTable({
  nodes,
  t,
  onAddDepartment,
  onAddChildDepartment,
  onEditDepartment,
  onShowDetails,
  onDeleteDepartment,
  onMoveDown,
  onMoveUp,
}: {
  nodes: TraeDepartmentNode[];
  t: Translate;
  onAddDepartment: () => void;
  onAddChildDepartment: (parentID: string) => void;
  onEditDepartment: (node: TraeDepartmentNode) => void;
  onShowDetails: (node: TraeDepartmentNode) => void;
  onDeleteDepartment: (node: TraeDepartmentNode) => void;
  onMoveDown: (node: TraeDepartmentNode) => void;
  onMoveUp: (node: TraeDepartmentNode) => void;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    company: true,
    operation: true,
    "test-level-one": true,
    "test-level-two": true,
  });
  const [selectedIDs, setSelectedIDs] = useState<Array<string | number>>([]);
  const [actionMenuID, setActionMenuID] = useState<string | null>(null);
  const [selectionMenuID, setSelectionMenuID] = useState<string | null>(null);
  useEffect(() => {
    if (!actionMenuID && !selectionMenuID) return undefined;
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !(target instanceof Element) ||
        !target.closest(".trae-department-table-more, .trae-department-table-selection")
      ) {
        setActionMenuID(null);
        setSelectionMenuID(null);
      }
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [actionMenuID, selectionMenuID]);
  const rows = flattenDepartmentTableRows(nodes, expanded).filter((node) =>
    !search.trim() || node.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const tableRows = rows.map(({ children: _children, ...row }) => row);

  function departmentCount(node: TraeDepartmentNode) {
    if (node.id === "company") return 4;
    if (node.id === "operation") return 2;
    return 0;
  }

  function collectBranchIDs(node: TraeDepartmentNode): string[] {
    return [node.id, ...(node.children ?? []).flatMap(collectBranchIDs)];
  }

  function selectBranch(node: TraeDepartmentNode, includeChildren: boolean) {
    const ids = includeChildren ? collectBranchIDs(node) : [node.id];
    setSelectedIDs((current) => Array.from(new Set([...current, ...ids])));
    setSelectionMenuID(null);
  }

  return (
    <section className="trae-departments-management">
      <div className="trae-departments-toolbar">
        <label className="trae-inline-search">
          <IconSearch aria-hidden="true" />
          <input
            aria-label={t("traeEnterprise.members.searchDepartment")}
            placeholder={t("traeEnterprise.members.searchDepartment")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button
          className="trae-primary-button trae-departments-add-button"
          type="button"
          onClick={onAddDepartment}
        >
          <IconPlus aria-hidden="true" />
          {t("traeEnterprise.members.newDepartment")}
        </button>
      </div>
      <Table
        className="trae-departments-table"
        dataSource={tableRows}
        empty={<TraeTableEmpty hint={t("traeEnterprise.common.noDataHint")} />}
        rowKey="id"
        pagination={false}
        rowSelection={{
          selectedRowKeys: selectedIDs,
          onChange: (keys) => setSelectedIDs(keys ?? []),
          width: 44,
        }}
        columns={[
          {
            title: t("traeEnterprise.members.department"),
            dataIndex: "name",
            key: "department",
            render: (_value, node) => (
              <div className="trae-department-table-name" style={{ paddingLeft: `${node.depth * 24}px` }}>
                {node.hasChildren ? (
                  <button
                    type="button"
                    aria-label={expanded[node.id] !== false ? "Collapse" : "Expand"}
                    onClick={() =>
                      setExpanded((current) => ({
                        ...current,
                        [node.id]: current[node.id] === false,
                      }))
                    }
                  >
                    {expanded[node.id] !== false ? <IconChevronDown aria-hidden="true" /> : <IconChevronRight aria-hidden="true" />}
                  </button>
                ) : (
                  <span className="trae-department-table-spacer" />
                )}
                {node.depth === 0 ? <IconApartment aria-hidden="true" /> : null}
                <span>{node.name}</span>
              </div>
            ),
          },
          {
            title: "",
            key: "selection-actions",
            width: 58,
            render: (_value, node) => {
              const sourceNode = findTraeDepartmentNode(nodes, node.id) ?? node;
              return (
                <div
                  className={`trae-department-table-selection${selectionMenuID === sourceNode.id ? " is-menu-open" : ""}`}
                >
                  <button
                    type="button"
                    aria-label={`${t("traeEnterprise.members.moreDepartmentActions")} ${sourceNode.name}`}
                    onClick={() => {
                      setActionMenuID(null);
                      setSelectionMenuID((current) => current === sourceNode.id ? null : sourceNode.id);
                    }}
                  >
                    <IconMoreStroked aria-hidden="true" />
                  </button>
                  {selectionMenuID === sourceNode.id ? (
                    <div className="trae-department-table-menu trae-department-selection-menu" role="menu">
                      <button type="button" onClick={() => selectBranch(sourceNode, false)}>
                        {t("traeEnterprise.departmentTable.selectCurrent")}
                      </button>
                      <button type="button" onClick={() => selectBranch(sourceNode, true)}>
                        {t("traeEnterprise.departmentTable.selectBranch")}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            },
          },
          {
            title: (
              <span className="trae-department-table-count-heading">
                {t("traeEnterprise.departmentTable.people")}
                <Tooltip className="app-info-tooltip" content={t("traeEnterprise.members.directMembers")}>
                  <IconInfoCircle className="app-info-icon" aria-hidden="true" />
                </Tooltip>
              </span>
            ),
            key: "count",
            width: 180,
            render: (_value, node) => departmentCount(node),
          },
          {
            title: t("traeEnterprise.departmentTable.operation"),
            key: "actions",
            width: 250,
            render: (_value, node) => {
              const sourceNode = findTraeDepartmentNode(nodes, node.id) ?? {
                id: node.id,
                name: node.name,
              };
              if (node.depth === 0) return null;
              return (
                <div className="trae-department-table-actions">
                <button type="button" onClick={() => onAddChildDepartment(sourceNode.id)}>
                  {t("traeEnterprise.members.addChildDepartment")}
                </button>
                <button type="button" onClick={() => onShowDetails(sourceNode)}>
                  {t("traeEnterprise.departmentTable.detail")}
                </button>
                <div className="trae-department-table-more">
                  <button
                    type="button"
                    aria-label={`${t("traeEnterprise.members.moreDepartmentActions")} ${sourceNode.name}`}
                    onClick={() => {
                      setSelectionMenuID(null);
                      setActionMenuID((current) => (current === sourceNode.id ? null : sourceNode.id));
                    }}
                  >
                    <IconMoreStroked aria-hidden="true" />
                  </button>
                  {actionMenuID === sourceNode.id ? (
                    <div className="trae-department-table-menu" role="menu">
                      {hasPreviousSibling(nodes, sourceNode.id) ? (
                        <button type="button" onClick={() => { setActionMenuID(null); onMoveUp(sourceNode); }}>
                          {t("traeEnterprise.departmentTable.moveUp")}
                        </button>
                      ) : null}
                      {hasNextSibling(nodes, sourceNode.id) ? (
                        <button type="button" onClick={() => { setActionMenuID(null); onMoveDown(sourceNode); }}>
                          {t("traeEnterprise.departmentTable.moveDown")}
                        </button>
                      ) : null}
                      <button type="button" className="is-danger" onClick={() => { setActionMenuID(null); onDeleteDepartment(sourceNode); }}>
                        {t("traeEnterprise.members.deleteDepartment")}
                      </button>
                      <button type="button" onClick={() => { setActionMenuID(null); onEditDepartment(sourceNode); }}>
                        {t("traeEnterprise.members.editDepartmentAction")}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              );
            },
          },
        ]}
      />
    </section>
  );
}

function TraeDepartmentPicker({
  nodes,
  value,
  onChange,
  label,
  disabledIDs,
}: {
  nodes: TraeDepartmentNode[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabledIDs?: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    company: true,
    operation: true,
    "test-level-one": true,
    "test-level-two": true,
  });
  const selected = findTraeDepartmentName(nodes, value);

  useEffect(() => {
    if (!open) return undefined;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [open]);

  function renderOptions(items: TraeDepartmentNode[], depth = 0): ReactNode[] {
    return items.flatMap((node) => {
      const hasChildren = Boolean(node.children?.length);
      const isExpanded = expanded[node.id] === true;
      const isDisabled = disabledIDs?.has(node.id) ?? false;
      const option = (
        <div
          className={`trae-department-picker-option${value === node.id ? " is-selected" : ""}${isDisabled ? " is-disabled" : ""}`}
          key={node.id}
          style={{ paddingLeft: `${10 + depth * 20}px` }}
          aria-disabled={isDisabled}
        >
          <span className="trae-department-picker-toggle">
            {hasChildren ? (
              <button
                type="button"
                aria-label={isExpanded ? "Collapse" : "Expand"}
                onClick={() =>
                  setExpanded((current) => ({
                    ...current,
                    [node.id]: !isExpanded,
                  }))
                }
              >
                {isExpanded ? (
                  <IconChevronDown aria-hidden="true" />
                ) : (
                  <IconChevronRight aria-hidden="true" />
                )}
              </button>
            ) : null}
          </span>
          <button
            className="trae-department-picker-label"
            type="button"
            disabled={isDisabled}
            onClick={() => {
              if (isDisabled) return;
              onChange(node.id);
              setOpen(false);
            }}
          >
            <span>{node.name}</span>
            {value === node.id ? <IconTick aria-hidden="true" /> : null}
          </button>
        </div>
      );
      return hasChildren && isExpanded
        ? [option, ...renderOptions(node.children ?? [], depth + 1)]
        : [option];
    });
  }
  return (
    <div ref={pickerRef} className="trae-department-picker">
      <button
        className="trae-department-picker-trigger"
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => {
          if (!open) {
            setExpanded(getTraeDepartmentExpansionForSelection(nodes, value));
          }
          setOpen((current) => !current);
        }}
      >
        <span>{selected ?? label}</span>
        <IconChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div className="trae-department-picker-dropdown">
          {renderOptions(nodes)}
        </div>
      ) : null}
    </div>
  );
}

type DepartmentDialogState = {
  mode: "add" | "edit" | "child";
  node?: TraeDepartmentNode;
  parentID?: string;
};

function TraeDepartmentDialog({
  state,
  nodes,
  t,
  onClose,
  onSubmit,
}: {
  state: DepartmentDialogState;
  nodes: TraeDepartmentNode[];
  t: Translate;
  onClose: () => void;
  onSubmit: (name: string, parentID: string, nodeID?: string) => void;
}) {
  const [name, setName] = useState(state.node?.name ?? "");
  const disabledParentDepartmentIDs =
    state.mode === "edit" && state.node
      ? collectTraeDepartmentBranchIDs(state.node)
      : undefined;
  const [parentID, setParentID] = useState(
    state.parentID ??
      (state.mode === "edit" && state.node
        ? findTraeParentDepartmentID(nodes, state.node.id)
        : undefined) ??
      "company",
  );
  const title =
    state.mode === "edit"
      ? t("traeEnterprise.members.editDepartmentTitle")
      : t("traeEnterprise.members.newDepartmentTitle");
  return (
    <TraeDialog title={title} onClose={onClose}>
      <Form<{ name: string }>
        className="trae-dialog-form trae-department-dialog-form"
        labelPosition="top"
        initValues={{ name }}
        autoScrollToError
        showValidateIcon={false}
        onValueChange={(values) => {
          if (typeof values.name === "string") setName(values.name);
        }}
        onSubmit={(values) => {
          if (disabledParentDepartmentIDs?.has(parentID)) return;
          onSubmit(values.name.trim(), parentID, state.node?.id);
        }}
      >
        <Form.Input
          field="name"
          label={t("traeEnterprise.members.departmentName")}
          rules={[
            {
              required: true,
              message: t("traeEnterprise.members.departmentNamePlaceholder"),
            },
          ]}
          maxLength={30}
          placeholder={t("traeEnterprise.members.departmentNamePlaceholder")}
          suffix={<small>{name.length}/30</small>}
        />
        {state.mode === "edit" ? (
          <Form.Input
            field="departmentID"
            label={t("traeEnterprise.members.departmentID")}
            initValue={state.node?.id ?? ""}
            disabled
          />
        ) : null}
        <Form.Slot
          label={t("traeEnterprise.members.parentDepartment")}
          className="trae-department-parent-field"
        >
            <TraeDepartmentPicker
              nodes={nodes}
              value={parentID}
              onChange={setParentID}
              label={t("traeEnterprise.members.parentDepartment")}
              disabledIDs={disabledParentDepartmentIDs}
            />
        </Form.Slot>
        <div className="trae-dialog-actions">
          <button
            className="trae-secondary-button"
            type="button"
            onClick={onClose}
          >
            {t("traeEnterprise.common.cancel")}
          </button>
          <button className="trae-primary-button" type="submit">
            {t("traeEnterprise.common.confirm")}
          </button>
        </div>
      </Form>
    </TraeDialog>
  );
}

type TraeMemberAction = "changeDepartment" | "changeRole" | "removeMember";

function TraeMemberActionDialog({
  action,
  members,
  nodes,
  t,
  onClose,
  onComplete,
}: {
  action: TraeMemberAction;
  members: TraeMemberRow[];
  nodes: TraeDepartmentNode[];
  t: Translate;
  onClose: () => void;
  onComplete: (values: { departmentID?: string; role?: "admin" | "member" }) => void | Promise<void>;
}) {
  const member = members[0];
  const memberCount = members.length;
  const [departmentID, setDepartmentID] = useState("company");
  const [role, setRole] = useState<"admin" | "member">(
    member?.role === "member" ? "member" : "admin",
  );
  const title = t(`traeEnterprise.members.${action}`);
  const complete = async () => {
    await onComplete(action === "changeDepartment" ? { departmentID } : action === "changeRole" ? { role } : {});
    onClose();
  };
  const actions = (
    <div className="trae-dialog-actions">
      <button className="trae-secondary-button" type="button" onClick={onClose}>
        {t("traeEnterprise.common.cancel")}
      </button>
      <button className="trae-primary-button" type="button" onClick={complete}>
        {t("traeEnterprise.common.confirm")}
      </button>
    </div>
  );

  if (action === "changeDepartment") {
    return (
      <TraeDialog className="trae-member-action-dialog trae-member-action-dialog--department" title={title} onClose={onClose}>
        <div className="trae-member-action-content">
          <p>{t("traeEnterprise.memberDialogs.changeDepartmentHint", { count: memberCount })}</p>
          <label className="trae-member-action-field">
            <span><b>*</b>{t("traeEnterprise.memberDialogs.department")}</span>
            <TraeDepartmentPicker
              nodes={nodes}
              value={departmentID}
              onChange={setDepartmentID}
              label={t("traeEnterprise.memberDialogs.department")}
            />
          </label>
          {actions}
        </div>
      </TraeDialog>
    );
  }

  if (action === "removeMember") {
    return (
      <TraeDialog
        className="trae-member-action-dialog trae-member-action-dialog--remove"
        title={<span className="trae-dialog-title-with-icon"><IconInfoCircle aria-hidden="true" />{title}</span>}
        onClose={onClose}
      >
        <div className="trae-member-action-content">
          <p>
            {t("traeEnterprise.memberDialogs.removeHint", { count: memberCount })}{" "}
            <button className="trae-member-action-link" type="button" onClick={() => showTraeToast(t("traeEnterprise.memberDialogs.learnMore"))}>
              {t("traeEnterprise.memberDialogs.learnMore")}
            </button>
          </p>
          <div className="trae-member-action-member">
            {members.map((item) => (
              <span key={item.id}>{item.name}({item.email})</span>
            ))}
          </div>
          <div className="trae-dialog-actions">
            <button className="trae-secondary-button" type="button" onClick={onClose}>
              {t("traeEnterprise.common.cancel")}
            </button>
            <button className="trae-primary-button trae-danger-button" type="button" onClick={complete}>
              {t("traeEnterprise.members.removeMember")}
            </button>
          </div>
        </div>
      </TraeDialog>
    );
  }

  return (
    <TraeDialog className="trae-member-action-dialog trae-member-action-dialog--role" title={title} onClose={onClose}>
      <div className="trae-member-action-content">
        <p>
          {memberCount === 1
            ? t("traeEnterprise.memberDialogs.roleHint", { name: member.name })
            : t("traeEnterprise.memberDialogs.roleBatchHint", { count: memberCount })}
        </p>
        <div className="trae-role-options" role="radiogroup">
          <label className={`trae-role-option${role === "admin" ? " is-selected" : ""}`}>
            <input type="radio" name="member-role" value="admin" checked={role === "admin"} onChange={() => setRole("admin")} />
            <span>
              <strong>{t("traeEnterprise.memberDialogs.roleAdmin")}</strong>
              <small>{t("traeEnterprise.memberDialogs.roleAdminHint")}</small>
            </span>
          </label>
          <label className={`trae-role-option${role === "member" ? " is-selected" : ""}`}>
            <input type="radio" name="member-role" value="member" checked={role === "member"} onChange={() => setRole("member")} />
            <span>
              <strong>{t("traeEnterprise.memberDialogs.roleMember")}</strong>
              <small>{t("traeEnterprise.memberDialogs.roleMemberHint")}</small>
            </span>
          </label>
        </div>
        {actions}
      </div>
    </TraeDialog>
  );
}

function TraeDepartmentDetailDialog({
  node,
  nodes,
  t,
  onClose,
  onEdit,
}: {
  node: TraeDepartmentNode;
  nodes: TraeDepartmentNode[];
  t: Translate;
  onClose: () => void;
  onEdit: () => void;
}) {
  const parentID = findTraeParentDepartmentID(nodes, node.id);
  return (
    <TraeDialog
      className="trae-department-detail-dialog"
      title={t("traeEnterprise.departmentTable.detailTitle")}
      onClose={onClose}
    >
      <div className="trae-department-detail-content">
        <dl>
          <div>
            <dt>{t("traeEnterprise.members.departmentName")}</dt>
            <dd>{node.name}</dd>
          </div>
          <div>
            <dt>{t("traeEnterprise.members.departmentID")}</dt>
            <dd>{node.id}</dd>
          </div>
          <div>
            <dt>{t("traeEnterprise.members.parentDepartment")}</dt>
            <dd>{parentID ? findTraeDepartmentName(nodes, parentID) : "-"}</dd>
          </div>
        </dl>
        <div className="trae-dialog-actions">
          <button className="trae-secondary-button" type="button" onClick={onClose}>
            {t("traeEnterprise.common.confirm")}
          </button>
          <button className="trae-primary-button" type="button" onClick={onEdit}>
            <IconEditStroked aria-hidden="true" />
            {t("traeEnterprise.members.editDepartment")}
          </button>
        </div>
      </div>
    </TraeDialog>
  );
}

export function TraeEnterpriseMembersPage() {
  const { t } = useTranslation();
  return (
    <EnterprisePageShell
      title={t("traeEnterprise.members.title")}
      description={t("traeEnterprise.members.departmentDetail")}
      className="trae-enterprise-members-shell"
      showHeader={false}
    >
      {(context) => <TraeEnterpriseMembersContent context={context} />}
    </EnterprisePageShell>
  );
}

function TraeEnterpriseMembersContent({ context }: { context: EnterpriseContext }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"people" | "departments" | "requests" | "invitations">(
    "people",
  );
  const [collapsed, setCollapsed] = useState(false);
  const [selectedDepartmentID, setSelectedDepartmentID] = useState("company");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [dialog, setDialog] = useState<"member" | "rules" | null>(null);
  const [memberActionDialog, setMemberActionDialog] = useState<{
    action: TraeMemberAction;
    members: TraeMemberRow[];
  } | null>(null);
  const [departmentDialog, setDepartmentDialog] =
    useState<DepartmentDialogState | null>(null);
  const [departmentDeleteNode, setDepartmentDeleteNode] =
    useState<TraeDepartmentNode | null>(null);
  const [departmentDeleteBlockedNode, setDepartmentDeleteBlockedNode] =
    useState<TraeDepartmentNode | null>(null);
  const [departmentDetailNode, setDepartmentDetailNode] =
    useState<TraeDepartmentNode | null>(null);
  const [memberMenu, setMemberMenu] = useState<string | null>(null);
  const [memberMenuPosition, setMemberMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const memberMenuRef = useRef<HTMLDivElement>(null);
  const memberMenuPortalRef = useRef<HTMLDivElement>(null);
  const [memberAddMenuOpen, setMemberAddMenuOpen] = useState(false);
  const [invitationCreateOpen, setInvitationCreateOpen] = useState(false);
  const memberAddMenuRef = useRef<HTMLDivElement>(null);
  const [selectedMemberIDs, setSelectedMemberIDs] = useState<
    Array<string | number>
  >([]);
  const [departments, setDepartments] = useState<TraeDepartmentNode[]>([]);
  const [members, setMembers] = useState<TraeMemberRow[]>([]);
  const [memberTotal, setMemberTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ message: string; requestId: string | null } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const currentOperatorMemberID = context.member_id;
  const currentOperatorRole = (context.role === "owner" ? "owner" : context.role === "administrator" ? "admin" : "member") as TraeMemberRole;
  const canManageProtectedActions = currentOperatorRole === "owner";
  const handleError = useEnterpriseErrorHandler();
  useEffect(() => {
    // Keep typing responsive while coalescing rapid keystrokes into one list request.
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setLoadError(null);
    loadEnterpriseDepartmentTree(context.id, controller.signal)
      .then((tree) => {
        if (!active) return;
        const root: TraeDepartmentNode = { id: "company", name: context.name, children: tree, childCount: tree.length, isVirtual: true };
        const nextTree = [root];
        setDepartments(nextTree);
        setSelectedDepartmentID((current) => current === "company" || findTraeDepartmentNode(nextTree, current) ? current : "company");
      })
      .catch((reason: unknown) => {
        if (!active || controller.signal.aborted) return;
        const handled = handleError(reason);
        if (handled) setLoadError(handled);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [context.id, handleError, reloadToken]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setLoadError(null);
    const commonOptions = { page: 1, page_size: 10, signal: controller.signal, accessToken: getAccessToken() ?? undefined };
    const request = selectedDepartmentID === "company"
      ? getEnterpriseMembers({ enterprise_id: context.id }, { ...commonOptions, keyword: debouncedQuery.trim() || undefined, status: status !== "all" ? status : undefined })
      : getEnterpriseDepartmentMembers({ enterprise_id: context.id }, selectedDepartmentID, { ...commonOptions, name: debouncedQuery.trim() || undefined });
    request
      .then((result) => {
        if (!active) return;
        const rows = result.items.map(toTraeMemberRow).filter((row) => status === "all" || row.status === status);
        setMembers(rows);
        setMemberTotal(result.total);
      })
      .catch((reason: unknown) => {
        if (!active || controller.signal.aborted) return;
        const handled = handleError(reason);
        if (handled) setLoadError(handled);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [context.id, debouncedQuery, handleError, reloadToken, selectedDepartmentID, status]);
  useEffect(() => {
    if (!memberMenu) return undefined;
    // Each action menu owns one ref, so clicks in any other page region dismiss it.
    const handleOutsidePointer = (event: PointerEvent) => {
      if (
        !memberMenuRef.current?.contains(event.target as Node) &&
        !memberMenuPortalRef.current?.contains(event.target as Node)
      ) {
        setMemberMenu(null);
        setMemberMenuPosition(null);
      }
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [memberMenu]);
  useEffect(() => {
    if (!memberAddMenuOpen) return undefined;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!memberAddMenuRef.current?.contains(event.target as Node))
        setMemberAddMenuOpen(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [memberAddMenuOpen]);
  const filtered = useMemo(
    () =>
      members.filter(
        (item) =>
          (!debouncedQuery.trim() ||
            `${item.name} ${item.email}`
              .toLowerCase()
              .includes(debouncedQuery.trim().toLowerCase())) &&
          (status === "all" || item.status === status),
      ),
    [debouncedQuery, members, status],
  );
  const selectedMembers = useMemo(
    () =>
      members.filter((member) => selectedMemberIDs.includes(member.id)),
    [members, selectedMemberIDs],
  );
  function submitMember(_values: { email: string; role: string }) {
    setDialog(null);
    showTraeToast(t("traeEnterprise.members.addSuccess"));
  }
  function handleBulkMemberAction(action: TraeMemberBulkAction) {
    if (
      action === "changeDepartment" ||
      action === "changeRole" ||
      action === "removeMember"
    ) {
      setMemberActionDialog({ action, members: selectedMembers });
      return;
    }
    showTraeToast(t(`traeEnterprise.members.${action}`));
    setSelectedMemberIDs([]);
  }
  async function saveDepartment(name: string, parentID: string, nodeID?: string) {
    setLoadError(null);
    try {
      if (nodeID) {
        const node = findTraeDepartmentNode(departments, nodeID);
        if (!node?.version) return;
        await updateEnterpriseDepartment(
          { enterprise_id: context.id },
          nodeID,
          {
            name,
            parent_id: parentID === "company" ? "" : parentID,
            expected_version: node.version,
            daily_cost_limit_yuan: node.limits?.configured.daily_cost_limit_yuan ?? null,
            weekly_cost_limit_yuan: node.limits?.configured.weekly_cost_limit_yuan ?? null,
            monthly_cost_limit_yuan: node.limits?.configured.monthly_cost_limit_yuan ?? null,
            concurrency_limit: node.limits?.configured.concurrency_limit ?? null,
            rpm_limit: node.limits?.configured.rpm_limit ?? null,
            tpm_limit: node.limits?.configured.tpm_limit ?? null,
          },
        );
      } else {
        await createEnterpriseDepartment(
          { enterprise_id: context.id },
          { name, parent_id: parentID === "company" ? null : parentID },
        );
      }
      setDepartmentDialog(null);
      setReloadToken((value) => value + 1);
      showTraeToast(t("traeEnterprise.common.success"));
    } catch (reason: unknown) {
      const handled = handleError(reason);
      if (handled) setLoadError(handled);
    }
  }
  const treeProps = {
    t,
    nodes: departments,
    collapsed,
    selectedID: selectedDepartmentID,
    onSelect: setSelectedDepartmentID,
    onToggle: () => setCollapsed((value) => !value),
    onAddDepartment: (parentID?: string) =>
      setDepartmentDialog({
        mode: parentID ? "child" : "add",
        parentID: parentID ?? "company",
      }),
    onEditDepartment: (node: TraeDepartmentNode) => {
      if (!node.isVirtual) setDepartmentDialog({ mode: "edit", node });
    },
    onAddChildDepartment: (parentID: string) =>
      setDepartmentDialog({ mode: "child", parentID }),
    onDeleteDepartment: (node: TraeDepartmentNode) => {
      if (node.isVirtual) return;
      if (node.children?.length) setDepartmentDeleteBlockedNode(node);
      else setDepartmentDeleteNode(node);
    },
    onMoveUp: (node: TraeDepartmentNode) => {
      if (node.isVirtual) return;
      setDepartments((current) => moveDepartmentUp(current, node.id));
      showTraeToast(t("traeEnterprise.departmentTable.moveUp"));
    },
    onMoveDown: (node: TraeDepartmentNode) => {
      if (node.isVirtual) return;
      setDepartments((current) => moveDepartmentDown(current, node.id));
      showTraeToast(t("traeEnterprise.departmentTable.moveDown"));
    },
  };
  async function confirmDeleteDepartment() {
    if (!departmentDeleteNode) return;
    try {
      await deleteEnterpriseDepartment({ enterprise_id: context.id }, departmentDeleteNode.id, departmentDeleteNode.version ?? 0);
      if (selectedDepartmentID === departmentDeleteNode.id) setSelectedDepartmentID("company");
      setDepartmentDeleteNode(null);
      setReloadToken((value) => value + 1);
      showTraeToast(t("traeEnterprise.members.deleteDepartmentSuccess"));
    } catch (reason: unknown) {
      const handled = handleError(reason);
      if (handled) setLoadError(handled);
    }
  }
  return (
    <div className="trae-page trae-members-page">
      <header className="trae-members-header">
        <div className="trae-members-header-main">
          <h1>{t("traeEnterprise.members.title")}</h1>
          <div className="trae-members-header-stats" aria-label={t("traeEnterprise.members.seats")}>
            <span>{t("traeEnterprise.members.seats")} <b>{TRAE_MEMBER_SEAT_SUMMARY.total}</b></span>
            <span>{t("traeEnterprise.members.occupied")} <b>{TRAE_MEMBER_SEAT_SUMMARY.allOccupied}/{TRAE_MEMBER_SEAT_SUMMARY.allCapacity}</b></span>
            <span>{t("traeEnterprise.members.workOccupied")} <b>{TRAE_MEMBER_SEAT_SUMMARY.workOccupied}/{TRAE_MEMBER_SEAT_SUMMARY.workCapacity}</b></span>
          </div>
        </div>
        <div className="trae-page-heading-action">
          <div ref={memberAddMenuRef} className="trae-member-add-action">
            <button
              className="trae-primary-button"
              type="button"
              aria-expanded={memberAddMenuOpen}
              onClick={() => setMemberAddMenuOpen((open) => !open)}
            >
              <IconUserAdd aria-hidden="true" />
              {t("traeEnterprise.members.add")}
              <IconChevronDown aria-hidden="true" />
            </button>
            {memberAddMenuOpen ? (
              <div className="trae-member-add-menu" role="menu">
                <button
                  type="button"
                  onClick={() => {
                    setMemberAddMenuOpen(false);
                    setTab("invitations");
                    setInvitationCreateOpen(true);
                  }}
                >
                  <IconLink aria-hidden="true" />
                  {t("traeEnterprise.members.linkInvite")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <ConsoleTabs
        items={(["people", "departments", "requests", "invitations"] as const).map((item) => ({
          itemKey: item,
          tab: item === "invitations" ? t("traeEnterprise.inviteList.tab") : t(`traeEnterprise.members.tabs.${item}`),
        }))}
        activeKey={tab}
        onChange={(value) => {
          const nextTab = value as "people" | "departments" | "requests" | "invitations";
          setTab(nextTab);
          if (nextTab !== "invitations") setInvitationCreateOpen(false);
        }}
        ariaLabel={t("traeEnterprise.members.title")}
      />
      {tab === "people" ? (
        <div
          className={`trae-members-workspace${collapsed ? " is-department-tree-collapsed" : ""}`}
        >
          <DepartmentTree {...treeProps} />
          <section className="trae-members-table-panel">
            <div className="trae-members-selection-heading">
              {collapsed ? (
                <button
                  className="trae-department-expand-button"
                  type="button"
                  aria-label={t("traeEnterprise.members.expandTree")}
                  onClick={() => setCollapsed(false)}
                >
                  <IconChevronRight aria-hidden="true" />
                </button>
              ) : null}
              <h2>
                {findTraeDepartmentName(departments, selectedDepartmentID)}
              </h2>
              <div>
                <span>
                  {t("traeEnterprise.members.totalMembers")} <b>{memberTotal}</b>
                </span>
                <span>
                  {t("traeEnterprise.members.joinedMembers")} <b>{members.filter((member) => member.status === "active").length}</b>
                </span>
              </div>
            </div>
            <TraeToolbar>
              <label className="trae-inline-search trae-inline-search--wide">
                <IconSearch aria-hidden="true" />
                <input
                  aria-label={t("traeEnterprise.members.searchPeople")}
                  placeholder={t("traeEnterprise.members.searchPeople")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <TraeSelect
                label={t("traeEnterprise.members.direct")}
                value="all"
                onChange={() => undefined}
                dropdownClassName="trae-members-filter-dropdown"
                options={[
                  { value: "all", label: t("traeEnterprise.members.direct") },
                ]}
              />
              <TraeSelect
                label={t("traeEnterprise.members.status")}
                value={status}
                onChange={setStatus}
                dropdownClassName="trae-members-filter-dropdown"
                options={[
                  { value: "all", label: t("traeEnterprise.members.status") },
                  {
                    value: "active",
                    label: t("traeEnterprise.members.active"),
                  },
                  {
                    value: "pending",
                    label: t("traeEnterprise.members.pending"),
                  },
                  {
                    value: "suspended",
                    label: t("traeEnterprise.members.suspended"),
                  },
                ]}
              />
            </TraeToolbar>
            <div className="trae-table-scroll">
              {loadError ? (
                <EnterpriseError message={loadError.message} requestId={loadError.requestId} onRetry={() => setReloadToken((value) => value + 1)} />
              ) : loading && members.length === 0 ? (
                <EnterpriseLoading label={t("console.enterprise.loadData")} />
              ) : <Table
                className="trae-semi-member-table"
                dataSource={filtered}
                rowKey="id"
                pagination={false}
                rowSelection={{
                  selectedRowKeys: selectedMemberIDs,
                  onChange: (keys) => setSelectedMemberIDs(keys ?? []),
                  width: 44,
                }}
                columns={[
                  {
                    title: t("traeEnterprise.members.person"),
                    dataIndex: "name",
                    key: "person",
                    render: (_value, member) => (
                      <span className="trae-person-cell">
                        <span>
                          <strong>{member.name}</strong>
                          <small>{member.email}</small>
                        </span>
                      </span>
                    ),
                  },
                  {
                    title: (
                      <>
                        {t("traeEnterprise.members.state")}{" "}
                        <Tooltip
                          className="trae-status-rules-popover"
                          content={<MemberStatusRulesTooltip t={t} />}
                          position="bottom"
                        >
                          <button
                            className="app-info-icon-trigger"
                            type="button"
                            aria-label={t("traeEnterprise.members.stateRules")}
                            onClick={() => setDialog("rules")}
                          >
                            <IconInfoCircle className="app-info-icon" aria-hidden="true" />
                          </button>
                        </Tooltip>
                      </>
                    ),
                    dataIndex: "status",
                    key: "state",
                    render: (value) => (
                      <MemberStatus value={String(value)} t={t} />
                    ),
                  },
                  {
                    title: t("traeEnterprise.members.role"),
                    dataIndex: "role",
                    key: "role",
                    render: (value) =>
                      value === "admin"
                        ? t("traeEnterprise.members.owner")
                        : value === "owner"
                          ? t("traeEnterprise.members.admin")
                          : t("traeEnterprise.members.member"),
                  },
                  {
                    title: t("traeEnterprise.members.type"),
                    dataIndex: "account",
                    key: "type",
                  },
                  {
                    title: t("traeEnterprise.members.joined"),
                    dataIndex: "joined",
                    key: "joined",
                    sorter: (a, b) =>
                      String(a?.joined ?? "").localeCompare(
                        String(b?.joined ?? ""),
                      ),
                  },
                  {
                    title: t("traeEnterprise.members.department"),
                    dataIndex: "department",
                    key: "department",
                  },
                  {
                    title: t("traeEnterprise.members.more"),
                    key: "actions",
                    width: 58,
                    render: (_value, member) => (
                      <div
                        ref={
                          memberMenu === member.id ? memberMenuRef : undefined
                        }
                        className="trae-table-action-cell"
                      >
                        <button
                          type="button"
                          aria-label={`${t("traeEnterprise.members.more")} ${member.name}`}
                          onClick={(event) => {
                            if (memberMenu === member.id) {
                              setMemberMenu(null);
                              setMemberMenuPosition(null);
                              return;
                            }
                            const anchor = event.currentTarget.getBoundingClientRect();
                            setMemberMenuPosition({
                              top: anchor.bottom + 4,
                              left: Math.max(
                                8,
                                Math.min(anchor.right - 180, window.innerWidth - 188),
                              ),
                            });
                            setMemberMenu(member.id);
                          }}
                        >
                          <IconMoreStroked aria-hidden="true" />
                        </button>
                        {memberMenu === member.id && memberMenuPosition
                          ? createPortal(
                              <div
                                ref={memberMenuPortalRef}
                                className="trae-row-menu trae-row-menu--portal"
                                role="menu"
                                style={memberMenuPosition}
                              >
                            {(member.role === "owner"
                              ? [
                                  ["changeDepartment", false],
                                  ["transferSuperAdmin", !canManageProtectedActions],
                                ]
                              : [
                                  ["changeDepartment", false],
                                  ["changeRole", false],
                                  ["removeMember", false],
                                ]
                            ).map(([action, disabled]) => {
                              const actionKey = String(action) as
                                | "changeDepartment"
                                | "changeRole"
                                | "transferSuperAdmin"
                                | "removeMember";
                              const isDanger = actionKey === "removeMember";
                              return (
                                <button
                                  key={actionKey}
                                  className={isDanger ? "is-danger" : undefined}
                                  type="button"
                                  disabled={Boolean(disabled)}
                                  onClick={() => {
                                    setMemberMenu(null);
                                    if (
                                      actionKey === "changeDepartment" ||
                                      actionKey === "changeRole" ||
                                      actionKey === "removeMember"
                                    ) {
                                      setMemberActionDialog({ action: actionKey, members: [member] });
                                    } else {
                                      showTraeToast(t(`traeEnterprise.members.${actionKey}`));
                                    }
                                  }}
                                >
                                  {t(`traeEnterprise.members.${actionKey}`)}
                                </button>
                              );
                            })}
                              </div>,
                              document.body,
                            )
                          : null}
                      </div>
                    ),
                  },
                ]}
                empty={
                  filtered.length === 0 ? (
                    <TraeTableEmpty hint={t("traeEnterprise.members.empty")} />
                  ) : undefined
                }
              />}
              <TraeMemberBulkActions
                members={selectedMembers}
                operator={{
                  memberID: currentOperatorMemberID,
                  role: currentOperatorRole,
                }}
                onCancel={() => setSelectedMemberIDs([])}
                onAction={handleBulkMemberAction}
              />
            </div>
          </section>
        </div>
      ) : tab === "departments" ? (
        <DepartmentManagementTable
          nodes={departments}
          t={t}
          onAddDepartment={() =>
            setDepartmentDialog({ mode: "add", parentID: "company" })
          }
          onAddChildDepartment={(parentID) =>
            setDepartmentDialog({ mode: "child", parentID })
          }
          onEditDepartment={(node) => { if (!node.isVirtual) setDepartmentDialog({ mode: "edit", node }); }}
          onShowDetails={(node) => setDepartmentDetailNode(node)}
          onDeleteDepartment={(node) => {
            if (node.isVirtual) return;
            if (node.children?.length) setDepartmentDeleteBlockedNode(node);
            else setDepartmentDeleteNode(node);
          }}
          onMoveDown={(node) => {
            if (node.isVirtual) return;
            setDepartments((current) => moveDepartmentDown(current, node.id));
            showTraeToast(t("traeEnterprise.departmentTable.moveDown"));
          }}
          onMoveUp={(node) => {
            if (node.isVirtual) return;
            setDepartments((current) => moveDepartmentUp(current, node.id));
            showTraeToast(t("traeEnterprise.departmentTable.moveUp"));
          }}
        />
      ) : tab === "requests" ? (
        <TraeEnterpriseJoinRequests
          context={context}
          onReviewed={() => setReloadToken((value) => value + 1)}
        />
      ) : (
        <TraeEnterpriseInvitations
          context={context}
          createOpen={invitationCreateOpen}
          onCreateOpenChange={setInvitationCreateOpen}
        />
      )}
      {dialog === "member" ? (
        <TraeDialog
          title={t("traeEnterprise.members.addTitle")}
          onClose={() => setDialog(null)}
        >
          <Form<{ email: string; role: string }>
            className="trae-dialog-form"
            labelPosition="top"
            initValues={{ email: "", role: "member" }}
            autoScrollToError
            showValidateIcon={false}
            onSubmit={submitMember}
          >
            <Form.Input
              field="email"
              label={t("traeEnterprise.members.email")}
              type="email"
              rules={[
                {
                  required: true,
                  message: t("traeEnterprise.members.emailPlaceholder"),
                },
                {
                  type: "email",
                  message: t("traeEnterprise.members.emailPlaceholder"),
                },
              ]}
              placeholder={t("traeEnterprise.members.emailPlaceholder")}
            />
            <Form.Select
              field="role"
              label={t("traeEnterprise.members.roleLabel")}
            >
              <Form.Select.Option value="member">
                {t("traeEnterprise.members.member")}
              </Form.Select.Option>
              <Form.Select.Option value="admin">
                {t("traeEnterprise.members.admin")}
              </Form.Select.Option>
            </Form.Select>
            <div className="trae-dialog-actions">
              <button
                className="trae-secondary-button"
                type="button"
                onClick={() => setDialog(null)}
              >
                {t("traeEnterprise.common.cancel")}
              </button>
              <button className="trae-primary-button" type="submit">
                {t("traeEnterprise.common.confirm")}
              </button>
            </div>
          </Form>
        </TraeDialog>
      ) : null}
      {dialog === "rules" ? (
        <TraeDialog
          title={t("traeEnterprise.members.stateRules")}
          onClose={() => setDialog(null)}
        >
          <div className="trae-rule-list">
            <div>
              <span className="trae-status-badge is-active">
                <i />
                {t("traeEnterprise.members.active")}
              </span>
              <p>{t("traeEnterprise.members.ruleActive")}</p>
            </div>
            <div>
              <span className="trae-status-badge is-pending">
                <i />
                {t("traeEnterprise.members.pending")}
              </span>
              <p>{t("traeEnterprise.members.rulePending")}</p>
            </div>
            <div>
              <span className="trae-status-badge is-suspended">
                <i />
                {t("traeEnterprise.members.suspended")}
              </span>
              <p>{t("traeEnterprise.members.ruleSuspended")}</p>
            </div>
          </div>
        </TraeDialog>
      ) : null}
      {memberActionDialog ? (
        <TraeMemberActionDialog
          action={memberActionDialog.action}
          members={memberActionDialog.members}
          nodes={departments}
          t={t}
          onClose={() => setMemberActionDialog(null)}
          onComplete={async ({ departmentID, role }) => {
            try {
              for (const member of memberActionDialog.members) {
                if (memberActionDialog.action === "changeDepartment" && departmentID) {
                  await updateEnterpriseMemberDepartment(
                    { enterprise_id: context.id },
                    member.id,
                    { department_id: departmentID, expected_version: member.version },
                  );
                } else if (memberActionDialog.action === "changeRole" && role) {
                  await updateEnterpriseMemberRole(
                    { enterprise_id: context.id },
                    member.id,
                    { role: role === "admin" ? "administrator" : "member", expected_version: member.version },
                  );
                } else if (memberActionDialog.action === "removeMember") {
                  await removeEnterpriseMember({ enterprise_id: context.id }, member.id, member.version);
                }
              }
              showTraeToast(t(`traeEnterprise.members.${memberActionDialog.action}`));
              setSelectedMemberIDs([]);
              setReloadToken((value) => value + 1);
            } catch (reason: unknown) {
              const handled = handleError(reason);
              if (handled) setLoadError(handled);
            }
          }}
        />
      ) : null}
      {departmentDialog ? (
        <TraeDepartmentDialog
          state={departmentDialog}
          nodes={departments}
          t={t}
          onClose={() => setDepartmentDialog(null)}
          onSubmit={saveDepartment}
        />
      ) : null}
      {departmentDetailNode ? (
        <TraeDepartmentDetailDialog
          node={departmentDetailNode}
          nodes={departments}
          t={t}
          onClose={() => setDepartmentDetailNode(null)}
          onEdit={() => {
            const node = departmentDetailNode;
            setDepartmentDetailNode(null);
            setDepartmentDialog({ mode: "edit", node });
          }}
        />
      ) : null}
      {departmentDeleteBlockedNode ? (
        <TraeDialog
          className="trae-confirm-dialog"
          title={t("traeEnterprise.departmentTable.deleteBlockedTitle")}
          onClose={() => setDepartmentDeleteBlockedNode(null)}
        >
          <div className="trae-confirm-dialog-content">
            <p>{t("traeEnterprise.departmentTable.deleteBlockedHint")}</p>
            <div className="trae-dialog-actions">
              <button
                className="trae-primary-button"
                type="button"
                onClick={() => setDepartmentDeleteBlockedNode(null)}
              >
                {t("traeEnterprise.common.confirm")}
              </button>
            </div>
          </div>
        </TraeDialog>
      ) : null}
      {departmentDeleteNode ? (
        <TraeDialog
          className="trae-confirm-dialog"
          title={t("traeEnterprise.memberDialogs.deleteDepartmentConfirmTitle")}
          onClose={() => setDepartmentDeleteNode(null)}
        >
          <div className="trae-confirm-dialog-content">
            <p>{t("traeEnterprise.memberDialogs.deleteDepartmentConfirmHint")}</p>
            <div className="trae-dialog-actions">
              <button
                className="trae-secondary-button"
                type="button"
                onClick={() => setDepartmentDeleteNode(null)}
              >
                {t("traeEnterprise.common.cancel")}
              </button>
              <button
                className="trae-primary-button trae-danger-button"
                type="button"
                onClick={confirmDeleteDepartment}
              >
                {t("traeEnterprise.common.confirm")}
              </button>
            </div>
          </div>
        </TraeDialog>
      ) : null}
    </div>
  );
}

function ProgressBar({ value, tone = "" }: { value: number; tone?: string }) {
  return (
    <div className={`trae-progress ${tone}`}>
      <i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function TraeEnterpriseSubscriptionPage() {
  const { t } = useTranslation();
  return (
    <TraeShell
      className="trae-subscription-page"
      title={t("traeEnterprise.subscription.title")}
      action={
        <button
          className="trae-secondary-button trae-subscription-manage-button"
          type="button"
        >
          <IconExternalOpen aria-hidden="true" />
          {t("traeEnterprise.subscription.goManage")}
        </button>
      }
    >
      <TraeSection title={t("traeEnterprise.subscription.plan")}>
        <div className="trae-subscription-top">
          <article className="trae-subscription-card">
            <span>{t("traeEnterprise.subscription.current")}</span>
            <strong>
              <span className="trae-subscription-icon"><IconApartment aria-hidden="true" /></span>
              {t("traeEnterprise.subscription.flagship")}{" "}
              <small>{t("traeEnterprise.subscription.active")}</small>
            </strong>
          </article>
          <article className="trae-subscription-card">
            <span>{t("traeEnterprise.subscription.expiry")}</span>
            <strong>
              <span className="trae-subscription-icon"><IconCalendar aria-hidden="true" /></span>
              2026/09/21
            </strong>
            <button
              className="trae-secondary-button trae-subscription-renew-button"
              type="button"
            >
              {t("traeEnterprise.subscription.renew")}
            </button>
          </article>
        </div>
        <div className="trae-subscription-capacity">
          <div className="trae-capacity-block">
            <div className="trae-capacity-heading">
              <span>
                {t("traeEnterprise.subscription.seats")}{" "}
                <small>{t("traeEnterprise.subscription.seatHint")}</small>
              </span>
              <button
                className="trae-secondary-button"
                type="button"
              >
                {t("traeEnterprise.subscription.addSeats")}
              </button>
            </div>
            <strong className="trae-capacity-number"><i><IconUserGroup aria-hidden="true" /></i>4 / 10</strong>
            <div className="trae-capacity-legend trae-capacity-legend--split">
              <span className="is-green">{t("traeEnterprise.subscription.allAccount")} 10</span>
              <span className="is-purple">{t("traeEnterprise.subscription.workAccount")} 20</span>
            </div>
            <ProgressBar value={40} tone="is-mixed" />
          </div>
          <div className="trae-capacity-block">
            <div className="trae-capacity-heading">
              <span>
                {t("traeEnterprise.subscription.available")} <IconInfoCircle className="app-info-icon" aria-hidden="true" />
              </span>
            </div>
            <strong className="trae-capacity-number"><i><IconUserListStroked aria-hidden="true" /></i>30</strong>
            <div className="trae-capacity-legend trae-capacity-legend--usage">
              <span>
                {t("traeEnterprise.subscription.allAccount")} <b>4 / 10</b>
                <em>{t("traeEnterprise.subscription.remaining")} 6</em>
              </span>
              <ProgressBar value={40} tone="is-success" />
              <span>
                {t("traeEnterprise.subscription.workAccount")} <b>0 / 20</b>
                <em>{t("traeEnterprise.subscription.remaining")} 20</em>
              </span>
              <ProgressBar value={0} tone="is-empty" />
            </div>
          </div>
        </div>
        <div className="trae-payg-row">
          <div>
            <span>{t("traeEnterprise.subscription.addon")} <IconInfoCircle className="app-info-icon" aria-hidden="true" /></span>
            <strong>
              <span className="trae-subscription-icon"><IconGift aria-hidden="true" /></span>
              {t("traeEnterprise.subscription.notPurchased")}
            </strong>
          </div>
          <button
            className="trae-secondary-button trae-subscription-addon-button"
            type="button"
          >
            {t("traeEnterprise.subscription.buyAddon")}{" "}
            <IconExternalOpen aria-hidden="true" />
          </button>
        </div>
        <div className="trae-payg-row">
          <div>
            <span>{t("traeEnterprise.subscription.payg")} <IconInfoCircle className="app-info-icon" aria-hidden="true" /></span>
            <strong>
              <span className="trae-subscription-icon"><IconCreditCard aria-hidden="true" /></span>
              {t("traeEnterprise.subscription.notOpen")}
            </strong>
          </div>
          <button
            className="trae-secondary-button trae-subscription-payg-button"
            type="button"
          >
            {t("traeEnterprise.subscription.openPayg")}{" "}
            <IconExternalOpen aria-hidden="true" />
          </button>
        </div>
      </TraeSection>
    </TraeShell>
  );
}

export function TraeEnterpriseUsagePage() {
  const { t } = useTranslation();
  const { context, loading, error, reload } = useEnterpriseConsoleContext();
  const [tab, setTab] = useState<"board" | "detail">("board");
  const [detailMemberID, setDetailMemberID] = useState("all");
  const [period, setPeriod] = useState<{ start: string; end: string } | null>(null);
  const handlePeriodChange = useCallback((nextPeriod: { start: string; end: string }) => setPeriod(nextPeriod), []);
  return <TraeShell title={t("traeEnterprise.usage.title")} className="trae-usage-page-official" action={period ? <span className="trae-cycle-label trae-cycle-label--heading">{t("traeEnterprise.usage.cycle", period)}</span> : undefined}>
    <ConsoleTabs
      items={(["board", "detail"] as const).map((item) => ({ itemKey: item, tab: t(`traeEnterprise.usage.tabs.${item}`) }))}
      activeKey={tab}
      onChange={(value) => setTab(value as "board" | "detail")}
      ariaLabel={t("traeEnterprise.usage.title")}
    />
    {loading || !context && !error ? <EnterpriseLoading label={t("console.enterprise.contextLoading")} /> : error || !context ? <EnterpriseError message={error?.message ?? t("console.enterprise.contextFailed")} requestId={error?.requestId ?? null} onRetry={reload} /> : <Suspense fallback={<EnterpriseLoading label={t("console.enterprise.loadData")} />}>{tab === "board" ? <TraeUsageBoard context={context} onPeriodChange={handlePeriodChange} onDetail={(memberID) => { setDetailMemberID(memberID); setTab("detail"); }} /> : <TraeUsageDetail context={context} memberID={detailMemberID} onMemberChange={setDetailMemberID} />}</Suspense>}
  </TraeShell>;
}
