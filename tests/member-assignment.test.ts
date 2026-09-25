import assert from "node:assert/strict";
import test from "node:test";
import { saveMemberAssignment } from "../src/lib/member-assignment";
import { buildMembers } from "../src/lib/metrics/members";
import { INITIAL_ORGANIZATION, saveTeam } from "../src/lib/organization";

test("member edits preserve usage and seat counts and can explicitly clear a seeded team", () => {
  const state = structuredClone(INITIAL_ORGANIZATION);
  const before = buildMembers(undefined, state.members, state.teams);
  const target = before.memberRows.find((row) => row.teamId === "team-1")!;
  const saved = saveMemberAssignment(state, target, { team: "team-2", role: "lead" });
  const after = buildMembers(undefined, saved.members, saved.teams);
  const member = after.memberRows.find((row) => row.account === target.account)!;
  assert.equal(member.teamId, "team-2");
  assert.equal(member.role, "lead");
  assert.equal(member.roleLabel, "팀 리드");
  assert.equal(member.costText, target.costText);
  assert.equal(after.activeUsers, before.activeUsers);
  assert.deepEqual(after.reclaimRows, before.reclaimRows);
  assert.deepEqual(state.members.assigned, {});
  const renamed = saveTeam(saved, { name: "Research" }, "team-2", true);
  assert.equal(buildMembers(undefined, renamed.members, renamed.teams).memberRows.find((row) => row.account === target.account)!.team, "Research");
  const cleared = saveMemberAssignment(saved, target, { team: "", role: "viewer" });
  const clearedModel = buildMembers(undefined, cleared.members, cleared.teams);
  assert.equal(clearedModel.memberRows.find((row) => row.account === target.account)!.teamId, "");
  assert.ok(clearedModel.unassignedRows.some((row) => row.account === target.account));
});

test("pending edits update both lists, preserve expiration, and do not create measured membership", () => {
  const state = structuredClone(INITIAL_ORGANIZATION);
  state.members.invites = [{ email: "Pending@example.com", team: "team-1", role: "member", invitedAt: "2026-09-05" }];
  const before = buildMembers(undefined, state.members, state.teams);
  const target = { account: "pending@example.com", invited: true };
  const saved = saveMemberAssignment(state, target, { team: "team-2", role: "admin" });
  assert.deepEqual(saved.members.assigned, {});
  assert.equal(saved.members.roles, undefined);
  assert.equal(saved.members.invites[0].invitedAt, "2026-09-05");
  const after = buildMembers(undefined, saved.members, saved.teams);
  assert.equal(after.inviteRows[0].roleLabel, "관리자");
  assert.equal(after.inviteRows[0].teamLabel, "데이터");
  assert.equal(after.memberRows.find((row) => row.invited)!.role, "admin");
  assert.equal(after.activeUsers, before.activeUsers);
  assert.equal(after.inviteRows[0].expired, before.inviteRows[0].expired);
});

test("invalid teams, invalid roles and stale targets cannot create assignments", () => {
  const state = structuredClone(INITIAL_ORGANIZATION);
  const target = buildMembers().memberRows[0];
  assert.throws(() => saveMemberAssignment(state, target, { team: "missing", role: "member" }), /팀을 찾을 수 없습니다/);
  assert.throws(() => saveMemberAssignment(state, target, { team: "", role: "owner" }));
  for (const invited of [true, false]) assert.throws(() => saveMemberAssignment(state, { account: "missing@example.com", invited }, { team: "", role: "member" }), /찾을 수 없습니다/);
});

test("dashboard roles are independent of vendor seat review status", () => {
  const state = structuredClone(INITIAL_ORGANIZATION);
  const before = buildMembers();
  const target = before.memberRows.find((row) => row.vendorSeats.some((seat) => seat.review === "candidate"))!;
  const saved = saveMemberAssignment(state, target, { team: "team-2", role: "admin" });
  const row = buildMembers(undefined, saved.members, saved.teams).memberRows.find((member) => member.account === target.account)!;
  assert.equal(row.role, "admin");
  assert.deepEqual(row.vendorSeats, target.vendorSeats);
  assert.equal(row.teamId, "team-2");
});
