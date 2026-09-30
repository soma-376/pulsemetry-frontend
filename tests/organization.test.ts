import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_ORGANIZATION, SEED_TEAMS, completeOnboarding } from "../src/lib/organization";
import { buildTeams } from "../src/lib/metrics/teams";
import { createManualContract } from "../src/lib/contracts";
import { resolveDemoAdmin } from "../src/lib/auth";

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

test("reusing a team's former name does not select the wrong analytics roster", () => {
  const before = buildTeams().users("데이터").rows.map((row) => row.account);
  // 표시 이름만 바뀐 팀 목록. ID와 기록의 원래 이름(sourceName)은 그대로다.
  const reused = SEED_TEAMS.map((team) => team.id === "team-1" ? { ...team, name: "인프라" } : team.id === "team-2" ? { ...team, name: "플랫폼" } : team);
  assert.deepEqual(buildTeams(undefined, undefined, reused).users("플랫폼").rows.map((row) => row.account), before);
});
