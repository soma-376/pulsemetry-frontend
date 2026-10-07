import { test } from "node:test";
import assert from "node:assert/strict";
import { serverVendorSchema } from "../src/lib/schemas/server-contract";
const vendor = {
  id: "server_only",
  provider: "new",
  displayName: "새 제품",
  product: "IDE",
  allowsSeatTiers: true,
};
const plans = [
  {
    id: "enterprise",
    displayName: "Enterprise",
    billing: "seat" as const,
    separateUsageBilling: true,
  },
];
const schema = serverVendorSchema(vendor, plans, "2026-09-28");
const draft = {
  kind: vendor.id,
  plan: "enterprise",
  tiers: [{ label: "표준", seats: "2", fee: "0.123456789012" }],
  term: "",
};
test("server catalog can add an unknown product without a contract", () => {
  assert.deepEqual(schema.parse({ kind: vendor.id, plan: null }), {
    kind: vendor.id,
    displayName: vendor.displayName,
  });
  assert.equal(schema.safeParse({ kind: "copilot" }).success, false);
});
test("contract preserves decimal strings, defaults start to org today and empty end to null", () => {
  const body = schema.parse(draft);
  assert.equal(body.contract?.tiers[0].monthlyFeePerSeatUsd, "0.123456789012");
  assert.equal(body.contract?.effectiveFrom, "2026-09-28");
  assert.equal(body.contract?.effectiveTo, null);
  assert.equal(
    schema.safeParse({ ...draft, term: "2026-09-27" }).success,
    false,
  );
  assert.equal(
    schema.safeParse({ ...draft, term: "2026-09-28" }).success,
    true,
  );
  assert.equal(
    schema.safeParse({ ...draft, term: "2026-02-30" }).success,
    false,
  );
});
test("plan must belong to selected vendor and partial contract cannot be silently dropped", () => {
  assert.equal(
    schema.safeParse({ ...draft, plan: "copilot_business" }).success,
    false,
  );
  assert.equal(schema.safeParse({ ...draft, plan: null }).success, false);
});
test("seat limits and decimal precision follow server and exact monthly maximum", () => {
  assert.equal(
    serverVendorSchema({ ...vendor, allowsSeatTiers: false }, plans).safeParse({
      ...draft,
      tiers: [...draft.tiers, ...draft.tiers],
    }).success,
    false,
  );
  for (const tier of [
    { seats: "0", fee: "1" },
    { seats: "1.1", fee: "1" },
    { seats: "1", fee: "-1" },
    { seats: "1", fee: "0.1234567890123" },
    { seats: "9007199254740991", fee: "1.000000000001" },
  ]) {
    assert.equal(
      schema.safeParse({ ...draft, tiers: [{ label: "표준", ...tier }] })
        .success,
      false,
    );
  }
  assert.equal(
    schema.safeParse({
      ...draft,
      tiers: [{ label: "표준", seats: "9007199254740991", fee: "1" }],
    }).success,
    true,
  );
  assert.equal(
    schema.safeParse({
      ...draft,
      tiers: [{ label: "표준", seats: "1", fee: "0" }],
    }).success,
    true,
  );
});

test("correction keeps the original start and allows an unchanged expired end", () => {
  const existing = { effectiveFrom: "2026-01-01", effectiveTo: "2026-08-31" };
  const correction = serverVendorSchema(vendor, plans, "2026-09-28", existing);
  assert.equal(
    correction.parse({ ...draft, term: existing.effectiveTo }).contract
      ?.effectiveFrom,
    "2026-01-01",
  );
  assert.equal(
    correction.safeParse({ ...draft, term: "2026-09-27" }).success,
    false,
  );
  assert.equal(
    correction.safeParse({ ...draft, term: "2025-12-31" }).success,
    false,
  );
  assert.equal(correction.parse(draft).contract?.effectiveTo, null);
  assert.equal(
    correction.parse({ ...draft, term: "2026-09-28" }).contract?.effectiveFrom,
    "2026-01-01",
  );
});
