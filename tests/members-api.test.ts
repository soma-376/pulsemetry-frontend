import { test } from "node:test";
import assert from "node:assert/strict";
import { ManagementError } from "../src/lib/api/management";
import { fetchWaitingInvitations } from "../src/lib/api/invitations";
import { fetchMembersView, membersOptions, type Member } from "../src/lib/api/members";
import { buildMembersView, memberActivity, membersCsv } from "../src/lib/members-view";

const ORG = "11111111-1111-4111-8111-111111111111";
const period = { startDate: "2026-09-01", endDate: "2026-09-28" };
const usage = (cost: string | null, sessions: number | null) => ({ activeUsers: 1, sessionCount: sessions, equivalentCostUsd: cost,
  tokens: { inputUncached: null, output: null, cacheRead: null, cacheWrite: null, total: null } });
const member = (index: number, extra: Partial<Member> = {}): Member => ({
  memberId: `member-${index}`, account: `member${index}@example.test`, displayName: `구성원 ${index}`, team: { teamId: "team-a", teamName: "플랫폼" },
  role: "member", status: "active", version: 1000 + index, periodUsage: usage(String(index), index), lastUsedAt: "2026-09-27T01:00:00Z",
  observation: "partial", seatState: "unknown", ...extra,
});
const unavailable = { availability: "unavailable" as const, reason: "not_applicable", data: null };
const notSent = { status: "not_sent", reason: "mail_disabled", queuedAt: null, lastAttemptAt: null, sentAt: null, failureCode: null, attempts: 0 };
const meta = (snapshotId = "snapshot-1") => ({ organizationId: ORG, startDate: period.startDate, endDate: period.endDate, snapshotId });
const dashboard = (members: Member[], total: number, nextCursor: string | null, unassigned: Member[] = []) => ({
  meta: meta(), asOf: "2026-09-29T00:00:00Z",
  summary: { rosterMembers: total, activeUsers: null, unassignedMembers: unassigned.length, periodUnassignedEquivalentCostUsd: null, periodTotalEquivalentCostUsd: null, seats: unavailable },
  policy: { idleDays: 14, version: 0 }, capabilities: { invite: true, assignTeam: true, reclaimSeats: false, restoreSeats: false },
  members: { items: members, totalCount: total, nextCursor }, unassigned: { items: unassigned, totalCount: unassigned.length, nextCursor: null },
  reclaimCandidates: unavailable,
});

test("members read the dashboard, then every page of the roster from the same snapshot", async () => {
  const original = global.fetch, urls: URL[] = [];
  global.fetch = async (input) => {
    const url = new URL(String(input)); urls.push(url);
    if (url.pathname.endsWith("/members/dashboard")) return Response.json(dashboard([member(1), member(2)], 5, "c1"));
    const cursor = url.searchParams.get("cursor");
    return Response.json({ meta: meta(), members: cursor === "c1" ? { items: [member(3), member(4)], totalCount: 5, nextCursor: "c2" } : { items: [member(5)], totalCount: 5, nextCursor: null } });
  };
  try {
    const view = await fetchMembersView(ORG, period);
    assert.deepEqual(view.members.map((item) => item.memberId), ["member-1", "member-2", "member-3", "member-4", "member-5"]);
    assert.equal(urls.length, 3);
    assert.equal(urls[0].searchParams.get("startDate"), "2026-09-01");
    assert.equal(urls[0].searchParams.get("endDate"), "2026-09-28");
    assert.equal(urls[0].searchParams.get("timeZone"), "Asia/Seoul");
    for (const url of urls.slice(1)) {
      assert.match(url.pathname, /\/organizations\/[^/]+\/members$/);
      assert.equal(url.searchParams.get("snapshotId"), "snapshot-1");
      assert.equal(url.searchParams.get("startDate"), "2026-09-01");
      assert.equal(url.searchParams.get("limit"), "100");
    }
    assert.deepEqual(urls.slice(1).map((url) => url.searchParams.get("cursor")), ["c1", "c2"]);
    assert.notDeepEqual(membersOptions(ORG, period).queryKey, membersOptions(ORG, { ...period, endDate: "2026-09-27" }).queryKey);
    assert.notDeepEqual(membersOptions(ORG, period).queryKey, membersOptions("another-org", period).queryKey);
  } finally { global.fetch = original; }
});

test("an expired snapshot restarts once from the first page; mixed snapshots and wrong totals are rejected", async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async (input) => {
    calls++;
    if (calls === 2) return Response.json({ error: { code: "snapshot_expired", message: "expired" } }, { status: 409 });
    if (new URL(String(input)).pathname.endsWith("/members/dashboard")) return Response.json(dashboard([member(1)], calls === 1 ? 2 : 1, calls === 1 ? "c1" : null));
    throw new Error("unexpected request");
  };
  try {
    const view = await fetchMembersView(ORG, period);
    assert.equal(calls, 3);
    assert.equal(view.members.length, 1);

    const invalid = (error: unknown) => error instanceof ManagementError && error.code === "invalid_response";
    global.fetch = async (input) => new URL(String(input)).pathname.endsWith("/members/dashboard") ? Response.json(dashboard([member(1)], 2, "c1"))
      : Response.json({ meta: meta("snapshot-2"), members: { items: [member(2)], totalCount: 2, nextCursor: null } });
    await assert.rejects(fetchMembersView(ORG, period), invalid);
    global.fetch = async () => Response.json(dashboard([member(1)], 2, null));
    await assert.rejects(fetchMembersView(ORG, period), invalid, "totalCount보다 적게 받은 명단을 전체로 취급하지 않는다");
    global.fetch = async () => Response.json({ ...dashboard([member(1)], 1, null), meta: { ...meta(), organizationId: "another-org" } });
    await assert.rejects(fetchMembersView(ORG, period), invalid);
    global.fetch = async () => Response.json({ ...dashboard([member(1)], 1, null), meta: { ...meta(), endDate: "2026-09-27" } });
    await assert.rejects(fetchMembersView(ORG, period), invalid);
    global.fetch = async () => Response.json({ error: { code: "forbidden" } }, { status: 403 });
    await assert.rejects(fetchMembersView(ORG, period), (error) => error instanceof ManagementError && error.status === 403);
  } finally { global.fetch = original; }
});

test("waiting invitations keep the status and member filters on every page", async () => {
  const original = global.fetch, urls: URL[] = [];
  const invitation = (id: string, status: string) => ({ invitationId: id, email: `${id}@example.test`, role: "member", createdAt: "2026-09-20T00:00:00Z", expiresAt: "2026-09-23T00:00:00Z",
    installationUsedAt: null, signupUsedAt: null, revokedAt: null, status, memberId: `member-${id}`, memberStatus: "invited", team: null, memberVersion: 1, delivery: notSent });
  global.fetch = async (input) => {
    const url = new URL(String(input)); urls.push(url);
    const status = url.searchParams.get("status")!;
    if (status === "pending") return Response.json(url.searchParams.get("cursor") ? { items: [invitation("b", status)], nextCursor: null } : { items: [invitation("a", status)], nextCursor: "a" });
    return Response.json({ items: [invitation("c", status)], nextCursor: null });
  };
  try {
    const items = await fetchWaitingInvitations(ORG);
    assert.deepEqual(items.map((item) => [item.invitationId, item.status]), [["a", "pending"], ["b", "pending"], ["c", "expired"]]);
    assert.deepEqual(urls.map((url) => [url.searchParams.get("status"), url.searchParams.get("memberStatus"), url.searchParams.get("cursor")]),
      [["pending", "invited", null], ["pending", "invited", "a"], ["expired", "invited", null]]);
    assert.ok(urls.every((url) => url.port === "8080" && url.pathname.endsWith("/invitations")));
  } finally { global.fetch = original; }
});

test("view keeps unknown values unknown and never invents reclaim candidates", () => {
  const roster = [
    member(1, { periodUsage: usage("12.5", 3) }),
    member(2, { periodUsage: null, lastUsedAt: "2026-08-20T00:00:00Z" }),
    member(3, { periodUsage: null, lastUsedAt: null, team: { teamId: null, teamName: "미배정" } }),
    member(4, { periodUsage: usage(null, null), role: "admin" }),
  ];
  const view = { ...dashboard(roster, 4, null, [roster[2]]), members: roster, unassigned: [roster[2]] };
  const now = Date.parse("2026-09-21T00:00:00Z");
  const model = buildMembersView(view, [
    { invitationId: "i1", email: "new@example.test", role: "member", createdAt: "2026-09-20T00:00:00Z", expiresAt: "2026-09-23T00:00:00Z", installationUsedAt: null, signupUsedAt: null, revokedAt: null,
      status: "pending", memberId: "m-new", memberStatus: "invited", team: { teamId: "team-a", teamName: "플랫폼" }, memberVersion: 7,
      delivery: { status: "sent", reason: null, queuedAt: "2026-09-20T00:00:00Z", lastAttemptAt: "2026-09-20T00:00:05Z", sentAt: "2026-09-20T00:00:05Z", failureCode: null, attempts: 1 } },
    { invitationId: "i2", email: "late@example.test", role: "admin", createdAt: "2026-09-01T00:00:00Z", expiresAt: "2026-09-04T00:00:00Z", installationUsedAt: null, signupUsedAt: null, revokedAt: null,
      status: "expired", memberId: "m-late", memberStatus: "invited", team: null, memberVersion: 8, delivery: notSent },
  ], now);

  assert.deepEqual(model.memberRows.map((row) => row.activity), ["active", "idle", "unobserved", "active"]);
  assert.deepEqual(model.memberRows.map((row) => row.costText), ["$12.50", "-", "-", "-"]);
  assert.deepEqual(model.memberRows.map((row) => row.costValue), [12.5, null, null, null]);
  assert.equal(model.memberRows[2].lastSeen, "-");
  assert.equal(model.memberRows[0].lastSeen, "2026.09.27 10:00");
  assert.equal(model.memberRows[3].roleLabel, "관리자");
  assert.equal(model.memberRows[0].seatStateLabel, "확인 불가");

  const cards = Object.fromEntries(model.memberCards.map((card) => [card.label, card]));
  assert.equal(cards["구성원"].value, "4");
  assert.match(cards["구성원"].caption, /기간 활성 -명/);
  assert.equal(cards["좌석 회수 후보"].value, "-", "좌석 원장이 없으면 0석이 아니다");
  assert.match(cards["좌석 회수 후보"].caption, /연결되지 않았습니다/);
  assert.equal(cards["초대 대기"].value, "1");
  assert.match(cards["초대 대기"].caption, /만료 1명/);
  assert.equal(cards["팀 미배정"].value, "1");
  assert.match(cards["팀 미배정"].caption, /기간 미배분 비용 -$/);
  assert.equal(model.reclaim.available, false);

  assert.deepEqual(model.inviteRows!.map((row) => [row.email, row.teamLabel, row.roleLabel, row.expiryText, row.issuedText]),
    [["new@example.test", "플랫폼", "구성원", "2일 남음", "2026.09.20 발급"], ["late@example.test", "팀 미배정", "관리자", "만료됨", "2026.09.01 발급"]]);
  // 대기자 편집은 초대 목록이 준 구성원 ID·팀·역할·version을 그대로 쓴다. 이메일로 짝짓지 않는다.
  assert.deepEqual(model.inviteRows!.map((row) => [row.memberId, row.teamId, row.role, row.memberVersion]), [["m-new", "team-a", "member", 7], ["m-late", null, "admin", 8]]);
  assert.deepEqual(model.unassignedRows.map((row) => [row.memberId, row.costText]), [["member-3", "-"]]);

  // 초대 조회가 실패했으면 0명이 아니라 확인 불가다.
  const withoutInvites = buildMembersView(view, undefined, now);
  assert.equal(withoutInvites.memberCards.find((card) => card.label === "초대 대기")!.value, "-");
  assert.equal(withoutInvites.inviteRows, undefined);
  // 발송 상태는 서버가 준 값을 그대로 옮긴다.
  assert.deepEqual(model.inviteRows!.map((row) => [row.delivery.state, row.delivery.label, row.delivery.detail]),
    [["sent", "메일 발송됨", "2026.09.20 09:00"], ["disabled", "메일 발송 꺼짐", "코드를 직접 전달하세요"]]);
});

test("reclaim candidates and seat totals come only from the server section", () => {
  const roster = [member(1, { periodUsage: null, lastUsedAt: null }), member(2)];
  const candidate = { seatAssignmentId: "seat-1", memberId: "member-2", account: "member2@example.test", team: { teamId: "team-a", teamName: "플랫폼" }, vendorId: "v", tierId: "t",
    version: 1, lastUsedAt: "2026-09-01T00:00:00Z", idleDays: 27, estimatedMonthlySavingsUsd: null, canReclaim: false, reason: null };
  const base = dashboard(roster, 2, null);
  const view = { ...base, members: roster, unassigned: [],
    summary: { ...base.summary, activeUsers: 1, periodUnassignedEquivalentCostUsd: "5", periodTotalEquivalentCostUsd: "20",
      seats: { availability: "available" as const, reason: null, data: { contracted: 10, assigned: 8, unallocated: 2, activeInPeriod: null, inactiveAssigned: null, reclaimCandidates: 1, estimatedMonthlySavingsUsd: null } } },
    reclaimCandidates: { availability: "available" as const, reason: null, data: { items: [candidate], totalCount: 1, nextCursor: null } } };
  const model = buildMembersView(view, []);
  // 사용 기록이 없는 member-1 은 후보가 아니고, 서버가 후보로 준 member-2 만 후보다.
  assert.deepEqual(model.memberRows.map((row) => row.activity), ["unobserved", "candidate"]);
  assert.equal(memberActivity(roster[1], new Set()), "active");
  const cards = Object.fromEntries(model.memberCards.map((card) => [card.label, card]));
  assert.equal(cards["좌석 회수 후보"].value, "1");
  assert.match(cards["좌석 회수 후보"].caption, /14일/);
  assert.match(cards["팀 미배정"].caption, /\$5\.00 \(25\.0%\)/);
  assert.equal(model.reclaim.available && model.reclaim.rows[0].seatAssignmentId, "seat-1");
  assert.equal(model.unassignedNote, "모두 배정됨");
});

test("CSV exports the whole roster, leaves unknown values empty and neutralizes formulas", () => {
  const roster = [
    member(1, { account: "=cmd@example.test", displayName: '이름, "별명"', periodUsage: usage("12.5", 3) }),
    member(2, { periodUsage: null, lastUsedAt: null, team: { teamId: null, teamName: "미배정" }, role: "admin" }),
  ];
  const model = buildMembersView({ ...dashboard(roster, 2, null), members: roster, unassigned: [] }, []);
  const lines = membersCsv(model.memberRows).split("\r\n");
  assert.equal(lines[0], "계정,이름,팀,역할,계정 상태,사용 관측,기간 환산 비용(USD),기간 세션,마지막 사용(UTC)");
  assert.equal(lines[1], `'=cmd@example.test,"이름, ""별명""",플랫폼,구성원,활성 계정,활성,12.5,3,2026-09-27T01:00:00Z`);
  assert.equal(lines[2], "member2@example.test,구성원 2,미배정,관리자,활성 계정,신호 대기,,,");
  assert.equal(lines.length, 4);
  assert.equal(lines[3], "");
});
