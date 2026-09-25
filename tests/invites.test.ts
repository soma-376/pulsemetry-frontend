import assert from "node:assert/strict";
import test from "node:test";
import { buildMembers, INVITE_TTL_DAYS, type PendingInvite } from "../src/lib/metrics/members";
import { SEED_TEAMS } from "../src/lib/organization";

const week = { start: "2026-09-07", end: "2026-09-13" };
const base = { assigned: {} };
const invite = (email: string, invitedAt: string): PendingInvite =>
  ({ email, team: "결제", role: "member", invitedAt });

test("an invited email with signals uses the measured member row without duplicates", () => {
  const measured = buildMembers(week);
  const active = measured.memberRows[0];
  const joined = buildMembers(week, { ...base, invites: [invite(active.account, "2026-09-13")] }, SEED_TEAMS);
  assert.equal(joined.memberRows.length, measured.memberRows.length);
  assert.equal(joined.memberRows.filter((member) => member.account === active.account).length, 1);
  assert.equal(joined.memberRows.find((member) => member.account === active.account)?.invited, false);
});


test("invitations do not allocate vendor seats or alter measured usage", () => {
  const none = buildMembers(week, { ...base, invites: [] });
  const many = buildMembers(week, { ...base, invites: Array.from({ length: 200 }, (_, i) => invite(`p${i}@vendor.dev`, "2026-09-13")) });
  assert.equal(many.activeUsers, none.activeUsers);
  assert.deepEqual(many.reclaimRows, none.reclaimRows);
  const row = many.memberRows.find((r) => r.account === "p0@vendor.dev")!;
  assert.equal(row.costText, "—");
  assert.equal(row.lastSeen, "기록 없음");
  assert.deepEqual(row.vendorSeats, []);
  assert.equal(row.invited, true);
  assert.equal("stateLabel" in row, false);
  assert.doesNotMatch(many.inviteNote, /부족|모자랍니다/);
  assert.match(many.seatStatus, /자동 배정하지 않습니다/);
});

test("만료는 발송일 + TTL 로 판정하고 만료된 초대는 따로 표시한다", () => {
  // TODAY = 2026-09-13
  const m = buildMembers(week, {
    ...base,
    invites: [
      invite("fresh@vendor.dev", "2026-09-13"),
      invite("soon@vendor.dev", "2026-09-12"), // 하루 지남
      invite("edge@vendor.dev", "2026-09-06"), // 정확히 TTL 경과
      invite("old@vendor.dev", "2026-08-20"),
    ],
  });
  const by = (e: string) => m.inviteRows.find((r) => r.email === e)!;
  assert.equal(by("fresh@vendor.dev").daysLeft, INVITE_TTL_DAYS);
  assert.equal(by("fresh@vendor.dev").expiryText, "7일 남음");
  assert.equal(by("soon@vendor.dev").daysLeft, INVITE_TTL_DAYS - 1);
  // 경계: 남은 일수가 0 이면 만료입니다
  assert.equal(by("edge@vendor.dev").daysLeft, 0);
  assert.equal(by("edge@vendor.dev").expired, true);
  assert.equal(by("old@vendor.dev").expired, true);
  assert.equal(by("old@vendor.dev").expiryText, "만료됨");
  // 만료된 초대는 수락될 수 없으므로 좌석 전망에서 빠집니다
  assert.match(m.inviteNote, /2명 대기 · 만료 2명/);
});
