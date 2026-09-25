import assert from "node:assert/strict";
import test from "node:test";
import { buildOverview } from "../src/lib/metrics/overview";
import { buildMemberSeats } from "../src/lib/metrics/member-seats";
import { MEMBER_SEATS, SEAT_SNAPSHOT_DATE } from "../src/mocks/member-seats";
import { buildVendorRows } from "../src/lib/settings";
import { createManualContract } from "../src/lib/contracts";
import { aggregateActivity } from "../src/lib/metrics/activity";

test("overview candidates use member seat policy and remain independent of the period", () => {
  const week = buildOverview();
  const day = buildOverview("prev_week", { start: "2026-09-13", end: "2026-09-13" });
  for (const row of week.vendorOverview.rows) {
    const daily = day.vendorOverview.rows.find((item) => item.id === row.id)!;
    assert.equal(daily.purchased, row.purchased);
    assert.equal(daily.monthly, row.monthly);
    assert.equal(daily.candidates, row.candidates);
    assert.ok(daily.observedUsers <= row.observedUsers);
  }
  for (const threshold of [7, 14, 30, 60]) {
    const model = buildOverview(undefined, undefined, undefined, undefined, threshold);
    assert.equal(model.vendorOverview.rows.reduce((sum, row) => sum + (row.candidates ?? 0), 0), buildMemberSeats(MEMBER_SEATS, SEAT_SNAPSHOT_DATE, threshold).filter((seat) => seat.review === "candidate").length);
    assert.deepEqual(model.kpis, week.kpis);
  }
});

test("same-product contracts group once without multiplying observed people or candidates", () => {
  const added = createManualContract({ kind: "claude_team", name: "Second Claude", plan: "team", tiers: [{ label: "표준", seats: "10", fee: "20" }] }, "extra");
  const before = buildOverview().vendorOverview.rows.find((row) => row.id === "claude_team")!;
  const model = buildOverview(undefined, undefined, undefined, buildVendorRows({}, [added]));
  const rows = model.vendorOverview.rows.filter((row) => row.id === "claude_team");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].purchased, 158);
  assert.equal(rows[0].monthly, 5000);
  assert.equal(rows[0].observedUsers, before.observedUsers);
  assert.equal(rows[0].candidates, before.candidates);
  assert.equal(rows[0].contracts.length, 2);
});

test("vendor trend reconciles each day and observed people deduplicate across days", () => {
  const model = buildOverview();
  model.chart.cost.forEach((total, index) => assert.ok(Math.abs(model.chart.series.reduce((sum, series) => sum + series.values[index], 0) - total) < 1e-8));
  const activity = aggregateActivity({ start: "2026-09-07", end: "2026-09-13" });
  for (const row of model.vendorOverview.rows) {
    const users = new Set(activity.days.flatMap((day) => day.teams.flatMap((team) => team.vendors.filter((vendor) => vendor.vendorId === row.id).flatMap((vendor) => vendor.users))));
    assert.equal(row.observedUsers, users.size);
  }
  const empty = buildOverview("none", { start: "2026-10-01", end: "2026-10-03" });
  assert.ok(empty.vendorOverview.rows.every((row) => row.observedUsers === 0));
  assert.equal(empty.vendorOverview.rows[0].purchased, 148);
  assert.deepEqual(empty.chart.series, []);
});
