import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  contractSchema,
  fetchSettings,
  settingsSchema,
  type SettingsVendor,
} from "../src/lib/api/settings";
import { ManagementError } from "../src/lib/api/management";
import { clearBackendSession } from "../src/lib/api/session";
import { settingsCsv } from "../src/lib/csv-export";
import {
  settingsVendorDetailRow,
  settingsVendorDraft,
  settingsVendorRow,
} from "../src/lib/settings-vendors";
import {
  serverVendorSchema,
  validateServerTiers,
} from "../src/lib/schemas/server-contract";

// Independent Python int/Decimal oracles are saved in reports/e2e-20261016/
// evidence/contract-{large-seat-oracle,money-expected}.json. These constants
// are not derived from a product formatter, API response or Number arithmetic.
const MAX_TIER_SEATS = "9007199254740991";
const THREE_TIER_SEATS = "27021597764222973";
const THREE_TIER_SEATS_DISPLAY = "27,021,597,764,222,973";
const ORG = "contract-precision.example.test";
const originalFetch = globalThis.fetch;
const product = {
  id: "precision_product",
  provider: "precision",
  displayName: "Precision product",
  product: "IDE",
  allowsSeatTiers: true,
};
const plans = [
  {
    id: "precision_plan",
    displayName: "Precision plan",
    billing: "seat" as const,
    separateUsageBilling: false,
  },
];
const draftTiers = Array.from({ length: 3 }, (_, index) => ({
  label: `tier${index + 1}`,
  seats: MAX_TIER_SEATS,
  fee: "0",
}));
const complete = <T>(value: T) => ({
  value,
  status: "complete" as const,
  reasons: [],
});

function detail(tiers = draftTiers, monthlySeatFeeUsd = "0"): SettingsVendor {
  return {
    vendorId: "precision_vendor",
    displayName: product.displayName,
    kind: product.id,
    source: "manual",
    version: 1,
    state: "active",
    contractStatus: "active",
    contractInput: { status: "complete", missingFields: [] },
    contract: {
      version: 1,
      planId: plans[0].id,
      effectiveFrom: "2026-10-01",
      effectiveTo: null,
      termNote: null,
      tiers: tiers.map((tier, index) => ({
        tierId: `tier-${index}`,
        label: tier.label,
        seats: Number(tier.seats), // Individual input remains a safe wire number.
        monthlyFeePerSeatUsd: tier.fee,
      })),
      monthlySeatFeeUsd,
      confirmedAt: "2026-10-16T00:00:00Z",
      confirmedBy: "precision_owner",
    },
    observation: "unobserved",
    firstSeenAt: null,
    lastSeenAt: null,
    activeUsers7d: 0,
    activeUsers30d: 0,
  };
}

function wireSettings(seatsToken: string, monthly = "0") {
  // The server writes JSON integer tokens, not strings. Never round this token
  // through a JavaScript object before exercising the real response parser.
  return JSON.stringify({
    meta: { organizationId: ORG, snapshotId: "precision-snapshot" },
    capabilities: {
      editContracts: false,
      editCollectionPolicy: false,
      editAlertRules: false,
      notifyInstallations: false,
    },
    summary: {
      unconfiguredVendors: complete(0),
      monthlySeatFeeUsd: complete(monthly),
      contractedSeats: complete("__EXACT_SEAT_TOKEN__"),
      activeSeats7d: complete(0),
      assignedSeats: complete(0),
      meteredMonthToDate: complete("0"),
    },
    vendors: {
      totalCount: 1,
      nextCursor: null,
      items: [
        {
          vendorId: "precision_vendor",
          displayName: product.displayName,
          kind: product.id,
          source: "manual",
          version: 1,
          contractStatus: "active",
          contractInput: { status: "complete", missingFields: [] },
          contractSeats: complete("__EXACT_SEAT_TOKEN__"),
          monthlySeatFeeUsd: complete(monthly),
          assignedSeats: complete(0),
        },
      ],
    },
    collectionPolicy: {
      version: 1,
      collectRawContent: false,
      reclaimIdleDays: 14,
      aggregateRetentionMonths: null,
      settingsVersion: 1,
      reclaimIdleDaysSource: "organization",
      options: {
        reclaimIdleDays: [7, 14, 30, 60],
        aggregateRetentionMonths: [12, 24, 36, null],
      },
      cleanupOperationId: null,
    },
    policyRollout: {
      desiredVersion: 1,
      eligibleInstallations: 0,
      appliedInstallations: 0,
      outdatedInstallations: 0,
      unknownInstallations: 0,
    },
    alertRules: [],
  }).replaceAll('"__EXACT_SEAT_TOKEN__"', seatsToken);
}

async function readWire(raw: string) {
  globalThis.fetch = async (input) => {
    assert.equal(
      String(input),
      `/api/bff/dashboard/api/v1/organizations/${ORG}/settings`,
    );
    return new Response(raw, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return fetchSettings(ORG);
}

function normalizedDecimal(value: unknown) {
  const [whole, fraction = ""] = String(value).split(".");
  const rest = fraction.replace(/0+$/, "");
  return rest ? `${whole}.${rest}` : whole;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearBackendSession();
});

test("valid three-tier seat total stays exact beyond the individual safe-integer limit", () => {
  const result = validateServerTiers(draftTiers, true);
  assert.equal(result.totalError, undefined);
  assert.ok(result.tiers);
  assert.equal(String(result.seats), THREE_TIER_SEATS);
});

test("detail summary sums valid tier seats without losing the final seat", () => {
  const row = settingsVendorDetailRow(detail(), product);
  assert.equal(row.seatsText, `배정 - / ${THREE_TIER_SEATS_DISPLAY}석`);
  assert.equal(row.spendText, "$0.00 / 월");
});

test("raw JSON aggregate integer survives fetchSettings, row formatting and CSV exactly", async () => {
  const raw = wireSettings(THREE_TIER_SEATS);
  assert.ok(raw.includes(`"value":${THREE_TIER_SEATS}`));
  const data = await readWire(raw);
  assert.equal(String(data.summary.contractedSeats.value), THREE_TIER_SEATS);
  assert.equal(
    String(data.vendors.items[0].contractSeats.value),
    THREE_TIER_SEATS,
  );
  assert.equal(
    settingsVendorRow(data.vendors.items[0]).seatsText,
    `배정 0 / ${THREE_TIER_SEATS_DISPLAY}석`,
  );
  const csv = settingsCsv(
    data,
    "Precision organization",
    "2026-10-16T00:00:00Z",
  );
  assert.ok(
    csv.includes(`summary,contractedSeats,${THREE_TIER_SEATS},complete,`),
  );
  assert.ok(csv.includes(`,,${THREE_TIER_SEATS},complete,,0,complete,`));
  assert.equal(csv.includes("27021597764222972"), false);
});

for (const oracle of [
  { fee: "1000000000.004999999", display: "$1,000,000,000.00" },
  { fee: "1000000000000000.01", display: "$1,000,000,000,000,000.01" },
]) {
  test(`valid monthly arithmetic preserves exact decimal ${oracle.fee}`, () => {
    const result = validateServerTiers(
      [{ label: "standard", seats: "1", fee: oracle.fee }],
      true,
    );
    assert.equal(result.totalError, undefined);
    assert.ok(result.tiers);
    assert.equal(normalizedDecimal(result.spend), oracle.fee);
  });

  test(`detail display rounds decimal ${oracle.fee} only at the final USD boundary`, () => {
    const row = settingsVendorDetailRow(
      detail([{ label: "standard", seats: "1", fee: oracle.fee }], oracle.fee),
      product,
    );
    assert.equal(row.spendText, `${oracle.display} / 월`);
  });

  test(`settings row formats ${oracle.fee} precisely and CSV retains all source decimals`, async () => {
    const data = await readWire(wireSettings("1", oracle.fee));
    assert.equal(data.summary.monthlySeatFeeUsd.value, oracle.fee);
    assert.equal(
      settingsVendorRow(data.vendors.items[0]).spendText,
      `${oracle.display} / 월`,
    );
    const csv = settingsCsv(data, "Precision organization", "now");
    assert.ok(
      csv.includes(`summary,monthlySeatFeeUsd,${oracle.fee},complete,`),
    );
    assert.ok(csv.includes(`,,${oracle.fee},complete,,0,complete,`));
  });
}

test("ordinary counts and safe readonly tier inputs retain their existing wire contract", async () => {
  const tiers = [
    { label: "standard", seats: "3", fee: "12.50" },
    { label: "extra", seats: "2", fee: "0.125" },
  ];
  const result = validateServerTiers(tiers, true);
  assert.equal(String(result.seats), "5");
  assert.equal(normalizedDecimal(result.spend), "37.75");
  const data = await readWire(wireSettings("5", "37.75"));
  assert.equal(data.summary.contractedSeats.value, 5);
  assert.equal(data.capabilities.editContracts, false);
  assert.equal(
    settingsVendorRow(data.vendors.items[0]).spendText,
    "$37.75 / 월",
  );
  assert.deepEqual(settingsVendorDraft(detail(draftTiers)).tiers, draftTiers);
  const parsed = serverVendorSchema(product, plans, "2026-10-16").parse({
    kind: product.id,
    plan: plans[0].id,
    tiers: draftTiers,
    term: "",
  });
  assert.ok(parsed.contract);
  for (const tier of parsed.contract.tiers) {
    assert.equal(typeof tier.seats, "number");
    assert.equal(tier.seats, 9007199254740991);
  }
});

test("an exact aggregate does not expand the valid input limit of an individual tier", () => {
  for (const seats of [
    "9007199254740992",
    THREE_TIER_SEATS,
    "1.5",
    "-1",
    "1e3",
    "NaN",
  ]) {
    const result = validateServerTiers(
      [{ label: "standard", seats, fee: "0" }],
      true,
    );
    assert.equal(result.tiers, null, seats);
    assert.ok(result.errors[0].seats, seats);
  }
  for (const fee of ["0.1234567890123", "9007199254740991.01", "NaN"]) {
    const result = validateServerTiers(
      [{ label: "standard", seats: "1", fee }],
      true,
    );
    assert.equal(result.tiers, null, fee);
  }
});

test("already-rounded unsafe JavaScript numbers are rejected instead of declared exact", () => {
  const data = JSON.parse(wireSettings(THREE_TIER_SEATS));
  assert.equal(settingsSchema.safeParse(data).success, false);
  const contract = detail().contract!;
  const unsafe = {
    ...contract,
    tiers: [{ ...contract.tiers[0], seats: 9007199254740992 }],
  };
  assert.equal(contractSchema.safeParse(unsafe).success, false);
});

test("invalid count representations are rejected at the actual settings response boundary", async () => {
  for (const rawCount of [
    '"27021597764222973"',
    "-1",
    "1.25",
    "9007199254740992.5",
    "null",
  ]) {
    await assert.rejects(
      readWire(wireSettings(rawCount)),
      (error) =>
        error instanceof ManagementError && error.code === "invalid_response",
      rawCount,
    );
  }
  for (const malformed of ["01", "123n", "1e309"]) {
    await assert.rejects(readWire(wireSettings(malformed)), malformed);
  }
});

test("lossless response parsing does not relax version or per-tier count constraints", async () => {
  const invalidVersion = wireSettings("5").replace(
    '"settingsVersion":1',
    '"settingsVersion":27021597764222973',
  );
  await assert.rejects(
    readWire(invalidVersion),
    (error) =>
      error instanceof ManagementError && error.code === "invalid_response",
  );
});

test("numeric-looking and escaped JSON strings are never rewritten as integer values", async () => {
  const name = 'quoted "27021597764222973" and \\27021597764222973';
  const raw = wireSettings("5", "0.004999999").replace(
    JSON.stringify(product.displayName),
    JSON.stringify(name),
  );
  const data = await readWire(raw);
  assert.equal(data.vendors.items[0].displayName, name);
  assert.equal(data.vendors.items[0].monthlySeatFeeUsd.value, "0.004999999");
});
