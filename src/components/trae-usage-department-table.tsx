import { useEffect, useMemo, useState } from "react";
import Table from "@douyinfe/semi-ui/lib/es/table";
import { useTranslation } from "react-i18next";
import { TraeTableEmpty } from "./trae-table-empty";
import "./trae-usage-department-table.css";

export type TraeUsageDepartmentNode = {
  id: string;
  name: string;
  total: string;
  tokens: string;
  requests: string;
  children?: TraeUsageDepartmentNode[];
};

type TraeUsageDepartmentTableProps = {
  dataSource: TraeUsageDepartmentNode[];
  departmentTitle: string;
  periodTotalTitle: string;
  tokenTitle: string;
  requestTitle: string;
  query: string;
};

function filterDepartmentTree(
  nodes: TraeUsageDepartmentNode[],
  normalizedQuery: string,
): TraeUsageDepartmentNode[] {
  if (!normalizedQuery) return nodes;

  return nodes.flatMap((node) => {
    const children = filterDepartmentTree(node.children ?? [], normalizedQuery);
    const matches = node.name.toLocaleLowerCase().includes(normalizedQuery);
    return matches || children.length ? [{ ...node, children }] : [];
  });
}

function collectExpandableKeys(nodes: TraeUsageDepartmentNode[]): string[] {
  return nodes.flatMap((node) =>
    node.children?.length
      ? [node.id, ...collectExpandableKeys(node.children)]
      : [],
  );
}

/** Semi Table owns tree indentation and expansion so headers and cells share one column grid. */
export function TraeUsageDepartmentTable({
  dataSource,
  departmentTitle,
  periodTotalTitle,
  tokenTitle,
  requestTitle,
  query,
}: TraeUsageDepartmentTableProps) {
  const { t } = useTranslation();
  const [expandedRowKeys, setExpandedRowKeys] = useState<Array<string | number>>([]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredData = useMemo(
    () => filterDepartmentTree(dataSource, normalizedQuery),
    [dataSource, normalizedQuery],
  );

  useEffect(() => {
    if (!normalizedQuery) {
      // 首次加载真实目录时展开企业根节点，后续收起状态由 Semi 自己维护。
      setExpandedRowKeys((current) => current.length > 0 ? current : dataSource.slice(0, 1).map((node) => node.id));
      return;
    }
    // 搜索条件变化时展开匹配路径一次，后续仍交给 Semi 响应用户的收起操作。
    setExpandedRowKeys(collectExpandableKeys(filteredData));
  }, [dataSource, filteredData, normalizedQuery]);

  return (
    <div className="trae-usage-department-table-scroll">
      <Table<TraeUsageDepartmentNode>
        className="trae-usage-department-table"
        dataSource={filteredData}
        empty={<TraeTableEmpty hint={t("traeEnterprise.common.noDataHint")} />}
        rowKey="id"
        childrenRecordName="children"
        expandedRowKeys={expandedRowKeys}
        indentSize={24}
        pagination={false}
        onExpandedRowsChange={(rows) => {
          setExpandedRowKeys(
            (rows ?? []).flatMap((row) => ("id" in row ? [row.id] : [])),
          );
        }}
        columns={[
          {
            title: departmentTitle,
            dataIndex: "name",
            key: "department",
            width: "34%",
            render: (value) => <span className="trae-usage-department-name">{String(value)}</span>,
          },
          {
            title: periodTotalTitle,
            dataIndex: "total",
            key: "total",
            width: "22%",
            align: "right",
            className: "trae-usage-department-amount",
          },
          {
            title: tokenTitle,
            dataIndex: "tokens",
            key: "tokens",
            width: "22%",
            align: "right",
            className: "trae-usage-department-amount",
          },
          {
            title: requestTitle,
            dataIndex: "requests",
            key: "requests",
            width: "22%",
            align: "right",
            className: "trae-usage-department-amount",
          },
        ]}
      />
    </div>
  );
}
