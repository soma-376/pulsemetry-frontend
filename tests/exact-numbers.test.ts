import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { z } from "zod";
import { decimalUsd, parseJsonExactIntegers } from "../src/lib/exact-numbers";
import { int, usd } from "../src/lib/format";
import { settingsVendorRowSchema } from "../src/lib/api/settings";

const originalParse = JSON.parse;
const exact = "27021597764222973";
const safeCount = z.number().int().nonnegative();
const row = (count: unknown) => ({
  vendorId: "exact-vendor",
  displayName: "Exact vendor",
  kind: "claude_team",
  source: "manual",
  version: 1,
  contractStatus: "active",
  contractInput: { status: "complete", missingFields: [] },
  contractSeats: { value: count, status: "complete", reasons: [] },
  monthlySeatFeeUsd: { value: "0", status: "complete", reasons: [] },
  assignedSeats: { value: 0, status: "complete", reasons: [] },
});

afterEach(() => {
  JSON.parse = originalParse;
});

test("plain integer token source preserves exact nested and root values", () => {
  const result = parseJsonExactIntegers(
    `{"root":${exact},"nested":[-${exact},{"max":9223372036854775807}]}`,
  );
  assert.deepEqual(result, {
    root: BigInt(exact),
    nested: [-BigInt(exact), { max: BigInt("9223372036854775807") }],
  });
  assert.equal(parseJsonExactIntegers(exact), BigInt(exact));
});

test("safe numbers, negative zero, fractional values, null and missing keys retain JSON meaning", () => {
  const result = parseJsonExactIntegers(
    '{"numbers":[0,-0,1,-1,9007199254740991,0.125,1e3],"nothing":null,"enabled":true}',
  );
  assert.deepEqual(result, {
    numbers: [0, -0, 1, -1, 9007199254740991, 0.125, 1000],
    nothing: null,
    enabled: true,
  });
  assert.equal(parseJsonExactIntegers("null"), null);
  assert.deepEqual(parseJsonExactIntegers("{}"), {});
});

test("large decimals and exponent tokens remain unsafe numbers rather than invented exact integers", () => {
  for (const token of [
    "9007199254740993.0",
    "9007199254740992.5",
    "9.007199254740993e15",
    "27021597764222973E0",
    "1e309",
  ]) {
    const value = parseJsonExactIntegers(token);
    assert.equal(typeof value, "number", token);
    assert.equal(safeCount.safeParse(value).success, false, token);
    assert.equal(
      settingsVendorRowSchema.safeParse(row(value)).success,
      false,
      token,
    );
  }
});

test("aggregate Long limits remain independent of lossless JSON token parsing", () => {
  const max = parseJsonExactIntegers("9223372036854775807");
  assert.equal(settingsVendorRowSchema.safeParse(row(max)).success, true);
  for (const token of ["9223372036854775808", `-${exact}`]) {
    const value = parseJsonExactIntegers(token);
    assert.equal(typeof value, "bigint");
    assert.equal(settingsVendorRowSchema.safeParse(row(value)).success, false);
  }
});

for (const context of ["missing", "empty"] as const) {
  test(`without original token source (${context} context), an unsafe value fails closed`, () => {
    // Simulate the documented older JSON.parse reviver API. This removes only
    // context.source; it does not manufacture a source token from the Number.
    JSON.parse = (text, reviver) =>
      originalParse(text, function (key: string, value: unknown) {
        if (!reviver) return value;
        const revive = reviver as (
          this: unknown,
          key: string,
          value: unknown,
          context?: { source?: string },
        ) => unknown;
        return context === "empty"
          ? revive.call(this, key, value, {})
          : revive.call(this, key, value);
      });
    const value = parseJsonExactIntegers(exact);
    assert.equal(typeof value, "number");
    assert.equal(Number.isSafeInteger(value), false);
    assert.equal(settingsVendorRowSchema.safeParse(row(value)).success, false);
    assert.deepEqual(parseJsonExactIntegers('[5,"27021597764222973",null]'), [
      5,
      exact,
      null,
    ]);
  });
}

test("escaped strings and numeric-looking property names retain their original string meaning", () => {
  const source = `{"${exact}":"${exact}","escaped":"\\\"${exact}\\\" \\\\ ${exact}","unicode":"\\u0031"}`;
  assert.deepEqual(parseJsonExactIntegers(source), {
    [exact]: exact,
    escaped: `"${exact}" \\ ${exact}`,
    unicode: "1",
  });
});

test("malformed JSON still throws instead of coercing tokens into exact integers", () => {
  for (const text of [
    "01",
    "+1",
    "1.",
    "NaN",
    "Infinity",
    "1n",
    "[1,]",
    '{"value":1,}',
  ]) {
    assert.throws(() => parseJsonExactIntegers(text), SyntaxError, text);
  }
});

// Positive half-up and sign-preserving two-decimal display follow the existing
// USD formatter contract; expected strings are independent decimal constants.
for (const [value, expected] of [
  ["0.004999999999", "$0.00"],
  ["0.005", "$0.01"],
  ["0.005000000001", "$0.01"],
  ["1.994999999999", "$1.99"],
  ["1.995", "$2.00"],
  ["999.995", "$1,000.00"],
  ["999999999999999.995", "$1,000,000,000,000,000.00"],
  ["1000000000.004999999", "$1,000,000,000.00"],
  ["1000000000000000.01", "$1,000,000,000,000,000.01"],
  ["00012.5000", "$12.50"],
  ["0", "$0.00"],
  ["-0", "$-0.00"],
  ["-0.004999999999", "$-0.00"],
  ["-0.005", "$-0.01"],
  ["-999.995", "$-1,000.00"],
]) {
  test(`decimal USD ${value} formats as ${expected}`, () => {
    assert.equal(decimalUsd(value), expected);
    assert.equal(usd(value), expected);
  });
}

test("invalid decimal strings are rejected without whitespace, exponent or numeric coercion", () => {
  for (const value of [
    "",
    " ",
    " 1",
    "1 ",
    "+1",
    "1e3",
    ".5",
    "1.",
    "NaN",
    "Infinity",
    "--1",
    "1,000",
    "１２",
    "1\n",
  ]) {
    assert.throws(
      () => decimalUsd(value),
      /유효한 십진 금액/,
      JSON.stringify(value),
    );
    assert.throws(() => usd(value), /유효한 십진 금액/, JSON.stringify(value));
  }
});

test("existing number formatting and exact BigInt integer formatting keep their contracts", () => {
  assert.equal(usd(12.5), "$12.50");
  assert.equal(usd(1.005), "$1.01");
  assert.equal(usd(1.0049), "$1.00");
  assert.equal(usd(-0), "$-0.00");
  assert.equal(usd(-1.005), "$-1.01");
  assert.equal(int(1000), "1,000");
  assert.equal(int(BigInt(exact)), "27,021,597,764,222,973");
});
