import assert from "node:assert/strict";
import test from "node:test";
import { buildMemberSeats, reviewMemberSeat, memberSeatStatus, formatSeatActivity } from "../src/lib/metrics/member-seats";
import { MEMBER_SEATS, SEAT_SNAPSHOT_DATE } from "../src/mocks/member-seats";

const candidate = MEMBER_SEATS[0];
test("one person can have an observed vendor seat and a different candidate seat", () => {
  const rows = buildMemberSeats(MEMBER_SEATS, SEAT_SNAPSHOT_DATE);
  const seats = rows.filter((seat) => seat.account === candidate.account);
  assert.deepEqual(seats.map((seat) => [seat.vendor, seat.review]), [["Claude", "candidate"], ["Codex", "observed"]]);
  assert.equal(new Set(rows.map((seat) => seat.id)).size, rows.length);
  assert.equal(rows.filter((seat) => seat.account === "seoyeon.kim@codeworks.io" && seat.review === "candidate").length, 2);
});
test("incomplete assignments, stale or short coverage and new seats cannot become candidates", () => {
  for (const patch of [
    { tier: null }, { assignment: "unknown" as const }, { assignedOn: null }, { lastObservedAt: null },
    { coverage: null }, { coverage: { from: "2026-06-01", through: "2026-09-12" } },
    { coverage: { from: "2026-09-10", through: SEAT_SNAPSHOT_DATE } }, { assignedOn: "2026-09-10" },
    { lastObservedAt: "2026-09-14" },
  ]) assert.equal(reviewMemberSeat({ ...candidate, ...patch }, SEAT_SNAPSHOT_DATE, 14).review, "hold");
  assert.equal(reviewMemberSeat({ ...candidate, assignment: "unassigned" }, SEAT_SNAPSHOT_DATE, 14).review, "unassigned");
});
test("candidate thresholds use complete coverage and include the exact day boundary", () => {
  const seat = { ...candidate, lastObservedAt: "2026-08-30" };
  assert.equal(reviewMemberSeat(seat, SEAT_SNAPSHOT_DATE, 14).review, "candidate");
  assert.equal(reviewMemberSeat(seat, SEAT_SNAPSHOT_DATE, 30).review, "observed");
});
test("mixed vendor states keep both badges, and unknown activity is never reclaimable", () => {
  const seats = buildMemberSeats(MEMBER_SEATS, SEAT_SNAPSHOT_DATE);
  assert.deepEqual(memberSeatStatus(seats.filter((seat) => seat.account === candidate.account), null, 14), { active: true, candidate: true, unobserved: false });
  assert.equal(formatSeatActivity("2026-09-12T01:30:00Z"), "2026.09.12 10:30");
  assert.equal(formatSeatActivity(null), "관측 기록 없음");
});
