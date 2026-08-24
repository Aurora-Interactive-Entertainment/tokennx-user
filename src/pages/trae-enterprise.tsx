import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import Toast from "@douyinfe/semi-ui/lib/es/toast";
import Select from "@douyinfe/semi-ui/lib/es/select";
import Table from "@douyinfe/semi-ui/lib/es/table";
import DatePicker from "@douyinfe/semi-ui/lib/es/datePicker";
import Pagination from "@douyinfe/semi-ui/lib/es/pagination";
import ConfigProvider from "@douyinfe/semi-ui/lib/es/configProvider";
import semiZhCN from "@douyinfe/semi-ui/lib/es/locale/source/zh_CN";
import Tooltip from "@douyinfe/semi-ui/lib/es/tooltip";
import * as echarts from "echarts/core";
import { LineChart as EChartsLineChart, PieChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import {
  IconApartment,
  IconBarChartVStroked,
  IconBookmark,
  IconCalendar,
  IconCheckCircleStroked,
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconCreditCard,
  IconDownload,
  IconEdit,
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
import { exportEnterpriseCsv } from "./enterprise-console-shared";
import { useResolvedTheme } from "@/theme";
import "@/trae-enterprise.css";

echarts.use([
  EChartsLineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  SVGRenderer,
]);

type Translate = (key: string, options?: Record<string, unknown>) => string;
type TraePageProps = {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

const memberRows = [
  {
    id: "member-1",
    name: "han",
    email: "han@example.com",
    status: "active",
    role: "admin",
    account: "全端账号",
    joined: "2026/07/18 14:32",
    department: "研发中心",
  },
  {
    id: "member-2",
    name: "Lina Chen",
    email: "lina.chen@example.com",
    status: "active",
    role: "owner",
    account: "全端账号",
    joined: "2026/07/21 09:14",
    department: "研发中心 / 平台组",
  },
  {
    id: "member-3",
    name: "张宇",
    email: "zhangyu@example.com",
    status: "invited",
    role: "member",
    account: "Work 专属账号",
    joined: "2026/08/02 11:08",
    department: "产品中心",
  },
  {
    id: "member-4",
    name: "Mia Wang",
    email: "mia.wang@example.com",
    status: "suspended",
    role: "member",
    account: "全端账号",
    joined: "2026/08/08 16:20",
    department: "设计中心",
  },
];

const requestRows = [
  { id: "request-1", name: "Wendy Liu", email: "wendy@example.com", department: "研发中心", appliedAt: "2026/08/21 10:32" },
  { id: "request-2", name: "Ming Zhao", email: "ming@example.com", department: "产品中心", appliedAt: "2026/08/20 10:32" },
];

const auditRows = [
  {
    id: "audit-1",
    time: "2026/08/22 18:42:16",
    operator: "han",
    action: "调整成员权限",
    detail: "将 Lina Chen 的角色调整为管理员",
    result: "success",
    ip: "10.24.16.8",
  },
  {
    id: "audit-2",
    time: "2026/08/22 17:12:03",
    operator: "Lina Chen",
    action: "创建 API Key",
    detail: "创建企业工作空间密钥「研发服务」",
    result: "success",
    ip: "10.24.16.12",
  },
  {
    id: "audit-3",
    time: "2026/08/21 09:28:44",
    operator: "han",
    action: "导出用量数据",
    detail: "导出 2026/08/01 - 2026/08/21 用量明细",
    result: "success",
    ip: "10.24.16.8",
  },
  {
    id: "audit-4",
    time: "2026/08/20 20:05:11",
    operator: "张宇",
    action: "申请加入部门",
    detail: "申请加入产品中心",
    result: "failed",
    ip: "10.24.18.21",
  },
];

const usageRows = [
  {
    id: "usage-1",
    date: "2026/08/22",
    person: "Lina Chen",
    account: "全端账号",
    requests: 1284,
    tokens: "2.84M",
    cost: "¥18.42",
    status: "正常",
  },
  {
    id: "usage-2",
    date: "2026/08/22",
    person: "han",
    account: "全端账号",
    requests: 824,
    tokens: "1.62M",
    cost: "¥11.08",
    status: "正常",
  },
  {
    id: "usage-3",
    date: "2026/08/21",
    person: "张宇",
    account: "Work 专属账号",
    requests: 316,
    tokens: "0.42M",
    cost: "¥3.70",
    status: "正常",
  },
];

type TraeUsageMemberRow = {
  id: string;
  name: string;
  email: string;
  department: string;
  account: string;
  total: string;
  base: string;
  overage: string;
};

const traeUsageMemberRows: TraeUsageMemberRow[] = [
  { id: "usage-member-1", name: "伍佰", email: "lijingfind@126.com", department: "极光互娱科技（深圳）有限公司", account: "全端账号", total: "￥0.000", base: "￥0.000", overage: "￥0.000" },
  { id: "usage-member-2", name: "han", email: "abca12a@gmail.com", department: "极光互娱科技（深圳）有限公司", account: "全端账号", total: "￥0.000", base: "￥0.000", overage: "￥0.000" },
  { id: "usage-member-3", name: "zhuhanxin", email: "zhuhanxin0308@163.com", department: "运营", account: "全端账号", total: "￥73.344", base: "￥73.344", overage: "￥0.000" },
  { id: "usage-member-4", name: "lhb", email: "1197715732@qq.com", department: "运营", account: "全端账号", total: "￥42.457", base: "￥42.457", overage: "￥0.000" },
];

const traeUsageDetailRows = [
  { date: "2026/08/24 16:11:16", member: "zhuhanxin", email: "zhuhanxin0308@163.com", department: "运营", client: "IDE", model: "Qwen3.8-Max", session: "6a8bfc99f27389fa73108047", tokens: "3,231,503", cost: "￥10.328657", calls: "73", source: "基础用量" },
  { date: "2026/08/24 14:49:38", member: "zhuhanxin", email: "zhuhanxin0308@163.com", department: "运营", client: "IDE", model: "Qwen3.8-Max", session: "6a8be979f27389fa73108046", tokens: "4,511,155", cost: "￥14.803483", calls: "93", source: "基础用量" },
  { date: "2026/08/24 13:36:02", member: "zhuhanxin", email: "zhuhanxin0308@163.com", department: "运营", client: "IDE", model: "Qwen3.8-Max", session: "6a8bd801f27389fa73108045", tokens: "4,980,476", cost: "￥14.242248", calls: "99", source: "基础用量" },
  { date: "2026/08/24 13:00:06", member: "zhuhanxin", email: "zhuhanxin0308@163.com", department: "运营", client: "IDE", model: "Qwen3.8-Max", session: "6a8bcf9ef27389fa73108044", tokens: "2,100,965", cost: "￥6.081034", calls: "34", source: "基础用量" },
  { date: "2026/08/24 12:35:55", member: "zhuhanxin", email: "zhuhanxin0308@163.com", department: "运营", client: "IDE", model: "Qwen3.8-Max", session: "6a8bca1ef27389fa73108043", tokens: "1,701,806", cost: "￥5.245198", calls: "36", source: "基础用量" },
  { date: "2026/08/24 10:50:41", member: "lhb", email: "1197715732@qq.com", department: "运营", client: "IDE", model: "Kimi-K2.7-Code", session: "6a8bb1791765869500995851", tokens: "278,297", cost: "￥0.436170", calls: "8", source: "基础用量" },
  { date: "2026/08/24 10:50:17", member: "lhb", email: "1197715732@qq.com", department: "运营", client: "IDE", model: "Kimi-K2.7-Code", session: "6a8bb1611765869500995850", tokens: "60,194", cost: "￥0.085340", calls: "2", source: "基础用量" },
];

type TraeUsageDepartmentNode = {
  id: string;
  name: string;
  total: string;
  base: string;
  overage: string;
  children?: TraeUsageDepartmentNode[];
};

const traeUsageDepartmentTree: TraeUsageDepartmentNode[] = [
  {
    id: "company",
    name: "极光互娱科技（深圳）有限公司",
    total: "￥134.450",
    base: "￥134.450",
    overage: "￥0.000",
    children: [
      {
        id: "operation",
        name: "运营",
        total: "￥134.450",
        base: "￥134.450",
        overage: "￥0.000",
        children: [
          {
            id: "test-level-one",
            name: "测试子级部门",
            total: "￥0.000",
            base: "￥0.000",
            overage: "￥0.000",
            children: [
              {
                id: "test-level-three",
                name: "测试三级子部门",
                total: "￥0.000",
                base: "￥0.000",
                overage: "￥0.000",
              },
              {
                id: "test-level-four",
                name: "四级子部门",
                total: "￥0.000",
                base: "￥0.000",
                overage: "￥0.000",
                children: [{ id: "test-level-five", name: "五级子部门", total: "￥0.000", base: "￥0.000", overage: "￥0.000" }],
              },
            ],
          },
        ],
      },
    ],
  },
];

function flattenTraeUsageDepartments(
  nodes: TraeUsageDepartmentNode[],
  expanded: Record<string, boolean>,
  depth = 0,
): Array<TraeUsageDepartmentNode & { depth: number; hasChildren: boolean; expanded: boolean }> {
  return nodes.flatMap((node) => {
    const hasChildren = Boolean(node.children?.length);
    const isExpanded = expanded[node.id] !== false;
    const row = { ...node, depth, hasChildren, expanded: isExpanded };
    return hasChildren && isExpanded
      ? [row, ...flattenTraeUsageDepartments(node.children ?? [], expanded, depth + 1)]
      : [row];
  });
}

function TraeShell({ title, action, children, className = "" }: TraePageProps) {
  const { t } = useTranslation();
  return (
    <div className={`trae-page ${className}`.trim()}>
      <div className="trae-breadcrumb">
        <span>{t("traeEnterprise.common.breadcrumb")}</span>
        <b>/</b>
        <strong>{title}</strong>
      </div>
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

function TraeMemberDepartmentSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TraePickerTab>("people");
  const [expandedDepartments, setExpandedDepartments] = useState<
    Record<string, boolean>
  >({ operation: true, "test-level-one": true, "test-level-two": false });
  const options =
    tab === "people"
      ? [
          {
            value: "all",
            name: t("traeEnterprise.analysis.picker.allPeople"),
            email: "",
          },
          ...memberRows.map((member) => ({
            value: member.id,
            name: member.name,
            email: member.email,
          })),
        ]
      : flattenTraeDepartments(traeDepartmentTree, expandedDepartments);
  const selectedDisplay = value.startsWith("department:")
    ? findTraeDepartmentName(
        traeDepartmentTree,
        value.replace("department:", ""),
      )
    : memberRows.find((member) => member.id === value)?.name;
  return (
    <Select
      aria-label={label}
      className="trae-select trae-member-select"
      dropdownClassName="trae-select-dropdown trae-member-select-dropdown"
      value={value || undefined}
      placeholder={label}
      showClear={Boolean(value)}
      onClear={() => onChange("")}
      filter
      searchPosition="dropdown"
      searchPlaceholder={
        tab === "departments"
          ? t("traeEnterprise.members.searchDepartment")
          : t("traeEnterprise.analysis.picker.search")
      }
      maxHeight={280}
      onChange={(nextValue) => onChange(String(nextValue ?? ""))}
      renderSelectedItem={() =>
        selectedDisplay ??
        (value === "all"
          ? tab === "departments"
            ? t("traeEnterprise.analysis.picker.allDepartments")
            : t("traeEnterprise.analysis.picker.allPeople")
          : label)
      }
      outerTopSlot={
        <div className="trae-picker-tabs" role="tablist">
          {(["people", "departments"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              className={tab === item ? "is-active" : ""}
              onClick={() => {
                setTab(item);
                onChange("");
              }}
            >
              {t(`traeEnterprise.analysis.picker.${item}`)}
            </button>
          ))}
        </div>
      }
      renderOptionItem={(option) => {
        const isDepartment = option.kind === "department";
        const depth = Number(option.depth ?? 0);
        const optionClassName = `${option.className ?? ""}${isDepartment ? " trae-picker-tree-option" : ""}`;
        return (
          <div
            className={optionClassName}
            style={option.style}
            role="option"
            aria-selected={option.selected ? "true" : "false"}
            onClick={option.onClick}
            onMouseEnter={option.onMouseEnter}
          >
            {isDepartment ? (
              <>
                <button
                  className="trae-picker-tree-toggle"
                  type="button"
                  aria-label={
                    option.expanded
                      ? t("traeEnterprise.analysis.picker.collapse")
                      : t("traeEnterprise.analysis.picker.expand")
                  }
                  style={{ marginLeft: `${depth * 24}px` }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const id = String(option.value).replace("department:", "");
                    setExpandedDepartments((current) => ({
                      ...current,
                      [id]: !current[id],
                    }));
                  }}
                >
                  {option.hasChildren ? (
                    option.expanded ? (
                      <IconChevronDown aria-hidden="true" />
                    ) : (
                      <IconChevronRight aria-hidden="true" />
                    )
                  ) : (
                    <span aria-hidden="true" />
                  )}
                </button>
                <span className="trae-picker-option-name">
                  {String(option.name ?? option.label ?? "")}
                </span>
              </>
            ) : (
              <>
                <span className="trae-picker-option-name">
                  {String(option.name ?? option.label ?? "")}
                </span>
                {option.email ? (
                  <span className="trae-picker-option-email">
                    {String(option.email)}
                  </span>
                ) : null}
              </>
            )}
            {option.selected ? (
              <IconTick
                className="trae-picker-option-check"
                aria-hidden="true"
              />
            ) : null}
          </div>
        );
      }}
    >
      {options.map((option) => (
        <Select.Option
          key={String(option.value)}
          value={String(option.value)}
          label={`${String(option.name)} ${String(option.email ?? "")}`}
          name={option.name}
          email={option.email}
          kind={option.kind}
          depth={option.depth}
          hasChildren={option.hasChildren}
          expanded={option.expanded}
        >
          {String(option.name)}
        </Select.Option>
      ))}
    </Select>
  );
}

function TraeDateRangePicker({
  value,
  onChange,
}: {
  value: Date[];
  onChange: (value: Date[]) => void;
}) {
  const { t } = useTranslation();
  const today = useMemo(() => startOfToday(), []);
  const minDate = useMemo(() => addDays(today, -90), [today]);
  const presets = useMemo(
    () => [
      {
        text: t("traeEnterprise.analysis.datePresets.last7"),
        start: addDays(today, -7),
        end: today,
      },
      {
        text: t("traeEnterprise.analysis.datePresets.last30"),
        start: addDays(today, -30),
        end: today,
      },
      {
        text: t("traeEnterprise.analysis.datePresets.last90"),
        start: minDate,
        end: today,
      },
    ],
    [minDate, t, today],
  );
  function handleChange(
    nextValue: Date | Date[] | string | string[] | undefined,
  ) {
    if (!Array.isArray(nextValue)) return;
    const dates = nextValue.filter(
      (item): item is Date => item instanceof Date,
    );
    if (
      dates.length === 2 &&
      dates.every((date) => date >= minDate && date <= today)
    )
      onChange(dates);
  }
  return (
    <DatePicker
      className="trae-date-picker"
      dropdownClassName="trae-date-picker-dropdown"
      type="dateRange"
      value={value}
      format="yyyy/MM/dd"
      rangeSeparator=" - "
      presets={presets}
      presetPosition="left"
      showClear={false}
      disabledDate={(date) => !date || date < minDate || date > today}
      onChange={handleChange}
    />
  );
}

function TraeMetricCard({
  label,
  value,
  icon,
  tone = "",
  showInfo = false,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  tone?: string;
  showInfo?: boolean;
}) {
  return (
    <article className={`trae-metric-card${tone ? ` ${tone}` : ""}`}>
      <div className={`trae-metric-label${showInfo ? " is-info-inline" : ""}`}>
        <span>{label}</span>
        {showInfo ? (
          <Tooltip
            autoAdjustOverflow
            content={label}
            position="top"
            showArrow={false}
          >
            <span
              className="trae-metric-info"
              role="img"
              tabIndex={0}
              aria-label={label}
            >
              {icon ?? <IconInfoCircle aria-hidden="true" />}
            </span>
          </Tooltip>
        ) : (
          (icon ?? <IconInfoCircle aria-hidden="true" />)
        )}
      </div>
      <strong>{value}</strong>
    </article>
  );
}

function TraeSection({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
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

function TraeEmpty({ hint }: { hint?: string }) {
  const { t } = useTranslation();
  return (
    <div className="trae-empty">
      <IconFile aria-hidden="true" />
      <strong>{t("traeEnterprise.common.noData")}</strong>
      {hint ? (
        <span>{hint}</span>
      ) : (
        <span>{t("traeEnterprise.common.noDataHint")}</span>
      )}
    </div>
  );
}

function TraeNotice({
  message,
  onClose,
}: {
  message: string | null;
  onClose: () => void;
}) {
  if (!message) return null;
  return (
    <div className="trae-notice" role="status">
      <IconCheckCircleStroked aria-hidden="true" />
      <span>{message}</span>
      <button type="button" aria-label="关闭提示" onClick={onClose}>
        <IconClose aria-hidden="true" />
      </button>
    </div>
  );
}

function TraeDialog({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div
      className="trae-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`trae-dialog ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trae-dialog-title"
      >
        <header>
          <h2 id="trae-dialog-title">{title}</h2>
          <button type="button" aria-label="关闭" onClick={onClose}>
            <IconClose aria-hidden="true" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function formatTrendDate(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function formatTrendAxisDate(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function getTrendDates(dateRange: Date[]) {
  const start = dateRange[0] ?? addDays(startOfToday(), -30);
  const end = dateRange[1] ?? startOfToday();
  const dates: Date[] = [];
  for (let date = new Date(start); date <= end; date = addDays(date, 1))
    dates.push(new Date(date));
  return dates;
}

function getChartSurfaceColor(node: HTMLElement, theme: string) {
  const surface = node.closest(
    ".trae-chart-panel, .trae-analysis-line-chart-wrap",
  );
  const backgroundColor = surface
    ? getComputedStyle(surface).backgroundColor
    : getComputedStyle(node).backgroundColor;

  // 用面板背景色遮住折线，保留空心节点的视觉效果并兼容主题切换。
  return backgroundColor && backgroundColor !== "rgba(0, 0, 0, 0)"
    ? backgroundColor
    : theme === "dark"
      ? "#202124"
      : "#ffffff";
}

function LineChart({ dateRange }: { dateRange: Date[] }) {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const chartRef = useRef<HTMLDivElement>(null);
  const dates = useMemo(() => getTrendDates(dateRange), [dateRange]);
  const seriesMeta = useMemo(
    () => [
      { name: t("traeEnterprise.analysis.total"), color: "#24c98b" },
      { name: t("traeEnterprise.analysis.ide"), color: "#a998ff" },
      { name: t("traeEnterprise.analysis.plugin"), color: "#1d9bea" },
      { name: t("traeEnterprise.analysis.cli"), color: "#5edfe0" },
      { name: t("traeEnterprise.analysis.mobile"), color: "#efad3b" },
      { name: t("traeEnterprise.analysis.desktop"), color: "#b24cff" },
      { name: t("traeEnterprise.analysis.web"), color: "#ee8bc7" },
    ],
    [t],
  );

  useEffect(() => {
    const node = chartRef.current;
    if (!node || dates.length === 0) return undefined;
    const chart = echarts.init(node, undefined, { renderer: "svg" });
    // 先用稳定的占位趋势数据承接后端接口，保留真实数据接入时的图表结构。
    const peakIndexes = new Set([
      Math.max(0, Math.floor(dates.length * 0.35)),
      Math.max(0, Math.floor(dates.length * 0.36)),
      Math.max(0, dates.length - 3),
      Math.max(0, dates.length - 1),
    ]);
    const labels = dates.map(formatTrendDate);
    const axisStep = Math.max(1, Math.ceil(labels.length / 7));
    const values = dates.map((_, index) => (peakIndexes.has(index) ? 1 : 0));
    const isDark = theme === "dark";
    const textColor = isDark ? "#aeb3bf" : "#5d6470";
    const gridColor = isDark ? "rgba(255,255,255,.1)" : "rgba(23,24,27,.1)";
    const tooltipBackground = isDark ? "#202124" : "#ffffff";
    const tooltipBorder = isDark ? "#777b84" : "#d8dadd";
    const surfaceColor = getChartSurfaceColor(node, theme);
    chart.setOption({
      animationDuration: 320,
      grid: { left: 48, right: 20, top: 20, bottom: 42, containLabel: true },
      tooltip: {
        trigger: "axis",
        confine: true,
        backgroundColor: tooltipBackground,
        borderColor: tooltipBorder,
        borderWidth: 1,
        padding: [12, 14],
        textStyle: { color: isDark ? "#f2f4f8" : "#30343b", fontSize: 14 },
        axisPointer: {
          type: "cross",
          lineStyle: {
            color: isDark ? "#a9aab2" : "#737a86",
            type: "dashed",
            width: 1,
          },
          crossStyle: {
            color: isDark ? "#a9aab2" : "#737a86",
            type: "dashed",
            width: 1,
          },
          label: { show: true, color: "#ffffff", backgroundColor: "#596bab" },
        },
        formatter: (params: unknown) => {
          const items = (Array.isArray(params) ? params : [params]) as Array<{
            dataIndex?: number;
            color?: string;
            value?: number;
          }>;
          const index = items[0]?.dataIndex ?? 0;
          const rows = seriesMeta
            .map(
              (series) =>
                `<div style="display:flex;align-items:center;gap:8px;min-width:258px;line-height:28px"><span style="width:8px;height:8px;border-radius:50%;background:${series.color};display:inline-block"></span><span style="flex:1">${series.name}</span><strong style="font-weight:600">${values[index] ?? 0}</strong></div>`,
            )
            .join("");
          return `<div style="font-size:14px;line-height:20px"><div style="margin-bottom:4px">${labels[index] ?? ""}</div>${rows}</div>`;
        },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: labels,
        axisLine: { lineStyle: { color: gridColor } },
        axisTick: { show: false },
        axisLabel: {
          color: textColor,
          fontSize: 11,
          interval: 0,
          hideOverlap: true,
          formatter: (_value: string, index: number) =>
            index === 0 || index === labels.length - 1 || index % axisStep === 0
              ? formatTrendAxisDate(dates[index])
              : "",
        },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 1,
        splitNumber: 5,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: textColor, fontSize: 11 },
        splitLine: { lineStyle: { color: gridColor, type: "dashed" } },
      },
      series: seriesMeta.map((series) => ({
        type: "line",
        name: series.name,
        data: values,
        symbol: "circle",
        symbolSize: 8,
        showSymbol: true,
        lineStyle: { width: 1.1, color: series.color },
        itemStyle: {
          color: surfaceColor,
          borderColor: series.color,
          borderWidth: 1.2,
        },
        emphasis: {
          scale: true,
          itemStyle: {
            color: surfaceColor,
            borderColor: series.color,
            borderWidth: 1.5,
          },
        },
      })),
    });
    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => chart.resize())
        : null;
    resizeObserver?.observe(node);
    return () => {
      resizeObserver?.disconnect();
      chart.dispose();
    };
  }, [dates, seriesMeta, theme]);

  return (
    <div className="trae-line-chart-wrap">
      <div
        className="trae-line-chart"
        ref={chartRef}
        role="img"
        aria-label="人员活跃度趋势折线图"
      />
      <div className="trae-chart-legend" aria-label="人员活跃度趋势图例">
        {seriesMeta.map((series) => (
          <span key={series.name}>
            <i style={{ backgroundColor: series.color }} />
            {series.name}
          </span>
        ))}
      </div>
    </div>
  );
}

type AnalysisLineVariant = "chat" | "cue";

function TraeAnalysisLineChart({
  dateRange,
  variant,
}: {
  dateRange: Date[];
  variant: AnalysisLineVariant;
}) {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const chartRef = useRef<HTMLDivElement>(null);
  const dates = useMemo(() => getTrendDates(dateRange), [dateRange]);
  const seriesMeta = useMemo(
    () =>
      variant === "chat"
        ? [
            {
              name: t("traeEnterprise.analysis.chatGenerated"),
              color: "#24c98b",
            },
            {
              name: t("traeEnterprise.analysis.chatAccepted"),
              color: "#a998ff",
            },
          ]
        : [
            {
              name: t("traeEnterprise.analysis.cueRecommended"),
              color: "#24c98b",
            },
            {
              name: t("traeEnterprise.analysis.cueAccepted"),
              color: "#a998ff",
            },
          ],
    [t, variant],
  );
  const seriesData = useMemo(() => {
    const size = Math.max(dates.length, 1);
    const generated = dates.map((_, index) =>
      Math.round(
        34 + Math.sin(index / 4) * 10 + (index / size) * 18 + (index % 5) * 2,
      ),
    );
    const accepted = generated.map((value, index) =>
      Math.max(
        0,
        Math.round(
          value * (variant === "chat" ? 0.68 : 0.72) + Math.sin(index / 3) * 3,
        ),
      ),
    );
    return [generated, accepted];
  }, [dates, variant]);

  useEffect(() => {
    const node = chartRef.current;
    if (!node || dates.length === 0) return undefined;
    const chart = echarts.init(node, undefined, { renderer: "svg" });
    const labels = dates.map(formatTrendDate);
    const axisStep = Math.max(1, Math.ceil(labels.length / 7));
    const isDark = theme === "dark";
    const textColor = isDark ? "#aeb3bf" : "#5d6470";
    const gridColor = isDark ? "rgba(255,255,255,.1)" : "rgba(23,24,27,.1)";
    const tooltipBackground = isDark ? "#202124" : "#ffffff";
    const tooltipBorder = isDark ? "#777b84" : "#d8dadd";
    const maxValue = Math.max(...seriesData.flat(), 1);
    const surfaceColor = getChartSurfaceColor(node, theme);
    chart.setOption({
      animationDuration: 320,
      grid: { left: 46, right: 18, top: 18, bottom: 36, containLabel: true },
      tooltip: {
        trigger: "axis",
        confine: true,
        backgroundColor: tooltipBackground,
        borderColor: tooltipBorder,
        borderWidth: 1,
        padding: [10, 12],
        textStyle: { color: isDark ? "#f2f4f8" : "#30343b", fontSize: 12 },
        axisPointer: {
          type: "cross",
          lineStyle: {
            color: isDark ? "#a9aab2" : "#737a86",
            type: "dashed",
            width: 1,
          },
          crossStyle: {
            color: isDark ? "#a9aab2" : "#737a86",
            type: "dashed",
            width: 1,
          },
          label: { show: true, color: "#ffffff", backgroundColor: "#596bab" },
        },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: labels,
        axisLine: { lineStyle: { color: gridColor } },
        axisTick: { show: false },
        axisLabel: {
          color: textColor,
          fontSize: 11,
          interval: 0,
          hideOverlap: true,
          formatter: (_value: string, index: number) =>
            index === 0 || index === labels.length - 1 || index % axisStep === 0
              ? formatTrendAxisDate(dates[index])
              : "",
        },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: Math.ceil(maxValue / 10) * 10,
        splitNumber: 4,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: textColor, fontSize: 11 },
        splitLine: { lineStyle: { color: gridColor, type: "dashed" } },
      },
      series: seriesMeta.map((series, index) => ({
        type: "line",
        name: series.name,
        data: seriesData[index],
        symbol: "circle",
        symbolSize: 8,
        showSymbol: true,
        smooth: false,
        lineStyle: { width: 1.1, color: series.color },
        itemStyle: {
          color: surfaceColor,
          borderColor: series.color,
          borderWidth: 1.2,
        },
        emphasis: {
          scale: true,
          itemStyle: {
            color: surfaceColor,
            borderColor: series.color,
            borderWidth: 1.5,
          },
        },
      })),
    });
    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => chart.resize())
        : null;
    resizeObserver?.observe(node);
    return () => {
      resizeObserver?.disconnect();
      chart.dispose();
    };
  }, [dates, seriesData, seriesMeta, theme]);

  return (
    <div className="trae-analysis-line-chart-wrap">
      <div
        className="trae-analysis-line-chart"
        ref={chartRef}
        role="img"
        aria-label={
          variant === "chat"
            ? t("traeEnterprise.analysis.chatTrend")
            : t("traeEnterprise.analysis.cueTrend")
        }
      />
      <div
        className="trae-chart-legend"
        aria-label={t("traeEnterprise.analysis.chartLegend")}
      >
        {seriesMeta.map((series) => (
          <span key={series.name}>
            <i style={{ backgroundColor: series.color }} />
            {series.name}
          </span>
        ))}
      </div>
    </div>
  );
}

type AnalysisPieKind = "models" | "languages";

function TraeAnalysisPieChart({ kind }: { kind: AnalysisPieKind }) {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const chartRef = useRef<HTMLDivElement>(null);
  const data = useMemo(
    () =>
      kind === "models"
        ? [
            { name: "Qwen3.8-Max/TRAE", value: 50.68, color: "#55c7ad" },
            { name: "Doubao-Seed-Code/TRAE", value: 31.54, color: "#7b74ff" },
            { name: "Claude-Sonnet/TRAE", value: 9.26, color: "#f2b74a" },
            { name: "GPT-5/TRAE", value: 5.18, color: "#e884b7" },
            {
              name: t("traeEnterprise.analysis.other"),
              value: 3.34,
              color: "#707582",
            },
          ]
        : [
            { name: "go", value: 90.2, color: "#56c6ad" },
            { name: "typescriptreact", value: 5.2, color: "#7b74ff" },
            { name: "css", value: 3.3, color: "#f2b74a" },
            { name: "typescript", value: 1.1, color: "#e884b7" },
            { name: "html", value: 0.1, color: "#57a8e5" },
            { name: "xml", value: 0.05, color: "#9f80cf" },
            { name: "plaintext", value: 0.05, color: "#707582" },
          ],
    [kind, t],
  );

  useEffect(() => {
    const node = chartRef.current;
    if (!node) return undefined;
    const chart = echarts.init(node, undefined, { renderer: "svg" });
    const isDark = theme === "dark";
    const textColor = isDark ? "#f1f3f7" : "#30343b";
    const tooltipBackground = isDark ? "#202124" : "#ffffff";
    const tooltipBorder = isDark ? "#777b84" : "#d8dadd";
    chart.setOption({
      animationDuration: 360,
      tooltip: {
        trigger: "item",
        backgroundColor: tooltipBackground,
        borderColor: tooltipBorder,
        borderWidth: 1,
        textStyle: { color: textColor, fontSize: 12 },
        formatter: (params: unknown) => {
          const item = params as {
            name?: string;
            value?: number;
            percent?: number;
          };
          return `${item.name ?? ""}: ${Number(item.percent ?? item.value ?? 0).toFixed(2)}%`;
        },
      },
      series: [
        {
          type: "pie",
          radius: ["0%", "74%"],
          center: ["58%", "50%"],
          avoidLabelOverlap: true,
          itemStyle: {
            borderColor: isDark ? "#24262b" : "#ffffff",
            borderWidth: 2,
          },
          // 大扇区保留饼内标签，小扇区放到饼外；极小扇区只在图例和 tooltip 中展示，避免顶部文字挤在一起。
          label: {
            show: true,
            position: "outside",
            formatter: (params: unknown) => {
              const item = params as { percent?: number };
              return Number(item.percent ?? 0) >= 2
                ? `${Number(item.percent ?? 0).toFixed(2)}%`
                : "";
            },
            color: textColor,
            fontSize: 11,
            fontWeight: 600,
          },
          labelLine: {
            show: true,
            length: 12,
            length2: 8,
            smooth: 0.15,
            lineStyle: { color: isDark ? "#8c929f" : "#a1a7b1", width: 1 },
          },
          labelLayout: { hideOverlap: true, moveOverlap: "shiftY" },
          emphasis: {
            scale: true,
            scaleSize: 5,
            itemStyle: { shadowBlur: 12, shadowColor: "rgba(0,0,0,.25)" },
          },
          data: data.map((item) => ({
            ...item,
            itemStyle: { color: item.color },
            // 仅对占比足够大的扇区显示饼内文字；其余可读的文字由外部引导线承载。
            label:
              item.value >= 15
                ? {
                    position: "inside",
                    formatter: `${item.value.toFixed(2)}%`,
                    color: "#ffffff",
                    fontSize: 11,
                    fontWeight: 600,
                  }
                : {
                    position: "outside",
                    formatter:
                      item.value >= 2 ? `${item.value.toFixed(2)}%` : "",
                    color: textColor,
                    fontSize: 11,
                    fontWeight: 600,
                  },
            labelLine: { show: item.value >= 2 },
          })),
        },
      ],
    });
    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => chart.resize())
        : null;
    resizeObserver?.observe(node);
    return () => {
      resizeObserver?.disconnect();
      chart.dispose();
    };
  }, [data, theme]);

  return (
    <div className="trae-analysis-pie-content">
      <div
        className="trae-analysis-pie-legend"
        aria-label={
          kind === "models"
            ? t("traeEnterprise.analysis.models")
            : t("traeEnterprise.analysis.languages")
        }
      >
        {data.map((item) => (
          <div className="trae-analysis-pie-legend-item" key={item.name}>
            <i style={{ backgroundColor: item.color }} />
            <span title={item.name}>{item.name}</span>
            <b>{item.value.toFixed(2)}%</b>
          </div>
        ))}
      </div>
      <div
        className="trae-analysis-pie-chart"
        ref={chartRef}
        role="img"
        aria-label={
          kind === "models"
            ? t("traeEnterprise.analysis.models")
            : t("traeEnterprise.analysis.languages")
        }
      />
    </div>
  );
}

export function TraeEnterpriseAnalysisPage() {
  const { t } = useTranslation();
  const [scope, setScope] = useState("");
  const [dateRange, setDateRange] = useState<Date[]>(() => {
    const today = startOfToday();
    return [addDays(today, -90), today];
  });
  const [notice, setNotice] = useState<string | null>(null);
  const metrics = [
    [t("traeEnterprise.analysis.total"), "2"],
    [t("traeEnterprise.analysis.ide"), "2"],
    [t("traeEnterprise.analysis.plugin"), "0"],
    [t("traeEnterprise.analysis.cli"), "0"],
    [t("traeEnterprise.analysis.mobile"), "0"],
    [t("traeEnterprise.analysis.desktop"), "0"],
    [t("traeEnterprise.analysis.web"), "0"],
  ];
  function exportData() {
    exportEnterpriseCsv("trae-data-analysis.csv", ["指标", "数值"], metrics);
    setNotice("已导出当前数据");
  }
  return (
    <TraeShell
      className="trae-analysis-page"
      title={t("traeEnterprise.analysis.title")}
      action={
        <button
          className="trae-primary-button"
          type="button"
          onClick={exportData}
        >
          <IconDownload aria-hidden="true" />
          {t("traeEnterprise.analysis.export")}
        </button>
      }
    >
      <TraeToolbar>
        <TraeMemberDepartmentSelect
          label={t("traeEnterprise.analysis.scope")}
          value={scope}
          onChange={setScope}
        />
        <TraeDateRangePicker value={dateRange} onChange={setDateRange} />
      </TraeToolbar>
      <TraeSection title={t("traeEnterprise.analysis.people")}>
        <div className="trae-metric-grid trae-analysis-metric-grid">
          {metrics.map(([label, value]) => (
            <TraeMetricCard key={label} label={label} value={value} showInfo />
          ))}
        </div>
      </TraeSection>
      <TraeSection title={t("traeEnterprise.analysis.trend")}>
        <div className="trae-chart-panel">
          <LineChart dateRange={dateRange} />
        </div>
      </TraeSection>
      <TraeSection title={t("traeEnterprise.analysis.core")}>
        <div className="trae-metric-grid trae-metric-grid--three trae-analysis-metric-grid trae-core-metric-grid">
          <TraeMetricCard
            label={t("traeEnterprise.analysis.aiRate")}
            value="99%"
            tone="is-success"
            showInfo
          />
          <TraeMetricCard
            label={t("traeEnterprise.analysis.generated")}
            value="4,139"
            showInfo
          />
          <TraeMetricCard
            label={t("traeEnterprise.analysis.cue")}
            value="7"
            showInfo
          />
        </div>
      </TraeSection>
      <div className="trae-analysis-grid">
        <TraeSection
          title={t("traeEnterprise.analysis.chatTrend")}
          className="trae-analysis-chart-section"
        >
          <TraeAnalysisLineChart dateRange={dateRange} variant="chat" />
        </TraeSection>
        <TraeSection
          title={t("traeEnterprise.analysis.cueTrend")}
          className="trae-analysis-chart-section"
        >
          <TraeAnalysisLineChart dateRange={dateRange} variant="cue" />
        </TraeSection>
      </div>
      <div className="trae-analysis-ranking-grid">
        <TraeSection
          title={t("traeEnterprise.analysis.mcp")}
          className="trae-analysis-ranking-section"
        >
          <TraeEmpty hint={t("traeEnterprise.analysis.tPlusOne")} />
        </TraeSection>
        <TraeSection
          title={t("traeEnterprise.analysis.agent")}
          className="trae-analysis-ranking-section"
        >
          <TraeEmpty hint={t("traeEnterprise.analysis.tPlusOne")} />
        </TraeSection>
      </div>
      <div className="trae-analysis-pie-grid">
        <TraeSection
          title={t("traeEnterprise.analysis.models")}
          className="trae-analysis-pie-section"
        >
          <TraeAnalysisPieChart kind="models" />
        </TraeSection>
        <TraeSection
          title={t("traeEnterprise.analysis.languages")}
          className="trae-analysis-pie-section"
        >
          <TraeAnalysisPieChart kind="languages" />
        </TraeSection>
      </div>
      <TraeNotice message={notice} onClose={() => setNotice(null)} />
    </TraeShell>
  );
}

function MemberStatus({ value, t }: { value: string; t: Translate }) {
  const label =
    value === "active"
      ? t("traeEnterprise.members.active")
      : value === "invited"
        ? t("traeEnterprise.members.invited")
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
      <p>{t("traeEnterprise.members.ruleInvited")}</p>
      <p>{t("traeEnterprise.members.ruleActive")}</p>
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
                <Tooltip content={t("traeEnterprise.members.directMembers")}>
                  <IconInfoCircle aria-hidden="true" />
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
}: {
  nodes: TraeDepartmentNode[];
  value: string;
  onChange: (value: string) => void;
  label: string;
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
      const option = (
        <div
          className={`trae-department-picker-option${value === node.id ? " is-selected" : ""}`}
          key={node.id}
          style={{ paddingLeft: `${10 + depth * 20}px` }}
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
            onClick={() => {
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
      <form
        className="trae-dialog-form trae-department-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) onSubmit(name.trim(), parentID, state.node?.id);
        }}
      >
        <label>
          <span>
            <b>*</b>
            {t("traeEnterprise.members.departmentName")}
          </span>
          <div className="trae-dialog-input-wrap">
            <input
              value={name}
              maxLength={30}
              required
              placeholder={t(
                "traeEnterprise.members.departmentNamePlaceholder",
              )}
              onChange={(event) => setName(event.target.value)}
            />
            <small>{name.length}/30</small>
          </div>
        </label>
        {state.mode === "edit" ? (
          <label>
            <span>{t("traeEnterprise.members.departmentID")}</span>
            <input value={state.node?.id ?? ""} disabled />
          </label>
        ) : null}
        <label>
          <span>
            <b>*</b>
            {t("traeEnterprise.members.parentDepartment")}
          </span>
          <TraeDepartmentPicker
            nodes={nodes}
            value={parentID}
            onChange={setParentID}
            label={t("traeEnterprise.members.parentDepartment")}
          />
        </label>
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
      </form>
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
  const navigate = useNavigate();
  const [tab, setTab] = useState<"people" | "departments" | "requests">(
    "people",
  );
  const [collapsed, setCollapsed] = useState(false);
  const [selectedDepartmentID, setSelectedDepartmentID] = useState("company");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [accountType, setAccountType] = useState("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"member" | "rules" | null>(null);
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
  const memberAddMenuRef = useRef<HTMLDivElement>(null);
  const [selectedMemberIDs, setSelectedMemberIDs] = useState<
    Array<string | number>
  >([]);
  const [departments, setDepartments] =
    useState<TraeDepartmentNode[]>(traeDepartmentTree);
  const [requestState, setRequestState] = useState<Record<string, string>>({
    "request-1": "pending",
    "request-2": "pending",
  });
  const [requestQuery, setRequestQuery] = useState("");
  const [requestStatus, setRequestStatus] = useState("all");
  // The demo session represents a regular enterprise administrator. Backend
  // auth can replace this value with the signed-in operator role when it is
  // available. Only the super administrator may perform protected actions.
  const currentOperatorRole: string = "admin";
  const canManageProtectedActions = currentOperatorRole === "owner";
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
      memberRows.filter(
        (item) =>
          (!query.trim() ||
            `${item.name} ${item.email}`
              .toLowerCase()
              .includes(query.trim().toLowerCase())) &&
          (status === "all" || item.status === status) &&
          (accountType === "all" || item.account === accountType),
      ),
    [accountType, query, status],
  );
  const filteredRequests = useMemo(
    () => requestRows.filter((request) => {
      const currentStatus = requestState[request.id] ?? "pending";
      const normalizedQuery = requestQuery.trim().toLowerCase();
      const matchesQuery = !normalizedQuery ||
        `${request.name} ${request.email}`.toLowerCase().includes(normalizedQuery);
      return matchesQuery && (requestStatus === "all" || currentStatus === requestStatus);
    }),
    [requestQuery, requestState, requestStatus],
  );
  function submitMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDialog(null);
    setNotice(t("traeEnterprise.members.addSuccess"));
  }
  function saveDepartment(name: string, parentID: string, nodeID?: string) {
    if (nodeID)
      setDepartments((current) => {
        const currentNode = findTraeDepartmentNode(current, nodeID);
        const currentParentID = findTraeParentDepartmentID(current, nodeID);
        // A department cannot be moved below itself or one of its descendants.
        if (
          !currentNode ||
          parentID === nodeID ||
          containsTraeDepartmentNode(currentNode, parentID)
        )
          return current;
        if (currentParentID === parentID)
          return updateDepartmentNodes(current, nodeID, (node) => ({
            ...node,
            name,
          }));
        const withoutNode = removeDepartmentNode(current, nodeID);
        return updateDepartmentNodes(withoutNode, parentID, (node) => ({
          ...node,
          children: [...(node.children ?? []), { ...currentNode, name }],
        }));
      });
    else
      setDepartments((current) =>
        parentID
          ? updateDepartmentNodes(current, parentID, (node) => ({
              ...node,
              children: [
                ...(node.children ?? []),
                { id: `department-${Date.now()}`, name },
              ],
            }))
          : [...current, { id: `department-${Date.now()}`, name }],
      );
    setDepartmentDialog(null);
    setNotice(t("traeEnterprise.common.success"));
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
    onEditDepartment: (node: TraeDepartmentNode) =>
      setDepartmentDialog({ mode: "edit", node }),
    onAddChildDepartment: (parentID: string) =>
      setDepartmentDialog({ mode: "child", parentID }),
    onDeleteDepartment: (node: TraeDepartmentNode) => {
      if (node.children?.length) setDepartmentDeleteBlockedNode(node);
      else setDepartmentDeleteNode(node);
    },
    onMoveUp: (node: TraeDepartmentNode) => {
      setDepartments((current) => moveDepartmentUp(current, node.id));
      setNotice(t("traeEnterprise.departmentTable.moveUp"));
    },
    onMoveDown: (node: TraeDepartmentNode) => {
      setDepartments((current) => moveDepartmentDown(current, node.id));
      setNotice(t("traeEnterprise.departmentTable.moveDown"));
    },
  };
  function confirmDeleteDepartment() {
    if (!departmentDeleteNode) return;
    const deletedID = departmentDeleteNode.id;
    setDepartments((current) => removeDepartmentNode(current, deletedID));
    if (
      selectedDepartmentID === deletedID ||
      containsTraeDepartmentNode(departmentDeleteNode, selectedDepartmentID)
    ) {
      setSelectedDepartmentID("company");
    }
    setDepartmentDeleteNode(null);
    setNotice(t("traeEnterprise.members.deleteDepartmentSuccess"));
  }
  return (
    <div className="trae-page trae-members-page">
      <header className="trae-members-header">
        <div className="trae-members-header-main">
          <h1>{t("traeEnterprise.members.title")}</h1>
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
                    navigate("/console/invitations");
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
      <div className="trae-tabs" role="tablist">
        {(["people", "departments", "requests"] as const).map((item) => (
          <button
            key={item}
            className={tab === item ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
          >
            {t(`traeEnterprise.members.tabs.${item}`)}
          </button>
        ))}
      </div>
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
                  {t("traeEnterprise.members.totalMembers")} <b>2</b>
                </span>
                <span>
                  {t("traeEnterprise.members.joinedMembers")} <b>2</b>
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
                label={t("traeEnterprise.members.accountType")}
                value={accountType}
                onChange={setAccountType}
                dropdownClassName="trae-members-filter-dropdown"
                options={[
                  {
                    value: "all",
                    label: t("traeEnterprise.members.accountType"),
                  },
                  { value: "全端账号", label: "全端账号" },
                  { value: "Work 专属账号", label: "Work 专属账号" },
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
                    value: "invited",
                    label: t("traeEnterprise.members.invited"),
                  },
                  {
                    value: "suspended",
                    label: t("traeEnterprise.members.suspended"),
                  },
                ]}
              />
            </TraeToolbar>
            <div className="trae-table-scroll">
              <Table
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
                          content={<MemberStatusRulesTooltip t={t} />}
                          position="bottom"
                        >
                          <button
                            type="button"
                            aria-label={t("traeEnterprise.members.stateRules")}
                            onClick={() => setDialog("rules")}
                          >
                            <IconInfoCircle aria-hidden="true" />
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
                                  ["reclaimAccount", !canManageProtectedActions],
                                  ["switchToWorkAccount", false],
                                  ["transferSuperAdmin", !canManageProtectedActions],
                                ]
                              : [
                                  ["changeDepartment", false],
                                  ["reclaimAccount", false],
                                  ["changeRole", false],
                                  ["switchToWorkAccount", false],
                                  ["removeMember", false],
                                ]
                            ).map(([action, disabled]) => {
                              const actionKey = String(action) as
                                | "changeDepartment"
                                | "reclaimAccount"
                                | "changeRole"
                                | "switchToWorkAccount"
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
                                    setNotice(t(`traeEnterprise.members.${actionKey}`));
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
                    <TraeEmpty hint={t("traeEnterprise.members.empty")} />
                  ) : undefined
                }
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
          onEditDepartment={(node) => setDepartmentDialog({ mode: "edit", node })}
          onShowDetails={(node) => setDepartmentDetailNode(node)}
          onDeleteDepartment={(node) => {
            if (node.children?.length) setDepartmentDeleteBlockedNode(node);
            else setDepartmentDeleteNode(node);
          }}
          onMoveDown={(node) => {
            setDepartments((current) => moveDepartmentDown(current, node.id));
            setNotice(t("traeEnterprise.departmentTable.moveDown"));
          }}
          onMoveUp={(node) => {
            setDepartments((current) => moveDepartmentUp(current, node.id));
            setNotice(t("traeEnterprise.departmentTable.moveUp"));
          }}
        />
      ) : (
        <section className="trae-request-panel">
          <TraeToolbar>
            <label className="trae-inline-search trae-request-search">
              <IconSearch aria-hidden="true" />
              <input
                aria-label={t("traeEnterprise.members.searchPeople")}
                placeholder={t("traeEnterprise.members.searchPeople")}
                value={requestQuery}
                onChange={(event) => setRequestQuery(event.target.value)}
              />
            </label>
            <TraeSelect
              label={t("traeEnterprise.members.status")}
              value={requestStatus}
              onChange={setRequestStatus}
              dropdownClassName="trae-members-filter-dropdown"
              options={[
                { value: "all", label: t("traeEnterprise.members.status") },
                { value: "pending", label: t("traeEnterprise.members.requestPending") },
                { value: "rejected", label: t("traeEnterprise.members.requestRejected") },
              ]}
            />
          </TraeToolbar>
          <div className="trae-table-scroll">
            <table className="trae-table">
              <thead>
                <tr>
                  <th>{t("traeEnterprise.members.requestUser")}</th>
                  <th>{t("traeEnterprise.members.requestDepartment")}</th>
                  <th>{t("traeEnterprise.members.requestTime")}</th>
                  <th>{t("traeEnterprise.members.state")}</th>
                  <th>{t("traeEnterprise.members.requestAction")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => {
                  const id = request.id;
                  return (
                  <tr key={id}>
                    <td>
                      <span className="trae-person-cell">
                        <span>
                          <strong>{request.name}</strong>
                          <small>{request.email}</small>
                        </span>
                      </span>
                    </td>
                    <td>{request.department}</td>
                    <td>{request.appliedAt}</td>
                    <td>
                      {requestState[id] === "pending" ? (
                        <span className="trae-status-badge is-invited">
                          <i />
                          {t("traeEnterprise.members.invited")}
                        </span>
                      ) : (
                        <span className="trae-status-badge is-active">
                          <i />
                          {requestState[id] === "approved"
                            ? t("traeEnterprise.members.approve")
                            : t("traeEnterprise.members.reject")}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="trae-inline-actions">
                        <button
                          className="trae-primary-button trae-primary-button--small"
                          type="button"
                          disabled={requestState[id] !== "pending"}
                          onClick={() => {
                            setRequestState((value) => ({
                              ...value,
                              [id]: "approved",
                            }));
                            setNotice(t("traeEnterprise.common.success"));
                          }}
                        >
                          {t("traeEnterprise.members.approve")}
                        </button>
                        <button
                          className="trae-secondary-button trae-secondary-button--small"
                          type="button"
                          disabled={requestState[id] !== "pending"}
                          onClick={() => {
                            setRequestState((value) => ({
                              ...value,
                              [id]: "rejected",
                            }));
                            setNotice(t("traeEnterprise.common.success"));
                          }}
                        >
                          {t("traeEnterprise.members.reject")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <TraeNotice message={notice} onClose={() => setNotice(null)} />
      {dialog === "member" ? (
        <TraeDialog
          title={t("traeEnterprise.members.addTitle")}
          onClose={() => setDialog(null)}
        >
          <form className="trae-dialog-form" onSubmit={submitMember}>
            <label>
              {t("traeEnterprise.members.email")}
              <input
                type="email"
                required
                placeholder={t("traeEnterprise.members.emailPlaceholder")}
              />
            </label>
            <label>
              {t("traeEnterprise.members.roleLabel")}
              <select defaultValue="member">
                <option value="member">
                  {t("traeEnterprise.members.member")}
                </option>
                <option value="admin">
                  {t("traeEnterprise.members.admin")}
                </option>
              </select>
            </label>
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
          </form>
        </TraeDialog>
      ) : null}
      {dialog === "rules" ? (
        <TraeDialog
          title={t("traeEnterprise.members.stateRules")}
          onClose={() => setDialog(null)}
        >
          <div className="trae-rule-list">
            <div>
              <span className="trae-status-badge is-invited">
                <i />
                {t("traeEnterprise.members.invited")}
              </span>
              <p>{t("traeEnterprise.members.ruleInvited")}</p>
            </div>
            <div>
              <span className="trae-status-badge is-active">
                <i />
                {t("traeEnterprise.members.active")}
              </span>
              <p>{t("traeEnterprise.members.ruleActive")}</p>
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
              <span className="is-green">全端账号 10</span>
              <span className="is-purple">Work 专属账号 20</span>
            </div>
            <ProgressBar value={40} tone="is-mixed" />
          </div>
          <div className="trae-capacity-block">
            <div className="trae-capacity-heading">
              <span>
                {t("traeEnterprise.subscription.available")} <IconInfoCircle aria-hidden="true" />
              </span>
            </div>
            <strong className="trae-capacity-number"><i><IconUserListStroked aria-hidden="true" /></i>30</strong>
            <div className="trae-capacity-legend trae-capacity-legend--usage">
              <span>
                全端账号 <b>4 / 10</b>
                <em>{t("traeEnterprise.subscription.remaining")} 6</em>
              </span>
              <ProgressBar value={40} tone="is-success" />
              <span>
                Work 专属账号 <b>0 / 20</b>
                <em>{t("traeEnterprise.subscription.remaining")} 20</em>
              </span>
              <ProgressBar value={0} tone="is-empty" />
            </div>
          </div>
        </div>
        <div className="trae-payg-row">
          <div>
            <span>{t("traeEnterprise.subscription.addon")} <IconInfoCircle aria-hidden="true" /></span>
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
            <span>{t("traeEnterprise.subscription.payg")} <IconInfoCircle aria-hidden="true" /></span>
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

// 保留旧看板实现，便于后续接入真实用量接口时迁移数据逻辑。
function TraeEnterpriseUsageLegacyPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"board" | "detail">("board");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<"limit" | "buy" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const filtered = usageRows.filter(
    (row) =>
      !query.trim() ||
      `${row.person} ${row.account}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <TraeShell title={t("traeEnterprise.usage.title")}>
      <div className="trae-cycle-label">
        {t("traeEnterprise.usage.cycle", {
          start: "2026/08/21",
          end: "2026/09/21",
        })}
      </div>
      <div className="trae-tabs" role="tablist">
        {(["board", "detail"] as const).map((item) => (
          <button
            className={tab === item ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={tab === item}
            key={item}
            onClick={() => setTab(item)}
          >
            {t(`traeEnterprise.usage.tabs.${item}`)}
          </button>
        ))}
      </div>
      {tab === "board" ? (
        <>
          <div className="trae-usage-summary">
            <TraeMetricCard
              label={t("traeEnterprise.usage.overall")}
              value="¥0.000"
            />
            <TraeMetricCard
              label={t("traeEnterprise.usage.base")}
              value="¥0.000"
            />
            <TraeMetricCard
              label={t("traeEnterprise.usage.overage")}
              value="¥0.000"
            />
          </div>
          <div className="trae-usage-capacity">
            <article>
              <div className="trae-usage-card-heading">
                <span>{t("traeEnterprise.usage.base")}</span>
                <button
                  className="trae-secondary-button trae-secondary-button--small"
                  type="button"
                  onClick={() => setDialog("limit")}
                >
                  {t("traeEnterprise.usage.adjust")}
                </button>
              </div>
              <strong>¥0.000</strong>
              <span className="trae-muted">
                {t("traeEnterprise.usage.exhausted")} ·{" "}
                {t("traeEnterprise.usage.noLimit")}
              </span>
            </article>
            <article>
              <div className="trae-usage-card-heading">
                <span>{t("traeEnterprise.usage.overage")}</span>
                <button
                  className="trae-secondary-button trae-secondary-button--small"
                  type="button"
                  onClick={() => setDialog("buy")}
                >
                  {t("traeEnterprise.usage.buy")}
                </button>
              </div>
              <strong>¥0.000</strong>
              <span className="trae-muted">
                {t("traeEnterprise.usage.noPackage")}
              </span>
            </article>
          </div>
          <TraeSection title={t("traeEnterprise.usage.people")}>
            <TraeToolbar>
              <label className="trae-inline-search trae-inline-search--wide">
                <IconSearch aria-hidden="true" />
                <input
                  aria-label={t("traeEnterprise.usage.searchPeople")}
                  placeholder={t("traeEnterprise.usage.searchPeople")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <TraeSelect
                label={t("traeEnterprise.usage.allMembers")}
                value="all"
                onChange={() => undefined}
                options={[
                  { value: "all", label: t("traeEnterprise.usage.allMembers") },
                ]}
              />
              <TraeSelect
                label={t("traeEnterprise.usage.allAccounts")}
                value="all"
                onChange={() => undefined}
                options={[
                  {
                    value: "all",
                    label: t("traeEnterprise.usage.allAccounts"),
                  },
                ]}
              />
              <TraeSelect
                label={t("traeEnterprise.usage.overageFilter")}
                value="all"
                onChange={() => undefined}
                options={[
                  {
                    value: "all",
                    label: `${t("traeEnterprise.usage.overageFilter")} · ${t("traeEnterprise.common.all")}`,
                  },
                ]}
              />
            </TraeToolbar>
            {filtered.length ? (
              <div className="trae-usage-person-grid">
                {filtered.map((row, index) => (
                  <article className="trae-usage-person-card" key={row.id}>
                    <div className="trae-person-cell">
                      <span className="trae-avatar">
                        {row.person.slice(0, 1)}
                      </span>
                      <span>
                        <strong>{row.person}</strong>
                        <small>{row.account}</small>
                      </span>
                    </div>
                    <div className="trae-usage-person-values">
                      <span>
                        {t("traeEnterprise.usage.requests")}{" "}
                        <b>{row.requests.toLocaleString()}</b>
                      </span>
                      <span>
                        {t("traeEnterprise.usage.tokens")} <b>{row.tokens}</b>
                      </span>
                      <span>
                        {t("traeEnterprise.usage.cost")} <b>{row.cost}</b>
                      </span>
                    </div>
                    <ProgressBar
                      value={index === 0 ? 74 : index === 1 ? 48 : 22}
                    />
                  </article>
                ))}
              </div>
            ) : (
              <TraeEmpty />
            )}
          </TraeSection>
          <TraeSection title={t("traeEnterprise.usage.departments")}>
            <TraeEmpty />
          </TraeSection>
        </>
      ) : (
        <TraeSection title={t("traeEnterprise.usage.tabs.detail")}>
          <TraeToolbar>
            <TraeSelect
              label={t("traeEnterprise.usage.allMembers")}
              value="all"
              onChange={() => undefined}
              options={[
                { value: "all", label: t("traeEnterprise.usage.allMembers") },
              ]}
            />
            <label className="trae-date-field">
              <IconCalendar aria-hidden="true" />
              <input
                type="date"
                aria-label={t("traeEnterprise.analysis.start")}
                defaultValue="2026-08-01"
              />
              <span>-</span>
              <input
                type="date"
                aria-label={t("traeEnterprise.analysis.end")}
                defaultValue="2026-08-22"
              />
            </label>
          </TraeToolbar>
          <div className="trae-table-scroll">
            <table className="trae-table">
              <thead>
                <tr>
                  <th>{t("traeEnterprise.usage.detailDate")}</th>
                  <th>{t("traeEnterprise.usage.detailPerson")}</th>
                  <th>{t("traeEnterprise.usage.detailAccount")}</th>
                  <th>{t("traeEnterprise.usage.detailRequests")}</th>
                  <th>{t("traeEnterprise.usage.detailTokens")}</th>
                  <th>{t("traeEnterprise.usage.detailCost")}</th>
                  <th>{t("traeEnterprise.usage.detailStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {usageRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>{row.person}</td>
                    <td>{row.account}</td>
                    <td>{row.requests.toLocaleString()}</td>
                    <td>{row.tokens}</td>
                    <td>{row.cost}</td>
                    <td>
                      <span className="trae-status-badge is-active">
                        <i />
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TraeSection>
      )}
      <TraeNotice message={notice} onClose={() => setNotice(null)} />
      {dialog === "limit" ? (
        <TraeDialog
          title={t("traeEnterprise.usage.limitTitle")}
          onClose={() => setDialog(null)}
        >
          <form
            className="trae-dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              setDialog(null);
              setNotice(t("traeEnterprise.common.success"));
            }}
          >
            <p>{t("traeEnterprise.usage.limitHint")}</p>
            <label>
              {t("traeEnterprise.usage.limitTitle")}
              <input
                required
                inputMode="decimal"
                placeholder={t("traeEnterprise.usage.limitPlaceholder")}
              />
            </label>
            <div className="trae-dialog-actions">
              <button
                className="trae-secondary-button"
                type="button"
                onClick={() => setDialog(null)}
              >
                {t("traeEnterprise.common.cancel")}
              </button>
              <button className="trae-primary-button" type="submit">
                {t("traeEnterprise.common.save")}
              </button>
            </div>
          </form>
        </TraeDialog>
      ) : null}
      {dialog === "buy" ? (
        <TraeDialog
          title={t("traeEnterprise.usage.buyTitle")}
          onClose={() => setDialog(null)}
        >
          <div className="trae-dialog-form">
            <p>{t("traeEnterprise.usage.buyHint")}</p>
            <div className="trae-dialog-actions">
              <button
                className="trae-secondary-button"
                type="button"
                onClick={() => setDialog(null)}
              >
                {t("traeEnterprise.common.cancel")}
              </button>
              <button
                className="trae-primary-button"
                type="button"
                onClick={() => {
                  setDialog(null);
                  setNotice(t("traeEnterprise.common.success"));
                }}
              >
                {t("traeEnterprise.common.confirm")}
              </button>
            </div>
          </div>
        </TraeDialog>
      ) : null}
    </TraeShell>
  );
}

function TraeUsageDonut() {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = chartRef.current;
    if (!node) return undefined;
    const isDark = theme === "dark";
    const textColor = isDark ? "#f1f3f7" : "#30343b";
    const tooltipBackground = isDark ? "#202124" : "#ffffff";
    const tooltipBorder = isDark ? "#777b84" : "#d8dadd";
    const chart = echarts.init(node, undefined, { renderer: "svg" });
    chart.setOption({
      animationDuration: 320,
      tooltip: {
        trigger: "item",
        backgroundColor: tooltipBackground,
        borderColor: tooltipBorder,
        borderWidth: 1,
        textStyle: { color: textColor, fontSize: 13 },
        formatter: (params: unknown) => {
          const item = params as { name?: string; value?: number };
          return `${item.name ?? ""}<br/><strong>${Number(item.value ?? 0).toFixed(7)}</strong>`;
        },
      },
      series: [{
        type: "pie",
        radius: ["58%", "82%"],
        center: ["50%", "50%"],
        silent: false,
        hoverAnimation: true,
        avoidLabelOverlap: true,
        label: { show: false },
        itemStyle: {
          borderColor: isDark ? "#24262b" : "#ffffff",
          borderWidth: 2,
        },
        emphasis: { scale: true, scaleSize: 4 },
        data: [
          { name: t("traeEnterprise.usage.base"), value: 138.4479284, itemStyle: { color: "#1DC981" } },
        ],
      }],
    });
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => chart.resize()) : null;
    resizeObserver?.observe(node);
    return () => {
      resizeObserver?.disconnect();
      chart.dispose();
    };
  }, [t, theme]);

  return <div className="trae-usage-donut" ref={chartRef} role="img" aria-label={t("traeEnterprise.usage.overall")} />;
}

function TraeUsageProgress({ value }: { value: number }) {
  return <div className="trae-usage-progress-track" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

function TraeUsageBoard({ onDetail, onQuota, onBuy }: { onDetail: (memberID: string) => void; onQuota: (member: TraeUsageMemberRow) => void; onBuy: () => void }) {
  const { t } = useTranslation();
  const [memberQuery, setMemberQuery] = useState("");
  const [memberScope, setMemberScope] = useState("all");
  const [account, setAccount] = useState("all");
  const [usageType, setUsageType] = useState("all");
  const [departmentQuery, setDepartmentQuery] = useState("");
  const [expandedDepartments, setExpandedDepartments] = useState<Record<string, boolean>>({
    company: true,
    operation: true,
    "test-level-one": true,
    "test-level-three": false,
    "test-level-four": false,
  });
  const filteredMembers = traeUsageMemberRows.filter((member) => {
    const query = memberQuery.trim().toLowerCase();
    const usage = Number(member.base.replace(/[^0-9.]/g, ""));
    const matchesUsage = usageType === "all" || (usageType === "normal" && usage < 90) || (usageType === "warning" && usage >= 90 && usage < 100) || (usageType === "exhausted" && usage >= 100);
    const matchesScope = memberScope === "all" || member.id === "usage-member-3";
    return matchesScope && matchesUsage && (!query || `${member.name} ${member.email}`.toLowerCase().includes(query)) && (account === "all" || member.account === account);
  });
  const usageDepartments = flattenTraeUsageDepartments(traeUsageDepartmentTree, expandedDepartments);
  const filteredDepartments = usageDepartments.filter((row) => !departmentQuery.trim() || row.name.toLowerCase().includes(departmentQuery.trim().toLowerCase()));
  return <>
    <div className="trae-usage-summary trae-usage-summary--official">
      <article className="trae-usage-summary-card trae-usage-summary-card--overall"><div className="trae-usage-summary-heading"><span>{t("traeEnterprise.usage.overall")}</span><IconInfoCircle aria-hidden="true" /></div><div className="trae-usage-overall-body"><div><strong>￥138.448</strong><span><i className="is-base" />{t("traeEnterprise.usage.base")}　￥138.448</span><span><i className="is-overage" />{t("traeEnterprise.usage.overage")}　￥0.000</span></div><TraeUsageDonut /></div></article>
      <article className="trae-usage-summary-card"><div className="trae-usage-summary-heading"><span>{t("traeEnterprise.usage.base")}</span><IconInfoCircle aria-hidden="true" /></div><strong className="trae-usage-card-money">￥138.448 <small>/ ￥1,000</small></strong><TraeUsageProgress value={13.84} /><div className="trae-usage-limit-row"><span>♙ {t("traeEnterprise.usage.perMemberLimit")} ￥100</span><button className="trae-text-button" type="button" onClick={() => onQuota(traeUsageMemberRows[0])}><IconEdit aria-hidden="true" />{t("traeEnterprise.usage.adjust")}</button></div></article>
      <article className="trae-usage-summary-card"><div className="trae-usage-summary-heading"><span>{t("traeEnterprise.usage.overage")}</span><IconInfoCircle aria-hidden="true" /><button className="trae-secondary-button trae-secondary-button--small" type="button" onClick={onBuy}>{t("traeEnterprise.usage.buy")}</button></div><strong className="trae-usage-empty-package">{t("traeEnterprise.usage.noPackage")}</strong></article>
    </div>
    <TraeSection title={t("traeEnterprise.usage.people")}>
      <TraeToolbar><label className="trae-inline-search trae-inline-search--wide"><IconSearch aria-hidden="true" /><input aria-label={t("traeEnterprise.usage.searchPeople")} placeholder={t("traeEnterprise.usage.searchPeople")} value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} /></label><TraeSelect label={t("traeEnterprise.usage.allMembers")} value={memberScope} onChange={setMemberScope} dropdownClassName="trae-usage-filter-dropdown" options={[{ value: "all", label: t("traeEnterprise.usage.allMembers") }, { value: "quota", label: t("traeEnterprise.usageFilters.quotaMembers") }]} /><TraeSelect label={t("traeEnterprise.usage.allAccounts")} value={account} onChange={setAccount} dropdownClassName="trae-usage-filter-dropdown" options={[{ value: "all", label: t("traeEnterprise.usage.allAccounts") }, { value: "全端账号", label: "全端账号" }, { value: "Work 专属账号", label: "Work 专属账号" }]} /><TraeSelect label={t("traeEnterprise.usageFilters.baseLabel")} value={usageType} onChange={setUsageType} dropdownClassName="trae-usage-filter-dropdown" options={[{ value: "all", label: t("traeEnterprise.usageFilters.all") }, { value: "normal", label: t("traeEnterprise.usageFilters.normal") }, { value: "warning", label: t("traeEnterprise.usageFilters.warning") }, { value: "exhausted", label: t("traeEnterprise.usageFilters.exhausted") }]} /></TraeToolbar>
      <div className="trae-table-scroll"><table className="trae-table trae-usage-board-table"><thead><tr><th><input type="checkbox" aria-label={t("traeEnterprise.usage.selectAll")} /></th><th>{t("traeEnterprise.usage.name")}</th><th>{t("traeEnterprise.usage.department")}</th><th>{t("traeEnterprise.usage.detailAccount")}</th><th>{t("traeEnterprise.usage.periodTotal")}</th><th>{t("traeEnterprise.usage.baseAmount")}</th><th>{t("traeEnterprise.usage.operation")}</th></tr></thead><tbody>{filteredMembers.map((member) => <tr key={member.id}><td><input type="checkbox" aria-label={member.name} /></td><td><span className="trae-person-cell"><span><strong>{member.name}</strong><small>{member.email}</small></span></span></td><td>{member.department}</td><td>{member.account}</td><td className="trae-usage-number">{member.total}</td><td className="trae-usage-number"><span className={member.base === "￥0.000" ? "" : "is-used"}>●</span> {member.base} <small>| ￥100</small></td><td><div className="trae-inline-actions"><button className="trae-text-button" type="button" onClick={() => onDetail(member.id)}>{t("traeEnterprise.usage.detailAction")}</button><button className="trae-text-button" type="button" onClick={() => onQuota(member)}>{t("traeEnterprise.usage.quotaAction")}</button></div></td></tr>)}</tbody></table>{filteredMembers.length === 0 ? <TraeEmpty /> : null}</div>
    </TraeSection>
    <TraeSection title={t("traeEnterprise.usage.departments")}>
      <TraeToolbar><label className="trae-inline-search trae-inline-search--wide trae-usage-department-search"><IconSearch aria-hidden="true" /><input aria-label={t("traeEnterprise.usage.searchDepartment")} placeholder={t("traeEnterprise.usage.searchDepartment")} value={departmentQuery} onChange={(event) => setDepartmentQuery(event.target.value)} /></label></TraeToolbar>
      <div className="trae-table-scroll"><table className="trae-table trae-usage-department-table"><thead><tr><th>{t("traeEnterprise.usage.department")}</th><th>{t("traeEnterprise.usage.periodTotal")}</th><th>{t("traeEnterprise.usage.baseAmount")}</th><th>{t("traeEnterprise.usage.overageAmount")}</th></tr></thead><tbody>{filteredDepartments.map((row) => <tr key={row.id}><td style={{ paddingLeft: `${12 + row.depth * 22}px` }}>{row.hasChildren ? <button className="trae-department-caret" type="button" aria-label={row.expanded ? "收起部门" : "展开部门"} onClick={() => setExpandedDepartments((current) => ({ ...current, [row.id]: !row.expanded }))}>{row.expanded ? "⌄" : "›"}</button> : <span className="trae-department-caret" aria-hidden="true" />}{row.name}</td><td className="trae-usage-number">{row.total}</td><td className="trae-usage-number">{row.base}</td><td className="trae-usage-number">{row.overage}</td></tr>)}</tbody></table></div>
    </TraeSection>
  </>;
}

function TraeUsageDetail({ memberID, onMemberChange }: { memberID: string; onMemberChange: (value: string) => void }) {
  const { t } = useTranslation();
  const [range, setRange] = useState("30d");
  const [customRange, setCustomRange] = useState<Date[]>(() => {
    const today = startOfToday();
    return [addDays(today, -6), today];
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const today = useMemo(() => startOfToday(), []);
  const minDate = useMemo(() => addDays(today, -90), [today]);
  const selectedRows = memberID === "all" ? traeUsageDetailRows : traeUsageDetailRows.filter((row) => row.member === traeUsageMemberRows.find((member) => member.id === memberID)?.name);
  // The demo total intentionally crosses Semi's seven-page truncation threshold.
  const totalDetailRows = 80;
  const paginationLocale = useMemo(
    () => ({
      ...semiZhCN,
      Pagination: {
        ...semiZhCN.Pagination,
        pageSize: "${pageSize}行/页",
      },
    }),
    [],
  );
  function setPreset(nextRange: string) {
    setRange(nextRange);
    if (nextRange === "today") setCustomRange([today, today]);
    if (nextRange === "7d") setCustomRange([addDays(today, -6), today]);
    if (nextRange === "30d") setCustomRange([addDays(today, -29), today]);
    setPage(1);
  }
  function handleCustomRange(nextValue: Date | Date[] | string | string[] | undefined) {
    if (!Array.isArray(nextValue)) return;
    const dates = nextValue.filter((item): item is Date => item instanceof Date);
    if (dates.length === 2 && dates.every((date) => date >= minDate && date <= today)) {
      setCustomRange(dates);
      setPage(1);
    }
  }
  function exportDetail() {
    exportEnterpriseCsv(
      "trae-usage-detail.csv",
      ["日期", "人员", "邮箱", "部门", "客户端", "模型", "Session ID", "Token 消耗", "金额消耗", "模型调用次数", "消耗来源"],
      selectedRows.map((row) => [row.date, row.member, row.email, row.department, row.client, row.model, row.session, row.tokens, row.cost, row.calls, row.source]),
    );
    Toast.success(t("traeEnterprise.usage.downloadSuccess"));
  }
  return <section className="trae-section trae-usage-detail-section">
    <div className="trae-usage-detail-toolbar">
      <TraeSelect label={t("traeEnterprise.usage.chooseMember")} value={memberID} onChange={(value) => { onMemberChange(value); setPage(1); }} searchable dropdownClassName="trae-usage-member-select-dropdown" options={[{ value: "all", label: t("traeEnterprise.usage.allMembers") }, ...traeUsageMemberRows.map((member) => ({ value: member.id, label: member.name }))]} />
      <div className="trae-usage-range-buttons">{[["today", t("traeEnterprise.usage.today")], ["7d", t("traeEnterprise.usage.last7")], ["30d", t("traeEnterprise.usage.last30")], ["custom", t("traeEnterprise.usage.custom")]].map(([value, label]) => <button key={value} className={range === value ? "is-active" : ""} type="button" onClick={() => setPreset(value)}>{label}</button>)}</div>
      {range === "custom" ? <DatePicker className="trae-date-picker trae-usage-detail-date-picker" dropdownClassName="trae-date-picker-dropdown trae-usage-detail-date-dropdown" type="dateRange" value={customRange} format="yyyy/MM/dd" rangeSeparator=" - " showClear={false} disabledDate={(date) => !date || date < minDate || date > today} onChange={handleCustomRange} /> : null}
      <button className="trae-icon-button trae-usage-detail-download" type="button" aria-label={t("traeEnterprise.usage.download")} title={t("traeEnterprise.usage.download")} onClick={exportDetail}><IconDownload aria-hidden="true" /></button>
    </div>
    <div className="trae-table-scroll"><table className="trae-table trae-usage-detail-table"><thead><tr><th>{t("traeEnterprise.usage.detailDate")}</th><th>{t("traeEnterprise.usage.detailPerson")}</th><th>{t("traeEnterprise.usage.department")}</th><th>{t("traeEnterprise.usage.client")}</th><th>{t("traeEnterprise.usage.model")}</th><th>{t("traeEnterprise.usage.session")}</th><th>{t("traeEnterprise.usage.tokensConsumed")}</th><th>{t("traeEnterprise.usage.costConsumed")}</th><th>{t("traeEnterprise.usage.modelCalls")}</th><th>{t("traeEnterprise.usage.source")}</th></tr></thead><tbody>{selectedRows.map((row) => <tr key={row.session}><td>{row.date}</td><td><strong>{row.member}</strong><small>{row.email}</small></td><td>{row.department}</td><td>{row.client}</td><td>{row.model}</td><td><code>{row.session}</code></td><td><span>{t("traeEnterprise.usage.discounted")} </span>{row.tokens}</td><td><span>{t("traeEnterprise.usage.discounted")} </span>{row.cost}</td><td>{row.calls}</td><td>{row.source}</td></tr>)}</tbody></table>{selectedRows.length === 0 ? <TraeEmpty /> : null}</div>
    <div className="trae-usage-pagination" aria-label={t("traeEnterprise.usage.pagination")}>
      <ConfigProvider locale={paginationLocale}>
        <Pagination
          total={totalDetailRows}
          currentPage={page}
          pageSize={pageSize}
          pageSizeOpts={[10, 20, 50, 100]}
          showSizeChanger
          hideOnSinglePage={false}
          prevText="‹"
          nextText="›"
          onChange={(nextPage, nextPageSize) => {
            setPage(nextPage);
            setPageSize(nextPageSize);
          }}
        />
      </ConfigProvider>
    </div>
  </section>;
}

export function TraeEnterpriseUsagePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"board" | "detail">("board");
  const [detailMemberID, setDetailMemberID] = useState("all");
  const [dialog, setDialog] = useState<"limit" | "buy" | null>(null);
  const [quotaMember, setQuotaMember] = useState<TraeUsageMemberRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  function openQuota(member: TraeUsageMemberRow) { setQuotaMember(member); setDialog("limit"); }
  return <TraeShell title={t("traeEnterprise.usage.title")} className="trae-usage-page-official" action={<span className="trae-cycle-label trae-cycle-label--heading">{t("traeEnterprise.usage.cycle", { start: "2026/08/21", end: "2026/09/21" })}</span>}>
    <div className="trae-tabs" role="tablist">{(["board", "detail"] as const).map((item) => <button key={item} className={tab === item ? "is-active" : ""} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{t(`traeEnterprise.usage.tabs.${item}`)}</button>)}</div>
    {tab === "board" ? <TraeUsageBoard onDetail={(memberID) => { setDetailMemberID(memberID); setTab("detail"); }} onQuota={openQuota} onBuy={() => setDialog("buy")} /> : <TraeUsageDetail memberID={detailMemberID} onMemberChange={setDetailMemberID} />}
    <TraeNotice message={notice} onClose={() => setNotice(null)} />
    {dialog === "limit" ? <TraeDialog title={t("traeEnterprise.usage.limitTitle")} onClose={() => { setDialog(null); setQuotaMember(null); }}><form className="trae-dialog-form" onSubmit={(event) => { event.preventDefault(); setDialog(null); setQuotaMember(null); setNotice(t("traeEnterprise.common.success")); }}><p>{t("traeEnterprise.usage.limitHint")}</p><label>{t("traeEnterprise.usage.perMemberLimit")}<input required inputMode="decimal" defaultValue="100" placeholder={t("traeEnterprise.usage.limitPlaceholder")} /></label><div className="trae-dialog-actions"><button className="trae-secondary-button" type="button" onClick={() => setDialog(null)}>{t("traeEnterprise.common.cancel")}</button><button className="trae-primary-button" type="submit">{t("traeEnterprise.common.save")}</button></div></form></TraeDialog> : null}
    {dialog === "buy" ? <TraeDialog title={t("traeEnterprise.usage.buyTitle")} onClose={() => setDialog(null)}><div className="trae-dialog-form"><p>{t("traeEnterprise.usage.buyHint")}</p><div className="trae-dialog-actions"><button className="trae-secondary-button" type="button" onClick={() => setDialog(null)}>{t("traeEnterprise.common.cancel")}</button><button className="trae-primary-button" type="button" onClick={() => { setDialog(null); setNotice(t("traeEnterprise.common.success")); }}>{t("traeEnterprise.common.confirm")}</button></div></div></TraeDialog> : null}
  </TraeShell>;
}

export function TraeEnterpriseAuditPage() {
  const { t } = useTranslation();
  const [action, setAction] = useState("all");
  const [operator, setOperator] = useState("all");
  const [detail, setDetail] = useState<(typeof auditRows)[number] | null>(null);
  function exportData() {
    exportEnterpriseCsv(
      "trae-operation-log.csv",
      ["时间", "操作人", "操作类型", "详情", "结果", "IP"],
      auditRows.map((row) => [
        row.time,
        row.operator,
        row.action,
        row.detail,
        row.result,
        row.ip,
      ]),
    );
    Toast.success("导出成功");
  }
  const rows = auditRows.filter(
    (row) =>
      (action === "all" || row.action === action) &&
      (operator === "all" || row.operator === operator),
  );
  return (
    <TraeShell
      title={t("traeEnterprise.audit.title")}
      action={
        <button
          className="trae-primary-button"
          type="button"
          onClick={exportData}
        >
          <IconDownload aria-hidden="true" />
          {t("traeEnterprise.audit.export")}
        </button>
      }
    >
      <TraeToolbar>
        <TraeSelect
          label={t("traeEnterprise.audit.type")}
          value={action}
          onChange={setAction}
          options={[
            { value: "all", label: t("traeEnterprise.audit.type") },
            ...auditRows
              .map((row) => ({ value: row.action, label: row.action }))
              .filter(
                (option, index, list) =>
                  list.findIndex((item) => item.value === option.value) ===
                  index,
              ),
          ]}
        />
        <TraeSelect
          label={t("traeEnterprise.audit.operator")}
          value={operator}
          onChange={setOperator}
          options={[
            { value: "all", label: t("traeEnterprise.audit.operator") },
            ...auditRows
              .map((row) => ({ value: row.operator, label: row.operator }))
              .filter(
                (option, index, list) =>
                  list.findIndex((item) => item.value === option.value) ===
                  index,
              ),
          ]}
        />
        <label className="trae-date-field trae-date-field--single">
          <IconCalendar aria-hidden="true" />
          <input
            aria-label={t("traeEnterprise.audit.date")}
            placeholder={t("traeEnterprise.audit.date")}
          />
        </label>
      </TraeToolbar>
      <div className="trae-table-scroll">
        <table className="trae-table">
          <thead>
            <tr>
              <th>{t("traeEnterprise.audit.time")}</th>
              <th>{t("traeEnterprise.audit.operator")}</th>
              <th>{t("traeEnterprise.audit.action")}</th>
              <th>{t("traeEnterprise.audit.detail")}</th>
              <th>{t("traeEnterprise.audit.result")}</th>
              <th>{t("traeEnterprise.audit.ip")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.time}</td>
                <td>{row.operator}</td>
                <td>{row.action}</td>
                <td className="trae-table-detail">{row.detail}</td>
                <td>
                  <span className={`trae-status-badge is-${row.result}`}>
                    <i />
                    {row.result === "success"
                      ? t("traeEnterprise.audit.success")
                      : t("traeEnterprise.audit.failed")}
                  </span>
                </td>
                <td>{row.ip}</td>
                <td>
                  <button
                    className="trae-text-button"
                    type="button"
                    onClick={() => setDetail(row)}
                  >
                    {t("traeEnterprise.audit.view")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <TraeEmpty hint={t("traeEnterprise.audit.empty")} />
        ) : null}
      </div>
      {detail ? (
        <TraeDialog
          title={t("traeEnterprise.audit.detailTitle")}
          onClose={() => setDetail(null)}
        >
          <dl className="trae-detail-list">
            <div>
              <dt>{t("traeEnterprise.audit.detailOperator")}</dt>
              <dd>{detail.operator}</dd>
            </div>
            <div>
              <dt>{t("traeEnterprise.audit.action")}</dt>
              <dd>{detail.action}</dd>
            </div>
            <div>
              <dt>{t("traeEnterprise.audit.detailTarget")}</dt>
              <dd>{detail.detail}</dd>
            </div>
            <div>
              <dt>{t("traeEnterprise.audit.time")}</dt>
              <dd>{detail.time}</dd>
            </div>
            <div>
              <dt>{t("traeEnterprise.audit.ip")}</dt>
              <dd>{detail.ip}</dd>
            </div>
            <div>
              <dt>{t("traeEnterprise.audit.detailRequest")}</dt>
              <dd>
                <code>{detail.id}-request</code>
              </dd>
            </div>
          </dl>
          <div className="trae-dialog-actions">
            <button
              className="trae-primary-button"
              type="button"
              onClick={() => setDetail(null)}
            >
              {t("traeEnterprise.audit.close")}
            </button>
          </div>
        </TraeDialog>
      ) : null}
    </TraeShell>
  );
}
