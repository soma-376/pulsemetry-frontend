import { test } from "node:test";
import assert from "node:assert/strict";
import { issueInvitations, reissueInvitation, revokeInvitation, type InvitationResult } from "../src/lib/api/invitations";
import { createCommands, ManagementError } from "../src/lib/api/management";
import { ASSIGNMENT_LIMIT, assignTeams, createTeam, deleteTeam, memberChange, renameTeam, saveMember, teamAssignments } from "../src/lib/api/member-commands";
import { inviteResults } from "../src/lib/members-view";

const ORG = "11111111-1111-4111-8111-111111111111";
const base = `http://localhost:8080/api/v1/organizations/${ORG}`;
type Call = { url: string; method: string; headers: Headers; body: unknown };

/** 요청을 기록하고 준비한 응답을 차례로 돌려준다. */
function record(responses: (() => Response)[]) {
  const calls: Call[] = [], original = global.fetch;
  global.fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? "GET", headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return responses[Math.min(calls.length, responses.length) - 1]();
  };
  return { calls, restore: () => { global.fetch = original; } };
}
const failure = (status: number, code: string, field?: string) => () =>
  Response.json({ error: { code, message: "관리 요청을 처리할 수 없습니다.", fieldErrors: field ? [{ field, code }] : [] }, requestId: "r" }, { status });

test("a member edit sends only the fields that changed, with the version the form was opened with", () => {
  const baseline = { memberId: "m1", teamId: "team-a", role: "admin", version: 1700 };
  assert.equal(memberChange(baseline, { teamId: "team-a", role: "admin" }), null);
  assert.deepEqual(memberChange(baseline, { teamId: "team-b", role: "admin" }), { expectedVersion: 1700, teamId: "team-b" });
  assert.deepEqual(memberChange(baseline, { teamId: "team-a", role: "member" }), { expectedVersion: 1700, role: "member" });
  assert.deepEqual(memberChange(baseline, { teamId: null, role: "member" }), { expectedVersion: 1700, teamId: null, role: "member" });
  // 미배정에서 미배정으로는 팀 변경이 아니다.
  assert.equal(memberChange({ ...baseline, teamId: null }, { teamId: null, role: "admin" }), null);
});

test("member PATCH goes to the enrollment API and keeps teamId:null as an explicit unassignment", async () => {
  const saved = { memberId: "m1", team: null, role: "owner", status: "active", version: 1701 };
  const { calls, restore } = record([() => Response.json(saved)]);
  try {
    assert.deepEqual(await saveMember(ORG, "m1", { expectedVersion: 1700, teamId: null }), saved);
    assert.equal(calls[0].url, `${base}/members/m1`);
    assert.equal(calls[0].method, "PATCH");
    assert.deepEqual(calls[0].body, { expectedVersion: 1700, teamId: null });
    assert.equal("role" in (calls[0].body as object), false, "바꾸지 않은 역할은 보내지 않는다");
  } finally { restore(); }
});

test("conflicts and role rules surface as coded errors with a message the form can show", async () => {
  const { restore } = record([failure(409, "version_conflict"), failure(422, "owner_role_immutable", "role"), failure(422, "self_role_change", "role"), failure(409, "member_suspended")]);
  try {
    const attempt = () => saveMember(ORG, "m1", { expectedVersion: 1, role: "member" });
    await assert.rejects(attempt, (error: ManagementError) => error.code === "version_conflict" && error.status === 409 && /최신 내용을 확인/.test(error.message));
    await assert.rejects(attempt, (error: ManagementError) => error.code === "owner_role_immutable" && error.status === 422 && /소유자의 역할은 바꿀 수 없습니다/.test(error.message) && /역할/.test(error.message));
    await assert.rejects(attempt, (error: ManagementError) => error.code === "self_role_change" && /자기 역할은 바꿀 수 없습니다/.test(error.message));
    await assert.rejects(attempt, (error: ManagementError) => error.code === "member_suspended" && /정지된 구성원/.test(error.message));
  } finally { restore(); }
});

test("team assignment carries each member's own version and stops at the server limit", async () => {
  const rows = Array.from({ length: ASSIGNMENT_LIMIT + 5 }, (_, index) => ({ memberId: `m${index}`, version: 5000 + index }));
  const picks = Object.fromEntries(rows.map((row) => [row.memberId, "team-a"]));
  assert.deepEqual(teamAssignments(rows.slice(0, 3), { m0: "team-a", m1: "", m2: "team-b", gone: "team-a" }),
    [{ memberId: "m0", teamId: "team-a", expectedVersion: 5000 }, { memberId: "m2", teamId: "team-b", expectedVersion: 5002 }]);
  assert.equal(teamAssignments(rows, picks).length, 100);

  const { calls, restore } = record([failure(409, "version_conflict"), () => Response.json({ effectiveAt: "2026-09-30T00:00:00Z", members: [{ memberId: "m0", teamId: "team-a", version: 5100 }] })]);
  try {
    const post = createCommands(), assignments = teamAssignments(rows.slice(0, 1), picks);
    await assert.rejects(() => assignTeams(post, ORG, assignments), (error: ManagementError) => error.code === "version_conflict");
    const result = await assignTeams(post, ORG, assignments);
    assert.deepEqual(result.members, [{ memberId: "m0", teamId: "team-a", version: 5100 }]);
    assert.equal(calls[0].url, `${base}/member-team-assignments`);
    assert.equal(calls[0].method, "POST");
    assert.deepEqual(calls[0].body, { assignments: [{ memberId: "m0", teamId: "team-a", expectedVersion: 5000 }] });
    // 실패한 같은 요청의 재시도는 같은 멱등 키를 쓴다.
    assert.match(calls[0].headers.get("Idempotency-Key")!, /^[A-Za-z0-9_-]{8,128}$/);
    assert.equal(calls[1].headers.get("Idempotency-Key"), calls[0].headers.get("Idempotency-Key"));
  } finally { restore(); }
});

test("team commands use POST with a key, PATCH with expectedVersion and DELETE with If-Match", async () => {
  const team = { teamId: "team-a", teamName: "플랫폼", version: 7 };
  const { calls, restore } = record([() => Response.json({ ...team, teamId: "team-new", teamName: "연구" }, { status: 201 }), () => Response.json({ ...team, teamName: "인프라", version: 8 }),
    () => new Response(null, { status: 204 }), failure(409, "team_name_conflict", "teamName")]);
  try {
    assert.equal((await createTeam(createCommands(), ORG, "연구")).teamId, "team-new");
    assert.equal((await renameTeam(ORG, team, "인프라")).version, 8);
    assert.equal(await deleteTeam(ORG, team), undefined);
    await assert.rejects(() => renameTeam(ORG, team, "데이터"), (error: ManagementError) => error.code === "team_name_conflict" && /같은 이름의 팀/.test(error.message));
    assert.deepEqual(calls.map((call) => [call.method, call.url.replace(base, "")]), [["POST", "/teams"], ["PATCH", "/teams/team-a"], ["DELETE", "/teams/team-a"], ["PATCH", "/teams/team-a"]]);
    assert.deepEqual(calls[0].body, { teamName: "연구" });
    assert.ok(calls[0].headers.get("Idempotency-Key"));
    assert.deepEqual(calls[1].body, { teamName: "인프라", expectedVersion: 7 });
    assert.equal(calls[2].headers.get("If-Match"), '"team-7"');
    assert.equal(calls[2].body, undefined);
  } finally { restore(); }
});

test("invitation commands issue, reissue and revoke by invitation id", async () => {
  const issued: InvitationResult[] = [{ email: "new@example.test", invitationId: "i1", status: "issued", reason: null, expiresAt: "2026-10-03T00:00:00Z", code: "FAKE-CODE-0001" }];
  const reissued = { invitationId: "i2", replacesInvitationId: "i1", code: "FAKE-CODE-0002", expiresAt: "2026-10-03T01:00:00Z" };
  const { calls, restore } = record([() => Response.json({ results: issued }), () => Response.json(reissued), () => new Response(null, { status: 204 }), failure(409, "invitation_unavailable")]);
  try {
    const post = createCommands();
    assert.deepEqual(await issueInvitations(post, ORG, [{ email: "new@example.test", teamId: null, role: "member" }]), issued);
    assert.deepEqual(await reissueInvitation(post, ORG, "i1"), reissued);
    assert.equal(await revokeInvitation(post, ORG, "i2"), undefined);
    await assert.rejects(() => reissueInvitation(post, ORG, "i2"), (error: ManagementError) => error.code === "invitation_unavailable" && error.status === 409 && /이미 사용했거나 취소된 초대/.test(error.message));
    assert.deepEqual(calls.map((call) => [call.method, call.url.replace(base, "")]),
      [["POST", "/invitations/batch"], ["POST", "/invitations/i1/reissue"], ["POST", "/invitations/i2/revoke"], ["POST", "/invitations/i2/reissue"]]);
    assert.deepEqual(calls[0].body, { invitations: [{ email: "new@example.test", teamId: null, role: "member" }] });
    assert.deepEqual(calls[1].body, {});
    assert.ok(calls.every((call) => call.headers.get("Idempotency-Key")));
    // 서로 다른 명령은 서로 다른 키를 쓴다.
    assert.equal(new Set(calls.map((call) => call.headers.get("Idempotency-Key"))).size, 4);
  } finally { restore(); }
});

test("issue results show a code only for issued invitations and never claim delivery", () => {
  const results: InvitationResult[] = [
    { email: "new@example.test", invitationId: "i1", status: "issued", reason: null, expiresAt: "2026-10-03T00:00:00Z", code: "FAKE-CODE-0001" },
    { email: "member@example.test", invitationId: null, status: "already_member", reason: null, expiresAt: null, code: null },
    { email: "waiting@example.test", invitationId: null, status: "already_invited", reason: null, expiresAt: null, code: null },
    { email: "gone@example.test", invitationId: null, status: "rejected", reason: "team_not_found", expiresAt: null, code: null },
    { email: "odd@example.test", invitationId: null, status: "rejected", reason: "something_new", expiresAt: null, code: null },
  ];
  const view = inviteResults(results);
  assert.equal(view.issued, 1);
  assert.equal(view.skipped, 4);
  assert.equal(view.summary, "초대 코드 1건을 발급했습니다 · 발급하지 않음 4건");
  assert.deepEqual(view.rows.map((row) => [row.email, row.issued, row.code]), [
    ["new@example.test", true, "FAKE-CODE-0001"], ["member@example.test", false, null], ["waiting@example.test", false, null],
    ["gone@example.test", false, null], ["odd@example.test", false, null],
  ]);
  // 만료는 서버가 준 시각을 서울 시간으로 보여 준다.
  assert.equal(view.rows[0].text, "코드 발급 · 2026.10.03 09:00 만료");
  assert.match(view.rows[1].text, /이미 구성원/);
  assert.match(view.rows[2].text, /이미 초대한 이메일.*재발급/);
  assert.match(view.rows[3].text, /팀을 찾을 수 없습니다/);
  assert.equal(view.rows[4].text, "발급하지 않았습니다");
  for (const text of [view.summary, ...view.rows.map((row) => row.text)]) assert.doesNotMatch(text, /발송|보냈|보냅|전송/);

  const none = inviteResults(results.slice(1, 3));
  assert.equal(none.issued, 0);
  assert.equal(none.summary, "발급한 초대 코드가 없습니다 · 발급하지 않음 2건");
});
