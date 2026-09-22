import assert from "node:assert/strict";
import test from "node:test";
import { buildMembers, INVITE_TTL_DAYS, type PendingInvite } from "../src/lib/metrics/members";
import { SEED_TEAMS } from "../src/lib/organization";

const week = { start: "2026-09-07", end: "2026-09-13" };
const base = { reclaimed: {}, assigned: {} };
const invite = (email: string, invitedAt: string): PendingInvite =>
  ({ email, team: "결제", role: "member", invitedAt });

test("an invited email with signals uses the measured member row without duplicates", () => {
  const measured = buildMembers(week);
  const active = measured.memberRows.find((member) => member.stateLabel === "활성")!;
  const joined = buildMembers(week, { ...base, invites: [invite(active.account, "2026-09-13")] }, SEED_TEAMS);
  assert.equal(joined.memberRows.length, measured.memberRows.length);
  assert.equal(joined.memberRows.filter((member) => member.account === active.account).length, 1);
  assert.equal(joined.memberRows.find((member) => member.account === active.account)?.stateLabel, "활성");
});


test("구성원 상태는 세 가지이며 초대 만료는 초대 카드에서 별도로 표시한다", () => {
  const measured = buildMembers(week);
  const reclaimed = measured.reclaimRows[0].account;
  const state = { ...base, reclaimed: { [reclaimed]: true }, invites: [invite("old@vendor.dev", "2026-08-20")] };
  const model = buildMembers(week, state);
  assert.deepEqual(new Set(model.memberRows.map((row) => row.stateLabel)), new Set(["신호 대기", "활성", "회수 후보"]));
  assert.equal(model.inviteRows[0].expiryText, "만료됨");
  assert.equal(model.reclaimRows.some((row) => row.account === reclaimed), false);
  assert.equal(model.memberRows.find((row) => row.account === reclaimed)?.roleLabel, "조회 전용");
});

test("대기 중 초대는 좌석·활성 사용자·비용 어디에도 들어가지 않는다", () => {
  const none = buildMembers(week, { ...base, invites: [] });
  const many = buildMembers(week, {
    ...base,
    invites: Array.from({ length: 5 }, (_, i) => invite(`p${i}@vendor.dev`, "2026-09-13")),
  });
  assert.equal(many.activeUsers, none.activeUsers);
  assert.equal(many.idleSeats, none.idleSeats);
  assert.equal(many.seats, none.seats);
  // 좌석 카드의 "값"은 그대로고 캡션만 전망을 덧붙입니다
  const idleCard = (m: typeof none) => m.seatCards.find((c) => c.label === "미사용 좌석")!;
  assert.equal(idleCard(many).value, idleCard(none).value);
  assert.match(idleCard(many).caption, /초대 5명 수락 시/);
  // 초대는 비용이 없습니다 — 0 이 아니라 없음
  const row = many.memberRows.find((r) => r.account === "p0@vendor.dev")!;
  assert.equal(row.costText, "—");
  assert.equal(row.stateLabel, "신호 대기");
  assert.equal(row.lastSeen, "기록 없음");
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

test("남은 좌석보다 많이 초대하면 부족분을 경고한다", () => {
  const none = buildMembers(week, { ...base, invites: [] });
  const over = buildMembers(week, {
    ...base,
    invites: Array.from({ length: none.idleSeats + 3 }, (_, i) =>
      invite(`o${i}@vendor.dev`, "2026-09-13"),
    ),
  });
  assert.match(over.inviteNote, /좌석 3석 부족/);
  const idleCard = over.seatCards.find((c) => c.label === "미사용 좌석")!;
  assert.match(idleCard.caption, /3석 모자랍니다/);
  assert.equal(idleCard.tone, "var(--red)");
  // 경고를 띄워도 실제 좌석 수치는 건드리지 않습니다
  assert.equal(over.idleSeats, none.idleSeats);
});
