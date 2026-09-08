import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getEnterpriseDepartments,
  type EnterpriseDepartment,
  type EnterpriseDepartmentPage,
} from "@/api/enterprise-console";
import { loadEnterpriseDepartmentTree } from "./trae-enterprise";

vi.mock("@/api/enterprise-console", async () => {
  const actual = await vi.importActual<typeof import("@/api/enterprise-console")>("@/api/enterprise-console");
  return { ...actual, getEnterpriseDepartments: vi.fn() };
});

const getEnterpriseDepartmentsMock = vi.mocked(getEnterpriseDepartments);

function department(id: string): EnterpriseDepartment {
  return {
    id,
    parent_id: null,
    name: id,
    depth: 0,
    child_count: 0,
    member_count: 0,
    version: "1",
    created_at: 0,
    updated_at: 0,
  };
}

describe("企业部门树加载", () => {
  beforeEach(() => vi.clearAllMocks());

  it("按父级逐页读取全部部门，而不是只取第一页", async () => {
    const items = Array.from({ length: 11 }, (_, index) => department(`dept-${index + 1}`));
    getEnterpriseDepartmentsMock.mockImplementation(async (_context, options = {}) => {
      const page = options.page ?? 1;
      const start = (page - 1) * 10;
      const pageItems = items.slice(start, start + 10);
      return {
        context: {} as EnterpriseDepartmentPage["context"],
        items: pageItems,
        total: items.length,
        page,
        page_size: 10,
      };
    });

    const tree = await loadEnterpriseDepartmentTree("ent-test", new AbortController().signal);

    expect(tree.map((node) => node.id)).toEqual(items.map((item) => item.id));
    expect(getEnterpriseDepartmentsMock).toHaveBeenCalledTimes(2);
    expect(getEnterpriseDepartmentsMock.mock.calls[0]?.[1]).toMatchObject({ page: 1, page_size: 10 });
    expect(getEnterpriseDepartmentsMock.mock.calls[1]?.[1]).toMatchObject({ page: 2, page_size: 10 });
  });
});
