import { describe, expect, it } from "vitest";
import {
  getTraeBulkActionAvailability,
  type TraeBulkMember,
} from "./trae-member-bulk-actions";

const admin: TraeBulkMember = {
  id: "admin-2",
  role: "admin",
  status: "active",
};
const owner: TraeBulkMember = {
  id: "owner-1",
  role: "owner",
  status: "active",
};
const regularAdminOperator = { memberID: "admin-1", role: "admin" } as const;

describe("getTraeBulkActionAvailability", () => {
  it("keeps regular administrator batch actions available except invite", () => {
    expect(
      getTraeBulkActionAvailability(
        "removeMember",
        [admin],
        regularAdminOperator,
      ),
    ).toEqual({ disabled: false });
    expect(
      getTraeBulkActionAvailability(
        "sendInvite",
        [admin],
        regularAdminOperator,
      ),
    ).toEqual({ disabled: true, reason: "inviteUnavailable" });
  });

  it("protects the owner from removal and department changes", () => {
    expect(
      getTraeBulkActionAvailability(
        "removeMember",
        [admin, owner],
        regularAdminOperator,
      ),
    ).toEqual({ disabled: true, reason: "removeProtectedMember" });
    expect(
      getTraeBulkActionAvailability(
        "changeDepartment",
        [admin, owner],
        regularAdminOperator,
      ),
    ).toEqual({ disabled: true, reason: "protectedMember" });
  });

  it("protects even the signed-in owner from ordinary role and removal actions", () => {
    const ownerOperator = { memberID: owner.id, role: "owner" } as const;
    expect(
      getTraeBulkActionAvailability("changeRole", [owner], ownerOperator),
    ).toEqual({ disabled: true, reason: "protectedMember" });
    expect(
      getTraeBulkActionAvailability("removeMember", [owner], ownerOperator),
    ).toEqual({ disabled: true, reason: "removeProtectedMember" });
  });

  it("enables resend only when every selected member is pending review", () => {
    const pending = { ...admin, status: "pending" } as const;
    expect(
      getTraeBulkActionAvailability(
        "sendInvite",
        [pending],
        regularAdminOperator,
      ),
    ).toEqual({ disabled: false });
  });
});
