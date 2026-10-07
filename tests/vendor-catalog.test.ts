import assert from "node:assert/strict";
import test from "node:test";
import { VENDOR_CATALOG, getVendorPlans } from "../src/lib/vendor-catalog";
import { createManualContract } from "../src/lib/contracts";
import { buildVendorRows } from "../src/lib/settings";

const tiers = [{ label: "표준", seats: "3", fee: "20" }];

test("only organization seat plans can be registered, including Anthropic", () => {
  assert.ok(VENDOR_CATALOG.some((product) => product.kind === "claude_team"));
  for (const product of VENDOR_CATALOG) {
    for (const plan of product.plans) {
      assert.equal(plan.bill, "seat");
      assert.doesNotMatch(plan.v, /^(api|metered|pro|max|free)$/);
      const record = createManualContract({ kind: product.kind, name: "계약", plan: plan.v, tiers }, product.kind);
      assert.equal(record.family, product.family);
      assert.equal(record.kind, product.kind);
    }
    for (const plan of ["api", "metered", "pro", "max"]) {
      assert.throws(() => createManualContract({ kind: product.kind, name: "계약", plan, tiers }, "invalid"));
    }
  }
  assert.deepEqual(getVendorPlans("azure_openai"), []);
  assert.throws(() => createManualContract({ kind: "copilot", plan: "gemini_standard", tiers }, "invalid"));
});

test("renamed contracts retain product plans and multiple Claude seat types", () => {
  const record = createManualContract({ kind: "claude_team", plan: "team", name: "연구실", tiers: [...tiers, { label: "프리미엄", seats: "2", fee: "100" }] }, "manual-claude");
  assert.equal(record.family, "anthropic");
  assert.deepEqual(record.c.tiers?.map((tier) => tier.label), ["표준", "프리미엄"]);
  const row = buildVendorRows({}, [record]).find((item) => item.id === record.id)!;
  assert.equal(row.planDef?.label, "Team");
  assert.equal(row.kind, "claude_team");
  assert.throws(() => createManualContract({ kind: "copilot", plan: "copilot_business", tiers: [...tiers, ...tiers] }, "invalid"));
});

test("custom organization contracts preserve plan name separately from billing", () => {
  const record = createManualContract({ kind: "other", name: "조직 도구", planName: "맞춤 계약", plan: "seat_usage", tiers }, "custom");
  const row = buildVendorRows({}, [record]).find((item) => item.id === record.id)!;
  assert.equal(record.plan, "seat_usage");
  assert.equal(row.planDef?.label, "맞춤 계약");
  assert.equal(row.billing, "seat");
});
