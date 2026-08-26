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

  it("protects a super administrator while retaining department changes", () => {
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
    ).toEqual({ disabled: false });
  });

  it("allows a signed-in super administrator to manage their own account", () => {
    const ownerOperator = { memberID: owner.id, role: "owner" } as const;
    expect(
      getTraeBulkActionAvailability("changeRole", [owner], ownerOperator),
    ).toEqual({ disabled: false });
    expect(
      getTraeBulkActionAvailability("removeMember", [owner], ownerOperator),
    ).toEqual({ disabled: false });
  });

  it("enables resend only when every selected member is pending activation", () => {
    const invited = { ...admin, status: "invited" } as const;
    expect(
      getTraeBulkActionAvailability(
        "sendInvite",
        [invited],
        regularAdminOperator,
      ),
    ).toEqual({ disabled: false });
  });
});
