import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_ORGANIZATION, saveTeam, removeOnboardingTeam, completeOnboarding } from "../src/lib/organization";
import { buildMembers } from "../src/lib/metrics/members";
import { buildTeams } from "../src/lib/metrics/teams";
import { createManualContract } from "../src/lib/contracts";
import { resolveDemoAdmin } from "../src/lib/auth";

test("removing an onboarding team clears its assignment in both sent and draft invitations", () => {
  const state = structuredClone(INITIAL_ORGANIZATION);
  state.members.invites = [{ email: "minsu@codeworks.io", team: "team-1", role: "member", invitedAt: "2026-09-13" }];
  state.onboardingDraft.invite = { draft: "next@codeworks.io", team: "team-1", role: "member", invitees: [{ email: "jisu@codeworks.io", team: "team-1", role: null }] };
  const removed = removeOnboardingTeam(state, "team-1");
  assert.equal(removed.teams.some((team) => team.id === "team-1"), false);
  assert.equal(removed.members.invites[0].email, "minsu@codeworks.io");
  assert.equal(removed.members.invites[0].team, "");
  assert.equal(removed.onboardingDraft.invite.team, "");
  assert.equal(removed.onboardingDraft.invite.invitees[0].team, "");
  assert.equal(removed.onboardingDraft.invite.draft, "next@codeworks.io");
  assert.equal(removeOnboardingTeam({ ...state, onboardingCompleted: true }, "team-1").teams.length, state.teams.length);
});

test("onboarding requires an explicit policy, a saved contract and login, but not a team or developer", () => {
  const contract = createManualContract({ kind: "copilot", plan: "copilot_business", tiers: [{ label: "표준", seats: "2", fee: "0" }] }, "contract-1");
  const state = { ...INITIAL_ORGANIZATION, teams: [], session: resolveDemoAdmin("admin@codeworks.io"), addedVendors: [contract] };
  assert.equal(completeOnboarding(state).onboardingCompleted, false);
  assert.equal(completeOnboarding({ ...state, promptRaw: false }).onboardingCompleted, true);
  assert.equal(completeOnboarding({ ...state, promptRaw: true }).onboardingCompleted, true);
  assert.equal(completeOnboarding({ ...state, promptRaw: false, addedVendors: [] }).onboardingCompleted, false);
  assert.equal(completeOnboarding({ ...state, promptRaw: false, session: null }).onboardingCompleted, false);
});

test("contract creation preserves precise and zero fees and rejects malformed seats", () => {
  const draft = { kind: "copilot", plan: "copilot_business", tiers: [{ label: "표준", seats: "2", fee: "12.345" }] };
  assert.equal(createManualContract(draft, "id").c.tiers?.[0].fee, 12.345);
  for (const seats of ["", "-1", "1.5", "1e5"]) assert.throws(() => createManualContract({ ...draft, tiers: [{ ...draft.tiers[0], seats }] }, "id"));
  assert.throws(() => createManualContract({ ...draft, kind: "other", name: " " }, "id"));
  assert.throws(() => createManualContract({ ...draft, plan: "metered" }, "id"));
});

test("creating and renaming a team preserves its ID and pending invitations", () => {
  const created = saveTeam(INITIAL_ORGANIZATION, { name: "  Research  " }, "team-new", false);
  const members = { ...created.members, invites: [{ email: "a@example.com", team: "team-new", role: "member", invitedAt: "2026-09-17" }] };
  const renamed = saveTeam({ ...created, members }, { name: "연구팀" }, "team-new", true);
  assert.equal(renamed.teams.at(-1)?.id, "team-new");
  assert.equal(renamed.members.invites[0].team, "team-new");
  assert.equal(buildMembers(undefined, renamed.members, renamed.teams).inviteRows[0].teamLabel, "연구팀");
  assert.equal(INITIAL_ORGANIZATION.teams.length, 5);
});

test("renaming a seeded team changes display names without changing recorded usage or roster", () => {
  const before = buildMembers(undefined, INITIAL_ORGANIZATION.members, INITIAL_ORGANIZATION.teams);
  const renamed = saveTeam(INITIAL_ORGANIZATION, { name: "인프라" }, "team-1", true);
  const after = buildMembers(undefined, renamed.members, renamed.teams);
  assert.deepEqual(after.memberRows.map((row) => [row.account, row.costText]), before.memberRows.map((row) => [row.account, row.costText]));
  assert.equal(after.memberRows.filter((row) => row.team === "인프라").length, before.memberRows.filter((row) => row.team === "플랫폼").length);
});

test("team names cannot be empty, reserved, duplicate, or overwrite a missing team", () => {
  for (const name of [" ", "미배정", "팀 미배정", "플랫폼", "x".repeat(41)]) assert.throws(() => saveTeam(INITIAL_ORGANIZATION, { name }, "new", false));
  const created = saveTeam(INITIAL_ORGANIZATION, { name: "Research" }, "new", false);
  assert.throws(() => saveTeam(created, { name: "research" }, "other", false));
  assert.throws(() => saveTeam(created, { name: "Valid" }, "missing", true));
  assert.throws(() => saveTeam(created, { name: "Valid" }, "new", false));
});

test("reusing a team's former name does not select the wrong analytics roster", () => {
  const before = buildTeams().users("데이터").rows.map((row) => row.account);
  const renamed = saveTeam(INITIAL_ORGANIZATION, { name: "인프라" }, "team-1", true);
  const reused = saveTeam(renamed, { name: "플랫폼" }, "team-2", true);
  assert.deepEqual(buildTeams(undefined, undefined, reused.teams).users("플랫폼").rows.map((row) => row.account), before);
});
