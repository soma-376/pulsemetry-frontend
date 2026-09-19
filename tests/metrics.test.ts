import assert from "node:assert/strict";
import test from "node:test";
import { aggregateActivity, comparisonRange } from "../src/lib/metrics/activity";
import { buildOverview } from "../src/lib/metrics/overview";
import { usd } from "../src/lib/format";
import { dayCount, pickDay } from "../src/lib/date";

const week = { start: "2026-09-07", end: "2026-09-13" };
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.00001, `${a} != ${b}`);

test("inclusive range: daily, team, model and KPI totals agree", () => {
  const aggregate = aggregateActivity(week);
  const model = buildOverview("prev_week", week);
  assert.equal(dayCount(week), 7);
  assert.equal(model.chart.ticks.length, 7);
  assert.equal(model.kpis[1].value, usd(aggregate.cost));
  near(model.chart.cost.reduce((sum, value) => sum + value, 0), aggregate.cost);
  near(aggregate.teams.reduce((sum, team) => sum + Object.values(team.models).reduce((n, cost) => n + cost, 0), 0), aggregate.cost);
  near(model.mix.slices.reduce((sum, item) => sum + item.share, 0), 100);
  near(model.chart.spend.reduce((sum, value) => sum + value, 0), model.seat.spend);
  assert.equal(aggregate.users, 117); // Unique people, not the sum of daily active counts.
});

test("changing duration and shifting the same duration changes data", () => {
  const day = buildOverview("prev_week", { start: "2026-09-13", end: "2026-09-13" });
  const current = buildOverview("prev_week", week);
  const earlier = buildOverview("prev_week", { start: "2026-08-31", end: "2026-09-06" });
  assert.equal(day.chart.ticks.length, 1);
  assert.notEqual(day.kpis[1].value, current.kpis[1].value);
  assert.notEqual(current.kpis[1].value, earlier.kpis[1].value);
  assert.notEqual(current.mix.topShare, earlier.mix.topShare);
  const unmapped = aggregateActivity({ start: "2026-09-13", end: "2026-09-13" }).teams.find((team) => team.team === "미배정")!;
  assert.equal(day.attribution.unmappedUsers, String(unmapped.users));
  assert.equal(day.attribution.unattributedCostText, usd(unmapped.cost));
});

test("comparison windows preserve duration and distinguish previous week from previous period", () => {
  const range = { start: "2026-08-17", end: "2026-09-13" };
  assert.deepEqual(comparisonRange(range, "prev_week"), { start: "2026-08-10", end: "2026-09-06" });
  assert.deepEqual(comparisonRange(range, "prev_period"), { start: "2026-07-20", end: "2026-08-16" });
  assert.notEqual(buildOverview("prev_week", range).kpis[1].delta, buildOverview("prev_period", range).kpis[1].delta);
});

test("partial coverage does not claim efficiency or comparison, nor invent missing days", () => {
  const model = buildOverview("prev_period", { start: "2026-06-16", end: "2026-09-13" });
  assert.equal(model.rangeDays, 90);
  assert.equal(model.chart.ticks.length, 63);
  assert.equal(model.chart.ticks[0].date, "2026-07-13");
  assert.equal(model.showDelta, false);
  assert.equal(model.kpis[2].value, "—");
  assert.equal(model.observation.hasGap, true);
  assert.ok(model.attribution.rows.every((row) => row.contribText === "—"));
});

test("future and pre-observation ranges have no data and no nonfinite numbers", () => {
  for (const range of [{ start: "2027-01-01", end: "2027-01-07" }, { start: "2026-01-01", end: "2026-01-07" }]) {
    const model = buildOverview("prev_week", range);
    assert.equal(model.hasData, false);
    assert.equal(model.isEmpty, false); // No installation prompt for an empty query.
    assert.equal(model.chart.ticks.length, 0);
    const visit = (value: unknown) => {
      if (typeof value === "number") assert.ok(Number.isFinite(value));
      else if (typeof value === "string") assert.doesNotMatch(value, /NaN|Infinity/);
      else if (value && typeof value === "object") Object.values(value).forEach(visit);
    };
    visit(model);
  }
});

test("comparison off hides every delta while keeping the selected data", () => {
  const model = buildOverview("none", week);
  assert.ok(model.kpis.every((kpi) => !kpi.showDelta && !kpi.noDelta));
  assert.ok(model.attribution.rows.every((row) => row.contribText === "—"));
  assert.ok(model.waste.rows.every((row) => row.delta === "—" && row.prevWidth === undefined));
  assert.equal(model.kpis[1].value, buildOverview("prev_week", week).kpis[1].value);
});

test("calendar supports reversed and single-day selection", () => {
  assert.deepEqual(pickDay({ start: "2026-09-13", end: null }, "2026-09-07"), week);
  assert.equal(dayCount(pickDay({ start: "2026-09-13", end: null }, "2026-09-13")), 1);
});
