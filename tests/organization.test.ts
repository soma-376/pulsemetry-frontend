import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_ORGANIZATION, completeOnboarding } from "../src/lib/organization";
import { createManualContract } from "../src/lib/contracts";
import { resolveDemoAdmin } from "../src/lib/auth";

test("onboarding requires an explicit policy, a saved contract and login, but not a team or developer", () => {
  const contract = createManualContract({ kind: "copilot", plan: "copilot_business", tiers: [{ label: "표준", seats: "2", fee: "0" }] }, "contract-1");
  const state = { ...INITIAL_ORGANIZATION, session: resolveDemoAdmin("admin@codeworks.io"), addedVendors: [contract] };
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

