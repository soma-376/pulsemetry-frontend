import assert from "node:assert/strict";
import test from "node:test";
import { buildVendorRows, toDraftTiers, validateTiers } from "../src/lib/settings";

const tier = (seats = "2", fee = "12.345") => ({ label: "표준", seats, fee });

test("rejects malformed, fractional, unsafe and missing seat counts without changing input", () => {
  for (const value of ["-5", "1e5", "1.2.3", "1.5", "0", "", "Infinity", "9".repeat(400), "9007199254740992"]) {
    const input = [tier(value)];
    assert.equal(validateTiers(input).tiers, null, value);
    assert.ok(validateTiers(input).errors[0].seats, value);
    assert.equal(input[0].seats, value);
  }
});

test("rejects malformed or unrepresentable fees, including underflow and silent rounding", () => {
  for (const value of ["-5", "1e5", "1.2.3", "", "NaN", "Infinity", "9".repeat(400),
    "0." + "0".repeat(400) + "1", "9007199254740991.1", "1.234567890123456789"]) {
    const input = [tier("2", value)];
    assert.equal(validateTiers(input).tiers, null, value);
    assert.ok(validateTiers(input).errors[0].fee, value);
    assert.equal(input[0].fee, value);
  }
});

test("accepts zero fees and preserves supported decimals through save and reopen", () => {
  for (const fee of ["0", "12.345", "0.0000001", "00012.34500"]) {
    const result = validateTiers([tier("2", fee)]);
    assert.ok(result.tiers);
    assert.equal(result.spend, 2 * Number(fee));
    assert.deepEqual(validateTiers(toDraftTiers({ tiers: result.tiers })).tiers, result.tiers);
  }
  const row = buildVendorRows({ claude_team: { tiers: [{ label: "무료", seats: 2, fee: 0 }] } }, [])
    .find((item) => item.id === "claude_team")!;
  assert.equal(row.setUp, true);
  assert.equal(row.seatSpend, 0);
  assert.equal(row.statusLabel, "설정됨");
});

test("rejects unsafe products and totals and does not discard incomplete tiers", () => {
  assert.ok(validateTiers([tier("2", String(Number.MAX_SAFE_INTEGER))]).errors[0].subtotal);
  assert.ok(validateTiers([tier(String(Number.MAX_SAFE_INTEGER), "0"), tier("1", "0")]).totalError);
  assert.ok(validateTiers([tier("1", "5000000000000000"), tier("1", "5000000000000000")]).totalError);
  assert.equal(validateTiers([tier(), tier("", "")]).tiers, null);
  assert.equal(validateTiers([]).tiers, null);
  assert.equal(validateTiers(Array.from({ length: 4 }, () => tier())).tiers, null);
});
