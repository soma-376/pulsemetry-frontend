import assert from "node:assert/strict";
import test from "node:test";
import { ACTIVITY } from "../src/mocks/activity";
import { aggregateActivity } from "../src/lib/metrics/activity";
import { buildTeams, type AxisKey } from "../src/lib/metrics/teams";
import { buildTeamVendorMix } from "../src/lib/metrics/team-vendor-mix";
import { SEED_TEAMS } from "../src/lib/organization";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.00001, `${a} != ${b}`);

test("vendor usage preserves daily and selected-period team totals on all three axes", () => {
  for (const day of ACTIVITY) for (const team of day.teams) {
    for (const metric of ["cost", "tokensM", "sessions"] as const) near(team.vendors.reduce((sum, vendor) => sum + vendor[metric], 0), team[metric]);
    assert.ok(team.vendors.every((vendor) => Number.isInteger(vendor.sessions) && vendor.sessions >= 0));
  }
  for (const dates of [{ start: "2026-09-07", end: "2026-09-13" }, { start: "2026-08-01", end: "2026-08-30" }]) {
    for (const team of aggregateActivity(dates).teams) for (const metric of ["cost", "tokensM", "sessions"] as const) {
      near(team.vendors.reduce((sum, vendor) => sum + vendor[metric], 0), team[metric]);
    }
  }
});

test("each vendor axis matches the team table and uses its own composition", () => {
  const model = buildTeams();
  for (const axis of ["cost", "token", "session"] as AxisKey[]) {
    const mix = model.vendorMix(axis);
    assert.deepEqual(mix.legend.map((vendor) => vendor.name), ["Claude", "Codex"]);
    for (const column of mix.columns) {
      near(column.totalValue, model.axes[axis].rows.find((row) => row.team === column.team)!.totalValue);
      near(column.segments.reduce((sum, segment) => sum + segment.share, 0), 1);
      near(column.segments.reduce((sum, segment) => sum + segment.value, 0), column.totalValue);
    }
  }
  const share = (axis: AxisKey) => model.vendorMix(axis).columns.find((row) => row.team === "플랫폼")!.segments[0].share;
  assert.notEqual(share("cost"), share("token"));
  assert.notEqual(share("token"), share("session"));
});

test("unknown vendors remain visible and zero or empty usage invents no shares", () => {
  const mix = buildTeamVendorMix([{ team: "팀", unmapped: false, vendors: [
    { vendorId: "claude_team", cost: 50, tokensM: 1, sessions: 2 },
    { vendorId: null, cost: 20, tokensM: 2, sessions: 3 },
    { vendorId: "new-vendor", cost: 30, tokensM: 3, sessions: 4 },
  ] }], "cost", String);
  assert.equal(mix.columns[0].totalValue, 100);
  assert.equal(mix.columns[0].segments.find((segment) => segment.key === "__unknown")!.share, 0.5);
  assert.ok(mix.legend.some((vendor) => vendor.name === "벤더 미확인"));
  const empty = buildTeamVendorMix([{ team: "빈 팀", unmapped: false, vendors: [] }], "sessions", String);
  assert.deepEqual(empty.columns[0].segments, []);
  assert.equal(empty.columns[0].topText, "관측 없음");
  assert.equal(empty.columns[0].height, "0.0%");
  assert.deepEqual(buildTeamVendorMix([], "cost", String).legend, []);
});

test("team renaming preserves vendor attribution and selecting another date updates usage", () => {
  const initial = buildTeams();
  const renamed = buildTeams("prev_week", undefined, SEED_TEAMS.map((team) => team.name === "플랫폼" ? { ...team, name: "Platform" } : team));
  assert.deepEqual(renamed.vendorMix("cost").columns.find((team) => team.team === "Platform")!.segments.map(({ key, value }) => ({ key, value })),
    initial.vendorMix("cost").columns.find((team) => team.team === "플랫폼")!.segments.map(({ key, value }) => ({ key, value })));
  const day = buildTeams("none", { start: "2026-09-13", end: "2026-09-13" });
  assert.notEqual(day.vendorMix("cost").columns[0].totalValue, initial.vendorMix("cost").columns[0].totalValue);
});
