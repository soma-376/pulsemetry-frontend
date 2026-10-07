import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_TEXT,
  candidatePagesOptions,
  memberSeatSchema,
  METHOD_TEXT,
  reclaimPreviewSchema,
  seatReasonText,
  vendorSeatSchema,
} from "../src/lib/api/seats";
import { operationSchema } from "../src/lib/api/operations";

// 서버 명세(대시보드 "좌석 원장 조회", enrollment §12 "좌석 회수·복원")의 모양을 그대로 옮긴 예시.
const seat = {
  seatAssignmentId: "11111111-1111-4111-8111-111111111111",
  version: 2,
  vendorId: "v-claude",
  vendorName: "Claude",
  kind: "claude_team",
  contractVersion: 1,
  tierId: null,
  tierLabel: null,
  vendorTier: null,
  account: "dana@example.test",
  accountKind: "email",
  state: "assigned",
  source: "manual",
  memberLink: "email_match",
  assignedAt: "2026-08-01T00:00:00Z",
  releaseEffectiveOn: null,
  releasedAt: null,
  ledgerAvailability: "partial",
  ledgerReason: "seat_sync_outdated",
  lastUsedAt: null,
  idleDays: 60,
  reviewReason: null,
  reclaimCandidate: true,
  canReclaim: true,
  reclaimReason: null,
  reclaimMethod: "admin_action",
  lastControl: {
    operationId: "22222222-2222-4222-8222-222222222222",
    kind: "seat_reclaim",
  },
};

test("member seats keep server values — unknown last use stays null, never zero", () => {
  const parsed = memberSeatSchema.parse(seat);
  assert.equal(parsed.lastUsedAt, null);
  assert.equal(parsed.idleDays, 60);
  assert.equal(parsed.lastControl?.kind, "seat_reclaim");
  // 가산 필드가 없는 서버도 받는다.
  const older: Record<string, unknown> = { ...seat };
  delete older.reclaimMethod;
  delete older.lastControl;
  assert.equal(memberSeatSchema.parse(older).reclaimMethod, undefined);
  assert.throws(
    () => memberSeatSchema.parse({ ...seat, state: "unknown" }),
    "모르는 상태를 받지 않는다",
  );
});

test("vendor seats carry unlinked seats with a null member", () => {
  const parsed = vendorSeatSchema.parse({
    ...seat,
    memberId: null,
    memberAccount: null,
    memberLink: null,
    note: null,
    reclaimMethod: null,
    canReclaim: false,
    reclaimReason: "not_assigned",
    lastControl: null,
  });
  assert.equal(parsed.memberAccount, null);
  assert.equal(seatReasonText(parsed.reclaimReason), "배정 좌석이 아닙니다");
});

test("preview keeps the savings basis and per-seat method; unknown savings stay null", () => {
  const preview = reclaimPreviewSchema.parse({
    previewId: "p",
    expiresAt: "2026-10-01T00:05:00Z",
    eligibleSeatAssignmentIds: [seat.seatAssignmentId],
    rejected: [{ seatAssignmentId: "x", reason: "version_conflict" }],
    estimatedMonthlySavingsUsd: null,
    savingsEffectiveAt: null,
    resultingUnallocatedSeats: 6,
    savingsBasis: null,
    targets: [
      {
        seatAssignmentId: seat.seatAssignmentId,
        vendorId: "v-claude",
        method: "admin_action",
      },
    ],
  });
  assert.equal(preview.estimatedMonthlySavingsUsd, null);
  assert.equal(
    METHOD_TEXT[preview.targets![0].method],
    "벤더 콘솔에서 직접 해지 후 확인",
  );
  assert.equal(
    seatReasonText(preview.rejected[0].reason),
    "다른 곳에서 좌석이 바뀌었습니다",
  );
});

test("operations of seat control keep awaiting admin action apart from success", () => {
  const operation = operationSchema.parse({
    operationId: "op",
    kind: "seat_reclaim",
    status: "awaiting_admin_action",
    createdAt: "2026-10-01T00:00:00Z",
    completedAt: null,
    results: [
      {
        targetId: seat.seatAssignmentId,
        status: "awaiting_admin_action",
        reason: null,
        action: "release_in_vendor_console",
      },
    ],
    canRestore: false,
    restoreUntil: "2026-10-31T00:00:00Z",
  });
  assert.notEqual(operation.status, "succeeded");
  assert.match(ACTION_TEXT[operation.results[0].action!], /해지 완료 확인/);
  assert.equal(
    operationSchema.parse({ ...operation, kind: "seat_sync", results: [] })
      .kind,
    "seat_sync",
  );
  assert.equal(
    seatReasonText("some_new_code"),
    "some_new_code",
    "모르는 사유는 코드 그대로",
  );
});

test("candidate pages continue from the dashboard cursor and stop when the server has no next cursor", () => {
  const options = candidatePagesOptions("org", "c1");
  assert.equal(options.initialPageParam, "c1");
  const page = (next: string | null) => ({
    meta: {
      organizationId: "org",
      asOf: "2026-10-01T00:00:00Z",
      snapshotId: "s",
    },
    idleDays: 30,
    candidates: {
      availability: "available" as const,
      reason: null,
      data: { items: [], totalCount: 3, nextCursor: next },
    },
  });
  assert.equal(options.getNextPageParam!(page("c2"), [], "c1", []), "c2");
  assert.equal(options.getNextPageParam!(page(null), [], "c1", []), null);
});
