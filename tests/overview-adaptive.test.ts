import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ACTIVITY } from "../src/mocks/activity";
import { MODEL_META } from "../src/mocks/overview";
import { buildOverview } from "../src/lib/metrics/overview";
import { buildVendorRows } from "../src/lib/settings";
import { SEED_TEAMS } from "../src/lib/organization";
import { VendorSeatsCard } from "../src/components/overview/VendorSeatsCard";
import { UsageValueCard } from "../src/components/overview/UsageValueCard";
import { ModelMixCard } from "../src/components/overview/ModelMixCard";

// One registered team, one observed product and one model, with zero-valued catalog entries.
const source: typeof ACTIVITY = ACTIVITY.map((day) => ({ ...day, teams: day.teams.slice(0, 1).map((team) => ({
  ...team,
  models: MODEL_META.map((model, index) => ({ key: model.v, cost: index === 0 ? team.cost : 0 })),
  vendors: team.vendors.map((vendor, index) => ({ ...vendor, cost: index === 0 ? team.cost : 0, tokensM: index === 0 ? team.tokensM : 0, sessions: index === 0 ? team.sessions : 0, users: index === 0 ? team.users.map((user) => `${team.team}:${user}`) : [] })),
})) }));
const vendors = buildVendorRows({}, []).filter((vendor) => vendor.id === "claude_team");
const single = () => buildOverview(undefined, undefined, [SEED_TEAMS[0]], vendors, 14, source);

// Zero usage alone must not add an inventory product. Keep only actual product observations.
const observedSource = source.map((day) => ({ ...day, teams: day.teams.map((team) => ({ ...team, vendors: team.vendors.filter((vendor) => vendor.cost > 0) })) }));
const singleInventory = () => buildOverview(undefined, undefined, [SEED_TEAMS[0]], vendors, 14, observedSource);

test("single observed vendor draws one line without a duplicate total; zero vendors stay out of trend", () => {
  const model = single();
  assert.equal(model.chart.series.length, 1);
  assert.deepEqual(model.chart.series[0].values, model.chart.cost);
  const html = renderToStaticMarkup(createElement(UsageValueCard, { model }));
  assert.equal((html.match(/<path /g) ?? []).length, 1);
  assert.doesNotMatch(html, />전체</);
  const multiple = renderToStaticMarkup(createElement(UsageValueCard, { model: buildOverview() }));
  assert.match(multiple, />전체</);
  assert.equal((multiple.match(/<path /g) ?? []).length, 3);
});

test("single model shows name and usage, without a 100 percent donut or selection controls", () => {
  const model = single();
  assert.equal(model.mix.count, 1);
  assert.equal(model.mix.rows[0].costText, model.kpis[1].value);
  const html = renderToStaticMarkup(createElement(ModelMixCard, { model }));
  assert.match(html, new RegExp(MODEL_META[0].name));
  assert.match(html, /관측 토큰/);
  assert.doesNotMatch(html, /<svg|aria-pressed|100.*%/);
  const empty = buildOverview("none", { start: "2027-01-01", end: "2027-01-02" }, [SEED_TEAMS[0]], vendors, 14, source);
  assert.equal(empty.mix.count, 0);
  assert.match(renderToStaticMarkup(createElement(ModelMixCard, { model: empty })), /관측된 모델이 없습니다/);
});

test("single managed vendor uses a contract card and preserves seat types when period has no data", () => {
  const model = singleInventory();
  assert.equal(model.vendorOverview.rows.length, 1);
  const html = renderToStaticMarkup(createElement(VendorSeatsCard, { model: model.vendorOverview }));
  assert.doesNotMatch(html, /<table/);
  assert.match(html, /148석/);
  assert.match(html, /표준 · 125석/);
  assert.match(html, /프리미엄 · 23석/);
  const empty = buildOverview("none", { start: "2027-01-01", end: "2027-01-02" }, [SEED_TEAMS[0]], vendors, 14, observedSource);
  assert.equal(empty.vendorOverview.rows.length, 1);
  assert.equal(empty.vendorOverview.rows[0].purchased, 148);
  assert.match(renderToStaticMarkup(createElement(VendorSeatsCard, { model: empty.vendorOverview })), /미관측/);
});

test("managed vendor presentation does not switch when the period loses a product", () => {
  const mixed = [...observedSource, ACTIVITY.at(-1)!];
  const earlier = buildOverview("none", { start: "2026-08-01", end: "2026-08-07" }, [SEED_TEAMS[0]], vendors, 14, mixed);
  const empty = buildOverview("none", { start: "2027-01-01", end: "2027-01-02" }, [SEED_TEAMS[0]], vendors, 14, mixed);
  assert.equal(earlier.vendorOverview.rows.length, 2);
  assert.deepEqual(empty.vendorOverview.rows.map((row) => row.id), earlier.vendorOverview.rows.map((row) => row.id));
  assert.match(renderToStaticMarkup(createElement(VendorSeatsCard, { model: earlier.vendorOverview })), /<table/);
});

test("single team is hidden only without unmapped history; new teams stay visible at zero usage", () => {
  assert.equal(single().attribution.show, false);
  const catalog = [SEED_TEAMS[0], { id: "new-team", name: "신규 팀", sourceName: null }];
  const model = buildOverview(undefined, undefined, catalog, vendors, 14, source);
  assert.equal(model.attribution.show, true);
  assert.equal(model.attribution.rows.find((row) => row.teamId === "new-team")?.userCount, 0);
  const empty = buildOverview("none", { start: "2027-01-01", end: "2027-01-02" }, catalog, vendors, 14, source);
  assert.equal(empty.attribution.rows.length, 2);
  assert.equal(empty.attribution.show, true);
  const orphaned = buildOverview("none", { start: "2027-01-01", end: "2027-01-02" }, [SEED_TEAMS[1]], vendors, 14, source);
  assert.equal(orphaned.attribution.show, true);
  assert.equal(orphaned.attribution.hasUnmapped, true);
});
