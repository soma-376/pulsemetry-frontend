/** One vendor assignment, independent of dashboard membership and role. */
export type MemberSeat = {
  id: string;
  account: string;
  vendorId: string;
  vendor: string;
  tier: string | null;
  assignment: "assigned" | "unassigned" | "unknown";
  assignedOn: string | null;
  lastObservedAt: string | null;
  /** Contiguous, complete coverage for this vendor account (not daemon coverage). */
  coverage: { from: string; through: string } | null;
};
