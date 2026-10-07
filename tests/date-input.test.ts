import assert from "node:assert/strict";
import test from "node:test";
import { dateInputError, dateInputText, dateInputValue } from "../src/lib/date-input";
import { contractSchema } from "../src/lib/schemas/contract";
import { currentDateIso, DAY_MS, fromIso, toIso } from "../src/lib/date";

test("today follows the actual Seoul date, including the midnight boundary", () => {
  assert.equal(currentDateIso(new Date("2026-09-21T14:59:59Z")), "2026-09-21");
  assert.equal(currentDateIso(new Date("2026-09-21T15:00:00Z")), "2026-09-22");
});

test("minimum date is inclusive and optional dates can remain empty", () => {
  assert.ok(dateInputError("2026-09-21", "2026-09-22"));
  for (const value of ["", "2026-09-22", "2026-09-23"]) assert.equal(dateInputError(value, "2026-09-22"), null);
});

test("accepts optional dates and real leap days without normalizing invalid dates", () => {
  for (const value of ["", "2028-02-29", "2026-12-31", "2000-02-29"]) assert.equal(dateInputError(value), null);
  for (const value of ["2026-02-29", "2100-02-29", "2026-04-31", "2026-00-10", "2026-13-01", "2026-01-00", "2026-1-1", "2026-12", "0000-01-01"]) assert.ok(dateInputError(value), value);
});

test("formats digit entry and pasted dates while retaining partial drafts", () => {
  for (const text of ["20261231", "2026.12.31", "2026-12-31"]) {
    assert.equal(dateInputValue(text), "2026-12-31");
    assert.equal(dateInputText(dateInputValue(text)), "2026.12.31");
  }
  assert.equal(dateInputValue("20261"), "2026-1");
  assert.equal(dateInputText("2026-1"), "2026.1");
  assert.equal(dateInputValue(""), "");
});

test("contract validation blocks invalid or incomplete end dates but allows no end date", () => {
  const schema = contractSchema();
  const draft = { plan: "seat_flat", tiers: [{ label: "표준", seats: "2", fee: "0" }] };
  const today = currentDateIso();
  const yesterday = toIso(new Date(fromIso(today).getTime() - DAY_MS));
  const tomorrow = toIso(new Date(fromIso(today).getTime() + DAY_MS));
  for (const term of ["", today, tomorrow]) assert.equal(schema.safeParse({ ...draft, term }).success, true);
  for (const term of [yesterday, "2026-02-29", "2026-12"]) {
    const result = schema.safeParse({ ...draft, term });
    assert.equal(result.success, false);
    if (!result.success) assert.ok(result.error.issues.some((issue) => issue.path[0] === "term"));
  }
});
