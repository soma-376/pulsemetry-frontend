import assert from "node:assert/strict";
import test from "node:test";
import { buildVendorRows } from "../src/lib/settings";
import { buildVendorSeats } from "../src/lib/metrics/vendor-seats";
import { buildOverview } from "../src/lib/metrics/overview";
import { createManualContract } from "../src/lib/contracts";
import { usd } from "../src/lib/format";

test("contract tiers stay separate and usage counts cannot become assignments", () => {
  const vendors = buildVendorRows({}, []);
  const model = buildVendorSeats(vendors);
  assert.deepEqual(model.rows.filter((row) => row.vendorId === "claude_team").map((row) => [row.tier, row.purchased]), [["표준", 125], ["프리미엄", 23]]);
  assert.ok(model.rows.every((row) => row.workspace === null && row.assigned === null && row.unassigned === null));
  assert.equal(model.rows.find((row) => row.vendorId === "cursor")?.purchased, null);
  assert.deepEqual(buildVendorSeats(vendors.map((vendor) => ({ ...vendor, users: 999, distinct30: 1200 }))), model);
});

test("registered contracts include additions and edits, but exclude unconfirmed and unsupported plans", () => {
  const added = createManualContract({ name: "Extra vendor", kind: "other", plan: "seat_flat", tiers: [{ label: "Pro", seats: "10", fee: "5" }] }, "extra");
  const vendors = buildVendorRows({ claude_team: { tiers: [{ label: "표준", seats: 30, fee: 20 }] } }, [added]);
  const summary = buildVendorSeats(vendors);
  assert.equal(summary.confirmedSeats, 40);
  assert.equal(summary.monthlyContractAmount, 650);
  assert.equal(summary.rows.find((row) => row.vendorId === "extra")?.purchased, 10);
  const pending = buildVendorSeats(buildVendorRows({ claude_team: { confirmed: false } }, [added]));
  assert.equal(pending.monthlyContractAmount, 50);
  assert.equal(pending.confirmedSeats, 10);
  assert.equal(pending.rows[0].status, "계약 확인 대기");
  const metered = buildVendorSeats(buildVendorRows({ claude_team: { plan: "api", metered: 700 } }, []));
  assert.equal(metered.rows[0].metered, false);
  assert.equal(metered.rows[0].purchased, null);
  assert.equal(metered.monthlyContractAmount, null);
});

test("missing and zero-priced contracts remain distinct", () => {
  assert.equal(buildVendorSeats([]).monthlyContractAmount, null);
  assert.deepEqual(buildVendorSeats([]).rows, []);
  const vendors = buildVendorRows({ claude_team: { tiers: [{ label: "무료", seats: 5, fee: 0 }] } }, []);
  const model = buildOverview("none", undefined, undefined, vendors);
  assert.equal(model.vendorSeats.monthlyContractAmount, 0);
  assert.equal(model.kpis[2].value, usd(0));
  const cleared = buildVendorSeats(buildVendorRows({ claude_team: { cleared: true, plan: null } }, []));
  assert.equal(cleared.rows[0].purchased, null);
  assert.equal(cleared.monthlyContractAmount, null);
});

test("period changes affect usage, never current contracts or inferred seat savings", () => {
  const day = buildOverview("prev_week", { start: "2026-09-13", end: "2026-09-13" });
  const year = buildOverview("prev_week", { start: "2026-01-01", end: "2026-09-13" });
  assert.deepEqual(day.vendorSeats, year.vendorSeats);
  assert.equal(day.kpis[0].unit, "명");
  assert.equal(day.kpis[0].label, "사용 관측 인원");
  assert.equal(day.kpis[2].showDelta, false);
  assert.equal("seat" in day, false);
  assert.equal("spend" in day.chart, false);
  assert.ok(day.chart.ticks.every((tick) => !("effText" in tick) && !("gap" in tick)));
  assert.doesNotMatch(JSON.stringify(day), /회수 시|유휴 좌석|좌석 효율/);
});
