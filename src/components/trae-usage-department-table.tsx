import { useEffect, useMemo, useState } from "react";
import Table from "@douyinfe/semi-ui/lib/es/table";
import "./trae-usage-department-table.css";

export type TraeUsageDepartmentNode = {
  id: string;
  name: string;
  total: string;
  base: string;
  overage: string;
  children?: TraeUsageDepartmentNode[];
};

type TraeUsageDepartmentTableProps = {
  dataSource: TraeUsageDepartmentNode[];
  departmentTitle: string;
  periodTotalTitle: string;
  baseAmountTitle: string;
  overageAmountTitle: string;
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
  baseAmountTitle,
  overageAmountTitle,
  query,
}: TraeUsageDepartmentTableProps) {
  const [expandedRowKeys, setExpandedRowKeys] = useState<Array<string | number>>([
    "company",
    "operation",
    "test-level-one",
  ]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredData = useMemo(
    () => filterDepartmentTree(dataSource, normalizedQuery),
    [dataSource, normalizedQuery],
  );

  useEffect(() => {
    if (!normalizedQuery) return;
    // 搜索条件变化时展开匹配路径一次，后续仍交给 Semi 响应用户的收起操作。
    setExpandedRowKeys(collectExpandableKeys(filteredData));
  }, [filteredData, normalizedQuery]);

  return (
    <div className="trae-usage-department-table-scroll">
      <Table<TraeUsageDepartmentNode>
        className="trae-usage-department-table"
        dataSource={filteredData}
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
            title: baseAmountTitle,
            dataIndex: "base",
            key: "base",
            width: "22%",
            align: "right",
            className: "trae-usage-department-amount",
          },
          {
            title: overageAmountTitle,
            dataIndex: "overage",
            key: "overage",
            width: "22%",
            align: "right",
            className: "trae-usage-department-amount",
          },
        ]}
      />
    </div>
  );
}
