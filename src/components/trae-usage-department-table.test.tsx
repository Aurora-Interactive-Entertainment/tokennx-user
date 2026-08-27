import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  TraeUsageDepartmentTable,
  type TraeUsageDepartmentNode,
} from "./trae-usage-department-table";

const dataSource: TraeUsageDepartmentNode[] = [
  {
    id: "company",
    name: "Company",
    total: "￥10.0000",
    tokens: "1,000",
    requests: "10",
    children: [
      {
        id: "operation",
        name: "Operation",
        total: "￥10.0000",
        tokens: "500",
        requests: "5",
      },
    ],
  },
];

function renderTable(query = "") {
  return render(
    <TraeUsageDepartmentTable
      dataSource={dataSource}
      departmentTitle="Department"
      periodTotalTitle="Total"
      tokenTitle="Tokens"
      requestTitle="Requests"
      query={query}
    />,
  );
}

describe("TraeUsageDepartmentTable", () => {
  it("renders Semi tree rows and aligned amount columns", () => {
    const { container } = renderTable();

    expect(container.querySelector(".semi-table")).toBeInTheDocument();
    expect(screen.getByText("Operation")).toBeInTheDocument();
    expect(
      container.querySelectorAll(
        ".semi-table-row-head.trae-usage-department-amount",
      ),
    ).toHaveLength(3);
    expect(container.querySelectorAll(".trae-usage-department-amount").length).toBeGreaterThanOrEqual(3);
  });

  it("uses Semi expansion behavior", () => {
    renderTable();

    fireEvent.click(screen.getByRole("button", { name: "Expand this row" }));
    expect(screen.queryByText("Operation")).not.toBeInTheDocument();
  });

  it("keeps matching descendants visible while searching", () => {
    renderTable("operation");

    expect(screen.getByText("Company")).toBeInTheDocument();
    expect(screen.getByText("Operation")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand this row" }));
    expect(screen.queryByText("Operation")).not.toBeInTheDocument();
  });
});
